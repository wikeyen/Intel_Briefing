# Utility Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Link Verifier, Jina Reader, and Chrome Radar from Python to TypeScript, and enhance the HN sensor with parallel fetching and top-level comments.

**Architecture:** Four independent modules that integrate into the existing collector pipeline. Link verification and content enrichment run as concurrent post-processing steps after dedup. Chrome Radar is a new opt-in sensor. HN sensor gets parallel fetching and `published_at`/`content` population.

**Tech Stack:** TypeScript, Vitest, Next.js 15, Firebase REST API (HN), Jina Reader API, Chrome Web Store scraping

**Design doc:** `docs/plans/2026-02-19-utility-migration-design.md`

---

### Task 1: Add `verified` field to IntelItem model

**Files:**
- Modify: `frontend/src/lib/models.ts:4-28`
- Modify: `frontend/src/lib/models.test.ts`

**Step 1: Write the failing test**

In `frontend/src/lib/models.test.ts`, add a test that confirms `verified` is accepted on IntelItem:

```typescript
it('IntelItem accepts verified field', () => {
  const item: IntelItem = {
    id: 'test-1',
    source: 'grok',
    title: 'Test',
    url: 'https://example.com',
    verified: false,
  }
  expect(item.verified).toBe(false)

  const unverified: IntelItem = {
    id: 'test-2',
    source: 'grok',
    title: 'Test 2',
    url: 'https://example.com',
    verified: null,
  }
  expect(unverified.verified).toBeNull()
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/models.test.ts`
Expected: FAIL — TypeScript error, `verified` does not exist on `IntelItem`

**Step 3: Add the field to IntelItem**

In `frontend/src/lib/models.ts`, add to the `IntelItem` interface after line 27 (`content`):

```typescript
  // Link verification status (Grok-sourced items only)
  verified?: boolean | null
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/models.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/models.ts frontend/src/lib/models.test.ts
git commit -m "feat(models): add verified field to IntelItem for link verification"
```

---

### Task 2: Link Verifier utility

**Files:**
- Create: `frontend/src/lib/utils/verifier.ts`
- Create: `frontend/src/lib/utils/verifier.test.ts`

**Step 1: Write the failing tests**

Create `frontend/src/lib/utils/verifier.test.ts`:

```typescript
// ABOUTME: Tests for the link verifier utility.
// ABOUTME: Validates HEAD/GET fallback, redirect following, timeout, and error handling.
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('verifyLink', () => {
  it('returns true for 200 HEAD response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://example.com')
    expect(result).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'HEAD' }),
    )
  })

  it('falls back to GET when HEAD returns 405', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 405 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://example.com')
    expect(result).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns false for 404', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 })
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://example.com/nope')
    expect(result).toBe(false)
  })

  it('returns false on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://dead.example.com')
    expect(result).toBe(false)
  })

  it('returns false for empty/invalid URL', async () => {
    globalThis.fetch = vi.fn()
    const { verifyLink } = await import('./verifier')
    expect(await verifyLink('')).toBe(false)
    expect(await verifyLink('not-a-url')).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/utils/verifier.test.ts`
Expected: FAIL — module not found

**Step 3: Implement verifyLink**

Create `frontend/src/lib/utils/verifier.ts`:

```typescript
// ABOUTME: Link verifier utility for validating URLs from Grok-sourced items.
// ABOUTME: Uses HEAD with GET fallback; returns true (valid), false (bad URL).

const DEFAULT_TIMEOUT = 5000

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export async function verifyLink(url: string, timeout = DEFAULT_TIMEOUT): Promise<boolean> {
  if (!isValidUrl(url)) return false

  try {
    const headResp = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    })
    if (headResp.ok) return true

    // HEAD rejected (405, 403, etc.) — fall back to GET
    const getResp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    })
    return getResp.ok
  } catch {
    return false
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/utils/verifier.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add frontend/src/lib/utils/verifier.ts frontend/src/lib/utils/verifier.test.ts
git commit -m "feat(utils): add link verifier with HEAD/GET fallback"
```

---

