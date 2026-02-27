# ABOUTME: Semantic clustering of items using sentence-transformers + HDBSCAN.
# ABOUTME: Groups related items by embedding similarity, labels clusters from keywords.
import numpy as np
from collections import Counter

from sentence_transformers import SentenceTransformer
import hdbscan

from nlp_sidecar.config import (
    EMBEDDING_MODEL,
    MAX_CLUSTERS,
    MIN_CLUSTER_SIZE,
    MAX_CLUSTER_KEYWORDS,
)
from nlp_sidecar.models import AnalyzeItem, Keyword, ClusterSummary


def load_embedding_model() -> SentenceTransformer:
    """Load the multilingual sentence-transformer embedding model."""
    return SentenceTransformer(EMBEDDING_MODEL)


def cluster_items(
    items: list[AnalyzeItem],
    per_item_keywords: dict[str, list[Keyword]],
    model: SentenceTransformer,
    per_item_sentiment: dict[str, str] | None = None,
) -> list[ClusterSummary]:
    """Cluster items by embedding similarity and return labelled cluster summaries."""
    if len(items) < 2:
        return [
            ClusterSummary(
                id=0,
                label=items[0].title[:50] if items else "empty",
                item_ids=[item.id for item in items],
                top_keywords=(
                    per_item_keywords.get(items[0].id, [])[:MAX_CLUSTER_KEYWORDS]
                    if items
                    else []
                ),
                sentiment_distribution={},
                representative_items=[items[0].id] if items else [],
            )
        ] if items else []

    texts = [f"{item.title} {item.abstract or ''}".strip() for item in items]
    embeddings = model.encode(
        texts, show_progress_bar=False, normalize_embeddings=True
    )

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min(MIN_CLUSTER_SIZE, max(2, len(items) // 5)),
        metric="euclidean",
        cluster_selection_method="eom",
    )
    labels = clusterer.fit_predict(embeddings)

    # Separate real clusters from noise points
    cluster_map: dict[int, list[int]] = {}
    noise_indices: list[int] = []
    for idx, label in enumerate(labels):
        if label == -1:
            noise_indices.append(idx)
        else:
            cluster_map.setdefault(label, []).append(idx)

    # Assign noise points to nearest cluster, or create single cluster if none exist
    if noise_indices and cluster_map:
        centroids = {}
        for cid, indices in cluster_map.items():
            centroids[cid] = np.mean(embeddings[indices], axis=0)
        for idx in noise_indices:
            distances = {
                cid: np.linalg.norm(embeddings[idx] - cent)
                for cid, cent in centroids.items()
            }
            nearest = min(distances, key=distances.get)
            cluster_map[nearest].append(idx)
    elif not cluster_map:
        # All points are noise — put everything in one cluster
        cluster_map[0] = list(range(len(items)))

    results = []
    for cid, indices in sorted(cluster_map.items()):
        cluster_ids = [items[i].id for i in indices]

        # Aggregate keywords across cluster items
        kw_counter: Counter = Counter()
        for item_id in cluster_ids:
            for kw in per_item_keywords.get(item_id, []):
                kw_counter[kw.text] += kw.weight
        top_kws = [
            Keyword(text=t, weight=round(min(w / len(cluster_ids), 1.0), 3))
            for t, w in kw_counter.most_common(MAX_CLUSTER_KEYWORDS)
        ]

        # Compute sentiment distribution if provided
        sent_dist: dict[str, float] = {"positive": 0, "neutral": 0, "negative": 0}
        if per_item_sentiment:
            for item_id in cluster_ids:
                sent_label = per_item_sentiment.get(item_id, "neutral")
                sent_dist[sent_label] = sent_dist.get(sent_label, 0) + 1
            total = sum(sent_dist.values()) or 1
            sent_dist = {k: round(v / total, 3) for k, v in sent_dist.items()}

        # Pick representative items closest to centroid
        centroid = np.mean(embeddings[indices], axis=0)
        distances = [
            (i, np.linalg.norm(embeddings[i] - centroid)) for i in indices
        ]
        distances.sort(key=lambda x: x[1])
        rep_ids = [items[i].id for i, _ in distances[:5]]

        # Label from top keywords, fallback to first item title
        label_text = (
            ", ".join(kw.text for kw in top_kws[:3])
            if top_kws
            else items[indices[0]].title[:50]
        )

        results.append(
            ClusterSummary(
                id=cid,
                label=label_text,
                item_ids=cluster_ids,
                top_keywords=top_kws,
                sentiment_distribution=sent_dist,
                representative_items=rep_ids,
            )
        )

    # Cap at MAX_CLUSTERS, keeping the largest
    if len(results) > MAX_CLUSTERS:
        results.sort(key=lambda c: len(c.item_ids), reverse=True)
        results = results[:MAX_CLUSTERS]

    return results
