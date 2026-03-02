# Overview Tab Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Overview tab the default landing page with a proper command center layout: aggregate analytics, citation-resolved executive summary, collapsible risk flags, and per-group snapshot cards.

**Architecture:** New `OverviewTab` component orchestrates the layout, delegating to existing `VisualDataStrip` for aggregate charts, a new `CitationText` component for resolving `[N]` references, a redesigned `ExecutiveSummaryCard` with better typography and citation support, and new `GroupSnapshotCard` components. Dashboard.tsx changes are minimal — just default tab logic and swapping in `OverviewTab`.

**Tech Stack:** React, inline styles with CSS custom properties, vitest + @testing-library/react

---

### Task 1: CitationText component

**Files:**
- Create: `frontend/src/components/dashboard/CitationText.tsx`
- Create: `frontend/src/components/dashboard/__tests__/CitationText.test.tsx`

Parses text containing `[N]` markers, resolves them against a `BriefingSource[]` array, and renders as React elements with superscript clickable links. Unresolvable references get stripped.

**Component interface:**
```tsx
interface CitationTextProps {
  text: string
  sources: BriefingSource[]
}
```

**Behavior:**
- Split text on `\[(\d+)\]` regex
- For each match, look up source by `id` field
- If found: render `<sup><a href={url} title={title} target="_blank" rel="noopener noreferrer">[N]</a></sup>`
- If not found: strip the marker (render nothing)
- Link styling: accent color, monospace, small font
- Text segments render as `<span>` elements

**Tests:**
- Renders plain text with no citations unchanged
- Resolves `[1]` to clickable link when source exists
- Strips `[99]` when source doesn't exist
- Handles multiple adjacent citations `[1][2][3]`
- Renders correct href and title from source

**Commit:** `feat(dashboard): add CitationText component for resolving [N] references`

---

### Task 2: Redesign ExecutiveSummaryCard

**Files:**
- Modify: `frontend/src/components/dashboard/ExecutiveSummaryCard.tsx`
- Modify: `frontend/src/components/dashboard/__tests__/ExecutiveSummaryCard.test.tsx`

Redesign the card to use `CitationText` for the executive summary, improve typography, and make risk flags collapsible.

**Changes:**
- Import and use `CitationText` for the executive summary text (pass `summary.overall.sources`)
- Add collapsible state for risk flags section (`useState` with `expanded` boolean)
- Default expanded state: expanded on desktop, collapsed on mobile (use `window.innerWidth` on mount)
- Better typography: slightly larger font (0.875rem), improved line-height (1.75), max-width for readability
- Keep mood badge, quick scan, existing styling patterns
- Add props: `sources` from `summary.overall.sources` passed through

**Tests update:**
- Test citation rendering in exec summary
- Test risk flags collapse/expand toggle

**Commit:** `feat(dashboard): redesign ExecutiveSummaryCard with citations and collapsible risk flags`

---

### Task 3: GroupSnapshotCard component

**Files:**
- Create: `frontend/src/components/dashboard/GroupSnapshotCard.tsx`
- Create: `frontend/src/components/dashboard/__tests__/GroupSnapshotCard.test.tsx`

Mini card showing a group's snapshot on the Overview tab.

**Props:**
```tsx
interface GroupSnapshotCardProps {
  group: SourceGroupTree
  items: IntelItem[]
  narrative: string  // pre-computed 1-line brief from summary
  tags: IntelTag[]   // pre-computed top 3 tags
  onClick: () => void
}
```

**Layout:**
- Card with `var(--shadow-card)`, left border in group color
- Top row: group name + item count badge (same style as tab bar badges)
- Middle: mini sentiment donut (32px, purely visual — compute from items) + top 3 tags as small pills
- Bottom: 1-line narrative truncated with ellipsis
- Entire card is clickable (`cursor: pointer`, hover effect)

**Responsive grid CSS:**
```css
.group-snapshot-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}
@media (max-width: 1024px) {
  .group-snapshot-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .group-snapshot-grid { grid-template-columns: 1fr; }
}
```

**Mini sentiment donut:**
- 32px SVG, same arc logic as SentimentRing but simplified
- If no sentiment data, show a neutral gray ring

**Tests:**
- Renders group name and item count
- Shows tags when provided
- Truncates long narrative
- Calls onClick when clicked
- Returns null when items array is empty

**Commit:** `feat(dashboard): add GroupSnapshotCard component`

---

### Task 4: OverviewTab orchestrator component

**Files:**
- Create: `frontend/src/components/dashboard/OverviewTab.tsx`
- Create: `frontend/src/components/dashboard/__tests__/OverviewTab.test.tsx`

Orchestrates the full Overview layout: aggregate analytics strip, executive summary, risk flags, group snapshots.

**Props:**
```tsx
interface OverviewTabProps {
  summary: BriefingSummary | null
  intelligence: IntelligenceReport | null
  groups: SourceGroupTree[]
  groupItemMap: Record<string, IntelItem[]>
  allSensorKeys: string[]
  onSelectGroup: (groupId: string) => void
}
```

**Layout (renders top to bottom):**
1. `VisualDataStrip` with ALL items flattened, `groupColor='var(--accent)'`, combined sensorKeys
2. `ExecutiveSummaryCard` (existing, now with citations)
3. Group snapshots section with header "SECTIONS" and `GroupSnapshotCard` grid

**Computed values:**
- `allItems`: flatten all items from `groupItemMap`
- Per-group narrative: extract brief from matching summary sections
- Per-group tags: extract from intelligence data using existing `extractRelevantTags`

**Tests:**
- Renders VisualDataStrip when items exist
- Renders ExecutiveSummaryCard when summary exists
- Renders group snapshot cards for each non-empty group
- Returns minimal content when no data

**Commit:** `feat(dashboard): add OverviewTab orchestrator component`

---

### Task 5: Wire OverviewTab into Dashboard + default tab

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx`

**Changes:**

1. **Default tab selection** (line 462-468): Change auto-select logic:
   ```tsx
   useEffect(() => {
     if (groups.length > 0 && activeGroupId === null) {
       if (summary?.overall?.executive_summary) {
         setActiveGroupId(OVERVIEW_TAB_ID)
       } else {
         const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
         setActiveGroupId(sorted[0].id)
       }
     }
   }, [groups, activeGroupId, summary])
   ```

2. **Replace Overview rendering** (line 571-575): Swap `ExecutiveSummaryCard` for `OverviewTab`:
   ```tsx
   {activeGroupId === OVERVIEW_TAB_ID && (
     <div style={{ marginTop: '0.75rem' }}>
       <OverviewTab
         summary={summary}
         intelligence={intelligence}
         groups={groups}
         groupItemMap={groupItemMap}
         allSensorKeys={allSensorKeys}
         onSelectGroup={setActiveGroupId}
       />
     </div>
   )}
   ```

3. **Compute allSensorKeys**: `useMemo` that collects all unique sensor keys from all groups.

4. **Remove direct ExecutiveSummaryCard import** (it's now used inside OverviewTab).

**Commit:** `feat(dashboard): wire OverviewTab as default landing tab`

---

### Task 6: Tests + verification

- Run full test suite: `cd frontend && npx vitest run`
- Playwright desktop verification (1280×800): Overview tab auto-selected, all sections visible
- Playwright mobile verification (390×844): responsive layout, collapsible risk flags
- Fix any issues found

**Commit:** (fix commits if needed)