### Task 3: Jina Reader utility

**Files:**
- Create: `frontend/src/lib/utils/jina-reader.ts`
- Create: `frontend/src/lib/utils/jina-reader.test.ts`

**Step 1: Write the failing tests**

Create `frontend/src/lib/utils/jina-reader.test.ts`:

```typescript
// ABOUTME: Tests for the Jina Reader content fetcher.
// ABOUTME: Validates markdown fetching, truncation, and error handling.
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('fetchContent', () => {
  it('returns markdown content from Jina', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Hello World\n\nSome content here.'),
    })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com/article')
    expect(result).toBe('# Hello World\n\nSome content here.')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/article',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('truncates content to maxChars', async () => {
    const longContent = 'A'.repeat(5000)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(longContent),
    })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com', 100)
    expect(result).toHaveLength(100)
  })

  it('returns null on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com')
    expect(result).toBeNull()
  })

  it('returns null for empty response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('   '),
    })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com')
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/utils/jina-reader.test.ts`
Expected: FAIL — module not found

**Step 3: Implement fetchContent**

Create `frontend/src/lib/utils/jina-reader.ts`:

```typescript
// ABOUTME: Jina Reader utility for fetching clean article content as markdown.
// ABOUTME: Calls r.jina.ai — free tier, 20 req/min, no API key needed.

const JINA_BASE = 'https://r.jina.ai/'
const DEFAULT_MAX_CHARS = 3000
const DEFAULT_TIMEOUT = 15000

export async function fetchContent(
  url: string,
  maxChars = DEFAULT_MAX_CHARS,
  timeout = DEFAULT_TIMEOUT,
): Promise<string | null> {
  try {
    const resp = await fetch(`${JINA_BASE}${url}`, {
      signal: AbortSignal.timeout(timeout),
    })
    if (!resp.ok) return null

    const text = (await resp.text()).trim()
    if (!text) return null

    return text.slice(0, maxChars)
  } catch {
    return null
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/utils/jina-reader.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add frontend/src/lib/utils/jina-reader.ts frontend/src/lib/utils/jina-reader.test.ts
git commit -m "feat(utils): add Jina Reader content fetcher"
```

---

### Task 4: Integrate Link Verifier and Jina Reader into collector pipeline

**Files:**
- Modify: `frontend/src/lib/pipeline/collector.ts:116-157`
- Modify: `frontend/src/lib/pipeline/collector.test.ts`

**Step 1: Write the failing tests**

Add to `frontend/src/lib/pipeline/collector.test.ts`:

```typescript
// At top of file, add mocks for the new utilities
const mockVerifyLink = vi.fn()
const mockFetchContent = vi.fn()
vi.mock('../utils/verifier', () => ({
  verifyLink: (...args: unknown[]) => mockVerifyLink(...args),
}))
vi.mock('../utils/jina-reader', () => ({
  fetchContent: (...args: unknown[]) => mockFetchContent(...args),
}))
```

Add these test cases inside the `describe('collect', ...)` block:

