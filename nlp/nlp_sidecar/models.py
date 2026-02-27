# ABOUTME: Pydantic models for the NLP sidecar API — request and response schemas.
# ABOUTME: Defines item input, per-item enrichments, cluster output, and batch endpoint contracts.

from pydantic import BaseModel, Field


class AnalyzeItem(BaseModel):
    """Single item to analyze."""

    id: str
    title: str
    abstract: str | None = None
    lang: str = "en"


class Keyword(BaseModel):
    """Extracted keyword with weight."""

    text: str
    weight: float = Field(ge=0.0, le=1.0)


class Sentiment(BaseModel):
    """Sentiment classification result."""

    label: str
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
    sentiment_distribution: dict[str, float]
    representative_items: list[str]


class AnalyzeRequest(BaseModel):
    """Request body for POST /analyze."""

    items: list[AnalyzeItem]


class AnalyzeResponse(BaseModel):
    """Response body for POST /analyze."""

    items: list[EnrichedItem]
    clusters: list[ClusterSummary]


class EnrichRequest(BaseModel):
    """Request body for POST /enrich — per-item enrichment only."""

    items: list[AnalyzeItem]


class EnrichResponse(BaseModel):
    """Response body for POST /enrich."""

    items: list[EnrichedItem]


class ClusterRequest(BaseModel):
    """Request body for POST /cluster — clustering only."""

    items: list[AnalyzeItem]
    per_item_keywords: dict[str, list[Keyword]]
    per_item_sentiment: dict[str, str]


class ClusterResponse(BaseModel):
    """Response body for POST /cluster."""

    clusters: list[ClusterSummary]


class HealthResponse(BaseModel):
    """Response body for GET /health."""

    status: str
    models_loaded: bool
