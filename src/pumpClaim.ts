import { connection, getFaucetKeypair } from "./solana.js";
import { VersionedTransaction } from "@solana/web3.js";

export async function claimPumpFees() {

  const faucet = getFaucetKeypair();

  const res = await fetch("https://pumpportal.fun/api/creator-fee", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      wallet: faucet.publicKey.toBase58()
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("PumpPortal error:", text);
    throw new Error("Pump fee claim failed");
  }

  const data = await res.json();

  if (!data.transaction) {
    throw new Error("No claimable rewards yet");
  }

  // deserialize transaction
  const tx = VersionedTransaction.deserialize(
    Buffer.from(data.transaction, "base64")
  );

  // sign
  tx.sign([faucet]);

  // send to Solana
  const sig = await connection.sendTransaction(tx);

  await connection.confirmTransaction(sig, "confirmed");

  console.log("Pump rewards claimed:", sig);
}