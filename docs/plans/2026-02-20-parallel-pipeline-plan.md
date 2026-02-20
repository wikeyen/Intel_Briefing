# Parallel Pipeline Execution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic fetch-then-summarize pipeline with a semaphore-gated worker pool that supports three run modes (fetch, summarize, fetch+summarize), streams per-sensor summaries as fetches complete, and shows two-stage progress in the Status UI.

**Architecture:** A counting semaphore limits how many sensor jobs run concurrently (default 4, configurable). Each job executes a two-stage workflow (fetch → summarize) through a strategy determined by the run mode. A typed progress tracker (observer pattern) decouples status persistence from execution logic. The orchestrator composes these pieces, replacing inline pipeline logic in the API routes.

**Tech Stack:** TypeScript, Next.js 15 App Router, SQLite (via kv adapter), Vitest

**Design doc:** `docs/plans/2026-02-20-parallel-pipeline-design.md`

---

## Task 1: Semaphore Utility

A reusable counting semaphore that limits how many async operations run concurrently.

**Files:**
- Create: `frontend/src/lib/pipeline/semaphore.ts`
- Test: `frontend/src/lib/pipeline/semaphore.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/pipeline/semaphore.test.ts`:

```typescript
// ABOUTME: Tests for the Semaphore concurrency limiter.
// ABOUTME: Validates acquire/release, queuing, and concurrency guarantees.
import { describe, it, expect } from 'vitest'
import { Semaphore } from './semaphore'

describe('Semaphore', () => {
  it('allows up to N concurrent acquisitions', async () => {
    const sem = new Semaphore(2)
    const r1 = await sem.acquire()
    const r2 = await sem.acquire()
    // Both acquired without blocking
    expect(r1).toBeDefined()
    expect(r2).toBeDefined()
    r1()
    r2()
  })

  it('blocks acquisition beyond capacity', async () => {
    const sem = new Semaphore(1)
    const r1 = await sem.acquire()
    let secondAcquired = false
    const p2 = sem.acquire().then(release => {
      secondAcquired = true
      return release
    })
    // Give the microtask queue a tick
    await new Promise(r => setTimeout(r, 10))
    expect(secondAcquired).toBe(false)
    r1() // release first slot
    const r2 = await p2
    expect(secondAcquired).toBe(true)
    r2()
  })

  it('processes queued tasks in order', async () => {
    const sem = new Semaphore(1)
    const order: number[] = []
    const r1 = await sem.acquire()

    const p2 = sem.acquire().then(release => { order.push(2); release() })
    const p3 = sem.acquire().then(release => { order.push(3); release() })

    r1()
    await Promise.all([p2, p3])
    expect(order).toEqual([2, 3])
  })

  it('run() limits concurrency', async () => {
    const sem = new Semaphore(2)
    let active = 0
    let maxActive = 0

    const task = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 20))
      active--
    }

    await Promise.all(Array.from({ length: 6 }, () => sem.run(task)))
    expect(maxActive).toBe(2)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/lib/pipeline/semaphore.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the semaphore**

Create `frontend/src/lib/pipeline/semaphore.ts`:

```typescript
// ABOUTME: Counting semaphore for limiting async concurrency.
// ABOUTME: Provides acquire/release and a convenience run() method.

/**
 * A counting semaphore that limits the number of concurrent async operations.
 * Use `acquire()` for manual control or `run()` for automatic scoping.
 */
export class Semaphore {
  private permits: number
  private queue: Array<() => void> = []

  constructor(concurrency: number) {
    this.permits = concurrency
  }

