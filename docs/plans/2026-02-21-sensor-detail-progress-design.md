# Sensor Detail Progress — Design Doc

## Problem

During pipeline fetch, the Status page shows "Fetching..." for the X sensor with no detail about which account is being processed. With 29 accounts and rate-limiting delays, users have no visibility into progress.

## Solution

Add an optional `detail` field to `SensorJobProgress`. Sensors can report sub-progress (e.g., "Fetching @karpathy (12/29)") which flows through the pipeline tracker → status API → SensorTable expanded view.

## Data Flow

1. X sensor receives a `onProgress` callback
2. Before each account fetch, calls `onProgress("Fetching @handle (N/total)")`
3. Orchestrator wires callback → `tracker.setFetchDetail('x', detail)`
4. Tracker persists via `onChange` callback → SQLite
5. Status API returns `detail` field in `SensorJobProgress`
6. SensorTable expanded view shows detail text below "Fetch: Running"

## UI

```
◉ X                              Fetching…
  ● Fetch: Running — Fetching @karpathy (12/29)
  ○ Summary: Queued
```

## Bonus

Rename "X / Twitter" → "X" in taxonomy.
