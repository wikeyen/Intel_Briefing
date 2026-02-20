# X Posts Sensor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a free X/Twitter sensor that scrapes posts from xcancel.com, and remove all xAI/Grok dependencies.

**Architecture:** New `x_posts` sensor fetches `https://xcancel.com/<handle>` HTML per configured account, parses tweets with `node-html-parser`, filters by lookback hours, returns `IntelItem[]`. Simultaneously remove `xai_api_key`, `xai_base_url`, `xai_model` from the entire codebase and strip Grok/X paths from the three social sensors.

**Tech Stack:** `node-html-parser` (already installed), TypeScript, Vitest

---

### Task 1: Create the x_posts sensor with tests

**Files:**
- Create: `frontend/src/lib/sensors/x_posts.ts`
- Create: `frontend/src/lib/sensors/x_posts.test.ts`

**Step 1: Write the test file**

```typescript
// ABOUTME: Tests for x_posts sensor — xcancel.com HTML scraping.
// ABOUTME: Mocks fetch to return sample xcancel HTML and verifies IntelItem mapping.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'

// We'll import after mocking
let fetchXPosts: (config: ConfigSettings, limit: number) => Promise<import('../models').IntelItem[]>

const SAMPLE_HTML = `
<html><body><div class="container">
<div class="timeline">
  <div class="timeline-item" data-username="testuser">
    <a class="tweet-link" href="/testuser/status/12345#m"></a>
    <div class="tweet-body">
      <div><div class="tweet-header">
        <div class="tweet-name-row">
          <div class="fullname-and-username">
            <a class="fullname" href="/testuser" title="Test User">Test User</a>
            <a class="username" href="/testuser" title="@testuser">@testuser</a>
          </div>
          <span class="tweet-date"><a href="/testuser/status/12345#m" title="Feb 20, 2026 · 10:33 AM UTC">6h</a></span>
        </div>
      </div></div>
      <div class="tweet-content media-body" dir="auto">Hello world this is a test tweet</div>
      <div class="tweet-stats">
        <span class="tweet-stat"><div class="icon-container"><span class="icon-comment" title=""></span> 42</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-retweet" title=""></span> 100</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-heart" title=""></span> 1,234</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-views" title=""></span> 50,000</div></span>
      </div>
    </div>
  </div>
  <div class="timeline-item" data-username="otheruser">
    <a class="tweet-link" href="/otheruser/status/67890#m"></a>
    <div class="tweet-body">
      <div>
        <div class="retweet-header"><span>Test User retweeted</span></div>
        <div class="tweet-header">
          <div class="tweet-name-row">
            <div class="fullname-and-username">
              <a class="fullname" href="/otheruser" title="Other User">Other User</a>
              <a class="username" href="/otheruser" title="@otheruser">@otheruser</a>
            </div>
            <span class="tweet-date"><a href="/otheruser/status/67890#m" title="Feb 20, 2026 · 8:00 AM UTC">8h</a></span>
          </div>
        </div>
      </div>
      <div class="tweet-content media-body" dir="auto">This is a retweet</div>
      <div class="tweet-stats">
        <span class="tweet-stat"><div class="icon-container"><span class="icon-comment" title=""></span> 10</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-retweet" title=""></span> 20</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-heart" title=""></span> 300</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-views" title=""></span> 5,000</div></span>
      </div>
    </div>
  </div>
</div>
</div></body></html>`

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn())
  const mod = await import('./x_posts')
  fetchXPosts = mod.fetchXPosts
})

function makeConfig(overrides?: Partial<ConfigSettings>): ConfigSettings {
  return { ...defaultConfig(), social_accounts_x: ['testuser'], ...overrides }
}

describe('fetchXPosts', () => {
  it('returns empty array when no X accounts configured', async () => {
    const items = await fetchXPosts(makeConfig({ social_accounts_x: [] }), 10)
    expect(items).toEqual([])
  })

  it('parses tweets from xcancel HTML', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    const items = await fetchXPosts(makeConfig(), 10)
    // Should have 1 item (retweet is skipped)
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('x_posts')
    expect(items[0].title).toBe('Hello world this is a test tweet')
    expect(items[0].url).toBe('https://x.com/testuser/status/12345')
    expect(items[0].handle).toBe('testuser')
    expect(items[0].account).toBe('Test User')
    expect(items[0].heat).toContain('1,234')
  })

  it('skips retweets', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    const items = await fetchXPosts(makeConfig(), 10)
    const ids = items.map(i => i.id)
    expect(ids).not.toContain('x-67890')
  })

  it('respects limit', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    const items = await fetchXPosts(makeConfig(), 1)
    expect(items.length).toBeLessThanOrEqual(1)
  })

  it('throws on HTTP error', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 403, text: () => Promise.resolve('Forbidden'),
    })
    await expect(fetchXPosts(makeConfig(), 10)).rejects.toThrow('403')
  })

  it('continues when one account fails', async () => {
    const config = makeConfig({ social_accounts_x: ['good', 'bad'] })
    let callCount = 0
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 2) return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') })
      return Promise.resolve({ ok: true, text: () => Promise.resolve(SAMPLE_HTML) })
    })
    const items = await fetchXPosts(config, 10)
    expect(items.length).toBeGreaterThan(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/sensors/x_posts.test.ts`
