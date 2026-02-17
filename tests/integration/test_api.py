# ABOUTME: Integration tests for FastAPI routes using TestClient with mocked cache/config.
# ABOUTME: Covers all endpoints: health, fetch, intel/latest, intel/{section}, briefing, config.
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from intel_briefing.api.main import app
from intel_briefing.models import ConfigSettings, IntelItem, IntelReport


def make_report(
    fetched_at: str = "2026-01-01T07:00:00+00:00",
    stale: bool = False,
    sources_ok: list[str] | None = None,
    sources_failed: list[str] | None = None,
    items: dict | None = None,
) -> IntelReport:
    report = IntelReport(
        date="2026-01-01",
        fetched_at=fetched_at,
        stale=stale,
        sources_ok=sources_ok or [],
        sources_failed=sources_failed or [],
    )
    if items:
        for section, section_items in items.items():
            report.items[section] = section_items
    return report


def make_item(id: str, title: str) -> IntelItem:
    return IntelItem(
        id=id, source="hn", title=title, url=f"https://example.com/{id}"
    )


@pytest.fixture
def fresh_config(tmp_path) -> ConfigSettings:
    return ConfigSettings(
        cache_ttl_hours=6,
    )


@pytest.fixture
def client(tmp_path, fresh_config):
    """TestClient with scheduler and load_settings mocked out."""
    cache_path = tmp_path / "intel_latest.json"
    settings_path = tmp_path / "settings.json"

    with (
        patch("intel_briefing.api.main.start_scheduler"),
        patch("intel_briefing.api.main.stop_scheduler"),
        patch("intel_briefing.api.main.load_settings", return_value=fresh_config),
    ):
        with TestClient(app) as c:
            app.state.cache_path = cache_path
            app.state.settings_path = settings_path
            app.state.config = fresh_config
            yield c


class TestHealthEndpoint:
    def test_no_data_when_cache_missing(self, client):
        with patch("intel_briefing.api.routes.control.read_cache", return_value=None):
            resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "no_data"
        assert data["last_fetch"] is None

    def test_ok_status_with_fresh_cache(self, client):
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        report = make_report(fetched_at=now_iso)
        with (
            patch("intel_briefing.api.routes.control.read_cache", return_value=report),
            patch("intel_briefing.api.routes.control.is_stale", return_value=False),
        ):
            resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_stale_status_when_cache_old(self, client):
        report = make_report()
        with (
            patch("intel_briefing.api.routes.control.read_cache", return_value=report),
            patch("intel_briefing.api.routes.control.is_stale", return_value=True),
        ):
            resp = client.get("/health")
        assert resp.json()["status"] == "stale"


class TestFetchEndpoint:
    def test_post_fetch_returns_202(self, client):
        with patch("intel_briefing.api.routes.control.read_cache", return_value=None):
            resp = client.post("/fetch")
        assert resp.status_code == 202
        assert resp.json()["status"] == "accepted"


