import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";

/*
  We lazy-load the faucet wallet.
  Railway may initialize modules before env variables are ready.
*/
let faucetKeypair: Keypair | null = null;

/* ---------------------- FAUCET WALLET ---------------------- */
export function getFaucetKeypair(): Keypair {

  if (faucetKeypair) return faucetKeypair;

  const raw = process.env.FAUCET_PRIVATE_KEY;

  if (!raw) {
    console.error("❌ FAUCET_PRIVATE_KEY missing from Railway variables");
    throw new Error("FAUCET_PRIVATE_KEY environment variable is missing");
  }

  try {

    // Remove accidental whitespace/newlines Railway sometimes adds
    const cleaned = raw.trim();

    // Parse JSON array
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length !== 64) {
      console.error("❌ FAUCET_PRIVATE_KEY is not a valid 64-byte array");
      throw new Error("Invalid private key format");
    }

    const secret = Uint8Array.from(parsed);

    faucetKeypair = Keypair.fromSecretKey(secret);

    console.log("=================================");
    console.log("✅ Faucet wallet successfully loaded");
    console.log("Wallet Address:", faucetKeypair.publicKey.toBase58());
    console.log("Network RPC:", process.env.SOLANA_RPC);
    console.log("=================================");

    return faucetKeypair;

  } catch (err) {

    console.error("❌ Failed to parse FAUCET_PRIVATE_KEY");
    console.error("Make sure Railway variable is EXACT raw JSON array");
    console.error("Example:");
    console.error("[12,34,56,...,89]");

    throw new Error("Failed to parse FAUCET_PRIVATE_KEY");
  }
}

/* ---------------------- SOLANA CONNECTION ---------------------- */
export const connection = new Connection(
  process.env.SOLANA_RPC || clusterApiUrl("devnet"),
  {
    commitment: "confirmed",
  }
);