Expected: FAIL — module `./x_posts` not found

**Step 3: Write the sensor implementation**

```typescript
// ABOUTME: X posts sensor — scrapes recent tweets from xcancel.com profile pages.
// ABOUTME: Parses HTML with node-html-parser, skips retweets, filters by lookback hours.
import { parse as parseHTML } from 'node-html-parser'
import type { ConfigSettings, IntelItem } from '../models'

const XCANCEL_BASE = 'https://xcancel.com'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const FETCH_TIMEOUT = 10_000

/** Parse the date from xcancel's tweet-date title attribute, e.g. "Feb 20, 2026 · 10:33 AM UTC" */
function parseXDate(title: string): Date | null {
  // Remove the " · " separator → "Feb 20, 2026 10:33 AM UTC"
  const cleaned = title.replace(' · ', ' ')
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? null : d
}

/** Format a number string with commas removed for comparison. */
function cleanNumber(s: string): string {
  return s.replace(/,/g, '').trim()
}

async function fetchAccountPosts(handle: string, lookbackMs: number): Promise<IntelItem[]> {
  const resp = await fetch(`${XCANCEL_BASE}/${handle}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!resp.ok) {
    throw new Error(`xcancel ${resp.status} for @${handle}`)
  }
  const html = await resp.text()
  const root = parseHTML(html)
  const now = Date.now()
  const cutoff = now - lookbackMs
  const items: IntelItem[] = []

  for (const el of root.querySelectorAll('.timeline-item')) {
    // Skip retweets
    if (el.querySelector('.retweet-header')) continue

    // Tweet link → extract status ID
    const linkEl = el.querySelector('.tweet-link')
    const href = linkEl?.getAttribute('href') ?? ''
    const statusMatch = href.match(/\/status\/(\d+)/)
    if (!statusMatch) continue
    const statusId = statusMatch[1]

    // Date
    const dateEl = el.querySelector('.tweet-date a')
    const dateTitle = dateEl?.getAttribute('title') ?? ''
    const pubDate = parseXDate(dateTitle)
    if (pubDate && pubDate.getTime() < cutoff) continue

    // Tweet text
    const contentEl = el.querySelector('.tweet-content')
    const title = contentEl?.textContent?.trim() ?? ''
    if (!title) continue

    // Author
    const fullnameEl = el.querySelector('.fullname')
    const usernameEl = el.querySelector('.username')
    const account = fullnameEl?.textContent?.trim() ?? handle
    const authorHandle = (usernameEl?.textContent?.trim() ?? `@${handle}`).replace(/^@/, '')

    // Engagement stats
    const stats = el.querySelectorAll('.tweet-stat')
    const statValues = stats.map(s => s.textContent?.trim() ?? '')
    // Order: comments, retweets, likes, views
    const likes = statValues[2] ?? ''
    const retweets = statValues[1] ?? ''
    const heat = [likes ? `${likes} likes` : '', retweets ? `${retweets} retweets` : '']
      .filter(Boolean).join(' · ')

    items.push({
      id: `x-${statusId}`,
      source: 'x_posts',
      title: title.slice(0, 280),
      url: `https://x.com/${authorHandle}/status/${statusId}`,
      heat: heat || null,
      account,
      handle: authorHandle,
      published_at: pubDate?.toISOString() ?? null,
    })
  }

  return items
}

export async function fetchXPosts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const handles = config.social_accounts_x
  if (!handles || handles.length === 0) return []

  const lookbackHours = config.sensor_lookback_hours?.x_posts ?? 48
  const lookbackMs = lookbackHours * 60 * 60 * 1000

  const results = await Promise.allSettled(
    handles.map(h => fetchAccountPosts(h.replace(/^@/, ''), lookbackMs))
  )

  const items: IntelItem[] = []
  const seenIds = new Set<string>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const item of r.value) {
      if (seenIds.has(item.id)) continue
      seenIds.add(item.id)
      items.push(item)
      if (items.length >= limit) break
    }
    if (items.length >= limit) break
  }

  return items
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/sensors/x_posts.test.ts`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add frontend/src/lib/sensors/x_posts.ts frontend/src/lib/sensors/x_posts.test.ts
git commit -m "feat(sensor): add x_posts sensor — scrapes xcancel.com profiles"
```

