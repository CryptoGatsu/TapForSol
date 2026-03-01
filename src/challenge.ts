import { pool } from "./db.js";
import { v4 as uuidv4 } from "uuid";

export async function createChallenge(ip: string): Promise<string> {
  const token = uuidv4();
  const expires = new Date(Date.now() + 60 * 1000); // 60 sec

  await pool.query(
    "INSERT INTO claim_challenges (token, ip, expires) VALUES ($1,$2,$3)",
    [token, ip, expires]
  );

  return token;
}

export async function validateChallenge(
  token: string,
  ip: string,
  fingerprint: string
): Promise<boolean> {

  const result = await pool.query(
    "SELECT * FROM claim_challenges WHERE token=$1",
    [token]
  );

  if (!result.rows.length) return false;

  const row = result.rows[0];

  if (new Date(row.expires) < new Date()) return false;

  if (row.ip !== ip) return false;

  await pool.query(
    "DELETE FROM claim_challenges WHERE token=$1",
    [token]
  );

  return true;
}