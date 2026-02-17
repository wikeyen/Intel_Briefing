# ABOUTME: End-to-end tests that make real network calls to live data sources.
# ABOUTME: Marked with @pytest.mark.e2e — skipped by default unless -m e2e is passed.
import pytest

from intel_briefing.models import ConfigSettings, IntelItem
from intel_briefing.sensors.arxiv import ArxivSensor
from intel_briefing.sensors.hacker_news import HackerNewsSensor


def make_config() -> ConfigSettings:
    return ConfigSettings(_env_file=None)


@pytest.mark.e2e
def test_hacker_news_returns_live_items():
    """HN sensor should return at least one valid IntelItem from live API."""
    sensor = HackerNewsSensor()
    items = sensor.fetch(make_config(), limit=3)
    assert len(items) >= 1
    for item in items:
        assert isinstance(item, IntelItem)
        assert item.id.startswith("hn-")
        assert item.title
        assert item.url.startswith("http")


@pytest.mark.e2e
def test_arxiv_returns_live_items_with_abstract():
    """ArXiv sensor should return at least one item with a non-empty abstract."""
    sensor = ArxivSensor()
    items = sensor.fetch(make_config(), limit=3)
    assert len(items) >= 1
    items_with_abstract = [i for i in items if i.abstract]
    assert len(items_with_abstract) >= 1, "At least one ArXiv item should have an abstract"
    for item in items:
        assert isinstance(item, IntelItem)
        assert item.source == "arxiv"
