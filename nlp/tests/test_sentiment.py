# ABOUTME: Tests for sentiment analysis — validates multilingual xlm-roberta model.
# ABOUTME: Checks output structure, score ranges, and basic polarity correctness.
import pytest
from nlp_sidecar.sentiment import analyze_sentiment, load_sentiment_model


@pytest.fixture(scope="module")
def model():
    return load_sentiment_model()


def test_positive_english(model):
    result = analyze_sentiment("This is amazing and wonderful news!", "en", model)
    assert result.label == "positive"
    assert result.score > 0.5


def test_negative_english(model):
    result = analyze_sentiment("This is terrible and very concerning", "en", model)
    assert result.label == "negative"
    assert result.score > 0.5


def test_chinese_sentiment(model):
    result = analyze_sentiment("这个产品非常好用，我很喜欢", "zh", model)
    assert result.label in ("positive", "neutral", "negative")
    assert 0.0 <= result.score <= 1.0


def test_empty_input(model):
    result = analyze_sentiment("", "en", model)
    assert result.label == "neutral"
