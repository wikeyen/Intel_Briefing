<!-- ABOUTME: Design document for the NLP sidecar service that offloads structured tasks from LLM calls. -->
<!-- ABOUTME: Covers architecture, API contract, model selection, pipeline integration, and rollout phases. -->

# Intelligence Pipeline Decomposition — NLP Sidecar Design

## Problem

The current intelligence pipeline makes 3 large LLM calls that each do too many jobs at once (summarize + classify + extract tags + score sentiment). With large inputs (~93 accounts, ~1600 items), the LLM drops outputs (e.g. tags consistently empty for accounts). The calls are expensive, slow, and non-deterministic for structured tasks.

## Solution

Split the pipeline into two stages:

1. **Python NLP sidecar** (FastAPI on :8001) — handles all structured/deterministic tasks: keyword extraction, sentiment analysis, named entity recognition, topic clustering. Uses multilingual models that handle both English and Chinese.
2. **Focused LLM calls** — receives pre-structured input from Python, only writes narrative text. Many small parallel calls (~300-500 tokens each) instead of 3 massive ones.

## Architecture

```
Pipeline (Next.js :8000)
  fetch → dedup → filter ──► POST /analyze (Python :8001)
                                    │
                              enriched items + clusters
                                    │
                              ──► LLM calls (small, parallel)
                                    │
                              intelligence cache (SQLite)

NLP Sidecar (FastAPI :8001)
  Models loaded at startup (~2GB RAM):
  - paraphrase-multilingual-MiniLM-L12-v2 (keywords, clustering, similarity) ~120MB
  - xlm-roberta-sentiment-multilingual (sentiment) ~1.1GB
  - spaCy zh + en (NER)
```

## Python Sidecar

### Project Structure

```
nlp/
├── pyproject.toml          # uv project
├── nlp_sidecar/
│   ├── __init__.py
│   ├── app.py              # FastAPI app, startup model loading
│   ├── models.py           # Pydantic request/response schemas
│   ├── keywords.py         # YAKE + KeyBERT extraction
│   ├── sentiment.py        # xlm-roberta inference
│   ├── entities.py         # spaCy NER
│   ├── clustering.py       # sentence-transformers + HDBSCAN
│   └── config.py           # model paths, thresholds
└── tests/
    ├── test_keywords.py
    ├── test_sentiment.py
    ├── test_entities.py
    └── test_clustering.py
```

### API Contract

Single endpoint that does everything in one pass (embeddings computed once, reused internally):

```
POST /analyze
  Body: { items: [{ id, title, abstract?, lang }] }
  Returns: {
    items: [{ id, keywords, sentiment, entities }],
    clusters: [{ id, label, item_ids, top_keywords,
                 sentiment_distribution, representative_items }]
  }
  ~3-5s for 1600 items

GET /health
  Returns: { status: "ready", models_loaded: true }
```

### Multilingual Model Selection

| Task | Library/Model | EN | CN | Size |
|---|---|---|---|---|
| Keywords | YAKE + KeyBERT + paraphrase-multilingual-MiniLM-L12-v2 | Yes | Yes | ~120MB |
| Sentiment | cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual | Yes | Yes | ~1.1GB |
| NER | spaCy en_core_web_sm + zh_core_web_sm | Yes | Yes | ~50MB |
| Clustering | sentence-transformers (same model as KeyBERT) + HDBSCAN | Yes | Yes | shared |
| Similarity/dedup | sentence-transformers (same model) | Yes | Yes | shared |

Total: ~1.3GB on disk, ~2GB RAM loaded.

## Revised LLM Call Structure

### What Python Handles (deterministic, never fails)

- Keyword/tag extraction per item and per cluster
- Sentiment scoring per item, aggregated per cluster/account
- Named entity extraction (people, orgs, places)
- Topic clustering by semantic similarity
- Account theme aggregation from post keywords

### What LLM Handles (small, focused, parallel)

- **Per-cluster summary** (8-12 parallel calls, ~300-500 tokens input each):
  "Here's a cluster about {label} with keywords {top_5}, sentiment {dist}, top items: {5 titles}. Write a 2-3 sentence summary."
- **Accounts summary** (1 call): pre-extracted themes + sentiment -> narrative
- **Risk scan** (1 call): negative clusters + keywords -> risk identification
- **Executive summary** (1 call, runs last): all cluster summaries + risks -> big picture

Total: ~12-18 tiny LLM calls vs current 3 massive ones.

## Pipeline Integration

The intelligence state becomes:

1. Collect all items from report
2. POST /analyze to Python sidecar
3. Merge per-item enrichments into report data
4. Fire LLM calls in parallel (cluster summaries, accounts summary, risk scan)
5. Await all, then fire executive summary (needs cluster summaries as input)
6. Assemble IntelligenceReport, write to cache

### What Stays the Same

- Pipeline state machine, orchestrator, all other states
- Cache structure (`intel:intelligence` key in SQLite)
- Frontend components (same data shape)
- API endpoints (same response format)

### What Changes

- `intelligence.ts` — rewritten to call Python first, then smaller LLM calls
- New `nlp-client.ts` — HTTP client for the Python sidecar
- `IntelligenceReport` type — gains per-item enrichments
- `intelligence-cache.ts` — stores enrichments alongside summaries
- `Makefile` — `make dev` starts both processes

### Graceful Degradation

If Python sidecar is down (`/health` fails), fall back to current LLM-only approach. No hard dependency.

## UI Enrichment

Per-item enrichments (keywords, sentiment, entities) will be surfaced in the frontend:

- Sentiment indicators on item cards in the Data page
- Keyword chips on item cards
- Entity-based cross-referencing (click entity to see all mentions)
- Cluster labels as filterable tags

## Rollout Phases

### Phase 1 — Python Sidecar (standalone)

- Build FastAPI service with `/analyze` and `/health`
- Unit tests for each NLP module
- Test with real exported items (EN + CN mix)

### Phase 2 — Integration

- New `nlp-client.ts` in frontend
- Rewrite `intelligence.ts` to use Python-first pipeline
- Fallback to LLM-only if sidecar unavailable
- Integration tests: pipeline end-to-end with sidecar

### Phase 3 — UI Enrichment

- Sentiment + keywords on item cards
- Cluster labels as filterable tags
- Entity cross-referencing

### Phase 4 — LLM Call Optimization

- Tune cluster summary prompts
- Compare old vs new intelligence quality
- Remove legacy 3-fat-call code path

## Model Download Strategy

First run triggers model download (~1.3GB). Cached in `~/.cache/huggingface/`. Add `make setup-nlp` target for explicit download.

## Dependencies

- **Python**: managed by uv
- **Packages**: FastAPI, uvicorn, keybert, yake, sentence-transformers, transformers, spacy, hdbscan, pydantic
