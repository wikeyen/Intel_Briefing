# ABOUTME: Unit tests for Pydantic data models in intel_briefing.models.
# ABOUTME: Covers IntelItem, IntelReport, ConfigSettings, SensorResult, HealthResponse.
import pytest
from intel_briefing.models import (
    ConfigSettings,
    HealthResponse,
    IntelItem,
    IntelReport,
    SensorResult,
)


class TestIntelItem:
    def test_required_fields(self):
        item = IntelItem(id="x", source="hn", title="Hello", url="https://example.com")
        assert item.id == "x"
        assert item.source == "hn"
        assert item.title == "Hello"
        assert item.url == "https://example.com"

    def test_optional_fields_default_none(self):
        item = IntelItem(id="x", source="hn", title="T", url="u")
        assert item.title_zh is None
        assert item.heat is None
        assert item.published_at is None
        assert item.authors is None
        assert item.categories is None
        assert item.abstract is None
        assert item.abstract_zh is None
        assert item.account is None
        assert item.handle is None
        assert item.topic is None
        assert item.content is None
        assert item.content_zh is None

    def test_missing_required_field_raises(self):
        with pytest.raises(Exception):
            IntelItem(source="hn", title="T", url="u")  # missing id

    def test_serialization_round_trip(self):
        item = IntelItem(
            id="1",
            source="arxiv",
            title="Paper",
            url="https://arxiv.org/abs/1234",
            abstract="Short abstract",
            authors=["Author A", "Author B"],
        )
        data = item.model_dump()
        restored = IntelItem.model_validate(data)
        assert restored == item


class TestIntelReport:
    def test_defaults(self):
        report = IntelReport(date="2026-01-01", fetched_at="2026-01-01T07:00:00Z")
        assert report.stale is False
        assert report.sources_ok == []
        assert report.sources_failed == []
        assert "tech_trends" in report.items
        assert "research" in report.items
        assert "politics" in report.items
        assert "topics" in report.items

    def test_all_sections_present_by_default(self):
        report = IntelReport(date="2026-01-01", fetched_at="2026-01-01T07:00:00Z")
        expected = {"tech_trends", "research", "capital_flow", "products",
                    "community", "politics", "topics", "insights"}
        assert set(report.items.keys()) == expected

    def test_ensure_all_sections_validator_fills_missing(self):
        report = IntelReport(
            date="2026-01-01",
            fetched_at="2026-01-01T07:00:00Z",
            items={"tech_trends": []},
        )
        assert "research" in report.items  # filled in by validator
        assert "politics" in report.items

    def test_serialization_round_trip(self):
        item = IntelItem(id="1", source="hn", title="T", url="u")
        report = IntelReport(
            date="2026-01-01",
            fetched_at="2026-01-01T07:00:00Z",
            stale=True,
            sources_ok=["hn"],
            items={"tech_trends": [item]},
        )
        json_str = report.model_dump_json()
        restored = IntelReport.model_validate_json(json_str)
        assert restored.stale is True
        assert len(restored.items["tech_trends"]) == 1


class TestConfigSettings:
    def test_safe_defaults_with_no_env(self, monkeypatch):
        # Ensure no env vars pollute the test
        for key in ["GEMINI_API_KEY", "XAI_API_KEY", "GITHUB_TOKEN", "PRODUCTHUNT_TOKEN"]:
            monkeypatch.delenv(key, raising=False)
        cfg = ConfigSettings(_env_file=None)
        assert cfg.gemini_api_key is None
        assert cfg.xai_api_key is None
        assert cfg.xai_base_url == "https://api.x.ai/v1/chat/completions"
        assert cfg.xai_model == "grok-3"
        assert cfg.default_language == "en"
        assert cfg.default_limit == 10
        assert cfg.cache_ttl_hours == 6

    def test_sensor_defaults_all_true(self, monkeypatch):
        monkeypatch.delenv("SENSORS_ENABLED", raising=False)
        cfg = ConfigSettings(_env_file=None)
        assert cfg.sensors_enabled["hacker_news"] is True
        assert cfg.sensors_enabled["arxiv"] is True
        assert cfg.sensors_enabled["politics"] is True

    def test_section_limit_falls_back_to_default(self, monkeypatch):
        monkeypatch.delenv("DEFAULT_LIMIT", raising=False)
        cfg = ConfigSettings(_env_file=None)
        assert cfg.section_limit("tech_trends") == 10
        assert cfg.section_limit("nonexistent") == 10

    def test_section_limit_uses_override(self, monkeypatch):
        monkeypatch.delenv("SECTION_LIMITS", raising=False)
        cfg = ConfigSettings(_env_file=None, section_limits={"research": 5})
        assert cfg.section_limit("research") == 5
        assert cfg.section_limit("tech_trends") == 10


class TestSensorResult:
    def test_succeeded_true_when_no_error(self):
        result = SensorResult(sensor_name="hn")
        assert result.succeeded is True

    def test_succeeded_false_when_error_set(self):
        result = SensorResult(sensor_name="hn", error="timeout")
        assert result.succeeded is False


class TestHealthResponse:
    def test_basic_construction(self):
        h = HealthResponse(status="ok", last_fetch="2026-01-01T07:00:00Z")
        assert h.status == "ok"
        assert h.last_fetch == "2026-01-01T07:00:00Z"

    def test_no_data_status(self):
        h = HealthResponse(status="no_data")
        assert h.last_fetch is None
