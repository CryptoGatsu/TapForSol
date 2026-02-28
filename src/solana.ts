import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

const secret = Uint8Array.from(JSON.parse(process.env.FAUCET_PRIVATE_KEY!));
export const faucetKeypair = Keypair.fromSecretKey(secret);

export const connection = new Connection(
  process.env.SOLANA_RPC || clusterApiUrl("devnet"),
  {
    commitment: "confirmed",
  }
);