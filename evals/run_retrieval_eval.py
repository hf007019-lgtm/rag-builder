"""运行 baseline 与可选 rerank 的检索评测。"""

import argparse
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from eval_utils import (
    DEFAULT_CASES_PATH,
    ExistingRagServiceAdapter,
    aggregate_ranking,
    describe_case_set,
    evaluate_ranking,
    inspect_knowledge_base,
    load_cases,
    save_report_section
)


def parse_args():
    parser = argparse.ArgumentParser(description="运行 RAG 检索评测")
    parser.add_argument(
        "--cases",
        "--case-file",
        dest="cases",
        type=Path,
        default=DEFAULT_CASES_PATH,
        help="评测用例 JSON 文件"
    )
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--top-n", type=int, default=30)

    rerank_group = parser.add_mutually_exclusive_group()
    rerank_group.add_argument(
        "--use-rerank",
        dest="use_rerank",
        action="store_true",
        help="显式调用 DashScope qwen3-rerank"
    )
    rerank_group.add_argument(
        "--no-rerank",
        dest="use_rerank",
        action="store_false",
        help="显式禁用 rerank"
    )
    parser.set_defaults(use_rerank=None)
    return parser.parse_args()


def _empty_section(
    cases: List[Dict[str, Any]],
    top_k: int,
    top_n: int,
    status: str,
    message: str,
    case_set: Dict[str, str]
) -> Dict[str, Any]:
    empty_metrics = aggregate_ranking([])
    return {
        **case_set,
        "status": status,
        "case_count": len(cases),
        "top_k": top_k,
        "top_n": top_n,
        "baseline": empty_metrics,
        "rerank": empty_metrics,
        "rerank_enabled": False,
        "rerank_status": "not_run",
        "rerank_provider": "dashscope",
        "rerank_model": "qwen3-rerank",
        "delta_hit_rate": None,
        "delta_mrr": None,
        "average_latency_ms": None,
        "average_rerank_latency_ms": None,
        "message": message,
        "failures": [],
        "notes": [
            "当前没有可评测 chunk；上传并完成解析后重新运行评测脚本。"
        ]
    }


