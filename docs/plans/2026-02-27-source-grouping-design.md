# Source Grouping — Design Document

**Date:** 2026-02-27
**Status:** Approved

## Goal

Replace hardcoded sensor categorization with user-defined, persistent source groups. Groups become the single source of truth for organizing sensors, driving the intelligence pipeline, and structuring the Data page. The Sources page becomes a drag-and-drop group manager with soft UI styling.

## Architecture

Groups are first-class entities stored in SQLite with a dedicated REST API. A many-to-many junction table allows sensors to belong to multiple groups. Groups support one level of nesting (parent → sub-group). Each group carries a `processing` field that tells the intelligence pipeline what analysis to run — this field is designed to evolve from a simple string enum into a composable JSON pipeline definition for the future card-builder feature.

## Data Model

### Tables

```sql
CREATE TABLE source_groups (
  id          TEXT PRIMARY KEY,         -- UUID
  parent_id   TEXT REFERENCES source_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,            -- hex color
  icon        TEXT,                     -- optional Lucide icon name
  processing  TEXT NOT NULL DEFAULT 'general',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE source_group_members (
  group_id    TEXT NOT NULL REFERENCES source_groups(id) ON DELETE CASCADE,
  sensor_key  TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  added_at    TEXT NOT NULL,
  PRIMARY KEY (group_id, sensor_key)
);
```

### Processing Types (v1)

| Value | Intelligence Analysis |
|-------|----------------------|
| `trend` | Clustering + velocity + LLM synthesis |
| `topic` | Group by `item.topic` + sentiment analysis |
| `social` | Group by `item.account` + theme analysis |
| `research` | High-trust summarization |
| `news` | News aggregation summarization |
| `opinion` | Opinion/blog summarization |
| `general` | Basic summarization only |

### Default Groups (seeded on first init)

| Group | Color | Processing | Sensors |
|-------|-------|------------|---------|
| Research & Reports | `#1A7A6D` | `research` | arxiv |
| News | `#2E7D9A` | `news` | hacker_news, product_hunt, chrome_radar, sources_36kr, wallstreetcn, rss_news, github |
| Trending | `#C4851C` | `trend` | v2ex, zhihu, weibo, xiaohongshu, baidu_tieba, douyin, toutiao, netease, 36kr_trending, juejin, baidu, mastodon_trends |
| Opinions | `#7E6B9A` | `opinion` | hn_blogs, rss_feeds |
| Topics | `#3D9E85` | `topic` | x, bluesky, mastodon |

### Constraints

- **Nesting:** Max one level (enforced at API, not schema). Sub-groups have `parent_id` pointing to a top-level group; top-level groups have `parent_id = NULL`.
- **Many-to-many:** A sensor can appear in multiple groups via the junction table.
- **Ungrouped:** Sensors not in any group appear in an auto-generated "Ungrouped" catch-all on the UI. They are still fetched but excluded from group-based intelligence analysis.
- **CASCADE:** Deleting a group removes its members and sub-groups.

## REST API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/groups` | List all groups as tree (children nested) |
| `POST` | `/api/groups` | Create group (top-level or sub-group) |
| `PUT` | `/api/groups/:id` | Update properties (name, color, icon, processing) |
| `DELETE` | `/api/groups/:id` | Delete group (CASCADE) |
| `PUT` | `/api/groups/reorder` | Batch update sort_order |
| `PUT` | `/api/groups/:id/members` | Set members (full replacement) |
| `POST` | `/api/groups/:id/members` | Add sensor(s) to group |
| `DELETE` | `/api/groups/:id/members/:key` | Remove sensor from group |

### Response Shape

```typescript
interface GroupResponse {
  id: string
  name: string
  color: string
  icon: string | null
  processing: string
  sort_order: number
  sensors: string[]
  children: GroupResponse[]
}
```

### Validation

- `parent_id` on create: parent must exist and be top-level (no nesting beyond 1)
- `name`: non-empty, trimmed, max 50 chars
- `color`: valid hex
- `sensor_key`: must exist in SENSORS taxonomy

## Sources Page UI

### Soft UI Design Language

- Group cards: `border-radius: 12px`, `box-shadow: var(--shadow-md)`, 4px color accent bar on left
- Sensor rows: `border-radius: 8px`, gentle hover transitions (150ms)
- Drop zones: soft blue highlight with dashed border during drag
- "Add Group" button: rounded pill, `background: var(--accent-subtle)`, `color: var(--accent)`
- Sub-groups: indented within parent, lighter background, collapsible

### Drag-and-Drop (`@dnd-kit`)

