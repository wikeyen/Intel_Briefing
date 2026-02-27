# ABOUTME: Tests for keyword extraction module — validates YAKE and KeyBERT on EN/CN inputs.
# ABOUTME: Checks output structure, weight ranges, and multilingual support.
import pytest
from nlp_sidecar.keywords import extract_keywords, load_keyword_models


@pytest.fixture(scope="module")
def models():
    return load_keyword_models()


def test_english_keywords(models):
    result = extract_keywords("OpenAI releases GPT-5 with improved reasoning", "en", models)
    assert len(result) > 0
    assert all(0.0 <= kw.weight <= 1.0 for kw in result)
    texts = [kw.text.lower() for kw in result]
    assert any("openai" in t or "gpt" in t or "reasoning" in t for t in texts)


def test_chinese_keywords(models):
    result = extract_keywords("百度发布新一代人工智能大模型", "zh", models)
    assert len(result) > 0
    assert all(0.0 <= kw.weight <= 1.0 for kw in result)


def test_empty_input(models):
    result = extract_keywords("", "en", models)
    assert result == []


def test_short_input(models):
    result = extract_keywords("AI", "en", models)
    assert isinstance(result, list)
