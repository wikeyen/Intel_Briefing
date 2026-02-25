// ABOUTME: Unit tests for the SQLite-backed database layer in db.ts.
// ABOUTME: Covers kv store, TTL expiry, and pipeline_items CRUD using an in-memory database.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb,
  kvSet,
  kvGet,
  getDb,
  writePipelineItem,
  readFreshPipelineItems,
  readRunItems,
  clearRunItems,
  clearAllPipelineItems,
} from './db'

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
})

// ── Pipeline items ────────────────────────────────────────────────────

describe('pipeline_items', () => {
  describe('writePipelineItem + readFreshPipelineItems', () => {
    it('returns items within the freshness window', async () => {
      const now = new Date().toISOString()
      await writePipelineItem('sensor_a', 'run-1', [{ id: 1 }], now)
      await writePipelineItem('sensor_b', 'run-1', [{ id: 2 }], now)

      const result = await readFreshPipelineItems(1) // 1-hour window
      expect(result.size).toBe(2)
      expect(result.get('sensor_a')!.items).toEqual([{ id: 1 }])
      expect(result.get('sensor_b')!.items).toEqual([{ id: 2 }])
    })

    it('excludes items outside the freshness window', async () => {
      const stale = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3 hours ago
      const fresh = new Date().toISOString()
      await writePipelineItem('sensor_stale', 'run-old', [{ id: 1 }], stale)
      await writePipelineItem('sensor_fresh', 'run-new', [{ id: 2 }], fresh)

      const result = await readFreshPipelineItems(1) // 1-hour window
      expect(result.size).toBe(1)
      expect(result.has('sensor_fresh')).toBe(true)
      expect(result.has('sensor_stale')).toBe(false)
    })

    it('keeps the most recent row when multiple run_ids exist for same sensor', async () => {
      const older = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 min ago
      const newer = new Date().toISOString()
      await writePipelineItem('sensor_a', 'run-1', [{ v: 'old' }], older)
      await writePipelineItem('sensor_a', 'run-2', [{ v: 'new' }], newer)

      const result = await readFreshPipelineItems(1)
      expect(result.size).toBe(1)
      expect(result.get('sensor_a')!.items).toEqual([{ v: 'new' }])
      expect(result.get('sensor_a')!.fetchedAt).toBe(newer)
    })

    it('upserts same sensor + run_id combination', async () => {
      const now = new Date().toISOString()
      await writePipelineItem('sensor_a', 'run-1', [{ v: 1 }], now)
      await writePipelineItem('sensor_a', 'run-1', [{ v: 2 }], now)

      const result = await readFreshPipelineItems(1)
      expect(result.get('sensor_a')!.items).toEqual([{ v: 2 }])
    })
  })

  describe('readRunItems', () => {
    it('returns all items for a specific run', async () => {
      const now = new Date().toISOString()
      await writePipelineItem('sensor_a', 'run-1', [{ id: 1 }], now)
      await writePipelineItem('sensor_b', 'run-1', [{ id: 2 }], now)
      await writePipelineItem('sensor_c', 'run-2', [{ id: 3 }], now)

      const items = await readRunItems('run-1')
      expect(items).toHaveLength(2)
      const names = items.map(i => i.sensorName).sort()
      expect(names).toEqual(['sensor_a', 'sensor_b'])
    })

    it('returns empty array for unknown run_id', async () => {
      const items = await readRunItems('nonexistent')
      expect(items).toEqual([])
    })
  })

  describe('clearRunItems', () => {
    it('removes only the specified run items', async () => {
      const now = new Date().toISOString()
      await writePipelineItem('sensor_a', 'run-1', [{ id: 1 }], now)
      await writePipelineItem('sensor_b', 'run-2', [{ id: 2 }], now)

      await clearRunItems('run-1')

      const run1 = await readRunItems('run-1')
      const run2 = await readRunItems('run-2')
      expect(run1).toHaveLength(0)
      expect(run2).toHaveLength(1)
    })
  })

  describe('clearAllPipelineItems', () => {
    it('removes all pipeline items across all runs', async () => {
      const now = new Date().toISOString()
      await writePipelineItem('sensor_a', 'run-1', [{ id: 1 }], now)
      await writePipelineItem('sensor_b', 'run-2', [{ id: 2 }], now)
      await writePipelineItem('sensor_c', 'run-3', [{ id: 3 }], now)

      await clearAllPipelineItems()

      const result = await readFreshPipelineItems(24) // wide window
      expect(result.size).toBe(0)
    })
  })
})
