import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import http from "http";
import { PublicKey } from "@solana/web3.js";
import { connection } from "./solana.js";
import { createChallenge, validateChallenge } from "./challenge.js";
import { pool } from "./db.js";
import { sendFaucetPayment } from "./payout.js";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { verifyTurnstile } from "./turnstile.js";

/* --------------------------------------------------
   CREATE SERVER
-------------------------------------------------- */
const app = express();

/* ---------- SETTINGS ---------- */
const COOLDOWN_HOURS = 8;
const MAX_CLAIMS = 2;

const ipLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 10,
});

/* --------------------------------------------------
   HEALTH CHECK
-------------------------------------------------- */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

/* --------------------------------------------------
   MIDDLEWARE
-------------------------------------------------- */
app.use(cors({
  origin: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (!origin || !origin.includes("cryptogatsu.github.io")) {
    return res.status(403).json({ error: "Direct API access blocked" });
  }

  next();
});

/* --------------------------------------------------
   ROOT
-------------------------------------------------- */
app.get("/", (_req: Request, res: Response) => {
  res.send("TapForSol faucet server is running");
});

/* --------------------------------------------------
   CHALLENGE ENDPOINT
-------------------------------------------------- */
app.get("/challenge", async (req: Request, res: Response) => {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  try {
    const token = await createChallenge(ip);
    res.json({ token });
  } catch (err) {
    console.error("Challenge error:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/* --------------------------------------------------
   CLAIM ENDPOINT
-------------------------------------------------- */
app.post("/claim", async (req: Request, res: Response) => {

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  try {

    const { wallet, token, challengeToken, fingerprint } = req.body;

    /* ---------- SESSION VALIDATION ---------- */
    if (!challengeToken || !fingerprint) {
      return res.status(400).json({ error: "Session expired. Refresh page." });
    }

    const validChallenge = await validateChallenge(challengeToken, ip, fingerprint);

    if (!validChallenge) {
      return res.status(403).json({ error: "Invalid session" });
    }

    /* ---------- CAPTCHA ---------- */
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
        error: "Too many requests from this IP."
      });
    }

    /* ---------- WALLET VALIDATION ---------- */
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Wallet address required" });
    }

    if (wallet.length < 32 || wallet.length > 44) {
      return res.status(400).json({ error: "Invalid Solana address" });
    }

    const pubkey = new PublicKey(wallet);

    /* ---------- WALLET MUST HAVE HISTORY ---------- */
    const history = await connection.getSignaturesForAddress(pubkey, { limit: 1 });

    if (history.length === 0) {
      return res.status(403).json({
        error: "Wallet must already be used on Solana"
      });
    }

    /* ---------- MINIMUM BALANCE ---------- */
    const balance = await connection.getBalance(pubkey);

    if (balance < 2_000_000) {
      return res.status(403).json({
        error: "Wallet must hold a small SOL balance"
      });
    }

    /* ---------- DEVICE FINGERPRINT ---------- */
    const existing = await pool.query(
      "SELECT * FROM used_fingerprints WHERE fingerprint=$1",
      [fingerprint]
    );

    if (existing.rows.length) {
      if (existing.rows[0].first_wallet !== wallet) {
        return res.status(403).json({
          error: "Multiple wallets detected from same device"
        });
      }
    } else {
      await pool.query(
        "INSERT INTO used_fingerprints (fingerprint, first_wallet) VALUES ($1,$2)",
        [fingerprint, wallet]
      );
    }

    /* ---------- COOLDOWN CHECK ---------- */
    const cooldownCheck = await pool.query(
      `
      INSERT INTO wallet_cooldowns (wallet, last_claim, claims_in_window)
      VALUES ($1, NOW(), 1)
      ON CONFLICT (wallet)
      DO UPDATE SET
        claims_in_window = CASE
          WHEN wallet_cooldowns.last_claim < NOW() - ($2 || ' hours')::interval
            THEN 1
          ELSE wallet_cooldowns.claims_in_window + 1
        END,
        last_claim = NOW()
      RETURNING claims_in_window;
      `,
      [wallet, COOLDOWN_HOURS]
    );

    const claimsUsed = cooldownCheck.rows[0].claims_in_window;

    if (claimsUsed > MAX_CLAIMS) {
      return res.status(429).json({
        error: "Cooldown active"
      });
    }

    /* ---------- RECORD CLAIM ---------- */
    await pool.query(
      "INSERT INTO claims (wallet) VALUES ($1)",
      [wallet]
    );

    /* ---------- SEND PAYMENT ---------- */
    const signature = await sendFaucetPayment(wallet);

    return res.json({
      status: "paid",
      tx: signature,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* --------------------------------------------------
   START SERVER
-------------------------------------------------- */
const PORT = Number(process.env.PORT) || 3000;

http.createServer(app).listen(PORT, () => {
  console.log("=================================");
  console.log("🚰 TapForSol Faucet Server Online");
  console.log(`Listening on port ${PORT}`);
  console.log("=================================");
});