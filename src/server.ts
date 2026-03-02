import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import http from "http";
import { PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { connection, getFaucetKeypair } from "./solana.js";
import { createChallenge, validateChallenge } from "./challenge.js";
import { pool } from "./db.js";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { verifyTurnstile } from "./turnstile.js";

import { acquireLock, releaseLock } from "./lock.js";
import { claimPumpFees } from "./pumpClaim.js";
import { waitForRewardDeposit } from "./waitForRewards.js";
import { holdsTapForSol } from "./hasToken.js";
import { getUserReward } from "./rewardMath.js";

const app = express();

const COOLDOWN_HOURS = 8;
const MAX_CLAIMS = 2;

const OWNER_WALLET = new PublicKey(process.env.FEE_WALLET_PUBLIC!);

const ipLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 10,
});

/* HEALTH */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

/* MIDDLEWARE */
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.use("/claim", (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (
  origin &&
  !origin.includes("tapforsol.fun") &&
  !origin.includes("cryptogatsu.github.io")
) {
    return res.status(403).json({ error: "Unauthorized origin" });
  }
  next();
});

/* ROOT */
app.get("/", (_req: Request, res: Response) => {
  res.send("TapForSol reward engine running");
});

/* CHALLENGE */
app.get("/challenge", async (req: Request, res: Response) => {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  try {
    const token = await createChallenge(ip);
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/* CLAIM */
app.post("/claim", async (req: Request, res: Response) => {

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  try {

    const { wallet, token, challengeToken, fingerprint } = req.body;

    if (!challengeToken || !fingerprint)
      return res.status(400).json({ error: "Session expired. Refresh page." });

    if (!(await validateChallenge(challengeToken, ip, fingerprint)))
      return res.status(403).json({ error: "Invalid session" });

    if (!token)
      return res.status(400).json({ error: "Captcha required" });

    const human = await verifyTurnstile(token, ip);
    if (!human)
      return res.status(403).json({ error: "Captcha verification failed" });

    try {
      await ipLimiter.consume(ip);
    } catch {
      return res.status(429).json({ error: "Too many requests from this IP." });
    }

    if (!wallet || typeof wallet !== "string")
      return res.status(400).json({ error: "Wallet address required" });

    if (wallet.length < 32 || wallet.length > 44)
      return res.status(400).json({ error: "Invalid Solana address" });

    const pubkey = new PublicKey(wallet);

    const history = await connection.getSignaturesForAddress(pubkey, { limit: 1 });
    if (history.length === 0)
      return res.status(403).json({ error: "Wallet must already be used on Solana" });

    const balance = await connection.getBalance(pubkey);
    if (balance < 2_000_000)
      return res.status(403).json({ error: "Wallet must hold a small SOL balance" });

    const existing = await pool.query(
      "SELECT * FROM used_fingerprints WHERE fingerprint=$1",
      [fingerprint]
    );

    if (existing.rows.length) {
      if (existing.rows[0].first_wallet !== wallet)
        return res.status(403).json({ error: "Multiple wallets detected from same device" });
    } else {
      await pool.query(
        "INSERT INTO used_fingerprints (fingerprint, first_wallet) VALUES ($1,$2)",
        [fingerprint, wallet]
      );
    }

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

    if (cooldownCheck.rows[0].claims_in_window > MAX_CLAIMS)
      return res.status(429).json({ error: "Cooldown active" });

    if (!(await acquireLock()))
      return res.status(429).json({ error: "Another claim is processing. Try again." });

    try {

      const faucet = getFaucetKeypair();
      const before = await connection.getBalance(faucet.publicKey);

      await claimPumpFees();

      const rewards = await waitForRewardDeposit(before);

      if (rewards < 200_000_000)
        return res.status(400).json({ error: "No creator rewards available yet" });

      const ownerShare = Math.floor(rewards * 0.5);

      const bonus = await holdsTapForSol(wallet);
      const userReward = getUserReward(bonus);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: faucet.publicKey,
          toPubkey: OWNER_WALLET,
          lamports: ownerShare
        }),
        SystemProgram.transfer({
          fromPubkey: faucet.publicKey,
          toPubkey: pubkey,
          lamports: userReward
        })
      );

      const signature = await sendAndConfirmTransaction(connection, tx, [faucet]);

      await pool.query("INSERT INTO claims (wallet) VALUES ($1)", [wallet]);

      return res.json({ status: "paid", tx: signature });

    } finally {
      await releaseLock();
    }

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = Number(process.env.PORT) || 3000;

http.createServer(app).listen(PORT, () => {
  console.log("=================================");
  console.log("🚀 TapForSol Reward Engine Online");
  console.log(`Listening on port ${PORT}`);
  console.log("=================================");
});