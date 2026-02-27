# Remove Categories — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded 9-category taxonomy with user-configurable groups as the sole classification system across the entire application.

**Architecture:** Remove `CategoryKey`, `ALL_CATEGORIES`, `SENSOR_CATEGORY_MAP`, `CATEGORY_META`, and all category-related exports from `taxonomy.ts`. Change `IntelReport.items` from `Record<CategoryKey, IntelItem[]>` to `Record<string, IntelItem[]>` keyed by group ID. Update report-builder to route items by group membership (from DB). Remove `CategoryBadge` from UI. Update tests.

**Tech Stack:** TypeScript, Next.js 15, React, @dnd-kit, @libsql/client (SQLite), Vitest

---

### Task 1: Strip category from taxonomy.ts

Remove all category-related exports from the central taxonomy file. Keep sensor definitions (without `category` field), `SENSOR_LABELS`, `sensorToSource()`, and language-related exports.

**Files:**
- Modify: `frontend/src/lib/sensors/taxonomy.ts`

**Step 1: Remove category exports and strip category from SensorDef**

Edit `frontend/src/lib/sensors/taxonomy.ts`:

1. Delete line 4 (`export const ALL_CATEGORIES = ...`)
2. Delete line 5 (`export type CategoryKey = ...`)
3. Remove `category: CategoryKey` from `SensorDef` interface (line 12)
4. Remove `category: '...'` from every sensor in the `SENSORS` array (lines 15-45 — each object literal)
5. Delete `SENSOR_CATEGORY_MAP` (lines 66-77)
6. Delete `CATEGORY_META` (lines 85-95)
7. Delete `CategoryGroup` interface (lines 103-107)
8. Delete `LanguageGroup` interface (lines 109-113)
9. Delete `sensorsByLanguageAndCategory()` function (lines 121-145)
10. Delete `sensorsForCategory()` function (lines 148-150)
11. Delete `emptyCategoryMap()` function (lines 153-155)
12. Keep `LANGUAGE_LABELS` (lines 98-101) — still used for CnBadge

The resulting file should export: `SensorDef` (without category), `SENSORS`, `SENSOR_SOURCE_OVERRIDES`, `sensorToSource()`, `SENSOR_LABELS`, and `LANGUAGE_LABELS`.

**Step 2: Run tests to see what breaks**

Run: `cd frontend && npx vitest run src/lib/sensors/sensors.test.ts`
Expected: Multiple failures — category tests reference removed exports.

**Step 3: Commit**

```bash
git add frontend/src/lib/sensors/taxonomy.ts
git commit -m "refactor(taxonomy): remove all category exports from taxonomy

Groups are the sole classification system now. Category-related types,
constants, maps, and utility functions are no longer needed."
```

---

### Task 2: Update models.ts — remove category-keyed IntelReport

Remove category dependencies from the shared models file. Change `IntelReport.items` to `Record<string, IntelItem[]>`.

**Files:**
- Modify: `frontend/src/lib/models.ts`

**Step 1: Update models.ts**

Edit `frontend/src/lib/models.ts`:

1. Remove the import on line 4: `import { ALL_CATEGORIES, type CategoryKey, emptyCategoryMap } from './sensors/taxonomy'`
2. Remove the re-export on line 6: `export { ALL_CATEGORIES, type CategoryKey }`
3. Delete `emptyItemsMap()` function (lines 54-56)
4. Delete `ensureAllSections()` function (lines 58-69)
5. Change `IntelReport.items` type (line 77) from `Record<CategoryKey, IntelItem[]>` to `Record<string, IntelItem[]>`
6. Simplify `createReport()` (lines 82-96): remove the `ensureAllSections` call — just spread overrides directly:

```typescript
export function createReport(
  overrides: Partial<IntelReport> & Pick<IntelReport, 'date' | 'fetched_at'>,
): IntelReport {
  return {
    stale: false,
    sources_ok: [],
    sources_failed: [],
    items: {},
    ...overrides,
  }
}
```

**Step 2: Run tests to confirm compilation**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | head -80`
Expected: More failures downstream — files that import `CategoryKey` from models will break.

**Step 3: Commit**

```bash
git add frontend/src/lib/models.ts
git commit -m "refactor(models): change IntelReport.items to Record<string, IntelItem[]>

