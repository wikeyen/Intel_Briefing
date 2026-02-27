# ABOUTME: Integration tests for the FastAPI /analyze, /enrich, /cluster, and /health endpoints.
# ABOUTME: Uses httpx AsyncClient to validate request/response contracts.
import pytest
from httpx import ASGITransport, AsyncClient

from nlp_sidecar.app import app, lifespan


@pytest.fixture(scope="module")
async def client():
    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["models_loaded"] is True


@pytest.mark.anyio
async def test_analyze_english(client: AsyncClient):
    payload = {
        "items": [
            {"id": "en1", "title": "OpenAI releases GPT-5", "abstract": "The latest model shows improved reasoning capabilities.", "lang": "en"},
            {"id": "en2", "title": "Google DeepMind achieves breakthrough in protein folding", "abstract": "New AlphaFold version predicts structures with atomic accuracy.", "lang": "en"},
            {"id": "en3", "title": "Meta open-sources new large language model", "abstract": "LLaMA 4 is available for research and commercial use.", "lang": "en"},
        ]
    }
    resp = await client.post("/analyze", json=payload)
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["items"]) == 3
    for item in body["items"]:
        assert "keywords" in item
        assert "sentiment" in item
        assert "entities" in item
        assert item["sentiment"]["label"] in ("positive", "negative", "neutral")
        assert 0.0 <= item["sentiment"]["score"] <= 1.0

    assert len(body["clusters"]) >= 1
    for cluster in body["clusters"]:
        assert "label" in cluster
        assert "item_ids" in cluster
        assert len(cluster["item_ids"]) > 0


@pytest.mark.anyio
async def test_analyze_chinese(client: AsyncClient):
    payload = {
        "items": [
            {"id": "zh1", "title": "百度发布文心大模型4.0", "abstract": "新模型在中文理解方面大幅提升。", "lang": "zh"},
            {"id": "zh2", "title": "阿里巴巴通义千问开源", "abstract": "模型支持多语言对话和代码生成。", "lang": "zh"},
        ]
    }
    resp = await client.post("/analyze", json=payload)
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["items"]) == 2
    for item in body["items"]:
        assert item["sentiment"]["label"] in ("positive", "negative", "neutral")

    assert len(body["clusters"]) >= 1


@pytest.mark.anyio
async def test_analyze_empty(client: AsyncClient):
    payload = {"items": []}
    resp = await client.post("/analyze", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["clusters"] == []


@pytest.mark.anyio
async def test_analyze_mixed_languages(client: AsyncClient):
    payload = {
        "items": [
            {"id": "mix_en", "title": "NVIDIA announces next-gen GPU architecture", "abstract": "Blackwell Ultra brings 2x performance improvement.", "lang": "en"},
            {"id": "mix_zh", "title": "华为发布新一代芯片", "abstract": "麒麟9100采用3nm工艺制造。", "lang": "zh"},
        ]
    }
    resp = await client.post("/analyze", json=payload)
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["items"]) == 2
    ids = {item["id"] for item in body["items"]}
    assert ids == {"mix_en", "mix_zh"}

    for item in body["items"]:
        assert "keywords" in item
        assert "sentiment" in item
        assert "entities" in item

    assert len(body["clusters"]) >= 1


@pytest.mark.anyio
async def test_enrich_basic(client: AsyncClient):
    """POST /enrich returns per-item enrichment without clusters."""
    resp = await client.post(
        "/enrich",
        json={
            "items": [
                {"id": "e1", "title": "AI safety research advances", "lang": "en"},
            ]
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == "e1"
    assert "clusters" not in data  # enrich doesn't return clusters


@pytest.mark.anyio
async def test_enrich_empty(client: AsyncClient):
    """POST /enrich with empty list returns empty."""
    resp = await client.post("/enrich", json={"items": []})
    assert resp.status_code == 200
    assert resp.json()["items"] == []


@pytest.mark.anyio
async def test_cluster_basic(client: AsyncClient):
    """POST /cluster returns clusters from pre-computed enrichment data."""
    items = [
        {"id": f"c{i}", "title": f"Topic about AI number {i}", "lang": "en"}
        for i in range(5)
    ]
    per_item_keywords = {
        f"c{i}": [{"text": "AI", "weight": 0.9}] for i in range(5)
    }
    per_item_sentiment = {f"c{i}": "neutral" for i in range(5)}

    resp = await client.post(
        "/cluster",
        json={
            "items": items,
            "per_item_keywords": per_item_keywords,
            "per_item_sentiment": per_item_sentiment,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "clusters" in data
    assert len(data["clusters"]) >= 1


@pytest.mark.anyio
async def test_cluster_empty(client: AsyncClient):
    """POST /cluster with empty items returns empty clusters."""
    resp = await client.post(
        "/cluster",
        json={
            "items": [],
            "per_item_keywords": {},
            "per_item_sentiment": {},
        },
    )
    assert resp.status_code == 200
    assert resp.json()["clusters"] == []
