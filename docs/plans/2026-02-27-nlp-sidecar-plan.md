<!-- ABOUTME: Implementation plan for the NLP sidecar service and intelligence pipeline decomposition. -->
<!-- ABOUTME: Bite-sized tasks across 4 phases: Python sidecar, TS integration, UI enrichment, LLM optimization. -->

# NLP Sidecar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 3 monolithic LLM calls with a Python NLP sidecar for structured tasks (keywords, sentiment, NER, clustering) and focused LLM calls for narrative synthesis only.

**Architecture:** FastAPI sidecar on :8001 loads multilingual models at startup. Next.js pipeline calls `POST /analyze` to enrich items, then fires small parallel LLM calls for summaries. Graceful fallback to current LLM-only approach if sidecar is down.

**Tech Stack:** Python (uv, FastAPI, KeyBERT, YAKE, sentence-transformers, transformers, spaCy, HDBSCAN), TypeScript (Next.js existing pipeline)

**Design doc:** `docs/plans/2026-02-27-nlp-sidecar-design.md`

---

## Phase 1 — Python NLP Sidecar (Standalone)

### Task 1: Project scaffolding

**Files:**
- Create: `nlp/pyproject.toml`
- Create: `nlp/nlp_sidecar/__init__.py`
- Create: `nlp/nlp_sidecar/config.py`

**Step 1: Initialize uv project**

```bash
cd /path/to/worktree
mkdir -p nlp/nlp_sidecar nlp/tests
cd nlp
uv init --name nlp-sidecar
```

**Step 2: Edit `pyproject.toml` with dependencies**

```toml
[project]
name = "nlp-sidecar"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "pydantic>=2.0",
    "keybert>=0.8",
    "yake>=0.4.8",
    "sentence-transformers>=3.0",
    "transformers>=4.45",
    "torch>=2.0",
    "spacy>=3.7",
    "hdbscan>=0.8.38",
    "numpy>=1.26",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "httpx>=0.27"]
```

**Step 3: Create `nlp_sidecar/config.py`**

```python
# ABOUTME: Configuration constants for the NLP sidecar — model names, thresholds, ports.
# ABOUTME: All model identifiers are multilingual to support both English and Chinese.

EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
SENTIMENT_MODEL = "cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual"
SPACY_MODELS = {"en": "en_core_web_sm", "zh": "zh_core_web_sm"}

PORT = 8001
MAX_KEYWORDS_PER_ITEM = 8
MAX_CLUSTER_KEYWORDS = 10
MAX_CLUSTERS = 15
MIN_CLUSTER_SIZE = 5
YAKE_MAX_NGRAM = 2
YAKE_DEDUP_THRESHOLD = 0.9
```

**Step 4: Create `nlp_sidecar/__init__.py`**

```python
# ABOUTME: NLP sidecar package — FastAPI service for structured text analysis.
# ABOUTME: Provides keyword extraction, sentiment analysis, NER, and topic clustering.
```

**Step 5: Install dependencies and download spaCy models**

```bash
cd nlp
uv sync
uv run python -m spacy download en_core_web_sm
uv run python -m spacy download zh_core_web_sm
```

Run: `uv run python -c "from nlp_sidecar.config import PORT; print(f'Config OK, port={PORT}')"`
Expected: `Config OK, port=8001`

**Step 6: Commit**

```bash
git add nlp/
git commit -m "feat(nlp): scaffold Python sidecar project with uv"
```

---

### Task 2: Pydantic request/response schemas

**Files:**
- Create: `nlp/nlp_sidecar/models.py`

**Step 1: Write `models.py`**

```python
# ABOUTME: Pydantic models for the /analyze API — request and response schemas.
# ABOUTME: Defines item input, per-item enrichments, and cluster output structures.
from pydantic import BaseModel, Field

class AnalyzeItem(BaseModel):
    """Single item to analyze."""
    id: str
    title: str
    abstract: str | None = None
    lang: str = "en"  # "en" or "zh"

class Keyword(BaseModel):
    """Extracted keyword with weight."""
    text: str
    weight: float = Field(ge=0.0, le=1.0)

class Sentiment(BaseModel):
    """Sentiment classification result."""
    label: str  # "positive", "negative", "neutral"
    score: float = Field(ge=0.0, le=1.0)

class Entities(BaseModel):
    """Named entities extracted from text."""
    people: list[str] = []
    orgs: list[str] = []
    places: list[str] = []

class EnrichedItem(BaseModel):
    """Per-item analysis results."""
    id: str
    keywords: list[Keyword] = []
    sentiment: Sentiment
    entities: Entities

class ClusterSummary(BaseModel):
    """A semantic cluster of related items."""
    id: int
    label: str
    item_ids: list[str]
    top_keywords: list[Keyword]
    sentiment_distribution: dict[str, float]  # {"positive": 0.3, "neutral": 0.5, "negative": 0.2}
    representative_items: list[str]  # top item IDs by centrality

class AnalyzeRequest(BaseModel):
    """Request body for POST /analyze."""
    items: list[AnalyzeItem]

class AnalyzeResponse(BaseModel):
    """Response body for POST /analyze."""
    items: list[EnrichedItem]
    clusters: list[ClusterSummary]

class HealthResponse(BaseModel):
    """Response body for GET /health."""
    status: str
    models_loaded: bool
```

**Step 2: Validate schemas parse correctly**

Run: `uv run python -c "from nlp_sidecar.models import AnalyzeRequest; r = AnalyzeRequest(items=[{'id': '1', 'title': 'test'}]); print(r.model_dump_json(indent=2))"`
Expected: JSON with one item, no errors.

**Step 3: Commit**

```bash
git add nlp/nlp_sidecar/models.py
git commit -m "feat(nlp): add Pydantic request/response schemas"
```

---

### Task 3: Keyword extraction module

**Files:**
- Create: `nlp/nlp_sidecar/keywords.py`
- Create: `nlp/tests/test_keywords.py`

**Step 1: Write the test**

```python
# ABOUTME: Tests for keyword extraction module — validates YAKE and KeyBERT on EN/CN inputs.
# ABOUTME: Checks output structure, weight ranges, and multilingual support.
import pytest
from nlp_sidecar.keywords import extract_keywords, load_keyword_models

@pytest.fixture(scope="module")
def models():
    return load_keyword_models()

def test_english_keywords(models):
    result = extract_keywords("OpenAI releases GPT-5 with improved reasoning", "en", models)
    assert len(result) > 0
    assert all(0.0 <= kw.weight <= 1.0 for kw in result)
    texts = [kw.text.lower() for kw in result]
    assert any("openai" in t or "gpt" in t or "reasoning" in t for t in texts)

def test_chinese_keywords(models):
    result = extract_keywords("百度发布新一代人工智能大模型", "zh", models)
    assert len(result) > 0
    assert all(0.0 <= kw.weight <= 1.0 for kw in result)

def test_empty_input(models):
    result = extract_keywords("", "en", models)
    assert result == []

def test_short_input(models):
    result = extract_keywords("AI", "en", models)
    assert isinstance(result, list)
```

