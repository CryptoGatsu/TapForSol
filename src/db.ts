import { Pool } from "pg";

export const pool = new Pool({
  user: process.env.USER, // macOS username
  host: "localhost",
  database: "tapforsol",
  port: 5432,
});