Report sections are now keyed by group ID (dynamic) instead of
CategoryKey (hardcoded 9-value union). Removed emptyItemsMap and
ensureAllSections as they depended on the fixed category list."
```

---

### Task 3: Update report-builder.ts — group-based item routing

Replace category-based item routing with group-based routing. Items get routed to their sensor's group ID. Ungrouped sensors go to `"ungrouped"`.

**Files:**
- Modify: `frontend/src/lib/pipeline/report-builder.ts`

**Step 1: Update report-builder.ts**

Edit `frontend/src/lib/pipeline/report-builder.ts`:

1. Remove import of `CategoryKey` from `'../models'` (line 8)
2. Remove import of `emptyItemsMap` from `'../models'` (line 10) — keep `createReport`, `sensorResultSucceeded`
3. Remove import of `SENSOR_CATEGORY_MAP` from `'../sensors/taxonomy'` (line 17)
4. Add import: `import { listGroupsFlat } from '../groups'`

5. In `assembleReport()` function, replace lines 56-68 (the sections assembly) with:

```typescript
  // Load group definitions to route items by group membership
  const groups = await listGroupsFlat()
  const sensorToGroup = new Map<string, string>()
  for (const group of groups) {
    for (const sensor of group.sensors) {
      sensorToGroup.set(sensor, group.id)
    }
  }

  // Assemble sections by group
  const sections: Record<string, IntelItem[]> = {}
  const sourcesOk: string[] = []
  const sourcesFailed: string[] = []

  for (const result of results) {
    if (sensorResultSucceeded(result)) {
      sourcesOk.push(result.sensor_name)
      const groupId = sensorToGroup.get(result.sensor_name) ?? 'ungrouped'
      if (!sections[groupId]) sections[groupId] = []
      sections[groupId].push(...result.items)
    } else {
      sourcesFailed.push(result.sensor_name)
    }
  }
```

6. Update the dedup loop (lines 71-73) — replace `Object.keys(sections) as CategoryKey[]` with just `Object.keys(sections)`:

```typescript
  for (const key of Object.keys(sections)) {
    sections[key] = dedupItems(sections[key])
  }
```

7. Update all remaining `as CategoryKey[]` casts in the file to just iterate `Object.keys(sections)`:
   - Lines 79, 80: dedup/decode loop
   - Line 94: keyword filtering loop
   - Line 101: post-processing loop

8. Update the `createReport` call (line 134-142) — remove the `as Record<CategoryKey, IntelItem[]>` cast:

```typescript
  const newReport = createReport({
    date: now.toISOString().slice(0, 10),
    fetched_at: reportFetchedAt,
    stale: false,
    sources_ok: sourcesOk.sort(),
    sources_failed: sourcesFailed.sort(),
    items: dedupedSections,
    sources_fetched_at: fetchedAt,
  })
```

9. In `mergePartialReport()` (lines 168-204), remove all `as CategoryKey[]` casts — replace with `Object.keys(...)`:

```typescript
function mergePartialReport(
  existing: IntelReport,
  partial: IntelReport,
  sensorsInRun: string[],
): IntelReport {
  const runSet = new Set(sensorsInRun)

  const merged: Record<string, IntelItem[]> = {}
  // Keep existing items from sensors NOT in this run
  for (const key of Object.keys(existing.items)) {
    merged[key] = (existing.items[key] ?? []).filter(item => !runSet.has(item.source))
  }
  // Add all items from the new partial report
  for (const key of Object.keys(partial.items)) {
    if (!merged[key]) merged[key] = []
    merged[key].push(...(partial.items[key] ?? []))
  }

  const existingOk = existing.sources_ok.filter(s => !runSet.has(s))
  const existingFailed = existing.sources_failed.filter(s => !runSet.has(s))
  const mergedFetchedAt: Record<string, string> = {
    ...(existing.sources_fetched_at ?? {}),
    ...(partial.sources_fetched_at ?? {}),
  }

  return createReport({
    date: partial.date,
    fetched_at: partial.fetched_at,
    stale: false,
    sources_ok: [...existingOk, ...partial.sources_ok].sort(),
    sources_failed: [...existingFailed, ...partial.sources_failed].sort(),
    items: merged,
    sources_fetched_at: mergedFetchedAt,
  })
}
```

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/lib/pipeline`
Expected: Some failures in tests that reference categories — will fix later.

