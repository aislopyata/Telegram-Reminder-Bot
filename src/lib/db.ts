import { Pool } from "pg";

let pool: Pool | undefined;

/**
 * Single PostgreSQL connection pool for the bot process.
 * Connection string comes from DATABASE_URL (see .env / environment).
 */
export function getDb(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return pool;
}

export type Db = ReturnType<typeof getDb>;