class TestIntelLatestEndpoint:
    def test_503_when_no_cache(self, client):
        with patch("intel_briefing.api.routes.intel.read_cache", return_value=None):
            resp = client.get("/intel/latest")
        assert resp.status_code == 503

    def test_returns_report_schema(self, client):
        report = make_report(sources_ok=["hn"])
        with (
            patch("intel_briefing.api.routes.intel.read_cache", return_value=report),
            patch("intel_briefing.api.routes.intel.is_stale", return_value=False),
        ):
            resp = client.get("/intel/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "date" in data
        assert "fetched_at" in data
        assert "stale" in data

    def test_limit_truncates_items(self, client):
        items = [make_item(str(i), f"Item {i}") for i in range(10)]
        report = make_report(items={"tech_trends": items})
        with (
            patch("intel_briefing.api.routes.intel.read_cache", return_value=report),
            patch("intel_briefing.api.routes.intel.is_stale", return_value=False),
        ):
            resp = client.get("/intel/latest?limit=3")
        assert resp.status_code == 200
        assert len(resp.json()["items"]["tech_trends"]) == 3

    def test_stale_flag_propagated(self, client):
        report = make_report()
        with (
            patch("intel_briefing.api.routes.intel.read_cache", return_value=report),
            patch("intel_briefing.api.routes.intel.is_stale", return_value=True),
        ):
            resp = client.get("/intel/latest")
        assert resp.json()["stale"] is True


class TestIntelSectionEndpoint:
    def test_known_section_returns_items(self, client):
        item = make_item("1", "HN Top Post")
        report = make_report(items={"tech_trends": [item]})
        with (
            patch("intel_briefing.api.routes.intel.read_cache", return_value=report),
            patch("intel_briefing.api.routes.intel.is_stale", return_value=False),
        ):
            resp = client.get("/intel/tech_trends")
        assert resp.status_code == 200
        data = resp.json()
        assert data["section"] == "tech_trends"
        assert len(data["items"]) == 1

    def test_unknown_section_returns_404(self, client):
        report = make_report()
        with (
            patch("intel_briefing.api.routes.intel.read_cache", return_value=report),
            patch("intel_briefing.api.routes.intel.is_stale", return_value=False),
        ):
            resp = client.get("/intel/nonexistent_section")
        assert resp.status_code == 404

    def test_503_when_no_cache(self, client):
        with patch("intel_briefing.api.routes.intel.read_cache", return_value=None):
            resp = client.get("/intel/tech_trends")
        assert resp.status_code == 503


class TestBriefingEndpoint:
    def test_returns_markdown_content_type(self, client):
        report = make_report()
        with (
            patch("intel_briefing.api.routes.briefing.read_cache", return_value=report),
        ):
            resp = client.get("/briefing/markdown")
        assert resp.status_code == 200
        assert "text/markdown" in resp.headers["content-type"]

    def test_returns_string_content(self, client):
        report = make_report(sources_ok=["hn"])
        with (
            patch("intel_briefing.api.routes.briefing.read_cache", return_value=report),
        ):
            resp = client.get("/briefing/markdown")
        assert "Intel Briefing" in resp.text

    def test_503_when_no_cache(self, client):
        with patch("intel_briefing.api.routes.briefing.read_cache", return_value=None):
            resp = client.get("/briefing/markdown")
        assert resp.status_code == 503


class TestConfigEndpoint:
    def test_get_config_masks_api_keys(self, client, fresh_config):
        app.state.config = ConfigSettings(
            xai_api_key="another-secret",
        )
        resp = client.get("/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["xai_api_key"] == "***"

    def test_get_config_null_key_not_masked(self, client, fresh_config):
        app.state.config = fresh_config  # all keys None
        resp = client.get("/config")
        assert resp.status_code == 200
        data = resp.json()
        # None keys should not be masked (they're not set)
        assert data["xai_api_key"] is None

    def test_put_config_updates_settings(self, client, tmp_path, fresh_config):
        app.state.config = fresh_config
        app.state.settings_path = tmp_path / "settings.json"

        with patch("intel_briefing.api.routes.config.load_settings", return_value=fresh_config):
            resp = client.put(
                "/config",
                json={"default_limit": 25},
                headers={"Content-Type": "application/json"},
            )
        assert resp.status_code == 200
        # Settings file should have been written
        settings_path = tmp_path / "settings.json"
        assert settings_path.exists()

    def test_put_config_ignores_masked_keys(self, client, tmp_path, fresh_config):
        app.state.config = fresh_config
        app.state.settings_path = tmp_path / "settings.json"

        with patch("intel_briefing.api.routes.config.load_settings", return_value=fresh_config):
            resp = client.put(
                "/config",
                json={"xai_api_key": "***"},
            )
        assert resp.status_code == 200
        # *** should not be written to settings
        import json
        if (tmp_path / "settings.json").exists():
            data = json.loads((tmp_path / "settings.json").read_text())
            assert data.get("xai_api_key") != "***"

    def test_put_config_returns_masked_response(self, client, tmp_path):
        config_with_key = ConfigSettings(xai_api_key="real-key")
        app.state.config = config_with_key
        app.state.settings_path = tmp_path / "settings.json"

        with patch("intel_briefing.api.routes.config.load_settings", return_value=config_with_key):
            resp = client.put("/config", json={"default_limit": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["xai_api_key"] == "***"
