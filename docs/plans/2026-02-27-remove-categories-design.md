# Remove Categories — Groups as Sole Classification

## Summary

Replace the hardcoded 9-category taxonomy (`tech`, `research`, `finance`, `products`, `community`, `social`, `trend`, `insights`, `feeds`) with the existing user-configurable group system as the single source of truth for sensor classification across the entire application.

## Motivation

The codebase has two parallel classification systems:

1. **Categories** — hardcoded in `taxonomy.ts`, immutable, 9 fixed values. Drive `IntelReport` structure, Data page tabs, markdown rendering, and pipeline routing.
2. **Groups** — user-configurable in SQLite, with `processing` type (`trend`, `topic`, `social`, `research`, `news`, `opinion`, `general`). Drive Sources page layout and group-based intelligence.

Users can create, rename, reorder, and delete groups but cannot touch categories. This creates confusion: a sensor can be in the "Opinions" group but tagged as "social" category. Groups already won the UI — categories are vestigial.

## Design

### Data Model Changes

**`IntelReport.items`** changes from `Record<CategoryKey, IntelItem[]>` to `Record<string, IntelItem[]>` keyed by group ID. Ungrouped sensors go under a synthetic `"ungrouped"` key.

**`SensorDef`** drops the `category` field. Only `key`, `label`, `desc`, and `language` remain.

**Remove entirely:**
- `ALL_CATEGORIES`, `CategoryKey`, `CATEGORY_META`, `SENSOR_CATEGORY_MAP`
- `CategoryGroup`, `LanguageGroup`, `sensorsByLanguageAndCategory()`, `sensorsForCategory()`, `emptyCategoryMap()`
- `CategoryBadge` component and `CATEGORY_COLORS` constant

### Pipeline Changes

**Report building** (`report-builder.ts`): Instead of routing items by `SENSOR_CATEGORY_MAP[item.source]`, look up which group the sensor belongs to (from DB) and slot items into that group's bucket. Ungrouped sensors go to `"ungrouped"`.

**Intelligence** (`intelligence.ts`): The legacy category fallback paths (lines ~575-583 using `SENSOR_CATEGORY_MAP`) are replaced by group-based sensor sets, which already exist and work. The fallback code is dead weight.

**Helpers** (`helpers.ts`): Remove category assignment on new items.

### API Changes

**`/api/intel/[section]`**: Currently validates `section` param against `ALL_CATEGORIES`. Change to validate against group IDs from DB (or accept any string — the report builder handles unknown keys gracefully).

**`/api/cache/cleanup`**: Remove category-based cleanup logic; use group-based keys.

### UI Changes

**Sources page** (`Sensors.tsx`, `SensorDragItem.tsx`):
- Remove `CategoryBadge` from sensor rows
- Replace the `⚙` text character on complex sensor buttons with a proper SVG gear icon
- No other sensor row changes needed

**Sensor detail panel** (`SensorDetailPanel.tsx`):
- Remove `CategoryBadge` from panel header

**Data page tabs**: Currently hardcoded category tabs. Switch to group-based tabs fetched from the groups API. Tab label = group name. Ungrouped sensors get an "Ungrouped" tab (shown only if ungrouped sensors exist).

**Markdown renderer** (`markdown.ts`): Replace `ALL_CATEGORIES` iteration with group-based section iteration. Section headers use group name instead of `CATEGORY_META` label/emoji.

### Group Creation UI

When creating a new group, the `processing` type dropdown is hidden from the UI — it defaults to `general`. (Processing type becomes an internal pipeline concern configured elsewhere in Phase 2.)

### What Stays

- `SensorDef.language` (`'cn' | 'row'`) — still useful for CN badge display
- `CnBadge` component — unchanged
- `SENSOR_LABELS` map — unchanged
- `sensorToSource()` — unchanged
- `GroupProcessing` type and group `processing` field — unchanged in DB, just hidden from creation UI
- All group CRUD operations — unchanged

## Affected Files

### Remove / Heavy Modification
- `frontend/src/lib/sensors/taxonomy.ts` — remove all category exports, keep sensor defs without `category`
- `frontend/src/lib/models.ts` — change `IntelReport.items` type, remove `emptyItemsMap()`/`ensureAllSections()`
- `frontend/src/components/sources/SensorBadge.tsx` — remove `CategoryBadge`, `CATEGORY_COLORS`
- `frontend/src/lib/renderer/markdown.ts` — rewrite section iteration

### Moderate Modification
- `frontend/src/lib/pipeline/report-builder.ts` — group-based item routing
- `frontend/src/lib/pipeline/intelligence.ts` — remove category fallback paths
- `frontend/src/lib/pipeline/helpers.ts` — remove category assignment
- `frontend/src/components/Sensors.tsx` — remove category from SENSOR_MAP
- `frontend/src/components/sources/SensorDragItem.tsx` — remove CategoryBadge, SVG gear icon
- `frontend/src/components/sources/SensorDetailPanel.tsx` — remove CategoryBadge
- `frontend/src/app/api/intel/[section]/route.ts` — group-based validation
- `frontend/src/app/api/cache/cleanup/route.ts` — remove category references
- `frontend/src/api/client.ts` — update mirrored IntelReport type

### Test Updates
- `frontend/src/lib/sensors/sensors.test.ts` — remove category validation tests
- `frontend/src/lib/pipeline/__tests__/group-intelligence.test.ts` — remove legacy fallback tests
- `frontend/src/lib/pipeline/states/__tests__/handlers.test.ts` — update mocks
- `frontend/src/components/sources/__tests__/group-components.test.ts` — remove CategoryBadge tests
- `frontend/src/components/sources/__tests__/sensor-detail-panel.test.tsx` — remove CategoryBadge mock

## Risks

- **Data page regressions**: Tabs change from fixed to dynamic. Must handle zero-group edge case.
- **Report cache invalidation**: Existing cached reports are keyed by category. After deploy, old cache entries have stale keys. Mitigation: clear `kv` cache on migration or let TTL expire naturally.
- **Pipeline fallback removal**: The category-based fallback in `intelligence.ts` is a safety net. Removing it means all sensors MUST belong to a group or land in "ungrouped". This is fine — `seedDefaultGroups()` already assigns all sensors.

## Phase 2 (Future)

Per-group configurable workflow builder — users toggle processing steps (fetch, dedup, keyword extraction, sentiment, NER, clustering, translation, summary, priority scoring, briefing) and edit LLM prompt templates per group. Not in scope for this change.