---

### Task 2: Register x_posts sensor in taxonomy and registry

**Files:**
- Modify: `frontend/src/lib/sensors/taxonomy.ts:23` — add x_posts entry before social_accounts
- Modify: `frontend/src/lib/sensors/index.ts:12,32` — import and register fetchXPosts

**Step 1: Add to taxonomy**

In `taxonomy.ts`, add after `hn_blogs` line (line 22) and before `social_accounts`:
```typescript
  { key: 'x_posts',        label: 'X Posts',          desc: 'Recent posts from monitored X accounts via xcancel',  language: 'row', category: 'social' },
```

**Step 2: Add to registry**

In `index.ts`, add import:
```typescript
import { fetchXPosts } from './x_posts'
```

Add to `SENSOR_REGISTRY`:
```typescript
  x_posts: fetchXPosts,
```

**Step 3: Add to default sensors_enabled**

In `frontend/src/lib/models.ts:303-319`, add `x_posts: true` to the `sensors_enabled` object in `defaultConfig()`.

**Step 4: Add to SOURCE_URLS**

In `frontend/src/lib/models.ts:160-177`, add:
```typescript
  x_posts:          'https://x.com',
```

**Step 5: Run all sensor tests**

Run: `cd frontend && npx vitest run src/lib/sensors/`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/lib/sensors/taxonomy.ts frontend/src/lib/sensors/index.ts frontend/src/lib/models.ts
git commit -m "feat(sensor): register x_posts in taxonomy and sensor registry"
```

---

### Task 3: Remove xAI/Grok from ConfigSettings and defaults

**Files:**
- Modify: `frontend/src/lib/models.ts:229-233,296-300` — remove xai_* fields from interface + defaultConfig
- Modify: `frontend/src/api/client.ts:10-12` — remove xai_* fields from client ConfigSettings
- Modify: `frontend/src/lib/config/index.ts:16,24,66-68` — remove GROK_TIMEOUT, xai from KEY_FIELDS, env overrides
- Modify: `config/settings.default.yaml:12-14` — remove xai section

**Step 1: Remove from models.ts**

In `ConfigSettings` interface, delete lines 231-233:
```
  xai_api_key: string | null
  xai_base_url: string
  xai_model: string
```

In `defaultConfig()`, delete lines 298-300:
```
    xai_api_key: null,
    xai_base_url: 'https://api.x.ai/v1/chat/completions',
    xai_model: 'grok-3',
```

**Step 2: Remove from api/client.ts**

In the client-side `ConfigSettings` interface, delete:
```
  xai_api_key: string | null
  xai_base_url: string
  xai_model: string
```

**Step 3: Remove from config/index.ts**

- Delete line 16: `export const GROK_TIMEOUT = 60_000`
- Remove `'xai_api_key'` from the `KEY_FIELDS` set on line 24
- Delete the xai env override lines (66-68):
  ```
    xai_api_key:          env.XAI_API_KEY          ?? config.xai_api_key,
    xai_base_url:         env.XAI_BASE_URL         || config.xai_base_url,
    xai_model:            env.XAI_MODEL            || config.xai_model,
  ```

**Step 4: Remove from settings.default.yaml**

Delete lines 12-14:
```yaml
# --- Grok / xAI ---
xai_base_url: https://api.x.ai/v1/chat/completions
xai_model: grok-3
```

And remove `# xai_api_key: null` from the commented keys section (line 5).

**Step 5: Run config tests**

Run: `cd frontend && npx vitest run src/lib/config/`
Expected: Some tests may fail if they reference xai fields — fix those

**Step 6: Commit**

```bash
git add frontend/src/lib/models.ts frontend/src/api/client.ts frontend/src/lib/config/index.ts config/settings.default.yaml
git commit -m "refactor: remove xai_api_key, xai_base_url, xai_model from config"
```

---

### Task 4: Remove Grok platform and strip X from social sensors

**Files:**
- Delete: `frontend/src/lib/platforms/x.ts`
- Modify: `frontend/src/lib/platforms/platforms.test.ts` — remove Grok tests
- Modify: `frontend/src/lib/sensors/social_accounts.ts` — remove fetchXAccounts + Grok import
- Modify: `frontend/src/lib/sensors/social_topics.ts` — remove fetchXTopics + Grok import
- Modify: `frontend/src/lib/sensors/social_trends.ts` — remove fetchXTrends + Grok import

**Step 1: Delete the Grok platform file**

```bash
rm frontend/src/lib/platforms/x.ts
```

**Step 2: Strip X from social_accounts.ts**

Remove the import of `queryGrok`, the `X_SYSTEM_PROMPT` constant, `buildXPrompt()`, and the entire `fetchXAccounts()` function. In `fetchSocialAccounts()`:
- Remove the `hasX` check
- Remove `fetchXAccounts` from the `Promise.allSettled` array
- Update the SensorConfigError message to say "Bluesky or Mastodon" instead of mentioning X

