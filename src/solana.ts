import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";

/*
  DO NOT create the wallet during module import.
  Railway loads modules before env vars stabilize.
  We instead create the wallet only when first needed.
*/

let faucetKeypair: Keypair | null = null;

export function getFaucetKeypair(): Keypair {
  if (faucetKeypair) return faucetKeypair;

  const key = process.env.FAUCET_PRIVATE_KEY;

  if (!key) {
    throw new Error("FAUCET_PRIVATE_KEY environment variable is missing");
  }

  try {
    const secret = Uint8Array.from(JSON.parse(key));
    faucetKeypair = Keypair.fromSecretKey(secret);
    console.log("✅ Faucet wallet loaded:", faucetKeypair.publicKey.toBase58());
    return faucetKeypair;
  } catch (err) {
    throw new Error("Failed to parse FAUCET_PRIVATE_KEY. Invalid JSON format.");
  }
}

/*
  Solana connection (safe to create immediately)
*/
export const connection = new Connection(
  process.env.SOLANA_RPC || clusterApiUrl("devnet"),
  {
    commitment: "confirmed",
  }
);