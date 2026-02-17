# ABOUTME: Unit tests for the atomic JSON cache in intel_briefing.pipeline.cache.
# ABOUTME: Covers write/read round-trip, staleness detection, and missing file handling.
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from intel_briefing.models import IntelItem, IntelReport
from intel_briefing.pipeline.cache import is_stale, read_cache, write_cache


def make_report(fetched_at: str = "2026-01-01T07:00:00+00:00") -> IntelReport:
    return IntelReport(date="2026-01-01", fetched_at=fetched_at)


class TestWriteCache:
    def test_write_creates_file(self, tmp_path):
        path = tmp_path / "cache.json"
        report = make_report()
        write_cache(report, path)
        assert path.exists()

    def test_write_creates_parent_dirs(self, tmp_path):
        path = tmp_path / "nested" / "deep" / "cache.json"
        write_cache(make_report(), path)
        assert path.exists()

    def test_write_produces_valid_json(self, tmp_path):
        path = tmp_path / "cache.json"
        write_cache(make_report(), path)
        data = json.loads(path.read_text())
        assert data["date"] == "2026-01-01"

    def test_no_tmp_file_left_after_write(self, tmp_path):
        path = tmp_path / "cache.json"
        write_cache(make_report(), path)
        tmp = path.with_suffix(".json.tmp")
        assert not tmp.exists()


class TestReadCache:
    def test_round_trip(self, tmp_path):
        path = tmp_path / "cache.json"
        original = make_report()
        write_cache(original, path)
        restored = read_cache(path)
        assert restored is not None
        assert restored.date == original.date
        assert restored.fetched_at == original.fetched_at

    def test_returns_none_for_missing_file(self, tmp_path):
        path = tmp_path / "nonexistent.json"
        assert read_cache(path) is None

    def test_returns_none_for_corrupt_json(self, tmp_path):
        path = tmp_path / "cache.json"
        path.write_text("not valid json", encoding="utf-8")
        assert read_cache(path) is None

    def test_preserves_items(self, tmp_path):
        path = tmp_path / "cache.json"
        item = IntelItem(id="1", source="hn", title="Test", url="https://example.com")
        report = IntelReport(
            date="2026-01-01",
            fetched_at="2026-01-01T07:00:00+00:00",
            items={"tech_trends": [item]},
        )
        write_cache(report, path)
        restored = read_cache(path)
        assert restored is not None
        assert len(restored.items["tech_trends"]) == 1
        assert restored.items["tech_trends"][0].title == "Test"


class TestIsStale:
    def test_fresh_report_not_stale(self):
        now = datetime.now(timezone.utc).isoformat()
        report = make_report(now)
        assert is_stale(report, ttl_hours=6) is False

    def test_old_report_is_stale(self):
        old = (datetime.now(timezone.utc) - timedelta(hours=10)).isoformat()
        report = make_report(old)
        assert is_stale(report, ttl_hours=6) is True

    def test_boundary_case_exactly_at_ttl(self):
        # Exactly at TTL: age > ttl_hours → stale
        at_ttl = (datetime.now(timezone.utc) - timedelta(hours=6, seconds=1)).isoformat()
        report = make_report(at_ttl)
        assert is_stale(report, ttl_hours=6) is True

    def test_invalid_fetched_at_returns_true(self):
        report = make_report("not-a-timestamp")
        assert is_stale(report) is True

    def test_custom_ttl(self):
        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1, minutes=5)).isoformat()
        report = make_report(one_hour_ago)
        assert is_stale(report, ttl_hours=1) is True
        assert is_stale(report, ttl_hours=2) is False