**Step 3: Commit**

```bash
git add frontend/src/lib/pipeline/report-builder.ts
git commit -m "refactor(report-builder): route items by group membership

Items are now routed to sections keyed by group ID from the database.
Ungrouped sensors fall into an 'ungrouped' bucket. Removed all
SENSOR_CATEGORY_MAP and CategoryKey usage."
```

---

### Task 4: Update helpers.ts — remove category references

Remove `SENSOR_CATEGORY_MAP` and `CategoryKey` usage from pipeline helpers.

**Files:**
- Modify: `frontend/src/lib/pipeline/helpers.ts`

**Step 1: Update helpers.ts**

Edit `frontend/src/lib/pipeline/helpers.ts`:

1. Remove `ALL_CATEGORIES, SENSOR_CATEGORY_MAP` from the taxonomy import (line 8). Keep `sensorToSource`.
2. Remove `CategoryKey` type import (line 9).

3. Update `mergeRetryResult()` (lines 79-103): The function removes old items from a sensor and adds new ones. Currently it uses `SENSOR_CATEGORY_MAP` to find the target section. Since report sections are now group-keyed, we need to find the right group section. Replace the function:

```typescript
export function mergeRetryResult(report: IntelReport, result: SensorResult): void {
  // Remove old items from this sensor across all sections
  for (const section of Object.values(report.items)) {
    for (let i = section.length - 1; i >= 0; i--) {
      if (section[i].source === result.sensor_name) {
        section.splice(i, 1)
      }
    }
  }
  // Find which section already has items from this sensor, or use first section
  let targetKey: string | undefined
  for (const [key, items] of Object.entries(report.items)) {
    if (items.some(item => item.source === result.sensor_name)) {
      targetKey = key
      break
    }
  }
  if (!targetKey) {
    // No existing section for this sensor — use first available section
    const keys = Object.keys(report.items)
    targetKey = keys[0]
  }
  if (targetKey && report.items[targetKey]) {
    report.items[targetKey].push(...result.items)
  }
}
```

4. In `runIntelligence()` (lines 226-338), update the `for (const cat of ALL_CATEGORIES)` loop on line 266:

```typescript
    if (nlpAvailable) {
      const allItems: IntelItem[] = []
      for (const items of Object.values(report.items)) {
        allItems.push(...items)
      }
```

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/lib/pipeline`
Expected: Closer to passing.

**Step 3: Commit**

```bash
git add frontend/src/lib/pipeline/helpers.ts
git commit -m "refactor(helpers): remove category map usage from pipeline helpers

mergeRetryResult and runIntelligence now work with dynamic group-keyed
sections instead of fixed category keys."
```

---

### Task 5: Update intelligence.ts — remove category fallbacks

Remove `ALL_CATEGORIES`, `SENSOR_CATEGORY_MAP` usage from the intelligence analysis module. The fallback paths that filter by category are dead code since groups always provide sensor sets.

**Files:**
- Modify: `frontend/src/lib/pipeline/intelligence.ts`

**Step 1: Update intelligence.ts**

Edit `frontend/src/lib/pipeline/intelligence.ts`:

1. Remove line 7: `import type { CategoryKey } from '../sensors/taxonomy'`
2. Remove line 8: `import { ALL_CATEGORIES, SENSOR_CATEGORY_MAP } from '../sensors/taxonomy'`

3. In `runIntelligenceAnalysis()` (around line 564), update the item collection loop to iterate report items generically:

```typescript
  const allItems: IntelItem[] = []
  for (const items of Object.values(report.items)) {
    allItems.push(...items)
  }
