export async function claimPumpFees(): Promise<void> {

  const response = await fetch("https://pumpportal.fun/creator-fee/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      creator: process.env.CREATOR_WALLET_PUBLIC
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("PumpPortal error:", text);
    throw new Error("Pump fee claim failed");
  }

  console.log("Pump.fun creator fees claimed");
}