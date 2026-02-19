# RSS Feeds Sensor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a user-managed RSS/Atom feed sensor that fetches feeds, parses items, scrapes full article content via Readability, and displays results in the briefing.

**Architecture:** A new `rss_feeds` sensor following the established sensor pattern. Users manage feed URLs via TagInput in the UI. The sensor fetches each feed, parses RSS 2.0/Atom XML, filters by lookback window, then scrapes each article's webpage for full content using `@mozilla/readability` + `jsdom`. Falls back to RSS summary if scraping fails.

**Tech Stack:** TypeScript, Next.js 15, `fast-xml-parser` (existing), `@mozilla/readability` (new dep), `jsdom` (existing), Vitest

---

### Task 1: Add `rss_feed_urls` to ConfigSettings and defaults

**Files:**
- Modify: `frontend/src/lib/models.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/lib/models.test.ts`

**Step 1: Write the failing test**

In `frontend/src/lib/models.test.ts`, inside the `ConfigSettings` describe block, add:

```typescript
it('should default rss_feed_urls to empty array', () => {
  const cfg = defaultConfig()
  expect(cfg.rss_feed_urls).toEqual([])
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/models.test.ts`
Expected: FAIL — `rss_feed_urls` does not exist on ConfigSettings

**Step 3: Add field to models.ts**

In `frontend/src/lib/models.ts`, add to the `ConfigSettings` interface (after the social following toggles block):

```typescript
// RSS feed URLs
rss_feed_urls: string[]
```

And in `defaultConfig()`, add:

```typescript
rss_feed_urls: [],
```

**Step 4: Mirror in client.ts**

In `frontend/src/api/client.ts`, add to the `ConfigSettings` interface:

```typescript
rss_feed_urls: string[]
```

**Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/models.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/lib/models.ts frontend/src/api/client.ts frontend/src/lib/models.test.ts
git commit -m "feat(config): add rss_feed_urls field to ConfigSettings"
```

---

### Task 2: Install `@mozilla/readability` and add article extraction helper

**Files:**
- Create: `frontend/src/lib/readability.ts`
- Create: `frontend/src/lib/readability.test.ts`

**Step 1: Install the dependency**

```bash
cd frontend && npm install @mozilla/readability
```

Also install types if separate:
```bash
cd frontend && npm install -D @types/mozilla-readability 2>/dev/null || true
```

Note: `@mozilla/readability` ships its own types — the `@types` package may not exist. Check after install.

**Step 2: Write the failing test**

Create `frontend/src/lib/readability.test.ts`:

```typescript
// ABOUTME: Tests for the article content extraction helper using @mozilla/readability.
// ABOUTME: Verifies HTML parsing, content extraction, and fallback on failure.
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('extractArticle', () => {
  it('extracts article content from HTML', async () => {
    const html = `
      <html><head><title>Test Article</title></head>
      <body>
        <article>
          <h1>Test Article</h1>
          <p>This is the main article content that should be extracted by readability.</p>
          <p>It has multiple paragraphs to make the content substantial enough for the algorithm.</p>
          <p>The readability algorithm needs enough text to identify the main content area.</p>
        </article>
      </body></html>
    `
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve(html),
    })

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/article')
    expect(result).not.toBeNull()
    expect(result).toContain('main article content')
  })

  it('returns null when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/missing')
    expect(result).toBeNull()
  })

  it('returns null for non-HTML content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      text: () => Promise.resolve('%PDF-1.4'),
    })

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/doc.pdf')
    expect(result).toBeNull()
  })

  it('returns null on timeout / network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/slow')
    expect(result).toBeNull()
  })
})
```

**Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/readability.test.ts`
Expected: FAIL — module `./readability` does not exist

**Step 4: Implement the helper**

Create `frontend/src/lib/readability.ts`:

```typescript
// ABOUTME: Article content extraction using Mozilla Readability algorithm.
// ABOUTME: Fetches a webpage, parses HTML with jsdom, and extracts the main article text.
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

const FETCH_TIMEOUT = 15_000

/**
 * Fetch a URL and extract the main article content using Readability.
 * Returns the text content or null if extraction fails.
 */
export async function extractArticle(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: 'follow',
      headers: { 'User-Agent': 'IntelBriefing/1.0 (RSS reader)' },
    })
    if (!resp.ok) return null

    const contentType = resp.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null
    }

    const html = await resp.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article?.textContent) return null

    return article.textContent.trim()
  } catch {
    return null
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/readability.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/lib/readability.ts frontend/src/lib/readability.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(readability): add article content extraction helper"
```

---

### Task 3: Create the RSS feeds sensor

**Files:**
- Create: `frontend/src/lib/sensors/rss_feeds.ts`
- Create: `frontend/src/lib/sensors/rss_feeds.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/lib/sensors/rss_feeds.test.ts`:

```typescript
// ABOUTME: Tests for the RSS feeds sensor — XML parsing, lookback filtering, and content extraction.
// ABOUTME: Verifies RSS 2.0 and Atom feed parsing, SensorConfigError on empty config, and readability integration.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defaultConfig } from '../models'
import type { ConfigSettings } from '../models'
import { SensorConfigError } from './errors'

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <item>
      <title>Post One</title>
      <link>https://example.com/post-1</link>
      <pubDate>Thu, 19 Feb 2026 12:00:00 GMT</pubDate>
      <description>Summary of post one.</description>
    </item>
    <item>
      <title>Post Two</title>
      <link>https://example.com/post-2</link>
      <pubDate>Thu, 19 Feb 2026 10:00:00 GMT</pubDate>
      <description>Summary of post two.</description>
    </item>
  </channel>
</rss>`

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <entry>
    <title>Atom Post</title>
    <link rel="alternate" href="https://example.com/atom-1" />
    <published>2026-02-19T11:00:00Z</published>
    <summary>Atom summary text.</summary>
  </entry>
</feed>`

describe('fetchRssFeeds', () => {
  it('throws SensorConfigError when no feed URLs configured', async () => {
    const { fetchRssFeeds } = await import('./rss_feeds')
    await expect(fetchRssFeeds(makeConfig(), 10)).rejects.toThrow(SensorConfigError)
  })

  it('parses RSS 2.0 feed and returns IntelItems', async () => {
    // Mock: feed fetch returns RSS XML, article scrape returns content
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(RSS_XML) })
      }
      // Article fetch for readability
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body><article><p>Full article content here that is long enough for readability to parse correctly and extract.</p></article></body></html>'),
      })
    })

    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(
      makeConfig({ rss_feed_urls: ['https://example.com/feed.xml'] }),
      10,
    )
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].source).toBe('rss_feeds')
    expect(items[0].title).toBe('Post One')
    expect(items[0].url).toBe('https://example.com/post-1')
    expect(items[0].account).toBe('Test Blog')
  })

  it('parses Atom feed and returns IntelItems', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/atom.xml') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(ATOM_XML) })
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body><article><p>Atom article content.</p></article></body></html>'),
      })
    })

    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(
      makeConfig({ rss_feed_urls: ['https://example.com/atom.xml'] }),
      10,
    )
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].source).toBe('rss_feeds')
    expect(items[0].title).toBe('Atom Post')
    expect(items[0].account).toBe('Atom Blog')
  })

  it('skips failed feeds and returns items from successful ones', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://bad.com/feed') {
        return Promise.resolve({ ok: false, status: 500 })
      }
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(RSS_XML) })
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body><article><p>Content.</p></article></body></html>'),
      })
    })

    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(
      makeConfig({ rss_feed_urls: ['https://bad.com/feed', 'https://example.com/feed.xml'] }),
      10,
    )
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].source).toBe('rss_feeds')
  })

  it('falls back to RSS description when article scraping fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(RSS_XML) })
      }
      // All article fetches fail
      return Promise.resolve({ ok: false, status: 403 })
    })

    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(
      makeConfig({ rss_feed_urls: ['https://example.com/feed.xml'] }),
      10,
    )
    expect(items.length).toBeGreaterThanOrEqual(1)
    // Should fall back to RSS description
    expect(items[0].content).toBe('Summary of post one.')
  })

  it('respects the limit parameter', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(RSS_XML) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(
      makeConfig({ rss_feed_urls: ['https://example.com/feed.xml'] }),
      1,
    )
    expect(items).toHaveLength(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/sensors/rss_feeds.test.ts`
