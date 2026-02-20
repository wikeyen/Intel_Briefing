# Centralized Taxonomy + CN Hot-List Sensors — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the duplicated section/sensor grouping system with a single centralized taxonomy, rename `SectionKey` to `CategoryKey` with shorter keys, and add three new Chinese-platform hot-list sensors (Weibo, Zhihu, Xiaohongshu).

**Architecture:** A new `taxonomy.ts` file becomes the single source of truth for every sensor's key, label, description, language (`cn`/`row`), category, and emoji. All downstream consumers (pipeline, UI components, renderer, API routes) derive their data from this one file. The existing 8 `SectionKey` values are replaced by 8 `CategoryKey` values (`tech_trends`→`tech`, `capital_flow`→`finance`, rest unchanged).

**Tech Stack:** TypeScript, Next.js 15 App Router, Vitest, SQLite (libsql)

---

### Task 1: Create the Centralized Taxonomy

The foundation everything else builds on.

**Files:**
- Create: `frontend/src/lib/sensors/taxonomy.ts`

**Step 1: Write the failing test**

Add to `frontend/src/lib/sensors/sensors.test.ts`:

```typescript
describe('Taxonomy', () => {
  it('exports ALL_CATEGORIES with 8 category keys', async () => {
    const { ALL_CATEGORIES } = await import('./taxonomy')
    expect(ALL_CATEGORIES).toHaveLength(8)
    expect(ALL_CATEGORIES).toContain('tech')
    expect(ALL_CATEGORIES).toContain('finance')
    expect(ALL_CATEGORIES).toContain('research')
    expect(ALL_CATEGORIES).toContain('products')
    expect(ALL_CATEGORIES).toContain('community')
    expect(ALL_CATEGORIES).toContain('social')
    expect(ALL_CATEGORIES).toContain('insights')
    expect(ALL_CATEGORIES).toContain('feeds')
  })

  it('SENSOR_CATEGORY_MAP maps every sensor to a valid category', async () => {
    const { SENSOR_CATEGORY_MAP, ALL_CATEGORIES } = await import('./taxonomy')
    const catSet = new Set(ALL_CATEGORIES)
    for (const [sensor, cat] of Object.entries(SENSOR_CATEGORY_MAP)) {
      expect(catSet.has(cat), `sensor '${sensor}' maps to unknown category '${cat}'`).toBe(true)
    }
  })

  it('SENSOR_LABELS has an entry for every sensor in the registry', async () => {
    const { SENSOR_REGISTRY } = await import('./index')
    const { SENSOR_LABELS } = await import('./taxonomy')
    for (const key of Object.keys(SENSOR_REGISTRY)) {
      expect(SENSOR_LABELS[key], `missing label for sensor '${key}'`).toBeDefined()
    }
  })

  it('every sensor has a language of cn or row', async () => {
    const { SENSORS } = await import('./taxonomy')
    for (const s of SENSORS) {
      expect(['cn', 'row']).toContain(s.language)
    }
  })

  it('sensorsByLanguageAndCategory returns grouped structure', async () => {
    const { sensorsByLanguageAndCategory } = await import('./taxonomy')
    const groups = sensorsByLanguageAndCategory()
    expect(groups).toHaveLength(2) // cn and row
    for (const group of groups) {
      expect(['cn', 'row']).toContain(group.language)
      expect(group.categories.length).toBeGreaterThan(0)
      for (const cat of group.categories) {
        expect(cat.sensors.length).toBeGreaterThan(0)
      }
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: FAIL — module `./taxonomy` not found

**Step 3: Write the taxonomy module**

Create `frontend/src/lib/sensors/taxonomy.ts`:

```typescript
// ABOUTME: Centralized sensor taxonomy — single source of truth for all sensor metadata.
// ABOUTME: Declares every sensor's key, label, description, language, category, and emoji.

export const ALL_CATEGORIES = [
  'tech',
  'research',
  'finance',
  'products',
  'community',
  'social',
  'insights',
  'feeds',
] as const

export type CategoryKey = (typeof ALL_CATEGORIES)[number]

export interface SensorDef {
  key: string
  label: string
  desc: string
  language: 'cn' | 'row'
  category: CategoryKey
}

