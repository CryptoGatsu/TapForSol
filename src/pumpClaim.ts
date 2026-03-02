import { connection, getFaucetKeypair } from "./solana.js";
import { VersionedTransaction } from "@solana/web3.js";

export async function claimPumpFees() {

  const faucet = getFaucetKeypair();

  const res = await fetch("https://pumpportal.fun/api/claim-fees", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      creator: faucet.publicKey.toBase58()
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("PumpPortal error:", text);
    throw new Error("Pump fee claim failed");
  }

  const data = await res.json();

  // IMPORTANT: No rewards yet case
  if (!data || !data.transaction) {
    throw new Error("No creator rewards available yet");
  }

  const tx = VersionedTransaction.deserialize(
    Buffer.from(data.transaction, "base64")
  );

  tx.sign([faucet]);

  const sig = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3
  });

  await connection.confirmTransaction(sig, "confirmed");

  console.log("Pump rewards claimed:", sig);
}