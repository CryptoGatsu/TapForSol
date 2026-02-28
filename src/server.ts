import express, { Request, Response } from "express";
import { pool } from "./db";
import { sendFaucetPayment } from "./payout";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { verifyTurnstile } from "./turnstile";
import cors from "cors";


const app = express();
app.use(cors({
  origin: "*",
  methods: ["POST", "GET"],
}));

import path from "path";

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

/*
  Root health check
*/
app.get("/", (_req: Request, res: Response) => {
  res.send("TapForSol faucet server is running");
});

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
  IP Rate Limiter
  5 attempts per 10 minutes per IP
*/
const ipLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 10,

  

});





/*
  Faucet Claim Endpoint
*/
app.post("/claim", async (req: Request, res: Response) => {
  let ip: string = "unknown";

  try {
    /* ---------------- GET USER IP ---------------- */
    ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";

      // ---------------- CAPTCHA CHECK ----------------
const { token } = req.body;

if (!token) {
  return res.status(400).json({ error: "Captcha required" });
}

const human = await verifyTurnstile(token, ip);

if (!human) {
  return res.status(403).json({ error: "Captcha verification failed" });
}

    console.log("Claim attempt from IP:", ip);

    /* ---------------- IP RATE LIMIT ---------------- */
    try {
      await ipLimiter.consume(ip);
    } catch {
      return res.status(429).json({
        error: "Too many requests from this IP. Please wait before trying again.",
      });
    }

    const { wallet } = req.body;

    /* ---------------- BASIC VALIDATION ---------------- */
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Wallet address required" });
    }

    if (wallet.length < 32 || wallet.length > 44) {
      return res.status(400).json({ error: "Invalid Solana address" });
    }

    /* ---------------- GLOBAL LOCK ---------------- */
    if (claimInProgress) {
      return res.status(429).json({
        error: "Another claim is currently processing. Try again shortly.",
      });
    }

    claimInProgress = true;

    /* ---------------- ATOMIC COOLDOWN CHECK ---------------- */
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

    /* ---------------- RECORD CLAIM ---------------- */
    await pool.query("INSERT INTO claims (wallet) VALUES ($1)", [wallet]);

    console.log("Claim approved:", wallet);

    /* ---------------- SEND PAYMENT ---------------- */
    let signature: string;

    try {
      signature = await sendFaucetPayment(wallet);
    } catch (paymentError: any) {
      claimInProgress = false;

      console.error("Payment failed:", paymentError);

      return res.status(500).json({
        error: "Faucet payment failed. Please try again later.",
      });
    }

    claimInProgress = false;

    /* ---------------- SUCCESS RESPONSE ---------------- */
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

/*
  Start Server
*/
const PORT = 3000;

app.listen(PORT, () => {
  console.log("=================================");
  console.log("🚰 TapForSol Faucet Server Online");
  console.log(`Listening on http://localhost:${PORT}`);
  console.log("=================================");
});