```typescript
it('verifies links for grok-sourced items after dedup', async () => {
  mockVerifyLink.mockResolvedValue(true)
  mockSensorFns['grok'] = vi.fn().mockResolvedValue([
    { id: 'grok-1', source: 'grok', title: 'Grok Item', url: 'https://example.com/grok' },
  ])

  const config = makeConfig({ sensors_enabled: { grok: true }, xai_api_key: 'key' })
  const report = await collect(config)
  expect(mockVerifyLink).toHaveBeenCalledWith('https://example.com/grok')
  expect(report.items.tech_trends[0].verified).toBe(true)
})

it('sets verified=false for bad grok links', async () => {
  mockVerifyLink.mockResolvedValue(false)
  mockSensorFns['grok'] = vi.fn().mockResolvedValue([
    { id: 'grok-1', source: 'grok', title: 'Bad Link', url: 'https://example.com/dead' },
  ])

  const config = makeConfig({ sensors_enabled: { grok: true }, xai_api_key: 'key' })
  const report = await collect(config)
  expect(report.items.tech_trends[0].verified).toBe(false)
})

it('does not verify links for non-grok items', async () => {
  mockVerifyLink.mockResolvedValue(true)
  mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([
    { id: 'hn-1', source: 'hacker_news', title: 'HN', url: 'https://example.com' },
  ])

  const config = makeConfig({ sensors_enabled: { hacker_news: true } })
  const report = await collect(config)
  expect(mockVerifyLink).not.toHaveBeenCalled()
  expect(report.items.tech_trends[0].verified).toBeUndefined()
})

it('enriches hn_blogs items with Jina content', async () => {
  mockFetchContent.mockResolvedValue('Full article text here')
  mockSensorFns['hn_blogs'] = vi.fn().mockResolvedValue([
    { id: 'blog-1', source: 'hn_blogs', title: 'Blog Post', url: 'https://blog.example.com/post', content: 'RSS summary' },
  ])

  const config = makeConfig({ sensors_enabled: { hn_blogs: true } })
  const report = await collect(config)
  expect(mockFetchContent).toHaveBeenCalledWith('https://blog.example.com/post')
  expect(report.items.insights[0].content).toBe('Full article text here')
})

it('keeps original content when Jina returns null', async () => {
  mockFetchContent.mockResolvedValue(null)
  mockSensorFns['hn_blogs'] = vi.fn().mockResolvedValue([
    { id: 'blog-1', source: 'hn_blogs', title: 'Blog Post', url: 'https://blog.example.com/post', content: 'RSS summary' },
  ])

  const config = makeConfig({ sensors_enabled: { hn_blogs: true } })
  const report = await collect(config)
  expect(report.items.insights[0].content).toBe('RSS summary')
})
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/pipeline/collector.test.ts`
Expected: FAIL — verifier/jina-reader not yet integrated; `verified` is undefined, `content` stays as RSS summary

**Step 3: Implement post-processing in collector.ts**

In `frontend/src/lib/pipeline/collector.ts`, add imports at top:

```typescript
import { verifyLink } from '../utils/verifier'
import { fetchContent } from '../utils/jina-reader'
```

Add a constant for Grok-sourced sensors:

```typescript
const GROK_SOURCES = new Set(['grok', 'politics', 'topics'])
```

After the `dedupAcrossSections` call (around line 137) and before `const now = new Date()`, insert:

```typescript
  // Post-processing: verify links (Grok items) + enrich content (hn_blogs) — concurrent
  const postProcessTasks: Promise<void>[] = []

  for (const key of Object.keys(dedupedSections) as SectionKey[]) {
    for (const item of dedupedSections[key]) {
      // Link verification for Grok-sourced items
      if (GROK_SOURCES.has(item.source) && item.url) {
        postProcessTasks.push(
          verifyLink(item.url).then(ok => { item.verified = ok }),
        )
      }
      // Content enrichment for hn_blogs items
      if (item.source === 'hn_blogs' && item.url) {
        postProcessTasks.push(
          fetchContent(item.url).then(text => {
            if (text) item.content = text
          }),
        )
      }
    }
  }

  await Promise.allSettled(postProcessTasks)
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/pipeline/collector.test.ts`
Expected: PASS (all existing + new tests)

**Step 5: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add frontend/src/lib/pipeline/collector.ts frontend/src/lib/pipeline/collector.test.ts
git commit -m "feat(pipeline): integrate link verification and Jina content enrichment"
```

---

### Task 5: Enhance HN sensor with parallel fetching, published_at, and comments

**Files:**
- Modify: `frontend/src/lib/sensors/hacker_news.ts`
- Modify: `frontend/src/lib/sensors/sensors.test.ts`

**Step 1: Write the failing tests**

Add these tests to the `HackerNewsSensor` describe block in `frontend/src/lib/sensors/sensors.test.ts`:

```typescript
it('populates published_at from time field', async () => {
  const storyIds = [1]
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('topstories.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(storyIds) })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        id: 1, type: 'story', title: 'Story 1',
        url: 'https://example.com/1', score: 100, descendants: 20,
        time: 1700000000, kids: [],
      }),
    })
  })

  const { fetchHackerNews } = await import('./hacker_news')
  const items = await fetchHackerNews(makeConfig(), 5)
  expect(items[0].published_at).toBe('2023-11-14T22:13:20.000Z')
})