export const SENSORS: SensorDef[] = [
  // ROW — Tech
  { key: 'hacker_news',  label: 'Hacker News',      desc: 'Top stories from news.ycombinator.com',          language: 'row', category: 'tech' },
  { key: 'github',       label: 'GitHub Trending',   desc: 'Daily trending repositories',                    language: 'row', category: 'tech' },
  // ROW — Research
  { key: 'arxiv',        label: 'ArXiv AI',          desc: 'Latest AI/ML research preprints',                language: 'row', category: 'research' },
  // ROW — Products
  { key: 'product_hunt', label: 'Product Hunt',      desc: 'Top products of the day',                        language: 'row', category: 'products' },
  { key: 'chrome_radar', label: 'Chrome Radar',      desc: 'Chrome Web Store surveillance',                  language: 'row', category: 'products' },
  // ROW — Insights
  { key: 'hn_blogs',     label: 'HN Blogs',          desc: 'Curated blog posts from Hacker News',            language: 'row', category: 'insights' },
  // ROW — Social
  { key: 'social_accounts', label: 'Social Accounts', desc: 'Monitor accounts across X, Bluesky, Mastodon', language: 'row', category: 'social' },
  { key: 'social_topics',   label: 'Social Topics',   desc: 'Track keywords across X, Bluesky, Mastodon',  language: 'row', category: 'social' },
  { key: 'social_trends',   label: 'Social Trends',   desc: 'Trending content across X, Bluesky, Mastodon',language: 'row', category: 'social' },
  // ROW — Feeds
  { key: 'rss_feeds',    label: 'RSS Feeds',          desc: 'Custom RSS/Atom feed subscriptions',            language: 'row', category: 'feeds' },
  // CN — Finance
  { key: 'sources_36kr', label: '36Kr',               desc: 'Chinese startup and tech news',                 language: 'cn',  category: 'finance' },
  { key: 'wallstreetcn', label: 'WallStreetCN',       desc: 'Chinese financial and macro news',              language: 'cn',  category: 'finance' },
  // CN — Community
  { key: 'v2ex',         label: 'V2EX',               desc: 'Chinese tech community hot posts',              language: 'cn',  category: 'community' },
  { key: 'zhihu',        label: 'Zhihu',              desc: 'Zhihu trending questions and discussions',      language: 'cn',  category: 'community' },
  // CN — Social
  { key: 'weibo',        label: 'Weibo',              desc: 'Weibo real-time hot search trending',           language: 'cn',  category: 'social' },
  { key: 'xiaohongshu',  label: 'Xiaohongshu',        desc: 'Xiaohongshu trending topics',                   language: 'cn',  category: 'social' },
]

// --- Derived exports ---

/** Maps each sensor key to its report category. */
export const SENSOR_CATEGORY_MAP: Record<string, CategoryKey> = Object.fromEntries(
  SENSORS.map(s => [s.key, s.category]),
)

/** Human-readable sensor labels. */
export const SENSOR_LABELS: Record<string, string> = Object.fromEntries(
  SENSORS.map(s => [s.key, s.label]),
)

/** Display metadata per category. */
export const CATEGORY_META: Record<CategoryKey, { label: string; emoji: string }> = {
  tech:      { label: 'Tech',      emoji: '🔥' },
  research:  { label: 'Research',  emoji: '📄' },
  finance:   { label: 'Finance',   emoji: '💰' },
  products:  { label: 'Products',  emoji: '🚀' },
  community: { label: 'Community', emoji: '🗣️' },
  social:    { label: 'Social',    emoji: '📱' },
  insights:  { label: 'Insights',  emoji: '💡' },
  feeds:     { label: 'Feeds',     emoji: '📰' },
}

/** Language display labels. */
export const LANGUAGE_LABELS: Record<'cn' | 'row', string> = {
  row: 'ROW',
  cn: 'CN',
}

export interface CategoryGroup {
  category: CategoryKey
  label: string
  sensors: SensorDef[]
}

export interface LanguageGroup {
  language: 'cn' | 'row'
  label: string
  categories: CategoryGroup[]
}

