# Mobile Feed UI Polish — Design

## Scope

Polish the mobile feed experience: tab bar, tab content transitions, and card entrance animations. Not a redesign — same component structure, same inline styles + CSS vars approach. Adding Framer Motion for spring physics.

## 1. Tab Bar — Sliding Pill Indicator

- `motion.div` with `layoutId="tab-indicator"` renders behind the active tab as a background pill.
- Spring config: `stiffness: 500, damping: 30`. Pill slides smoothly between tabs on tap.
- Active tab text transitions from `--ink-muted` to `--ink`.
- No changes to horizontal scroll behavior.

## 2. Tab Content Transitions

- `AnimatePresence` wraps the content area (below the tab bar).
- Direction-aware: outgoing content fades + slides ~15px in the direction of the tab change. Incoming content enters from the opposite side.
- Duration: ~250ms, spring `damping: 25`. Exit and enter overlap for a crossfade feel.
- Key on `activeSection` so AnimatePresence knows when to swap.

## 3. Card Entrance Stagger

- Each `ItemCard` wrapped in `motion.article` with fade-in + translate-up (8px).
- Stagger: 40ms between cards, max 8 animated (rest appear instantly).
- Spring: `stiffness: 400, damping: 30`.
- Triggers on: tab switch, initial load, pagination change. NOT on scroll.

## Files Modified

- `frontend/src/components/Data.tsx` — AnimatePresence, tab indicator, stagger container
- `frontend/src/components/data/ItemCard.tsx` — motion.article wrapper
- `frontend/src/app/globals.css` — remove conflicting CSS transitions on animated elements

## Dependencies Added

- `framer-motion` (~30KB gzipped)

## Not Changed

- Card design/layout
- Source filter chips
- Search input
- Briefing tab content
- Desktop behavior (animations apply everywhere but tuned for mobile feel)