  /**
   * Acquire a permit. Resolves with a release function when a slot is available.
   * The caller MUST call the returned function to release the permit.
   */
  acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve(() => this.release())
    }
    return new Promise<() => void>(resolve => {
      this.queue.push(() => {
        this.permits--
        resolve(() => this.release())
      })
    })
  }

  private release(): void {
    this.permits++
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      next()
    }
  }

  /**
   * Run an async function within a semaphore-guarded slot.
   * The permit is automatically released when the function completes or throws.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/lib/pipeline/semaphore.test.ts
```

Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add frontend/src/lib/pipeline/semaphore.ts frontend/src/lib/pipeline/semaphore.test.ts
git commit -m "feat(pipeline): add reusable Semaphore concurrency limiter"
```

---

## Task 2: Updated Data Models

Update the shared type definitions for two-stage pipeline progress, run modes, and concurrency config.

**Files:**
- Modify: `frontend/src/lib/models.ts`

**Step 1: Add new types and update existing ones**

In `frontend/src/lib/models.ts`, add these new types and modify existing ones:

```typescript
// New types to add:
export type RunMode = 'fetch' | 'summarize' | 'fetch_summarize'
export type StageState = 'queued' | 'running' | 'ok' | 'failed' | 'skipped'

// Replace existing SensorProgress with:
export interface SensorJobProgress {
  name: string
  fetch: StageState
  fetch_error: string | null
  fetch_error_kind: 'config' | 'api' | null
  summary: StageState
  summary_error: string | null
  item_count: number
}

// Replace existing PipelineStatus with:
export interface PipelineStatus {
  running: boolean
  mode: RunMode
  concurrency: number
  started_at: string | null
  completed_at: string | null
  sensors: SensorJobProgress[]
  overall_summary: StageState
  total_items: number
}
```

Keep the old `SensorProgress` type around temporarily with a `@deprecated` JSDoc tag — the Status UI and collector tests still reference it. We'll migrate those in later tasks.

Add `pipeline_concurrency` to `ConfigSettings`:

```typescript
// Add to ConfigSettings interface:
pipeline_concurrency: number
```

Add default in `defaultConfig()`:

```typescript
pipeline_concurrency: 4,
```

**Step 2: Run ALL existing tests to make sure nothing breaks**

```bash
cd frontend && npx vitest run
```

The old `SensorProgress` type is kept so existing code still compiles. If any tests fail, fix the type references.

**Step 3: Commit**

```bash
git add frontend/src/lib/models.ts
git commit -m "feat(pipeline): add RunMode, StageState, SensorJobProgress types"
```

---

## Task 3: Progress Tracker (Observer Pattern)

A typed progress tracker that decouples state management from persistence. The orchestrator calls tracker methods; the tracker writes to SQLite.

**Files:**
- Create: `frontend/src/lib/pipeline/progress.ts`
- Test: `frontend/src/lib/pipeline/progress.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/pipeline/progress.test.ts`:

```typescript
// ABOUTME: Tests for PipelineProgressTracker — the observer that manages pipeline state.
// ABOUTME: Validates state transitions, event notifications, and snapshot generation.
import { describe, it, expect, vi } from 'vitest'
import { PipelineProgressTracker } from './progress'
import type { RunMode } from '../models'

describe('PipelineProgressTracker', () => {
  const sensors = ['hacker_news', 'arxiv', 'github']

  it('initializes all sensors with correct initial states for fetch_summarize', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4)
    const snap = tracker.snapshot()
    expect(snap.running).toBe(true)
    expect(snap.mode).toBe('fetch_summarize')
    expect(snap.concurrency).toBe(4)
    expect(snap.sensors).toHaveLength(3)
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('queued')
      expect(s.summary).toBe('queued')
    }
    expect(snap.overall_summary).toBe('queued')
  })

  it('initializes summary stages as skipped for fetch mode', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    const snap = tracker.snapshot()
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('queued')
      expect(s.summary).toBe('skipped')
    }
    expect(snap.overall_summary).toBe('skipped')
  })

  it('initializes fetch stages as skipped for summarize mode', () => {
    const tracker = new PipelineProgressTracker(sensors, 'summarize', 4)
    const snap = tracker.snapshot()
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('skipped')
      expect(s.summary).toBe('queued')
    }
    expect(snap.overall_summary).toBe('queued')
  })

  it('updates fetch stage state', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4)
    tracker.setFetchState('arxiv', 'running')
    expect(tracker.snapshot().sensors[1].fetch).toBe('running')

    tracker.setFetchState('arxiv', 'ok', 5)
    const snap = tracker.snapshot()
    expect(snap.sensors[1].fetch).toBe('ok')
    expect(snap.sensors[1].item_count).toBe(5)
  })

  it('updates summary stage state', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4)
    tracker.setSummaryState('arxiv', 'running')
    expect(tracker.snapshot().sensors[1].summary).toBe('running')

    tracker.setSummaryState('arxiv', 'ok')
    expect(tracker.snapshot().sensors[1].summary).toBe('ok')
  })

  it('tracks fetch errors with kind', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    tracker.setFetchState('github', 'failed', 0, 'No token', 'config')
    const s = tracker.snapshot().sensors[2]
    expect(s.fetch).toBe('failed')
    expect(s.fetch_error).toBe('No token')
    expect(s.fetch_error_kind).toBe('config')
  })

  it('calls onChange listener on state change', () => {
    const onChange = vi.fn()
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, onChange)
    tracker.setFetchState('hacker_news', 'running')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(tracker.snapshot())
  })

  it('computes total_items from ok sensors', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    tracker.setFetchState('hacker_news', 'ok', 10)
    tracker.setFetchState('arxiv', 'ok', 5)
    tracker.setFetchState('github', 'failed')
    expect(tracker.snapshot().total_items).toBe(15)
  })

  it('complete() sets running=false and completed_at', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    tracker.complete()
    const snap = tracker.snapshot()
    expect(snap.running).toBe(false)
    expect(snap.completed_at).toBeTruthy()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/lib/pipeline/progress.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the progress tracker**

Create `frontend/src/lib/pipeline/progress.ts`:

```typescript
// ABOUTME: Pipeline progress tracker — manages two-stage pipeline state via observer pattern.
// ABOUTME: Decouples state transitions from persistence; callers subscribe via onChange callback.
import type { PipelineStatus, SensorJobProgress, StageState, RunMode } from '../models'

type OnChangeCallback = (status: PipelineStatus) => void

/**
 * Manages pipeline execution state for all sensors across fetch and summary stages.
 * State changes are broadcast to an onChange listener (typically SQLite persistence).
 */
export class PipelineProgressTracker {
  private readonly sensors: SensorJobProgress[]
  private readonly mode: RunMode
  private readonly concurrency: number
  private readonly onChange?: OnChangeCallback
  private readonly startedAt: string
  private completedAt: string | null = null
  private running = true
  private overallSummary: StageState

  constructor(
    sensorNames: string[],
    mode: RunMode,
    concurrency: number,
    onChange?: OnChangeCallback,
  ) {
    this.mode = mode
    this.concurrency = concurrency
    this.onChange = onChange
    this.startedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

    const skipFetch = mode === 'summarize'
    const skipSummary = mode === 'fetch'

    this.sensors = sensorNames.map(name => ({
      name,
      fetch: skipFetch ? 'skipped' : 'queued',
      fetch_error: null,
      fetch_error_kind: null,
      summary: skipSummary ? 'skipped' : 'queued',
      summary_error: null,
      item_count: 0,
    }))

    this.overallSummary = skipSummary ? 'skipped' : 'queued'
  }

  private find(name: string): SensorJobProgress {
    const s = this.sensors.find(s => s.name === name)
    if (!s) throw new Error(`Unknown sensor: ${name}`)
    return s
  }

  private notify(): void {
    this.onChange?.(this.snapshot())
  }

  setFetchState(
    name: string,
    state: StageState,
    itemCount?: number,
    error?: string | null,
    errorKind?: 'config' | 'api' | null,
  ): void {
    const s = this.find(name)
    s.fetch = state
    if (itemCount !== undefined) s.item_count = itemCount
    if (error !== undefined) s.fetch_error = error
    if (errorKind !== undefined) s.fetch_error_kind = errorKind
    this.notify()
  }

