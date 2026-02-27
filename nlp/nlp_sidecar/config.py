# ABOUTME: Configuration constants for the NLP sidecar — model names, thresholds, ports.
# ABOUTME: All model identifiers are multilingual to support both English and Chinese.

EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
SENTIMENT_MODEL = "cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual"
SPACY_MODELS = {"en": "en_core_web_sm", "zh": "zh_core_web_sm"}

PORT = 8001
MAX_KEYWORDS_PER_ITEM = 8
MAX_CLUSTER_KEYWORDS = 10
MAX_CLUSTERS = 15
MIN_CLUSTER_SIZE = 5
YAKE_MAX_NGRAM = 2
YAKE_DEDUP_THRESHOLD = 0.9
