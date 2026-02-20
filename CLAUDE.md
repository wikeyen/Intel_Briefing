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

## Testing

- **Frontend**: `cd frontend && npx vitest run` — uses jsdom environment for component tests
- Vitest config: `frontend/vitest.config.ts`
