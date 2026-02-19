# Multi-Platform Social Sensors — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace grok/politics/topics sensors with 3 multi-platform sensors (accounts, topics, trends) that pull from X, Bluesky, and Mastodon under a unified "social" section.

**Architecture:** Three function-oriented sensors (`social_accounts`, `social_topics`, `social_trends`) each query multiple platform adapters (`x.ts`, `bluesky.ts`, `mastodon.ts`). Items are tagged by platform source. The Data page gets a new "Social" section with platform-based source filters. Old standalone politics/topics sections are removed.

**Tech Stack:** TypeScript, Next.js 15, `@atproto/api` (Bluesky SDK), Mastodon REST API, xAI Grok chat API, vitest + @testing-library/react.

**Design Doc:** `docs/plans/2026-02-19-social-sensors-design.md`

---

## Task 1: Install Bluesky SDK

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install @atproto/api**

Run: `cd frontend && npm install @atproto/api`

**Step 2: Verify installation**

Run: `cd frontend && node -e "require('@atproto/api')"`
Expected: exits 0

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: install @atproto/api for Bluesky integration"
```

---

## Task 2: Update Models — Add Social Section + Config Fields

**Files:**
- Modify: `frontend/src/lib/models.ts`
- Modify: `frontend/src/lib/models.test.ts`
- Modify: `frontend/src/api/client.ts`

**Step 1: Write failing tests for new config fields and section**

In `frontend/src/lib/models.test.ts`, update the existing tests:

```typescript
// In 'should have all N sections present by default' test — change 8 to 7
// New section list: tech_trends, research, capital_flow, products, community, social, insights
// (remove 'politics' and 'topics', add 'social')

it('should have all 7 sections present by default', () => {
  const report = createReport({ date: '2026-01-01', fetched_at: '2026-01-01T07:00:00Z' })
  const expected = new Set([
    'tech_trends', 'research', 'capital_flow', 'products',
    'community', 'social', 'insights',
  ])
  expect(new Set(Object.keys(report.items))).toEqual(expected)
})

// In 'should have correct defaults via createReport' — replace politics/topics checks
it('should have correct defaults via createReport', () => {
  const report = createReport({ date: '2026-01-01', fetched_at: '2026-01-01T07:00:00Z' })
  expect(report.stale).toBe(false)
  expect(report.sources_ok).toEqual([])
  expect(report.sources_failed).toEqual([])
  expect(report.items.tech_trends).toBeDefined()
  expect(report.items.research).toBeDefined()
  expect(report.items.social).toBeDefined()
})

// In 'should fill missing sections' — replace politics check
it('should fill missing sections via ensureAllSections', () => {
  const partial = { tech_trends: [] as IntelItem[] }
  const result = ensureAllSections(partial)
  expect(result.research).toBeDefined()
  expect(result.social).toBeDefined()
})

// In ConfigSettings tests — update sensors count and add new field checks
it('should have all sensors enabled by default', () => {
  const cfg = defaultConfig()
  expect(cfg.sensors_enabled.hacker_news).toBe(true)
  expect(cfg.sensors_enabled.arxiv).toBe(true)
  expect(cfg.sensors_enabled.social_accounts).toBe(true)
  expect(cfg.sensors_enabled.social_topics).toBe(true)
  expect(cfg.sensors_enabled.social_trends).toBe(true)
})

// New test for social config fields
it('should have social platform config defaults', () => {
  const cfg = defaultConfig()
  expect(cfg.bluesky_handle).toBeNull()
  expect(cfg.bluesky_app_password).toBeNull()
  expect(cfg.mastodon_token).toBeNull()
  expect(cfg.social_accounts_x).toEqual([])
  expect(cfg.social_accounts_bluesky).toEqual([])
  expect(cfg.social_accounts_mastodon).toEqual([])
  expect(cfg.social_topics_keywords).toEqual([])
})
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/models.test.ts`
Expected: FAIL — `social` section doesn't exist, new config fields don't exist

**Step 3: Update models.ts**

In `frontend/src/lib/models.ts`:

1. Replace `ALL_SECTIONS` (line 33-42): remove `'politics'` and `'topics'`, add `'social'`
2. Update `emptyItemsMap()` (line 46-57): replace `politics: []` and `topics: []` with `social: []`
3. Update `ConfigSettings` (line 129-164): add new fields, remove old ones
4. Update `defaultConfig()` (line 166-199): add new defaults, remove old ones

```typescript
export const ALL_SECTIONS = [
  'tech_trends',
  'research',
  'capital_flow',
  'products',
  'community',
  'social',
  'insights',
] as const

export function emptyItemsMap(): Record<SectionKey, IntelItem[]> {
  return {
    tech_trends: [],
    research: [],
    capital_flow: [],
    products: [],
    community: [],
    social: [],
    insights: [],
  }
}

