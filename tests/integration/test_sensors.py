# ABOUTME: Integration tests for individual sensors using pytest-httpx to stub HTTP responses.
# ABOUTME: Verifies IntelItem schema compliance and graceful degradation on missing keys/errors.
import json

import httpx
import pytest
from pytest_httpx import HTTPXMock

from intel_briefing.models import ConfigSettings, IntelItem
from intel_briefing.sensors.hacker_news import HackerNewsSensor
from intel_briefing.sensors.v2ex import V2EXSensor


def make_config(**kwargs) -> ConfigSettings:
    defaults: dict = {}
    defaults.update(kwargs)
    return ConfigSettings(_env_file=None, **defaults)


class TestHackerNewsSensor:
    def test_returns_intel_items(self, httpx_mock: HTTPXMock):
        story_ids = [1, 2, 3]
        httpx_mock.add_response(
            url="https://hacker-news.firebaseio.com/v0/topstories.json",
            json=story_ids,
        )
        for story_id in story_ids:
            httpx_mock.add_response(
                url=f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
                json={
                    "id": story_id,
                    "type": "story",
                    "title": f"Story {story_id}",
                    "url": f"https://example.com/{story_id}",
                    "score": 100,
                    "descendants": 20,
                },
            )

        sensor = HackerNewsSensor()
        config = make_config()
        items = sensor.fetch(config, limit=5)

        assert len(items) == 3
        for item in items:
            assert isinstance(item, IntelItem)
            assert item.source == "hacker_news"
            assert item.id.startswith("hn-")
            assert item.url.startswith("https://")

    def test_graceful_empty_on_http_error(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(
            url="https://hacker-news.firebaseio.com/v0/topstories.json",
            status_code=500,
        )
        sensor = HackerNewsSensor()
        items = sensor.fetch(make_config(), limit=5)
        assert items == []

    def test_sensor_name(self):
        assert HackerNewsSensor.sensor_name == "hacker_news"

    def test_skips_non_story_type(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(
            url="https://hacker-news.firebaseio.com/v0/topstories.json",
            json=[1, 2],
        )
        # Item 1 is a job posting (not a story)
        httpx_mock.add_response(
            url="https://hacker-news.firebaseio.com/v0/item/1.json",
            json={"id": 1, "type": "job", "title": "Job Post", "url": "https://example.com/job",
                  "score": 1, "descendants": 0},
        )
        # Item 2 is a story
        httpx_mock.add_response(
            url="https://hacker-news.firebaseio.com/v0/item/2.json",
            json={
                "id": 2, "type": "story", "title": "Normal post",
                "url": "https://example.com", "score": 100, "descendants": 5,
            },
        )
        items = HackerNewsSensor().fetch(make_config(), limit=5)
        # Only item 2 should be returned (item 1 is a job, not a story)
        assert len(items) == 1
        assert items[0].id == "hn-2"


class TestV2EXSensor:
    def test_returns_intel_items(self, httpx_mock: HTTPXMock):
        topics = [
            {"id": 1, "title": "V2EX Topic 1", "url": "https://v2ex.com/t/1", "replies": 10},
            {"id": 2, "title": "V2EX Topic 2", "url": "https://v2ex.com/t/2", "replies": 5},
        ]
        httpx_mock.add_response(
            url="https://www.v2ex.com/api/topics/hot.json",
            json=topics,
        )
        sensor = V2EXSensor()
        items = sensor.fetch(make_config(), limit=5)
        assert len(items) == 2
        for item in items:
            assert isinstance(item, IntelItem)
            assert item.source == "v2ex"
            assert item.url.startswith("https://v2ex.com")

    def test_graceful_empty_on_http_error(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(
            url="https://www.v2ex.com/api/topics/hot.json",
            status_code=503,
        )
        sensor = V2EXSensor()
        items = sensor.fetch(make_config(), limit=5)
        assert items == []

    def test_sensor_name(self):
        assert V2EXSensor.sensor_name == "v2ex"


class TestSensorProtocolCompliance:
    """Verify every sensor has required protocol attributes without making HTTP calls."""

    def test_all_sensors_have_sensor_name(self):
        from intel_briefing.sensors.arxiv import ArxivSensor
        from intel_briefing.sensors.github import GitHubSensor
        from intel_briefing.sensors.grok import GrokSensor
        from intel_briefing.sensors.hn_blogs import HNBlogsSensor
        from intel_briefing.sensors.hacker_news import HackerNewsSensor
        from intel_briefing.sensors.politics import PoliticsSensor
        from intel_briefing.sensors.product_hunt import ProductHuntSensor
        from intel_briefing.sensors.sources_36kr import Sources36KrSensor
        from intel_briefing.sensors.topics import TopicsSensor
        from intel_briefing.sensors.v2ex import V2EXSensor
        from intel_briefing.sensors.wallstreetcn import WallStreetCNSensor

        sensors = [
            HackerNewsSensor, ArxivSensor, GitHubSensor, ProductHuntSensor,
            V2EXSensor, HNBlogsSensor, GrokSensor, Sources36KrSensor,
            WallStreetCNSensor, PoliticsSensor, TopicsSensor,
        ]
        for sensor_cls in sensors:
            assert hasattr(sensor_cls, "sensor_name"), f"{sensor_cls} missing sensor_name"
            assert isinstance(sensor_cls.sensor_name, str), f"{sensor_cls}.sensor_name must be str"
            assert hasattr(sensor_cls, "fetch"), f"{sensor_cls} missing fetch method"

    def test_grok_sensor_skips_without_api_key(self, httpx_mock: HTTPXMock):
        from intel_briefing.sensors.grok import GrokSensor
        config = make_config(xai_api_key=None)
        items = GrokSensor().fetch(config, limit=5)
        assert items == []

    def test_politics_sensor_skips_without_api_key(self, httpx_mock: HTTPXMock):
        from intel_briefing.sensors.politics import PoliticsSensor
        config = make_config(xai_api_key=None, politics_accounts=["@user1"])
        items = PoliticsSensor().fetch(config, limit=5)
        assert items == []

    def test_politics_sensor_skips_without_accounts(self, httpx_mock: HTTPXMock):
        from intel_briefing.sensors.politics import PoliticsSensor
        config = make_config(xai_api_key="key123", politics_accounts=[])
        items = PoliticsSensor().fetch(config, limit=5)
        assert items == []

    def test_topics_sensor_skips_without_api_key(self, httpx_mock: HTTPXMock):
        from intel_briefing.sensors.topics import TopicsSensor
        config = make_config(xai_api_key=None, topics_keywords=["AI"])
        items = TopicsSensor().fetch(config, limit=5)
        assert items == []

    def test_github_sensor_skips_without_token(self, httpx_mock: HTTPXMock):
        from intel_briefing.sensors.github import GitHubSensor
        config = make_config(github_token=None)
        items = GitHubSensor().fetch(config, limit=5)
        assert items == []

    def test_product_hunt_skips_without_token(self, httpx_mock: HTTPXMock):
        from intel_briefing.sensors.product_hunt import ProductHuntSensor
        config = make_config(producthunt_token=None)
        items = ProductHuntSensor().fetch(config, limit=5)
        assert items == []
