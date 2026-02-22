# Status Page Redesign — Mission Control

## Vision
Replace the current flat sensor list with a fixed-viewport mission control interface.
Everything visible at once, per-sensor real-time telemetry, command bar at bottom.

## Layout (3 zones, top-to-bottom)

### Zone 1: System Status Strip (52px, top)
- Health dot + status word (OPERATIONAL / DEGRADED / ERROR / NO DATA)
- Metrics: sources count, total items, time since last fetch, next scheduled run countdown
- Running state: phase label, sensor progress counter, percentage
- Progress bar replaces bottom border during runs

### Zone 2: Sensor Card Grid (flex: 1, middle, scrollable)
- CSS grid: 4 cols desktop, 3 tablet, 2 mobile
- Each card: status dot, sensor name, category label, item count, last fetch time
- Running: per-card live state (fetching/summarizing/done/failed with details)
- Failed: red left border, error message, Retry/Dismiss buttons
- Selectable when idle (click to toggle, accent border when selected)

### Zone 3: Command Bar (56px, fixed bottom)
- Idle: mode dropdown + selection helpers (All/None/Failed) + Run button
- Running: phase label + current sensor + progress + Stop button
- Paused: failure warning + Skip & Continue + Stop

## Data Flow
All state management stays in Status.tsx (same polling, same API calls).
Sub-components are purely presentational props-down.

## Component Architecture
```
Status.tsx (orchestrator)
├── StatusStrip (Zone 1)
├── SensorGrid (Zone 2)
│   └── SensorCard (per sensor)
├── CommandBar (Zone 3)
└── StaleProcessBanner (overlay)
```