  setSummaryState(
    name: string,
    state: StageState,
    error?: string | null,
  ): void {
    const s = this.find(name)
    s.summary = state
    if (error !== undefined) s.summary_error = error
    this.notify()
  }

  setOverallSummary(state: StageState): void {
    this.overallSummary = state
    this.notify()
  }

  complete(): void {
    this.running = false
    this.completedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    this.notify()
  }

  snapshot(): PipelineStatus {
    return {
      running: this.running,
      mode: this.mode,
      concurrency: this.concurrency,
      started_at: this.startedAt,
      completed_at: this.completedAt,
      sensors: this.sensors.map(s => ({ ...s })),
      overall_summary: this.overallSummary,
      total_items: this.sensors
        .filter(s => s.fetch === 'ok')
        .reduce((sum, s) => sum + s.item_count, 0),
    }
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/lib/pipeline/progress.test.ts
```

Expected: PASS (all tests).

**Step 5: Commit**

```bash
git add frontend/src/lib/pipeline/progress.ts frontend/src/lib/pipeline/progress.test.ts
git commit -m "feat(pipeline): add PipelineProgressTracker with observer pattern"
```

---

## Task 4: Pipeline Orchestrator

The core orchestrator that composes the semaphore, progress tracker, and per-sensor stages. Replaces the inline pipeline logic scattered across route handlers.

**Files:**
- Create: `frontend/src/lib/pipeline/orchestrator.ts`
- Test: `frontend/src/lib/pipeline/orchestrator.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/pipeline/orchestrator.test.ts`:

```typescript
// ABOUTME: Tests for the pipeline orchestrator — validates run modes, concurrency, and progress.
// ABOUTME: Uses mocked sensors and LLM to test fetch-only, summarize-only, and combined modes.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings, IntelItem, IntelReport } from '../models'
import { defaultConfig } from '../models'
import { SensorConfigError } from '../sensors/errors'

// Mock all external dependencies
const mockWriteReport = vi.fn()
const mockReadReport = vi.fn<() => Promise<IntelReport | null>>()
const mockWritePipelineStatus = vi.fn()
vi.mock('./cache', () => ({
  writeReport: (...args: unknown[]) => mockWriteReport(...args),
  readReport: (...args: unknown[]) => mockReadReport(...args),
  writePipelineStatus: (...args: unknown[]) => mockWritePipelineStatus(...args),
  readPipelineStatus: vi.fn(),
  isStale: vi.fn(),
}))

const mockWriteSummary = vi.fn()
const mockWriteSummaryProgress = vi.fn()
vi.mock('../summary/cache', () => ({
  writeSummary: (...args: unknown[]) => mockWriteSummary(...args),
  writeSummaryProgress: (...args: unknown[]) => mockWriteSummaryProgress(...args),
  readSummary: vi.fn(),
  readSummaryProgress: vi.fn(),
}))

const mockChatCompletion = vi.fn().mockResolvedValue('Summary text')
vi.mock('../summary/llm', () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
}))

const mockVerifyLink = vi.fn()
const mockFetchContent = vi.fn()
vi.mock('../utils/verifier', () => ({
  verifyLink: (...args: unknown[]) => mockVerifyLink(...args),
}))
vi.mock('../utils/jina-reader', () => ({
  fetchContent: (...args: unknown[]) => mockFetchContent(...args),
}))

// Mock sensor registry
const mockSensorFns: Record<string, ReturnType<typeof vi.fn>> = {}
vi.mock('../sensors', () => ({
  SENSOR_REGISTRY: new Proxy({}, {
    get: (_target, prop: string) => mockSensorFns[prop],
    ownKeys: () => Object.keys(mockSensorFns),
    getOwnPropertyDescriptor: (_target, prop: string) => {
      if (prop in mockSensorFns) {
        return { configurable: true, enumerable: true, value: mockSensorFns[prop] }
      }
      return undefined
    },
  }),
}))

const { runPipeline } = await import('./orchestrator')

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