// In ConfigSettings, replace politics_accounts and topics_keywords:
export interface ConfigSettings {
  // ... existing fields ...

  // Platform credentials
  bluesky_handle: string | null
  bluesky_app_password: string | null
  mastodon_token: string | null

  // Social sensor config
  social_accounts_x: string[]
  social_accounts_bluesky: string[]
  social_accounts_mastodon: string[]
  social_topics_keywords: string[]

  // Remove these:
  // politics_accounts: string[]
  // topics_keywords: string[]
}

// In defaultConfig(), add new defaults:
export function defaultConfig(): ConfigSettings {
  return {
    // ... existing ...
    bluesky_handle: null,
    bluesky_app_password: null,
    mastodon_token: null,
    sensors_enabled: {
      hacker_news: true,
      github: true,
      arxiv: true,
      v2ex: true,
      hn_blogs: true,
      product_hunt: true,
      sources_36kr: true,
      wallstreetcn: true,
      chrome_radar: false,
      // New social sensors replace grok/politics/topics
      social_accounts: true,
      social_topics: true,
      social_trends: true,
    },
    social_accounts_x: [],
    social_accounts_bluesky: [],
    social_accounts_mastodon: [],
    social_topics_keywords: [],
    // Remove: politics_accounts, topics_keywords
  }
}
```

Also update IntelItem comments (line 19-24): rename "Politics sensor" and "Topics sensor" to "Social sensors":

```typescript
  // Social sensors — account/handle/topic fields
  account?: string | null
  handle?: string | null
  topic?: string | null
```

**Step 4: Update api/client.ts ConfigSettings mirror**

In `frontend/src/api/client.ts` (line 9-27), update the `ConfigSettings` interface to match:
- Remove `politics_accounts` and `topics_keywords`
- Add `bluesky_handle`, `bluesky_app_password`, `mastodon_token`
- Add `social_accounts_x`, `social_accounts_bluesky`, `social_accounts_mastodon`, `social_topics_keywords`

**Step 5: Run tests**

Run: `cd frontend && npx vitest run src/lib/models.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/lib/models.ts frontend/src/lib/models.test.ts frontend/src/api/client.ts
git commit -m "feat(models): add social section and multi-platform config fields"
```

---

## Task 3: Platform Adapters

**Files:**
- Create: `frontend/src/lib/platforms/x.ts`
- Create: `frontend/src/lib/platforms/bluesky.ts`
- Create: `frontend/src/lib/platforms/mastodon.ts`
- Create: `frontend/src/lib/platforms/platforms.test.ts`

### 3a: X Platform Adapter (extracted from grok/politics/topics)

**Step 1: Write tests for x.ts**

```typescript
// platforms.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe('X platform adapter', () => {
  it('queryGrok sends chat completion and parses JSON response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '[{"title":"Test","url":"https://x.com/post"}]' } }],
      }),
    })
    const { queryGrok } = await import('./x')
    const result = await queryGrok({
      apiKey: 'key', baseUrl: 'https://api.x.ai/v1/chat/completions', model: 'grok-3',
      systemPrompt: 'return json', userPrompt: 'test',
    })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test')
  })

  it('queryGrok throws on missing API key', async () => {
    const { queryGrok } = await import('./x')
    await expect(queryGrok({
      apiKey: '', baseUrl: '', model: '',
      systemPrompt: '', userPrompt: '',
    })).rejects.toThrow()
  })
})
```

**Step 2: Run test — verify fail**

Run: `cd frontend && npx vitest run src/lib/platforms/platforms.test.ts`

**Step 3: Implement x.ts**

```typescript
// ABOUTME: X platform adapter — wraps xAI Grok chat completion API.
// ABOUTME: Shared by social_accounts, social_topics, and social_trends sensors.
import { SensorConfigError } from '../sensors/errors'

export interface GrokQuery {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
}

/** Parse Grok response text, stripping markdown fences if present. */
export function parseGrokJson(text: string): Array<Record<string, unknown>> {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.split('\n').filter(line => !line.startsWith('```')).join('\n').trim()
  }
  try {
    const data = JSON.parse(cleaned)
    if (Array.isArray(data)) return data
  } catch { /* ignore */ }
  return []
}

