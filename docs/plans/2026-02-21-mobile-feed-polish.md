# Mobile Feed UI Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Apple-like spring animations to the feed: sliding tab indicator, direction-aware tab content transitions, and staggered card entrances.

**Architecture:** Add `framer-motion` to the existing inline-styles + CSS-vars stack. Wrap existing components with `motion.*` wrappers — no structural changes. Track tab direction via index comparison for directional slide.

**Tech Stack:** React 19, Next.js 15, framer-motion, inline styles with CSS custom properties.

---

### Task 1: Install framer-motion

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install dependency**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npm install framer-motion`
Expected: Added to dependencies, no peer dep warnings.

**Step 2: Verify import works**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && node -e "require('framer-motion')"`
Expected: No errors.

**Step 3: Run existing tests**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx vitest run`
Expected: 469 tests pass. No regressions from adding the dependency.

**Step 4: Commit**

```bash
cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add framer-motion dependency"
```

---

### Task 2: Sliding tab indicator

**Files:**
- Modify: `frontend/src/components/Data.tsx:381-437` (section tabs rendering)

**Context:** The tab bar currently uses `borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent'` per button. Replace with a shared `motion.div` using `layoutId` that slides between tabs.

**Step 1: Add imports**

At the top of `Data.tsx`, add to the existing React import and add framer-motion:

```tsx
import { useState, useEffect, useMemo, useRef, Fragment, useCallback } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
```

**Step 2: Track previous section index for direction**

Inside the `Data()` function, after the `activeSection` state, add a ref to track direction:

```tsx
const prevSectionIdx = useRef(0)
const activeSectionIdx = SECTIONS.findIndex(s => s.key === activeSection)

const handleSectionChange = useCallback((key: string) => {
  prevSectionIdx.current = activeSectionIdx
  setActiveSection(key)
}, [activeSectionIdx])
```

**Step 3: Replace tab button rendering**

Replace the section tabs `<div className="section-tabs" ...>` block. Remove `borderBottom` from each button's inline style (the indicator handles it now). Add a `motion.div` with `layoutId="tab-indicator"` inside the active button:

```tsx
<LayoutGroup>
  <div className="section-tabs" style={{
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    position: 'relative',
  }}>
    {SECTIONS.map(({ key, label }, idx) => {
      const count = report.items[key]?.length ?? 0
      const active = activeSection === key
      return (
        <Fragment key={key}>
          <button
            onClick={() => handleSectionChange(key)}
            style={{
              position: 'relative',
              padding: '0.625rem 1rem',
              paddingLeft: idx === 0 ? 0 : '1rem',
              fontSize: '0.8125rem',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--accent)' : 'var(--ink-muted)',
              background: 'none',
              border: 'none',
              borderBottom: '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 150ms',
              marginBottom: -1,
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          >
            {label}
            {count > 0 && (
              <span style={{
                marginLeft: '0.375rem',
                fontSize: '0.625rem',
                color: active ? 'var(--accent-dim)' : 'var(--ink-faint)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {count}
              </span>
            )}
            {active && (
              <motion.div
                layoutId="tab-indicator"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: idx === 0 ? 0 : '1rem',
                  right: '1rem',
                  height: 2,
                  background: 'var(--accent)',
                  borderRadius: 1,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </button>
          {idx === 0 && (
            <div style={{
              width: 1,
              height: 16,
              background: 'var(--border)',
              alignSelf: 'center',
              flexShrink: 0,
              margin: '0 0.375rem',
            }} />
          )}
        </Fragment>
      )
    })}
  </div>
</LayoutGroup>
```

**Step 4: Verify visually**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx next dev -p 8001`
Expected: Tab indicator slides smoothly between tabs with spring animation.

**Step 5: Run tests**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish
git add frontend/src/components/Data.tsx
git commit -m "feat(feed): add sliding tab indicator with spring animation"
```

---

### Task 3: Direction-aware tab content transition

**Files:**
- Modify: `frontend/src/components/Data.tsx:536-596` (content area rendering)

**Context:** Content currently swaps instantly. Wrap in `AnimatePresence` with directional slide + fade.

**Step 1: Add AnimatePresence import**

Update the framer-motion import:

```tsx
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
```

**Step 2: Compute slide direction**

The `prevSectionIdx` ref and `activeSectionIdx` from Task 2 provide the direction. After those lines, add:

```tsx
const slideDirection = activeSectionIdx >= prevSectionIdx.current ? 1 : -1
```

**Step 3: Define content transition variants**

Add above the return statement:

```tsx
const contentVariants = {
  enter: (dir: number) => ({
    x: dir * 20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir * -20,
    opacity: 0,
  }),
}
```

**Step 4: Wrap content area with AnimatePresence**

Replace the `{/* Scrollable content */}` div's inner content. The `<div style={{ flex: 1 }}>` stays, but its child gets wrapped:

```tsx
<div style={{ flex: 1 }}>
  <div className="data-content" style={{ maxWidth: 1024, margin: '0 auto', padding: '1.5rem 3rem 4rem' }}>
    {staleInfo && (
      <StaleProcessBanner
        stale={staleInfo}
        onAbort={handleAbortStale}
        onResume={handleResumeStale}
        onRestart={handleRestartStale}
      />
    )}
    <AnimatePresence mode="wait" custom={slideDirection}>
      <motion.div
        key={activeSection}
        custom={slideDirection}
        variants={contentVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.8 }}
      >
        {activeSection === 'briefing' ? (
          <BriefingTabContent
            summary={summary}
            summaryProgress={summaryProgress}
            pipelineStatus={pipelineStatus}
            config={config}
            hasContent={hasContent}
            onTrigger={handleTriggerSummary}
            onStop={handleStopSummary}
            onStopPipeline={handleStopPipeline}
            streamTokens={streamTokens}
            searchQuery={searchQuery}
          />
        ) : !loading && !report ? (
          <div style={{
            padding: '4rem 1.5rem',
            textAlign: 'center',
            color: 'var(--ink-faint)',
            fontSize: '0.875rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}>
            No data available. Trigger a pipeline run from the Status page.
          </div>
        ) : report ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredItems.length === 0
              ? <EmptySection needsKey={sectionNeedsKey(activeSection, config)} />
              : (
                <>
                  {filteredItems.length > PAGE_SIZE && (
                    <div style={{
                      fontSize: '0.75rem',
                      fontFamily: 'ui-monospace, monospace',
                      color: 'var(--ink-faint)',
                      textAlign: 'right',
                    }}>
                      {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
                    </div>
                  )}
                  {pagedItems.map((item, i) => (
                    <ItemCard key={item.id} item={item} index={i} />
                  ))}
                  <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
                </>
              )
            }
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  </div>
</div>
```

Note: `ItemCard` now receives `index` prop — this is for Task 4 (stagger). Until then it's unused and harmless.

**Step 5: Run tests**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish
git add frontend/src/components/Data.tsx
git commit -m "feat(feed): add direction-aware tab content transitions"
```

---

### Task 4: Staggered card entrance animation

**Files:**
- Modify: `frontend/src/components/data/ItemCard.tsx:66-245` (wrap article in motion.article)

**Context:** Cards currently appear all at once. Add fade-in + slide-up with stagger delay based on index.

**Step 1: Add framer-motion import and index prop**

At the top of `ItemCard.tsx`:

```tsx
import { motion } from 'framer-motion'
```

**Step 2: Update the component signature**

Change the function signature to accept `index`:

```tsx
export function ItemCard({ item, index = 0 }: { item: IntelItem; index?: number }) {
```

**Step 3: Replace `<article>` with `<motion.article>`**

Replace the opening `<article style={{...}}` tag with:

```tsx
<motion.article
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{
    type: 'spring',
    stiffness: 400,
    damping: 30,
    delay: index < 8 ? index * 0.04 : 0,
  }}
  style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '1.25rem',
    transition: 'box-shadow 150ms, border-color 150ms',
  }}
  onMouseEnter={e => {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-dim)'
    ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
  }}
  onMouseLeave={e => {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
    ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
  }}
>
```

And update the closing tag from `</article>` to `</motion.article>`.

**Step 4: Run tests**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx vitest run`
Expected: All tests pass. If any tests query `article` elements, they should still find them since `motion.article` renders as `<article>`.

**Step 5: Commit**

```bash
cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish
git add frontend/src/components/data/ItemCard.tsx
git commit -m "feat(feed): add staggered card entrance animation"
```

---

### Task 5: Clean up conflicting CSS transitions

**Files:**
- Modify: `frontend/src/app/globals.css:398-413` (fadeInUp animation)

**Context:** The existing `fadeInUp` CSS animation on `.page-padding > *:first-child` can conflict with framer-motion's entrance animations on the feed page. Remove it — framer-motion handles all entrance animations now.

**Step 1: Remove the mobile fadeInUp rule**

Remove this block from globals.css (lines ~409-413):

```css
@media (max-width: 768px) {
  .page-padding > *:first-child {
    animation: fadeInUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
}
```

Keep the `@keyframes fadeInUp` definition — it may be used elsewhere.

**Step 2: Run tests**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx vitest run`
Expected: All tests pass.

**Step 3: Commit**

```bash
cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish
git add frontend/src/app/globals.css
git commit -m "fix(css): remove fadeInUp that conflicts with framer-motion"
```

---

### Task 6: Final verification

**Step 1: Run full test suite**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx vitest run`
Expected: All 469+ tests pass.

**Step 2: Visual verification on mobile viewport**

Run: `cd /Users/lemni/Developer/Info_Aggregation/.worktrees/mobile-feed-polish/frontend && npx next dev -p 8001`

Verify in browser (mobile viewport):
- Tab indicator slides smoothly between tabs
- Tab content fades + slides directionally on switch
- Cards stagger in on tab switch and page change
- No jank, no layout shift
- Desktop still works normally

**Step 3: Report to user for review**