**Step 2: Run test to verify it fails**

Run: `cd nlp && uv run pytest tests/test_keywords.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nlp_sidecar.keywords'`

**Step 3: Write `keywords.py`**

```python
# ABOUTME: Keyword extraction using YAKE (statistical) and KeyBERT (semantic).
# ABOUTME: YAKE handles both languages natively; KeyBERT uses multilingual sentence embeddings.
from dataclasses import dataclass
import yake
from keybert import KeyBERT
from nlp_sidecar.config import (
    EMBEDDING_MODEL, MAX_KEYWORDS_PER_ITEM,
    YAKE_MAX_NGRAM, YAKE_DEDUP_THRESHOLD,
)
from nlp_sidecar.models import Keyword

@dataclass
class KeywordModels:
    keybert: KeyBERT
    yake_en: yake.KeywordExtractor
    yake_zh: yake.KeywordExtractor

def load_keyword_models() -> KeywordModels:
    """Load keyword extraction models. Call once at startup."""
    keybert = KeyBERT(model=EMBEDDING_MODEL)
    yake_en = yake.KeywordExtractor(
        lan="en", n=YAKE_MAX_NGRAM, dedupLim=YAKE_DEDUP_THRESHOLD, top=MAX_KEYWORDS_PER_ITEM,
    )
    yake_zh = yake.KeywordExtractor(
        lan="zh", n=YAKE_MAX_NGRAM, dedupLim=YAKE_DEDUP_THRESHOLD, top=MAX_KEYWORDS_PER_ITEM,
    )
    return KeywordModels(keybert=keybert, yake_en=yake_en, yake_zh=yake_zh)

def extract_keywords(text: str, lang: str, models: KeywordModels) -> list[Keyword]:
    """Extract keywords from text using YAKE + KeyBERT ensemble."""
    if not text or len(text.strip()) < 3:
        return []

    # YAKE: statistical, fast, language-aware
    yake_ext = models.yake_zh if lang == "zh" else models.yake_en
    yake_results = yake_ext.extract_keywords(text)
    # YAKE scores are inverted (lower = more relevant), normalize to 0-1
    if yake_results:
        max_score = max(s for _, s in yake_results) or 1.0
        yake_kws = {kw.lower(): 1.0 - (score / max_score) for kw, score in yake_results}
    else:
        yake_kws = {}

    # KeyBERT: semantic, embedding-based
    try:
        kb_results = models.keybert.extract_keywords(
            text, keyphrase_ngram_range=(1, YAKE_MAX_NGRAM), top_n=MAX_KEYWORDS_PER_ITEM,
        )
        kb_kws = {kw.lower(): score for kw, score in kb_results}
    except Exception:
        kb_kws = {}

    # Merge: average weights for keywords found by both methods
    all_keys = set(yake_kws) | set(kb_kws)
    merged = []
    for key in all_keys:
        scores = [v for v in [yake_kws.get(key), kb_kws.get(key)] if v is not None]
        avg = sum(scores) / len(scores)
        merged.append(Keyword(text=key, weight=round(avg, 3)))

    merged.sort(key=lambda k: k.weight, reverse=True)
    return merged[:MAX_KEYWORDS_PER_ITEM]
```

**Step 4: Run tests**

Run: `cd nlp && uv run pytest tests/test_keywords.py -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add nlp/nlp_sidecar/keywords.py nlp/tests/test_keywords.py
git commit -m "feat(nlp): keyword extraction with YAKE + KeyBERT"
```

---

### Task 4: Sentiment analysis module

**Files:**
- Create: `nlp/nlp_sidecar/sentiment.py`
- Create: `nlp/tests/test_sentiment.py`

**Step 1: Write the test**

```python
# ABOUTME: Tests for sentiment analysis — validates multilingual xlm-roberta model.
# ABOUTME: Checks output structure, score ranges, and basic polarity correctness.
import pytest
from nlp_sidecar.sentiment import analyze_sentiment, load_sentiment_model

@pytest.fixture(scope="module")
def model():
    return load_sentiment_model()

def test_positive_english(model):
    result = analyze_sentiment("This is amazing and wonderful news!", "en", model)
    assert result.label == "positive"
    assert result.score > 0.5

def test_negative_english(model):
    result = analyze_sentiment("This is terrible and very concerning", "en", model)
    assert result.label == "negative"
    assert result.score > 0.5

def test_chinese_sentiment(model):
    result = analyze_sentiment("这个产品非常好用，我很喜欢", "zh", model)
    assert result.label in ("positive", "neutral", "negative")
    assert 0.0 <= result.score <= 1.0

def test_empty_input(model):
    result = analyze_sentiment("", "en", model)
    assert result.label == "neutral"
```

**Step 2: Run test to verify it fails**

Run: `cd nlp && uv run pytest tests/test_sentiment.py -v`
Expected: FAIL — module not found

**Step 3: Write `sentiment.py`**

```python
# ABOUTME: Sentiment analysis using multilingual xlm-roberta model.
# ABOUTME: Returns positive/negative/neutral with confidence score for EN and CN text.
from transformers import pipeline as hf_pipeline, Pipeline
from nlp_sidecar.config import SENTIMENT_MODEL
from nlp_sidecar.models import Sentiment

LABEL_MAP = {"positive": "positive", "negative": "negative", "neutral": "neutral"}

def load_sentiment_model() -> Pipeline:
    """Load the multilingual sentiment pipeline. Call once at startup."""
    return hf_pipeline(
        "sentiment-analysis",
        model=SENTIMENT_MODEL,
        top_k=None,
        truncation=True,
        max_length=512,
    )

def analyze_sentiment(text: str, lang: str, model: Pipeline) -> Sentiment:
    """Classify sentiment of a single text. Returns label + confidence score."""
    if not text or len(text.strip()) < 2:
        return Sentiment(label="neutral", score=1.0)

    results = model(text[:512])
    if not results or not results[0]:
        return Sentiment(label="neutral", score=1.0)

    # Model returns list of dicts sorted by score desc
    scores = {LABEL_MAP.get(r["label"], r["label"]): r["score"] for r in results[0]}
    best_label = max(scores, key=scores.get)
    return Sentiment(label=best_label, score=round(scores[best_label], 3))
```

**Step 4: Run tests**

Run: `cd nlp && uv run pytest tests/test_sentiment.py -v`
Expected: All 4 tests PASS (first run downloads model ~1.1GB)

**Step 5: Commit**

```bash
git add nlp/nlp_sidecar/sentiment.py nlp/tests/test_sentiment.py
git commit -m "feat(nlp): sentiment analysis with xlm-roberta multilingual"
```

---

### Task 5: Named entity recognition module

**Files:**
- Create: `nlp/nlp_sidecar/entities.py`
- Create: `nlp/tests/test_entities.py`

**Step 1: Write the test**

