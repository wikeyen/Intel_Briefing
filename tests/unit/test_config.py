# ABOUTME: Unit tests for config.py — settings loading, JSON source, and logging setup.
# ABOUTME: Covers load_settings, load_settings_json, setup_logging, and _JsonSettingsSource.
import json
import logging

import pytest

from intel_briefing.config import (
    JINA_READER_URL,
    load_settings,
    load_settings_json,
    setup_logging,
)
from intel_briefing.sensors.base import Sensor
from intel_briefing.models import ConfigSettings


class TestSetupLogging:
    def test_setup_logging_info_level(self):
        setup_logging(level="INFO")
        logger = logging.getLogger("intel_briefing")
        assert logger is not None

    def test_setup_logging_debug_level(self):
        setup_logging(level="DEBUG")
        root = logging.getLogger()
        assert root.level == logging.DEBUG

    def test_setup_logging_with_file(self, tmp_path):
        log_file = str(tmp_path / "app.log")
        setup_logging(level="INFO", log_file=log_file)
        import pathlib
        # After setup, file handler should be registered on root logger
        handlers = [h for h in logging.getLogger().handlers
                    if isinstance(h, logging.FileHandler)]
        assert len(handlers) >= 1


class TestConstants:
    def test_jina_reader_url_is_https(self):
        assert JINA_READER_URL.startswith("https://")


class TestLoadSettingsJson:
    def test_returns_empty_for_missing_file(self, tmp_path):
        path = tmp_path / "nonexistent.json"
        result = load_settings_json(path)
        assert result == {}

    def test_returns_dict_for_valid_file(self, tmp_path):
        path = tmp_path / "settings.json"
        path.write_text(json.dumps({"default_limit": 25}), encoding="utf-8")
        result = load_settings_json(path)
        assert result["default_limit"] == 25

    def test_returns_empty_for_corrupt_json(self, tmp_path):
        path = tmp_path / "settings.json"
        path.write_text("not json", encoding="utf-8")
        result = load_settings_json(path)
        assert result == {}


class TestLoadSettings:
    def test_returns_config_settings_instance(self, tmp_path):
        settings_path = tmp_path / "settings.json"
        result = load_settings(settings_path)
        assert isinstance(result, ConfigSettings)

    def test_uses_defaults_when_no_file(self, tmp_path, monkeypatch):
        # Remove any env vars that might influence test
        for key in ["XAI_API_KEY", "DEFAULT_LIMIT"]:
            monkeypatch.delenv(key, raising=False)
        path = tmp_path / "nonexistent.json"
        cfg = load_settings(path)
        assert cfg.default_limit == 10

    def test_reads_values_from_json_file(self, tmp_path, monkeypatch):
        monkeypatch.delenv("DEFAULT_LIMIT", raising=False)
        path = tmp_path / "settings.json"
        path.write_text(json.dumps({"default_limit": 42}), encoding="utf-8")
        cfg = load_settings(path)
        assert cfg.default_limit == 42

    def test_json_file_is_sole_source_of_truth(self, tmp_path, monkeypatch):
        # Env vars are intentionally ignored — settings.json is the only source.
        path = tmp_path / "settings.json"
        path.write_text(json.dumps({"default_limit": 5}), encoding="utf-8")
        monkeypatch.setenv("DEFAULT_LIMIT", "99")
        cfg = load_settings(path)
        assert cfg.default_limit == 5


class TestSensorProtocol:
    def test_sensor_protocol_is_runtime_checkable(self):
        from intel_briefing.sensors.hacker_news import HackerNewsSensor
        assert isinstance(HackerNewsSensor(), Sensor)

    def test_non_sensor_fails_isinstance(self):
        class NotASensor:
            pass
        # Missing sensor_name and fetch — should fail isinstance
        assert not isinstance(NotASensor(), Sensor)
