"""运行答案、引用来源和拒答行为评测。"""

import argparse
import time
from pathlib import Path
from typing import Any, Dict, List

from eval_utils import (
    DEFAULT_CASES_PATH,
    ExistingRagServiceAdapter,
    claim_is_covered,
    count_unsupported_claims,
    describe_case_set,
    evaluate_citation_coverage,
    inspect_knowledge_base,
    is_abstention,
    load_cases,
    save_report_section
)


def parse_args():
    parser = argparse.ArgumentParser(description="运行 RAG 答案引用评测")
    parser.add_argument(
        "--cases",
        "--case-file",
        dest="cases",
        type=Path,
        default=DEFAULT_CASES_PATH,
        help="评测用例 JSON 文件"
    )
    return parser.parse_args()


def _empty_section(
    cases: List[Dict[str, Any]],
    status: str,
    message: str,
    case_set: Dict[str, str]
) -> Dict[str, Any]:
    return {
        **case_set,
        "status": status,
        "case_count": len(cases),
        "answer_case_count": 0,
        "citation_field_mode": "N/A",
        "citation_coverage_rate": None,
        "source_compat_coverage_rate": None,
        "expected_claim_hit_rate": None,
        "unsupported_claim_count": 0,
        "unanswerable_abstention_rate": None,
        "average_latency_ms": None,
        "message": message,
        "failures": [],
        "notes": [
            "当前没有可评测 chunk；上传并完成解析后重新运行答案评测。"
        ]
    }