```

4. Remove the category fallback branches from the trend/topic/account filtering (lines 573-583). Make `sensorSets` required (not optional) since groups always provide them. If for defensive coding you want to keep it optional, just default to empty sets:

```typescript
  const effectiveSets = sensorSets ?? { trendSensors: new Set(), topicSensors: new Set(), socialSensors: new Set() }
  const trendItems = allItems.filter(item => effectiveSets.trendSensors.has(item.source))
  const topicItems = allItems.filter(item => effectiveSets.topicSensors.has(item.source) && item.topic != null && item.topic.length > 0)
  const accountItems = allItems.filter(item => effectiveSets.socialSensors.has(item.source) && item.account != null && item.account.length > 0)
```

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/lib/pipeline`
Expected: Category fallback tests will fail (expected — those tests will be removed in Task 9).

**Step 3: Commit**

```bash
git add frontend/src/lib/pipeline/intelligence.ts
git commit -m "refactor(intelligence): remove category fallback from analysis pipeline

Intelligence analysis now always uses group-driven sensor sets.
The legacy SENSOR_CATEGORY_MAP fallback branches are removed."
```

---

### Task 6: Update API routes — remove category validation

Update the section route and cleanup routes to work with dynamic group-keyed sections.

**Files:**
- Modify: `frontend/src/app/api/intel/[section]/route.ts`
- Modify: `frontend/src/app/api/cache/cleanup/route.ts`
- Modify: `frontend/src/app/api/cron/cleanup/route.ts`

**Step 1: Update [section] route**

Edit `frontend/src/app/api/intel/[section]/route.ts`:

1. Remove import of `ALL_CATEGORIES` and `CategoryKey` (line 6)
2. Remove `KNOWN_SECTIONS` set (line 8)
3. Remove the `KNOWN_SECTIONS.has(section)` validation block (lines 17-24) — sections are now dynamic, so just look up the key in the report:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { readReport, isStale } from '@/lib/pipeline/cache'
import { loadConfig } from '@/lib/config'

const MAX_LIMIT = 200

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ section: string }> },
): Promise<NextResponse> {
  const { section } = await params

  const limitParam = request.nextUrl.searchParams.get('limit')
  let limit = 10
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= MAX_LIMIT) {
      limit = parsed
    }
  }

  const report = await readReport()
  if (!report) {
    return NextResponse.json(
      { error: 'No data available yet' },
      { status: 503 },
    )
  }

  const config = await loadConfig()
  const stale = isStale(report, config.cache_ttl_hours)
  const items = (report.items[section] ?? []).slice(0, limit)

  if (items.length === 0 && !Object.keys(report.items).includes(section)) {
    return NextResponse.json(
      { error: `Unknown section '${section}'. Known sections: ${Object.keys(report.items).sort().join(', ')}` },
      { status: 404 },
    )
  }

  return NextResponse.json({
    section,
    stale,
    fetched_at: report.fetched_at,
    items,
  })
}
```

**Step 2: Update cache cleanup route**

Edit `frontend/src/app/api/cache/cleanup/route.ts`:

1. Remove `CategoryKey` from the import on line 6 — change to: `import type { IntelItem } from '@/lib/models'`
2. Replace `as CategoryKey[]` cast on line 29 with just `Object.keys(prunedItems)`:

```typescript
  for (const key of Object.keys(prunedItems)) {
    const before = prunedItems[key].length
    prunedItems[key] = prunedItems[key].filter((item) => isItemAlive(item, cutoffMs))
    totalRemoved += before - prunedItems[key].length
  }
```

**Step 3: Update cron cleanup route**

Edit `frontend/src/app/api/cron/cleanup/route.ts`:

1. Remove `CategoryKey` import (line 8): `import type { CategoryKey } from '@/lib/sensors/taxonomy'`
2. Replace `as CategoryKey[]` cast on line 39 with just `Object.keys(prunedItems)`:

```typescript
  for (const key of Object.keys(prunedItems)) {
    const before = prunedItems[key].length
    prunedItems[key] = prunedItems[key].filter((item) => isItemAlive(item, cutoffMs))
    totalRemoved += before - prunedItems[key].length
  }
```

**Step 4: Run tests**

Run: `cd frontend && npx vitest run`
Expected: Closer to passing.

**Step 5: Commit**

```bash
git add frontend/src/app/api/intel/[section]/route.ts frontend/src/app/api/cache/cleanup/route.ts frontend/src/app/api/cron/cleanup/route.ts
git commit -m "refactor(api): remove category validation from API routes

