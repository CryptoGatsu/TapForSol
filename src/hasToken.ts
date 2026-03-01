import { connection } from "./solana.js";
import { PublicKey } from "@solana/web3.js";

const MINT_ADDRESS = process.env.TAPFORSOL_MINT;

if (!MINT_ADDRESS) {
  throw new Error("TAPFORSOL_MINT is not defined in environment variables");
}

const TAPFORSOL_MINT = new PublicKey(MINT_ADDRESS);

export async function holdsTapForSol(wallet: string): Promise<boolean> {
  const owner = new PublicKey(wallet);

  const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
    mint: TAPFORSOL_MINT,
  });

  return accounts.value.some(
    (acc) => Number(acc.account.data.parsed.info.tokenAmount.amount) > 0
  );
}