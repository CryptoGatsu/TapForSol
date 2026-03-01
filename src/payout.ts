import { SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from "@solana/web3.js";
import { connection, getFaucetKeypair } from "./solana.js";

const LAMPORTS = 1_000_000_000;

const faucetKeypair = getFaucetKeypair();

export async function sendFaucetPayment(destination: string): Promise<string> {

  const faucetKeypair = getFaucetKeypair();
  const toPubkey = new PublicKey(destination);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: faucetKeypair.publicKey,
      toPubkey,
      lamports: 75000 // 0.000075 SOL
    })
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [faucetKeypair]
  );

  return signature;
}