it('fetches top-level comments into content', async () => {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('topstories.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([1]) })
    }
    if (url.includes('/item/1.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1, type: 'story', title: 'Story',
          url: 'https://example.com', score: 50, descendants: 10,
          time: 1700000000, kids: [10, 20, 30],
        }),
      })
    }
    if (url.includes('/item/10.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 10, by: 'user1', text: 'Great article!',
        }),
      })
    }
    if (url.includes('/item/20.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 20, by: 'user2', text: 'I disagree with this take.',
        }),
      })
    }
    if (url.includes('/item/30.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 30, by: 'user3', text: '<p>HTML <b>comment</b> here</p>',
        }),
      })
    }
    return Promise.resolve({ ok: false, status: 404 })
  })

  const { fetchHackerNews } = await import('./hacker_news')
  const items = await fetchHackerNews(makeConfig(), 5)
  expect(items[0].content).toContain('@user1: Great article!')
  expect(items[0].content).toContain('@user2: I disagree with this take.')
  expect(items[0].content).toContain('@user3: HTML comment here')
  expect(items[0].content).toContain('Top comments:')
})

it('fetches stories in parallel', async () => {
  const storyIds = [1, 2, 3]
  const fetchOrder: number[] = []
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('topstories.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(storyIds) })
    }
    const id = parseInt(url.split('/').pop()!.replace('.json', ''))
    if (storyIds.includes(id)) {
      fetchOrder.push(id)
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        id, type: 'story', title: `Story ${id}`,
        url: `https://example.com/${id}`, score: 100, descendants: 0,
        time: 1700000000, kids: [],
      }),
    })
  })

  const { fetchHackerNews } = await import('./hacker_news')
  const items = await fetchHackerNews(makeConfig(), 5)
  expect(items).toHaveLength(3)
  // All 3 story requests should fire concurrently (all should be recorded)
  expect(fetchOrder).toHaveLength(3)
})
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: FAIL — `published_at` is null, `content` is undefined, story fetches are sequential

**Step 3: Rewrite the HN sensor**

Replace the content of `frontend/src/lib/sensors/hacker_news.ts`:

```typescript
// ABOUTME: Hacker News sensor using the official Firebase REST API.
// ABOUTME: Fetches top stories with parallel fetching and top-level comments.
import type { ConfigSettings, IntelItem } from '../models'

const HN_BASE = 'https://hacker-news.firebaseio.com/v0'
const MAX_COMMENTS = 5

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

interface HnComment {
  by?: string
  text?: string
}

async function fetchComments(kids: number[]): Promise<string> {
  const commentIds = kids.slice(0, MAX_COMMENTS)
  const settled = await Promise.allSettled(
    commentIds.map(async (id) => {
      const resp = await fetch(`${HN_BASE}/item/${id}.json`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) return null
      return (await resp.json()) as HnComment
    }),
  )

  const lines: string[] = []
  for (const result of settled) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const { by, text } = result.value
    if (!by || !text) continue
    const clean = stripHtml(text).slice(0, 200)
    lines.push(`@${by}: ${clean}`)
  }

  return lines.length > 0 ? `Top comments:\n${lines.join('\n')}` : ''
}

async function fetchStory(storyId: number): Promise<IntelItem | null> {
  try {
    const itemResp = await fetch(`${HN_BASE}/item/${storyId}.json`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!itemResp.ok) return null
    const item = (await itemResp.json()) as Record<string, unknown>
    if (!item || item.type !== 'story') return null

    const score = Number(item.score ?? 0)
    const descendants = Number(item.descendants ?? 0)
    const url = (item.url as string) || `https://news.ycombinator.com/item?id=${storyId}`
    const time = Number(item.time ?? 0)
    const kids = (item.kids as number[]) ?? []

    const content = kids.length > 0 ? await fetchComments(kids) : ''

    return {
      id: `hn-${storyId}`,
      source: 'hacker_news',
      title: String(item.title ?? ''),
      url,
      heat: `${score} pts, ${descendants} comments`,
      published_at: time > 0 ? new Date(time * 1000).toISOString() : null,
      content: content || null,
    }
  } catch {
    return null
  }
}

