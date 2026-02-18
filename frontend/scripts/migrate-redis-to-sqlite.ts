// ABOUTME: One-time migration script to copy data from Redis (Upstash) to SQLite.
// ABOUTME: Reads intel:latest, intel:pipeline_status, intel:config from Redis and writes to SQLite via kvSet.
//
// Usage:
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... DATABASE_URL=file:data/intel.db \
//     npx tsx scripts/migrate-redis-to-sqlite.ts

import { Redis } from '@upstash/redis'
import { initDb, kvSet } from '../src/lib/db'

const KEYS_TO_MIGRATE = [
  { key: 'intel:latest', ttl: 48 * 60 * 60 },
  { key: 'intel:pipeline_status', ttl: 60 * 60 },
  { key: 'intel:config', ttl: undefined },
] as const

async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN')
    process.exit(1)
  }

  const redis = new Redis({ url, token })
  await initDb()

  let migrated = 0
  for (const { key, ttl } of KEYS_TO_MIGRATE) {
    const data = await redis.get(key)
    if (data != null) {
      await kvSet(key, data, ttl)
      console.log(`Migrated ${key}`)
      migrated++
    } else {
      console.log(`Skipped ${key} (not found in Redis)`)
    }
  }

  console.log(`Done — ${migrated} key(s) migrated.`)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
