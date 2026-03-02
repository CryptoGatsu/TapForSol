import { connection, getFaucetKeypair } from "./solana.js";

export async function waitForRewardDeposit(previousBalance: number): Promise<number> {

  const faucet = getFaucetKeypair();

  for (let i = 0; i < 20; i++) {

    const currentBalance = await connection.getBalance(faucet.publicKey);

    console.log("Checking faucet balance:", currentBalance);

    if (currentBalance > previousBalance) {
      return currentBalance - previousBalance;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return 0;
}