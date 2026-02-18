// ABOUTME: SQLite-backed key-value adapter using @libsql/client.
// ABOUTME: Provides kvSet/kvGet with optional TTL, backed by a single 'kv' table.
import { createClient, type Client } from '@libsql/client'

let client: Client | null = null

/** Return the active database client. Throws if initDb() has not been called. */
export function getDb(): Client {
  if (!client) {
    throw new Error('Database not initialised — call initDb() first')
  }
  return client
}

/**
 * Initialise the database connection and create the kv table if it doesn't exist.
 * Pass ':memory:' for tests or 'file:path/to/db' for persistent storage.
 * Defaults to DATABASE_URL env var when no url argument is given.
 */
export async function initDb(url?: string): Promise<void> {
  const dbUrl = url ?? process.env.DATABASE_URL ?? 'file:data/intel.db'
  client = createClient({ url: dbUrl })
  await client.execute(`
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      expires_at INTEGER
    )
  `)
}

/**
 * Set a key-value pair. Value is JSON-serialised.
 * ttlSeconds: seconds until expiry (null/undefined = no expiry).
 */
export async function kvSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<void> {
  const db = getDb()
  const expiresAt =
    ttlSeconds != null ? Math.floor(Date.now() / 1000) + ttlSeconds : null
  await db.execute({
    sql: `INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)`,
    args: [key, JSON.stringify(value), expiresAt],
  })
}

/**
 * Get a value by key. Returns null if missing or expired.
 * Expired rows are not deleted — they get overwritten on the next kvSet.
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const result = await db.execute({
    sql: `SELECT value FROM kv WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
    args: [key, now],
  })
  if (result.rows.length === 0) {
    return null
  }
  return JSON.parse(result.rows[0].value as string) as T
}
