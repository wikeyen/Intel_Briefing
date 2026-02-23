# Intel Briefing — Project Guide

## Architecture

- **Frontend + Backend**: Next.js 15 App Router in `frontend/` — serves on port 8000
- **Database**: SQLite via `@libsql/client` at `data/intel.db` (relative to `frontend/` working directory)
- **Sensors**: TypeScript sensor modules in `frontend/src/lib/sensors/` — each fetches from a data source
- **Pipeline**: Orchestrator in `frontend/src/lib/pipeline/` — coordinates fetch, dedup, filter, and cache

## Database

The frontend uses a local SQLite database for key-value caching.

- **Location**: `data/intel.db` (auto-created on first run)
- **Config**: `DATABASE_URL` env var in `frontend/.env.local`, defaults to `file:data/intel.db`
- **Initialisation**: `frontend/src/instrumentation.ts` calls `initDb()` on server startup
- **Worktree note**: Worktrees need access to the database — symlink the data dir or set `DATABASE_URL` to an absolute path

## Running Locally

```bash
# Dev server (port 8000)
make dev
# or: cd frontend && npm run dev

# Tests
make test                          # frontend (vitest)
```

## Key Conventions

- Page components use `'use client'` — they are client components
- All code files start with a 2-line `// ABOUTME:` comment
- Toast notifications via `ToastContext` (not prop drilling)
- Sidebar uses Next.js `Link` + `usePathname` for routing
- API client (`src/api/client.ts`) uses `BASE = '/api'` so all calls go through the gateway
- CSS uses inline styles with CSS custom properties (`--ink`, `--accent`, `--border`, etc.)

## Shortcuts

- **"lgtm" / "yolo"** — When the user says "lgtm" or "yolo", immediately: commit all staged/unstaged changes on the feature branch, merge to main, push to remote, and clean up the worktree. No confirmation needed. For "yolo", this happens after the full autonomy workflow (implement → test → verify) completes.

## Testing

- **Frontend**: `cd frontend && npx vitest run` — uses jsdom environment for component tests
- Vitest config: `frontend/vitest.config.ts`

## UI Verification

All UI changes must be visually verified on both desktop and mobile viewports before merging. Use Playwright (via the MCP browser tools) to:

1. **Desktop** — navigate to each affected page at default viewport (1280×800) and take a screenshot. Check for broken layouts, overlapping elements, or awkward spacing.
2. **Mobile** — resize the browser to 390×844 (iPhone 14 equivalent) and repeat. Check that responsive styles work: no horizontal overflow, tap targets are usable, text is readable.
3. If anything looks broken or awkward, fix it before merging.
