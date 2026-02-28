import dotenv from "dotenv";

dotenv.config();

interface TurnstileResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export async function verifyTurnstile(token: string, ip: string) {
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `secret=${process.env.TURNSTILE_SECRET}&response=${token}&remoteip=${ip}`,
    }
  );

  const data = (await response.json()) as TurnstileResponse;

  return data.success === true;
}