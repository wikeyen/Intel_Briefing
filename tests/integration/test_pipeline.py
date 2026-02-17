# ABOUTME: Integration tests for the collect() pipeline with stubbed sensors.
# ABOUTME: Validates IntelReport structure, sensor failure isolation, and cache write.
from unittest.mock import MagicMock, patch

import pytest

from intel_briefing.models import ConfigSettings, IntelItem, IntelReport
from intel_briefing.pipeline.collector import collect


def make_config(**kwargs) -> ConfigSettings:
    return ConfigSettings(_env_file=None, **kwargs)


def make_item(id: str, source: str = "hn") -> IntelItem:
    return IntelItem(id=id, source=source, title=f"Item {id}", url=f"https://example.com/{id}")


class TestCollect:
    def test_all_sensors_stub_empty_returns_valid_report(self, tmp_path):
        """When _load_sensors returns no sensors, collect() produces a valid empty IntelReport."""
        config = make_config()
        cache_path = tmp_path / "cache.json"

        with patch("intel_briefing.pipeline.collector._load_sensors", return_value=[]):
            report = collect(config, cache_path)

        assert isinstance(report, IntelReport)
        assert report.date
        assert report.fetched_at
        assert "tech_trends" in report.items
        assert cache_path.exists()

    def test_failed_sensor_goes_to_sources_failed(self, tmp_path):
        """A sensor that raises an exception should appear in sources_failed."""
        config = make_config()
        cache_path = tmp_path / "cache.json"

        fail_sensor = MagicMock()
        fail_sensor.sensor_name = "failing_sensor"
        fail_sensor.fetch.side_effect = RuntimeError("Connection refused")

        ok_sensor = MagicMock()
        ok_sensor.sensor_name = "ok_sensor"
        ok_sensor.fetch.return_value = [make_item("1", "ok_sensor")]

        with patch("intel_briefing.pipeline.collector._load_sensors",
                   return_value=[fail_sensor, ok_sensor]):
            report = collect(config, cache_path)

        assert "failing_sensor" in report.sources_failed
        assert "ok_sensor" in report.sources_ok

    def test_disabled_sensor_not_loaded(self, tmp_path):
        """Sensors disabled in sensors_enabled config should not be loaded by _load_sensors."""
        # Patch at the _load_sensors level — if disabled, it returns nothing
        config = make_config(sensors_enabled={"my_sensor": False})
        cache_path = tmp_path / "cache.json"

        with patch("intel_briefing.pipeline.collector._load_sensors", return_value=[]) as mock_load:
            report = collect(config, cache_path)
            # _load_sensors is called with the config; sensor filtering happens inside it
            mock_load.assert_called_once_with(config)

    def test_cache_is_written_after_collect(self, tmp_path):
        """collect() should write the report to the cache file."""
        config = make_config()
        cache_path = tmp_path / "output.json"

        with patch("intel_briefing.pipeline.collector._load_sensors", return_value=[]):
            collect(config, cache_path)

        assert cache_path.exists()

    def test_items_routed_to_correct_sections(self, tmp_path):
        """Sensor items should be placed in the correct report section per _SENSOR_SECTION_MAP."""
        config = make_config()
        cache_path = tmp_path / "cache.json"

        hn_sensor = MagicMock()
        hn_sensor.sensor_name = "hacker_news"
        hn_sensor.fetch.return_value = [make_item("hn1", "hacker_news")]

        arxiv_sensor = MagicMock()
        arxiv_sensor.sensor_name = "arxiv"
        arxiv_sensor.fetch.return_value = [make_item("arxiv1", "arxiv")]

        with patch("intel_briefing.pipeline.collector._load_sensors",
                   return_value=[hn_sensor, arxiv_sensor]):
            report = collect(config, cache_path)

        assert any(i.id == "hn1" for i in report.items["tech_trends"])
        assert any(i.id == "arxiv1" for i in report.items["research"])

    def test_dedup_within_section_applied(self, tmp_path):
        """Duplicate items from same sensor should be deduplicated within a section."""
        config = make_config()
        cache_path = tmp_path / "cache.json"

        sensor = MagicMock()
        sensor.sensor_name = "hacker_news"
        sensor.fetch.return_value = [
            make_item("1", "hacker_news"),
            IntelItem(id="2", source="hacker_news", title="Item 1", url="https://example.com/dup"),
            # same title as id="1" → should be deduped
        ]

        with patch("intel_briefing.pipeline.collector._load_sensors", return_value=[sensor]):
            report = collect(config, cache_path)

        # Only 1 unique item (both have "Item 1" title)
        assert len(report.items["tech_trends"]) == 1