/** Group sensors by language → category for UI rendering. */
export function sensorsByLanguageAndCategory(): LanguageGroup[] {
  const groups: LanguageGroup[] = []

  for (const lang of ['row', 'cn'] as const) {
    const langSensors = SENSORS.filter(s => s.language === lang)
    const catMap = new Map<CategoryKey, SensorDef[]>()

    for (const sensor of langSensors) {
      const list = catMap.get(sensor.category) ?? []
      list.push(sensor)
      catMap.set(sensor.category, list)
    }

    const categories: CategoryGroup[] = []
    for (const catKey of ALL_CATEGORIES) {
      const sensors = catMap.get(catKey)
      if (sensors && sensors.length > 0) {
        categories.push({
          category: catKey,
          label: CATEGORY_META[catKey].label,
          sensors,
        })
      }
    }

    if (categories.length > 0) {
      groups.push({
        language: lang,
        label: LANGUAGE_LABELS[lang],
        categories,
      })
    }
  }

  return groups
}

/** Reverse map: for a given category, which sensor keys feed into it? */
export function sensorsForCategory(category: CategoryKey): string[] {
  return SENSORS.filter(s => s.category === category).map(s => s.key)
}

/** Generate an empty items map keyed by CategoryKey. */
export function emptyCategoryMap(): Record<CategoryKey, never[]> {
  return Object.fromEntries(ALL_CATEGORIES.map(k => [k, []])) as Record<CategoryKey, never[]>
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: Taxonomy tests pass (registry count test will fail — that's updated in Task 3)

**Step 5: Commit**

```bash
git add frontend/src/lib/sensors/taxonomy.ts frontend/src/lib/sensors/sensors.test.ts
git commit -m "feat(taxonomy): add centralized sensor taxonomy as single source of truth"
```

---

### Task 2: Update models.ts — SectionKey → CategoryKey

Replace `SectionKey` with `CategoryKey` imported from taxonomy. Update all exports.

**Files:**
- Modify: `frontend/src/lib/models.ts`
- Modify: `frontend/src/api/client.ts`

**Step 1: Update `models.ts`**

Replace `ALL_SECTIONS`, `SectionKey`, `emptyItemsMap`, `ensureAllSections` with taxonomy-derived versions. Specifically:

- Remove `ALL_SECTIONS` const and `SectionKey` type definition (lines 31-42)
- Re-export `ALL_CATEGORIES as ALL_SECTIONS` and `CategoryKey as SectionKey` from taxonomy for backwards compatibility during migration
- Update `emptyItemsMap()` to use new category keys (`tech`, `finance` instead of `tech_trends`, `capital_flow`)
- Update `ensureAllSections` accordingly
- Update `IntelReport.items` type
- Add new sensor source URLs for weibo, zhihu, xiaohongshu to `SOURCE_URLS`

The key renames in `emptyItemsMap`:
- `tech_trends` → `tech`
- `capital_flow` → `finance`
- (others remain the same)

**Step 2: Run tests to check for breakage**

Run: `cd frontend && npx vitest run`
Expected: Many tests fail due to section key renames — we'll fix them in subsequent tasks

**Step 3: Commit**

```bash
git add frontend/src/lib/models.ts frontend/src/api/client.ts
git commit -m "refactor(models): replace SectionKey with CategoryKey, rename tech_trends→tech and capital_flow→finance"
```

---

### Task 3: Create 3 New Sensor Files + Register

**Files:**
- Create: `frontend/src/lib/sensors/weibo.ts`
- Create: `frontend/src/lib/sensors/zhihu.ts`
- Create: `frontend/src/lib/sensors/xiaohongshu.ts`
- Modify: `frontend/src/lib/sensors/index.ts`
- Modify: `frontend/src/lib/sensors/sensors.test.ts`

**Step 1: Write failing tests for the 3 new sensors**

Add to `sensors.test.ts`:

```typescript
describe('WeiboSensor', () => {
  it('returns intel items from hot search', async () => {
    const mockData = {
      ok: 1,
      data: {
        realtime: [
          { mid: '1001', word: 'test topic', num: 50000, label_name: 'Hot', word_scheme: '#test topic' },
          { mid: '1002', word: 'another topic', num: 30000, label_name: '', word_scheme: '' },
        ],
      },
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })
    const { fetchWeibo } = await import('./weibo')
    const items = await fetchWeibo(makeConfig(), 5)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.source).toBe('weibo')
      expect(item.id).toMatch(/^weibo-/)
      expect(item.url).toContain('s.weibo.com')
    }
    expect(items[0].heat).toBe('50000')
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { fetchWeibo } = await import('./weibo')
    await expect(fetchWeibo(makeConfig(), 5)).rejects.toThrow('HTTP 500')
  })

  it('returns empty array when ok !== 1', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: 0, data: {} }),
    })
    const { fetchWeibo } = await import('./weibo')
    const items = await fetchWeibo(makeConfig(), 5)
    expect(items).toHaveLength(0)
  })
})

describe('ZhihuSensor', () => {
  it('returns intel items from hot list', async () => {
    const mockData = {
      data: [
        {
          id: 'z1',
          target: { title: 'Zhihu Question 1' },
          detail_text: '500 万热度',
          card_id: 'Q_12345',
          children: [{ thumbnail: 'https://pic.zhimg.com/thumb.jpg' }],
        },
      ],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })
    const { fetchZhihu } = await import('./zhihu')
    const items = await fetchZhihu(makeConfig(), 5)
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('zhihu')
    expect(items[0].id).toMatch(/^zhihu-/)
    expect(items[0].url).toContain('zhihu.com/question/12345')
    expect(items[0].heat).toBe('5000000')
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    const { fetchZhihu } = await import('./zhihu')
    await expect(fetchZhihu(makeConfig(), 5)).rejects.toThrow('HTTP 403')
  })
})

describe('XiaohongshuSensor', () => {
  it('returns intel items from hot list', async () => {
    const mockData = {
      success: true,
      data: {
        items: [
          { id: 'xhs1', title: 'XHS Topic 1', score: 99000, word_type: 'Hot' },
          { id: 'xhs2', title: 'XHS Topic 2', score: 50000, word_type: '无' },
        ],
      },
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })
    const { fetchXiaohongshu } = await import('./xiaohongshu')
    const items = await fetchXiaohongshu(makeConfig(), 5)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.source).toBe('xiaohongshu')
      expect(item.id).toMatch(/^xhs-/)
      expect(item.url).toContain('xiaohongshu.com')
    }
    expect(items[0].heat).toBe('99000')
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { fetchXiaohongshu } = await import('./xiaohongshu')
    await expect(fetchXiaohongshu(makeConfig(), 5)).rejects.toThrow('HTTP 500')
  })
})
```

Also update the `SensorProtocolCompliance` test to expect 16 sensors:

```typescript
it('sensor registry has all 16 sensors', async () => {
  const { SENSOR_REGISTRY } = await import('./index')
  expect(Object.keys(SENSOR_REGISTRY)).toHaveLength(16)
  const expected = [
    'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
    'hn_blogs', 'social_accounts', 'social_topics', 'social_trends',
    'sources_36kr', 'wallstreetcn', 'chrome_radar', 'rss_feeds',
    'weibo', 'zhihu', 'xiaohongshu',
  ]
  for (const name of expected) {
    expect(SENSOR_REGISTRY[name]).toBeDefined()
    expect(typeof SENSOR_REGISTRY[name]).toBe('function')
  }
})
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: FAIL — modules not found, registry count wrong

**Step 3: Create `weibo.ts`**

```typescript
// ABOUTME: Weibo sensor using the public hot search API.
// ABOUTME: Fetches real-time trending topics from China's largest microblogging platform.
import type { ConfigSettings, IntelItem } from '../models'

const WEIBO_URL = 'https://weibo.com/ajax/side/hotSearch'

export async function fetchWeibo(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(WEIBO_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://weibo.com/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Weibo`)

    const body = await resp.json() as Record<string, unknown>
    if ((body as { ok?: number }).ok !== 1) return []

    const realtime = ((body.data as Record<string, unknown>)?.realtime as Array<Record<string, unknown>>) ?? []
    const items: IntelItem[] = []

    for (const entry of realtime.slice(0, limit)) {
      const word = String(entry.word ?? '')
      if (!word) continue
      const scheme = entry.word_scheme ? String(entry.word_scheme) : `#${word}`

      items.push({
        id: `weibo-${entry.mid ?? word}`,
        source: 'weibo',
        title: word,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(scheme)}&t=31&band_rank=1&Refer=top`,
        heat: String(entry.num ?? '0'),
      })
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
```

**Step 4: Create `zhihu.ts`**

```typescript
// ABOUTME: Zhihu sensor using the public hot list API.
// ABOUTME: Fetches trending questions from China's largest Q&A platform.
import type { ConfigSettings, IntelItem } from '../models'

const ZHIHU_URL = 'https://api.zhihu.com/topstory/hot-list'

export async function fetchZhihu(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(ZHIHU_URL, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Zhihu`)

    const body = await resp.json() as Record<string, unknown>
    const data = (body.data as Array<Record<string, unknown>>) ?? []
    const items: IntelItem[] = []

    for (const entry of data.slice(0, limit)) {
      const target = entry.target as Record<string, unknown> | undefined
      if (!target) continue
      const title = String(target.title ?? '')
      if (!title) continue

      const detailText = String(entry.detail_text ?? '')
      const rawNum = parseInt(detailText.replace(/[^\d]/g, ''), 10)
      const heat = !isNaN(rawNum) ? String(rawNum * 10000) : '0'

      const cardId = String(entry.card_id ?? '')
      const questionId = cardId.replace('Q_', '')

      items.push({
        id: `zhihu-${entry.id ?? questionId}`,
        source: 'zhihu',
        title,
        url: `https://www.zhihu.com/question/${questionId}`,
        heat,
      })
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
```

**Step 5: Create `xiaohongshu.ts`**

```typescript
// ABOUTME: Xiaohongshu sensor using the mobile hot list API.
// ABOUTME: Fetches trending search topics from China's lifestyle-sharing platform.
import type { ConfigSettings, IntelItem } from '../models'

const XHS_URL = 'https://edith.xiaohongshu.com/api/sns/v1/search/hot_list'

const XHS_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.7(0x18000733) NetType/WIFI Language/zh_CN',
  'referer': 'https://app.xhs.cn/',
  'xy-direction': '22',
  'shield': 'XYAAAAAQAAAAEAAABTAAAAUzUWEe4xG1IYD9/c+qCLOlKGmTtFa+lG434Oe+FTRagxxoaz6rUWSZ3+juJYz8RZqct+oNMyZQxLEBaBEL+H3i0RhOBVGrauzVSARchIWFYwbwkV',
  'xy-platform-info': 'platform=iOS&version=8.7&build=8070515&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&bundle=com.xingin.discover',
  'xy-common-params': 'app_id=ECFAAF02&build=8070515&channel=AppStore&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&device_fingerprint=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_fingerprint1=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_model=phone&fid=1695182528-0-0-63b29d709954a1bb8c8733eb2fb58f29&gid=7dc4f3d168c355f1a886c54a898c6ef21fe7b9a847359afc77fc24ad&identifier_flag=0&lang=zh-Hans&launch_id=716882697&platform=iOS&project_id=ECFAAF&sid=session.1695189743787849952190&t=1695190591&teenager=0&tz=Asia/Shanghai&uis=light&version=8.7',
}

export async function fetchXiaohongshu(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(XHS_URL, {
      headers: XHS_HEADERS,
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Xiaohongshu`)

    const body = await resp.json() as Record<string, unknown>
    if (!(body as { success?: boolean }).success) return []

    const rawItems = ((body.data as Record<string, unknown>)?.items as Array<Record<string, unknown>>) ?? []
    const items: IntelItem[] = []

    for (const entry of rawItems.slice(0, limit)) {
      const title = String(entry.title ?? '')
      if (!title) continue

      items.push({
        id: `xhs-${entry.id ?? title}`,
        source: 'xiaohongshu',
        title,
        url: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(title)}`,
        heat: String(entry.score ?? '0'),
      })
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
```

**Step 6: Update `sensors/index.ts`**

Add imports and registry entries for the 3 new sensors:

```typescript
import { fetchWeibo } from './weibo'
import { fetchZhihu } from './zhihu'
import { fetchXiaohongshu } from './xiaohongshu'
```

Add to `SENSOR_REGISTRY`:
```typescript
  weibo: fetchWeibo,
  zhihu: fetchZhihu,
  xiaohongshu: fetchXiaohongshu,
```

**Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: All sensor tests pass, registry count is 16

**Step 8: Commit**

```bash
git add frontend/src/lib/sensors/weibo.ts frontend/src/lib/sensors/zhihu.ts frontend/src/lib/sensors/xiaohongshu.ts frontend/src/lib/sensors/index.ts frontend/src/lib/sensors/sensors.test.ts
git commit -m "feat(sensors): add Weibo, Zhihu, and Xiaohongshu hot-list sensors"
```

---

### Task 4: Refactor Pipeline — sensor-map, report-builder, dedup

Update the pipeline internals to use `CategoryKey` from taxonomy instead of hardcoded section keys.

**Files:**
- Modify: `frontend/src/lib/pipeline/sensor-map.ts`
- Modify: `frontend/src/lib/pipeline/report-builder.ts`
- Modify: `frontend/src/lib/pipeline/dedup.ts`

**Step 1: Update `sensor-map.ts`**

Replace the hardcoded maps with re-exports from taxonomy:

```typescript
// ABOUTME: Canonical sensor-to-category routing and human-readable sensor labels.
// ABOUTME: Thin re-exports from taxonomy — the single source of truth.
export { SENSOR_CATEGORY_MAP as SENSOR_SECTION_MAP, SENSOR_LABELS } from '../sensors/taxonomy'
export type { CategoryKey as SectionKey } from '../sensors/taxonomy'
```

Note: We keep the old export names (`SENSOR_SECTION_MAP`, `SectionKey`) as aliases so downstream imports don't all break at once. Consumers can migrate to the new names later.

**Step 2: Update `report-builder.ts`**

- Replace `'tech_trends'` fallback on line 51 with `'tech'`
- Update import of `SectionKey` — it now comes from taxonomy via sensor-map (already re-exported)
- No other changes needed since it uses `SENSOR_SECTION_MAP` dynamically

**Step 3: Update `dedup.ts`**

No changes needed — it references `sections['social']` which remains the same key.

**Step 4: Run pipeline tests**

Run: `cd frontend && npx vitest run`
Expected: Check for failures, fix any remaining references to old keys

**Step 5: Commit**

```bash
git add frontend/src/lib/pipeline/sensor-map.ts frontend/src/lib/pipeline/report-builder.ts
git commit -m "refactor(pipeline): derive sensor-map from taxonomy, update category key fallback"
```

---

### Task 5: Refactor Rendering — markdown.ts, summarizer.ts, orchestrator.ts

**Files:**
- Modify: `frontend/src/lib/renderer/markdown.ts`
- Modify: `frontend/src/lib/summary/summarizer.ts`
- Modify: `frontend/src/lib/pipeline/orchestrator.ts`

**Step 1: Update `markdown.ts`**

Replace hardcoded `SECTIONS` array (lines 6-14) with taxonomy-derived data:

```typescript
import { ALL_CATEGORIES, CATEGORY_META, type CategoryKey } from '../sensors/taxonomy'

const SECTIONS: [CategoryKey, string, string][] = ALL_CATEGORIES.map(key => [
  key,
  CATEGORY_META[key].label,
  CATEGORY_META[key].emoji,
])
```

Also update the `renderMarkdown` function to use `CategoryKey` instead of `SectionKey`.

**Step 2: Update `summarizer.ts`**

Delete the local `SENSOR_LABELS` (lines 10-24). Import from taxonomy instead:

```typescript
import { SENSOR_LABELS } from '../sensors/taxonomy'
```

**Step 3: Update `orchestrator.ts`**

Import `SENSOR_LABELS` from taxonomy instead of sensor-map (line 20):

```typescript
import { SENSOR_LABELS } from '../sensors/taxonomy'
```

(sensor-map still re-exports it, but importing directly from taxonomy is cleaner)

**Step 4: Run tests**

Run: `cd frontend && npx vitest run`

**Step 5: Commit**

```bash
git add frontend/src/lib/renderer/markdown.ts frontend/src/lib/summary/summarizer.ts frontend/src/lib/pipeline/orchestrator.ts
git commit -m "refactor(renderer): derive section metadata from taxonomy, remove duplicated labels"
```

---

### Task 6: Refactor UI Components — Data.tsx, Sensors.tsx, Console.tsx, status/constants.ts

The biggest UI change. Replace all local section/sensor duplicates with taxonomy imports.

**Files:**
- Modify: `frontend/src/components/Data.tsx`
- Modify: `frontend/src/components/Sensors.tsx`
- Modify: `frontend/src/components/Console.tsx`
- Modify: `frontend/src/components/status/constants.ts`

**Step 1: Update `status/constants.ts`**

Replace all hardcoded sensor/section data with taxonomy-derived exports:

```typescript
// ABOUTME: Shared constants for the Status dashboard — derived from taxonomy.
// ABOUTME: Centralizes sensor/section groupings, status metadata, and error truncation config.
import { SENSORS, SENSOR_LABELS, ALL_CATEGORIES, CATEGORY_META, sensorsForCategory } from '@/lib/sensors/taxonomy'
import type { CategoryKey } from '@/lib/sensors/taxonomy'

export const ALL_SENSORS = SENSORS.map(s => ({ key: s.key, label: s.label }))

export const SECTION_SENSORS = ALL_CATEGORIES.map(cat => ({
  key: cat,
  label: CATEGORY_META[cat].label,
  sensors: sensorsForCategory(cat),
}))

export const STATUS_META: Record<string, { color: string; bg: string; label: string; desc: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',       label: 'Healthy',  desc: 'Data is fresh and up to date' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',     label: 'Stale',    desc: 'Data is older than the cache TTL' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)', label: 'No Data',  desc: 'Pipeline has never run' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',      label: 'Error',    desc: 'Could not read pipeline status' },
}

export const SENSOR_LABEL_MAP: Record<string, string> = { ...SENSOR_LABELS }

export const ERROR_TRUNCATE_LENGTH = 120
```

**Step 2: Update `Console.tsx`**

Delete local `SENSOR_LABELS` (lines 12-25). Import from taxonomy:

```typescript
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
```

**Step 3: Update `Data.tsx`**

Replace local `SECTIONS`, `SOURCE_LABELS`, and `SECTION_SENSORS` (lines 14-51) with taxonomy-derived versions:

```typescript
import { ALL_CATEGORIES, CATEGORY_META, SENSOR_LABELS, sensorsForCategory } from '@/lib/sensors/taxonomy'
import type { CategoryKey } from '@/lib/sensors/taxonomy'

const SECTIONS: { key: string; label: string }[] = ALL_CATEGORIES.map(cat => ({
  key: cat,
  label: CATEGORY_META[cat].label,
}))

const SOURCE_LABELS: Record<string, string> = { ...SENSOR_LABELS }

const SECTION_SENSORS: Record<string, string[]> = Object.fromEntries(
  ALL_CATEGORIES.map(cat => [cat, sensorsForCategory(cat)])
)
```

This also fixes the user's issue with not all sensors being displayed — the new taxonomy-derived mapping automatically includes all sensors.

**Step 4: Update `Sensors.tsx`**

Replace hardcoded `SENSOR_GROUPS` (lines 16-45) with taxonomy-derived groups:

```typescript
import { sensorsByLanguageAndCategory } from '@/lib/sensors/taxonomy'

const TAXONOMY_GROUPS = sensorsByLanguageAndCategory()

const SENSOR_GROUPS: { label: string; sensors: SensorDef[] }[] = TAXONOMY_GROUPS.flatMap(lang =>
  lang.categories.map(cat => ({
    label: `${lang.label} — ${cat.label}`,
    sensors: cat.sensors.map(s => ({ key: s.key, label: s.label, desc: s.desc })),
  }))
)
```

Also update `SENSOR_LOOKBACK_SUPPORT` to include new sensors if they need lookback support.

**Step 5: Run tests**

Run: `cd frontend && npx vitest run`

**Step 6: Commit**

```bash
git add frontend/src/components/Data.tsx frontend/src/components/Sensors.tsx frontend/src/components/Console.tsx frontend/src/components/status/constants.ts
git commit -m "refactor(ui): derive all sensor/section groupings from centralized taxonomy"
```

---

### Task 7: Update API Routes

**Files:**
- Modify: `frontend/src/app/api/intel/[section]/route.ts`
- Modify: `frontend/src/app/api/cron/cleanup/route.ts`

**Step 1: Update `intel/[section]/route.ts`**

Import `ALL_CATEGORIES` and `CategoryKey` from taxonomy instead of `ALL_SECTIONS`/`SectionKey` from models:

```typescript
import { ALL_CATEGORIES, type CategoryKey } from '@/lib/sensors/taxonomy'

const KNOWN_SECTIONS = new Set<string>(ALL_CATEGORIES)
```

Update the response message and type cast accordingly.

**Step 2: Update `cron/cleanup/route.ts`**

Import `CategoryKey` from taxonomy instead of `SectionKey` from models:

```typescript
import type { CategoryKey } from '@/lib/sensors/taxonomy'
```

Use `CategoryKey` in the loop cast.

**Step 3: Run tests**

Run: `cd frontend && npx vitest run`

**Step 4: Commit**

```bash
git add frontend/src/app/api/intel/[section]/route.ts frontend/src/app/api/cron/cleanup/route.ts
git commit -m "refactor(api): use CategoryKey from taxonomy in API routes"
```

---

### Task 8: Update models.ts Default Config + SOURCE_URLS

Add default enabled state for the 3 new sensors and their source URLs.

**Files:**
- Modify: `frontend/src/lib/models.ts`

**Step 1: Add new sensors to `defaultConfig().sensors_enabled`**

```typescript
  weibo: true,
  zhihu: true,
  xiaohongshu: true,
```

**Step 2: Add to `SOURCE_URLS`**

```typescript
  weibo:        'https://weibo.com',
  zhihu:        'https://www.zhihu.com',
  xiaohongshu:  'https://www.xiaohongshu.com',
```

**Step 3: Run tests**

Run: `cd frontend && npx vitest run`

**Step 4: Commit**

```bash
git add frontend/src/lib/models.ts
git commit -m "feat(config): add Weibo, Zhihu, Xiaohongshu to default config and source URLs"
```

---

### Task 9: DB Migration for Existing Reports

Existing cached reports store items under old keys (`tech_trends`, `capital_flow`). We need to handle reading them back under the new keys.

**Files:**
- Modify: `frontend/src/lib/pipeline/cache.ts`

**Step 1: Add migration logic to `readReport()`**

After reading a report from the DB, check if it has old-style keys and rename them:

```typescript
/** Migrate old section keys to new category keys in a cached report. */
function migrateReportKeys(data: Record<string, unknown>): Record<string, unknown> {
  const items = data.items as Record<string, unknown[]> | undefined
  if (!items) return data
  const RENAMES: Record<string, string> = {
    tech_trends: 'tech',
    capital_flow: 'finance',
  }
  for (const [oldKey, newKey] of Object.entries(RENAMES)) {
    if (items[oldKey] && !items[newKey]) {
      items[newKey] = items[oldKey]
      delete items[oldKey]
    }
  }
  return { ...data, items }
}
```

Call this in `readReport()` before returning the data.

**Step 2: Run tests**

Run: `cd frontend && npx vitest run`

**Step 3: Commit**

```bash
git add frontend/src/lib/pipeline/cache.ts
git commit -m "fix(cache): migrate old section keys (tech_trends, capital_flow) on read"
```

---

### Task 10: Full Test Suite Green + Cleanup

Run the full test suite and fix any remaining breakages from the section key renames.

**Files:**
- Potentially modify: any test files referencing old keys
- Modify: `frontend/src/lib/sensors/sensors.test.ts` — update taxonomy test to match final sensor count

**Step 1: Run full test suite**

Run: `cd frontend && npx vitest run`

**Step 2: Fix all failing tests**

Update any test expectations that reference `tech_trends` → `tech` or `capital_flow` → `finance`.

**Step 3: Run again to confirm green**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "test: fix all test expectations for new category keys"
```

---

### Task 11: Verify in Browser

Start the dev server and manually verify:
1. Sources page shows sensors grouped by language (ROW/CN) → category
2. Feed page shows all categories including new sensors
3. Status page groups sensors correctly
4. Console page labels sensors correctly
5. Run the pipeline — verify Weibo, Zhihu, Xiaohongshu fetch data
6. Export markdown — verify new category names appear correctly

Run: `cd frontend && npm run dev -- --port 8002`