- **Default drag** = move (remove from source, add to target)
- **Alt/Option + drag** = copy (keep in source, add to target)
- **"+" button** on sensor row → dropdown to add to additional groups
- Groups reorderable via header drag
- Sensors reorderable within group

### Sensor Card (preserved from current)

All existing sensor controls remain:
- Toggle on/off
- Items limit pill
- Lookback hours pill
- Status badge (ok/failed/disabled)
- CN language badge
- Social: account lists, topic keywords, following toggles

### Group Management

- **Create:** Inline form (name + color picker preset palette + optional icon)
- **Edit:** Inline rename, color change via kebab menu
- **Delete:** Confirmation dialog, warns about sub-groups and orphaned sensors
- **Sub-group:** "Add sub-group" link at bottom of top-level groups

### Mobile

- Single column, stacked groups
- Drag-and-drop → "Move to group" button fallback
- Sensor pills stack below label
- Kebab menu → bottom sheet

## Pipeline Integration

### What Groups Replace

| Before (hardcoded) | After (group-driven) |
|--------------------|---------------------|
| `SENSOR_DISPLAY_MAP` | Group membership queries |
| `DISPLAY_CATEGORIES` | Group list from DB |
| `CATEGORY_TO_DISPLAY` | Removed |
| `itemsByDisplayCategory()` | New `itemsByGroup()` |
| `SENSOR_TO_SECTION` | Group membership |

### What Stays

- `SENSOR_CATEGORY_MAP` — internal categories for data storage bucketing
- `ALL_CATEGORIES` — storage-level keys in `IntelReport.items`
- `SENSORS` array — canonical sensor definitions

### Intelligence Pipeline Changes

`helpers.ts` `runIntelligence()` changes from hardcoded splits to group-driven:

```typescript
const groups = await listGroupsFlat()
for (const group of groups) {
  const sensors = new Set(group.sensors)
  const groupItems = allItems.filter(i => sensors.has(i.source))

  switch (group.processing) {
    case 'trend':  processTrend(groupItems, ...)   break
    case 'topic':  processTopics(groupItems, ...)  break
    case 'social': processAccounts(groupItems, ...) break
    default:       /* basic summarization */        break
  }
}
```

### Data Page

Dynamic tabs from groups (replaces hardcoded 4-tab display categories).

### Migration

On first `initDb()` after upgrade, if `source_groups` table is empty, seed 5 default groups with sensor assignments derived from current `SENSOR_DISPLAY_MAP`.

## New Files

| File | Purpose |
|------|---------|
| `frontend/src/lib/groups.ts` | DB query layer (CRUD, seeding, query helpers) |
| `frontend/src/app/api/groups/route.ts` | GET (list) + POST (create) |
| `frontend/src/app/api/groups/[id]/route.ts` | PUT (update) + DELETE |
| `frontend/src/app/api/groups/[id]/members/route.ts` | PUT (set) + POST (add) |
| `frontend/src/app/api/groups/[id]/members/[key]/route.ts` | DELETE (remove) |
| `frontend/src/app/api/groups/reorder/route.ts` | PUT (batch reorder) |
| `frontend/src/components/sources/GroupCard.tsx` | Soft UI group card component |
| `frontend/src/components/sources/SensorDragItem.tsx` | Draggable sensor row |
| `frontend/src/components/sources/GroupForm.tsx` | Inline create/edit form |
| `frontend/src/components/sources/UngroupedSection.tsx` | Catch-all for unassigned sensors |

## Testing

| Layer | Type | Coverage |
|-------|------|----------|
| `groups.ts` | Unit | CRUD, seeding, nesting constraint, valid sensor keys |
| API routes | Integration | Request validation, error codes, CASCADE behavior |
| Pipeline | Unit | Group-driven item splits, processing dispatch, ungrouped handling |
| Sources page | E2E | Group CRUD, drag-and-drop, sub-groups, mobile fallback |
| Data page | Integration | Dynamic tabs, group-based filtering |

## Dependencies

- `@dnd-kit/core` — drag-and-drop primitives
- `@dnd-kit/sortable` — sortable lists
- `@dnd-kit/utilities` — CSS transform utilities

## Future Evolution

The `processing` field is the extension point for the card-builder vision:

- **v1 (this feature):** Simple string enum selecting pre-built analysis pipelines
- **v2 (card-builder):** JSON object defining composable processing modules:
  ```json
  {
    "modules": ["keyword_extraction", "sentiment", "llm_synthesis"],
    "prompt": "Analyze trends in...",
    "output": "card"
  }
  ```

No schema migration needed — `processing` is TEXT, accepting both `"trend"` and `{"modules": [...]}`.