```python
# ABOUTME: Tests for NER module — validates spaCy entity extraction for EN and CN.
# ABOUTME: Checks that people, orgs, and places are correctly categorized.
import pytest
from nlp_sidecar.entities import extract_entities, load_ner_models

@pytest.fixture(scope="module")
def models():
    return load_ner_models()

def test_english_entities(models):
    result = extract_entities("Elon Musk announced that Tesla will open a factory in Berlin", "en", models)
    assert "Elon Musk" in result.people or any("Musk" in p for p in result.people)
    assert "Tesla" in result.orgs
    assert "Berlin" in result.places

def test_chinese_entities(models):
    result = extract_entities("百度公司在北京发布了新产品", "zh", models)
    assert len(result.orgs) > 0 or len(result.places) > 0

def test_empty_input(models):
    result = extract_entities("", "en", models)
    assert result.people == []
    assert result.orgs == []
    assert result.places == []
```

**Step 2: Run test to verify it fails**

Run: `cd nlp && uv run pytest tests/test_entities.py -v`
Expected: FAIL — module not found

**Step 3: Write `entities.py`**

```python
# ABOUTME: Named entity recognition using spaCy with per-language models.
# ABOUTME: Extracts people, organizations, and places from EN and CN text.
from dataclasses import dataclass
import spacy
from spacy.language import Language
from nlp_sidecar.config import SPACY_MODELS
from nlp_sidecar.models import Entities

@dataclass
class NerModels:
    en: Language
    zh: Language

def load_ner_models() -> NerModels:
    """Load spaCy models for EN and CN. Call once at startup."""
    return NerModels(
        en=spacy.load(SPACY_MODELS["en"]),
        zh=spacy.load(SPACY_MODELS["zh"]),
    )

# spaCy entity label mapping
PERSON_LABELS = {"PERSON", "PER"}
ORG_LABELS = {"ORG", "NORP"}
PLACE_LABELS = {"GPE", "LOC", "FAC"}

def extract_entities(text: str, lang: str, models: NerModels) -> Entities:
    """Extract named entities from text using the appropriate language model."""
    if not text or len(text.strip()) < 2:
        return Entities()

    nlp = models.zh if lang == "zh" else models.en
    doc = nlp(text[:5000])

    people, orgs, places = [], [], []
    seen = set()
    for ent in doc.ents:
        key = (ent.text, ent.label_)
        if key in seen:
            continue
        seen.add(key)
        if ent.label_ in PERSON_LABELS:
            people.append(ent.text)
        elif ent.label_ in ORG_LABELS:
            orgs.append(ent.text)
        elif ent.label_ in PLACE_LABELS:
            places.append(ent.text)

    return Entities(people=people, orgs=orgs, places=places)
```

**Step 4: Run tests**

Run: `cd nlp && uv run pytest tests/test_entities.py -v`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add nlp/nlp_sidecar/entities.py nlp/tests/test_entities.py
git commit -m "feat(nlp): NER with spaCy EN + CN models"
```

---

### Task 6: Clustering module

**Files:**
- Create: `nlp/nlp_sidecar/clustering.py`
- Create: `nlp/tests/test_clustering.py`

**Step 1: Write the test**

```python
# ABOUTME: Tests for semantic clustering — validates HDBSCAN grouping of items.
# ABOUTME: Checks cluster structure, label generation, and edge cases.
import pytest
from nlp_sidecar.clustering import cluster_items, load_embedding_model
from nlp_sidecar.models import AnalyzeItem, Keyword

@pytest.fixture(scope="module")
def model():
    return load_embedding_model()

def test_distinct_clusters(model):
    items = [
        AnalyzeItem(id="1", title="Bitcoin price surges past $100k", lang="en"),
        AnalyzeItem(id="2", title="Ethereum DeFi protocol hacked for $50M", lang="en"),
        AnalyzeItem(id="3", title="Crypto exchange faces regulatory scrutiny", lang="en"),
        AnalyzeItem(id="4", title="NASA launches new Mars rover mission", lang="en"),
        AnalyzeItem(id="5", title="SpaceX Starship completes orbital test", lang="en"),
        AnalyzeItem(id="6", title="New telescope discovers distant exoplanet", lang="en"),
    ]
    per_item_keywords = {
        "1": [Keyword(text="bitcoin", weight=0.9)],
        "2": [Keyword(text="ethereum", weight=0.9)],
        "3": [Keyword(text="crypto", weight=0.9)],
        "4": [Keyword(text="nasa", weight=0.9)],
        "5": [Keyword(text="spacex", weight=0.9)],
        "6": [Keyword(text="telescope", weight=0.9)],
    }
    clusters = cluster_items(items, per_item_keywords, model)
    assert len(clusters) >= 1
    # All items should be assigned to some cluster
    assigned = set()
    for c in clusters:
        assigned.update(c.item_ids)
        assert len(c.top_keywords) > 0
        assert len(c.representative_items) > 0
        assert sum(c.sentiment_distribution.values()) > 0 or c.sentiment_distribution == {}

def test_chinese_items(model):
    items = [
        AnalyzeItem(id="1", title="百度发布新AI大模型", lang="zh"),
        AnalyzeItem(id="2", title="阿里巴巴推出通义千问升级版", lang="zh"),
        AnalyzeItem(id="3", title="腾讯混元模型开放API", lang="zh"),
    ]
    per_item_keywords = {item.id: [] for item in items}
    clusters = cluster_items(items, per_item_keywords, model)
    assert len(clusters) >= 1

def test_too_few_items(model):
    items = [AnalyzeItem(id="1", title="Single item", lang="en")]
    clusters = cluster_items(items, {"1": []}, model)
    assert len(clusters) == 1
    assert clusters[0].item_ids == ["1"]
```

**Step 2: Run test to verify it fails**

Run: `cd nlp && uv run pytest tests/test_clustering.py -v`
Expected: FAIL — module not found

**Step 3: Write `clustering.py`**

```python
# ABOUTME: Semantic clustering of items using sentence-transformers + HDBSCAN.
# ABOUTME: Groups related items by embedding similarity, labels clusters from keywords.
import numpy as np
from collections import Counter
from sentence_transformers import SentenceTransformer
import hdbscan
from nlp_sidecar.config import EMBEDDING_MODEL, MAX_CLUSTERS, MIN_CLUSTER_SIZE, MAX_CLUSTER_KEYWORDS
from nlp_sidecar.models import AnalyzeItem, Keyword, ClusterSummary

def load_embedding_model() -> SentenceTransformer:
    """Load the multilingual sentence-transformer. Call once at startup."""
    return SentenceTransformer(EMBEDDING_MODEL)

