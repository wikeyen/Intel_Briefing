# ABOUTME: Tests for NER module — validates spaCy entity extraction for EN and CN.
# ABOUTME: Checks that people, orgs, and places are correctly categorized.
import pytest
from nlp_sidecar.entities import extract_entities, load_ner_models


@pytest.fixture(scope="module")
def models():
    return load_ner_models()


def test_english_entities(models):
    result = extract_entities(
        "Elon Musk announced that Tesla will open a factory in Berlin", "en", models
    )
    assert "Elon Musk" in result.people or any("Musk" in p for p in result.people)
    assert "Tesla" in result.orgs
    assert "Berlin" in result.places


def test_chinese_entities(models):
    result = extract_entities("百度公司在北京发布了新产品", "zh", models)
    assert len(result.orgs) > 0 or len(result.places) > 0


def test_empty_input(models):
    result = extract_entities("", "en", models)
    assert result.people == []
    assert result.orgs == []
    assert result.places == []