**Step 3: Strip X from social_topics.ts**

Remove the import of `queryGrok`, the `X_SYSTEM_PROMPT` constant, `buildXPrompt()`, and the entire `fetchXTopics()` function. In `fetchSocialTopics()`:
- Remove `fetchXTopics` from the `Promise.allSettled` array

**Step 4: Strip X from social_trends.ts**

Remove the import of `queryGrok`, the `X_SYSTEM_PROMPT` constant, `buildXPrompt()`, and the entire `fetchXTrends()` function. In `fetchSocialTrends()`:
- Remove `fetchXTrends` from the `Promise.allSettled` array
- Remove the `hasX` check
- Update error messages to remove xAI reference

**Step 5: Update social sensor descriptions in taxonomy.ts**

Change the `desc` for social_accounts/topics/trends to say "Bluesky, Mastodon" instead of "X, Bluesky, Mastodon".

**Step 6: Clean up platforms.test.ts**

Remove any test cases that test `parseGrokJson`, `queryGrok`, or the X platform adapter. Keep Bluesky and Mastodon tests.

**Step 7: Run social sensor tests**

Run: `cd frontend && npx vitest run src/lib/sensors/social.test.ts src/lib/platforms/platforms.test.ts`
Expected: Some tests will fail due to removed Grok references — fix by removing those test cases

**Step 8: Commit**

```bash
git rm frontend/src/lib/platforms/x.ts
git add frontend/src/lib/sensors/social_accounts.ts frontend/src/lib/sensors/social_topics.ts frontend/src/lib/sensors/social_trends.ts frontend/src/lib/sensors/taxonomy.ts frontend/src/lib/platforms/platforms.test.ts frontend/src/lib/sensors/social.test.ts
git commit -m "refactor: remove Grok/xAI platform, strip X from social sensors"
```

---

### Task 5: Remove xAI fields from Connections UI

**Files:**
- Modify: `frontend/src/components/ApiKeys.tsx:17-28` — remove xAI entries from KEY_GROUPS

**Step 1: Remove xAI from AI Providers group**

In `KEY_GROUPS`, the first group ('AI Providers') currently has:
```typescript
secrets: [
  { field: 'summary_api_key', ... },
  { field: 'xai_api_key', ... },  // DELETE this line
],
plains: [
  { field: 'xai_model', ... },     // DELETE this line
  { field: 'xai_base_url', ... },  // DELETE this line
],
```

Remove the `xai_api_key` secret and the entire `plains` array from the AI Providers group (since only xAI fields were in it).

**Step 2: Run frontend build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no type errors referencing removed xai fields)

**Step 3: Commit**

```bash
git add frontend/src/components/ApiKeys.tsx
git commit -m "fix(ui): remove xAI key/model/url from Connections page"
```

---

### Task 6: Fix all remaining xAI references in tests and docs

**Files:**
- Modify: `frontend/src/lib/models.test.ts` — remove xai field assertions
- Modify: `frontend/src/lib/api.test.ts` — remove xai field assertions
- Modify: `frontend/src/lib/config/index.test.ts` — remove xai assertions and env override tests
- Modify: `frontend/src/lib/e2e.test.ts` — remove xai references if any
- Modify: `docs/api-reference.md` — remove xai fields from config docs
- Modify: `.env.example` — remove XAI_API_KEY etc.

**Step 1: Search for all remaining xai references**

Run: `cd frontend && grep -r 'xai_api_key\|xai_base_url\|xai_model\|GROK_TIMEOUT' src/ --include='*.ts' --include='*.tsx' -l`

Fix each file by removing xai-related assertions, mock data, and references.

**Step 2: Update docs/api-reference.md**

Remove `xai_api_key`, `xai_base_url`, `xai_model` from the ConfigSettings documentation and masked fields list.

**Step 3: Update .env.example**

Remove any `XAI_API_KEY`, `XAI_BASE_URL`, `XAI_MODEL` entries.

**Step 4: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: remove all remaining xAI/Grok references from tests and docs"
```

---

### Task 7: Update layout.tsx PAGE_DESCS for x_posts and verify

**Files:**
- Modify: `frontend/src/app/(ui)/layout.tsx` — no change needed if x_posts doesn't have its own page (it shows in Data page under social category)

**Step 1: Run the full test suite one final time**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 2: Start dev server and manually verify**

Run: `cd frontend && npm run dev`

Verify:
- Sensors page shows "X Posts" under Social
- Connections page has no xAI fields
- Data page shows x_posts items under Social category (if accounts are configured)

**Step 3: Final commit and push**

```bash
git push
```
