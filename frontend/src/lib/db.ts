// ABOUTME: SQLite-backed database layer using @libsql/client.
// ABOUTME: Provides kv store with TTL, trend snapshots, and pipeline_items table for crash-safe incremental fetching.
import { createClient, type Client } from '@libsql/client'
import { copyFile, access } from 'fs/promises'
import path from 'path'

// Store client on globalThis so it survives Next.js module re-evaluation
// across instrumentation and API route boundaries.
const globalForDb = globalThis as unknown as { __dbClient?: Client }

const CONFIG_KEY = 'intel:config'
const LEGACY_DB_NAME = 'intel.db'
const CURRENT_DB_NAME = 'info-aggregation.db'

function filePathFromDbUrl(dbUrl: string): string | null {
  if (!dbUrl.startsWith('file:') || dbUrl === ':memory:') return null
  const rawPath = dbUrl.slice('file:'.length)
  if (!rawPath || rawPath === ':memory:') return null
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function migrateLegacyDatabaseFile(dbUrl: string): Promise<void> {
  const targetPath = filePathFromDbUrl(dbUrl)
  if (!targetPath || path.basename(targetPath) !== CURRENT_DB_NAME) return

  const legacyPath = path.join(path.dirname(targetPath), LEGACY_DB_NAME)
  if (await fileExists(targetPath)) return
  if (!await fileExists(legacyPath)) return

  await copyFile(legacyPath, targetPath)
}

async function migrateLegacyDatabaseState(dbUrl: string): Promise<void> {
  const targetPath = filePathFromDbUrl(dbUrl)
  if (!targetPath || path.basename(targetPath) !== CURRENT_DB_NAME) return

  const legacyPath = path.join(path.dirname(targetPath), LEGACY_DB_NAME)
  if (!await fileExists(legacyPath)) return

  const current = globalForDb.__dbClient!
  const legacy = createClient({ url: `file:${legacyPath}` })
  try {
    await mergeLegacyConfig(current, legacy)
    await mergeMissingKvRows(current, legacy)
    await mergeMissingRows(
      current,
      legacy,
      'pipeline_items',
      ['sensor_name', 'run_id'],
      ['sensor_name', 'run_id', 'items_json', 'fetched_at'],
    )
    await mergeMissingRows(
      current,
      legacy,
      'source_groups',
      ['id'],
      [
        'id',
        'parent_id',
        'name',
        'color',
        'icon',
        'sort_order',
        'trend_enabled',
        'topic_enabled',
        'social_enabled',
        'sentiment_enabled',
        'summary_prompt',
        'trend_prompt',
        'topic_prompt',
        'social_prompt',
        'suppress_keywords',
        'boost_keywords',
        'created_at',
        'updated_at',
      ],
    )
    await mergeMissingRows(
      current,
      legacy,
      'source_group_members',
      ['group_id', 'sensor_key'],
      ['group_id', 'sensor_key', 'sort_order', 'added_at'],
    )
  } catch {
    // Best-effort migration only; normal DB initialisation should continue.
  } finally {
    legacy.close()
  }
}

async function mergeLegacyConfig(current: Client, legacy: Client): Promise<void> {
  const [currentRows, legacyRows] = await Promise.all([
    current.execute({ sql: 'SELECT value FROM kv WHERE key = ?', args: [CONFIG_KEY] }),
    legacy.execute({ sql: 'SELECT value FROM kv WHERE key = ?', args: [CONFIG_KEY] }),
  ])
  if (legacyRows.rows.length === 0) return

  const currentConfig = currentRows.rows.length > 0
    ? JSON.parse(currentRows.rows[0].value as string) as Record<string, unknown>
    : {}
  const legacyConfig = JSON.parse(legacyRows.rows[0].value as string) as Record<string, unknown>
  let changed = false

  for (const [field, value] of Object.entries(legacyConfig)) {
    if (isMissingConfigValue(currentConfig[field]) && !isMissingConfigValue(value)) {
      currentConfig[field] = value
      changed = true
    }
  }

  if (changed || currentRows.rows.length === 0) {
    await current.execute({
      sql: 'INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, NULL)',
      args: [CONFIG_KEY, JSON.stringify(currentConfig)],
    })
  }
}


function isMissingConfigValue(value: unknown): boolean {
  if (value == null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

async function mergeMissingKvRows(current: Client, legacy: Client): Promise<void> {
  const rows = await legacy.execute('SELECT key, value, expires_at FROM kv')
  for (const row of rows.rows) {
    if (row.key === CONFIG_KEY) continue
    await current.execute({
      sql: 'INSERT OR IGNORE INTO kv (key, value, expires_at) VALUES (?, ?, ?)',
      args: [row.key as string, row.value as string, row.expires_at as number | null],
    })
  }
}

async function mergeMissingRows(
  current: Client,
  legacy: Client,
  table: string,
  keyColumns: string[],
  columns: string[],
): Promise<void> {
  const rows = await legacy.execute(`SELECT ${columns.join(', ')} FROM ${table}`)
  const placeholders = columns.map(() => '?').join(', ')
  const quotedColumns = columns.join(', ')
  const where = keyColumns.map(column => `${column} = ?`).join(' AND ')

  for (const row of rows.rows) {
    const exists = await current.execute({
      sql: `SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`,
      args: keyColumns.map(column => row[column] as string | number | null),
    })
    if (exists.rows.length > 0) continue

    await current.execute({
      sql: `INSERT INTO ${table} (${quotedColumns}) VALUES (${placeholders})`,
      args: columns.map(column => row[column] as string | number | null),
    })
  }
}

/** Return the active database client, lazily initialising if needed. */
export async function getDb(): Promise<Client> {
  if (!globalForDb.__dbClient) {
    await initDb()
  }
  return globalForDb.__dbClient!
}

/**
 * Initialise the database connection and create the kv table if it doesn't exist.
 * Pass ':memory:' for tests or 'file:path/to/db' for persistent storage.
 * Defaults to DATABASE_URL env var when no url argument is given.
 */
export async function initDb(url?: string): Promise<void> {
  const dbUrl = url ?? process.env.DATABASE_URL ?? 'file:data/info-aggregation.db'
  await migrateLegacyDatabaseFile(dbUrl)
  globalForDb.__dbClient = createClient({ url: dbUrl })
  await globalForDb.__dbClient.execute(`
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      expires_at INTEGER
    )
  `)
  await globalForDb.__dbClient.execute(`
    CREATE TABLE IF NOT EXISTS pipeline_items (
      sensor_name  TEXT NOT NULL,
      run_id       TEXT NOT NULL,
      items_json   TEXT NOT NULL,
      fetched_at   TEXT NOT NULL,
      PRIMARY KEY (sensor_name, run_id)
    )
  `)
  await globalForDb.__dbClient.execute(`
    CREATE TABLE IF NOT EXISTS source_groups (
      id                TEXT PRIMARY KEY,
      parent_id         TEXT REFERENCES source_groups(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      color             TEXT NOT NULL,
      icon              TEXT,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      trend_enabled     INTEGER NOT NULL DEFAULT 0,
      topic_enabled     INTEGER NOT NULL DEFAULT 0,
      social_enabled    INTEGER NOT NULL DEFAULT 0,
      sentiment_enabled INTEGER NOT NULL DEFAULT 0,
      summary_prompt    TEXT,
      trend_prompt      TEXT,
      topic_prompt      TEXT,
      social_prompt     TEXT,
      suppress_keywords TEXT NOT NULL DEFAULT '[]',
      boost_keywords    TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )
  `)
  await globalForDb.__dbClient.execute(`
    CREATE TABLE IF NOT EXISTS source_group_members (
      group_id    TEXT NOT NULL REFERENCES source_groups(id) ON DELETE CASCADE,
      sensor_key  TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      added_at    TEXT NOT NULL,
      PRIMARY KEY (group_id, sensor_key)
    )
  `)

  await migrateLegacyDatabaseState(dbUrl)

  // Migrate old monolithic sensor keys (x→x_accounts, etc.) before seeding
  const { migrateOldSensorKeys, migrateGroupStructure } = await import('./groups/migration')
  await migrateOldSensorKeys()

  // Seed default groups on first startup
  const { seedDefaultGroups } = await import('./groups/seed')
  await seedDefaultGroups()

  // Ensure v2 group structure (Voices, Topics) exists on existing DBs
  await migrateGroupStructure()

  // Migrate old `processing` column to discrete workflow columns
  const { migrateWorkflowColumns } = await import('./groups/migration')
  await migrateWorkflowColumns()
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
  const db = await getDb()
  const expiresAt =
    ttlSeconds != null ? Math.floor(Date.now() / 1000) + ttlSeconds : null
  await db.execute({
    sql: `INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)`,
    args: [key, JSON.stringify(value), expiresAt],
  })
}

/** Delete a key from the store. */
export async function kvDelete(key: string): Promise<void> {
  const db = await getDb()
  await db.execute({ sql: `DELETE FROM kv WHERE key = ?`, args: [key] })
}

/**
 * Get a value by key. Returns null if missing or expired.
 * Expired rows are not deleted — they get overwritten on the next kvSet.
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb()
  const now = Math.floor(Date.now() / 1000)
  const result = await db.execute({
    sql: `SELECT value FROM kv WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
    args: [key, now],
  })
  if (result.rows.length === 0) {
    return null
  }
  try {
    return JSON.parse(result.rows[0].value as string) as T
  } catch {
    return null
  }
}

// ── Trend snapshot helpers ──────────────────────────────────────────────

export interface TrendSnapshot {
  timestamp: string // ISO
  trends: Array<{ name: string; count: number; rank: number }>
}

const SNAPSHOT_PREFIX = 'trends:'
const MAX_SNAPSHOTS = 30

/**
 * Write a trend snapshot and prune old ones beyond MAX_SNAPSHOTS.
 * Key format: `trends:{platform}:snapshot:{ISO-timestamp}`
 */
export async function writeTrendSnapshot(
  platform: string,
  snapshot: TrendSnapshot,
): Promise<void> {
  const key = `${SNAPSHOT_PREFIX}${platform}:snapshot:${snapshot.timestamp}`
  await kvSet(key, snapshot)

  // Prune old snapshots beyond retention limit
  const db = await getDb()
  const prefix = `${SNAPSHOT_PREFIX}${platform}:snapshot:`
  const rows = await db.execute({
    sql: `SELECT key FROM kv WHERE key LIKE ? ORDER BY key DESC`,
    args: [`${prefix}%`],
  })

  if (rows.rows.length > MAX_SNAPSHOTS) {
    const toDelete = rows.rows.slice(MAX_SNAPSHOTS)
    for (const row of toDelete) {
      await db.execute({ sql: `DELETE FROM kv WHERE key = ?`, args: [row.key as string] })
    }
  }
}

/**
 * Load all trend snapshots for a platform, ordered oldest to newest.
 */
export async function readTrendSnapshots(
  platform: string,
): Promise<TrendSnapshot[]> {
  const db = await getDb()
  const prefix = `${SNAPSHOT_PREFIX}${platform}:snapshot:`
  const rows = await db.execute({
    sql: `SELECT value FROM kv WHERE key LIKE ? ORDER BY key ASC`,
    args: [`${prefix}%`],
  })

  return rows.rows.flatMap(row => {
    try {
      return [JSON.parse(row.value as string) as TrendSnapshot]
    } catch {
      return []
    }
  })
}

// ── Pipeline items (crash-safe incremental fetch storage) ─────────────

/**
 * Write a sensor's fetched items to the pipeline_items temp table.
 * Uses UPSERT so re-fetching a sensor in the same run overwrites.
 */
export async function writePipelineItem(
  sensorName: string,
  runId: string,
  items: unknown[],
  fetchedAt: string,
): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `INSERT OR REPLACE INTO pipeline_items (sensor_name, run_id, items_json, fetched_at) VALUES (?, ?, ?, ?)`,
    args: [sensorName, runId, JSON.stringify(items), fetchedAt],
  })
}

