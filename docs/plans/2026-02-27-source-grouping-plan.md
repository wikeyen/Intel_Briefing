# Source Grouping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded sensor categorization with user-defined, persistent source groups — backed by SQLite, managed via REST API, with drag-and-drop soft UI on the Sources page, and group-driven intelligence analysis.

**Architecture:** Two new SQLite tables (`source_groups` + `source_group_members`) with full REST CRUD. The Sources page becomes a group-centric drag-and-drop manager using `@dnd-kit`. The intelligence pipeline reads group membership and `processing` type instead of hardcoded `SENSOR_DISPLAY_MAP`. Data page tabs become dynamic from groups.

**Tech Stack:** Next.js 15, `@libsql/client` (SQLite), `@dnd-kit/core` + `@dnd-kit/sortable`, TypeScript, Vitest

**Worktree:** `.worktrees/source-grouping` on branch `feat/source-grouping`

**Design doc:** `docs/plans/2026-02-27-source-grouping-design.md`

---

## Phase 1: Foundation

### Task 1: DB Schema + Group Types

Add the two new tables to `initDb()` and define TypeScript types for groups.

**Files:**
- Modify: `frontend/src/lib/db.ts` (add CREATE TABLE statements to `initDb()`)
- Create: `frontend/src/lib/groups/types.ts` (TypeScript interfaces)
- Test: `frontend/src/lib/groups/__tests__/types.test.ts`

**Context:** `initDb()` in `db.ts` (lines 22-41) creates tables idempotently using `CREATE TABLE IF NOT EXISTS`. Add the two new tables in the same pattern. The types file defines the canonical TypeScript interfaces used everywhere.

**Step 1: Create types file**

Create `frontend/src/lib/groups/types.ts`:

```typescript
// ABOUTME: TypeScript types for source groups — the user-defined sensor classification system.
// ABOUTME: Groups are persisted in SQLite and drive intelligence analysis, Data page tabs, and Sources page layout.

/** Processing pipeline hint — determines what intelligence analysis runs on a group's data. */
export type GroupProcessing = 'trend' | 'topic' | 'social' | 'research' | 'news' | 'opinion' | 'general'

/** A source group as stored in the database. */
export interface SourceGroup {
  id: string
  parent_id: string | null
  name: string
  color: string
  icon: string | null
  processing: GroupProcessing
  sort_order: number
  created_at: string
  updated_at: string
}

/** A group with its member sensor keys (flat, for pipeline use). */
export interface SourceGroupFlat extends SourceGroup {
  sensors: string[]
}

/** A group with children and sensors (tree, for UI use). */
export interface SourceGroupTree extends SourceGroup {
  sensors: string[]
  children: SourceGroupTree[]
}

/** Payload for creating a new group. */
export interface CreateGroupPayload {
  name: string
  color: string
  icon?: string | null
  processing?: GroupProcessing
  parent_id?: string | null
}

/** Payload for updating an existing group. */
export interface UpdateGroupPayload {
  name?: string
  color?: string
  icon?: string | null
  processing?: GroupProcessing
}
```

**Step 2: Add tables to initDb()**

In `frontend/src/lib/db.ts`, after the `pipeline_items` CREATE TABLE, add:

