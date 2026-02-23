# Sources Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the Sources page from 9+ language-grouped sub-sections into 4 flat foldable sections (General, Social Accounts, Trend, RSS) with CN badges, per-feed RSS category switching, and items/lookback controls.

**Architecture:** Pure UI refactoring of `Sensors.tsx`. Replace the `ALL_GROUPS` iteration with 4 hardcoded section components. Add a `FoldableSection` wrapper, a `RssFeedList` component, and update the Trend section layout. No backend or pipeline changes.

**Tech Stack:** React 18, inline styles with CSS custom properties, existing `useAutoSave` hook, existing `TagInput` component.

---

### Task 1: Define the 4-section sensor mapping

**Files:**
- Create: `frontend/src/components/sources/sections.ts`

**Step 1: Create the section definitions file**

This file maps all 16 sensors into 4 sections, replacing the taxonomy-based grouping.

```typescript
// ABOUTME: Sources page section definitions — maps sensors to 4 UI categories.
// ABOUTME: General, Social Accounts, Trend, RSS — each with sensor keys and metadata.
import type { SensorDef } from '@/lib/sensors/taxonomy'
import { SENSORS } from '@/lib/sensors/taxonomy'

export type SourceSection = 'general' | 'social' | 'trend' | 'rss'

interface SectionDef {
  key: SourceSection
  label: string
  sensors: SensorDef[]
}

const SENSOR_TO_SECTION: Record<string, SourceSection> = {
  hacker_news: 'general',
  github: 'general',
  arxiv: 'general',
  product_hunt: 'general',
  chrome_radar: 'general',
  hn_blogs: 'general',
  sources_36kr: 'general',
  wallstreetcn: 'general',
  v2ex: 'general',
  zhihu: 'general',
  x: 'social',
  bluesky: 'social',
  mastodon: 'social',
  weibo: 'trend',
  xiaohongshu: 'trend',
  rss_feeds: 'rss',
  rss_news: 'rss',
}

/** Sensors that should be hidden from the sources page (controlled implicitly). */
export const HIDDEN_SENSORS = new Set(['rss_news'])

export const SOURCE_SECTIONS: SectionDef[] = [
  { key: 'general', label: 'General', sensors: [] },
  { key: 'social',  label: 'Social Accounts', sensors: [] },
  { key: 'trend',   label: 'Trend', sensors: [] },
  { key: 'rss',     label: 'RSS', sensors: [] },
]

// Populate from taxonomy
for (const sensor of SENSORS) {
  const section = SENSOR_TO_SECTION[sensor.key]
  if (!section) continue
  const def = SOURCE_SECTIONS.find(s => s.key === section)
  if (def) def.sensors.push(sensor)
}

/** Sensors that support lookback hours, with defaults. */
export const SENSOR_LOOKBACK_SUPPORT: Record<string, number> = {
  hacker_news: 24,
  github: 168,
  x: 48,
  bluesky: 48,
  mastodon: 48,
  hn_blogs: 72,
  arxiv: 72,
  wallstreetcn: 24,
  rss_feeds: 72,
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/sources/sections.ts
git commit -m "feat(sources): add 4-section sensor mapping"
```

---

### Task 2: Create FoldableSection component

**Files:**
- Create: `frontend/src/components/sources/FoldableSection.tsx`

**Step 1: Build the foldable section wrapper**

```typescript
// ABOUTME: Foldable section wrapper for the Sources page.
// ABOUTME: Collapsible card with header showing title, enabled count, and chevron.
'use client'
import { useState, type ReactNode } from 'react'

interface FoldableSectionProps {
  title: string
  enabledCount: number
  totalCount: number
  children: ReactNode
  defaultOpen?: boolean
}

export function FoldableSection({ title, enabledCount, totalCount, children, defaultOpen = true }: FoldableSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '0.25rem 0',
          marginBottom: open ? '0.375rem' : 0,
          cursor: 'pointer',
        }}
      >
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--ink-faint)',
          transition: 'transform 150ms',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          ▶
        </span>
        <span style={{
          fontSize: '0.625rem',
          fontWeight: 600,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}>
          {title}
        </span>
        <span style={{
          fontSize: '0.5625rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--ink-faint)',
          marginLeft: '0.25rem',
        }}>
          {enabledCount} / {totalCount}
        </span>
      </button>
      {open && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/sources/FoldableSection.tsx
git commit -m "feat(sources): add FoldableSection component"
```

---

### Task 3: Create RssFeedList component

**Files:**
- Create: `frontend/src/components/sources/RssFeedList.tsx`

**Step 1: Build the RSS feed list with per-feed category toggle**

Replaces the TagInput chip UI. Shows a text input to add feeds, then a list where each row has a category button, URL, and remove button. New feeds prepend to top.

