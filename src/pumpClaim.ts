export async function claimPumpFees() {

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
throw new Error("Pump fee claim failed");
}

return await response.json();
}
