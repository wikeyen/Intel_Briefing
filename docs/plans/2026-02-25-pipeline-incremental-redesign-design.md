# Pipeline Incremental Redesign — Design

## Goal

Replace confusing pipeline status messaging and fragile in-memory resume logic with a crash-safe incremental pipeline backed by a temp DB table, and coherent plain-language status messages.

## Architecture

Every pipeline run is always incremental. A new `pipeline_items` SQLite table stores fetched items per-sensor as they complete. The orchestrator checks this table against `resume_window_hours` before each run to skip fresh sensors. On completion, items promote to the permanent `kv` cache and temp rows are cleared.

## 1. Database: `pipeline_items` table

```sql
CREATE TABLE IF NOT EXISTS pipeline_items (
  sensor_name  TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  items_json   TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  PRIMARY KEY (sensor_name, run_id)
)
```

Write per-sensor as each fetch completes. On pipeline completion, assemble into final report, write to `kv['intel:latest']`, clear temp rows. On restart, stale banner reads this table.

## 2. Always-incremental pipeline

Every run checks `pipeline_items.fetched_at` per sensor vs `resume_window_hours`. Fresh sensors are skipped (marked "cached"). No run/resume distinction.

Per-sensor resume logic removed from `x_posts.ts` and `social_accounts.ts` — orchestrator owns all resume decisions.

## 3. Concurrency

- Fetch: pool (Semaphore) — same as today
- Summary: pool (`local_summary_concurrency` or default) — new
- Overall briefing + Intelligence: parallel after all summaries — new

## 4. Status messaging

- Control bar: plain language ("Fetching 12 of 16 sources")
- Workers indicator: removed
- Sensor cards: "cached" badge for resumed sensors
- Stale banner: "Pipeline interrupted — X of Y sources fetched" with "Continue (X remaining)"
