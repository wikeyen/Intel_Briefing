# UI Modernization — Full Visual Overhaul

**Date:** 2026-03-04
**Approach:** Full Visual Overhaul (Token + Component Sweep + Glassmorphism/Animations)

## Design Decisions

### 1. Design Tokens (globals.css)

**Colors — cooler zinc neutrals:**
- Surface-inset, borders, secondary/tertiary ink shifted to Tailwind zinc scale
- Dark mode canvas deepened to `#09090B` (zinc-950)
- Accent unchanged: deep teal `#1A7A6D`

**Radius:** Card `12px` → `16px`, Badge `6px` → `9999px` (pill), Shadcn radius `0.75rem` → `0.875rem`

**Shadows — softer, layered:** New `shadow-card`, `shadow-card-hover`, `shadow-elevated` with ring borders

**Spacing:** Page padding `2.5rem` → `3rem`, card padding `1.5rem` → `2rem`, grid gaps `0.75rem` → `1rem`

**Typography:** Card titles `0.875rem` → `1rem`, body `0.75rem` → `0.8125rem`, section headers `0.5625rem` → `0.6875rem`

**Animation tokens:** `--ease-spring`, `--ease-smooth`, `--duration-fast/normal/slow`

### 2. Cards & Containers

- All cards: `border: 1px solid var(--border)` + `border-radius: 16px`
- Hover: `translateY(-1px)` lift + shadow escalation + border-color shift
- Detail panels: glassmorphism via `backdrop-filter: blur(20px) saturate(1.8)`
- Skeleton shimmer slowed to `2.5s`, radius increased to `12px`

### 3. Component Scope

Modified 17 component files across dashboard, data, status, sources, and navigation.
Updated UI primitives (card → `rounded-2xl`, button → `rounded-lg`).