/** Send a chat completion to xAI Grok and return parsed JSON array. */
export async function queryGrok(query: GrokQuery): Promise<Array<Record<string, unknown>>> {
  if (!query.apiKey) throw new SensorConfigError('xAI API key not configured')

  const resp = await fetch(query.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${query.apiKey}`,
    },
    body: JSON.stringify({
      model: query.model,
      messages: [
        { role: 'system', content: query.systemPrompt },
        { role: 'user', content: query.userPrompt },
      ],
      stream: false,
      temperature: query.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`xAI API ${resp.status}: ${body}`)
  }
  const data = await resp.json() as Record<string, unknown>
  const choices = data.choices as Array<Record<string, unknown>> | undefined
  const content = String((choices?.[0]?.message as Record<string, unknown>)?.content ?? '')
  return parseGrokJson(content)
}
```

**Step 4: Run test — verify pass**

Run: `cd frontend && npx vitest run src/lib/platforms/platforms.test.ts`

### 3b: Bluesky Platform Adapter

**Step 5: Add Bluesky tests to platforms.test.ts**

```typescript
describe('Bluesky platform adapter', () => {
  it('createBlueskyAgent throws on missing credentials', async () => {
    const { createBlueskyAgent } = await import('./bluesky')
    await expect(createBlueskyAgent('', '')).rejects.toThrow()
  })

  it('stripBlueskyUri extracts rkey', () => {
    // synchronous test for URI parsing
    const { extractPostId } = await import('./bluesky')
    expect(extractPostId('at://did:plc:abc123/app.bsky.feed.post/xyz789')).toBe('xyz789')
  })
})
```

**Step 6: Implement bluesky.ts**

```typescript
// ABOUTME: Bluesky platform adapter — AT Protocol API client for feed/search operations.
// ABOUTME: Shared by social_accounts, social_topics, and social_trends sensors.
import { BskyAgent } from '@atproto/api'
import { SensorConfigError } from '../sensors/errors'
import type { IntelItem } from '../models'

/** Create and authenticate a Bluesky agent. */
export async function createBlueskyAgent(handle: string, appPassword: string): Promise<BskyAgent> {
  if (!handle || !appPassword) throw new SensorConfigError('Bluesky credentials not configured')
  const agent = new BskyAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password: appPassword })
  return agent
}

/** Extract the post rkey from an AT URI (at://did:plc:.../app.bsky.feed.post/RKEY). */
export function extractPostId(uri: string): string {
  return uri.split('/').pop() ?? uri
}

/** Build a bsky.app post URL from author handle and post rkey. */
export function buildPostUrl(authorHandle: string, rkey: string): string {
  return `https://bsky.app/profile/${authorHandle}/post/${rkey}`
}

/** Format engagement metrics from a Bluesky post view. */
export function formatBlueskyHeat(likeCount: number, repostCount: number): string | null {
  const parts: string[] = []
  if (likeCount > 0) parts.push(`${likeCount} likes`)
  if (repostCount > 0) parts.push(`${repostCount} reposts`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Convert a Bluesky FeedViewPost into an IntelItem. */
export function blueskyPostToItem(
  post: Record<string, unknown>,
  sensorPrefix: string,
): IntelItem | null {
  const author = post.author as Record<string, unknown> | undefined
  const record = post.record as Record<string, unknown> | undefined
  if (!author || !record) return null

  const text = String(record.text ?? '').trim()
  if (!text) return null

  const uri = String(post.uri ?? '')
  const rkey = extractPostId(uri)
  const handle = String(author.handle ?? '')

  return {
    id: `bluesky-${sensorPrefix}-${rkey}`,
    source: 'bluesky',
    title: text,
    url: buildPostUrl(handle, rkey),
    heat: formatBlueskyHeat(
      Number(post.likeCount ?? 0),
      Number(post.repostCount ?? 0),
    ),
    published_at: String(record.createdAt ?? '') || null,
    account: String(author.displayName ?? handle),
    handle: handle || null,
  }
}
```

### 3c: Mastodon Platform Adapter

**Step 7: Add Mastodon tests**

```typescript
describe('Mastodon platform adapter', () => {
  it('stripHtml removes tags', () => {
    const { stripHtml } = await import('./mastodon')
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('formatMastodonHeat formats counts', () => {
    const { formatMastodonHeat } = await import('./mastodon')
    expect(formatMastodonHeat(5, 3)).toBe('5 favourites · 3 boosts')
    expect(formatMastodonHeat(0, 0)).toBeNull()
  })
})
```

**Step 8: Implement mastodon.ts**

```typescript
// ABOUTME: Mastodon platform adapter — REST API client for mastodon.social.
// ABOUTME: Shared by social_accounts, social_topics, and social_trends sensors.
import { SensorConfigError } from '../sensors/errors'
import type { IntelItem } from '../models'

const MASTODON_BASE = 'https://mastodon.social'

/** Strip HTML tags from Mastodon status content. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/** Format engagement metrics from a Mastodon status. */
export function formatMastodonHeat(favourites: number, reblogs: number): string | null {
  const parts: string[] = []
  if (favourites > 0) parts.push(`${favourites} favourites`)
  if (reblogs > 0) parts.push(`${reblogs} boosts`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Authenticated GET request to Mastodon API. */
export async function mastodonGet<T>(path: string, token: string): Promise<T> {
  if (!token) throw new SensorConfigError('Mastodon token not configured')
  const resp = await fetch(`${MASTODON_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Mastodon API ${resp.status}: ${body}`)
  }
  return resp.json() as Promise<T>
}

/** Unauthenticated GET request to Mastodon API (for public endpoints like trends/hashtags). */
export async function mastodonPublicGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${MASTODON_BASE}${path}`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Mastodon API ${resp.status}: ${body}`)
  }
  return resp.json() as Promise<T>
}

/** Convert a Mastodon status JSON object into an IntelItem. */
export function mastodonStatusToItem(
  status: Record<string, unknown>,
  sensorPrefix: string,
): IntelItem | null {
  const account = status.account as Record<string, unknown> | undefined
  if (!account) return null

  const content = stripHtml(String(status.content ?? ''))
  if (!content) return null

  return {
    id: `mastodon-${sensorPrefix}-${status.id}`,
    source: 'mastodon',
    title: content,
    url: String(status.url ?? ''),
    heat: formatMastodonHeat(
      Number(status.favourites_count ?? 0),
      Number(status.reblogs_count ?? 0),
    ),
    published_at: String(status.created_at ?? '') || null,
    account: String(account.display_name ?? account.acct ?? ''),
    handle: String(account.acct ?? '') || null,
  }
}
```

**Step 9: Run all platform tests**

Run: `cd frontend && npx vitest run src/lib/platforms/platforms.test.ts`
Expected: PASS

**Step 10: Commit**

```bash
git add frontend/src/lib/platforms/
git commit -m "feat(platforms): add X, Bluesky, and Mastodon platform adapters"
```

---

## Task 4: Social Sensors — Accounts, Topics, Trends

**Files:**
- Create: `frontend/src/lib/sensors/social_accounts.ts`
- Create: `frontend/src/lib/sensors/social_topics.ts`
- Create: `frontend/src/lib/sensors/social_trends.ts`
- Create: `frontend/src/lib/sensors/social.test.ts`

### 4a: social_accounts sensor

**Step 1: Write failing test**

```typescript
// social.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defaultConfig } from '../models'
import type { ConfigSettings } from '../models'
import { SensorConfigError } from './errors'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

describe('social_accounts sensor', () => {
  it('throws SensorConfigError when no platform is configured', async () => {
    const { fetchSocialAccounts } = await import('./social_accounts')
    await expect(fetchSocialAccounts(makeConfig(), 5)).rejects.toThrow(SensorConfigError)
  })

  it('fetches X accounts via Grok when xai_api_key + accounts are set', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify([
          { handle: '@testuser', account: 'Test User', title: 'Hello world', url: 'https://x.com/post/1', published_at: '2026-02-19' },
        ]) } }],
      }),
    })
    const { fetchSocialAccounts } = await import('./social_accounts')
    const items = await fetchSocialAccounts(makeConfig({
      xai_api_key: 'key',
      social_accounts_x: ['@testuser'],
    }), 5)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].source).toBe('x')
  })
})
```

**Step 2: Run test — verify fail**

**Step 3: Implement social_accounts.ts**

```typescript
// ABOUTME: Social accounts sensor — monitors specific accounts across X, Bluesky, and Mastodon.
// ABOUTME: Aggregates posts from configured watch lists into a unified IntelItem feed.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'
import { queryGrok } from '../platforms/x'
import { createBlueskyAgent, blueskyPostToItem } from '../platforms/bluesky'
import { mastodonGet, mastodonStatusToItem } from '../platforms/mastodon'