```typescript
// ABOUTME: RSS feed list with per-feed category switching.
// ABOUTME: Add input at top, feed rows below with type toggle (news/blog/other) and remove.
'use client'
import { useState, useRef } from 'react'
import type { RssFeedEntry, RssFeedType } from '@/lib/models'

const TYPE_LABELS: Record<RssFeedType, { label: string; color: string; bg: string }> = {
  news:  { label: 'news',  color: '#1a4b8c', bg: '#e8f0fe' },
  blog:  { label: 'blog',  color: '#6d28d9', bg: '#ede9fe' },
  other: { label: 'other', color: 'var(--ink-muted)', bg: 'var(--surface-alt)' },
}

const TYPE_CYCLE: RssFeedType[] = ['news', 'blog', 'other']

interface RssFeedListProps {
  feeds: RssFeedEntry[]
  onChange: (feeds: RssFeedEntry[]) => void
  onAdd: (url: string) => void
}

export function RssFeedList({ feeds, onChange, onAdd }: RssFeedListProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    const url = input.trim()
    if (!url) return
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setError('Must be an HTTP(S) URL')
        return
      }
    } catch {
      setError('Invalid URL')
      return
    }
    if (feeds.some(f => f.url === url)) {
      setError('Already added')
      return
    }
    setError(null)
    setInput('')
    onAdd(url)
  }

  const cycleType = (index: number) => {
    const feed = feeds[index]
    const currentIdx = TYPE_CYCLE.indexOf(feed.type)
    const nextType = TYPE_CYCLE[(currentIdx + 1) % TYPE_CYCLE.length]
    const next = [...feeds]
    next[index] = { ...feed, type: nextType }
    onChange(next)
  }

  const remove = (index: number) => {
    onChange(feeds.filter((_, i) => i !== index))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {/* Add input */}
      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          placeholder="https://example.com/feed.xml — press Enter"
          style={{
            flex: 1,
            padding: '0.375rem 0.5rem',
            fontSize: '0.75rem',
            border: `1px solid ${error ? 'var(--err)' : 'var(--border)'}`,
            borderRadius: 4,
            background: 'var(--surface)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
      </div>
      {error && (
        <div style={{ fontSize: '0.625rem', color: 'var(--err)' }}>{error}</div>
      )}

      {/* Feed list */}
      {feeds.map((feed, i) => {
        const meta = TYPE_LABELS[feed.type]
        return (
          <div key={feed.url} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.25rem 0',
          }}>
            <button
              type="button"
              onClick={() => cycleType(i)}
              title={`Click to change category (currently: ${feed.type})`}
              style={{
                fontSize: '0.5625rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: meta.bg,
                color: meta.color,
                border: 'none',
                padding: '0.125rem 0.375rem',
                borderRadius: 999,
                cursor: 'pointer',
                flexShrink: 0,
                minWidth: 40,
                textAlign: 'center',
              }}
            >
              {meta.label}
            </button>
            <span style={{
              flex: 1,
              fontSize: '0.6875rem',
              color: 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {feed.url}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-faint)',
                fontSize: '0.875rem',
                padding: '0 0.25rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/sources/RssFeedList.tsx
git commit -m "feat(sources): add RssFeedList with per-feed category toggle"
```

---

### Task 4: Rewrite Sensors.tsx with 4 foldable sections

**Files:**
- Modify: `frontend/src/components/Sensors.tsx`

This is the main task. Rewrite the component to use the 4 sections from Task 1, the FoldableSection wrapper from Task 2, and the RssFeedList from Task 3.

**Step 1: Replace the `ALL_GROUPS` iteration with 4 explicit sections**

Key changes:
- Remove `ALL_GROUPS`, `GroupDef`, `LanguageBadge` (handled by sections.ts + CN badge inline)
- Remove `HIDDEN_SENSORS`, `SENSOR_LOOKBACK_SUPPORT` (moved to sections.ts)
- Import `SOURCE_SECTIONS`, `HIDDEN_SENSORS`, `SENSOR_LOOKBACK_SUPPORT` from sections.ts
- Import `FoldableSection` from Task 2
- Import `RssFeedList` from Task 3
- Update `LanguageBadge` to use Dashboard-style CN colors: `background: '#c8102e', color: '#ffe066'`
- Wrap each section in `<FoldableSection>` with enabled count

The 4 sections render as:

**General section** — Simple sensor rows with toggle, label, CN badge, items pill, lookback pill, status badge.

**Social Accounts section** — X, Bluesky, Mastodon rows with toggle + account sub-configs (existing TagInput + following toggles). Items/lookback pills on the sensor row.

**Trend section** — Two sub-groups:
1. **Trending Platforms**: X Trends (toggle, items), Mastodon Trends (toggle, items), Weibo (toggle, items) with CN badge, Xiaohongshu (toggle, items) with CN badge.
   - X Trends toggle maps to existing sensor config (requires apify_token).
   - Mastodon Trends toggle maps to `mastodonTrendsEnabled`.
   - Weibo/Xiaohongshu map to `sensors_enabled.weibo` / `sensors_enabled.xiaohongshu`.
2. **Topics**: Platform checkboxes (Bluesky, Mastodon) + keyword TagInput + lookback hours.

**RSS section** — Single RSS toggle + `RssFeedList` component below. The `rss_feeds` sensor enable/disable controls whether RSS runs at all. Feed list manages URLs and per-feed category.

**Step 2: Update auto-save payload**

No changes needed — same state variables, same payload shape.

**Step 3: Commit**

```bash
git add frontend/src/components/Sensors.tsx
git commit -m "feat(sources): rewrite with 4 foldable sections"
```

---

### Task 5: Run tests and fix

**Step 1: Run existing tests**

```bash
cd frontend && npx vitest run
```

Expected: All 587+ tests pass. The `Sensors.tsx` component has no dedicated test file (UI-only), but related tests (config, taxonomy) should still pass.

**Step 2: Verify UI manually**

Load `http://localhost:8000/sources` and verify:
- 4 foldable sections render correctly
- Each section folds/unfolds on header click
- CN badges appear on appropriate sensors with red+gold styling
- Toggle, items, lookback controls work and auto-save
- Social sub-configs (accounts, following) render inside Social Accounts section
- Trend sub-sections show Trending Platforms + Topics correctly
- RSS feed list shows feeds with category toggle, add input, remove button
- Adding a feed triggers discovery and prepends to list
- Cycling category on a feed changes the pill label

**Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix(sources): test and UI fixes"
```

---

### Task 6: Final verification and commit

**Step 1: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

**Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Final commit if needed, then report ready**