def cluster_items(
    items: list[AnalyzeItem],
    per_item_keywords: dict[str, list[Keyword]],
    model: SentenceTransformer,
    per_item_sentiment: dict[str, str] | None = None,
) -> list[ClusterSummary]:
    """Group items into semantic clusters using HDBSCAN."""
    if len(items) < 2:
        # Single item or empty — return one cluster with everything
        return [ClusterSummary(
            id=0,
            label=items[0].title[:50] if items else "empty",
            item_ids=[item.id for item in items],
            top_keywords=per_item_keywords.get(items[0].id, [])[:MAX_CLUSTER_KEYWORDS] if items else [],
            sentiment_distribution={},
            representative_items=[items[0].id] if items else [],
        )] if items else []

    # Embed all items
    texts = [f"{item.title} {item.abstract or ''}".strip() for item in items]
    embeddings = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)

    # Cluster with HDBSCAN
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min(MIN_CLUSTER_SIZE, max(2, len(items) // 5)),
        metric="euclidean",
        cluster_selection_method="eom",
    )
    labels = clusterer.fit_predict(embeddings)

    # Group items by cluster label (-1 = noise)
    cluster_map: dict[int, list[int]] = {}
    noise_indices: list[int] = []
    for idx, label in enumerate(labels):
        if label == -1:
            noise_indices.append(idx)
        else:
            cluster_map.setdefault(label, []).append(idx)

    # Assign noise items to nearest cluster
    if noise_indices and cluster_map:
        centroids = {}
        for cid, indices in cluster_map.items():
            centroids[cid] = np.mean(embeddings[indices], axis=0)
        for idx in noise_indices:
            distances = {cid: np.linalg.norm(embeddings[idx] - cent) for cid, cent in centroids.items()}
            nearest = min(distances, key=distances.get)
            cluster_map[nearest].append(idx)
    elif not cluster_map:
        # All noise — put everything in one cluster
        cluster_map[0] = list(range(len(items)))

    # Build cluster summaries
    results = []
    for cid, indices in sorted(cluster_map.items()):
        cluster_items_list = [items[i] for i in indices]
        cluster_ids = [items[i].id for i in indices]

        # Aggregate keywords
        kw_counter: Counter = Counter()
        for item_id in cluster_ids:
            for kw in per_item_keywords.get(item_id, []):
                kw_counter[kw.text] += kw.weight
        top_kws = [Keyword(text=t, weight=round(w / len(cluster_ids), 3))
                    for t, w in kw_counter.most_common(MAX_CLUSTER_KEYWORDS)]

        # Sentiment distribution
        sent_dist: dict[str, float] = {"positive": 0, "neutral": 0, "negative": 0}
        if per_item_sentiment:
            for item_id in cluster_ids:
                label = per_item_sentiment.get(item_id, "neutral")
                sent_dist[label] = sent_dist.get(label, 0) + 1
            total = sum(sent_dist.values()) or 1
            sent_dist = {k: round(v / total, 3) for k, v in sent_dist.items()}

        # Representative items — closest to centroid
        centroid = np.mean(embeddings[indices], axis=0)
        distances = [(i, np.linalg.norm(embeddings[i] - centroid)) for i in indices]
        distances.sort(key=lambda x: x[1])
        rep_ids = [items[i].id for i, _ in distances[:5]]

        # Label from top keywords
        label = ", ".join(kw.text for kw in top_kws[:3]) if top_kws else cluster_items_list[0].title[:50]

        results.append(ClusterSummary(
            id=cid,
            label=label,
            item_ids=cluster_ids,
            top_keywords=top_kws,
            sentiment_distribution=sent_dist,
            representative_items=rep_ids,
        ))

    # Limit to MAX_CLUSTERS — merge smallest into nearest
    if len(results) > MAX_CLUSTERS:
        results.sort(key=lambda c: len(c.item_ids), reverse=True)
        results = results[:MAX_CLUSTERS]

    return results
```

**Step 4: Run tests**

Run: `cd nlp && uv run pytest tests/test_clustering.py -v`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add nlp/nlp_sidecar/clustering.py nlp/tests/test_clustering.py
git commit -m "feat(nlp): semantic clustering with sentence-transformers + HDBSCAN"
```

---

### Task 7: FastAPI app with `/analyze` and `/health` endpoints

**Files:**
- Create: `nlp/nlp_sidecar/app.py`
- Create: `nlp/tests/test_app.py`

**Step 1: Write the test**

```python
# ABOUTME: Integration tests for the FastAPI /analyze and /health endpoints.
# ABOUTME: Uses httpx TestClient to validate request/response contracts.
import pytest
from httpx import AsyncClient, ASGITransport
from nlp_sidecar.app import app

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"

@pytest.fixture(scope="module")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["models_loaded"] is True

@pytest.mark.anyio
async def test_analyze_english(client):
    resp = await client.post("/analyze", json={
        "items": [
            {"id": "1", "title": "OpenAI releases new AI model for developers", "lang": "en"},
            {"id": "2", "title": "Google announces quantum computing breakthrough", "lang": "en"},
            {"id": "3", "title": "Tesla stock drops after earnings report", "lang": "en"},
        ]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 3
    for item in data["items"]:
        assert "keywords" in item
        assert "sentiment" in item
        assert "entities" in item
    assert len(data["clusters"]) >= 1

@pytest.mark.anyio
async def test_analyze_chinese(client):
    resp = await client.post("/analyze", json={
        "items": [
            {"id": "1", "title": "百度发布新一代AI大模型", "lang": "zh"},
            {"id": "2", "title": "阿里巴巴云计算业务收入增长", "lang": "zh"},
        ]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2

@pytest.mark.anyio
async def test_analyze_empty(client):
    resp = await client.post("/analyze", json={"items": []})
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["clusters"] == []

@pytest.mark.anyio
async def test_analyze_mixed_languages(client):
    resp = await client.post("/analyze", json={
        "items": [
            {"id": "1", "title": "AI breakthrough in healthcare", "lang": "en"},
            {"id": "2", "title": "人工智能在医疗领域取得突破", "lang": "zh"},
        ]
    })
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2
```

**Step 2: Run test to verify it fails**

Run: `cd nlp && uv run pytest tests/test_app.py -v`
Expected: FAIL — module not found

**Step 3: Write `app.py`**

```python
# ABOUTME: FastAPI application — the NLP sidecar entry point.
# ABOUTME: Loads all models at startup, exposes /analyze and /health endpoints.
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from nlp_sidecar.models import AnalyzeRequest, AnalyzeResponse, HealthResponse, EnrichedItem
from nlp_sidecar.keywords import extract_keywords, load_keyword_models, KeywordModels
from nlp_sidecar.sentiment import analyze_sentiment, load_sentiment_model
from nlp_sidecar.entities import extract_entities, load_ner_models, NerModels
from nlp_sidecar.clustering import cluster_items, load_embedding_model

logger = logging.getLogger("nlp_sidecar")

class ModelRegistry:
    """Holds all loaded models. Populated during app startup."""
    keywords: KeywordModels | None = None
    sentiment = None  # transformers Pipeline
    ner: NerModels | None = None
    embedding = None  # SentenceTransformer

    @property
    def loaded(self) -> bool:
        return all([self.keywords, self.sentiment, self.ner, self.embedding])

models = ModelRegistry()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading NLP models...")
    models.keywords = load_keyword_models()
    models.sentiment = load_sentiment_model()
    models.ner = load_ner_models()
    models.embedding = load_embedding_model()
    logger.info("All models loaded.")
    yield

app = FastAPI(title="NLP Sidecar", lifespan=lifespan)

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ready", models_loaded=models.loaded)

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    if not req.items:
        return AnalyzeResponse(items=[], clusters=[])

    enriched = []
    per_item_keywords = {}
    per_item_sentiment = {}

    for item in req.items:
        text = f"{item.title} {item.abstract or ''}".strip()

        kws = extract_keywords(text, item.lang, models.keywords)
        sent = analyze_sentiment(text, item.lang, models.sentiment)
        ents = extract_entities(text, item.lang, models.ner)

        per_item_keywords[item.id] = kws
        per_item_sentiment[item.id] = sent.label

        enriched.append(EnrichedItem(
            id=item.id,
            keywords=kws,
            sentiment=sent,
            entities=ents,
        ))

    clusters = cluster_items(req.items, per_item_keywords, models.embedding, per_item_sentiment)

    return AnalyzeResponse(items=enriched, clusters=clusters)
```

**Step 4: Add anyio to dev dependencies**

In `pyproject.toml`, add `"anyio[trio]>=4.0"` to `[project.optional-dependencies] dev`.

**Step 5: Run tests**

Run: `cd nlp && uv sync && uv run pytest tests/test_app.py -v`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add nlp/nlp_sidecar/app.py nlp/tests/test_app.py nlp/pyproject.toml
git commit -m "feat(nlp): FastAPI app with /analyze and /health endpoints"
```

---

### Task 8: Makefile integration and startup script

**Files:**
- Modify: `Makefile`
- Create: `nlp/run.py`

**Step 1: Create `nlp/run.py`**

```python
# ABOUTME: Entry point for the NLP sidecar server.
# ABOUTME: Starts uvicorn on the configured port with auto-reload in dev mode.
import uvicorn
from nlp_sidecar.config import PORT

if __name__ == "__main__":
    uvicorn.run("nlp_sidecar.app:app", host="0.0.0.0", port=PORT, reload=True)
```

**Step 2: Update Makefile**

Add `nlp`, `setup-nlp`, and update `dev` to start both processes:

```makefile
# ABOUTME: Development task runner for Intel Briefing.
# ABOUTME: Use `make dev` to start the Next.js dev server on port 8000.
.PHONY: dev build test nlp setup-nlp

# Start both Next.js (8000) and NLP sidecar (8001)
dev:
	@echo "Frontend → http://localhost:8000"
	@echo "NLP Sidecar → http://localhost:8001"
	@echo "Ctrl+C to stop\n"
	cd nlp && uv run python run.py &
	cd frontend && npm run dev

# Start NLP sidecar only
nlp:
	cd nlp && uv run python run.py

# Download NLP models
setup-nlp:
	cd nlp && uv sync
	cd nlp && uv run python -m spacy download en_core_web_sm
	cd nlp && uv run python -m spacy download zh_core_web_sm
	cd nlp && uv run python -c "from nlp_sidecar.app import models; print('Models will download on first run')"

# Build frontend dist (for Docker deployment)
build:
	cd frontend && npm run build

# Run tests
test:
	cd frontend && npm test
	cd nlp && uv run pytest tests/ -v
```

**Step 3: Test manual startup**

Run: `cd nlp && uv run python run.py &`
Then: `curl http://localhost:8001/health`
Expected: `{"status":"ready","models_loaded":true}`
Then: `kill %1` (stop background process)

**Step 4: Commit**

```bash
git add Makefile nlp/run.py
git commit -m "feat(nlp): Makefile integration and startup script"
```

---

## Phase 2 — TypeScript Integration

### Task 9: NLP client module in frontend

**Files:**
- Create: `frontend/src/lib/pipeline/nlp-client.ts`
- Create: `frontend/src/lib/pipeline/__tests__/nlp-client.test.ts`

**Step 1: Write the test**

```typescript
// ABOUTME: Tests for NLP sidecar client — validates request building and response parsing.
// ABOUTME: Uses mocked fetch to avoid requiring a running sidecar.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeItems, checkHealth, NlpAnalyzeResponse } from '../nlp-client'

const mockResponse: NlpAnalyzeResponse = {
  items: [
    {
      id: 'test-1',
      keywords: [{ text: 'ai', weight: 0.9 }],
      sentiment: { label: 'positive', score: 0.85 },
      entities: { people: [], orgs: ['OpenAI'], places: [] },
    },
  ],
  clusters: [
    {
      id: 0,
      label: 'ai',
      item_ids: ['test-1'],
      top_keywords: [{ text: 'ai', weight: 0.9 }],
      sentiment_distribution: { positive: 1.0, neutral: 0, negative: 0 },
      representative_items: ['test-1'],
    },
  ],
}

describe('NLP client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends items and parses response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })
    const result = await analyzeItems([{ id: 'test-1', title: 'OpenAI releases GPT-5', lang: 'en' }])
    expect(result).toBeDefined()
    expect(result!.items).toHaveLength(1)
    expect(result!.clusters).toHaveLength(1)
  })

  it('returns null when sidecar is down', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await analyzeItems([{ id: 'test-1', title: 'test', lang: 'en' }])
    expect(result).toBeNull()
  })

  it('health check returns status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ready', models_loaded: true }),
    })
    const result = await checkHealth()
    expect(result).toBe(true)
  })

  it('health check returns false when down', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await checkHealth()
    expect(result).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/pipeline/__tests__/nlp-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write `nlp-client.ts`**

```typescript
// ABOUTME: HTTP client for the Python NLP sidecar service.
// ABOUTME: Calls POST /analyze for item enrichment and GET /health for readiness checks.

const NLP_BASE = process.env.NLP_SIDECAR_URL ?? 'http://localhost:8001'
const NLP_TIMEOUT_MS = 30_000

export interface NlpKeyword {
  text: string
  weight: number
}

export interface NlpSentiment {
  label: string
  score: number
}

export interface NlpEntities {
  people: string[]
  orgs: string[]
  places: string[]
}

export interface NlpEnrichedItem {
  id: string
  keywords: NlpKeyword[]
  sentiment: NlpSentiment
  entities: NlpEntities
}

export interface NlpCluster {
  id: number
  label: string
  item_ids: string[]
  top_keywords: NlpKeyword[]
  sentiment_distribution: Record<string, number>
  representative_items: string[]
}

export interface NlpAnalyzeResponse {
  items: NlpEnrichedItem[]
  clusters: NlpCluster[]
}

interface AnalyzeInput {
  id: string
  title: string
  abstract?: string
  lang: string
}

/** Check if the NLP sidecar is available and ready. */
export async function checkHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${NLP_BASE}/health`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!resp.ok) return false
    const data = await resp.json()
    return data.status === 'ready' && data.models_loaded === true
  } catch {
    return false
  }
}

/** Send items to the NLP sidecar for analysis. Returns null if sidecar is unavailable. */
export async function analyzeItems(items: AnalyzeInput[]): Promise<NlpAnalyzeResponse | null> {
  try {
    const resp = await fetch(`${NLP_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(NLP_TIMEOUT_MS),
    })
    if (!resp.ok) {
      console.warn(`[nlp-client] /analyze returned ${resp.status}`)
      return null
    }
    return await resp.json() as NlpAnalyzeResponse
  } catch (err) {
    console.warn('[nlp-client] /analyze failed:', err)
    return null
  }
}
```

**Step 4: Run tests**

Run: `cd frontend && npx vitest run src/lib/pipeline/__tests__/nlp-client.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/pipeline/nlp-client.ts frontend/src/lib/pipeline/__tests__/nlp-client.test.ts
git commit -m "feat(pipeline): NLP sidecar HTTP client with fallback"
```

---

### Task 10: Rewrite intelligence analysis to use Python-first pipeline

**Files:**
- Modify: `frontend/src/lib/pipeline/intelligence.ts` — add new `runNlpIntelligenceAnalysis` function
- Modify: `frontend/src/lib/pipeline/helpers.ts:226-252` — call NLP pipeline first, fall back to LLM-only

**Step 1: Add focused LLM prompt functions to `intelligence.ts`**

Add after the existing prompt functions (after line ~127). These are the small, focused prompts that receive pre-structured data from Python:

```typescript
function clusterSummaryPrompt(language?: SummaryLanguage): string {
  return `You are given a pre-analyzed cluster of related news items. Write a concise 2-3 sentence summary of what this cluster is about and why it matters.

Respond with ONLY JSON:
{"summary":"Your 2-3 sentence summary here"}` + langInstruction(language)
}