const X_SYSTEM_PROMPT =
  'You are a social media intelligence analyst monitoring specific accounts. ' +
  'Return ONLY a valid JSON array with no markdown fences and no extra text. ' +
  'Each element must be a JSON object with exactly these keys: ' +
  '{"handle": "<@handle>", "account": "<Display Name>", "title": "<post text, max 280 chars>", ' +
  '"url": "<direct post URL or empty string>", "published_at": "<ISO date YYYY-MM-DD or empty string>"}. ' +
  'Only include REAL posts from the last 48 hours. Return 0–20 items total across all handles.'

function buildXPrompt(handles: string[], today: string): string {
  return (
    `Today is ${today}. Search X for recent posts from these accounts: ${handles.join(', ')}. ` +
    'For each account, find their 1–3 most significant posts from the last 48 hours. ' +
    'Return a JSON array. No markdown, no prose — JSON only.'
  )
}

async function fetchXAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.xai_api_key || config.social_accounts_x.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const raw = await queryGrok({
    apiKey: config.xai_api_key, baseUrl: config.xai_base_url, model: config.xai_model,
    systemPrompt: X_SYSTEM_PROMPT, userPrompt: buildXPrompt(config.social_accounts_x, today),
  })
  const items: IntelItem[] = []
  for (let idx = 0; idx < Math.min(raw.length, limit); idx++) {
    const r = raw[idx]
    if (typeof r !== 'object') continue
    const title = String(r.title ?? '').trim()
    if (!title) continue
    const handle = String(r.handle ?? '').trim().replace(/^@/, '')
    items.push({
      id: `x-accounts-${today}-${idx}`,
      source: 'x',
      title, url: String(r.url ?? ''),
      account: String(r.account ?? handle), handle: handle || null,
      published_at: String(r.published_at ?? today) || null,
    })
  }
  return items
}

