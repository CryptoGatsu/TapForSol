import { connection } from "./solana.js";
import { PublicKey } from "@solana/web3.js";

const CREATOR_WALLET = process.env.CREATOR_WALLET_PUBLIC;

if (!CREATOR_WALLET) {
  throw new Error("CREATOR_WALLET_PUBLIC not set");
}

const CREATOR = new PublicKey(CREATOR_WALLET);

export async function waitForRewardDeposit(previousBalance: number): Promise<number> {

  for (let i = 0; i < 15; i++) {

    const currentBalance = await connection.getBalance(CREATOR);

    if (currentBalance > previousBalance) {
      return currentBalance - previousBalance;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return 0;
}