Expected: FAIL — module `./rss_feeds` does not exist

**Step 3: Implement the sensor**

Create `frontend/src/lib/sensors/rss_feeds.ts`:

```typescript
// ABOUTME: RSS feeds sensor — fetches user-specified RSS/Atom feeds and extracts article content.
// ABOUTME: Parses XML with fast-xml-parser, scrapes full content via readability, with fallback to RSS summary.
import { createHash } from 'crypto'
import { XMLParser } from 'fast-xml-parser'
import type { ConfigSettings, IntelItem } from '../models'
import { extractArticle } from '../readability'
import { SensorConfigError } from './errors'

const FEED_FETCH_TIMEOUT = 10_000
const SCRAPE_CONCURRENCY = 5

function md5Short(input: string): string {
  return createHash('md5').update(input).digest('hex').slice(0, 8)
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

interface RawItem {
  title: string
  url: string
  published: string | null
  summary: string | null
  feedTitle: string
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function parseFeed(xml: string): { feedTitle: string; items: RawItem[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['entry', 'item', 'link', 'author'].includes(name),
  })
  const parsed = parser.parse(xml)

  const isAtom = !!parsed.feed
  const feed = parsed.feed ?? parsed
  const items: RawItem[] = []

  if (isAtom) {
    const feedTitle = String(feed.title ?? 'Unknown Feed')
    const entries = feed.entry ?? []
    for (const entry of entries) {
      const title = String(entry.title ?? 'Untitled')
      const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : []
      const altLink = links.find((l: Record<string, string>) => l['@_rel'] === 'alternate') ?? links[0]
      const url = altLink?.['@_href'] ?? ''
      if (!url) continue
      const published = String(entry.published ?? entry.updated ?? '') || null
      const summary = entry.summary ? stripHtml(String(entry.summary)) : null
      items.push({ title, url, published, summary, feedTitle })
    }
  } else {
    const channel = feed.rss?.channel ?? feed.channel ?? feed
    const feedTitle = String(channel.title ?? 'Unknown Feed')
    const rssItems = channel.item ?? []
    for (const item of rssItems) {
      const title = String(item.title ?? 'Untitled')
      const url = String(item.link ?? '')
      if (!url) continue
      const published = item.pubDate ? String(item.pubDate) : null
      const summary = item.description ? stripHtml(String(item.description)) : null
      items.push({ title, url, published, summary, feedTitle })
    }
  }
  return { feedTitle: items[0]?.feedTitle ?? 'Unknown Feed', items }
}

async function fetchFeed(feedUrl: string): Promise<RawItem[]> {
  try {
    const resp = await fetch(feedUrl, {
      signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT),
      redirect: 'follow',
    })
    if (!resp.ok) return []
    const xml = await resp.text()
    const { items } = parseFeed(xml)
    return items
  } catch {
    return []
  }
}

/**
 * Scrape articles concurrently with a concurrency cap.
 * For each item, attempts to extract full article content. Falls back to RSS summary.
 */
async function scrapeArticles(items: RawItem[]): Promise<RawItem[]> {
  const results: RawItem[] = []
  for (let i = 0; i < items.length; i += SCRAPE_CONCURRENCY) {
    const batch = items.slice(i, i + SCRAPE_CONCURRENCY)
    const scraped = await Promise.allSettled(
      batch.map(async (item) => {
        const content = await extractArticle(item.url)
        return { ...item, summary: content ?? item.summary }
      }),
    )
    for (const result of scraped) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }
  return results
}

export async function fetchRssFeeds(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.rss_feed_urls || config.rss_feed_urls.length === 0) {
    throw new SensorConfigError('No RSS feed URLs configured')
  }

  // Fetch all feeds in parallel
  const feedResults = await Promise.allSettled(
    config.rss_feed_urls.map((url) => fetchFeed(url)),
  )

  let allItems: RawItem[] = []
  for (const result of feedResults) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value)
    }
  }

  // Filter by lookback window
  const lookbackHours = config.sensor_lookback_hours?.rss_feeds
  if (lookbackHours) {
    const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)
    allItems = allItems.filter((item) => {
      const pub = parseDate(item.published)
      // Keep items with no date (can't filter them) and items within window
      return !pub || pub >= cutoff
    })
  }

  // Sort by date descending, undated items last
  allItems.sort((a, b) => {
    const da = parseDate(a.published)
    const db = parseDate(b.published)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return db.getTime() - da.getTime()
  })

  // Truncate to limit before scraping (so we don't scrape items we won't use)
  allItems = allItems.slice(0, limit)

  // Scrape article content
  const enriched = await scrapeArticles(allItems)

  return enriched.map((item) => ({
    id: `rss-${md5Short(item.url)}`,
    source: 'rss_feeds',
    title: item.title,
    url: item.url,
    published_at: parseDate(item.published)?.toISOString().slice(0, 10) ?? null,
    content: item.summary,
    account: item.feedTitle,
  }))
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/sensors/rss_feeds.test.ts`
Expected: PASS (or adjust tests based on readability parsing behavior — the test mocks fetch so readability may not extract from short HTML)

