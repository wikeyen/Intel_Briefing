# ABOUTME: Sentiment analysis using multilingual xlm-roberta model.
# ABOUTME: Returns positive/negative/neutral with confidence score for EN and CN text.
from transformers import pipeline as hf_pipeline, Pipeline
from nlp_sidecar.config import SENTIMENT_MODEL
from nlp_sidecar.models import Sentiment

LABEL_MAP = {"positive": "positive", "negative": "negative", "neutral": "neutral"}


def load_sentiment_model() -> Pipeline:
    return hf_pipeline(
        "sentiment-analysis",
        model=SENTIMENT_MODEL,
        top_k=None,
        truncation=True,
        max_length=512,
    )


def analyze_sentiment(text: str, lang: str, model: Pipeline) -> Sentiment:
    if not text or len(text.strip()) < 2:
        return Sentiment(label="neutral", score=1.0)

    results = model(text[:512])
    if not results or not results[0]:
        return Sentiment(label="neutral", score=1.0)

    scores = {LABEL_MAP.get(r["label"], r["label"]): r["score"] for r in results[0]}
    best_label = max(scores, key=scores.get)
    return Sentiment(label=best_label, score=round(scores[best_label], 3))
