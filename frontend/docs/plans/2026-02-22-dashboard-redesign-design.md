# Dashboard Redesign — $1M Design

## Problem

The current dashboard is functional but visually flat:
- Uniform card styling with no visual hierarchy
- No at-a-glance metrics (have to read text to get the picture)
- Trending items are a plain list with no visual weight
- Category cards show metadata instead of insight
- Linear vertical stack with no layout variety

## Design

### Stats Strip (new widget)
Four key metrics in a horizontal row:
- **Items** — total count across all sources
- **Sources** — active source count
- **Positive** — % of social posts with positive sentiment
- **Mood** — overall_mood from LLM analysis with colored indicator

Large numbers (1.5rem, 700 weight), small uppercase labels.

### Executive Summary
- Left accent border (3px var(--accent)) instead of full border
- Background: var(--accent-wash) with no visible border
- Larger body text (0.9375rem)

### Trending
- Large rank numbers (1.125rem, muted)
- Source chip label
- Velocity % right-aligned, colored
- Top 6 items, dotted separators

### Sentiment
- Mood indicator as hero element (colored dot + label)
- Platform bars with inline % labels
- Risk flags with red left accent

### Section Summaries
- Entry count badge after title
- Left accent bar on entries
- First expanded by default

### Removed: Category Cards
Replaced by the stats strip — more useful at-a-glance info.

### Layout
- Max width: 1060px, 2.5rem side padding
- 1rem gap between widgets (tighter bento feel)
- Header: "Info Aggregation" with status pill