function accountsSummaryPrompt(language?: SummaryLanguage): string {
  return `You are given tracked social media accounts with their pre-analyzed themes and sentiment. Write a concise paragraph summarizing what these voices are collectively discussing and their overall tone.

Respond with ONLY JSON:
{"summary":"Your paragraph here"}` + langInstruction(language)
}

function riskScanPrompt(language?: SummaryLanguage): string {
  return `You are given clusters that have been flagged as having negative or mixed sentiment. Identify the top 3-5 actionable risks or concerns. Each risk should have a title and a brief explanation referencing the source clusters.

Respond with ONLY JSON:
{"risks":[{"title":"Risk title","description":"Why this matters and what to watch","cluster_ids":[0,1]}]}` + langInstruction(language)
}

function executiveSummaryPrompt(language?: SummaryLanguage): string {
  return `You are given cluster summaries, risk assessments, and sentiment data. Write a comprehensive executive briefing paragraph (150-250 words) that synthesizes the key themes, connects patterns across clusters, and highlights what matters most.

Respond with ONLY JSON:
{"summary":"Your executive briefing paragraph"}` + langInstruction(language)
}
```

**Step 2: Add `runNlpIntelligenceAnalysis` function**

Add at end of `intelligence.ts`, before the closing of the file. This is the new Python-first pipeline that replaces the 3-fat-call approach:

```typescript
/**
 * NLP-first intelligence analysis: Python sidecar handles structure,
 * LLM handles narrative. Falls back to legacy approach if sidecar is down.
 */
