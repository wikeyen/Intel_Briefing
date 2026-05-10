# PRD: Info Aggregation — Redesign as Minimal, Elegant, LLM-Queryable Backend

**Document:** 0001-prd-info-aggregation-redesign.md
**Date:** 2026-02-17
**Status:** Draft

---

## 1. Introduction / Overview

Info Aggregation is a daily intelligence aggregation system that monitors global tech, research, capital, political, and community signals and surfaces them as a structured digest. The current implementation is a collection of scripts that produce a Markdown file on disk — it has no API surface, no Docker support, and no way for an LLM agent to query it programmatically.

This PRD defines the redesign of Info Aggregation into a **minimal, elegant, production-ready backend service** with:

- A **REST JSON API** that LLM agents and humans can query directly
- A **separate configuration UI** (lightweight web frontend) for managing all settings without touching config files
- **Full Docker support** (single `docker-compose up` to run)
- **Full feature parity** with the current system plus a new **Politics sensor** and a **Topics sensor**
- **English as the primary output language** with optional Chinese translation via query param

The guiding principle: **accuracy above all else**. Every design decision should favour data quality and source reliability over feature breadth.

---

## 2. Goals

1. Expose all intel data as structured JSON via a REST API that any LLM agent can query without shell access
2. Replace the fragile CLI-only entrypoint with a Docker-deployable service (`docker-compose up`)
3. Ship a separate lightweight frontend (React/Vue) for managing all configuration settings
4. Persist user configuration in a human-readable `settings.json` file (version-controllable, not a database)
5. Add a **Politics sensor** that monitors political leaders' social media accounts (X/Twitter via Grok API), configurable per-user
6. Add a **Topics sensor** that monitors user-defined keywords and hashtags on X/Twitter via the Grok API, configurable per-user
7. Activate the existing (currently dead) GitHub GraphQL sensor and retire the BeautifulSoup scraper
8. Remove all 3 HIGH-severity security issues identified in the audit before shipping
9. Full feature parity with current system: all existing sensors, Gemini translation, Grok analysis, built-in scheduler, and Markdown rendering endpoint

---

## 3. User Stories

### As an LLM agent / AI assistant
- I want to call `GET /intel/latest` and receive structured JSON so I can answer questions about today's tech trends without parsing Markdown
- I want to call `GET /intel/research?limit=5` and get today's ArXiv papers with English abstracts so I can summarise them for a user
- I want to call `GET /intel/politics` to get the latest statements from tracked political leaders so I can provide geopolitical context
- I want to call `GET /intel/topics` to get X posts matching user-configured keywords so I can surface trending discussion on specific subjects

### As a developer / power user
- I want to run `docker-compose up` and have the service running within 2 minutes, no manual environment setup
- I want to open a browser, go to the config UI, enter my API keys and choose which sensors to enable, and never touch a `.env` file
- I want to configure which Twitter/X political accounts to monitor from the UI, not by editing code
- I want to add keywords and hashtags to monitor on X from the UI and see results in the next fetch
- I want to set keyword filters from the UI to suppress topics I don't care about

### As a product manager / analyst
- I want to visit `/briefing/markdown` in my browser and read today's digest in a clean, formatted page
- I want the service to automatically fetch fresh intel every morning at a time I configure in the UI

---

## 4. Functional Requirements

### 4.1 REST API (FastAPI)

1. The system MUST expose a REST API served by FastAPI on a configurable port (default: 8000)
2. `GET /health` MUST return `{"status": "ok", "last_fetch": "<ISO timestamp>"}` — used as Docker health check
3. `GET /intel/latest` MUST return the full structured intel payload as JSON (see schema in section 6)
4. `GET /intel/{section}` MUST return items for a specific section only. Valid sections: `tech_trends`, `research`, `capital_flow`, `products`, `community`, `politics`, `topics`, `insights`
5. `GET /intel/{section}` MUST support a `?limit=N` query parameter (default: 10, max: 50)
6. `GET /intel/latest` and section endpoints MUST support `?lang=zh` to return Chinese-translated fields (`title_zh`, `abstract_zh`) alongside English fields
7. `GET /briefing/markdown` MUST return the rendered Markdown report as `Content-Type: text/markdown`
8. `POST /fetch` MUST trigger an immediate pipeline run and return `202 Accepted`. This endpoint requires no authentication (open deployment assumption)
9. The API MUST include a `sources_ok` and `sources_failed` array in all responses indicating which sensors succeeded or failed on the last fetch
10. The API MUST serve stale cached data if the pipeline has not yet run today, with a `stale: true` flag in the response

