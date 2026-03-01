import express, { Request, Response } from "express";
import cors from "cors";

/* --------------------------------------------------
   CREATE SERVER FIRST (VERY IMPORTANT FOR RAILWAY)
-------------------------------------------------- */
const app = express();

/* ---------- RAILWAY HEALTH CHECK ---------- */
/* Railway pings this immediately after deploy */
app.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({ status: "ok" });
});

/* ---------- BASIC MIDDLEWARE ---------- */
app.use(cors({
  origin: true, // allow GitHub Pages + custom domain
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

/* --------------------------------------------------
   LOAD HEAVY MODULES ONLY AFTER SERVER EXISTS
-------------------------------------------------- */
import { pool } from "./db.js";
import { sendFaucetPayment } from "./payout.js";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { verifyTurnstile } from "./turnstile.js";

/*
  Faucet Settings
*/
const COOLDOWN_HOURS = 8;
const MAX_CLAIMS = 2;

/*
  Prevent simultaneous payouts
*/
let claimInProgress = false;

/*
  IP Rate Limit: 5 requests / 10 minutes
*/
const ipLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 10,
});

/*
  Root route (optional)
*/
app.get("/", (_req: Request, res: Response) => {
  res.send("TapForSol faucet server is running");
});

/* --------------------------------------------------
   CLAIM ENDPOINT
-------------------------------------------------- */
app.post("/claim", async (req: Request, res: Response) => {
  let ip: string =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  try {
    console.log("Claim attempt from IP:", ip);

    /* ---------- CAPTCHA ---------- */
    const { wallet, token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Captcha required" });
    }

    const human = await verifyTurnstile(token, ip);
    if (!human) {
      return res.status(403).json({ error: "Captcha verification failed" });
    }

    /* ---------- RATE LIMIT ---------- */
    try {
      await ipLimiter.consume(ip);
    } catch {
      return res.status(429).json({
        error: "Too many requests from this IP. Please wait before trying again.",
      });
    }

    /* ---------- WALLET VALIDATION ---------- */
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Wallet address required" });
    }

    if (wallet.length < 32 || wallet.length > 44) {
      return res.status(400).json({ error: "Invalid Solana address" });
    }

    /* ---------- GLOBAL LOCK ---------- */
    if (claimInProgress) {
      return res.status(429).json({
        error: "Another claim is currently processing. Try again shortly.",
      });
    }

    claimInProgress = true;

    /* ---------- COOLDOWN CHECK ---------- */
    const cooldownCheck = await pool.query(
      `
      INSERT INTO wallet_cooldowns (wallet, last_claim, claims_in_window)
      VALUES ($1, NOW(), 1)
      ON CONFLICT (wallet)
      DO UPDATE SET
        claims_in_window = CASE
          WHEN wallet_cooldowns.last_claim < NOW() - INTERVAL '${COOLDOWN_HOURS} hours'
            THEN 1
          ELSE wallet_cooldowns.claims_in_window + 1
        END,
        last_claim = NOW()
      RETURNING claims_in_window;
      `,
      [wallet]
    );

    const claimsUsed = cooldownCheck.rows[0].claims_in_window;

    if (claimsUsed > MAX_CLAIMS) {
      claimInProgress = false;
      return res.status(429).json({
        error: "Cooldown active (2 claims per 8 hours)",
      });
    }

    /* ---------- RECORD CLAIM ---------- */
    await pool.query("INSERT INTO claims (wallet) VALUES ($1)", [wallet]);

    /* ---------- SEND PAYMENT ---------- */
    const signature = await sendFaucetPayment(wallet);

    claimInProgress = false;

    return res.json({
      status: "paid",
      tx: signature,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });

  } catch (err) {
    claimInProgress = false;
    console.error("Server error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

/* --------------------------------------------------
   START SERVER (RAILWAY PORT!)
-------------------------------------------------- */
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log("=================================");
  console.log("🚰 TapForSol Faucet Server Online");
  console.log(`Listening on port ${PORT}`);
  console.log("=================================");
});