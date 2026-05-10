<div align="center">

# Info Aggregation - AI Intelligence Aggregation System

**5 minutes a day to know what's happening across the global tech landscape.**

AI-powered aggregation from 15+ data sources — fetch, filter, deduplicate, and summarize into a daily briefing.

[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/77AutumN/Info_Aggregation?style=social)](https://github.com/77AutumN/Info_Aggregation)

</div>

---

## What is this?

A self-hosted intelligence aggregation engine built with Next.js. It automatically fetches, deduplicates, and summarizes content from 15+ data sources into categorized briefings.

**Who is it for?**
- Developers who want a daily tech landscape overview
- Product managers doing competitive analysis
- Indie hackers looking for inspiration and opportunities
- Anyone interested in information aggregation

## Data Sources

| Category | Sensors | What you see |
|:--|:--|:--|
| Tech | Hacker News, GitHub Trending | What developers are talking about |
| Finance | 36Kr, WallStreetCN | Funding rounds, acquisitions |
| Research | ArXiv AI/ML | Latest AI papers |
| Products | Product Hunt | New product launches |
| Community | V2EX | Chinese developer discussions |
| Social | X/Bluesky/Mastodon accounts, topics, trends | Social media intelligence |
| Blogs | HN Top Blogs | Deep-dive blog analysis |
| RSS | Custom feeds | Your own feed subscriptions |
| CN Social | Weibo, Zhihu, Xiaohongshu | Chinese social platforms |

## Quick Start

### 1. Clone

```bash
git clone https://github.com/77AutumN/Info_Aggregation.git
cd Info_Aggregation
```

### 2. Install dependencies

```bash
cd frontend && npm install
```

### 3. Configure

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

### 4. Run

```bash
npm run dev
# Open http://localhost:8000
```

## Project Structure

```
Info_Aggregation/
├── frontend/
│   ├── src/
│   │   ├── app/                  # Next.js App Router pages + API routes
│   │   │   ├── api/              # Server-side API endpoints
│   │   │   └── ...               # Page components (Briefing, Pipeline, Settings, etc.)
│   │   ├── components/           # React UI components
│   │   ├── lib/
│   │   │   ├── sensors/          # Data source sensor modules
│   │   │   │   ├── taxonomy.ts   # Sensor-to-category mapping (single source of truth)
│   │   │   │   └── *.ts          # Individual sensor implementations
│   │   │   ├── pipeline/         # Pipeline orchestration (fetch, dedup, filter, cache)
│   │   │   ├── config/           # Configuration loading + migration
│   │   │   ├── utils/            # Shared utilities (readability, RSS discovery, etc.)
│   │   │   └── models.ts         # Shared TypeScript data models
│   │   └── api/                  # Client-side API helpers
│   └── data/                     # SQLite database (auto-created)
├── CLAUDE.md                     # Project conventions for AI assistants
└── README.md
```

## Testing

```bash
cd frontend && npx vitest run
```

## License

MIT

---

<div align="center">

**If you find this useful, a star would be appreciated.**

</div>