### 4.2 Pipeline

11. The pipeline MUST run all sensor fetches concurrently (ThreadPoolExecutor or asyncio)
12. Each sensor MUST have an independent timeout — one slow/failing sensor MUST NOT block others
13. The pipeline MUST deduplicate items across sensors by title (case-insensitive)
14. Enrichment (Gemini translation, Jina full-content fetch) MUST run in the pipeline layer, NOT inside the renderer
15. The pipeline MUST write results to a JSON cache file after each successful run
16. The cache file MUST be readable by the API even while the pipeline is running (atomic write pattern)

### 4.3 Scheduler

17. The system MUST include a built-in scheduler (APScheduler) that runs the pipeline on a daily schedule
18. The fetch time MUST be configurable via the settings UI (stored in `settings.json`)
19. The scheduler MUST log the result of each run (items fetched per source, errors, duration)

### 4.4 Sensors

20. The system MUST include the following sensors: Hacker News, GitHub (GraphQL — NOT BeautifulSoup scraper), ArXiv, V2EX, HN Blogs, Grok/xAI, Gemini (translation), Product Hunt (official API only — no Grok hallucination fallback), 36Kr, WallStreetCN
21. Each sensor MUST implement a common `Sensor` protocol: `fetch(config, limit) -> list[IntelItem]`
22. Each sensor MUST be independently enable/disable-able via `settings.json`
23. The system MUST include a new **Politics sensor** that:
    - Fetches posts/statements from a user-configured list of political leader X/Twitter accounts via the Grok API
    - Returns items with fields: `source`, `account`, `handle`, `title` (post text), `url`, `published_at`
    - The list of tracked accounts MUST be configurable from the settings UI
    - The sensor MUST be independent of the existing Grok tech-trends sensor (separate config, separate section in output)
24. The system MUST include a new **Topics sensor** that:
    - Searches X/Twitter for posts matching a user-configured list of keywords and hashtags via the Grok API
    - Returns items with fields: `source`, `topic` (the matched keyword/hashtag), `title` (post text), `handle`, `url`, `published_at`
    - The list of tracked keywords/hashtags MUST be configurable from the settings UI (e.g. `["AI regulation", "#OpenSource", "US-China tech war"]`)
    - Results are grouped under a `topics` section in the API response
    - The sensor MUST be independent of the Politics sensor and the existing Grok tech-trends sensor
    - If multiple keywords match the same post, the post appears once with the first matching topic label
25. If a sensor's required API key is absent, it MUST degrade gracefully (return empty list, log a warning) rather than crash

### 4.5 Configuration & Settings

25. All user-configurable settings MUST be persisted in a `settings.json` file at a configurable path (default: `./config/settings.json`)
26. The following settings MUST be configurable: API keys (Gemini, xAI/Grok, GitHub token, Product Hunt), per-sensor enable/disable toggles, fetch schedule time, output language default (`en` or `zh`), items per section (default and per-section overrides), keyword boost list (topics to prioritise), keyword suppress list (topics to hide), list of political accounts to monitor (for Politics sensor), list of keywords/hashtags to track on X (for Topics sensor)
27. Settings MUST also be overridable at runtime by passing environment variables (env vars take precedence over `settings.json`)
28. The system MUST start with safe defaults even if `settings.json` does not exist

### 4.6 Configuration UI (Separate Frontend)

29. A separate lightweight web frontend (React or Vue) MUST be provided for managing all settings
30. The frontend MUST communicate with the backend exclusively via the REST API — it MUST NOT read `settings.json` directly
31. The backend MUST expose `GET /config` (returns current settings, with API key values masked) and `PUT /config` (accepts partial or full settings update and writes to `settings.json`)
32. The settings UI MUST include the following pages/sections:
    - **API Keys** — input fields for each key (masked by default, reveal on click)
    - **Sensors** — toggle switches per sensor with status indicator (last fetch result)
    - **Schedule** — time picker for daily fetch time and timezone selector
    - **Politics Accounts** — add/remove Twitter handles to monitor, with a preview of recent posts
    - **Topics** — add/remove keywords and hashtags to track on X (tag-input style), with a preview of recent matching posts
    - **Filters** — keyword boost and suppress lists for general intel (tag-input style)
    - **Output** — default language toggle, items-per-section sliders
