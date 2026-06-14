"""复用现有检索能力执行独立召回调试。"""

import time

from app.services.reranker_service import RerankerService
from app.services.search_service import (
    embed_question,
    get_vector_store,
    normalize_source
)


def run_retrieval_test(
    query: str,
    top_k: int,
    use_rerank: bool
) -> dict:
    started_at = time.perf_counter()
    query_vector = embed_question(query)
    candidates = get_vector_store().hybrid_search(
        query_text=query,
        query_vector=query_vector,
        top_k=top_k
    )

    reranker = RerankerService()
    ranked_results = reranker.rerank(
        query=query,
        candidates=candidates,
        top_k=top_k,
        use_rerank=use_rerank
    )

    results = []
    for rank, item in enumerate(ranked_results, start=1):
        source = normalize_source(item)
        results.append({
            "rank": rank,
            "score": source.get("score"),
            "vector_score": item.get("vector_score"),
            "keyword_score": item.get("keyword_score"),
            "rerank_score": item.get("semantic_score"),
            **source
        })

    latency_ms = (time.perf_counter() - started_at) * 1000
    return {
        "query": query,
        "top_k": top_k,
        "retrieval_mode": "Hybrid",
        "rerank_requested": use_rerank,
        "rerank_status": reranker.last_status,
        "rerank_message": reranker.last_message,
        "latency_ms": round(latency_ms, 2),
        "results": results
    }
