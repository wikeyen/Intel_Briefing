# Unified Settings Page Redesign

## Problem

The Sources and Pipeline pages have overlapping concerns:
- Items-per-sensor limits live on Sources (inline pills), while default items and per-section limits live on Pipeline — two places for the same concept.
- The inline pill design on Sources crams too much information into each sensor row (toggle + name + description + Items pill + Lookback pill + status badge).
- Two separate save buttons for one underlying config object.

## Decision

Merge Sources and Pipeline into a single **Settings** page (`/settings`) with a clean card-based layout and a single save button.

## Design

### Page Structure

- **Route:** `/settings` (replaces `/sensors` and `/pipeline`)
- **Sidebar:** Merge "02 Sources" and "03 Pipeline" into **"02 Settings"**. Renumber downstream (Intel Data becomes 03).
- **Layout:** Same 240px left-column SectionHeader + scrolling right content area.
- **Save:** Single "Save changes" button at the bottom.

### Card 1: Sources

**Header:** "Sources" / "Toggle data sources for your pipeline."

- White card, subtle border, rounded corners
- Each sensor: `[Toggle] [Name] [Description ...] [Status Badge]`
- **No inline items/lookback pills** — those move to Card 2
- Group labels (General, Chinese / 中文, Grok / xAI) as small uppercase dividers
- Politics and Topics sensors expand sub-config (tag inputs) when enabled

### Card 2: Defaults & Limits

**Header:** "Defaults & Limits" / "Global defaults and per-source overrides for fetch volume."

**Sub-section A: Global Defaults**
Two side-by-side number inputs:
- Items per source (1-50, default 10)
- Lookback hours (1-336, default 24)

**Sub-section B: Per-Source Overrides**
- Table layout, only showing **enabled** sensors
- Columns: Source name | Items | Lookback
- Inputs show global default as placeholder. Explicit value = override. Clear to revert.
- Sensors without lookback support show "—"

**Sub-section C: Output Section Limits**
- Table layout for the 8 output sections
- Columns: Section name | Items
- Same placeholder/override behavior

### Card 3: Schedule

**Header:** "Schedule" / "When and how often to generate briefings."

- Daily Fetch Time + Timezone (side-by-side)
- Cache TTL slider (1-72h)

### Card 4: Filters

**Header:** "Filters" / "Boost or suppress items by keyword."

- Boost Keywords (green dot + tag input)
- Suppress Keywords (red dot + tag input)

### Visual Design Tokens

- Card: `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 8px`, `padding: 1.5rem`
- Card header: `font-size: 1rem`, `font-weight: 600`
- Card description: `font-size: 0.8125rem`, `color: var(--ink-muted)`
- Sub-section divider: `1px solid var(--border-soft)`, `margin: 1.25rem 0`
- Sub-section label: uppercase, 0.6875rem, 700 weight, letter-spacing 0.09em
- Number inputs in override tables: width ~56px, right-aligned, monospace, border on focus only, placeholder in muted color
- Gap between cards: `1.5rem`

### Data Flow

**On load:** Single `api.getConfig()` populates all state.

**Override logic:**
- `sensorLimits[key]` if set and differs from `defaultLimit` → override
- `sensorLookback[key]` if set and differs from global lookback default → override
- Clearing input removes the override from the object

**On save:** Single `api.updateConfig()` with all fields:
```typescript
{
  sensors_enabled,
  sensor_limits,
  sensor_lookback_hours,
  default_limit,
  section_limits,
  politics_accounts,
  topics_keywords,
  fetch_time,
  fetch_timezone,
  cache_ttl_hours,
  boost_keywords,
  suppress_keywords,
}
```

### Navigation Changes

- Remove sidebar items "02 Sources" and "03 Pipeline"
- Add "02 Settings" → `/settings`
- Renumber: 00 Status, 01 Connections, 02 Settings, 03 Intel Data
