# ABOUTME: Tests for semantic clustering — validates HDBSCAN grouping of items.
# ABOUTME: Checks cluster structure, label generation, and edge cases.
import pytest
from nlp_sidecar.clustering import cluster_items, load_embedding_model
from nlp_sidecar.models import AnalyzeItem, Keyword


@pytest.fixture(scope="module")
def model():
    return load_embedding_model()


def test_distinct_clusters(model):
    items = [
        AnalyzeItem(id="1", title="Bitcoin price surges past $100k", lang="en"),
        AnalyzeItem(id="2", title="Ethereum DeFi protocol hacked for $50M", lang="en"),
        AnalyzeItem(id="3", title="Crypto exchange faces regulatory scrutiny", lang="en"),
        AnalyzeItem(id="4", title="NASA launches new Mars rover mission", lang="en"),
        AnalyzeItem(id="5", title="SpaceX Starship completes orbital test", lang="en"),
        AnalyzeItem(id="6", title="New telescope discovers distant exoplanet", lang="en"),
    ]
    per_item_keywords = {
        "1": [Keyword(text="bitcoin", weight=0.9)],
        "2": [Keyword(text="ethereum", weight=0.9)],
        "3": [Keyword(text="crypto", weight=0.9)],
        "4": [Keyword(text="nasa", weight=0.9)],
        "5": [Keyword(text="spacex", weight=0.9)],
        "6": [Keyword(text="telescope", weight=0.9)],
    }
    clusters = cluster_items(items, per_item_keywords, model)
    assert len(clusters) >= 1
    assigned = set()
    for c in clusters:
        assigned.update(c.item_ids)
        assert len(c.top_keywords) > 0
        assert len(c.representative_items) > 0


def test_chinese_items(model):
    items = [
        AnalyzeItem(id="1", title="百度发布新AI大模型", lang="zh"),
        AnalyzeItem(id="2", title="阿里巴巴推出通义千问升级版", lang="zh"),
        AnalyzeItem(id="3", title="腾讯混元模型开放API", lang="zh"),
    ]
    per_item_keywords = {item.id: [] for item in items}
    clusters = cluster_items(items, per_item_keywords, model)
    assert len(clusters) >= 1


def test_too_few_items(model):
    items = [AnalyzeItem(id="1", title="Single item", lang="en")]
    clusters = cluster_items(items, {"1": []}, model)
    assert len(clusters) == 1
    assert clusters[0].item_ids == ["1"]
