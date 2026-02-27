# Phase 3: Information Presentation Redesign

## Goal

Restructure the Dashboard and item display so that all presentation maps to user-defined groups (replacing hardcoded domain sections), adds a cross-group "What's Happening" hero strip, and enriches item cards with full intelligence signals.

## Approach

Incremental refactor — keep working widgets (StatusTicker, ExecSummary, Intelligence Cards, RiskIntelPanel, SentimentWidget), replace only the broken parts (hardcoded DOMAINS array and DomainCardCompact grid).

## Scope

### 1. Dashboard Hero — "What's Happening"

**Keeps:** StatusTicker (sticky), ExecSummaryWidget, Intelligence Cards Grid (Public Focus, Topic Pulse, Voices).

**Adds:** After intelligence cards, a "What's Happening" strip showing top 5-8 items across ALL groups ranked by signal strength (velocity change + sentiment extremes + recency). Each item: title, source chip, sentiment chip, velocity badge. Click navigates to item in feed.

### 2. Group Sections — Replace Hardcoded Domains

**Removes:** `DOMAINS` array and `DomainCardCompact` grid.

**Replaces with:** Dynamic `GroupIntelCard` components from `/api/groups` response:
- Group header: name, color dot, sensor count, sentiment mood (if sentiment_enabled)
- Group summary: AI-generated brief aggregated from per-sensor summaries
- Top 3-5 items: highest-signal items from that group
- Analysis badges: active workflow steps (trend/topic/social/sentiment) as indicator pills
- Click to drill down → `GroupDetailPanel`

`GroupDetailPanel` (replaces old `DetailPanel`): full group view with complete intelligence analysis, all items with enrichment, per-sensor breakdown, sentiment distribution.

Layout: responsive 2-3 column grid, same as current domain cards but driven by actual groups.

### 3. Item Card Enrichment

**Already implemented:** sentiment dot, heat+velocity, hours on trend, NLP keyword pills (top 3), account/handle, verification badge.

**New:**
- NLP entity badges: People (blue), Organizations (purple), Places (green). Top 2-3 per category, "+N" overflow.
- Sentiment upgrade: replace 6px dot with text chip ("Positive" / "Negative" / "Neutral") with color background.
- Group color indicator: left-border accent in group's color.

Applies to: Data/Feed view, Dashboard "What's Happening" strip, group detail panels.

### 4. Sidebar Refactor

**Keeps:** RiskIntelPanel, SentimentWidget, Source Health.

**Changes:**
- Category Distribution → Group Distribution (map to user groups with their colors)
- Trending Widget: already filters by trend_enabled groups, add group context display
- Group quick-nav: small group list at top of sidebar with color dots + item counts, clicking scrolls to that group's section

### 5. Data/Feed Page

**Keeps:** Group tabs, source filters, search, pagination.

**Changes:** ItemCard gets enrichment from Section 3.

### 6. Not Changing

- Status, Sources, Pipeline, AI, Connections pages
- Sidebar nav structure
- API endpoints — no new endpoints needed

## Architecture

- No backend changes required
- All data already available via existing API endpoints
- Dashboard.tsx is the primary file (~2400 lines) — refactor in place
- New components: `GroupIntelCard`, `GroupDetailPanel`, `WhatsHappeningStrip`
- Modified components: `ItemCard` (entity badges, sentiment chip, group color)
