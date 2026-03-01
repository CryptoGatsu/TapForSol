import { pool } from "./db.js";

export async function acquireLock(): Promise<boolean> {

const res = await pool.query(`     UPDATE claim_lock
    SET locked = true, updated = NOW()
    WHERE id = 1 AND locked = false
    RETURNING locked
  `);

return res.rowCount === 1;
}

export async function releaseLock() {
await pool.query(`UPDATE claim_lock SET locked=false WHERE id=1`);
}
