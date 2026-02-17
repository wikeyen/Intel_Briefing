# ABOUTME: Shared Pydantic data models for Intel Briefing.
# ABOUTME: Defines IntelItem, IntelReport, HealthResponse, and ConfigSettings used across the system.
from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field, field_validator


class IntelItem(BaseModel):
    """A single piece of intel from any sensor."""

    id: str
    source: str
    title: str
    url: str

    # Optional enrichment fields
    heat: str | None = None
    published_at: str | None = None

    # Research (ArXiv)
    authors: list[str] | None = None
    categories: list[str] | None = None
    abstract: str | None = None

    # Politics sensor
    account: str | None = None
    handle: str | None = None

    # Topics sensor
    topic: str | None = None

    # Full content (blog articles)
    content: str | None = None


class IntelReport(BaseModel):
    """The full structured intel payload produced by one pipeline run."""

    date: str
    fetched_at: str
    stale: bool = False
    sources_ok: list[str] = Field(default_factory=list)
    sources_failed: list[str] = Field(default_factory=list)
    items: dict[str, list[IntelItem]] = Field(
        default_factory=lambda: {
            "tech_trends": [],
            "research": [],
            "capital_flow": [],
            "products": [],
            "community": [],
            "politics": [],
            "topics": [],
            "insights": [],
        }
    )

    @field_validator("items", mode="before")
    @classmethod
    def ensure_all_sections(cls, v: Any) -> Any:
        """Ensure every expected section key exists, even if not provided."""
        sections = [
            "tech_trends", "research", "capital_flow", "products",
            "community", "politics", "topics", "insights",
        ]
        if isinstance(v, dict):
            for section in sections:
                v.setdefault(section, [])
        return v


class HealthResponse(BaseModel):
    """Response schema for GET /health."""

    status: str  # "ok" | "no_data" | "error"
    last_fetch: str | None = None


class SensorResult(BaseModel):
    """Internal wrapper for a sensor's fetch outcome."""

    sensor_name: str
    items: list[IntelItem] = Field(default_factory=list)
    error: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.error is None


class SectionConfig(BaseModel):
    """Per-section output configuration."""

    limit: int = 10


class ConfigSettings(BaseModel):
    """All user-configurable settings for Intel Briefing.

    Loaded exclusively from config/settings.json — the single source of truth.
    Use config.load_settings() to construct an instance from disk.
    """

    # API keys
    xai_api_key: str | None = None
    xai_base_url: str = "https://api.x.ai/v1/chat/completions"
    xai_model: str = "grok-3"
    github_token: str | None = None
    producthunt_token: str | None = None

    # Sensor enable/disable toggles
    sensors_enabled: dict[str, bool] = Field(
        default_factory=lambda: {
            "hacker_news": True,
            "github": True,
            "arxiv": True,
            "v2ex": True,
            "hn_blogs": True,
            "grok": True,
            "product_hunt": True,
            "sources_36kr": True,
            "wallstreetcn": True,
            "politics": True,
            "topics": True,
        }
    )

    # Scheduler
    fetch_time: str = "07:51"        # HH:MM in fetch_timezone
    fetch_timezone: str = "Asia/Shanghai"

    # Output preferences
    default_limit: int = 10
    section_limits: dict[str, int] = Field(default_factory=dict)

    # Keyword filters
    boost_keywords: list[str] = Field(default_factory=list)
    suppress_keywords: list[str] = Field(default_factory=list)

    # Politics sensor accounts
    politics_accounts: list[str] = Field(default_factory=list)

    # Topics sensor keywords/hashtags
    topics_keywords: list[str] = Field(default_factory=list)

    # Cache
    cache_ttl_hours: int = 6

    def section_limit(self, section: str) -> int:
        """Return the configured limit for a section, falling back to default."""
        return self.section_limits.get(section, self.default_limit)