function makeItem(id: string, source: string): IntelItem {
  return { id, source, title: `Item ${id}`, url: `https://example.com/${id}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(mockSensorFns)) delete mockSensorFns[key]
})

describe('runPipeline', () => {
  it('fetch mode: fetches sensors, builds report, skips summaries', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])
    mockSensorFns['arxiv'] = vi.fn().mockResolvedValue([makeItem('ax1', 'arxiv')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true, arxiv: true },
      pipeline_concurrency: 2,
    })

    const result = await runPipeline(config, 'fetch')
    expect(result.report).toBeDefined()
    expect(result.report!.sources_ok).toContain('hacker_news')
    expect(result.summary).toBeNull()
    expect(mockChatCompletion).not.toHaveBeenCalled()
  })

  it('summarize mode: skips fetching, summarizes cached report', async () => {
    const cachedReport: IntelReport = {
      date: '2026-02-20',
      fetched_at: '2026-02-20T08:00:00Z',
      stale: false,
      sources_ok: ['hacker_news'],
      sources_failed: [],
      items: {
        tech_trends: [makeItem('hn1', 'hacker_news')],
        research: [], capital_flow: [], products: [],
        community: [], social: [], insights: [], feeds: [],
      },
    }
    mockReadReport.mockResolvedValue(cachedReport)

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      pipeline_concurrency: 2,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'summarize')
    expect(result.report).toBeNull()
    expect(result.summary).toBeDefined()
    expect(mockSensorFns['hacker_news']).toBeUndefined() // no sensor was mocked = no fetch
    expect(mockChatCompletion).toHaveBeenCalled()
  })

  it('fetch_summarize mode: fetches then summarizes', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      pipeline_concurrency: 2,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report).toBeDefined()
    expect(result.summary).toBeDefined()
    expect(mockChatCompletion).toHaveBeenCalled()
  })

  it('respects concurrency limit', async () => {
    let active = 0
    let maxActive = 0

    const slowSensor = vi.fn().mockImplementation(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 30))
      active--
      return [makeItem('1', 'slow')]
    })

    mockSensorFns['s1'] = slowSensor
    mockSensorFns['s2'] = slowSensor
    mockSensorFns['s3'] = slowSensor
    mockSensorFns['s4'] = slowSensor
    mockSensorFns['s5'] = slowSensor

    const config = makeConfig({
      sensors_enabled: { s1: true, s2: true, s3: true, s4: true, s5: true },
      pipeline_concurrency: 2,
    })

    await runPipeline(config, 'fetch')
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('sensor failure does not block other sensors', async () => {
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])
    mockSensorFns['bad'] = vi.fn().mockRejectedValue(new Error('boom'))

    const config = makeConfig({
      sensors_enabled: { good: true, bad: true },
      pipeline_concurrency: 4,
    })

    const result = await runPipeline(config, 'fetch')
    expect(result.report!.sources_ok).toContain('good')
    expect(result.report!.sources_failed).toContain('bad')
  })

  it('SensorConfigError sets error_kind to config', async () => {
    mockSensorFns['broken'] = vi.fn().mockRejectedValue(
      new SensorConfigError('Missing API key'),
    )

    const config = makeConfig({
      sensors_enabled: { broken: true },
      pipeline_concurrency: 4,
    })

    const result = await runPipeline(config, 'fetch')
    // Check pipeline status was written with config error kind
    const lastStatus = mockWritePipelineStatus.mock.calls.at(-1)?.[0]
    const sensor = lastStatus?.sensors.find((s: { name: string }) => s.name === 'broken')
    expect(sensor?.fetch_error_kind).toBe('config')
  })

  it('writes pipeline status on progress changes', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      pipeline_concurrency: 4,
    })

    await runPipeline(config, 'fetch')
    // Should have been called multiple times: init, running, ok, complete
    expect(mockWritePipelineStatus.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/lib/pipeline/orchestrator.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the orchestrator**

Create `frontend/src/lib/pipeline/orchestrator.ts`:

```typescript
// ABOUTME: Pipeline orchestrator — coordinates sensor fetch+summarize jobs through a semaphore.
// ABOUTME: Supports three run modes via strategy pattern; emits progress via PipelineProgressTracker.
import type { ConfigSettings, IntelItem, IntelReport, SensorResult, SectionKey, BriefingSummary } from '../models'
import { createReport, sensorResultSucceeded, emptyItemsMap, sensorLimit } from '../models'
import { Semaphore } from './semaphore'
import { PipelineProgressTracker } from './progress'
import { SENSOR_REGISTRY } from '../sensors'
import { SensorConfigError } from '../sensors/errors'
import { dedupItems, dedupAcrossSections } from './dedup'
import { writeReport, readReport, writePipelineStatus } from './cache'
import { suppressItems, boostItems } from './keyword-filter'
import { verifyLink } from '../utils/verifier'
import { fetchContent } from '../utils/jina-reader'
import { decodeItemEntities } from '../utils/decode-entities'
import { chatCompletion, type LlmConfig, type ChatMessage } from '../summary/llm'
import { writeSummary } from '../summary/cache'
import type { RunMode } from '../models'

// Section routing: maps sensor_name to report section key
const SENSOR_SECTION_MAP: Record<string, SectionKey> = {
  hacker_news: 'tech_trends',
  github: 'tech_trends',
  arxiv: 'research',
  hn_blogs: 'insights',
  product_hunt: 'products',
  v2ex: 'community',
  sources_36kr: 'capital_flow',
  wallstreetcn: 'capital_flow',
  social_accounts: 'social',
  social_topics: 'social',
  social_trends: 'social',
  chrome_radar: 'products',
  rss_feeds: 'feeds',
}

const SENSOR_LABELS: Record<string, string> = {
  hacker_news: 'Hacker News',
  arxiv: 'ArXiv AI',
  github: 'GitHub Trending',
  product_hunt: 'Product Hunt',
  v2ex: 'V2EX',
  hn_blogs: 'HN Blogs',
  sources_36kr: '36Kr',
  wallstreetcn: 'WallStreetCN',
  social_accounts: 'Social Accounts',
  social_topics: 'Social Topics',
  social_trends: 'Social Trends',
  chrome_radar: 'Chrome Radar',
  rss_feeds: 'RSS Feeds',
}

const SUMMARY_SYSTEM = 'You are an intel analyst writing concise briefings. Summarize the key themes, notable items, and emerging trends. Be specific — cite names, numbers, and links where relevant. Keep each summary to 2-4 sentences.'
const OVERALL_SYSTEM = 'You are an intel analyst writing an executive briefing. Synthesize the per-source summaries into a coherent overview of the most important developments. Highlight cross-cutting themes. Keep it to 3-6 sentences.'

interface PipelineResult {
  report: IntelReport | null
  summary: BriefingSummary | null
}

interface SensorSummaryResult {
  sensor_name: string
  label: string
  summary: string
  item_count: number
}

/**
 * Fetch a single sensor's data. Returns a SensorResult (never throws).
 */
async function fetchSensor(
  name: string,
  config: ConfigSettings,
): Promise<SensorResult> {
  try {
    const fetchFn = SENSOR_REGISTRY[name]
    const limit = sensorLimit(config, name)
    const items = await fetchFn(config, limit)
    return { sensor_name: name, items, error: null, error_kind: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isConfig = err instanceof SensorConfigError
    return { sensor_name: name, items: [], error: message, error_kind: isConfig ? 'config' : 'api' }
  }
}

/**
 * Apply per-sensor lookback time filtering to a set of items.
 */
function applyLookback(items: IntelItem[], sensorName: string, config: ConfigSettings): IntelItem[] {
  const lookbackHours = config.sensor_lookback_hours?.[sensorName]
  if (!lookbackHours) return items
  const cutoffMs = Date.now() - lookbackHours * 60 * 60 * 1000
  const cutoffDayStr = new Date(cutoffMs).toISOString().slice(0, 10)
  return items.filter(item => {
    if (!item.published_at) return true
    if (item.published_at.length <= 10) return item.published_at >= cutoffDayStr
    const pubMs = new Date(item.published_at).getTime()
    return !isNaN(pubMs) && pubMs >= cutoffMs
  })
}

/**
 * Summarize a single sensor's items via LLM. Returns null on failure.
 */
async function summarizeSensor(
  sensorName: string,
  items: IntelItem[],
  llmConfig: LlmConfig,
): Promise<SensorSummaryResult | null> {
  if (items.length === 0) return null
  const label = SENSOR_LABELS[sensorName] ?? sensorName
  const itemsText = items.map(item => {
    const parts = [`- ${item.title}`]
    if (item.url) parts.push(`  URL: ${item.url}`)
    if (item.abstract) parts.push(`  Abstract: ${item.abstract.slice(0, 400)}`)
    if (item.content) parts.push(`  Content: ${item.content.slice(0, 500)}`)
    if (item.heat) parts.push(`  Heat: ${item.heat}`)
    if (item.account) parts.push(`  Account: ${item.account}`)
    return parts.join('\n')
  }).join('\n\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: `Summarize these ${items.length} items from ${label}:\n\n${itemsText}` },
  ]

  const summary = await chatCompletion(messages, llmConfig)
  return { sensor_name: sensorName, label, summary, item_count: items.length }
}

/**
 * Assemble a report from sensor results: dedup, filter, post-process, write to cache.
 */
async function assembleReport(
  results: SensorResult[],
  config: ConfigSettings,
): Promise<IntelReport> {
  const sections = emptyItemsMap()
  const sourcesOk: string[] = []
  const sourcesFailed: string[] = []

  for (const result of results) {
    if (sensorResultSucceeded(result)) {
      sourcesOk.push(result.sensor_name)
      const filtered = applyLookback(result.items, result.sensor_name, config)
      const section = SENSOR_SECTION_MAP[result.sensor_name] ?? 'tech_trends'
      sections[section].push(...filtered)
    } else {
      sourcesFailed.push(result.sensor_name)
    }
  }

  // Dedup within and across sections
  for (const key of Object.keys(sections) as SectionKey[]) {
    sections[key] = dedupItems(sections[key])
  }
  const dedupedSections = dedupAcrossSections(sections)

  // Decode HTML entities
  for (const key of Object.keys(dedupedSections) as SectionKey[]) {
    for (const item of dedupedSections[key]) {
      decodeItemEntities(item as Record<string, unknown>)
    }
  }

  // Keyword filtering
  for (const key of Object.keys(dedupedSections) as SectionKey[]) {
    dedupedSections[key] = suppressItems(dedupedSections[key], config.suppress_keywords ?? [])
    dedupedSections[key] = boostItems(dedupedSections[key], config.boost_keywords ?? [])
  }

  // Post-processing: verify links + enrich content
  const postTasks: Promise<void>[] = []
  for (const key of Object.keys(dedupedSections) as SectionKey[]) {
    for (const item of dedupedSections[key]) {
      if (item.source === 'x' && item.url) {
        postTasks.push(verifyLink(item.url).then(ok => { item.verified = ok }))
      }
      if (item.source === 'hn_blogs' && item.url) {
        postTasks.push(fetchContent(item.url).then(text => { if (text) item.content = text }))
      }
    }
  }
  await Promise.allSettled(postTasks)

  const now = new Date()
  const report = createReport({
    date: now.toISOString().slice(0, 10),
    fetched_at: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    stale: false,
    sources_ok: sourcesOk.sort(),
    sources_failed: sourcesFailed.sort(),
    items: dedupedSections as Record<SectionKey, IntelItem[]>,
  })

  try {
    await writeReport(report)
  } catch (err) {
    console.error('Failed to write cache:', err)
  }

  return report
}

/**
 * Run the full pipeline with the specified mode and concurrency.
 *
 * Modes:
 * - 'fetch': fetch all sensors → assemble report
 * - 'summarize': summarize existing cached report
 * - 'fetch_summarize': fetch all sensors → assemble report → summarize → overall summary
 */
export async function runPipeline(
  config: ConfigSettings,
  mode: RunMode,
): Promise<PipelineResult> {
  const concurrency = config.pipeline_concurrency ?? 4
  const sem = new Semaphore(concurrency)

  // Determine which sensors to work with
  const enabledSensors = Object.entries(SENSOR_REGISTRY)
    .filter(([name]) => config.sensors_enabled[name] !== false)
    .map(([name]) => name)

  // Create progress tracker with SQLite persistence
  const tracker = new PipelineProgressTracker(
    enabledSensors,
    mode,
    concurrency,
    (status) => { writePipelineStatus(status).catch(() => {}) },
  )
  // Write initial status
  await writePipelineStatus(tracker.snapshot()).catch(() => {})

  const llmConfig: LlmConfig | null = config.summary_provider ? {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_model,
  } : null

  let report: IntelReport | null = null
  let summary: BriefingSummary | null = null

  try {
    if (mode === 'summarize') {
      // Summarize-only: use cached report
      report = await readReport()
      if (!report) {
        tracker.complete()
        return { report: null, summary: null }
      }

      // Group items by source sensor
      const sensorItems = new Map<string, IntelItem[]>()
      for (const section of Object.values(report.items)) {
        for (const item of section) {
          const existing = sensorItems.get(item.source) ?? []
          existing.push(item)
          sensorItems.set(item.source, existing)
        }
      }

      // Per-sensor summaries through semaphore
      const sensorSummaries: SensorSummaryResult[] = []
      const summaryJobs = [...sensorItems.entries()].map(([sensorName, items]) =>
        sem.run(async () => {
          tracker.setSummaryState(sensorName, 'running')
          try {
            const result = await summarizeSensor(sensorName, items, llmConfig!)
            if (result) sensorSummaries.push(result)
            tracker.setSummaryState(sensorName, 'ok')
          } catch (err) {
            tracker.setSummaryState(sensorName, 'failed', (err as Error).message)
          }
        }),
      )
      await Promise.all(summaryJobs)

      // Overall summary
      tracker.setOverallSummary('running')
      const overallContext = sensorSummaries.length > 0
        ? sensorSummaries.map(s => `**${s.label}** (${s.item_count} items): ${s.summary}`).join('\n\n')
        : 'No data was collected in this run.'
      const overallMessages: ChatMessage[] = [
        { role: 'system', content: OVERALL_SYSTEM },
        { role: 'user', content: `Write an executive briefing based on these source summaries:\n\n${overallContext}` },
      ]
      const overall = await chatCompletion(overallMessages, llmConfig!)
      tracker.setOverallSummary('ok')

      summary = {
        generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        report_fetched_at: report.fetched_at,
        sections: sensorSummaries,
        overall,
      }
      await writeSummary(summary).catch(() => {})

    } else {
      // Fetch (or fetch+summarize): run sensor fetches through semaphore
      const results: SensorResult[] = []
      const sensorSummaries: SensorSummaryResult[] = []
      const includeSummary = mode === 'fetch_summarize' && llmConfig

      const fetchJobs = enabledSensors.map(sensorName =>
        sem.run(async () => {
          // Stage 1: Fetch
          tracker.setFetchState(sensorName, 'running')
          const result = await fetchSensor(sensorName, config)
          results.push(result)

          if (sensorResultSucceeded(result)) {
            tracker.setFetchState(sensorName, 'ok', result.items.length)

            // Stage 2: Summarize (if mode includes it)
            if (includeSummary && result.items.length > 0) {
              tracker.setSummaryState(sensorName, 'running')
              try {
                const summaryResult = await summarizeSensor(sensorName, result.items, llmConfig!)
                if (summaryResult) sensorSummaries.push(summaryResult)
                tracker.setSummaryState(sensorName, 'ok')
              } catch (err) {
                tracker.setSummaryState(sensorName, 'failed', (err as Error).message)
              }
            }
          } else {
            tracker.setFetchState(
              sensorName, 'failed', 0,
              result.error, result.error_kind ?? 'api',
            )
          }
        }),
      )
      await Promise.all(fetchJobs)

      // Assemble the report
      report = await assembleReport(results, config)

      // Overall summary (if mode includes it)
      if (includeSummary && sensorSummaries.length > 0) {
        tracker.setOverallSummary('running')
        const overallContext = sensorSummaries.map(s =>
          `**${s.label}** (${s.item_count} items): ${s.summary}`,
        ).join('\n\n')
        const overallMessages: ChatMessage[] = [
          { role: 'system', content: OVERALL_SYSTEM },
          { role: 'user', content: `Write an executive briefing based on these source summaries:\n\n${overallContext}` },
        ]
        try {
          const overall = await chatCompletion(overallMessages, llmConfig!)
          tracker.setOverallSummary('ok')
          summary = {
            generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
            report_fetched_at: report.fetched_at,
            sections: sensorSummaries,
            overall,
          }
          await writeSummary(summary).catch(() => {})
        } catch (err) {
          tracker.setOverallSummary('failed')
          console.error('Overall summary failed:', err)
        }
      }
    }
  } catch (err) {
    console.error('Pipeline failed:', err)
  } finally {
    tracker.complete()
  }

  return { report, summary }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/lib/pipeline/orchestrator.test.ts
```

Expected: PASS (all tests).

**Step 5: Run ALL tests to ensure nothing is broken**

```bash
cd frontend && npx vitest run
```

Fix any breakages.

**Step 6: Commit**

```bash
git add frontend/src/lib/pipeline/orchestrator.ts frontend/src/lib/pipeline/orchestrator.test.ts
git commit -m "feat(pipeline): add pipeline orchestrator with semaphore and strategy pattern"
```

---

## Task 5: Update API Routes

Modify the fetch trigger and status routes to use the new orchestrator. Update the cron route. Keep old summary routes for backwards compat.

**Files:**
- Modify: `frontend/src/app/api/fetch/route.ts`
- Modify: `frontend/src/app/api/fetch/status/route.ts`
- Modify: `frontend/src/app/api/cron/pipeline/route.ts`

**Step 1: Update POST /api/fetch to accept mode param**

Replace `frontend/src/app/api/fetch/route.ts` contents:

```typescript
// ABOUTME: Manual pipeline trigger — POST /api/fetch.
// ABOUTME: Accepts optional { mode } body; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline } from '@/lib/pipeline/orchestrator'
import type { RunMode } from '@/lib/models'

const VALID_MODES: RunMode[] = ['fetch', 'summarize', 'fetch_summarize']

export async function POST(request: NextRequest): Promise<NextResponse> {
  let mode: RunMode = 'fetch_summarize'

  try {
    const body = await request.json().catch(() => ({}))
    if (body.mode && VALID_MODES.includes(body.mode)) {
      mode = body.mode
    }
  } catch {
    // Use default mode
  }

  const config = await loadConfig()

  // Fire and forget — don't await
  runPipeline(config, mode)

  return NextResponse.json({ status: 'accepted', mode }, { status: 202 })
}
```

**Step 2: Update GET /api/fetch/status to return new PipelineStatus shape**

The status route reads from the same KV key. The orchestrator writes `PipelineStatus` (new shape) via the progress tracker. No changes needed to the status route — it already returns whatever is in the KV store. Just verify the types compile:

```typescript
// ABOUTME: Pipeline status route — GET /api/fetch/status.
// ABOUTME: Returns the live status of the current or most recent pipeline run from SQLite.
import { NextResponse } from 'next/server'
import { readPipelineStatus } from '@/lib/pipeline/cache'
import type { PipelineStatus } from '@/lib/models'

export async function GET(): Promise<NextResponse<PipelineStatus>> {
  const status = await readPipelineStatus()
  if (!status) {
    return NextResponse.json({
      running: false,
      mode: 'fetch_summarize',
      concurrency: 4,
      started_at: null,
      completed_at: null,
      sensors: [],
      overall_summary: 'skipped',
      total_items: 0,
    })
  }
  return NextResponse.json(status)
}
```

**Step 3: Update cron route to use orchestrator**

Replace the inline pipeline logic in `frontend/src/app/api/cron/pipeline/route.ts` with the orchestrator:

```typescript
// ABOUTME: Cron pipeline trigger — GET /api/cron/pipeline.
// ABOUTME: Protected by CRON_SECRET; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline } from '@/lib/pipeline/orchestrator'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }
  }

  const config = await loadConfig()

  try {
    const mode = config.summary_provider ? 'fetch_summarize' : 'fetch'
    const result = await runPipeline(config, mode as 'fetch' | 'fetch_summarize')

    return NextResponse.json({
      status: 'ok',
      mode,
      sources_ok: result.report?.sources_ok.length ?? 0,
      sources_failed: result.report?.sources_failed.length ?? 0,
      total_items: Object.values(result.report?.items ?? {}).flat().length,
      summarized: !!result.summary,
    })
  } catch (err) {
    return NextResponse.json(
      { detail: `Pipeline failed: ${err}` },
      { status: 500 },
    )
  }
}
```

**Step 4: Run all tests**

```bash
cd frontend && npx vitest run
```

Fix any breakages caused by the new `PipelineStatus` shape (tests that reference the old `SensorProgress` fields).

**Step 5: Commit**

```bash
git add frontend/src/app/api/fetch/route.ts frontend/src/app/api/fetch/status/route.ts frontend/src/app/api/cron/pipeline/route.ts
git commit -m "feat(pipeline): update API routes to use pipeline orchestrator"
```

---

## Task 6: Config & API Client Updates

Add `pipeline_concurrency` to the config system and update the API client types/methods.

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/lib/config/index.ts` (if env fallback needed)
- Modify: `frontend/src/components/Pipeline.tsx`

**Step 1: Update API client types**

In `frontend/src/api/client.ts`:

1. Add `RunMode` and `StageState` types
2. Replace `SensorProgress` with `SensorJobProgress`
3. Update `PipelineStatus` to match new shape
4. Add `pipeline_concurrency` to `ConfigSettings`
5. Update `triggerFetch` to accept optional `mode` param

```typescript
// Add new types:
export type RunMode = 'fetch' | 'summarize' | 'fetch_summarize'
export type StageState = 'queued' | 'running' | 'ok' | 'failed' | 'skipped'

export interface SensorJobProgress {
  name: string
  fetch: StageState
  fetch_error: string | null
  fetch_error_kind: 'config' | 'api' | null
  summary: StageState
  summary_error: string | null
  item_count: number
}

// Update PipelineStatus:
export interface PipelineStatus {
  running: boolean
  mode: RunMode
  concurrency: number
  started_at: string | null
  completed_at: string | null
  sensors: SensorJobProgress[]
  overall_summary: StageState
  total_items: number
}

// Add to ConfigSettings:
//   pipeline_concurrency: number

// Update triggerFetch:
triggerFetch: (mode?: RunMode) =>
  apiFetch<{ status: string; mode: string }>('/fetch', {
    method: 'POST',
    body: JSON.stringify({ mode: mode ?? 'fetch_summarize' }),
  }),
```

**Step 2: Add pipeline_concurrency to config loader**

In `frontend/src/lib/config/index.ts`, ensure `pipeline_concurrency` has a default and is included in the config loading. Check if it's already handled via the `defaultConfig()` merge.

**Step 3: Add concurrency slider to Pipeline settings**

In `frontend/src/components/Pipeline.tsx`, add a concurrency slider between the Schedule and Cache TTL sections:

- State: `const [concurrency, setConcurrency] = useState(4)`
- Load from config: `setConcurrency(cfg.pipeline_concurrency ?? 4)`
- Save: include `pipeline_concurrency: concurrency` in the update call
- UI: slider with range 1–13, styled like Cache TTL slider

```tsx
{/* Concurrency — add after Schedule section */}
<div>
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
      Concurrency
    </label>
    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
      {concurrency}
    </span>
  </div>
  <input
    type="range"
    min={1}
    max={13}
    value={concurrency}
    onChange={(e) => setConcurrency(Number(e.target.value))}
  />
  <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
    Maximum number of sensors fetching in parallel.
  </p>
</div>
```

**Step 4: Run tests**

```bash
cd frontend && npx vitest run
```

**Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/lib/config/index.ts frontend/src/components/Pipeline.tsx frontend/src/lib/models.ts
git commit -m "feat(pipeline): add concurrency setting and update API client types"
```

---

## Task 7: Status UI Redesign

Replace the single "Run Now" button with three mode buttons and update sensor progress display to show two stages (fetch + summary).

**Files:**
- Modify: `frontend/src/components/Status.tsx`
- Modify (or create): `frontend/src/components/Status.test.tsx`

**Step 1: Update Status.tsx run controls**

Replace the single `handleRunNow` and "Run Now" button with three buttons:

```typescript
const handleRun = async (mode: RunMode) => {
  setFetching(true)
  try {
    await api.triggerFetch(mode)
    setRunning(true)
    const labels = { fetch: 'Fetch', summarize: 'Summarize', fetch_summarize: 'Fetch + Summarize' }
    showToast(`${labels[mode]} triggered — results will appear shortly`)
  } catch (e) {
    showToast('Trigger failed: ' + (e as Error).message)
  } finally {
    setFetching(false)
  }
}
```

Replace the single button with a button group:

```tsx
<div style={{ display: 'flex', gap: '0.5rem' }}>
  <button onClick={() => handleRun('fetch')} disabled={fetching || isRunning}>
    Fetch
  </button>
  <button onClick={() => handleRun('summarize')} disabled={fetching || isRunning || !report}>
    Summarize
  </button>
  <button onClick={() => handleRun('fetch_summarize')} disabled={fetching || isRunning}>
    Fetch + Summarize
  </button>
</div>
```

Style all three buttons with the same base style as the current "Run Now" button. The Summarize button is also disabled when there's no cached report.

**Step 2: Update sensor progress to show two stages**

Replace the sensor row rendering with two-stage badges. Each sensor row now shows:

```
[sensor label]    [Fetch: badge]  [Summary: badge]  [item count]
```

Badge states map to visual styles:
- `queued`: gray, "Queued"
- `running`: pulsing blue dot
- `ok`: green dot
- `failed`: red dot (click to see error)
- `skipped`: gray dash

Use the new `SensorJobProgress` type from the API client. The `pipelineStatus.sensors` array now has `fetch` and `summary` fields instead of a single `state` field.

**Step 3: Add overall summary row**

After all sensor rows, add a special row for the overall executive summary:

```tsx
{/* Overall Summary — only when mode includes summarize */}
{pipelineStatus && pipelineStatus.mode !== 'fetch' && (
  <div style={{ /* row styling */ }}>
    <span>Overall Summary</span>
    <StageBadge state={pipelineStatus.overall_summary} />
  </div>
)}
```

**Step 4: Update progress bar calculation**

The progress bar should count completed stages, not just sensors:

```typescript
// Compute progress based on mode
const totalStages = (() => {
  if (!pipelineStatus) return 0
  const sensorCount = pipelineStatus.sensors.length
  switch (pipelineStatus.mode) {
    case 'fetch': return sensorCount
    case 'summarize': return sensorCount + 1 // +1 for overall
    case 'fetch_summarize': return sensorCount * 2 + 1 // fetch + summary per sensor + overall
  }
})()

const doneStages = (() => {
  if (!pipelineStatus) return 0
  let done = 0
  for (const s of pipelineStatus.sensors) {
    if (s.fetch === 'ok' || s.fetch === 'failed' || s.fetch === 'skipped') done++
    if (s.summary === 'ok' || s.summary === 'failed' || s.summary === 'skipped') done++
  }
  if (pipelineStatus.overall_summary === 'ok' || pipelineStatus.overall_summary === 'failed' || pipelineStatus.overall_summary === 'skipped') done++
  return done
})()
```

**Step 5: Remove separate summary progress polling**

The summary progress is now part of `PipelineStatus`. Remove the separate `useEffect` that polls `/summary/status` and the `isSummarizing` derived state. The hero banner "Summarizing" state can be derived from `pipelineStatus.mode` and the current stage states.

**Step 6: Update hero banner text**

```typescript
// Derive hero state from pipelineStatus
const heroState = (() => {
  if (!isRunning) return 'idle'
  if (!pipelineStatus) return 'running'
  const anySummaryRunning = pipelineStatus.sensors.some(s => s.summary === 'running')
    || pipelineStatus.overall_summary === 'running'
  const anyFetchRunning = pipelineStatus.sensors.some(s => s.fetch === 'running')
  if (anySummaryRunning) return 'summarizing'
  if (anyFetchRunning) return 'fetching'
  return 'running'
})()
```

**Step 7: Run all tests**

```bash
cd frontend && npx vitest run
```

Fix any test failures due to changed Status component behavior.

**Step 8: Commit**

```bash
git add frontend/src/components/Status.tsx
git commit -m "feat(pipeline): redesign Status UI with three run modes and two-stage progress"
```

---

## Task 8: Cleanup & Test Migration

Remove deprecated code, update existing tests, and add integration tests for the new pipeline flow.

**Files:**
- Modify: `frontend/src/lib/pipeline/collector.test.ts` — update to work with refactored code (if collector.ts is still used)
- Modify: `frontend/src/lib/models.ts` — remove deprecated `SensorProgress` type if no longer needed
- Modify: `frontend/src/components/Briefing.test.tsx` — update if Status changes affect Briefing tests
- Delete (if safe): `frontend/src/app/api/summary/trigger/route.ts` — functionality moved to orchestrator

**Step 1: Audit remaining references to old SensorProgress type**

Search for `SensorProgress` across the codebase. Replace remaining references with `SensorJobProgress`. Remove the deprecated type once no code references it.

**Step 2: Verify collector.ts is still needed**

The orchestrator handles fetching directly via `fetchSensor()`, so `collector.ts` may now be dead code. If nothing imports `collect()` anymore, delete `collector.ts` and its test. If the cron route or other code still references it, keep it but mark as deprecated.

**Step 3: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: ALL tests pass, no regressions.

**Step 4: Commit cleanup**

```bash
git add -A
git commit -m "refactor(pipeline): remove deprecated types and dead code"
```

---

## Verification Checklist

After all tasks are complete:

1. `cd frontend && npx vitest run` — all tests pass
2. Start dev server, navigate to Status page:
   - Three buttons visible: Fetch, Summarize, Fetch + Summarize
   - Summarize button disabled when no cached report
   - Click "Fetch" → sensors show two-stage progress (fetch runs, summary shows "—")
   - Click "Fetch + Summarize" → sensors show fetch then summary progress
   - Click "Summarize" → sensors show summary-only progress
   - Progress bar tracks completed stages
   - Overall Summary row appears at bottom for summary modes
3. Navigate to Pipeline settings:
   - Concurrency slider visible (1–13 range, default 4)
   - Saves and loads correctly
4. Console errors section works with new error format (fetch_error, summary_error)