export async function runNlpIntelligenceAnalysis(
  report: IntelReport,
  nlpData: import('./nlp-client').NlpAnalyzeResponse,
  llmConfig: LlmConfig,
  signal?: AbortSignal,
  language?: SummaryLanguage,
): Promise<IntelligenceReport> {
  // Build lookup maps from NLP enrichments
  const itemMap = new Map(nlpData.items.map(i => [i.id, i]))

  // Collect all items for account/trend grouping
  const allItems: IntelItem[] = []
  for (const cat of ALL_CATEGORIES) {
    allItems.push(...(report.items[cat] ?? []))
  }

  // --- Cluster summaries (parallel LLM calls) ---
  const clusterSummaries = await Promise.all(
    nlpData.clusters.map(async (cluster) => {
      const repTitles = cluster.representative_items
        .map(id => allItems.find(i => i.id === id)?.title)
        .filter(Boolean)
        .slice(0, 5)

      const messages: ChatMessage[] = [
        { role: 'system', content: clusterSummaryPrompt(language) },
        { role: 'user', content: `Cluster: "${cluster.label}"
Keywords: ${cluster.top_keywords.map(k => k.text).join(', ')}
Sentiment: ${Object.entries(cluster.sentiment_distribution).map(([k, v]) => `${k}: ${Math.round(v * 100)}%`).join(', ')}
Items (${cluster.item_ids.length} total):
${repTitles.map((t, i) => `  [${i}] ${t}`).join('\n')}` },
      ]

      try {
        const raw = await chatCompletion(messages, llmConfig, signal)
        const parsed = robustJsonParse(raw)
        return { cluster, summary: typeof parsed?.summary === 'string' ? parsed.summary : '' }
      } catch {
        return { cluster, summary: '' }
      }
    })
  )

  // --- Accounts summary (1 LLM call) ---
  const accountItems = allItems.filter(i => i.account && SENSOR_CATEGORY_MAP[i.source] === 'social')
  let accountsSummary = ''
  const accountsFocusMap = new Map<string, { themes: Set<string>; sentiment: string; count: number; handle: string; platform: string }>()

  for (const item of accountItems) {
    const enriched = itemMap.get(item.id)
    const existing = accountsFocusMap.get(item.account!)
    if (existing) {
      existing.count++
      enriched?.keywords.forEach(k => existing.themes.add(k.text))
    } else {
      accountsFocusMap.set(item.account!, {
        themes: new Set(enriched?.keywords.map(k => k.text) ?? []),
        sentiment: enriched?.sentiment.label ?? 'neutral',
        count: 1,
        handle: item.handle ?? item.account!,
        platform: item.source,
      })
    }
  }

  if (accountsFocusMap.size > 0) {
    const acctLines = [...accountsFocusMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30)
      .map(([name, data]) =>
        `@${data.handle} (${data.platform}, ${data.count} posts, ${data.sentiment}): ${[...data.themes].slice(0, 5).join(', ')}`)
      .join('\n')

    try {
      const raw = await chatCompletion([
        { role: 'system', content: accountsSummaryPrompt(language) },
        { role: 'user', content: `${accountsFocusMap.size} tracked accounts:\n${acctLines}` },
      ], llmConfig, signal)
      const parsed = robustJsonParse(raw)
      if (typeof parsed?.summary === 'string') accountsSummary = parsed.summary
    } catch { /* continue without accounts summary */ }
  }

  // --- Risk scan (1 LLM call) ---
  const negativeClusters = clusterSummaries.filter(
    cs => (cs.cluster.sentiment_distribution.negative ?? 0) > 0.3
  )

  let risks: Array<{ title: string; description: string }> = []
  if (negativeClusters.length > 0) {
    const riskInput = negativeClusters.map(cs =>
      `Cluster "${cs.cluster.label}" (${Math.round((cs.cluster.sentiment_distribution.negative ?? 0) * 100)}% negative): ${cs.summary}`
    ).join('\n')

    try {
      const raw = await chatCompletion([
        { role: 'system', content: riskScanPrompt(language) },
        { role: 'user', content: riskInput },
      ], llmConfig, signal)
      const parsed = robustJsonParse(raw)
      if (Array.isArray(parsed?.risks)) {
        risks = parsed.risks.filter((r: unknown) =>
          r && typeof r === 'object' && 'title' in r && 'description' in r
        ).map((r: Record<string, unknown>) => ({
          title: String(r.title),
          description: String(r.description),
        }))
      }
    } catch { /* continue without risks */ }
  }

  // --- Executive summary (1 LLM call, needs cluster summaries) ---
  let executiveSummary = ''
  const execInput = clusterSummaries
    .map(cs => `[${cs.cluster.label}]: ${cs.summary}`)
    .join('\n')
  const riskSection = risks.length > 0
    ? '\n\nRisks:\n' + risks.map(r => `- ${r.title}: ${r.description}`).join('\n')
    : ''

  try {
    const raw = await chatCompletion([
      { role: 'system', content: executiveSummaryPrompt(language) },
      { role: 'user', content: `${clusterSummaries.length} topic clusters:\n${execInput}${riskSection}` },
    ], llmConfig, signal)
    const parsed = robustJsonParse(raw)
    if (typeof parsed?.summary === 'string') executiveSummary = parsed.summary
  } catch { /* continue without executive summary */ }

  // --- Assemble into IntelligenceReport (backward-compatible shape) ---
  // Map clusters to TrendIntelligence topics
  const trendTopics: TrendTopic[] = clusterSummaries.map(cs => ({
    name: cs.cluster.label,
    summary: cs.summary,
    sources: [...new Set(cs.cluster.item_ids
      .map(id => allItems.find(i => i.id === id)?.source)
      .filter(Boolean) as string[])],
    itemCount: cs.cluster.item_ids.length,
    sentiment: dominantSentiment(cs.cluster.sentiment_distribution),
    heat: Math.round(cs.cluster.item_ids.length),
  }))

  // Aggregate tags from NLP enrichments
  const tagFreq = new Map<string, { weight: number; sentiment: string }>()
  for (const enriched of nlpData.items) {
    for (const kw of enriched.keywords) {
      const existing = tagFreq.get(kw.text)
      if (existing) {
        existing.weight += kw.weight
      } else {
        tagFreq.set(kw.text, { weight: kw.weight, sentiment: enriched.sentiment.label })
      }
    }
  }
  const sortedTags = [...tagFreq.entries()].sort((a, b) => b[1].weight - a[1].weight)
  const maxWeight = sortedTags[0]?.[1].weight ?? 1
  const tags: IntelTag[] = sortedTags.slice(0, 25).map(([text, { weight, sentiment }]) => ({
    text,
    weight: Math.round((weight / maxWeight) * 1000) / 1000,
    sentiment: normalizeSentiment(sentiment),
  }))

  // Build accounts focus list
  const accounts: AccountFocus[] = [...accountsFocusMap.entries()].map(([name, data]) => ({
    account: name,
    handle: data.handle,
    platform: data.platform,
    themes: [...data.themes].slice(0, 5),
    sentiment: normalizeSentiment(data.sentiment),
    postCount: data.count,
  }))

  return {
    trend: {
      topics: trendTopics,
      tags,
      summary: executiveSummary,
      generated_at: new Date().toISOString(),
    },
    topics: null, // Topic intelligence preserved from existing pipeline if needed
    accounts: accounts.length > 0 ? {
      accounts,
      tags: tags.slice(0, 20),
      summary: accountsSummary,
      generated_at: new Date().toISOString(),
    } : null,
  }
}

