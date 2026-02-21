# X/Twitter Trends via Apify — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add worldwide X/Twitter trends to the `social_trends` sensor via the Apify `eunit/x-twitter-trends-scraper` actor.

**Architecture:** New `fetchXTrends()` function in `social_trends.ts` calls the Apify actor for worldwide trends, maps each trend to an `IntelItem`, and joins the existing `Promise.allSettled` alongside Bluesky and Mastodon. Gated on `config.apify_token`.

**Tech Stack:** `apify-client` (already installed), Apify actor `eunit/x-twitter-trends-scraper`

---

### Task 1: Add `fetchXTrends` and wire it into `fetchSocialTrends`

**Files:**
- Modify: `frontend/src/lib/sensors/social_trends.ts`

**Step 1: Add import and helper**

At the top of `social_trends.ts`, add the `ApifyClient` import and the trend-mapping helper:

```typescript
import { ApifyClient } from 'apify-client'
```

Add the Apify trend interface and mapping function after the existing imports:

```typescript
const X_TRENDS_ACTOR = 'eunit/x-twitter-trends-scraper'

interface ApifyTrend {
  rank: number
  name: string
  link: string
  tweet_count: string
}

interface ApifyTrendsTimeline {
  datetime: string
  timestamp: number
  trends: ApifyTrend[]
}

interface ApifyTrendsResult {
  scraped_at: string
  country_input: string
  timeline: ApifyTrendsTimeline[]
}

function formatVolume(raw: string): string | null {
  const n = parseInt(raw, 10)
  if (isNaN(n) || n <= 0) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M posts`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K posts`
  return `${n} posts`
}

function mapTrendToItem(trend: ApifyTrend): IntelItem {
  const normalized = trend.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
  return {
    id: `x-trend-${normalized}`,
    source: 'x',
    title: trend.name,
    url: trend.link || `https://x.com/search?q=${encodeURIComponent(trend.name)}`,
    heat: formatVolume(trend.tweet_count),
    account: null,
    published_at: null,
  }
}
```

**Step 2: Add `fetchXTrends` function**

After the existing `fetchMastodonTrends`, add:

```typescript
async function fetchXTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.apify_token) return []
  const client = new ApifyClient({ token: config.apify_token })
  const { defaultDatasetId } = await client.actor(X_TRENDS_ACTOR).call(
    { country: 'Worldwide' },
    { waitSecs: 120 },
  )
  if (!defaultDatasetId) return []
  const { items } = await client.dataset(defaultDatasetId).listItems()
  const result = (items as unknown as ApifyTrendsResult[])[0]
  if (!result?.timeline?.length) return []
  // Take the most recent timeline snapshot
  const latest = result.timeline[result.timeline.length - 1]
  return latest.trends.slice(0, limit).map(mapTrendToItem)
}
```

**Step 3: Wire into `fetchSocialTrends`**

Update the function to always include X trends in the `Promise.allSettled` call:

```typescript
export async function fetchSocialTrends(
  config: ConfigSettings,
  limit: number,
  platform?: 'bluesky' | 'mastodon',
): Promise<IntelItem[]> {
  const checkBsky = !platform || platform === 'bluesky'
  const checkMasto = !platform || platform === 'mastodon'

  const fetches: Promise<IntelItem[]>[] = []
  if (checkBsky) fetches.push(fetchBlueskyTrends(config, limit))
  if (checkMasto) fetches.push(fetchMastodonTrends(config, limit))
  // X trends always included when apify_token is available (not platform-filtered)
  fetches.push(fetchXTrends(config, limit))

  const results = await Promise.allSettled(fetches)

  const items: IntelItem[] = []
  const errors: string[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
    else errors.push(String(r.reason))
  }

  if (items.length === 0 && errors.length === fetches.length) {
    const target = platform ?? 'Bluesky or Mastodon'
    throw new Error(`No platform available for trends — ${platform ? `check ${target} connectivity` : 'configure Bluesky or check Mastodon connectivity'}`)
  }

  return items.slice(0, limit)
}
```

**Step 4: Update ABOUTME**

```
// ABOUTME: Social trends sensor — surfaces trending content across Bluesky, Mastodon, and X/Twitter.
// ABOUTME: Aggregates trending posts and discussions into a unified IntelItem feed. X trends via Apify actor.
```

### Task 2: Add tests for X trends

**Files:**
- Modify: `frontend/src/lib/sensors/social.test.ts`

**Step 1: Add X trends test cases**

After the existing `social_trends sensor` describe block, add:

```typescript
describe('social_trends sensor — X via Apify', () => {
  it('fetches X trends when apify_token is set', async () => {
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn().mockImplementation(() => ({
        actor: () => ({
          call: vi.fn().mockResolvedValue({ defaultDatasetId: 'ds-1' }),
        }),
        dataset: () => ({
          listItems: vi.fn().mockResolvedValue({
            items: [{
              scraped_at: '2026-02-21T12:00:00Z',
              country_input: 'Worldwide',
              timeline: [{
                datetime: '2026-02-21 12:00',
                timestamp: 1740132000,
                trends: [
                  { rank: 1, name: '#TestTrend', link: 'https://x.com/search?q=%23TestTrend', tweet_count: '150000' },
                  { rank: 2, name: 'Breaking News', link: 'https://x.com/search?q=Breaking+News', tweet_count: '50000' },
                ],
              }],
            }],
          }),
        }),
      })),
    }))
    // Also mock Mastodon to isolate X trends
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({ apify_token: 'test-token' }), 10)
    expect(items.some(i => i.source === 'x')).toBe(true)
    const xItem = items.find(i => i.id === 'x-trend--testtrend')!
    expect(xItem.title).toBe('#TestTrend')
    expect(xItem.heat).toBe('150K posts')
    expect(xItem.url).toBe('https://x.com/search?q=%23TestTrend')
    vi.doUnmock('apify-client')
  })

  it('returns empty when no apify_token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({ apify_token: null }), 10)
    // Should not throw, just no X items
    expect(items.every(i => i.source !== 'x')).toBe(true)
  })

  it('formats volume correctly', async () => {
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn().mockImplementation(() => ({
        actor: () => ({
          call: vi.fn().mockResolvedValue({ defaultDatasetId: 'ds-1' }),
        }),
        dataset: () => ({
          listItems: vi.fn().mockResolvedValue({
            items: [{
              scraped_at: '2026-02-21T12:00:00Z',
              country_input: 'Worldwide',
              timeline: [{
                datetime: '2026-02-21 12:00',
                timestamp: 1740132000,
                trends: [
                  { rank: 1, name: 'Millions', link: '', tweet_count: '2500000' },
                  { rank: 2, name: 'Thousands', link: '', tweet_count: '1500' },
                  { rank: 3, name: 'Small', link: '', tweet_count: '42' },
                  { rank: 4, name: 'Zero', link: '', tweet_count: '0' },
                ],
              }],
            }],
          }),
        }),
      })),
    }))
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({ apify_token: 'tok' }), 10)
    const x = items.filter(i => i.source === 'x')
    expect(x.find(i => i.title === 'Millions')?.heat).toBe('2.5M posts')
    expect(x.find(i => i.title === 'Thousands')?.heat).toBe('1.5K posts')
    expect(x.find(i => i.title === 'Small')?.heat).toBe('42 posts')
    expect(x.find(i => i.title === 'Zero')?.heat).toBeNull()
    vi.doUnmock('apify-client')
  })
})
```

### Task 3: Verify

**Step 1: Run tests**

```bash
cd frontend && npx vitest run
```

**Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/lib/sensors/social_trends.ts frontend/src/lib/sensors/social.test.ts
git commit -m "feat(trends): add X/Twitter worldwide trends via Apify actor"
```

## Verification

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```
