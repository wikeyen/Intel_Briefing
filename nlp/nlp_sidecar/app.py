# ABOUTME: FastAPI application — the NLP sidecar entry point.
# ABOUTME: Loads all models at startup, exposes /analyze, /enrich, /cluster, and /health endpoints.
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
from transformers import Pipeline

from nlp_sidecar.clustering import cluster_items, load_embedding_model
from nlp_sidecar.entities import NerModels, extract_entities, load_ner_models
from nlp_sidecar.keywords import KeywordModels, extract_keywords, load_keyword_models
from nlp_sidecar.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    ClusterRequest,
    ClusterResponse,
    EnrichRequest,
    EnrichResponse,
    EnrichedItem,
    Entities,
    HealthResponse,
    Keyword,
    Sentiment,
)
from nlp_sidecar.sentiment import analyze_sentiment, load_sentiment_model

logger = logging.getLogger("nlp_sidecar")


@dataclass
class ModelRegistry:
    """Holds all loaded ML models for the sidecar."""

    keywords: KeywordModels | None = None
    sentiment: Pipeline | None = None
    ner: NerModels | None = None
    embedding: SentenceTransformer | None = None

    @property
    def loaded(self) -> bool:
        return all([self.keywords, self.sentiment, self.ner, self.embedding])


models = ModelRegistry()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    logger.info("Loading NLP models...")
    models.keywords = load_keyword_models()
    models.sentiment = load_sentiment_model()
    models.ner = load_ner_models()
    models.embedding = load_embedding_model()
    logger.info("All models loaded.")
    yield


app = FastAPI(title="NLP Sidecar", lifespan=lifespan)


@app.get("/health")
async def health() -> HealthResponse:
    return HealthResponse(status="ready", models_loaded=models.loaded)


@app.post("/analyze")
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    if not request.items:
        return AnalyzeResponse(items=[], clusters=[])

    enriched: list[EnrichedItem] = []
    per_item_keywords: dict[str, list[Keyword]] = {}
    per_item_sentiment: dict[str, str] = {}

    for item in request.items:
        text = f"{item.title} {item.abstract or ''}".strip()

        try:
            keywords = extract_keywords(text, item.lang, models.keywords)
            sentiment = analyze_sentiment(text, item.lang, models.sentiment)
            entities = extract_entities(text, item.lang, models.ner)
        except Exception:
            logger.exception("Failed to process item %s", item.id)
            keywords = []
            sentiment = Sentiment(label="neutral", score=0.0)
            entities = Entities()

        per_item_keywords[item.id] = keywords
        per_item_sentiment[item.id] = sentiment.label

        enriched.append(
            EnrichedItem(
                id=item.id,
                keywords=keywords,
                sentiment=sentiment,
                entities=entities,
            )
        )

    clusters = cluster_items(
        request.items, per_item_keywords, models.embedding, per_item_sentiment
    )

    return AnalyzeResponse(items=enriched, clusters=clusters)


@app.post("/enrich")
async def enrich(request: EnrichRequest) -> EnrichResponse:
    if not request.items:
        return EnrichResponse(items=[])

    enriched: list[EnrichedItem] = []
    for item in request.items:
        text = f"{item.title} {item.abstract or ''}".strip()

        try:
            keywords = extract_keywords(text, item.lang, models.keywords)
            sentiment = analyze_sentiment(text, item.lang, models.sentiment)
            entities = extract_entities(text, item.lang, models.ner)
        except Exception:
            logger.exception("Failed to process item %s", item.id)
            keywords = []
            sentiment = Sentiment(label="neutral", score=0.0)
            entities = Entities()

        enriched.append(
            EnrichedItem(
                id=item.id,
                keywords=keywords,
                sentiment=sentiment,
                entities=entities,
            )
        )

    return EnrichResponse(items=enriched)


@app.post("/cluster")
async def cluster(request: ClusterRequest) -> ClusterResponse:
    if not request.items:
        return ClusterResponse(clusters=[])

    kw_map: dict[str, list[Keyword]] = {}
    for item_id, kw_list in request.per_item_keywords.items():
        kw_map[item_id] = kw_list

    clusters = cluster_items(
        request.items, kw_map, models.embedding, request.per_item_sentiment
    )

    return ClusterResponse(clusters=clusters)