export async function fetchHackerNews(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(`${HN_BASE}/topstories.json`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Hacker News`)
    const storyIds = (await resp.json()) as number[]

    const candidateIds = storyIds.slice(0, Math.min(limit * 2, 30))

    const settled = await Promise.allSettled(
      candidateIds.map((id) => fetchStory(id)),
    )

    const items: IntelItem[] = []
    for (const result of settled) {
      if (items.length >= limit) break
      if (result.status === 'fulfilled' && result.value) {
        items.push(result.value)
      }
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: PASS (all existing HN tests + new tests)

**Step 5: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add frontend/src/lib/sensors/hacker_news.ts frontend/src/lib/sensors/sensors.test.ts
git commit -m "feat(sensors): enhance HN with parallel fetching, published_at, and comments"
```

---

### Task 6: Chrome Radar sensor

**Files:**
- Create: `frontend/src/lib/sensors/chrome_radar.ts`
- Modify: `frontend/src/lib/sensors/index.ts`
- Modify: `frontend/src/lib/sensors/sensors.test.ts`
- Modify: `frontend/src/lib/pipeline/collector.ts` (SENSOR_SECTION_MAP)
- Modify: `frontend/src/lib/models.ts` (defaultConfig)

**Step 1: Write the failing tests**

Add a new describe block to `frontend/src/lib/sensors/sensors.test.ts`:

```typescript
describe('ChromeRadarSensor', () => {
  it('returns items with source chrome_radar', async () => {
    // Mock the Chrome Web Store category page
    const categoryHtml = `
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/test-ext/abc123">
          <span>Bad Extension</span>
        </a>
        <span class="Y30PE">3.2</span>
      </div>
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/good-ext/def456">
          <span>Good Extension</span>
        </a>
        <span class="Y30PE">4.5</span>
      </div>
    `
    const detailHtml = `
      <span class="F9iKBc">10,000+ users</span>
    `

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/category/')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(categoryHtml) })
      }
      if (url.includes('/detail/')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(detailHtml) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    for (const item of items) {
      expect(item.source).toBe('chrome_radar')
      expect(item.id).toMatch(/^chrome-/)
    }
  })

  it('filters out extensions with rating >= 3.8', async () => {
    const categoryHtml = `
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/good-ext/abc123">
          <span>High Rated</span>
        </a>
        <span class="Y30PE">4.2</span>
      </div>
    `
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(categoryHtml),
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    expect(items).toHaveLength(0)
  })

  it('filters out extensions with fewer than 5000 users', async () => {
    const categoryHtml = `
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/small-ext/abc123">
          <span>Small Extension</span>
        </a>
        <span class="Y30PE">2.0</span>
      </div>
    `
    const detailHtml = `<span class="F9iKBc">100 users</span>`

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/category/')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(categoryHtml) })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(detailHtml) })
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    expect(items).toHaveLength(0)
  })
})
```

Update the sensor registry count test:

Change `it('sensor registry has all 11 sensors'` to `it('sensor registry has all 12 sensors'` and update:

```typescript
expect(Object.keys(SENSOR_REGISTRY)).toHaveLength(12)
const expected = [
  'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
  'hn_blogs', 'grok', 'sources_36kr', 'wallstreetcn', 'politics', 'topics',
  'chrome_radar',
]
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: FAIL — module not found for chrome_radar, registry count wrong

**Step 3: Implement Chrome Radar sensor**

Create `frontend/src/lib/sensors/chrome_radar.ts`:

```typescript
// ABOUTME: Chrome Radar sensor — scrapes Chrome Web Store for popular but poorly-rated extensions.
// ABOUTME: Identifies "ugly cash cows": high user count (>5000) with low rating (<3.8).
import type { ConfigSettings, IntelItem } from '../models'

const CWS_BASE = 'https://chromewebstore.google.com'
const CATEGORIES = ['extensions/workflow', 'extensions/developer_tools']
const MIN_USERS = 5000
const MAX_RATING = 3.8

interface RawExtension {
  name: string
  detailUrl: string
  rating: number
}

function parseUserCount(text: string): number {
  const match = text.match(/([\d,]+)\+?\s*users?/i)
  if (!match) return 0
  return parseInt(match[1].replace(/,/g, ''), 10)
}

async function scrapeCategoryPage(category: string): Promise<RawExtension[]> {
  try {
    const resp = await fetch(`${CWS_BASE}/category/${category}`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) return []
    const html = await resp.text()

    const extensions: RawExtension[] = []
    const tilePattern = /<div[^>]*class="[^"]*webstore-test-wall-tile[^"]*"[^>]*>([\s\S]*?)<\/div>/g
    let tileMatch
    while ((tileMatch = tilePattern.exec(html)) !== null) {
      const tile = tileMatch[1]
      const linkMatch = /href="([^"]*\/detail\/[^"]*)"/.exec(tile)
      const nameMatch = /<span[^>]*>([^<]+)<\/span>/.exec(tile)
      const ratingMatch = /class="Y30PE"[^>]*>([^<]+)/.exec(tile)

      if (linkMatch && nameMatch && ratingMatch) {
        const rating = parseFloat(ratingMatch[1])
        if (!isNaN(rating) && rating < MAX_RATING) {
          extensions.push({
            name: nameMatch[1].trim(),
            detailUrl: linkMatch[1].startsWith('http') ? linkMatch[1] : `${CWS_BASE}${linkMatch[1]}`,
            rating,
          })
        }
      }
    }
    return extensions
  } catch {
    return []
  }
}

async function getUserCount(detailUrl: string): Promise<number> {
  try {
    const resp = await fetch(detailUrl, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return 0
    const html = await resp.text()
    const match = /class="F9iKBc"[^>]*>([^<]+)/.exec(html)
    return match ? parseUserCount(match[1]) : 0
  } catch {
    return 0
  }
}

export async function fetchChromeRadar(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const categoryResults = await Promise.allSettled(
      CATEGORIES.map((cat) => scrapeCategoryPage(cat)),
    )

    const candidates: RawExtension[] = []
    for (const result of categoryResults) {
      if (result.status === 'fulfilled') {
        candidates.push(...result.value)
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>()
    const unique = candidates.filter((ext) => {
      if (seen.has(ext.detailUrl)) return false
      seen.add(ext.detailUrl)
      return true
    })

    // Check user counts in parallel
    const withCounts = await Promise.allSettled(
      unique.slice(0, limit * 3).map(async (ext) => {
        const users = await getUserCount(ext.detailUrl)
        return { ...ext, users }
      }),
    )

    const items: IntelItem[] = []
    for (const result of withCounts) {
      if (items.length >= limit) break
      if (result.status !== 'fulfilled') continue
      const ext = result.value
      if (ext.users < MIN_USERS) continue

      const id = ext.detailUrl.split('/').pop() ?? ext.name
      items.push({
        id: `chrome-${id}`,
        source: 'chrome_radar',
        title: ext.name,
        url: ext.detailUrl,
        heat: `${ext.users.toLocaleString()} users, ${ext.rating.toFixed(1)} stars`,
      })
    }

    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
```

**Step 4: Register the sensor**

In `frontend/src/lib/sensors/index.ts`, add the import and registry entry:

```typescript
import { fetchChromeRadar } from './chrome_radar'
```

Add to `SENSOR_REGISTRY`:

```typescript
  chrome_radar: fetchChromeRadar,
```

In `frontend/src/lib/pipeline/collector.ts`, add to `SENSOR_SECTION_MAP`:

```typescript
  chrome_radar: 'products',
```

In `frontend/src/lib/models.ts`, add to `defaultConfig().sensors_enabled`:

```typescript
  chrome_radar: false,
```

**Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: PASS

**Step 6: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add frontend/src/lib/sensors/chrome_radar.ts frontend/src/lib/sensors/index.ts frontend/src/lib/pipeline/collector.ts frontend/src/lib/models.ts frontend/src/lib/sensors/sensors.test.ts
git commit -m "feat(sensors): add Chrome Radar sensor for low-rated popular extensions"
```

---

### Task 7: Update Data.tsx for verified indicator and content preview

**Files:**
- Modify: `frontend/src/components/Data.tsx`

**Step 1: Add chrome_radar to UI mappings**

In `Data.tsx`, add to `SOURCE_LABELS`:

```typescript
  chrome_radar: 'Chrome',
```

Add to `SECTION_SENSORS.products`:

```typescript
  products: ['product_hunt', 'chrome_radar'],
```

**Step 2: Add verified warning indicator to ItemCard**

In the `ItemCard` component, add inside the meta row `<div>` (after the source chip, before heat), a conditional verified indicator:

```typescript
{item.verified === false && (
  <span
    title="Link could not be verified"
    style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--warn)',
      background: 'var(--warn-wash, rgba(234,179,8,0.1))',
      padding: '0.2rem 0.5rem',
      borderRadius: 3,
    }}
  >
    unverified
  </span>
)}
```

**Step 3: Show content instead of abstract when available**

In the `ItemCard` component, update the abstract section. After the existing abstract block, add a content preview block:

```typescript
{/* Content preview (HN comments, blog content) */}
{item.content && !item.abstract && (
  <div style={{ marginTop: '0.625rem' }}>
    <p
      className="line-clamp-2"
      style={{
        fontSize: '0.8125rem',
        color: 'var(--ink-muted)',
        lineHeight: 1.65,
        margin: 0,
        whiteSpace: 'pre-line',
      }}
    >
      {item.content}
    </p>
  </div>
)}
```

**Step 4: Verify visually**

Start dev server and check:
- Grok items with `verified === false` show "unverified" chip
- HN items with comments show 2-line content preview
- Chrome Radar items (if enabled) appear in Products section

**Step 5: Commit**

```bash
git add frontend/src/components/Data.tsx
git commit -m "style(data): add verified indicator and content preview to item cards"
```

---

### Task 8: Final integration test and cleanup

**Step 1: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 2: Run the build to check for TypeScript errors**

Run: `cd frontend && npx next build`
Expected: Build succeeds with no type errors

**Step 3: Start dev server and verify end-to-end**

Run: `cd frontend && npx next dev -p 8000`

Verify:
- Pipeline runs (trigger from Status page) — new sensors appear in progress
- HN items have published_at dates and comment previews
- Blog items have enriched content
- Grok items show verified/unverified status
- Chrome Radar items appear in Products (if enabled in settings)

**Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: final integration cleanup for utility migration"
```

---

## Summary of Files

| Action | File |
|--------|------|
| Modify | `frontend/src/lib/models.ts` — add `verified` field |
| Modify | `frontend/src/lib/models.test.ts` — test verified field |
| Create | `frontend/src/lib/utils/verifier.ts` — link verifier |
| Create | `frontend/src/lib/utils/verifier.test.ts` — verifier tests |
| Create | `frontend/src/lib/utils/jina-reader.ts` — Jina Reader |
| Create | `frontend/src/lib/utils/jina-reader.test.ts` — Jina Reader tests |
| Modify | `frontend/src/lib/pipeline/collector.ts` — post-processing integration |
| Modify | `frontend/src/lib/pipeline/collector.test.ts` — integration tests |
| Modify | `frontend/src/lib/sensors/hacker_news.ts` — parallel fetch + comments |
| Modify | `frontend/src/lib/sensors/sensors.test.ts` — HN + Chrome Radar tests |
| Create | `frontend/src/lib/sensors/chrome_radar.ts` — Chrome Radar sensor |
| Modify | `frontend/src/lib/sensors/index.ts` — register chrome_radar |
| Modify | `frontend/src/components/Data.tsx` — UI updates |