def run_evaluation(cases_path: Path) -> Dict[str, Any]:
    cases = load_cases(cases_path)
    case_set = describe_case_set(cases_path)
    knowledge_base = inspect_knowledge_base()

    if knowledge_base["status"] != "ready":
        return _empty_section(
            cases=cases,
            status=knowledge_base["status"],
            message=knowledge_base["message"],
            case_set=case_set
        )

    adapter = ExistingRagServiceAdapter()
    latencies = []
    failures = []
    details = []
    citation_results = []
    source_compat_results = []
    claim_hit_count = 0
    expected_claim_count = 0
    unsupported_claim_count = 0
    unanswerable_count = 0
    abstention_count = 0
    answer_case_count = 0
    citation_field_modes = set()
    error_count = 0

    for case in cases:
        started_at = time.perf_counter()
        try:
            response = adapter.answer(case["query"])
        except Exception as exc:
            error_count += 1
            failures.append({
                "stage": "answer",
                "case_id": case["id"],
                "query": case["query"],
                "failure_reason": (
                    f"问答调用失败：{type(exc).__name__}: {exc}"
                )
            })
            continue
        finally:
            latencies.append(
                (time.perf_counter() - started_at) * 1000
            )

        answer_case_count += 1
        answer = str(response.get("answer", ""))
        answer_type = response.get("answer_type")
        used_retrieval = response.get("used_retrieval")

        if isinstance(response.get("citations"), list):
            citations = response["citations"]
            citation_field_mode = "citations"
        elif isinstance(response.get("sources"), list):
            citations = response["sources"]
            citation_field_mode = "sources_compat"
        else:
            citations = []
            citation_field_mode = "missing"

        citation_field_modes.add(citation_field_mode)
        citation_result = evaluate_citation_coverage(case, citations)
        if citation_result["eligible"] and citation_field_mode == "citations":
            citation_results.append(citation_result)
        elif (
            citation_result["eligible"]
            and citation_field_mode == "sources_compat"
        ):
            source_compat_results.append(citation_result)

        case_claims = [
            str(claim)
            for claim in case.get("expected_claims", [])
            if str(claim).strip()
        ]
        claim_hits = [
            claim
            for claim in case_claims
            if claim_is_covered(answer, claim)
        ]
        expected_claim_count += len(case_claims)
        claim_hit_count += len(claim_hits)

        case_unsupported_count = (
            0
            if used_retrieval is False
            else count_unsupported_claims(answer, citations)
        )
        unsupported_claim_count += case_unsupported_count

        failure_reasons = []
        expected_answer_type = case.get("expected_answer_type")
        if (
            expected_answer_type
            and answer_type != expected_answer_type
        ):
            failure_reasons.append(
                f"answer_type 期望 {expected_answer_type}，实际 {answer_type}"
            )

        if (
            "should_use_retrieval" in case
            and used_retrieval is not case["should_use_retrieval"]
        ):
            failure_reasons.append(
                "used_retrieval 与预期不一致"
            )

        expected_citations_count = case.get("expected_citations_count")
        if (
            expected_citations_count is not None
            and len(citations) != expected_citations_count
        ):
            failure_reasons.append(
                f"引用数量期望 {expected_citations_count}，实际 {len(citations)}"
            )

        forbidden_claims = [
            str(claim)
            for claim in case.get("forbidden_claims", [])
            if str(claim).strip()
        ]
        matched_forbidden_claims = [
            claim for claim in forbidden_claims if claim in answer
        ]
        if matched_forbidden_claims:
            failure_reasons.append(
                "回答包含禁止话术：" + "、".join(matched_forbidden_claims)
            )

        if (
            citation_result["eligible"]
            and citation_field_mode != "missing"
            and not citation_result["covered"]
        ):
            failure_reasons.append("引用来源未命中预期目标")
        if len(claim_hits) < len(case_claims):
            failure_reasons.append(
                f"expected claims 命中 {len(claim_hits)}/{len(case_claims)}"
            )
        if case_unsupported_count:
            failure_reasons.append(
                f"检测到 {case_unsupported_count} 条弱支持回答句"
            )

        abstained = is_abstention(answer)
        if case.get("unanswerable"):
            unanswerable_count += 1
            if abstained:
                abstention_count += 1
            else:
                failure_reasons.append("不可回答用例未明确拒答")
            if citations:
                failure_reasons.append("拒答用例仍返回了引用来源")

        if failure_reasons:
            failures.append({
                "stage": "answer",
                "case_id": case["id"],
                "query": case["query"],
                "failure_reason": "；".join(failure_reasons)
            })

        details.append({
            "case_id": case["id"],
            "query": case["query"],
            "citation_field_mode": citation_field_mode,
            "answer_type": answer_type,
            "used_retrieval": used_retrieval,
            "citations_count": len(citations),
            "citation": citation_result,
            "expected_claim_count": len(case_claims),
            "expected_claim_hit_count": len(claim_hits),
            "unsupported_claim_count": case_unsupported_count,
            "abstained": abstained
        })

    if citation_results:
        citation_coverage_rate = (
            sum(1 for item in citation_results if item["covered"])
            / len(citation_results)
        )
    else:
        citation_coverage_rate = None

    if source_compat_results:
        source_compat_coverage_rate = (
            sum(1 for item in source_compat_results if item["covered"])
            / len(source_compat_results)
        )
    else:
        source_compat_coverage_rate = None

    citation_field_mode = (
        ",".join(sorted(citation_field_modes))
        if citation_field_modes else "N/A"
    )
    notes = [
        "优先评估标准 citations；旧版 sources 仍作为兼容字段支持。",
        "answer_type、used_retrieval 和预期引用数量按用例可选字段校验。",
        "expected claim 使用精确包含和字符二元组召回率进行轻量判断。"
    ]
    if "missing" in citation_field_modes:
        notes.append(
            "部分响应没有 citations/sources，相关用例未计入 citation coverage 分母。"
        )

    return {
        **case_set,
        "status": "partial" if error_count else "completed",
        "case_count": len(cases),
        "answer_case_count": answer_case_count,
        "knowledge_base_chunk_count": knowledge_base["chunk_count"],
        "citation_field_mode": citation_field_mode,
        "citation_coverage_rate": citation_coverage_rate,
        "source_compat_coverage_rate": source_compat_coverage_rate,
        "expected_claim_hit_rate": (
            claim_hit_count / expected_claim_count
            if expected_claim_count else None
        ),
        "unsupported_claim_count": unsupported_claim_count,
        "unanswerable_abstention_rate": (
            abstention_count / unanswerable_count
            if unanswerable_count else None
        ),
        "average_latency_ms": (
            sum(latencies) / len(latencies) if latencies else None
        ),
        "message": (
            "答案、引用与意图行为评测完成"
            if answer_case_count
            else "没有成功完成的答案评测用例"
        ),
        "failures": failures,
        "notes": notes,
        "details": details
    }


def main() -> int:
    args = parse_args()
    result = run_evaluation(args.cases)
    save_report_section("answer", result)

    print("RAG 答案引用评测完成")
    print(f"状态：{result['status']}")
    print(f"说明：{result['message']}")
    print("报告：evals/eval_report.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
