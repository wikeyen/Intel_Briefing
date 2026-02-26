# Pipeline Halt Banner — Design

**Goal:** Surface pipeline halt state (after retry exhaustion) as a persistent banner across all pages, with Retry Failed / Skip & Continue actions.

## Current Behavior

- Pipeline auto-retries each failed sensor up to 3 times (config errors excluded)
- After retries exhaust, pipeline pauses at `paused_stage: 'pre_overall'`
- User must be on the Status page to see the halted state and take action
- Existing API: `POST /api/fetch/resume` with actions: `retry_sensor`, `skip_sensor`, `generate_overall`

## New Behavior

1. Pipeline retries per-sensor (unchanged)
2. After retry exhaustion, pipeline halts (unchanged)
3. **New:** Persistent banner appears across ALL pages: "Pipeline halted — N sensor(s) failed after 3 retries"
4. Banner offers two actions: **Retry Failed** | **Skip & Continue**
5. Banner persists until user acts or pipeline completes

## Architecture

### Shared Pipeline Status Context

Currently, pipeline status is polled only on the Status page (`Status.tsx`). The banner needs status on all pages.

**Approach:** Create a `PipelineStatusContext` at the layout level that:
- Polls `GET /api/fetch/status` on an interval (3s when running, 30s when idle)
- Provides `pipelineStatus` to all children via React context
- The Status page switches from its own polling to consuming this context

### PipelineHaltBanner Component

- Rendered in `layout.tsx`, above the main content area
- Reads from `PipelineStatusContext`
- Shows when: `pipelineStatus.paused === true && pipelineStatus.paused_stage === 'pre_overall'`
- Counts failed sensors: `sensors.filter(s => s.fetch === 'failed').length`
- Two action buttons:
  - **Retry Failed** — calls `POST /api/fetch/resume` with `{ action: 'retry_sensor', sensor }` for each failed sensor sequentially, then the banner auto-dismisses as pipeline unpauses
  - **Skip & Continue** — calls `POST /api/fetch/resume` with `{ action: 'generate_overall' }` to proceed without failed sensors

### Styling

- Full-width banner, `var(--warn)` background with dark text
- Fixed at top of content area (below sidebar header)
- Matches existing `StaleProcessBanner` pattern
- Smooth slide-in animation

## Scope

- **In scope:** Banner component, pipeline status context, Status page refactor to use shared context
- **Out of scope:** Browser push notifications, sound alerts, changes to pipeline retry logic