**Step 5: Commit**

```bash
git add frontend/src/lib/sensors/rss_feeds.ts frontend/src/lib/sensors/rss_feeds.test.ts
git commit -m "feat(sensor): add RSS feeds sensor with readability content extraction"
```

---

### Task 4: Register the sensor and add lookback support

**Files:**
- Modify: `frontend/src/lib/sensors/index.ts`

**Step 1: Register in SENSOR_REGISTRY**

In `frontend/src/lib/sensors/index.ts`, add the import at the top:

```typescript
import { fetchRssFeeds } from './rss_feeds'
```

Add to `SENSOR_REGISTRY`:

```typescript
rss_feeds: fetchRssFeeds,
```

**Step 2: Add to default sensors_enabled in models.ts**

In `frontend/src/lib/models.ts`, add to `sensors_enabled` in `defaultConfig()`:

```typescript
rss_feeds: false,
```

Note: Default to `false` since it requires user-provided URLs to be useful.

**Step 3: Run full test suite to verify nothing breaks**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add frontend/src/lib/sensors/index.ts frontend/src/lib/models.ts
git commit -m "feat(sensor): register rss_feeds in sensor registry"
```

---

### Task 5: Add RSS sensor group to Sensors.tsx UI

**Files:**
- Modify: `frontend/src/components/Sensors.tsx`

**Step 1: Add RSS to SENSOR_GROUPS**

In `frontend/src/components/Sensors.tsx`, add a new group to `SENSOR_GROUPS` after the "Social" group:

```typescript
{
  label: 'RSS',
  sensors: [
    { key: 'rss_feeds', label: 'RSS Feeds', desc: 'Custom RSS/Atom feed subscriptions' },
  ],
},
```

**Step 2: Add lookback support**

Add `rss_feeds` to `SENSOR_LOOKBACK_SUPPORT`:

```typescript
rss_feeds: 72,
```

**Step 3: Add state for rss_feed_urls**

Add state variable:

```typescript
const [rssFeedUrls, setRssFeedUrls] = useState<string[]>([])
```

In the `useEffect`, load from config:

```typescript
setRssFeedUrls(cfg.rss_feed_urls ?? [])
```

In the `save` function, include in the config update:

```typescript
rss_feed_urls: rssFeedUrls,
```

**Step 4: Add inline sub-config for rss_feeds**

In the sensor card rendering loop, after the `isSocialTopics && isOn` block, add:

```typescript
{/* Inline sub-config: RSS Feeds */}
{key === 'rss_feeds' && isOn && (
  <div style={{
    padding: '1rem 1.25rem 1.25rem 3.5rem',
    background: 'var(--canvas)',
    borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
  }}>
    <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
      Feed URLs
    </div>
    <TagInput
      tags={rssFeedUrls}
      onChange={setRssFeedUrls}
      placeholder="https://example.com/feed.xml — press Enter"
    />
  </div>
)}
```

Also update the `showSubConfig` logic to include `rss_feeds`:

```typescript
const isRssFeeds = key === 'rss_feeds'
const showSubConfig = (isSocialAccounts || isSocialTopics || isRssFeeds) && isOn
```

**Step 5: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add frontend/src/components/Sensors.tsx
git commit -m "feat(ui): add RSS Feeds sensor group to Sources page"
```

