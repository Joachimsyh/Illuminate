import { Pool, type QueryResultRow } from "pg";
import { randomUUID } from "crypto";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // Strip Prisma-style ?schema=public if present
  const connectionString = url.replace(/[?&]schema=[^&]*/g, (m, offset) =>
    m.startsWith("?") && url.includes("&") ? "?" : ""
  ).replace(/\?$/, "");

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.PGSSL === "1"
        ? { rejectUnauthorized: process.env.SSL_NO_VERIFY !== "1" }
        : undefined,
  });
}

export const pool = globalForDb.pgPool || createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export function newId(): string {
  return randomUUID();
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function execute(
  text: string,
  params: unknown[] = []
): Promise<number> {
  const result = await pool.query(text, params);
  return result.rowCount ?? 0;
}

export async function withTransaction<T>(
  fn: (client: {
    query: <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ) => Promise<R[]>;
    queryOne: <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ) => Promise<R | null>;
  }) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const api = {
      async query<R extends QueryResultRow = QueryResultRow>(
        text: string,
        params: unknown[] = []
      ): Promise<R[]> {
        const result = await client.query<R>(text, params);
        return result.rows;
      },
      async queryOne<R extends QueryResultRow = QueryResultRow>(
        text: string,
        params: unknown[] = []
      ): Promise<R | null> {
        const rows = await api.query<R>(text, params);
        return rows[0] ?? null;
      },
    };
    const value = await fn(api);
    await client.query("COMMIT");
    return value;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Health check */
export async function pingDb(): Promise<void> {
  await pool.query("SELECT 1");
}
