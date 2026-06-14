"""复用现有检索能力执行独立召回调试。"""

import time

from app.core.config import settings
from app.services.reranker_service import RerankerService
from app.services.search_service import (
    embed_question,
    get_vector_store,
    normalize_source
)


def _format_result(item: dict, default_rank: int) -> dict:
    source = normalize_source(item)
    baseline_rank = item.get("baseline_rank") or default_rank
    rerank_rank = item.get("rerank_rank")
    return {
        "rank": rerank_rank or baseline_rank,
        "baseline_rank": baseline_rank,
        "rerank_rank": rerank_rank,
        "score": source.get("score"),
        "hybrid_score": item.get("hybrid_score"),
        "vector_score": item.get("vector_score"),
        "keyword_score": item.get("keyword_score"),
        "rerank_score": item.get("rerank_score"),
        "rerank_provider": item.get("rerank_provider"),
        "rerank_model": item.get("rerank_model"),
        **source
    }


def run_retrieval_test(
    query: str,
    top_k: int,
    use_rerank: bool,
    top_n: int = None
) -> dict:
    started_at = time.perf_counter()
    candidate_top_n = max(top_k, top_n or settings.RERANK_TOP_N)
    query_vector = embed_question(query)
    candidates = get_vector_store().hybrid_search(
        query_text=query,
        query_vector=query_vector,
        top_k=candidate_top_n
    )
    retrieval_latency_ms = (time.perf_counter() - started_at) * 1000

    reranker = RerankerService()
    rerank_result = reranker.rerank_chunks(
        query=query,
        chunks=candidates,
        top_k=top_k,
        use_rerank=use_rerank
    )

    baseline_results = [
        _format_result(
            {**item, "baseline_rank": rank},
            rank
        )
        for rank, item in enumerate(candidates[:top_k], start=1)
    ]
    rerank_results = [
        _format_result(item, rank)
        for rank, item in enumerate(rerank_result.results, start=1)
    ] if use_rerank else []
    results = rerank_results if use_rerank else baseline_results

    latency_ms = (time.perf_counter() - started_at) * 1000
    return {
        "query": query,
        "top_k": top_k,
        "top_n": candidate_top_n,
        "retrieval_mode": "Hybrid",
        "rerank_requested": use_rerank,
        "rerank_status": rerank_result.status,
        "rerank_provider": rerank_result.provider,
        "rerank_model": rerank_result.model,
        "rerank_message": rerank_result.message,
        "rerank_error": rerank_result.error,
        "retrieval_latency_ms": round(retrieval_latency_ms, 2),
        "rerank_latency_ms": rerank_result.latency_ms,
        "latency_ms": round(latency_ms, 2),
        "baseline_results": baseline_results,
        "rerank_results": rerank_results,
        "results": results
    }
