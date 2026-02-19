// ABOUTME: Unit tests for the SQLite-backed key-value adapter in db.ts.
// ABOUTME: Covers initDb, kvSet, kvGet, and TTL expiry behaviour using an in-memory database.
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, kvSet, kvGet, getDb } from './db'

beforeEach(async () => {
  // Reset to a fresh in-memory database before each test
  await initDb(':memory:')
})

describe('initDb', () => {
  it('creates the kv table', async () => {
    const db = await getDb()
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='kv'",
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('kv')
  })
})

describe('kvSet', () => {
  it('stores a value that can be retrieved', async () => {
    await kvSet('test:key', { hello: 'world' })
    const result = await kvGet<{ hello: string }>('test:key')
    expect(result).toEqual({ hello: 'world' })
  })

  it('stores a value with TTL', async () => {
    await kvSet('test:ttl', { data: 1 }, 3600)
    const result = await kvGet<{ data: number }>('test:ttl')
    expect(result).toEqual({ data: 1 })
  })

  it('overwrites existing key', async () => {
    await kvSet('test:overwrite', { v: 1 })
    await kvSet('test:overwrite', { v: 2 })
    const result = await kvGet<{ v: number }>('test:overwrite')
    expect(result).toEqual({ v: 2 })
  })
})

describe('kvGet', () => {
  it('returns null for missing key', async () => {
    const result = await kvGet('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null for expired key', async () => {
    // Set with TTL of -1 second (already expired)
    await kvSet('test:expired', { data: 'old' }, -1)
    const result = await kvGet('test:expired')
    expect(result).toBeNull()
  })

  it('returns value when no TTL (never expires)', async () => {
    await kvSet('test:forever', { data: 'persistent' })
    const result = await kvGet<{ data: string }>('test:forever')
    expect(result).toEqual({ data: 'persistent' })
  })

  it('deserializes complex objects', async () => {
    const complex = {
      sections: [{ name: 'test', items: [1, 2, 3] }],
      nested: { deep: true },
    }
    await kvSet('test:complex', complex)
    const result = await kvGet('test:complex')
    expect(result).toEqual(complex)
  })
})