33. The settings UI MUST show a live health status of the backend (green/red based on `GET /health`)
34. The settings UI MUST allow triggering a manual fetch run (calls `POST /fetch`) and show progress/status

### 4.7 Docker

35. The backend MUST be fully containerised with a `Dockerfile` using a Python slim base image
36. A `docker-compose.yml` MUST be provided that brings up both the backend API and the frontend in a single command
37. The `docker-compose.yml` MUST define a named volume for the cache directory so intel data persists across container restarts
38. The Docker image MUST include a `HEALTHCHECK` directive pointing to `GET /health`
39. All configuration MUST be injectable via environment variables (no hardcoded values in the image)

### 4.8 Security Fixes (Non-Negotiable)

40. All `subprocess pip install` fallbacks in sensor files MUST be removed
41. `XAI_BASE_URL` MUST default to `https://api.x.ai/v1/chat/completions` in all defaults, `.env.example`, and CI. Relay usage MUST be an explicit opt-in with a documented warning
42. `trend.name` (and any other external API data used in subprocess calls or filename construction) MUST be sanitized using a strict allowlist regex before use
43. The Gemini API key MUST be passed as `x-goog-api-key` HTTP header, not in the URL query string
44. `defusedxml` MUST be used for all XML/RSS parsing in place of `xml.etree.ElementTree`

---

## 5. Non-Goals (Out of Scope for v1)

- **Bounty Hunter tool** — the freelance gig scanner is out of scope
- **Alpha Radar tool** — the Web3/Solana CLI tools are out of scope
- **Revenue Architect tool** — the LLM opportunity analysis tool is out of scope
- **Product Hunt Grok hallucination fallback** — `_fetch_via_grok()` in `product_hunt.py` will be deleted; only the official PH API is used
- **XHS (Xiaohongshu) sensor** — requires Chinese IP; not supported in v1 (sensor file may be kept but disabled and documented as China-only)
- **Multi-user support** — single-tenant only; no user accounts, no per-user data isolation
- **Redis or SQLite** — cache is JSON on disk only; no external cache dependency
- **Social authentication** — no OAuth, no login; the service is assumed to run in a private/trusted environment
- **Mobile app** — the config UI is a desktop web app only
- **Historical trend analysis** — the API serves current/latest intel only; no time-series queries

---

## 6. Design Considerations

### API Response Schema

```json
GET /intel/latest

{
  "date": "2026-02-17",
  "fetched_at": "2026-02-17T07:51:00Z",
  "stale": false,
  "sources_ok": ["arxiv", "hacker_news", "github", "v2ex", "politics"],
  "sources_failed": ["product_hunt"],
  "items": {
    "tech_trends": [
      {
        "id": "hn-42345678",
        "source": "hacker_news",
        "title": "Show HN: My project",
        "title_zh": "展示HN：我的项目",
        "url": "https://example.com",
        "heat": "342 points",
        "published_at": "2026-02-17T06:00:00Z"
      }
    ],
    "research": [
      {
        "id": "arxiv-2502.12345",
        "source": "arxiv",
        "title": "Scaling Laws Revisited",
        "url": "https://arxiv.org/abs/2502.12345",
        "authors": ["Alice Smith"],
        "categories": ["cs.AI"],
        "abstract": "...",
        "abstract_zh": "..."
      }
    ],
    "politics": [
      {
        "id": "x-1234567890",
        "source": "politics",
        "account": "Barack Obama",
        "handle": "@BarackObama",
        "title": "Post text here...",
        "url": "https://x.com/BarackObama/status/1234567890",
        "published_at": "2026-02-17T08:00:00Z"
      }
    ],
    "topics": [
      {
        "id": "x-9876543210",
        "source": "topics",
        "topic": "AI regulation",
        "handle": "@elonmusk",
        "title": "Post text matching the topic...",
        "url": "https://x.com/elonmusk/status/9876543210",
        "published_at": "2026-02-17T09:30:00Z"
      }
    ],
    "capital_flow": [],
    "products": [],
    "community": [],
    "insights": []
  }
}
```