Section route now validates against dynamic report keys instead of
the hardcoded ALL_CATEGORIES set. Cleanup routes iterate report keys
without CategoryKey casting."
```

---

### Task 7: Update markdown renderer — group-based sections

Replace category-based section iteration with dynamic group-based rendering.

**Files:**
- Modify: `frontend/src/lib/renderer/markdown.ts`

**Step 1: Update markdown.ts**

Rewrite the renderer to work with dynamic sections. The report items are now keyed by group ID, so we iterate whatever keys the report has:

```typescript
// ABOUTME: Pure Markdown renderer for IntelReport — no I/O, no HTTP, no sleeps.
// ABOUTME: Renders all report sections from the IntelReport model.
import type { IntelItem, IntelReport } from '../models'

const NO_DATA_PLACEHOLDER = '_No data available for this section._'

function renderItem(item: IntelItem): string {
  const lines: string[] = []

  if (item.url) {
    lines.push(`- **[${item.title}](${item.url})**`)
  } else {
    lines.push(`- **${item.title}**`)
  }

  const meta: string[] = []
  if (item.source) {
    meta.push(`via ${item.source}`)
  }
  if (item.published_at) {
    meta.push(item.published_at)
  }
  if (item.heat) {
    meta.push(`🔥 ${item.heat}`)
  }
  if (item.account) {
    meta.push(`@${item.handle ?? item.account}`)
  }
  if (item.topic) {
    meta.push(`#${item.topic}`)
  }
  if (meta.length > 0) {
    lines.push(`  *${meta.join(' · ')}*`)
  }

  if (item.authors && item.authors.length > 0) {
    lines.push(`  Authors: ${item.authors.join(', ')}`)
  }

  if (item.abstract) {
    const trimmed =
      item.abstract.length > 400
        ? item.abstract.slice(0, 400) + '…'
        : item.abstract
    lines.push(`  > ${trimmed}`)
  }

  return lines.join('\n')
}

function renderSection(
  title: string,
  items: IntelItem[],
): string {
  const header = `## ${title}`
  if (items.length === 0) {
    return `${header}\n\n${NO_DATA_PLACEHOLDER}`
  }

  const body = items.map((item) => renderItem(item)).join('\n\n')
  return `${header}\n\n${body}`
}

/**
 * Render an IntelReport as a Markdown document.
 * Pure function — performs no I/O, no HTTP calls, no sleeps.
 */
export function renderMarkdown(report: IntelReport): string {
  let header =
    `# Intel Briefing — ${report.date}\n\n` +
    `_Fetched at ${report.fetched_at}_\n`

  if (report.stale) {
    header +=
      '\n> ⚠️ **This report may be stale.** Data was not refreshed on schedule.\n'
  }

  const sectionBlocks: string[] = []
  for (const [key, items] of Object.entries(report.items)) {
    // Use the section key as a title (capitalize first letter)
    const title = key === 'ungrouped'
      ? 'Ungrouped'
      : key.charAt(0).toUpperCase() + key.slice(1)
    sectionBlocks.push(renderSection(title, items))
  }

  const footerSources =
    [...report.sources_ok].sort().join(', ') || 'none'
  const footerFailed =
    [...report.sources_failed].sort().join(', ') || 'none'
  const footer =
    `---\n\n` +
    `**Sources OK:** ${footerSources}  \n` +
    `**Sources Failed:** ${footerFailed}`

  return [header, ...sectionBlocks, footer].join('\n\n')
}
```

Note: Section titles will be group IDs (UUIDs) in the markdown — this is acceptable for now. The markdown renderer is a debug/export tool, not primary UI. A future enhancement could load group names for better titles.

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/lib/renderer`
Expected: PASS (or tests that referenced category-specific output will need updating).

**Step 3: Commit**

```bash
git add frontend/src/lib/renderer/markdown.ts
git commit -m "refactor(renderer): iterate dynamic group sections in markdown

Renderer no longer imports category metadata. Sections come from
whatever keys the report has, titled by section key."
```

---

### Task 8: Update UI components — remove CategoryBadge, SVG gear icon

Remove `CategoryBadge` from sensor rows and the detail panel. Replace the text `⚙` character with a proper SVG gear icon for complex sensors.

