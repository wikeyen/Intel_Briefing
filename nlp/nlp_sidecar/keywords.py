# ABOUTME: Keyword extraction using YAKE (statistical) and KeyBERT (semantic).
# ABOUTME: YAKE handles both languages natively; KeyBERT uses multilingual sentence embeddings.
from dataclasses import dataclass

import yake
from keybert import KeyBERT

from nlp_sidecar.config import (
    EMBEDDING_MODEL,
    MAX_KEYWORDS_PER_ITEM,
    YAKE_DEDUP_THRESHOLD,
    YAKE_MAX_NGRAM,
)
from nlp_sidecar.models import Keyword


@dataclass
class KeywordModels:
    keybert: KeyBERT
    yake_en: yake.KeywordExtractor
    yake_zh: yake.KeywordExtractor


def load_keyword_models() -> KeywordModels:
    keybert = KeyBERT(model=EMBEDDING_MODEL)
    yake_en = yake.KeywordExtractor(
        lan="en",
        n=YAKE_MAX_NGRAM,
        dedupLim=YAKE_DEDUP_THRESHOLD,
        top=MAX_KEYWORDS_PER_ITEM,
    )
    yake_zh = yake.KeywordExtractor(
        lan="zh",
        n=YAKE_MAX_NGRAM,
        dedupLim=YAKE_DEDUP_THRESHOLD,
        top=MAX_KEYWORDS_PER_ITEM,
    )
    return KeywordModels(keybert=keybert, yake_en=yake_en, yake_zh=yake_zh)


def extract_keywords(
    text: str, lang: str, models: KeywordModels
) -> list[Keyword]:
    if not text or len(text.strip()) < 3:
        return []

    # YAKE: statistical, fast
    yake_ext = models.yake_zh if lang == "zh" else models.yake_en
    yake_results = yake_ext.extract_keywords(text)
    if yake_results:
        max_score = max(s for _, s in yake_results) or 1.0
        yake_kws = {
            kw.lower(): 1.0 - (score / max_score)
            for kw, score in yake_results
        }
    else:
        yake_kws = {}

    # KeyBERT: semantic
    try:
        kb_results = models.keybert.extract_keywords(
            text,
            keyphrase_ngram_range=(1, YAKE_MAX_NGRAM),
            top_n=MAX_KEYWORDS_PER_ITEM,
        )
        kb_kws = {kw.lower(): score for kw, score in kb_results}
    except Exception:
        kb_kws = {}

    # Merge: average scores where both extractors found the same keyword
    all_keys = set(yake_kws) | set(kb_kws)
    merged = []
    for key in all_keys:
        scores = [
            v
            for v in [yake_kws.get(key), kb_kws.get(key)]
            if v is not None
        ]
        avg = sum(scores) / len(scores)
        merged.append(
            Keyword(text=key, weight=round(min(max(avg, 0.0), 1.0), 3))
        )

    merged.sort(key=lambda k: k.weight, reverse=True)
    return merged[:MAX_KEYWORDS_PER_ITEM]