```typescript
  await globalForDb.__dbClient.execute(`
    CREATE TABLE IF NOT EXISTS source_groups (
      id          TEXT PRIMARY KEY,
      parent_id   TEXT REFERENCES source_groups(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL,
      icon        TEXT,
      processing  TEXT NOT NULL DEFAULT 'general',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `)
  await globalForDb.__dbClient.execute(`
    CREATE TABLE IF NOT EXISTS source_group_members (
      group_id    TEXT NOT NULL REFERENCES source_groups(id) ON DELETE CASCADE,
      sensor_key  TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      added_at    TEXT NOT NULL,
      PRIMARY KEY (group_id, sensor_key)
    )
  `)
```

**Step 3: Write a smoke test for the types**

Create `frontend/src/lib/groups/__tests__/types.test.ts`:

```typescript
// ABOUTME: Type smoke tests — verifies group type definitions compile and satisfy constraints.
// ABOUTME: Ensures GroupProcessing covers all expected values and SourceGroupTree nests correctly.
import { describe, it, expect } from 'vitest'
import type { GroupProcessing, SourceGroup, SourceGroupFlat, SourceGroupTree, CreateGroupPayload } from '../types'

describe('group types', () => {
  it('GroupProcessing accepts all expected values', () => {
    const values: GroupProcessing[] = ['trend', 'topic', 'social', 'research', 'news', 'opinion', 'general']
    expect(values).toHaveLength(7)
  })

  it('SourceGroupTree supports nesting', () => {
    const child: SourceGroupTree = {
      id: 'child-1', parent_id: 'parent-1', name: 'CN Trending',
      color: '#C4851C', icon: null, processing: 'trend', sort_order: 0,
      created_at: '', updated_at: '', sensors: ['weibo'], children: [],
    }
    const parent: SourceGroupTree = {
      id: 'parent-1', parent_id: null, name: 'Trending',
      color: '#C4851C', icon: null, processing: 'trend', sort_order: 0,
      created_at: '', updated_at: '', sensors: ['github'], children: [child],
    }
    expect(parent.children).toHaveLength(1)
    expect(parent.children[0].parent_id).toBe(parent.id)
  })
})
```

**Step 4: Run tests**

Run: `cd frontend && npx vitest run src/lib/groups/__tests__/types.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add frontend/src/lib/db.ts frontend/src/lib/groups/
git commit -m "feat(groups): add DB schema and TypeScript types for source groups"
```

---

### Task 2: Group Query Module + Seeding

Create the DB query layer with CRUD operations and default group seeding logic.

**Files:**
- Create: `frontend/src/lib/groups/index.ts` (query module — barrel export)
- Create: `frontend/src/lib/groups/queries.ts` (all DB query functions)
- Create: `frontend/src/lib/groups/seed.ts` (default group seeding)
- Test: `frontend/src/lib/groups/__tests__/queries.test.ts`

**Context:** Follow the pattern from `db.ts` — use `getDb()` to get the client, `db.execute({ sql, args })` for parameterized queries. UUID generation: use `crypto.randomUUID()`. The seed function is called from `initDb()` after table creation.

**Step 1: Write failing tests for the query module**

Create `frontend/src/lib/groups/__tests__/queries.test.ts` with tests covering:

- `listGroups()` returns empty array initially
- `createGroup()` creates a group and returns it
- `createGroup()` with `parent_id` creates a sub-group
- `createGroup()` rejects nesting beyond 1 level (parent's parent_id must be null)
- `updateGroup()` updates properties
- `deleteGroup()` removes group and its members (CASCADE)
- `deleteGroup()` of parent removes sub-groups too
- `setGroupMembers()` replaces all members
- `addGroupMember()` adds a sensor to a group
- `removeGroupMember()` removes a sensor from a group
- `reorderGroups()` updates sort_order
- `listGroupsFlat()` returns groups with sensor arrays
- `sensorGroupMap()` returns sensor → group ID mapping
- `seedDefaultGroups()` creates 5 default groups with correct sensors
- `seedDefaultGroups()` is idempotent (no-op if groups already exist)

Use `initDb(':memory:')` in `beforeEach` for isolated in-memory DB per test.

**Step 2: Implement the query module**

Create `frontend/src/lib/groups/queries.ts`:

Key functions:
- `listGroups(): Promise<SourceGroupTree[]>` — loads all groups + members, assembles tree
- `listGroupsFlat(): Promise<SourceGroupFlat[]>` — flat list with sensor arrays (for pipeline)
- `sensorGroupMap(): Promise<Map<string, string[]>>` — sensor key → group IDs
- `getGroup(id): Promise<SourceGroupFlat | null>`
- `createGroup(payload: CreateGroupPayload): Promise<SourceGroupFlat>` — validates nesting, generates UUID
- `updateGroup(id, payload: UpdateGroupPayload): Promise<SourceGroupFlat>`
- `deleteGroup(id): Promise<void>` — CASCADE handles members + sub-groups
- `setGroupMembers(groupId, sensorKeys: string[]): Promise<void>` — DELETE all + INSERT
- `addGroupMember(groupId, sensorKey): Promise<void>`
- `removeGroupMember(groupId, sensorKey): Promise<void>`
- `reorderGroups(orderedIds: string[]): Promise<void>` — batch UPDATE sort_order

Validation in `createGroup`:
- If `parent_id` is set, verify parent exists and parent's `parent_id` is null (max 1 level)
- Trim name, verify non-empty, max 50 chars
- Verify color is valid hex (`/^#[0-9A-Fa-f]{6}$/`)

Create `frontend/src/lib/groups/seed.ts`:

```typescript
// ABOUTME: Seeds 5 default source groups on first startup.
// ABOUTME: Called from initDb() when source_groups table is empty.

import { getDb } from '../db'
import { createGroup, setGroupMembers } from './queries'
import type { GroupProcessing } from './types'

interface DefaultGroup {
  name: string
  color: string
  processing: GroupProcessing
  sensors: string[]
}

const DEFAULT_GROUPS: DefaultGroup[] = [
  {
    name: 'Research & Reports',
    color: '#1A7A6D',
    processing: 'research',
    sensors: ['arxiv'],
  },
  {
    name: 'News',
    color: '#2E7D9A',
    processing: 'news',
    sensors: ['hacker_news', 'product_hunt', 'chrome_radar', 'sources_36kr', 'wallstreetcn', 'rss_news', 'github'],
  },
  {
    name: 'Trending',
    color: '#C4851C',
    processing: 'trend',
    sensors: ['v2ex', 'zhihu', 'weibo', 'xiaohongshu', 'baidu_tieba', 'douyin', 'toutiao', 'netease', '36kr_trending', 'juejin', 'baidu', 'mastodon_trends'],
  },
  {
    name: 'Opinions',
    color: '#7E6B9A',
    processing: 'opinion',
    sensors: ['hn_blogs', 'rss_feeds'],
  },
  {
    name: 'Topics',
    color: '#3D9E85',
    processing: 'topic',
    sensors: ['x', 'bluesky', 'mastodon'],
  },
]

export async function seedDefaultGroups(): Promise<void> {
  const db = await getDb()
  const result = await db.execute('SELECT COUNT(*) as cnt FROM source_groups')
  const count = Number(result.rows[0].cnt)
  if (count > 0) return // already seeded

  for (let i = 0; i < DEFAULT_GROUPS.length; i++) {
    const def = DEFAULT_GROUPS[i]
    const group = await createGroup({
      name: def.name,
      color: def.color,
      processing: def.processing,
    })
    // Update sort_order since createGroup defaults to 0
    await db.execute({
      sql: 'UPDATE source_groups SET sort_order = ? WHERE id = ?',
      args: [i, group.id],
    })
    await setGroupMembers(group.id, def.sensors)
  }
}
```

Create `frontend/src/lib/groups/index.ts` (barrel):

```typescript
// ABOUTME: Barrel export for the groups module.
// ABOUTME: Re-exports types, query functions, and seeding.
export * from './types'
export * from './queries'
export { seedDefaultGroups } from './seed'
```

**Step 3: Wire seeding into initDb()**

In `frontend/src/lib/db.ts`, after the `source_group_members` CREATE TABLE, add:

```typescript
  // Seed default groups on first startup
  const { seedDefaultGroups } = await import('./groups/seed')
  await seedDefaultGroups()
```

Use dynamic import to avoid circular dependency (groups/queries.ts imports getDb from db.ts).

**Step 4: Run tests**

Run: `cd frontend && npx vitest run src/lib/groups/__tests__/queries.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/groups/ frontend/src/lib/db.ts
git commit -m "feat(groups): add query module with CRUD, seeding, and nesting validation"
```

---

## Phase 2: API Layer

### Task 3: REST API Routes

Create the API route handlers for group CRUD and member management.

**Files:**
- Create: `frontend/src/app/api/groups/route.ts` (GET list, POST create)
- Create: `frontend/src/app/api/groups/[id]/route.ts` (PUT update, DELETE)
- Create: `frontend/src/app/api/groups/[id]/members/route.ts` (PUT set, POST add)
- Create: `frontend/src/app/api/groups/[id]/members/[key]/route.ts` (DELETE remove)
- Create: `frontend/src/app/api/groups/reorder/route.ts` (PUT reorder)
- Test: `frontend/src/app/api/groups/__tests__/routes.test.ts`

**Context:** Follow the pattern from `frontend/src/app/api/config/route.ts`: use `NextRequest`/`NextResponse`, `export const dynamic = 'force-dynamic'`, parse JSON body with try/catch, return `{ error: '...' }` on validation failure (HTTP 400), HTTP 404 for not found. All ABOUTME headers required.

**Step 1: Write integration tests**

Test the full request → response cycle using actual DB (`:memory:`). Tests should cover:

- `GET /api/groups` returns seeded defaults
- `POST /api/groups` creates a group, returns it
- `POST /api/groups` with invalid name returns 400
- `POST /api/groups` with parent_id creates sub-group
- `POST /api/groups` with nested parent returns 400 (max 1 level)
- `PUT /api/groups/:id` updates name/color
- `PUT /api/groups/:id` with unknown ID returns 404
- `DELETE /api/groups/:id` removes group
- `PUT /api/groups/:id/members` replaces members
- `POST /api/groups/:id/members` adds a sensor
- `DELETE /api/groups/:id/members/:key` removes a sensor
- `PUT /api/groups/reorder` updates sort order

**Step 2: Implement route handlers**

`GET /api/groups`:
- Call `listGroups()`, return as JSON array

`POST /api/groups`:
- Parse body, validate `name` (required, non-empty, max 50), `color` (required, hex), `processing` (optional, default 'general'), `parent_id` (optional)
- Call `createGroup(payload)`, return 201

`PUT /api/groups/:id`:
- Parse body, validate fields if present
- Call `updateGroup(id, payload)`, return updated group or 404

`DELETE /api/groups/:id`:
- Call `deleteGroup(id)`, return `{ ok: true }` or 404

`PUT /api/groups/:id/members`:
- Parse body `{ sensors: string[] }`, call `setGroupMembers(id, sensors)`, return updated group

`POST /api/groups/:id/members`:
- Parse body `{ sensor_key: string }` or `{ sensors: string[] }`, call `addGroupMember(id, key)` for each, return updated group

`DELETE /api/groups/:id/members/:key`:
- Call `removeGroupMember(id, key)`, return `{ ok: true }`

`PUT /api/groups/reorder`:
- Parse body `{ ordered_ids: string[] }`, call `reorderGroups(ids)`, return `{ ok: true }`

**Step 3: Run tests**

Run: `cd frontend && npx vitest run src/app/api/groups/__tests__/routes.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add frontend/src/app/api/groups/
git commit -m "feat(groups): add REST API routes for group CRUD and member management"
```

---

### Task 4: API Client Methods

Add group API methods to the frontend client.

**Files:**
- Modify: `frontend/src/api/client.ts` (add group methods)

**Context:** Follow the existing `api` object pattern — each method calls `apiFetch<T>(path, options)`. Import the `SourceGroupTree` type from `@/lib/groups/types` for the response types.

**Step 1: Add types and methods**

Add to `frontend/src/api/client.ts`:

```typescript
// Import at top
import type { SourceGroupTree, SourceGroupFlat, CreateGroupPayload, UpdateGroupPayload } from '@/lib/groups/types'

// Add to the api object:
  getGroups: () =>
    apiFetch<SourceGroupTree[]>('/groups'),

  createGroup: (data: CreateGroupPayload) =>
    apiFetch<SourceGroupFlat>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGroup: (id: string, data: UpdateGroupPayload) =>
    apiFetch<SourceGroupFlat>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: string) =>
    apiFetch<{ ok: boolean }>(`/groups/${id}`, { method: 'DELETE' }),

  setGroupMembers: (id: string, sensors: string[]) =>
    apiFetch<SourceGroupFlat>(`/groups/${id}/members`, {
      method: 'PUT',
      body: JSON.stringify({ sensors }),
    }),

  addGroupMember: (id: string, sensorKey: string) =>
    apiFetch<SourceGroupFlat>(`/groups/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ sensor_key: sensorKey }),
    }),

  removeGroupMember: (id: string, sensorKey: string) =>
    apiFetch<{ ok: boolean }>(`/groups/${id}/members/${sensorKey}`, { method: 'DELETE' }),

  reorderGroups: (orderedIds: string[]) =>
    apiFetch<{ ok: boolean }>('/groups/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    }),
```

**Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(groups): add API client methods for group management"
```

---

## Phase 3: UI Components

### Task 5: Install @dnd-kit and Create GroupCard Component

Install the drag-and-drop library and build the core group card component with soft UI styling.

**Files:**
- Modify: `frontend/package.json` (add @dnd-kit dependencies)
- Create: `frontend/src/components/sources/GroupCard.tsx`
- Create: `frontend/src/components/sources/group-styles.ts` (shared soft UI style constants)

**Context:** The project uses inline styles with CSS custom properties (`--surface`, `--border`, `--shadow-md`, etc.). All components use the `'use client'` directive. ABOUTME headers required on all files.

**Step 1: Install dependencies**

```bash
cd frontend && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Create shared style constants**

Create `frontend/src/components/sources/group-styles.ts` — defines the soft UI design tokens:

- `GROUP_CARD_STYLE`: border-radius 12px, shadow-md, subtle inner glow, background surface
- `ACCENT_BAR_STYLE`: 4px wide left color bar
- `GROUP_HEADER_STYLE`: muted uppercase label, color dot
- `SENSOR_ROW_STYLE`: border-radius 8px, gentle hover, drag handle grip dots
- `DROP_ZONE_STYLE`: soft blue highlight, dashed border (active during drag)
- `ADD_GROUP_BUTTON_STYLE`: rounded pill, accent-subtle bg

**Step 3: Create GroupCard component**

Create `frontend/src/components/sources/GroupCard.tsx`:

Props:
```typescript
interface GroupCardProps {
  group: SourceGroupTree
  sensors: SensorDef[]             // all sensors in this group
  enabled: Record<string, boolean>
  statuses: Record<string, SensorStatus>
  sensorLimits: Record<string, number>
  sensorLookback: Record<string, number>
  defaultLimit: number
  defaultLookback: number
  onToggle: (key: string) => void
  onUpdateLimit: (key: string, value: number) => void
  onUpdateLookback: (key: string, value: number) => void
  onEditGroup: (group: SourceGroupTree) => void
  onDeleteGroup: (id: string) => void
  onAddSubGroup: (parentId: string) => void
  children?: React.ReactNode       // slot for social-specific controls
}
```

Renders:
- Color accent bar on left (4px wide, uses `group.color`)
- Header row: color dot + group name + sensor count badge + kebab menu (Edit, Delete)
- Sortable sensor list (renders via children or SensorDragItem)
- Sub-group sections (collapsible, indented)
- "Add sub-group" link at bottom (only for top-level groups)
- Drop zone overlay when dragging

**Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/sources/
git commit -m "feat(groups): install @dnd-kit and create GroupCard soft UI component"
```

---

### Task 6: SensorDragItem Component

Build the draggable sensor row that preserves all existing sensor controls.

**Files:**
- Create: `frontend/src/components/sources/SensorDragItem.tsx`

**Context:** The current sensor row (in `Sensors.tsx` `renderSensorRow`, lines 392-456) has: Toggle, label, CN badge, PillInput for items/lookback, Badge for status. All of this must be preserved inside the draggable wrapper. Use `@dnd-kit/sortable` `useSortable` hook.

**Step 1: Create SensorDragItem**

Props:
```typescript
interface SensorDragItemProps {
  sensor: SensorDef
  groupId: string
  enabled: boolean
  status: SensorStatus | undefined
  limit: number
  lookback: number | null          // null = no lookback support
  defaultLimit: number
  onToggle: () => void
  onUpdateLimit: (value: number) => void
  onUpdateLookback: (value: number) => void
  onAddToGroup: (sensorKey: string) => void  // "+" button → group picker
  onRemoveFromGroup: () => void
  memberGroupCount: number         // how many groups this sensor belongs to
}
```

Renders:
- Drag handle (6-dot grip icon, left side)
- Toggle switch
- Sensor label + CN badge
- PillInput for items limit
- PillInput for lookback (if supported)
- Status badge
- "+" button (adds to additional groups) — only shown on hover
- "×" remove button — only shown on hover, only if memberGroupCount > 0
- Uses `useSortable` from `@dnd-kit/sortable` for drag behavior
- Soft UI: 8px border-radius, gentle hover (150ms transition to `surface-inset` bg)

**Step 2: Commit**

```bash
git add frontend/src/components/sources/SensorDragItem.tsx
git commit -m "feat(groups): create draggable sensor row with preserved controls"
```

---

### Task 7: GroupForm, UngroupedSection, and GroupPicker

Build the inline group creation/edit form, the ungrouped catch-all, and the group picker dropdown.

**Files:**
- Create: `frontend/src/components/sources/GroupForm.tsx`
- Create: `frontend/src/components/sources/UngroupedSection.tsx`
- Create: `frontend/src/components/sources/GroupPicker.tsx`

**Context:** The project doesn't use modals for settings — everything is inline. Colors come from the existing CSS custom property palette. The project has a `useTranslation()` hook for i18n.

**Step 1: Create GroupForm**

Inline form for creating or editing a group. Shows name input, color preset palette (8 colors), optional processing type select. When editing, pre-fills current values.

Props:
```typescript
interface GroupFormProps {
  initial?: { name: string; color: string; processing: GroupProcessing }
  parentId?: string | null
  onSubmit: (data: CreateGroupPayload) => void
  onCancel: () => void
}
```

Color palette presets: `#1A7A6D`, `#2E7D9A`, `#C4851C`, `#7E6B9A`, `#3D9E85`, `#C4606E`, `#5B7553`, `#8B6C5C`

**Step 2: Create UngroupedSection**

Shows sensors that aren't in any group. Same soft UI card style but with muted header ("Ungrouped"). Sensors are draggable out of this section into groups.

Props:
```typescript
interface UngroupedSectionProps {
  sensors: SensorDef[]
  enabled: Record<string, boolean>
  statuses: Record<string, SensorStatus>
  // ... same sensor control props as GroupCard
}
```

Only renders if there are ungrouped sensors.

**Step 3: Create GroupPicker**

Small dropdown that appears when clicking the "+" button on a sensor. Shows checkboxes for each group the sensor could be added to (already-member groups are checked and disabled).

Props:
```typescript
interface GroupPickerProps {
  sensorKey: string
  groups: SourceGroupTree[]
  memberOf: string[]               // group IDs this sensor already belongs to
  onToggleGroup: (groupId: string, add: boolean) => void
  onClose: () => void
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/sources/
git commit -m "feat(groups): add GroupForm, UngroupedSection, and GroupPicker components"
```

---

### Task 8: Rewrite Sources Page with Group-Based Layout

Replace the current `Sensors.tsx` with a group-driven layout using drag-and-drop.

**Files:**
- Modify: `frontend/src/components/Sensors.tsx` (major rewrite)
- Modify: `frontend/src/lib/i18n/locales/en.ts` (add group-related i18n keys)
- Modify: `frontend/src/lib/i18n/locales/zh.ts` (add group-related i18n keys)

**Context:** The current `Sensors.tsx` is a ~700 line monolith that renders 5 hardcoded sections. It uses `useAutoSave` for config persistence. The new version loads groups from the API and uses them as the layout structure. The Defaults card (items limit, lookback sliders) stays at the top. Social-specific controls (account lists, topic keywords, following toggles) render inside their group's section when a social sensor is present.

**Step 1: Rewrite Sensors.tsx**

Major structural changes:
- Load groups from `api.getGroups()` on mount (in addition to config)
- Use `DndContext` + `SortableContext` from `@dnd-kit` for drag-and-drop
- Render groups in `sort_order`, each as a `GroupCard`
- Render `UngroupedSection` at the bottom (if ungrouped sensors exist)
- "New Group" button at top-right opens inline `GroupForm`

State management:
- `groups: SourceGroupTree[]` — loaded from API
- Existing config state stays for sensor toggles, limits, lookback, accounts, etc.
- Group mutations (create, update, delete, reorder, member changes) call the API and refresh the group list

Drag-and-drop wiring:
- `onDragEnd` handler: determines source group, target group, sensor key
  - Default: move (remove from source, add to target)
  - Alt key held: copy (add to target, keep in source)
- `onDragStart` handler: visual feedback (lift sensor, highlight valid drop zones)

Social sensor controls:
- When a social sensor (x, bluesky, mastodon) appears in a group, the group card renders the social-specific controls (account lists, topic keywords, following toggles) below the sensor rows
- These controls are passed via the `children` prop of `GroupCard`
- The Topics section (social_topics_keywords) renders in the group that contains at least one social sensor

Mobile responsive:
- On mobile (< 768px), disable drag-and-drop
- Show "Move to..." button on each sensor row instead
- Group kebab menu becomes full-width buttons

**Step 2: Add i18n keys**

Add to `en.ts` and `zh.ts`:
- `sources.new_group` / `sources.edit_group` / `sources.delete_group`
- `sources.delete_group_confirm` (with warning about sub-groups)
- `sources.ungrouped` / `sources.ungrouped_desc`
- `sources.add_subgroup` / `sources.move_to` / `sources.add_to_group`
- `sources.processing_type` (label for the processing dropdown)
- Processing type labels: `sources.processing_trend`, `sources.processing_topic`, etc.

**Step 3: Run full frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All existing tests still pass (sensor behavior unchanged)

**Step 4: Commit**

```bash
git add frontend/src/components/Sensors.tsx frontend/src/lib/i18n/
git commit -m "feat(groups): rewrite Sources page with group-based drag-and-drop layout"
```

---

## Phase 4: Pipeline Integration

### Task 9: Replace Hardcoded Categories in Intelligence Pipeline

Update the intelligence pipeline to use group membership instead of `SENSOR_DISPLAY_MAP`.

**Files:**
- Modify: `frontend/src/lib/pipeline/helpers.ts` (update `runIntelligence()`)
- Modify: `frontend/src/lib/pipeline/intelligence.ts` (update analysis functions to accept group context)
- Test: `frontend/src/lib/pipeline/__tests__/group-intelligence.test.ts`

**Context:** Currently `helpers.ts` (lines 242-256) splits items using:
```
trendItems = filter(SENSOR_CATEGORY_MAP[source] === 'trend')
topicItems = filter(item.topic != null)
accountItems = filter(item.account != null && SENSOR_CATEGORY_MAP[source] === 'social')
```

Replace with group-driven splits:
```
for each group:
  groupItems = filter(groupSensors.has(item.source))
  dispatch based on group.processing
```

**Step 1: Write failing tests**

Test that:
- `runIntelligence` with groups containing trend sensors runs trend analysis on those items only
- `runIntelligence` with topic group filters for items with `item.topic != null`
- `runIntelligence` with social group filters for items with `item.account != null`
- Items from ungrouped sensors are excluded from analysis
- NLP pipeline path uses groups for section splitting too

**Step 2: Update helpers.ts**

In `runIntelligence()`:
- Import `listGroupsFlat` from `../groups`
- Load groups at the start of intelligence analysis
- Build a sensor-to-group mapping
- For each group with processing `'trend'`, collect items and run trend analysis
- For each group with processing `'topic'`, collect items with `item.topic != null` and run topic analysis
- For each group with processing `'social'`, collect items with `item.account != null` and run account analysis
- Log group names in tracker events for transparency

The NLP pipeline path (lines 240-296) needs the same update — split by group instead of by `SENSOR_CATEGORY_MAP`.

**Step 3: Run tests**

Run: `cd frontend && npx vitest run src/lib/pipeline/__tests__/`
Expected: All pipeline tests PASS (both new and existing)

**Step 4: Commit**

```bash
git add frontend/src/lib/pipeline/
git commit -m "feat(groups): replace hardcoded category splits with group-driven intelligence pipeline"
```

---

### Task 10: Dynamic Data Page Tabs

Replace hardcoded display category tabs on the Data page with dynamic group-based tabs.

**Files:**
- Modify: `frontend/src/components/Data.tsx` (dynamic tabs from groups)
- Test: Verify manually + existing tests pass

**Context:** The Data page (`Data.tsx`) currently has a hardcoded `SECTIONS` array with 4 display categories. Each tab shows items filtered by display category using `itemsByDisplayCategory()`. Replace with groups loaded from the API.

**Step 1: Update Data.tsx**

- Load groups from `api.getGroups()` on mount
- Build tabs from groups (each group = one tab, using group name and color)
- Filter items: for each tab, show items whose `source` sensor is a member of that group
- Add an "All" tab at the start that shows everything
- Replace `SECTION_SENSORS` lookup with group membership
- Replace `itemsByDisplayCategory()` with `itemsByGroup()` (utility in groups module)
- Color-code tab indicators using each group's color

**Step 2: Add `itemsByGroup` utility**

Add to `frontend/src/lib/groups/queries.ts`:

```typescript
export function itemsByGroup(
  items: Record<string, IntelItem[]>,
  groups: SourceGroupFlat[],
): Map<string, IntelItem[]> {
  const result = new Map<string, IntelItem[]>()
  const allItems: IntelItem[] = []
  for (const arr of Object.values(items)) allItems.push(...arr)

  for (const group of groups) {
    const sensors = new Set(group.sensors)
    result.set(group.id, allItems.filter(i => sensors.has(i.source)))
  }
  return result
}
```

**Step 3: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add frontend/src/components/Data.tsx frontend/src/lib/groups/
git commit -m "feat(groups): dynamic Data page tabs from source groups"
```

---

## Phase 5: Cleanup

### Task 11: Remove Old Display Category Code

Clean up the hardcoded display category system that groups have replaced.

**Files:**
- Modify: `frontend/src/lib/sensors/taxonomy.ts` (remove DISPLAY_CATEGORIES, SENSOR_DISPLAY_MAP, etc.)
- Modify: `frontend/src/components/sources/sections.ts` (remove or deprecate SENSOR_TO_SECTION)
- Modify: Any files that import the removed exports (update to use groups)
- Test: Full test suite pass

**Context:** The following exports from `taxonomy.ts` are replaced by groups:
- `DISPLAY_CATEGORIES`
- `DisplayCategoryKey`
- `DISPLAY_CATEGORY_META`
- `SENSOR_DISPLAY_MAP`
- `CATEGORY_TO_DISPLAY`
- `emptyDisplayCategoryMap()`
- `itemsByDisplayCategory()`

And from `sections.ts`:
- `SENSOR_TO_SECTION`
- `SOURCE_SECTIONS`
- `SourceSection`

**Step 1: Find all imports of removed exports**

Search the codebase for every file that imports `SENSOR_DISPLAY_MAP`, `DISPLAY_CATEGORIES`, `itemsByDisplayCategory`, `SENSOR_TO_SECTION`, or `SOURCE_SECTIONS`. Update each to use the groups API instead.

Key consumers:
- `Data.tsx` — already updated in Task 10
- `Dashboard.tsx` — uses `itemsByDisplayCategory()` and `displayCategoryOf()` — update to use groups
- `intelligence.ts` — already updated in Task 9
- `helpers.ts` — already updated in Task 9
- Various test files — update imports

**Step 2: Remove deprecated exports**

Remove from `taxonomy.ts`:
- Lines 128-206 (everything after `emptyCategoryMap()`)

Remove `frontend/src/components/sources/sections.ts` entirely (replaced by group membership).

Update `frontend/src/components/sources/FoldableSection.tsx` — keep the component (it's still useful for sub-groups within GroupCard).

**Step 3: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All PASS with no references to removed exports

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(groups): remove hardcoded display categories replaced by source groups"
```

---

### Task 12: E2E Verification and Visual Testing

Verify the complete feature end-to-end using Playwright screenshots.

**Files:**
- No code changes (verification only)

**Step 1: Start dev server**

Ensure the dev server is running on port 8000 with the worktree's code.

**Step 2: Desktop verification (1280×800)**

Navigate to:
- `/sources` — verify group cards render, drag-and-drop works, sensor controls functional
- `/data` — verify dynamic tabs from groups, items filtered correctly
- `/dashboard` — verify no broken references to old display categories

Take screenshots of each page.

**Step 3: Mobile verification (390×844)**

Resize to mobile viewport and verify:
- Sources page: groups stack, no horizontal overflow, "Move to" buttons work
- Data page: tabs scrollable, items readable
- Dashboard: responsive layout intact

Take screenshots of each page.

**Step 4: Commit any fixes**

If visual issues found, fix and commit:
```bash
git commit -m "fix(groups): visual polish for [specific issue]"
```

---

## Summary

| Task | Phase | Dependencies | Est. Complexity |
|------|-------|-------------|----------------|
| 1. DB Schema + Types | Foundation | None | Low |
| 2. Query Module + Seeding | Foundation | Task 1 | Medium |
| 3. REST API Routes | API | Task 2 | Medium |
| 4. API Client Methods | API | Task 3 | Low |
| 5. @dnd-kit + GroupCard | UI | Task 4 | Medium |
| 6. SensorDragItem | UI | Task 5 | Medium |
| 7. GroupForm + Ungrouped + Picker | UI | Task 5 | Medium |
| 8. Rewrite Sources Page | UI | Tasks 5-7 | High |
| 9. Pipeline Intelligence | Pipeline | Task 2 | Medium |
| 10. Data Page Tabs | Pipeline | Tasks 2, 4 | Medium |
| 11. Remove Old Code | Cleanup | Tasks 9, 10 | Low |
| 12. E2E Verification | QA | All above | Low |

**Parallelizable:** Tasks 9-10 (pipeline) can run in parallel with Tasks 5-8 (UI), since they share only the groups query module (Task 2) as a dependency.