---

### Task 6: Add RSS sensor group to Settings.tsx UI

**Files:**
- Modify: `frontend/src/components/Settings.tsx`

**Step 1: Add RSS to SENSOR_GROUPS**

Same as Sensors.tsx — add group after "Social":

```typescript
{
  label: 'RSS',
  sensors: [
    { key: 'rss_feeds', label: 'RSS Feeds', desc: 'Custom RSS/Atom feed subscriptions' },
  ],
},
```

**Step 2: Add lookback support**

Add `rss_feeds: 72` to `SENSOR_LOOKBACK_SUPPORT`.

**Step 3: Add state, load, and save**

Add state:

```typescript
const [rssFeedUrls, setRssFeedUrls] = useState<string[]>([])
```

In `useEffect`, add:

```typescript
setRssFeedUrls(cfg.rss_feed_urls ?? [])
```

In `save`, add to `api.updateConfig`:

```typescript
rss_feed_urls: rssFeedUrls,
```

**Step 4: Add inline sub-config for rss_feeds**

Same UI pattern as Sensors.tsx — add after the social topics sub-config block:

```typescript
{/* Inline sub-config: RSS Feeds */}
{key === 'rss_feeds' && isOn && (
  <div style={{
    padding: '1rem 1rem 1.25rem 3.5rem',
    background: 'var(--canvas)',
    borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
  }}>
    <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
      Feed URLs
    </div>
    <TagInput
      tags={rssFeedUrls}
      onChange={setRssFeedUrls}
      placeholder="https://example.com/feed.xml — press Enter"
    />
  </div>
)}
```

Update `showSubConfig`:

```typescript
const isRssFeeds = key === 'rss_feeds'
const showSubConfig = (isSocialAccounts || isSocialTopics || isRssFeeds) && isOn
```

**Step 5: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add frontend/src/components/Settings.tsx
git commit -m "feat(ui): add RSS Feeds sensor group to Settings page"
```

---

### Task 7: Add env var fallback for rss_feed_urls

**Files:**
- Modify: `frontend/src/lib/config/index.ts`

**Step 1: Add env var fallback**

In `frontend/src/lib/config/index.ts`, in the `applyEnvFallback` function, add:

```typescript
rss_feed_urls: config.rss_feed_urls?.length
  ? config.rss_feed_urls
  : (process.env.RSS_FEED_URLS ? process.env.RSS_FEED_URLS.split(',').map(u => u.trim()).filter(Boolean) : []),
```

**Step 2: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/config/index.ts
git commit -m "feat(config): add RSS_FEED_URLS env var fallback"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS — should be baseline + new tests

**Step 2: Verify no type errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

**Step 3: Final commit if any cleanup needed**

If any test or type fixes were needed, commit them.

---

## Files Summary

| File | Change |
|------|--------|
| `frontend/src/lib/models.ts` | Add `rss_feed_urls: string[]` to ConfigSettings + defaults |
| `frontend/src/api/client.ts` | Mirror `rss_feed_urls` field |
| `frontend/src/lib/readability.ts` | New — article extraction helper using @mozilla/readability |
| `frontend/src/lib/readability.test.ts` | New — tests for extractArticle |
| `frontend/src/lib/sensors/rss_feeds.ts` | New — RSS feeds sensor |
| `frontend/src/lib/sensors/rss_feeds.test.ts` | New — sensor tests |
| `frontend/src/lib/sensors/index.ts` | Register rss_feeds in SENSOR_REGISTRY |
| `frontend/src/components/Sensors.tsx` | Add RSS group, state, save, TagInput UI |
| `frontend/src/components/Settings.tsx` | Same UI changes as Sensors.tsx |
| `frontend/src/lib/config/index.ts` | Add RSS_FEED_URLS env var fallback |
| `frontend/src/lib/models.test.ts` | Test new default |