### Frontend Stack

Prefer **React + Vite** (lightweight, fast dev experience) with a simple component library (shadcn/ui or Tailwind). The frontend is served as static files — either by the FastAPI backend at `/ui` or by a separate nginx container in docker-compose.

### File Structure

```
info_aggregation/
├── pyproject.toml
├── uv.lock
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── config/
│   └── settings.json          # user config (gitignored values, committed structure)
├── cache/
│   └── intel_latest.json      # pipeline output (Docker volume)
│
├── info_aggregation/            # Python package (src layout)
│   ├── config.py              # pydantic-settings BaseSettings
│   ├── models.py              # IntelItem, IntelReport Pydantic models
│   ├── sensors/               # one file per source + base.py protocol
│   ├── pipeline/              # collector, enricher, dedup, cache
│   ├── api/                   # FastAPI app + routes
│   ├── renderer/              # pure Markdown renderer (no I/O)
│   └── scheduler.py
│
├── frontend/                  # React/Vite config UI
│   ├── src/
│   └── dist/                  # built static files (served by backend or nginx)
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 7. Technical Considerations

- **Python package manager:** `uv` exclusively. `pyproject.toml` required. No `pip` or `poetry`.
- **HTTP client:** `httpx` only. Remove `requests` entirely.
- **XML parsing:** `defusedxml` required for all XML/RSS parsing.
- **Config:** `pydantic-settings BaseSettings` for environment variable management. No raw `os.getenv()` in sensor files.
- **Cache writes:** Use atomic write pattern (write to `.tmp` file, then `os.replace()`) to avoid serving partial JSON
- **Scheduler:** APScheduler with asyncio executor, integrated into the FastAPI lifespan
- **Frontend:** React + Vite. Communicates with backend via REST. Built files served by backend at `/ui` to avoid needing a separate nginx container in simple deployments.
- **Dependency management:** All dependencies declared in `pyproject.toml`. Zero runtime `pip install` in application code.
- **Logging:** Structured JSON logging in production (`structlog` or `python-json-logger`). All sensors use `logging.getLogger(__name__)` — no `print()`.

---

## 8. Success Metrics

1. `docker-compose up` produces a running service reachable at `http://localhost:8000` within 2 minutes on a clean machine with only Docker installed
2. `GET /intel/latest` returns a valid JSON response with at least 3 populated sections (non-empty arrays) on a normal weekday run
3. `GET /health` returns `200 OK` and is used successfully as the Docker health check
4. Zero HIGH-severity security findings (per the audit: relay default, runtime pip, subprocess injection)
5. The Politics sensor returns at least 1 item per configured account per day
6. The config UI successfully saves settings that persist across container restarts (volume-backed `settings.json`)
7. Test coverage ≥ 70% (enforced in CI via `pytest --cov-fail-under=70`)
8. CI pipeline runs `pytest` as a required gate before any report generation or deployment step

---

## 9. Open Questions

1. **Frontend hosting:** Should the React frontend be served by the FastAPI backend (at `/ui`) for simplicity, or as a separate nginx container in docker-compose for proper static file serving? Recommendation: serve from FastAPI in v1 for simplicity, move to nginx in v2.
2. **Politics sensor — Grok vs native X API:** Grok API is the current integration path for X data. If an official X/Twitter API key is available, should we support that as an alternative to Grok? For v1, Grok-only is fine.
3. **`settings.json` secret storage:** API keys stored in `settings.json` are in plaintext. For a private Docker deployment this is acceptable, but should v1 warn the user if `settings.json` is world-readable?
4. **36Kr and WallStreetCN:** Both use undocumented/scraped APIs with no official alternative. Should v1 include a documented "fragility warning" in the sensor config UI for these sources?
5. **Product Hunt:** The official PH API requires OAuth token. If the user has no PH token, the sensor should disable cleanly. Should the config UI surface a "Get PH token" link?
6. **Topics sensor — dedup with Politics:** If a tracked political account posts about a tracked keyword, should the post appear in both `politics` and `topics` sections, or deduplicated to one? Recommendation: deduplicate — prefer `politics` section when both match.
