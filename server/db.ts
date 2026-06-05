import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000
});

export async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    return { connected: false, reason: "DATABASE_URL is not configured" };
  }

  try {
    await pool.query("select 1");
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      reason: error instanceof Error ? error.message : "Unknown database error"
    };
  }
}