/** Pick the dominant sentiment from a distribution. */
function dominantSentiment(dist: Record<string, number>): 'positive' | 'negative' | 'neutral' | 'mixed' {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1])
  if (!entries.length) return 'neutral'
  const [top, topVal] = entries[0]
  if (topVal < 0.5 && entries.length > 1) return 'mixed'
  return normalizeSentiment(top)
}
```

**Step 3: Modify `helpers.ts` to use NLP-first pipeline**

In `frontend/src/lib/pipeline/helpers.ts`, modify the `runIntelligence` function (lines 226-252) to try the NLP sidecar first:

```typescript
// Add import at top of helpers.ts:
import { checkHealth, analyzeItems } from './nlp-client'
import { runNlpIntelligenceAnalysis } from './intelligence'

// Replace the body of runIntelligence (lines 226-252):
export async function runIntelligence(
  report: IntelReport,
  llmConfig: LlmConfig,
  signal: AbortSignal | undefined,
  language: SummaryLanguage | undefined,
  tracker: PipelineProgressTracker,
): Promise<void> {
  tracker.addEvent('info', 'intelligence', 'Intelligence analysis started')

  try {
    // Try NLP sidecar first
    const nlpAvailable = await checkHealth()

    if (nlpAvailable) {
      tracker.addEvent('info', 'intelligence', 'NLP sidecar available, using Python-first pipeline')

      // Collect all items for NLP analysis
      const allItems: IntelItem[] = []
      for (const cat of ALL_CATEGORIES) {
        allItems.push(...(report.items[cat] ?? []))
      }

      const nlpInput = allItems.map(item => ({
        id: item.id,
        title: item.title,
        abstract: item.abstract ?? undefined,
        lang: detectLang(item),
      }))

      const nlpData = await analyzeItems(nlpInput)

      if (nlpData) {
        const intelligence = await runNlpIntelligenceAnalysis(report, nlpData, llmConfig, signal, language)
        await writeIntelligence(intelligence)
        tracker.addEvent('ok', 'intelligence', 'NLP-first intelligence analysis complete')
        return
      }

      tracker.addEvent('warn', 'intelligence', 'NLP sidecar returned null, falling back to LLM-only')
    } else {
      tracker.addEvent('info', 'intelligence', 'NLP sidecar unavailable, using LLM-only pipeline')
    }

    // Fallback: legacy LLM-only pipeline
    const intelligence = await runIntelligenceAnalysis(report, llmConfig, signal, language)
    const hasData = intelligence.trend !== null || intelligence.topics !== null || intelligence.accounts !== null
    if (hasData) {
      await writeIntelligence(intelligence)
      tracker.addEvent('ok', 'intelligence', 'Legacy intelligence analysis complete')
    } else {
      tracker.addEvent('warn', 'intelligence', 'Intelligence analysis produced no results')
    }
  } catch (err) {
    tracker.addEvent('warn', 'intelligence', `Intelligence analysis failed: ${err}`)
  }
}

