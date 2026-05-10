# LLM Summarization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered per-sensor + overall summarization of intel feeds, configurable via Settings, displayed on the Status page, cached in SQLite, and triggerable via Claude Code skill or post-fetch hook.

**Architecture:** Shared `lib/summary/` module with an OpenAI-compatible LLM client and a summarizer orchestrator. Two trigger paths: automatic (post-fetch hook when provider configured) and manual (Claude Code skill `/summarize-for-intel-brief`). Results cached in SQLite KV as `intel:summary` and served via `GET /api/summary`.

**Tech Stack:** TypeScript, Next.js 15 App Router, SQLite (@libsql/client), OpenAI-compatible REST API, vitest

---

## Existing Codebase Context

**Key files you'll work with:**
- `src/lib/models.ts` — shared types: `IntelItem`, `IntelReport`, `ConfigSettings`, `defaultConfig()`
- `src/lib/db.ts` — SQLite KV adapter: `kvSet(key, value, ttl)`, `kvGet<T>(key)`
- `src/lib/pipeline/cache.ts` — report/status cache functions using the KV adapter
- `src/lib/config/index.ts` — `loadConfig()`, `saveConfig()`, `maskConfig()` with `KEY_FIELDS` set for masking
- `src/api/client.ts` — client-side API wrapper with typed interfaces (separate from `lib/models.ts`)
- `src/app/api/fetch/route.ts` — manual fetch trigger (fire-and-forget `collect()`)
- `src/app/api/cron/pipeline/route.ts` — cron fetch trigger (awaits `collect()`)
- `src/components/Status.tsx` — Status dashboard (hero banner, 3 stat cards, section grid)
- `src/components/Settings.tsx` — config UI (4 cards: Sources, Schedule, Filters, Save)

**Conventions:**
- All code files start with 2-line `// ABOUTME:` comment
- Page components use `'use client'`
- CSS uses inline styles with CSS custom properties (`--ink`, `--accent`, `--border`, etc.)
- Tests use vitest: `cd frontend && npx vitest run`
- Config API keys are masked with `***` in GET responses via `maskConfig()`

---

### Task 1: Add BriefingSummary Type and Config Fields

**Files:**
- Modify: `src/lib/models.ts:125-220` (ConfigSettings + defaultConfig)
- Modify: `src/api/client.ts:9-35` (client-side ConfigSettings)
- Modify: `src/lib/config/index.ts:21` (KEY_FIELDS for masking)
- Test: `src/lib/models.test.ts`

**Step 1: Write the failing test**

Add a test to `src/lib/models.test.ts`:

```typescript
it('defaultConfig includes summary fields', () => {
  const cfg = defaultConfig()
  expect(cfg.summary_provider).toBeNull()
  expect(cfg.summary_api_key).toBeNull()
  expect(cfg.summary_base_url).toBe('https://openrouter.ai/api/v1')
  expect(cfg.summary_model).toBe('anthropic/claude-sonnet-4')
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/models.test.ts`
Expected: FAIL — `summary_provider` does not exist on ConfigSettings

**Step 3: Implement the types and config fields**

In `src/lib/models.ts`, add to `ConfigSettings` interface (after `post_expiry_days`):

```typescript
  // AI summary — LLM provider config
  summary_provider: 'openrouter' | 'custom' | null
  summary_api_key: string | null
  summary_base_url: string
  summary_model: string
```

Add to `defaultConfig()` return object:

```typescript
    summary_provider: null,
    summary_api_key: null,
    summary_base_url: 'https://openrouter.ai/api/v1',
    summary_model: 'anthropic/claude-sonnet-4',
```

Add the `BriefingSummary` interface (after `PipelineStatus`):

```typescript
export interface SensorSummary {
  sensor_name: string
  label: string
  summary: string
  item_count: number
}

export interface BriefingSummary {
  generated_at: string
  report_fetched_at: string
  sections: SensorSummary[]
  overall: string
}
```

In `src/api/client.ts`, add the same 4 fields to the client-side `ConfigSettings` interface, and add:

```typescript
export interface BriefingSummary {
  generated_at: string
  report_fetched_at: string
  sections: {
    sensor_name: string
    label: string
    summary: string
    item_count: number
  }[]
  overall: string
}
```

In `src/lib/config/index.ts`, add `'summary_api_key'` to the `KEY_FIELDS` set on line 21:

```typescript
const KEY_FIELDS = new Set(['xai_api_key', 'github_token', 'producthunt_token', 'bluesky_app_password', 'mastodon_token', 'summary_api_key'])
```

Also add env var fallback in `applyEnvFallback()`:

```typescript
    summary_api_key: config.summary_api_key ?? process.env.SUMMARY_API_KEY ?? null,
    summary_base_url: config.summary_base_url || process.env.SUMMARY_BASE_URL || 'https://openrouter.ai/api/v1',
    summary_model: config.summary_model || process.env.SUMMARY_MODEL || 'anthropic/claude-sonnet-4',
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/models.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/models.ts src/api/client.ts src/lib/config/index.ts src/lib/models.test.ts
git commit -m "feat(summary): add BriefingSummary type and config fields"
```

---

### Task 2: LLM Client

**Files:**
- Create: `src/lib/summary/llm.ts`
- Create: `src/lib/summary/llm.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/summary/llm.test.ts`:

```typescript
// ABOUTME: Tests for the OpenAI-compatible LLM chat completion client.
// ABOUTME: Validates request building, response parsing, and error handling.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatCompletion, type LlmConfig } from './llm'

const CONFIG: LlmConfig = {
  base_url: 'https://openrouter.ai/api/v1',
  api_key: 'test-key',
  model: 'anthropic/claude-sonnet-4',
}

describe('chatCompletion', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends correct request format and returns content', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello from LLM' } }],
    }), { status: 200 }))

    const result = await chatCompletion(
      [{ role: 'user', content: 'Say hello' }],
      CONFIG,
    )

    expect(result).toBe('Hello from LLM')
    expect(fetchSpy).toHaveBeenCalledOnce()

    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(opts!.body as string)
    expect(body.model).toBe('anthropic/claude-sonnet-4')
    expect(body.messages).toEqual([{ role: 'user', content: 'Say hello' }])
    expect((opts!.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key')
  })

  it('works without api_key (local LLM)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'Local response' } }],
    }), { status: 200 }))

    const localConfig: LlmConfig = { base_url: 'http://localhost:11434/v1', api_key: null, model: 'llama3' }
    const result = await chatCompletion([{ role: 'user', content: 'Hi' }], localConfig)

    expect(result).toBe('Local response')
    const [, opts] = fetchSpy.mock.calls[0]
    expect((opts!.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }], CONFIG),
    ).rejects.toThrow('LLM request failed: 401')
  })

  it('throws on malformed response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }], CONFIG),
    ).rejects.toThrow('No content in LLM response')
  })

  it('strips trailing base_url slash', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
    }), { status: 200 }))

    const cfg: LlmConfig = { ...CONFIG, base_url: 'https://example.com/v1/' }
    await chatCompletion([{ role: 'user', content: 'Hi' }], cfg)

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://example.com/v1/chat/completions')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/summary/llm.test.ts`
Expected: FAIL — module `./llm` not found

**Step 3: Implement the LLM client**

Create `src/lib/summary/llm.ts`:

```typescript
// ABOUTME: Thin OpenAI-compatible chat completion client for LLM summarization.
// ABOUTME: Works with OpenRouter, Ollama, LM Studio, vLLM, and any OpenAI-compatible endpoint.

export interface LlmConfig {
  base_url: string
  api_key: string | null
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices: { message: { content: string } }[]
}

const TIMEOUT_MS = 60_000

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * Returns the assistant's message content as a string.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  config: LlmConfig,
): Promise<string> {
  const baseUrl = config.base_url.replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.api_key) {
    headers['Authorization'] = `Bearer ${config.api_key}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM request failed: ${res.status} ${text}`.trim())
  }

  const data: ChatCompletionResponse = await res.json()

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No content in LLM response')
  }

  return content
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/summary/llm.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/lib/summary/llm.ts src/lib/summary/llm.test.ts
git commit -m "feat(summary): add OpenAI-compatible LLM chat completion client"
```

---

### Task 3: Summary Cache

**Files:**
- Create: `src/lib/summary/cache.ts`
- Create: `src/lib/summary/cache.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/summary/cache.test.ts`:

```typescript
// ABOUTME: Tests for the summary cache — read/write BriefingSummary to SQLite KV.
// ABOUTME: Uses in-memory SQLite for isolation.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '../db'
import { writeSummary, readSummary } from './cache'
import type { BriefingSummary } from '../models'

const SAMPLE: BriefingSummary = {
  generated_at: '2026-02-19T10:00:00Z',
  report_fetched_at: '2026-02-19T09:00:00Z',
  sections: [
    { sensor_name: 'hacker_news', label: 'Hacker News', summary: 'Top stories about AI.', item_count: 10 },
  ],
  overall: 'Tech world focused on AI breakthroughs today.',
}

describe('summary cache', () => {
  beforeAll(async () => {
    await initDb(':memory:')
  })

  it('returns null when no summary cached', async () => {
    expect(await readSummary()).toBeNull()
  })

  it('writes and reads a summary', async () => {
    await writeSummary(SAMPLE)
    const result = await readSummary()
    expect(result).toEqual(SAMPLE)
  })

  it('overwrites previous summary', async () => {
    const updated = { ...SAMPLE, overall: 'Updated briefing.' }
    await writeSummary(updated)
    const result = await readSummary()
    expect(result!.overall).toBe('Updated briefing.')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/summary/cache.test.ts`
Expected: FAIL — module `./cache` not found

**Step 3: Implement the cache**

Create `src/lib/summary/cache.ts`:

```typescript
// ABOUTME: SQLite-backed cache for BriefingSummary.
// ABOUTME: Uses the kv adapter from db.ts, keyed as 'intel:summary'.
import { kvSet, kvGet } from '../db'
import type { BriefingSummary } from '../models'

const SUMMARY_KEY = 'intel:summary'
const SUMMARY_TTL_SECONDS = 48 * 60 * 60 // 48 hours

/** Write a BriefingSummary to the database with a 48-hour TTL. */
export async function writeSummary(summary: BriefingSummary): Promise<void> {
  await kvSet(SUMMARY_KEY, summary, SUMMARY_TTL_SECONDS)
}

/** Read a cached BriefingSummary. Returns null if missing or expired. */
export async function readSummary(): Promise<BriefingSummary | null> {
  try {
    const data = await kvGet<BriefingSummary>(SUMMARY_KEY)
    return data ?? null
  } catch {
    return null
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/summary/cache.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/summary/cache.ts src/lib/summary/cache.test.ts
git commit -m "feat(summary): add SQLite-backed summary cache"
```

---

### Task 4: Summarizer Orchestrator

**Files:**
- Create: `src/lib/summary/summarizer.ts`
- Create: `src/lib/summary/summarizer.test.ts`

This is the core orchestrator. It takes an IntelReport and LLM config, produces per-sensor summaries sequentially, then an overall briefing.

**Step 1: Write the failing tests**

Create `src/lib/summary/summarizer.test.ts`:

```typescript
// ABOUTME: Tests for the summarizer orchestrator.
// ABOUTME: Validates prompt construction, sequential LLM calls, and BriefingSummary output shape.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { summarizeReport } from './summarizer'
import * as llm from './llm'
import type { IntelReport } from '../models'
import { createReport } from '../models'

// Sensor label map used by summarizer
const SENSOR_LABELS: Record<string, string> = {
  hacker_news: 'Hacker News',
  arxiv: 'ArXiv AI',
  github: 'GitHub Trending',
}

function makeReport(overrides?: Partial<IntelReport>): IntelReport {
  return createReport({
    date: '2026-02-19',
    fetched_at: '2026-02-19T09:00:00Z',
    sources_ok: ['hacker_news', 'arxiv'],
    items: {
      tech_trends: [
        { id: 'hn-1', source: 'hacker_news', title: 'AI breakthrough', url: 'https://example.com/1' },
        { id: 'hn-2', source: 'hacker_news', title: 'Rust 2.0 released', url: 'https://example.com/2' },
      ],
      research: [
        { id: 'ax-1', source: 'arxiv', title: 'Attention is still all you need', url: 'https://arxiv.org/1', abstract: 'We prove...' },
      ],
      capital_flow: [],
      products: [],
      community: [],
      social: [],
      insights: [],
    },
    ...overrides,
  })
}

describe('summarizeReport', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('produces per-sensor summaries and overall briefing', async () => {
    const calls: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      const userMsg = messages.find(m => m.role === 'user')!.content
      if (userMsg.includes('Hacker News')) {
        calls.push('hacker_news')
        return 'HN summary here'
      }
      if (userMsg.includes('ArXiv')) {
        calls.push('arxiv')
        return 'ArXiv summary here'
      }
      calls.push('overall')
      return 'Overall briefing'
    })

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    const result = await summarizeReport(makeReport(), config)

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].sensor_name).toBe('hacker_news')
    expect(result.sections[0].summary).toBe('HN summary here')
    expect(result.sections[0].item_count).toBe(2)
    expect(result.sections[1].sensor_name).toBe('arxiv')
    expect(result.sections[1].summary).toBe('ArXiv summary here')
    expect(result.overall).toBe('Overall briefing')
    expect(result.report_fetched_at).toBe('2026-02-19T09:00:00Z')
    // Verify sequential order
    expect(calls).toEqual(['hacker_news', 'arxiv', 'overall'])
  })

  it('skips sensors with no items', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary')

    const report = makeReport({
      sources_ok: ['hacker_news'],
      items: {
        tech_trends: [
          { id: 'hn-1', source: 'hacker_news', title: 'Story', url: 'https://example.com/1' },
        ],
        research: [],
        capital_flow: [],
        products: [],
        community: [],
        social: [],
        insights: [],
      },
    })

    const config = { base_url: 'http://localhost:11434/v1', api_key: null, model: 'llama3' }
    const result = await summarizeReport(report, config)

    // Only hacker_news + overall = 2 calls
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2)
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].sensor_name).toBe('hacker_news')
  })

  it('returns empty summary for report with no items at all', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Nothing to report')

    const report = makeReport({
      sources_ok: [],
      items: {
        tech_trends: [],
        research: [],
        capital_flow: [],
        products: [],
        community: [],
        social: [],
        insights: [],
      },
    })

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    const result = await summarizeReport(report, config)

    expect(result.sections).toHaveLength(0)
    // Still gets one overall call
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1)
    expect(result.overall).toBe('Nothing to report')
  })

  it('includes item details in the per-sensor prompt', async () => {
    const promptCapture: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      promptCapture.push(messages.find(m => m.role === 'user')!.content)
      return 'Summary'
    })

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    await summarizeReport(makeReport(), config)

    // First prompt should contain the HN item titles
    expect(promptCapture[0]).toContain('AI breakthrough')
    expect(promptCapture[0]).toContain('Rust 2.0 released')
    // Second prompt should contain the ArXiv abstract
    expect(promptCapture[1]).toContain('Attention is still all you need')
    expect(promptCapture[1]).toContain('We prove...')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/summary/summarizer.test.ts`
Expected: FAIL — module `./summarizer` not found

**Step 3: Implement the summarizer**

Create `src/lib/summary/summarizer.ts`:

```typescript
// ABOUTME: Summarizer orchestrator — produces per-sensor summaries and an overall briefing.
// ABOUTME: Takes an IntelReport and LLM config, calls LLM sequentially for each sensor.
import { chatCompletion, type LlmConfig, type ChatMessage } from './llm'
import type { IntelReport, IntelItem, BriefingSummary, SensorSummary, SectionKey } from '../models'

/** Human-readable sensor labels for prompts and output. */
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

const SYSTEM_PROMPT = `You are an intel analyst writing concise briefings. Summarize the key themes, notable items, and emerging trends. Be specific — cite names, numbers, and links where relevant. Keep each summary to 2-4 sentences.`

const OVERALL_SYSTEM_PROMPT = `You are an intel analyst writing an executive briefing. Synthesize the per-source summaries into a coherent overview of the most important developments. Highlight cross-cutting themes. Keep it to 3-6 sentences.`

/** Format an IntelItem into a text block for the LLM prompt. */
function formatItem(item: IntelItem): string {
  const parts = [`- ${item.title}`]
  if (item.url) parts.push(`  URL: ${item.url}`)
  if (item.abstract) parts.push(`  Abstract: ${item.abstract.slice(0, 400)}`)
  if (item.content) parts.push(`  Content: ${item.content.slice(0, 500)}`)
  if (item.heat) parts.push(`  Heat: ${item.heat}`)
  if (item.account) parts.push(`  Account: ${item.account}`)
  return parts.join('\n')
}

/** Group all report items by their source sensor. */
function groupBySensor(report: IntelReport): Map<string, IntelItem[]> {
  const groups = new Map<string, IntelItem[]>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      const existing = groups.get(item.source) ?? []
      existing.push(item)
      groups.set(item.source, existing)
    }
  }
  return groups
}

/**
 * Summarize an IntelReport by calling the LLM for each sensor, then once for the overall briefing.
 * Calls are sequential to respect rate limits.
 */
export async function summarizeReport(
  report: IntelReport,
  llmConfig: LlmConfig,
): Promise<BriefingSummary> {
  const sensorGroups = groupBySensor(report)
  const sections: SensorSummary[] = []

  // Per-sensor summaries (sequential)
  for (const [sensorName, items] of sensorGroups) {
    if (items.length === 0) continue

    const label = SENSOR_LABELS[sensorName] ?? sensorName
    const itemsText = items.map(formatItem).join('\n\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Summarize these ${items.length} items from ${label}:\n\n${itemsText}` },
    ]

    const summary = await chatCompletion(messages, llmConfig)
    sections.push({ sensor_name: sensorName, label, summary, item_count: items.length })
  }

  // Overall briefing
  const overallContext = sections.length > 0
    ? sections.map(s => `**${s.label}** (${s.item_count} items): ${s.summary}`).join('\n\n')
    : 'No data was collected in this run.'

  const overallMessages: ChatMessage[] = [
    { role: 'system', content: OVERALL_SYSTEM_PROMPT },
    { role: 'user', content: `Write an executive briefing based on these source summaries:\n\n${overallContext}` },
  ]

  const overall = await chatCompletion(overallMessages, llmConfig)

  return {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    report_fetched_at: report.fetched_at,
    sections,
    overall,
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/summary/summarizer.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lib/summary/summarizer.ts src/lib/summary/summarizer.test.ts
git commit -m "feat(summary): add summarizer orchestrator with per-sensor + overall LLM calls"
```

---

### Task 5: Summary API Endpoints

**Files:**
- Create: `src/app/api/summary/route.ts`
- Create: `src/lib/summary/route.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/summary/route.test.ts` (testing the handler logic):

```typescript
// ABOUTME: Tests for the /api/summary API route handlers.
// ABOUTME: Validates GET returns cached summary and POST writes to cache.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { initDb } from '../db'
import { writeSummary, readSummary } from './cache'
import type { BriefingSummary } from '../models'

const SAMPLE: BriefingSummary = {
  generated_at: '2026-02-19T10:00:00Z',
  report_fetched_at: '2026-02-19T09:00:00Z',
  sections: [
    { sensor_name: 'hacker_news', label: 'Hacker News', summary: 'AI news dominated.', item_count: 10 },
  ],
  overall: 'AI continues to dominate tech news.',
}

describe('/api/summary route logic', () => {
  beforeAll(async () => {
    await initDb(':memory:')
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('GET returns null when no summary cached', async () => {
    const result = await readSummary()
    expect(result).toBeNull()
  })

  it('POST writes summary and GET reads it back', async () => {
    await writeSummary(SAMPLE)
    const result = await readSummary()
    expect(result).toEqual(SAMPLE)
    expect(result!.overall).toBe('AI continues to dominate tech news.')
  })

  it('validates BriefingSummary has required fields', () => {
    expect(SAMPLE.generated_at).toBeDefined()
    expect(SAMPLE.report_fetched_at).toBeDefined()
    expect(SAMPLE.sections).toBeInstanceOf(Array)
    expect(typeof SAMPLE.overall).toBe('string')
  })
})
```

**Step 2: Run test to verify it fails (or passes — these test cache)**

Run: `npx vitest run src/lib/summary/route.test.ts`
Expected: Should pass if Task 3 cache is done. If not, FAIL.

**Step 3: Implement the API route**

Create `src/app/api/summary/route.ts`:

```typescript
// ABOUTME: Summary API — GET returns cached AI briefing, POST writes a new one.
// ABOUTME: GET is used by the Status page; POST is used by the Claude Code skill.
import { NextRequest, NextResponse } from 'next/server'
import { readSummary, writeSummary } from '@/lib/summary/cache'
import type { BriefingSummary } from '@/lib/models'

export async function GET(): Promise<NextResponse> {
  const summary = await readSummary()
  return NextResponse.json({ summary })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: BriefingSummary = await request.json()

    // Basic validation
    if (!body.generated_at || !body.report_fetched_at || !body.overall || !Array.isArray(body.sections)) {
      return NextResponse.json(
        { detail: 'Invalid BriefingSummary: missing required fields' },
        { status: 400 },
      )
    }

    await writeSummary(body)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { detail: 'Invalid request body' },
      { status: 400 },
    )
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/summary/route.test.ts`
Expected: PASS

Also add `getSummary` to `src/api/client.ts`:

```typescript
  getSummary: () =>
    apiFetch<{ summary: BriefingSummary | null }>('/summary'),
```

**Step 5: Commit**

```bash
git add src/app/api/summary/route.ts src/lib/summary/route.test.ts src/api/client.ts
git commit -m "feat(summary): add GET/POST /api/summary endpoints"
```

---

### Task 6: Post-Fetch Summarization Hook

**Files:**
- Modify: `src/app/api/fetch/route.ts:55-70` (after collect in runPipeline)
- Modify: `src/app/api/cron/pipeline/route.ts:60-67` (after collect succeeds)

**Step 1: Write the failing test**

Add a test to `src/lib/summary/summarizer.test.ts`:

```typescript
it('summarizeReport throws on LLM failure and caller can catch', async () => {
  vi.spyOn(llm, 'chatCompletion').mockRejectedValue(new Error('LLM timeout'))

  const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
  await expect(summarizeReport(makeReport(), config)).rejects.toThrow('LLM timeout')
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/summary/summarizer.test.ts`
Expected: PASS (error propagation is natural)

**Step 3: Add the post-fetch hook**

In `src/app/api/fetch/route.ts`, add after the `collect()` call inside `runPipeline()` (after the try block, before the finally):

```typescript
import { loadConfig } from '@/lib/config'
import { summarizeReport } from '@/lib/summary/summarizer'
import { writeSummary } from '@/lib/summary/cache'
import { readReport } from '@/lib/pipeline/cache'
```

Inside the try block of `runPipeline()`, after `await collect(config, onProgress)`:

```typescript
      // Auto-summarize if LLM provider is configured
      if (config.summary_provider) {
        const report = await readReport()
        if (report) {
          try {
            const summary = await summarizeReport(report, {
              base_url: config.summary_base_url,
              api_key: config.summary_api_key,
              model: config.summary_model,
            })
            await writeSummary(summary)
          } catch (err) {
            console.error('Auto-summarization failed:', err)
          }
        }
      }
```

In `src/app/api/cron/pipeline/route.ts`, add the same hook after `const report = await collect(config, onProgress)`:

```typescript
import { summarizeReport } from '@/lib/summary/summarizer'
import { writeSummary } from '@/lib/summary/cache'
```

After the existing status update and before the return:

```typescript
    // Auto-summarize if LLM provider is configured
    if (config.summary_provider) {
      try {
        const summary = await summarizeReport(report, {
          base_url: config.summary_base_url,
          api_key: config.summary_api_key,
          model: config.summary_model,
        })
        await writeSummary(summary)
      } catch (err) {
        console.error('Auto-summarization failed:', err)
      }
    }
```

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/app/api/fetch/route.ts src/app/api/cron/pipeline/route.ts src/lib/summary/summarizer.test.ts
git commit -m "feat(summary): add post-fetch auto-summarization hook"
```

---

### Task 7: Settings Page — AI Summary Card

**Files:**
- Modify: `src/components/Settings.tsx`
- Modify: `src/api/client.ts` (already has ConfigSettings — just verify fields present)

**Step 1: Add state variables for the new config fields**

In Settings.tsx, add state after the existing filter state variables (around line 258):

```typescript
  // AI Summary state
  const [summaryProvider, setSummaryProvider] = useState<'openrouter' | 'custom' | null>(null)
  const [summaryApiKey, setSummaryApiKey] = useState('')
  const [summaryBaseUrl, setSummaryBaseUrl] = useState('https://openrouter.ai/api/v1')
  const [summaryModel, setSummaryModel] = useState('anthropic/claude-sonnet-4')
```

**Step 2: Load config values on mount**

In the existing `useEffect` that calls `api.getConfig()`, add after the existing setters:

```typescript
      setSummaryProvider(cfg.summary_provider ?? null)
      setSummaryApiKey(cfg.summary_api_key && cfg.summary_api_key !== '***' ? cfg.summary_api_key : '')
      setSummaryBaseUrl(cfg.summary_base_url || 'https://openrouter.ai/api/v1')
      setSummaryModel(cfg.summary_model || 'anthropic/claude-sonnet-4')
```

**Step 3: Add the fields to the save function**

In the `save()` function, add to the `api.updateConfig({...})` call:

```typescript
        summary_provider: summaryProvider,
        summary_api_key: summaryApiKey || null,
        summary_base_url: summaryBaseUrl,
        summary_model: summaryModel,
```

**Step 4: Add the AI Summary card UI**

Add a new card section between the Filters card and the Save button. Use the existing card styling pattern:

```tsx
      {/* ── AI Summary Card ─────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.5rem 2rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.25rem' }}>
            AI Summary
          </h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Generate per-source summaries and an executive briefing after each fetch using an LLM.
          </p>
        </div>

        {/* Provider selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.375rem' }}>
              Provider
            </label>
            <select
              value={summaryProvider ?? ''}
              onChange={e => setSummaryProvider(e.target.value === '' ? null : e.target.value as 'openrouter' | 'custom')}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: '0.8125rem',
              }}
            >
              <option value="">Disabled</option>
              <option value="openrouter">OpenRouter</option>
              <option value="custom">Custom endpoint</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.375rem' }}>
              Model
            </label>
            <input
              type="text"
              value={summaryModel}
              onChange={e => setSummaryModel(e.target.value)}
              disabled={!summaryProvider}
              placeholder="anthropic/claude-sonnet-4"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: !summaryProvider ? 'var(--surface-alt)' : 'var(--surface)',
                color: !summaryProvider ? 'var(--ink-faint)' : 'var(--ink)',
                fontSize: '0.8125rem',
              }}
            />
          </div>
        </div>

        {/* API Key */}
        {summaryProvider && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.375rem' }}>
              API Key
            </label>
            <input
              type="password"
              value={summaryApiKey}
              onChange={e => setSummaryApiKey(e.target.value)}
              placeholder={summaryProvider === 'custom' ? 'Optional for local LLMs' : 'sk-or-v1-...'}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: '0.8125rem',
                fontFamily: 'ui-monospace, monospace',
              }}
            />
          </div>
        )}

        {/* Custom base URL */}
        {summaryProvider === 'custom' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.375rem' }}>
              Base URL
            </label>
            <input
              type="text"
              value={summaryBaseUrl}
              onChange={e => setSummaryBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: '0.8125rem',
                fontFamily: 'ui-monospace, monospace',
              }}
            />
          </div>
        )}
      </div>
```

**Step 5: Run the full test suite and verify build**

Run: `npx vitest run && npx next build`
Expected: All tests pass, build succeeds

**Step 6: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(summary): add AI Summary config card to Settings page"
```

---

### Task 8: Status Page — AI Briefing Display

**Files:**
- Modify: `src/components/Status.tsx`

**Step 1: Add summary state and fetch logic**

In Status.tsx, add imports and state:

```typescript
import type { BriefingSummary } from '@/api/client'
```

Add state after existing state declarations:

```typescript
const [summary, setSummary] = useState<BriefingSummary | null>(null)
const [summaryExpanded, setSummaryExpanded] = useState(false)
```

In the `loadAll()` function, add:

```typescript
api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
```

In the health poll `setInterval` callback, when new data is detected (inside the `if (h.last_fetch && h.last_fetch !== lastFetchedAtRef.current)` block), add:

```typescript
api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
```

**Step 2: Add the AI Briefing card**

Insert the card between the stat cards grid (`</div>` at line ~440) and the Sources section grid. The card should only render if a summary exists:

```tsx
      {/* ── AI Briefing Card ──────────────────────────────── */}
      {summary && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '1.5rem 2rem',
          marginBottom: '2rem',
        }}>
          {/* Header row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}>
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.125rem' }}>
                AI Briefing
              </h3>
              <span style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)' }}>
                {timeAgo(summary.generated_at)}
              </span>
            </div>
          </div>

          {/* Overall summary */}
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--ink)',
            lineHeight: 1.7,
            marginBottom: summary.sections.length > 0 ? '1rem' : 0,
          }}>
            {summary.overall}
          </p>

          {/* Expandable per-sensor summaries */}
          {summary.sections.length > 0 && (
            <>
              <button
                onClick={() => setSummaryExpanded(prev => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {summaryExpanded ? 'Hide details' : `Show ${summary.sections.length} source summaries`}
              </button>

              {summaryExpanded && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {summary.sections.map(s => (
                    <div key={s.sensor_name} style={{
                      padding: '0.75rem 1rem',
                      background: 'var(--surface-alt)',
                      borderRadius: 6,
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.375rem',
                      }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)' }}>
                          {s.label}
                        </span>
                        <span style={{
                          fontSize: '0.6875rem',
                          color: 'var(--ink-faint)',
                          fontFamily: 'ui-monospace, monospace',
                        }}>
                          {s.item_count} items
                        </span>
                      </div>
                      <p style={{
                        fontSize: '0.8125rem',
                        color: 'var(--ink-muted)',
                        lineHeight: 1.6,
                        margin: 0,
                      }}>
                        {s.summary}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
```

**Step 3: Run full test suite and verify build**

Run: `npx vitest run && npx next build`
Expected: All tests pass, build succeeds

**Step 4: Commit**

```bash
git add src/components/Status.tsx
git commit -m "feat(summary): add AI Briefing card to Status page"
```

---

### Task 9: Claude Code Skill

**Files:**
- Create: `.claude/commands/summarize-for-intel-brief.md`

**Step 1: Create the skill file**

Create `.claude/commands/summarize-for-intel-brief.md` in the project root (not inside `frontend/`):

```markdown
# Summarize Info Aggregation

Read the latest Info Aggregation feed data and generate a comprehensive AI summary.

## Instructions

1. First, fetch the latest intel report by calling `GET http://localhost:8000/api/intel/latest`. Parse the JSON response.

2. The response is an `IntelReport` with an `items` object keyed by section name. Each section contains an array of items with `id`, `source`, `title`, `url`, and optional fields like `abstract`, `content`, `heat`, `account`.

3. Group all items by their `source` field (e.g. `hacker_news`, `arxiv`, `github`, etc.).

4. For each source that has items, write a 2-4 sentence summary highlighting key themes, notable items, and trends. Be specific — cite titles and names.

5. Then write an overall executive briefing (3-6 sentences) synthesizing all source summaries into a coherent overview of the most important developments.

6. Structure the output as a `BriefingSummary` JSON object:

```json
{
  "generated_at": "<current ISO timestamp>",
  "report_fetched_at": "<fetched_at from the report>",
  "sections": [
    {
      "sensor_name": "<source name>",
      "label": "<human label>",
      "summary": "<2-4 sentence summary>",
      "item_count": <number of items>
    }
  ],
  "overall": "<3-6 sentence executive briefing>"
}
```

Use these sensor labels:
- hacker_news → Hacker News
- arxiv → ArXiv AI
- github → GitHub Trending
- product_hunt → Product Hunt
- v2ex → V2EX
- hn_blogs → HN Blogs
- sources_36kr → 36Kr
- wallstreetcn → WallStreetCN
- social_accounts → Social Accounts
- social_topics → Social Topics
- social_trends → Social Trends
- chrome_radar → Chrome Radar
- rss_feeds → RSS Feeds

7. POST the JSON object to `http://localhost:8000/api/summary` to cache it.

8. Print a brief confirmation showing how many sources were summarized and the first sentence of the overall briefing.
```

**Step 2: Verify the skill file is in the right location**

Run: `ls -la .claude/commands/summarize-for-intel-brief.md`
Expected: File exists

**Step 3: Commit**

```bash
git add .claude/commands/summarize-for-intel-brief.md
git commit -m "feat(summary): add /summarize-for-intel-brief Claude Code skill"
```

---

### Task 10: Integration Test and Final Verification

**Files:**
- Run full test suite
- Verify build
- Manual smoke test

**Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Verify Next.js build**

Run: `npx next build`
Expected: Clean build, no type errors

**Step 3: Start dev server and smoke test**

Run: `npx next dev --port 8002`

Verify:
- Status page loads without errors
- Settings page shows the new "AI Summary" card
- Provider dropdown works (Disabled / OpenRouter / Custom)
- Model field disables when provider is Disabled
- API Key field appears when provider is set
- Base URL field appears only for Custom provider
- `GET /api/summary` returns `{ summary: null }` initially
- Save settings works with the new fields

**Step 4: Commit any final adjustments**

If any fixes are needed, commit them:

```bash
git add -A
git commit -m "fix(summary): integration fixes for LLM summarization"
```
