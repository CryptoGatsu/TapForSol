import {
  SystemProgram,
  Transaction,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { connection, faucetKeypair } from "./solana";

const LAMPORTS = 1_000_000_000;

export async function sendFaucetPayment(userWallet: string) {
  const balance = await connection.getBalance(faucetKeypair.publicKey);

  const safety = 0.05 * LAMPORTS;
  const available = balance - safety;

  if (available <= 0) throw new Error("Faucet empty");

  const payout = Math.floor(available * 0.5);

  const { blockhash } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: faucetKeypair.publicKey,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: faucetKeypair.publicKey,
      toPubkey: new PublicKey(userWallet),
      lamports: payout,
    }),
    SystemProgram.transfer({
      fromPubkey: faucetKeypair.publicKey,
      toPubkey: new PublicKey(process.env.OWNER_WALLET!),
      lamports: payout,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [
    faucetKeypair,
  ]);

  return signature;
}