import { getFaucetKeypair } from "./solana.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export async function claimPumpFees(): Promise<void> {

  const keypair = getFaucetKeypair();

  // PumpPortal requires signed auth message
  const message = new TextEncoder().encode(
    `claim_creator_rewards_${keypair.publicKey.toBase58()}`
  );

  const signature = nacl.sign.detached(message, keypair.secretKey);

  const response = await fetch("https://pumpportal.fun/api/creator-fee", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      wallet: keypair.publicKey.toBase58(),
      message: bs58.encode(message),
      signature: bs58.encode(signature)
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("PumpPortal error:", text);
    throw new Error("Pump fee claim failed");
  }

  const data = await response.text();
  console.log("Pump.fun claim response:", data);
}