/**
 * Read all sensors that have fresh data within the resume window.
 * Returns a map of sensor_name -> { items, fetchedAt }.
 */
export async function readFreshPipelineItems(
  windowHours: number,
): Promise<Map<string, { items: unknown[]; fetchedAt: string }>> {
  const db = await getDb()
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
  const result = await db.execute({
    sql: `SELECT sensor_name, items_json, fetched_at FROM pipeline_items WHERE fetched_at > ? ORDER BY fetched_at DESC`,
    args: [cutoff],
  })
  // If multiple rows per sensor (different run_ids), keep the most recent one
  const map = new Map<string, { items: unknown[]; fetchedAt: string }>()
  for (const row of result.rows) {
    const name = row.sensor_name as string
    if (!map.has(name)) {
      try {
        map.set(name, {
          items: JSON.parse(row.items_json as string),
          fetchedAt: row.fetched_at as string,
        })
      } catch {
        map.set(name, { items: [], fetchedAt: row.fetched_at as string })
      }
    }
  }
  return map
}

/**
 * Read all pipeline_items for a specific run, as an array.
 */
export async function readRunItems(
  runId: string,
): Promise<Array<{ sensorName: string; items: unknown[]; fetchedAt: string }>> {
  const db = await getDb()
  const result = await db.execute({
    sql: `SELECT sensor_name, items_json, fetched_at FROM pipeline_items WHERE run_id = ?`,
    args: [runId],
  })
  return result.rows.map(row => {
    let items: unknown[]
    try {
      items = JSON.parse(row.items_json as string)
    } catch {
      items = []
    }
    return {
      sensorName: row.sensor_name as string,
      items,
      fetchedAt: row.fetched_at as string,
    }
  })
}

/**
 * Clear all pipeline_items for a specific run (after promoting to permanent cache).
 */
export async function clearRunItems(runId: string): Promise<void> {
  const db = await getDb()
  await db.execute({ sql: `DELETE FROM pipeline_items WHERE run_id = ?`, args: [runId] })
}

/**
 * Clear ALL pipeline_items (used when aborting from stale banner).
 */
export async function clearAllPipelineItems(): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM pipeline_items`)
}
