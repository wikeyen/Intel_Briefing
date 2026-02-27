# Per-Group Workflow Builder — Phase 2 Design

## Goal

Replace the single `processing` dropdown with a full per-group workflow configuration — independent toggles for each analysis type, per-group sentiment control, per-group keyword filtering, and preset+override custom LLM prompts.

## Architecture

Each group gains discrete columns for workflow configuration. The pipeline reads these columns and applies per-group processing instead of relying on the old `processing` routing hint. All workflow settings are exposed inline in an expandable "Workflow" section on the group card.

## Database Changes

Drop the `processing` column, add 10 new discrete columns to `source_groups`:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `trend_enabled` | INTEGER | 0 | Enable trend clustering + heat scores |
| `topic_enabled` | INTEGER | 0 | Enable per-keyword topic analysis |
| `social_enabled` | INTEGER | 0 | Enable per-account voice analysis |
| `sentiment_enabled` | INTEGER | 0 | Enable LLM sentiment classification |
| `summary_prompt` | TEXT | NULL | Override for summarization prompt |
| `trend_prompt` | TEXT | NULL | Override for trend analysis prompt |
| `topic_prompt` | TEXT | NULL | Override for topic analysis prompt |
| `social_prompt` | TEXT | NULL | Override for social analysis prompt |
| `suppress_keywords` | TEXT | '[]' | JSON array of keywords to suppress |
| `boost_keywords` | TEXT | '[]' | JSON array of keywords to boost |

### Migration

Convert old `processing` values to equivalent toggle states:
- `processing = 'trend'` → `trend_enabled = 1`
- `processing = 'topic'` → `topic_enabled = 1`
- `processing = 'social'` → `social_enabled = 1, sentiment_enabled = 1`
- `processing IN ('research', 'news', 'opinion', 'general')` → all toggles 0

## Type Changes

Delete `GroupProcessing` type entirely. `SourceGroup` gains workflow fields directly.

## Pipeline Changes

### Intelligence routing (helpers.ts)
- Build sensor sets from `group.trend_enabled`, `group.topic_enabled`, `group.social_enabled`
- A group can now have MULTIPLE analysis types enabled simultaneously
- Pass group-level prompt overrides to analysis functions

### Sentiment (report-builder.ts)
- Change from hardcoded `SOCIAL_SOURCES` set to group-driven: run on items belonging to groups where `sentiment_enabled = true`

### Keyword filtering (report-builder.ts)
- Apply per-group keywords first, then global keywords on top (union behavior)

### Summarization prompts
- Group-level override: per-sensor > group > default

### Intelligence prompts (intelligence.ts)
- Analysis functions gain optional `promptOverride` parameter
- Group prompts passed through when set

## UI Design

Collapsible "Workflow" section in expanded group card — analysis pill toggles, keyword tag inputs, preset+override prompt editors. Auto-saves via existing `useAutoSave` pattern.