**Files:**
- Modify: `frontend/src/components/sources/SensorBadge.tsx`
- Modify: `frontend/src/components/sources/SensorDragItem.tsx`
- Modify: `frontend/src/components/sources/SensorDetailPanel.tsx`
- Modify: `frontend/src/components/Sensors.tsx`

**Step 1: Remove CategoryBadge from SensorBadge.tsx**

Edit `frontend/src/components/sources/SensorBadge.tsx`:

1. Remove import of `CategoryKey` (line 5)
2. Delete the entire `CATEGORY_COLORS` constant (lines 9-20)
3. Delete the entire `CategoryBadge` component (lines 22-41)
4. Keep `Badge` and `CnBadge` components unchanged

**Step 2: Update SensorDragItem.tsx**

Edit `frontend/src/components/sources/SensorDragItem.tsx`:

1. Remove `CategoryBadge` from the import on line 8: change to `import { Toggle } from './Toggle'` etc. — remove `CategoryBadge` from the `SensorBadge` import
2. Remove `import type { CategoryKey } from '@/lib/sensors/taxonomy'` (line 9)
3. Remove `category: CategoryKey` from `SensorDragItemProps` interface (line 17)
4. Remove `category` from the destructured props (line 60)
5. Remove `<CategoryBadge category={category} />` on line 139
6. Replace the `⚙` text character in the gear button (line 193) with an inline SVG:

```tsx
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
```

**Step 3: Update SensorDetailPanel.tsx**

Edit `frontend/src/components/sources/SensorDetailPanel.tsx`:

1. Remove `CategoryBadge` from imports (line referencing SensorBadge)
2. Remove the `{sensor && <CategoryBadge category={sensor.category} />}` line (~line 441)

**Step 4: Update Sensors.tsx**

Edit `frontend/src/components/Sensors.tsx`:

1. Remove `CategoryKey` from imports (line 13)
2. Change `SENSOR_MAP` type (line 36) from `Record<string, { key: string; label: string; desc: string; category: CategoryKey }>` to `Record<string, { key: string; label: string; desc: string }>`
3. Remove `category` from the mapped objects in the `Object.fromEntries` call
4. Update `DragPreviewProps` interface (line 72) — remove `category` from `sensorMap` type
5. Remove `category={sensor.category ?? 'tech'}` from the `<SensorDragItem>` JSX (line 501)

**Step 5: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: Some test failures for tests referencing CategoryBadge.

**Step 6: Commit**

```bash
git add frontend/src/components/sources/SensorBadge.tsx frontend/src/components/sources/SensorDragItem.tsx frontend/src/components/sources/SensorDetailPanel.tsx frontend/src/components/Sensors.tsx
git commit -m "refactor(ui): remove CategoryBadge, add SVG gear icon

Category badges are removed from sensor rows and detail panel.
The ⚙ text character is replaced with a proper SVG gear icon
for complex sensors that have a settings panel."
```

---

### Task 9: Update tests — remove category references

Fix all failing tests by removing category-related test cases and updating mocks/fixtures.

**Files:**
- Modify: `frontend/src/lib/sensors/sensors.test.ts`
- Modify: `frontend/src/lib/pipeline/__tests__/group-intelligence.test.ts`
- Modify: `frontend/src/components/sources/__tests__/group-components.test.tsx`
- Modify: `frontend/src/components/sources/__tests__/sensor-detail-panel.test.tsx`
- Modify: `frontend/src/components/sources/__tests__/drag-preview.test.tsx`
- Modify: `frontend/src/lib/pipeline/states/__tests__/handlers.test.ts` (if it references SENSOR_CATEGORY_MAP)

**Step 1: Update sensors.test.ts**

Edit `frontend/src/lib/sensors/sensors.test.ts`:

1. Delete the entire `'ALL_CATEGORIES has 9 category keys'` test (lines 395-400)
2. Delete the entire `'SENSOR_CATEGORY_MAP maps every sensor to a valid category'` test (lines 402-408)
3. Delete the `'emptyCategoryMap returns an empty array for each category key'` test (lines 426-433)
4. Delete the `'sensorsByLanguageAndCategory...'` test (lines 435-459)
5. Keep the `'SENSOR_LABELS has an entry for every sensor'` test (lines 410-417) — still valid
6. Keep the `'every sensor has language cn or row'` test (lines 419-424) — still valid