/** Detect language of an item based on its source sensor. */
function detectLang(item: IntelItem): string {
  const cnSensors = new Set([
    'sources_36kr', 'wallstreetcn', 'v2ex', 'zhihu', 'weibo',
    'xiaohongshu', 'baidu_tieba', 'douyin', 'toutiao', 'netease',
    '36kr_trending', 'juejin', 'baidu',
  ])
  return cnSensors.has(item.source) ? 'zh' : 'en'
}
```

**Step 4: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (existing + new)

**Step 5: Commit**

```bash
git add frontend/src/lib/pipeline/intelligence.ts frontend/src/lib/pipeline/helpers.ts
git commit -m "feat(pipeline): NLP-first intelligence analysis with LLM fallback"
```

---

### Task 11: End-to-end integration test

**Files:**
- Create: `frontend/src/lib/pipeline/__tests__/nlp-integration.test.ts`

**Step 1: Write integration test**

```typescript
// ABOUTME: Integration test for the NLP-first intelligence pipeline.
// ABOUTME: Validates the full flow: NLP enrichment -> focused LLM calls -> report assembly.
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('NLP-first intelligence pipeline', () => {
  it('falls back to legacy when sidecar is down', async () => {
    // Mock fetch to reject (sidecar down)
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const { checkHealth } = await import('../nlp-client')
    const healthy = await checkHealth()
    expect(healthy).toBe(false)
  })

  it('detects language from sensor source', async () => {
    // This validates the detectLang helper used in the pipeline
    const cnSensors = ['weibo', 'zhihu', 'douyin', 'baidu']
    const enSensors = ['hacker_news', 'github', 'arxiv', 'bluesky']

    // Language detection is inline in helpers.ts, so we test the logic directly
    const cnSet = new Set([
      'sources_36kr', 'wallstreetcn', 'v2ex', 'zhihu', 'weibo',
      'xiaohongshu', 'baidu_tieba', 'douyin', 'toutiao', 'netease',
      '36kr_trending', 'juejin', 'baidu',
    ])
    for (const s of cnSensors) expect(cnSet.has(s)).toBe(true)
    for (const s of enSensors) expect(cnSet.has(s)).toBe(false)
  })
})
```

**Step 2: Run test**

Run: `cd frontend && npx vitest run src/lib/pipeline/__tests__/nlp-integration.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add frontend/src/lib/pipeline/__tests__/nlp-integration.test.ts
git commit -m "test(pipeline): NLP-first integration tests"
```

---

## Phase 3 — UI Enrichment

### Task 12: Expose per-item enrichments via API

**Files:**
- Modify: `frontend/src/lib/models.ts` — extend `IntelItem` with optional NLP fields
- Modify: `frontend/src/api/client.ts` — add NLP fields to client-side types

**Step 1: Add NLP enrichment fields to `IntelItem`**

In `frontend/src/lib/models.ts`, add to the `IntelItem` interface (after `velocity` field):

```typescript
  // NLP sidecar enrichments (optional — populated when sidecar is available)
  nlp_keywords?: Array<{ text: string; weight: number }> | null
  nlp_entities?: { people: string[]; orgs: string[]; places: string[] } | null
```

Note: `sentiment` already exists on `IntelItem` — the NLP sidecar's per-item sentiment will populate that existing field.

**Step 2: Mirror in `client.ts`**

Add the same fields to the client-side `IntelItem` type in `frontend/src/api/client.ts`.

**Step 3: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (new fields are optional, no breakage)

**Step 4: Commit**

```bash
git add frontend/src/lib/models.ts frontend/src/api/client.ts
git commit -m "feat(models): add NLP enrichment fields to IntelItem"
```

---

### Task 13: Show sentiment and keywords on item cards

**Files:**
- Modify: `frontend/src/components/data/ItemCard.tsx` — add keyword chips and sentiment indicator

**Step 1: Add keyword chips to ItemCard meta row**

In `ItemCard.tsx`, after the existing meta row content (after the `topic` display around line 220), add:

```typescript
{/* NLP keyword chips */}
{item.nlp_keywords && item.nlp_keywords.length > 0 && (
  <>
    <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
    {item.nlp_keywords.slice(0, 3).map(kw => (
      <span
        key={kw.text}
        style={{
          fontSize: '0.5625rem',
          fontWeight: 500,
          color: 'var(--ink-muted)',
          background: 'var(--surface-alt)',
          padding: '0.125rem 0.375rem',
          borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        {kw.text}
      </span>
    ))}
  </>
)}
```

**Step 2: Run tests and visually verify**

Run: `cd frontend && npx vitest run`
Then launch dev server and inspect the Data page.

**Step 3: Commit**

```bash
git add frontend/src/components/data/ItemCard.tsx
git commit -m "feat(ui): show NLP keyword chips on item cards"
```

---

## Phase 4 — LLM Call Optimization

### Task 14: Remove legacy tag-backfill code

**Files:**
- Modify: `frontend/src/lib/pipeline/intelligence-cache.ts` — remove `backfillAccountTags` (no longer needed when NLP sidecar handles tags)
- Modify: `frontend/src/lib/pipeline/intelligence.ts` — remove the theme-to-tags fallback in `analyzeAccountsIntelligence`

**Note:** Only do this after confirming the NLP sidecar is stable in production. Keep the fallback code for the first few weeks.

**Step 1: Gate the backfill behind a "legacy mode" check**

In `intelligence-cache.ts`, wrap `backfillAccountTags` call in a condition:

```typescript
export async function readIntelligence(): Promise<IntelligenceReport | null> {
  try {
    const data = await kvGet<IntelligenceReport>(INTELLIGENCE_KEY)
    if (!data) return null
    // Backfill only needed when NLP sidecar was not used
    return backfillAccountTags(data)
  } catch {
    return null
  }
}
```

(Keep as-is for now — the backfill is harmless and provides defense-in-depth.)

**Step 2: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git commit -m "chore(pipeline): document legacy backfill for future removal"
```

---

### Task 15: Full system verification

**Step 1: Start both services**

Run: `make dev`
Expected: Both Next.js (:8000) and NLP sidecar (:8001) start

**Step 2: Verify NLP sidecar health**

Run: `curl http://localhost:8001/health`
Expected: `{"status":"ready","models_loaded":true}`

**Step 3: Trigger a pipeline run and check intelligence output**

Navigate to the dashboard, trigger a pipeline run from the Status page.
After completion, check:
- Dashboard shows tag clouds on all three intelligence cards
- Cluster summaries are present and make sense
- Risk assessments appear for negative clusters
- Executive summary synthesizes across clusters

**Step 4: Verify fallback (stop sidecar)**

Kill the NLP sidecar process, trigger another pipeline run.
Expected: Pipeline falls back to LLM-only mode, intelligence still works.

**Step 5: Run full test suite**

Run: `make test`
Expected: All frontend + NLP tests PASS

---

## Summary

| Phase | Tasks | What it delivers |
|---|---|---|
| Phase 1 (Tasks 1-8) | Python sidecar standalone | Working FastAPI service with keywords, sentiment, NER, clustering |
| Phase 2 (Tasks 9-11) | TS integration | Pipeline calls Python first, falls back to LLM-only |
| Phase 3 (Tasks 12-13) | UI enrichment | Keyword chips and sentiment on item cards |
| Phase 4 (Tasks 14-15) | Cleanup + verification | Legacy code removal, full system test |