def run_evaluation(
    cases_path: Path,
    top_k: int,
    top_n: int,
    use_rerank: Optional[bool]
) -> Dict[str, Any]:
    cases = load_cases(cases_path)
    case_set = describe_case_set(cases_path)
    top_k = max(1, top_k)
    top_n = max(top_k, top_n)
    knowledge_base = inspect_knowledge_base()

    if knowledge_base["status"] != "ready":
        return _empty_section(
            cases=cases,
            top_k=top_k,
            top_n=top_n,
            status=knowledge_base["status"],
            message=knowledge_base["message"],
            case_set=case_set
        )

    try:
        from app.services.reranker_service import RerankerService

        adapter = ExistingRagServiceAdapter()
        reranker = RerankerService()
    except Exception as exc:
        return _empty_section(
            cases=cases,
            top_k=top_k,
            top_n=top_n,
            status="unavailable",
            message=(
                f"评测依赖初始化失败：{type(exc).__name__}: {exc}"
            ),
            case_set=case_set
        )

    baseline_case_metrics = []
    rerank_case_metrics = []
    latencies = []
    rerank_latencies = []
    rerank_statuses = []
    rerank_messages = []
    failures = []
    details = []
    error_count = 0

    for case in cases:
        if (
            case.get("unanswerable")
            or case.get("should_use_retrieval") is False
        ):
            details.append({
                "case_id": case["id"],
                "skipped": True,
                "reason": "该用例不参与正向检索指标"
            })
            continue

        started_at = time.perf_counter()
        try:
            baseline_pool = adapter.retrieve(case["query"], top_n)
        except Exception as exc:
            error_count += 1
            failures.append({
                "stage": "retrieval",
                "case_id": case["id"],
                "query": case["query"],
                "failure_reason": (
                    f"检索调用失败：{type(exc).__name__}: {exc}"
                )
            })
            continue
        finally:
            elapsed_ms = (time.perf_counter() - started_at) * 1000
            latencies.append(elapsed_ms)

        baseline_metrics = evaluate_ranking(
            case,
            baseline_pool,
            top_k
        )
        baseline_case_metrics.append(baseline_metrics)

        rerank_result = reranker.rerank_chunks(
            query=case["query"],
            chunks=baseline_pool,
            top_k=top_k,
            use_rerank=use_rerank
        )
        rerank_statuses.append(rerank_result.status)
        rerank_messages.append(rerank_result.message)
        if rerank_result.latency_ms is not None:
            rerank_latencies.append(rerank_result.latency_ms)

        rerank_metrics = None
        if rerank_result.status == "enabled":
            rerank_metrics = evaluate_ranking(
                case,
                rerank_result.results,
                top_k
            )
            rerank_case_metrics.append(rerank_metrics)

        failure_reasons = []
        if baseline_metrics.get("eligible") and not baseline_metrics["hit"]:
            failure_reasons.append("baseline 未命中预期 chunk/文件名/关键词/doc")
        if (
            rerank_metrics
            and rerank_metrics.get("eligible")
            and not rerank_metrics["hit"]
        ):
            failure_reasons.append("rerank 未命中预期 chunk/文件名/关键词/doc")
        if failure_reasons:
            failures.append({
                "stage": "retrieval",
                "case_id": case["id"],
                "query": case["query"],
                "failure_reason": "；".join(failure_reasons)
            })

        details.append({
            "case_id": case["id"],
            "query": case["query"],
            "baseline": baseline_metrics,
            "rerank": rerank_metrics,
            "retrieval_latency_ms": round(elapsed_ms, 2),
            "rerank_latency_ms": rerank_result.latency_ms,
            "rerank_status": rerank_result.status
        })

    baseline_summary = aggregate_ranking(baseline_case_metrics)
    rerank_summary = aggregate_ranking(rerank_case_metrics)
    if "fallback" in rerank_statuses:
        rerank_status = "fallback"
    elif rerank_statuses and all(
        status == "enabled" for status in rerank_statuses
    ):
        rerank_status = "enabled"
    else:
        rerank_status = "disabled"

    rerank_enabled = (
        rerank_status == "enabled"
        and rerank_summary["evaluated_case_count"] > 0
    )
    delta_hit_rate = None
    delta_mrr = None

    if rerank_enabled:
        delta_hit_rate = (
            rerank_summary["hit_rate_at_k"]
            - baseline_summary["hit_rate_at_k"]
        )
        delta_mrr = rerank_summary["mrr"] - baseline_summary["mrr"]
    else:
        rerank_summary = aggregate_ranking([])

    notes = [
        "示例 case 默认使用 expected_file_name_keywords 和 expected_keywords 弱评测；有真实 chunk 后优先填写 expected_chunk_ids。"
    ]
    if not rerank_enabled:
        notes.append(
            "Rerank 未启用或调用失败，本次仅统计 baseline。"
        )

    message = (
        "Rerank 调用失败，已回退到原始检索排序。"
        if rerank_status == "fallback"
        else rerank_messages[-1]
        if rerank_messages
        else reranker.last_message
    )

    return {
        **case_set,
        "status": "partial" if error_count else "completed",
        "case_count": len(cases),
        "knowledge_base_chunk_count": knowledge_base["chunk_count"],
        "top_k": top_k,
        "top_n": top_n,
        "baseline": baseline_summary,
        "rerank": rerank_summary,
        "rerank_enabled": rerank_enabled,
        "rerank_status": rerank_status,
        "rerank_provider": reranker.provider,
        "rerank_model": reranker.model_name,
        "baseline_hit_rate_at_k": baseline_summary["hit_rate_at_k"],
        "rerank_hit_rate_at_k": (
            rerank_summary["hit_rate_at_k"] if rerank_enabled else None
        ),
        "baseline_mrr": baseline_summary["mrr"],
        "rerank_mrr": rerank_summary["mrr"] if rerank_enabled else None,
        "delta_hit_rate": delta_hit_rate,
        "delta_mrr": delta_mrr,
        "average_latency_ms": (
            sum(latencies) / len(latencies) if latencies else None
        ),
        "average_rerank_latency_ms": (
            sum(rerank_latencies) / len(rerank_latencies)
            if rerank_latencies else None
        ),
        "message": message,
        "failures": failures,
        "notes": notes,
        "details": details
    }


def main() -> int:
    args = parse_args()
    result = run_evaluation(
        cases_path=args.cases,
        top_k=args.top_k,
        top_n=args.top_n,
        use_rerank=args.use_rerank
    )
    save_report_section("retrieval", result)

    print("RAG 检索评测完成")
    print(f"状态：{result['status']}")
    print(f"说明：{result['message']}")
    print("报告：evals/eval_report.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