**Step 2: Update group-components.test.tsx**

Edit `frontend/src/components/sources/__tests__/group-components.test.tsx`:

1. Remove `CategoryBadge` from import on line 11
2. Delete the entire `describe('CategoryBadge', ...)` block (lines 131-145)

**Step 3: Update sensor-detail-panel.test.tsx**

Edit `frontend/src/components/sources/__tests__/sensor-detail-panel.test.tsx`:

1. Remove the `CategoryBadge` mock (line 56-58)
2. Delete the `'renders category badge'` test (lines 118-122)

**Step 4: Update drag-preview.test.tsx**

Edit `frontend/src/components/sources/__tests__/drag-preview.test.tsx`:

1. Remove `CategoryKey` references
2. Remove `category` field from the mock `sensorMap` objects (lines 30-32):

```typescript
const sensorMap: Record<string, { key: string; label: string; desc: string }> = {
  hacker_news: { key: 'hacker_news', label: 'Hacker News', desc: 'Top stories from HN' },
  github: { key: 'github', label: 'GitHub Trending', desc: 'Daily trending repos' },
}
```

**Step 5: Update group-intelligence.test.ts**

Edit `frontend/src/lib/pipeline/__tests__/group-intelligence.test.ts`:

1. Remove `SENSOR_CATEGORY_MAP` import (if present)
2. Remove `ALL_CATEGORIES` import (if present)
3. Remove any tests specifically testing the category fallback path (tests with `sensorSets = undefined` that verify fallback to `SENSOR_CATEGORY_MAP`)
4. Update report fixtures: change `items` from `Record<CategoryKey, IntelItem[]>` to plain objects with group-id-like keys

**Step 6: Update handlers.test.ts**

Check `frontend/src/lib/pipeline/states/__tests__/handlers.test.ts`:
1. If it mocks `SENSOR_CATEGORY_MAP`, remove/update the mock
2. If it references `CategoryKey` types, remove them

**Step 7: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add -A
git commit -m "test: remove category-related test cases and update fixtures

Removed tests for ALL_CATEGORIES, SENSOR_CATEGORY_MAP, emptyCategoryMap,
sensorsByLanguageAndCategory, CategoryBadge, and category fallback paths.
Updated mock data to use group-keyed report structures."
```

---

### Task 10: Update client-side IntelReport type

The API client has its own `IntelReport` interface that may still reference categories.

**Files:**
- Modify: `frontend/src/api/client.ts`

**Step 1: Verify client.ts IntelReport type**

Check `frontend/src/api/client.ts` line 159-168. The `items` field should already be `Record<string, IntelItem[]>` (the explore agent found this). If it already is, no changes needed. If it still says `CategoryKey`, change it to `Record<string, IntelItem[]>`.

**Step 2: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 3: Commit (if changes needed)**

```bash
git add frontend/src/api/client.ts
git commit -m "refactor(client): ensure IntelReport.items uses Record<string, IntelItem[]>"
```

---

### Task 11: Final verification

Run the full test suite, type-check, and verify no remaining category references.

**Step 1: Run tests**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Grep for leftover category references**

Run a search for any remaining `CategoryKey`, `ALL_CATEGORIES`, `CATEGORY_META`, `SENSOR_CATEGORY_MAP`, `CategoryBadge`, `emptyCategoryMap`, `sensorsForCategory`, `sensorsByLanguageAndCategory` imports/usages in `frontend/src/`:

```bash
grep -rn 'CategoryKey\|ALL_CATEGORIES\|CATEGORY_META\|SENSOR_CATEGORY_MAP\|CategoryBadge\|emptyCategoryMap\|sensorsForCategory\|sensorsByLanguageAndCategory' frontend/src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.test.'
```

Expected: No matches (test files may still reference them in comments, that's fine)

**Step 4: Commit any fixes**

If any leftover references found, fix them and commit.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify no remaining category references

All category-related types, constants, and components have been
removed. Groups are the sole classification system."
```