async function fetchBlueskyAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.bluesky_handle || !config.bluesky_app_password || config.social_accounts_bluesky.length === 0) return []
  const agent = await createBlueskyAgent(config.bluesky_handle, config.bluesky_app_password)
  const items: IntelItem[] = []
  for (const actor of config.social_accounts_bluesky) {
    if (items.length >= limit) break
    const { data } = await agent.getAuthorFeed({ actor, limit: Math.min(5, limit) })
    for (const feedItem of data.feed) {
      if (items.length >= limit) break
      const item = blueskyPostToItem(feedItem.post as Record<string, unknown>, 'accounts')
      if (item) items.push(item)
    }
  }
  return items
}

async function fetchMastodonAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.mastodon_token || config.social_accounts_mastodon.length === 0) return []
  const items: IntelItem[] = []
  // Look up each account and fetch their statuses
  for (const acct of config.social_accounts_mastodon) {
    if (items.length >= limit) break
    const results = await mastodonGet<Array<Record<string, unknown>>>(
      `/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, config.mastodon_token,
    ).catch(() => null)
    if (!results || typeof results !== 'object') continue
    const accountId = String((results as Record<string, unknown>).id ?? '')
    if (!accountId) continue
    const statuses = await mastodonGet<Array<Record<string, unknown>>>(
      `/api/v1/accounts/${accountId}/statuses?limit=5`, config.mastodon_token,
    )
    for (const status of statuses) {
      if (items.length >= limit) break
      const item = mastodonStatusToItem(status, 'accounts')
      if (item) items.push(item)
    }
  }
  return items
}

export async function fetchSocialAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const hasX = config.xai_api_key && config.social_accounts_x.length > 0
  const hasBsky = config.bluesky_handle && config.bluesky_app_password && config.social_accounts_bluesky.length > 0
  const hasMasto = config.mastodon_token && config.social_accounts_mastodon.length > 0

  if (!hasX && !hasBsky && !hasMasto) {
    throw new SensorConfigError('No social accounts configured on any platform')
  }

  const results = await Promise.allSettled([
    fetchXAccounts(config, limit),
    fetchBlueskyAccounts(config, limit),
    fetchMastodonAccounts(config, limit),
  ])

  const items: IntelItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.slice(0, limit)
}
```

### 4b: social_topics sensor

**Step 4: Write failing test, then implement `social_topics.ts`**

Follow the same pattern as social_accounts, but:
- X: uses topics-style Grok prompt (search keywords/hashtags)
- Bluesky: uses `agent.app.bsky.feed.searchPosts({ q: keyword })`
- Mastodon: uses `mastodonPublicGet('/api/v1/timelines/tag/' + hashtag)`

### 4c: social_trends sensor

**Step 5: Write failing test, then implement `social_trends.ts`**

Follow the same pattern:
- X: uses grok-style Grok prompt (trending tech)
- Bluesky: uses `agent.getTimeline()` sorted by engagement (or getPopular if available)
- Mastodon: uses `mastodonPublicGet('/api/v1/trends/statuses')`

**Step 6: Run all social sensor tests**

Run: `cd frontend && npx vitest run src/lib/sensors/social.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add frontend/src/lib/sensors/social_accounts.ts frontend/src/lib/sensors/social_topics.ts frontend/src/lib/sensors/social_trends.ts frontend/src/lib/sensors/social.test.ts
git commit -m "feat(sensors): add multi-platform social sensors (accounts, topics, trends)"
```

---

## Task 5: Sensor Registry + Pipeline Updates

**Files:**
- Modify: `frontend/src/lib/sensors/index.ts`
- Modify: `frontend/src/lib/pipeline/collector.ts`
- Modify: `frontend/src/lib/pipeline/dedup.ts`
- Modify: `frontend/src/lib/pipeline/dedup.test.ts`
- Modify: `frontend/src/lib/sensors/sensors.test.ts`

**Step 1: Update sensor registry (index.ts)**

- Remove imports for `grok`, `politics`, `topics`
- Add imports for `social_accounts`, `social_topics`, `social_trends`
- Update `SENSOR_TOKEN_FIELD`: remove `grok`, `politics`, `topics`; add `social_accounts`, `social_topics`, `social_trends` (all map to `'xai_api_key'`)
- Update `SENSOR_REGISTRY`: replace 3 old entries with 3 new ones
- Total sensors changes from 12 to 12 (net zero)

**Step 2: Update collector.ts SENSOR_SECTION_MAP**

```typescript
// Remove:
// grok: 'tech_trends',
// politics: 'politics',
// topics: 'topics',

// Add:
social_accounts: 'social',
social_topics: 'social',
social_trends: 'social',
```

Update `GROK_SOURCES` set: `new Set(['social_accounts', 'social_topics', 'social_trends'])` (these still use Grok for the X platform adapter, so links still need verification).

Update line 141-142 dedup call: change from `politics/topics` to `social_accounts/social_topics` cross-dedup (or remove if no longer needed — within the same section, the within-section dedup handles it).

**Step 3: Update dedup.ts**

The cross-section dedup between politics/topics is no longer needed since both are now in the same `social` section. The within-section `dedupItems()` already handles title-based dedup within a section.

Replace `dedupAcrossSections()` to be a no-op or remove the call from collector.ts. Keep the function but simplify:

```typescript
export function dedupAcrossSections(
  sections: Record<string, IntelItem[]>,
): Record<string, IntelItem[]> {
  // Cross-section dedup between accounts and topics within social:
  // If the same post appears from both sensors, keep it once.
  // This is now handled by within-section dedupItems() since they share the 'social' section.
  return sections
}
```

**Step 4: Update dedup.test.ts**

Replace politics/topics references with social section tests. The cross-section tests can be simplified since dedup is now within-section only.

**Step 5: Update sensors.test.ts**

- Remove politics and grok SensorConfigError tests (lines 250-279)
- Add equivalent tests for `social_accounts`, `social_topics`, `social_trends`
- Update registry count test: still 12 sensors, but new names

```typescript
it('sensor registry has all 12 sensors', async () => {
  const { SENSOR_REGISTRY } = await import('./index')
  expect(Object.keys(SENSOR_REGISTRY)).toHaveLength(12)
  const expected = [
    'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
    'hn_blogs', 'sources_36kr', 'wallstreetcn', 'chrome_radar',
    'social_accounts', 'social_topics', 'social_trends',
  ]
  for (const name of expected) {
    expect(SENSOR_REGISTRY[name]).toBeDefined()
  }
})
```

**Step 6: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: PASS

**Step 7: Commit**

```bash
git add frontend/src/lib/sensors/index.ts frontend/src/lib/pipeline/collector.ts frontend/src/lib/pipeline/dedup.ts frontend/src/lib/pipeline/dedup.test.ts frontend/src/lib/sensors/sensors.test.ts
git commit -m "feat(pipeline): wire social sensors into registry and collector"
```

---

## Task 6: Config Migration + Env Fallback

**Files:**
- Modify: `frontend/src/lib/config/index.ts`

**Step 1: Add env var fallback for new credentials**

In `applyEnvFallback()` (line 24-33), add:

```typescript
bluesky_handle:       config.bluesky_handle       ?? process.env.BLUESKY_HANDLE       ?? null,
bluesky_app_password: config.bluesky_app_password  ?? process.env.BLUESKY_APP_PASSWORD  ?? null,
mastodon_token:       config.mastodon_token        ?? process.env.MASTODON_TOKEN        ?? null,
```

Add `'bluesky_app_password'` and `'mastodon_token'` to `KEY_FIELDS` set (line 21).

**Step 2: Add config migration in loadConfig()**

After the `return applyEnvFallback({ ...defaultConfig(), ...data })` line, add migration logic:

```typescript
// Migrate old politics_accounts → social_accounts_x
const raw = data as Record<string, unknown>
if (Array.isArray(raw.politics_accounts) && raw.politics_accounts.length > 0) {
  merged.social_accounts_x = raw.politics_accounts as string[]
}
if (Array.isArray(raw.topics_keywords) && raw.topics_keywords.length > 0) {
  merged.social_topics_keywords = raw.topics_keywords as string[]
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/config/index.ts
git commit -m "feat(config): add social platform env fallback and migration"
```

---

## Task 7: UI Updates — Data Page

**Files:**
- Modify: `frontend/src/components/Data.tsx`

**Step 1: Update SECTIONS array (line 12-21)**

Replace politics/topics with social:

```typescript
const SECTIONS: { key: string; label: string }[] = [
  { key: 'tech_trends',  label: 'Tech Trends' },
  { key: 'research',     label: 'Research' },
  { key: 'capital_flow', label: 'Capital Flow' },
  { key: 'products',     label: 'Products' },
  { key: 'community',    label: 'Community' },
  { key: 'insights',     label: 'Insights' },
  { key: 'social',       label: 'Social' },
]
```

**Step 2: Update SOURCE_LABELS (line 23-36)**

Remove `politics` and `topics`, add platform labels:

```typescript
const SOURCE_LABELS: Record<string, string> = {
  hacker_news:  'HN',
  github:       'GitHub',
  arxiv:        'ArXiv',
  product_hunt: 'PH',
  chrome_radar: 'Chrome',
  v2ex:         'V2EX',
  hn_blogs:     'HN Blogs',
  grok:         'Grok',
  sources_36kr: '36Kr',
  wallstreetcn: 'WSCN',
  x:            'X',
  bluesky:      'Bluesky',
  mastodon:     'Mastodon',
}
```

**Step 3: Update SECTION_SENSORS (line 39-48)**

```typescript
const SECTION_SENSORS: Record<string, string[]> = {
  tech_trends:  ['hacker_news', 'github'],
  research:     ['arxiv'],
  insights:     ['hn_blogs'],
  products:     ['product_hunt', 'chrome_radar'],
  community:    ['v2ex'],
  capital_flow: ['sources_36kr', 'wallstreetcn'],
  social:       ['social_accounts', 'social_topics', 'social_trends'],
}
```

Note: the source filter for the social section will show platform names (X, Bluesky, Mastodon) since item `source` is tagged by platform, not by sensor.

**Step 4: Commit**

```bash
git add frontend/src/components/Data.tsx
git commit -m "feat(data): replace politics/topics tabs with unified Social section"
```

---

## Task 8: UI Updates — Console, Status, Pipeline, Sensors, Settings, Markdown

**Files:**
- Modify: `frontend/src/components/Console.tsx` (SENSOR_LABELS)
- Modify: `frontend/src/components/Status.tsx` (ALL_SENSORS, SECTION_SENSORS)
- Modify: `frontend/src/components/Pipeline.tsx` (OUTPUT_SECTIONS)
- Modify: `frontend/src/components/Sensors.tsx` (SENSOR_GROUPS, SENSOR_LOOKBACK_SUPPORT)
- Modify: `frontend/src/components/Settings.tsx` (sensor groups)
- Modify: `frontend/src/components/ApiKeys.tsx` (add Bluesky/Mastodon fields)
- Modify: `frontend/src/lib/renderer/markdown.ts` (SECTIONS)

### Console.tsx

Replace SENSOR_LABELS (line 12-24):
- Remove `politics: 'Accounts'` and `topics: 'Topics'` and `grok: 'Grok'`
- Add `social_accounts: 'Accounts'`, `social_topics: 'Topics'`, `social_trends: 'Trends'`

### Status.tsx

Update ALL_SENSORS (line 39-51):
- Remove politics, topics, grok
- Add social_accounts ('Accounts'), social_topics ('Topics'), social_trends ('Trends')

Update SECTION_SENSORS (line 53-62):
- Remove politics and topics sections
- Replace grok in tech_trends with nothing (grok is now part of social)
- Add `{ key: 'social', label: 'Social', sensors: ['social_accounts', 'social_topics', 'social_trends'] }`

### Pipeline.tsx

Update OUTPUT_SECTIONS (line 10-19):
- Remove politics and topics
- Add `{ key: 'social', label: 'Social' }`

### Sensors.tsx

Update SENSOR_GROUPS (line 16-43):
- Replace "Grok / xAI" group with "Social" group:

```typescript
{
  label: 'Social',
  sensors: [
    { key: 'social_accounts', label: 'Accounts',  desc: 'Monitor specific accounts across X, Bluesky, Mastodon' },
    { key: 'social_topics',   label: 'Topics',     desc: 'Track keywords/hashtags across platforms' },
    { key: 'social_trends',   label: 'Trends',     desc: 'Trending content across platforms' },
  ],
},
```

Update SENSOR_LOOKBACK_SUPPORT (line 48-57):
- Remove `grok`, `politics`, `topics`
- Add `social_accounts: 48`, `social_topics: 48`, `social_trends: 24`

Update the politics-accounts sub-config section to use `social_accounts_x` field instead of `politics_accounts`. Add similar sub-configs for bluesky accounts and mastodon accounts.

Update the topics-keywords section to use `social_topics_keywords` instead of `topics_keywords`.

### Settings.tsx

Similar updates to Sensors.tsx — same sensor groups, same field renames.

### ApiKeys.tsx

Add Bluesky and Mastodon credential fields below the existing xAI/GitHub/ProductHunt keys:

```typescript
{ field: 'bluesky_handle',        label: 'Bluesky Handle',      hint: 'e.g., user.bsky.social' },
{ field: 'bluesky_app_password',  label: 'Bluesky App Password', hint: 'Generate at Settings > App Passwords on bsky.app' },
{ field: 'mastodon_token',        label: 'Mastodon Token',       hint: 'OAuth token for mastodon.social' },
```

### markdown.ts

Update SECTIONS (line 6-15):
- Remove `['politics', 'Politics', '🏛️']` and `['topics', 'Topics', '📌']`
- Add `['social', 'Social', '💬']`

**Commit**

```bash
git add frontend/src/components/Console.tsx frontend/src/components/Status.tsx frontend/src/components/Pipeline.tsx frontend/src/components/Sensors.tsx frontend/src/components/Settings.tsx frontend/src/components/ApiKeys.tsx frontend/src/lib/renderer/markdown.ts
git commit -m "feat(ui): update all components for social sensor consolidation"
```

---

## Task 9: Update E2E and Integration Tests

**Files:**
- Modify: `frontend/src/lib/e2e.test.ts`

**Step 1: Update e2e tests**

- Update section count from 8 to 7
- Replace `politics`/`topics` references with `social`
- Update cross-section dedup test (no longer cross-section, now within-section)
- Update `defaultConfig` test: check `social_accounts_x` and `social_topics_keywords` instead of `politics_accounts` and `topics_keywords`

```typescript
it('defaultConfig has all required fields', () => {
  const cfg = defaultConfig()
  expect(cfg.sensors_enabled).toBeDefined()
  expect(Object.keys(cfg.sensors_enabled)).toHaveLength(12)
  expect(cfg.fetch_time).toBe('07:51')
  expect(cfg.fetch_timezone).toBe('Asia/Shanghai')
  expect(cfg.social_accounts_x).toEqual([])
  expect(cfg.social_topics_keywords).toEqual([])
})
```

**Step 2: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/e2e.test.ts
git commit -m "test: update e2e tests for social section consolidation"
```

---

## Task 10: Delete Old Sensor Files

**Files:**
- Delete: `frontend/src/lib/sensors/grok.ts`
- Delete: `frontend/src/lib/sensors/politics.ts`
- Delete: `frontend/src/lib/sensors/topics.ts`

**Step 1: Remove old files**

```bash
rm frontend/src/lib/sensors/grok.ts frontend/src/lib/sensors/politics.ts frontend/src/lib/sensors/topics.ts
```

**Step 2: Verify no remaining imports**

Run: `grep -r "from.*['/]grok'" frontend/src/ || echo "clean"`
Run: `grep -r "from.*['/]politics'" frontend/src/ || echo "clean"`
Run: `grep -r "from.*['/]topics'" frontend/src/ || echo "clean"`

**Step 3: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add -A frontend/src/lib/sensors/
git commit -m "chore: remove old grok/politics/topics sensor files"
```

---

## Task 11: UI Polish — Social Section Card Design

**Files:**
- Modify: `frontend/src/components/Data.tsx`

The Social section should have a distinct, polished card design that surfaces the platform origin more prominently than other sections. This is where "nice UI" matters most.

**Step 1: Add platform badge to ItemCard**

For items where `source` is `'x'`, `'bluesky'`, or `'mastodon'`, show a styled platform badge with platform-specific color:

```typescript
const PLATFORM_COLORS: Record<string, { bg: string; color: string }> = {
  x:        { bg: '#1d1d1d', color: '#fff' },
  bluesky:  { bg: '#0085ff', color: '#fff' },
  mastodon: { bg: '#6364ff', color: '#fff' },
}
```

These badges appear as colored pills next to the source chip, making it easy to visually scan which platform each post came from.

**Step 2: Show author avatar-style initials**

For social items with `account` + `handle`, show a small colored circle with the first letter of the display name, followed by the display name and @handle on the same line above the post text.

**Step 3: Add engagement metrics styling**

Format heat values (likes/reposts/favourites/boosts) with subtle icons or numeric emphasis rather than plain text.

**Step 4: Run dev server and verify**

Start dev server, navigate to Social tab, verify cards render with platform badges and author info.

**Step 5: Commit**

```bash
git add frontend/src/components/Data.tsx
git commit -m "style(social): platform badges and author display for social cards"
```

---

## Task 12: Final Verification

**Step 1: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 2: Start dev server and verify**

1. Data page → Social tab shows items from configured platforms
2. Source filter shows X / Bluesky / Mastodon as filter options
3. Settings page → Bluesky handle/password and Mastodon token fields work
4. Sensors page → Social group with Accounts/Topics/Trends toggles
5. Console page → Social sensor errors display correctly
6. Status page → Social section shows sensor status
7. Pipeline page → Social section in output config

**Step 3: Check for any stale references**

```bash
grep -r "politics" frontend/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

Should return zero results.
