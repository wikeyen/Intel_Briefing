# Intel Briefing — Project Guide

## IMPORTANT: Feature Development Workflow

**All feature work MUST use git worktrees.** Do NOT commit feature changes directly on `main`. Follow this process:

1. Create a worktree: `git worktree add .worktrees/<feature-name> -b feat/<feature-name>`
2. Install deps: `cd .worktrees/<feature-name>/frontend && npm install`
3. Symlink the database: `ln -s $(pwd)/data .worktrees/<feature-name>/frontend/data`
4. Do all implementation work inside the worktree
5. Run tests, verify with dev server (use a non-8000 port, e.g. `--port 8002`)
6. Commit on the feature branch, rebase onto main, merge
7. `cd` back to main repo root, then `rm -rf .worktrees/<feature-name>`, `git worktree prune`, `git branch -d feat/<feature-name>`

## Architecture

- **Frontend**: Next.js 15 App Router in `frontend/` — serves on port 8000
- **Backend**: Python FastAPI in `src/` — internal on port 8001
- **Gateway**: `frontend/src/app/api/[...proxy]/route.ts` proxies `/api/*` to the backend; middleware guards with `X-API-Key`
- **Database**: SQLite via `@libsql/client` at `data/intel.db` (relative to `frontend/` working directory)

## Database

The frontend uses a local SQLite database for key-value caching.

- **Location**: `data/intel.db` (auto-created on first run)
- **Config**: `DATABASE_URL` env var in `frontend/.env.local`, defaults to `file:data/intel.db`
- **Initialisation**: `frontend/src/instrumentation.ts` calls `initDb()` on server startup
- **Worktree note**: When running from a git worktree, you must either:
  - Symlink the data dir: `ln -s /path/to/main/data .worktrees/<branch>/frontend/data`
  - Or set `DATABASE_URL` to an absolute path in `.env.local`
- **Worktree cleanup**: Always `cd` back to the main repo root before running `rm -rf` on a worktree directory — deleting the current working directory breaks the shell

## Running Locally

```bash
# Frontend dev server (port 8000)
make dev
# or: cd frontend && npm run dev

# Backend (port 8001) — requires Python + uv
cd src && uv run uvicorn intel_briefing.app:app --port 8001

# Tests
make test                          # frontend (vitest)
cd src && uv run pytest            # backend (pytest, 104+ tests)
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
- **Backend**: `uv run pytest` — 104+ tests, 70% coverage threshold
- Vitest config: `frontend/vitest.config.ts`
