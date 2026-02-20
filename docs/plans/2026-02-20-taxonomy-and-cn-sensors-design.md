# Centralized Sensor Taxonomy + CN Hot-List Sensors

## Problem

The sensor-to-section grouping is duplicated in 4+ places (sensor-map.ts, Data.tsx,
status/constants.ts, Console.tsx, markdown.ts). Adding new sensors requires touching
all of them. There is no language dimension — Chinese and English sources are mixed
in the same flat list.

## Design

### Taxonomy as Single Source of Truth

A new file `frontend/src/lib/sensors/taxonomy.ts` declares every sensor with:

```ts
interface SensorDef {
  key: string            // machine name, e.g. 'weibo'
  label: string          // human name, e.g. 'Weibo'
  desc: string           // short description
  language: 'cn' | 'row' // Chinese or Rest of World
  category: CategoryKey  // report category
  emoji?: string         // for markdown rendering
}
```

All downstream consumers derive their data from this single declaration list.

### CategoryKey Replaces SectionKey

| Old SectionKey   | New CategoryKey | Display Label |
|------------------|-----------------|---------------|
| `tech_trends`    | `tech`          | Tech          |
| `research`       | `research`      | Research      |
| `capital_flow`   | `finance`       | Finance       |
| `products`       | `products`      | Products      |
| `community`      | `community`     | Community     |
| `social`         | `social`        | Social        |
| `insights`       | `insights`      | Insights      |
| `feeds`          | `feeds`         | Feeds         |

### Sensor Assignments

**ROW (Rest of World)**

| Sensor            | Category  |
|-------------------|-----------|
| hacker_news       | tech      |
| github            | tech      |
| arxiv             | research  |
| product_hunt      | products  |
| chrome_radar      | products  |
| hn_blogs          | insights  |
| social_accounts   | social    |
| social_topics     | social    |
| social_trends     | social    |
| rss_feeds         | feeds     |

**CN (Chinese)**

| Sensor        | Category  |
|---------------|-----------|
| sources_36kr  | finance   |
| wallstreetcn  | finance   |
| v2ex          | community |
| zhihu         | community |
| weibo         | social    |
| xiaohongshu   | social    |

### New Sensor Implementations

**weibo.ts** — `fetchWeibo(config, limit) → IntelItem[]`
- API: `https://weibo.com/ajax/side/hotSearch`
- Headers: Desktop User-Agent, Referer
- Maps `data.realtime[]` → IntelItem with heat = raw number

**zhihu.ts** — `fetchZhihu(config, limit) → IntelItem[]`
- API: `https://api.zhihu.com/topstory/hot-list`
- No special headers needed
- Maps `data[]` → IntelItem with heat from detail_text

**xiaohongshu.ts** — `fetchXiaohongshu(config, limit) → IntelItem[]`
- API: `https://edith.xiaohongshu.com/api/sns/v1/search/hot_list`
- Headers: Mobile UA + XHS-specific headers (ported from reference)
- Maps `data.items[]` → IntelItem with heat = score

### Derived Exports from Taxonomy

```ts
// Replaces SENSOR_SECTION_MAP
export const SENSOR_CATEGORY_MAP: Record<string, CategoryKey>

// Single source — no more duplicates
export const SENSOR_LABELS: Record<string, string>

// Replaces ALL_SECTIONS
export const ALL_CATEGORIES: CategoryKey[]

// Display names and emojis per category
export const CATEGORY_LABELS: Record<CategoryKey, { label: string; emoji: string }>

// For UI grouping: language → category → sensors
export function sensorsByLanguageAndCategory(): ...
```

### Files Changed

| File | Change |
|------|--------|
| `lib/sensors/taxonomy.ts` | **NEW** — single source of truth |
| `lib/sensors/weibo.ts` | **NEW** — Weibo hot search sensor |
| `lib/sensors/zhihu.ts` | **NEW** — Zhihu hot list sensor |
| `lib/sensors/xiaohongshu.ts` | **NEW** — XHS hot list sensor |
| `lib/sensors/index.ts` | Register 3 new sensors |
| `lib/models.ts` | `SectionKey` → `CategoryKey`, rename constants |
| `lib/pipeline/sensor-map.ts` | Thin re-export from taxonomy |
| `lib/pipeline/report-builder.ts` | Use new category keys |
| `lib/pipeline/orchestrator.ts` | Use new imports |
| `lib/renderer/markdown.ts` | Derive from taxonomy |
| `lib/summary/summarizer.ts` | Use taxonomy labels |
| `components/Sensors.tsx` | Derive groups from taxonomy |
| `components/Data.tsx` | Delete local duplicates, import from taxonomy |
| `components/status/constants.ts` | Delete, re-export from taxonomy |
| `components/Console.tsx` | Delete local labels, import from taxonomy |
| `app/api/intel/[section]/route.ts` | Validate against new category keys |
| `app/api/cron/cleanup/route.ts` | Use new category keys |
| DB stored reports | Rename section keys in existing data |

### DB Migration

Existing reports store items keyed by old SectionKey. A migration step renames:
- `tech_trends` → `tech`
- `capital_flow` → `finance`

Other keys are unchanged.
