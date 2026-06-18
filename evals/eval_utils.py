"""RAG 离线评测的公共读取、指标和报告工具。"""

import importlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv
from elasticsearch import Elasticsearch


# Windows 默认 GBK 控制台无法输出现有服务日志中的部分符号。
# 只在评测脚本进程内切换为 UTF-8，不影响 FastAPI 和 Worker。
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")


EVALS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = EVALS_DIR.parent
DEFAULT_CASES_PATH = EVALS_DIR / "cases" / "rag_retrieval_cases.json"
REPORT_PATH = EVALS_DIR / "eval_report.md"
RESULTS_PATH = EVALS_DIR / "eval_results.json"
CASE_SET_NAMES = {
    "rag_retrieval_cases.json": "默认 RAG Builder 项目评测集",
    "exam_policy_cases.json": "公务员/事业单位政策评测集",
}

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(PROJECT_ROOT / ".env", override=True)
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"


class ExistingRagServiceAdapter:
    """延迟导入现有 search_service，避免无 ES 时触发长时间初始化。"""

    def __init__(self):
        self._search_service = None

    def _service(self):
        if self._search_service is None:
            self._search_service = importlib.import_module(
                "app.services.search_service"
            )
        return self._search_service

    def retrieve(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        service = self._service()
        query_vector = service.embed_question(query)
        return service.get_vector_store().hybrid_search(
            query_text=query,
            query_vector=query_vector,
            top_k=top_k
        )

    def answer(self, query: str) -> Dict[str, Any]:
        return self._service().ask_question(query)


def describe_case_set(path: Path = DEFAULT_CASES_PATH) -> Dict[str, str]:
    cases_path = Path(path)
    try:
        case_file = cases_path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        case_file = cases_path.as_posix()

    return {
        "case_file": case_file,
        "case_set_name": CASE_SET_NAMES.get(cases_path.name, cases_path.stem)
    }


def load_cases(path: Path = DEFAULT_CASES_PATH) -> List[Dict[str, Any]]:
    """读取并做最小结构校验，防止错误 case 静默进入报告。"""
    with path.open("r", encoding="utf-8") as file:
        cases = json.load(file)

    if not isinstance(cases, list):
        raise ValueError("评测用例文件必须是 JSON 数组")

    required_fields = {"id", "query", "unanswerable"}
    normalized_cases = []
    for index, case in enumerate(cases, start=1):
        if not isinstance(case, dict):
            raise ValueError(f"第 {index} 条评测用例不是 JSON 对象")

        case = dict(case)
        if "id" not in case and case.get("case_id"):
            case["id"] = str(case["case_id"])
        if "query" not in case and case.get("question"):
            case["query"] = str(case["question"])

        missing_fields = required_fields - set(case)
        if missing_fields:
            missing_text = ", ".join(sorted(missing_fields))
            raise ValueError(
                f"评测用例 {index} 缺少字段：{missing_text}"
            )
        normalized_cases.append(case)

    return normalized_cases


def inspect_knowledge_base(timeout_seconds: float = 2.0) -> Dict[str, Any]:
    """快速检查 ES 和 chunk 数据，避免评测脚本在无数据环境中崩溃。"""
    es_url = os.getenv("ES_URL", "http://127.0.0.1:9200")
    index_name = os.getenv("ES_INDEX_NAME", "rag_chunks")
    client = Elasticsearch(
        es_url,
        headers={"Connection": "close"},
        request_timeout=timeout_seconds
    )

    try:
        if not client.ping():
            return {
                "status": "unavailable",
                "chunk_count": 0,
                "message": f"Elasticsearch 不可用：{es_url}"
            }

        if not client.indices.exists(index=index_name):
            return {
                "status": "no_data",
                "chunk_count": 0,
                "message": f"Elasticsearch 索引不存在：{index_name}"
            }

        count_response = client.count(index=index_name)
        chunk_count = int(count_response.get("count", 0))
        if chunk_count == 0:
            return {
                "status": "no_data",
                "chunk_count": 0,
                "message": f"Elasticsearch 索引 {index_name} 中没有 chunk"
            }

        return {
            "status": "ready",
            "chunk_count": chunk_count,
            "message": f"发现 {chunk_count} 个可评测 chunk"
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "chunk_count": 0,
            "message": (
                f"Elasticsearch 检查失败：{type(exc).__name__}: {exc}"
            )
        }
    finally:
        client.close()


def _string_set(values: Iterable[Any]) -> set:
    return {
        str(value).strip()
        for value in values
        if value is not None and str(value).strip()
    }


def evaluate_ranking(
    case: Dict[str, Any],
    results: List[Dict[str, Any]],
    top_k: int
) -> Dict[str, Any]:
    """按 chunk_id、关键词、doc_id 的优先级评估一组排序结果。"""
    top_results = results[:top_k]
    expected_chunk_ids = _string_set(case.get("expected_chunk_ids", []))
    expected_keywords = [
        str(value).strip().lower()
        for value in case.get("expected_keywords", [])
        if str(value).strip()
    ]
    expected_doc_ids = _string_set(case.get("expected_doc_ids", []))

    if expected_chunk_ids:
        mode = "chunk_id"
        found_items = {
            str(item.get("chunk_id", "")).strip()
            for item in top_results
            if str(item.get("chunk_id", "")).strip() in expected_chunk_ids
        }
        relevance = [
            str(item.get("chunk_id", "")).strip() in expected_chunk_ids
            for item in top_results
        ]
        expected_count = len(expected_chunk_ids)
    elif expected_keywords:
        mode = "keyword"
        found_items = set()
        relevance = []

        for item in top_results:
            chunk_text = str(item.get("chunk_text", "")).lower()
            matched = {
                keyword
                for keyword in expected_keywords
                if keyword in chunk_text
            }
            found_items.update(matched)
            relevance.append(bool(matched))

        expected_count = len(expected_keywords)
    elif expected_doc_ids:
        mode = "doc_id"
        found_items = {
            str(item.get("doc_id", "")).strip()
            for item in top_results
            if str(item.get("doc_id", "")).strip() in expected_doc_ids
        }
        relevance = [
            str(item.get("doc_id", "")).strip() in expected_doc_ids
            for item in top_results
        ]
        expected_count = len(expected_doc_ids)
    else:
        return {
            "eligible": False,
            "mode": "none",
            "hit": None,
            "recall": None,
            "precision": None,
            "mrr": None,
            "missing_expected_count": 0
        }

    first_relevant_rank = next(
        (
            rank
            for rank, is_relevant in enumerate(relevance, start=1)
            if is_relevant
        ),
        None
    )

    return {
        "eligible": True,
        "mode": mode,
        "hit": 1.0 if found_items else 0.0,
        "recall": len(found_items) / expected_count,
        "precision": sum(relevance) / top_k,
        "mrr": 1.0 / first_relevant_rank if first_relevant_rank else 0.0,
        "missing_expected_count": expected_count - len(found_items)
    }


def aggregate_ranking(metrics: List[Dict[str, Any]]) -> Dict[str, Any]:
    eligible = [item for item in metrics if item.get("eligible")]
    if not eligible:
        return {
            "evaluated_case_count": 0,
            "hit_rate_at_k": None,
            "recall_at_k": None,
            "precision_at_k": None,
            "mrr": None,
            "missing_expected_count": 0
        }

    count = len(eligible)
    return {
        "evaluated_case_count": count,
        "hit_rate_at_k": sum(item["hit"] for item in eligible) / count,
        "recall_at_k": sum(item["recall"] for item in eligible) / count,
        "precision_at_k": sum(item["precision"] for item in eligible) / count,
        "mrr": sum(item["mrr"] for item in eligible) / count,
        "missing_expected_count": sum(
            item["missing_expected_count"] for item in eligible
        )
    }


def normalize_text(text: Any) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", str(text).lower())


def _character_bigrams(text: str) -> set:
    normalized = normalize_text(text)
    if len(normalized) < 2:
        return {normalized} if normalized else set()
    return {
        normalized[index:index + 2]
        for index in range(len(normalized) - 1)
    }


def claim_is_covered(answer: str, claim: str) -> bool:
    """用精确包含和字符二元组召回率做轻量 claim 覆盖判断。"""
    normalized_answer = normalize_text(answer)
    normalized_claim = normalize_text(claim)

    if not normalized_claim:
        return False
    if normalized_claim in normalized_answer:
        return True

    claim_bigrams = _character_bigrams(normalized_claim)
    if not claim_bigrams:
        return False

    answer_bigrams = _character_bigrams(normalized_answer)
    overlap = len(claim_bigrams & answer_bigrams) / len(claim_bigrams)
    return overlap >= 0.6


def evaluate_citation_coverage(
    case: Dict[str, Any],
    citations: List[Dict[str, Any]]
) -> Dict[str, Any]:
    expected_chunk_ids = _string_set(case.get("expected_chunk_ids", []))
    expected_doc_ids = _string_set(case.get("expected_doc_ids", []))
    expected_keywords = [
        str(value).strip().lower()
        for value in case.get("expected_keywords", [])
        if str(value).strip()
    ]

    if expected_chunk_ids:
        matched = any(
            str(item.get("chunk_id", "")).strip() in expected_chunk_ids
            for item in citations
        )
        return {"eligible": True, "covered": matched, "mode": "chunk_id"}

    if expected_doc_ids:
        matched = any(
            str(item.get("doc_id", "")).strip() in expected_doc_ids
            for item in citations
        )
        return {"eligible": True, "covered": matched, "mode": "doc_id"}

    if expected_keywords:
        citation_text = "\n".join(
            str(item.get("chunk_text") or item.get("text_preview") or "")
            for item in citations
        ).lower()
        matched = any(keyword in citation_text for keyword in expected_keywords)
        return {"eligible": True, "covered": matched, "mode": "keyword"}

    return {"eligible": False, "covered": None, "mode": "none"}


ABSTENTION_PHRASES = (
    "没有找到足够依据",
    "没有足够依据",
    "无法确定",
    "无法回答",
    "没有足够信息"
)


def is_abstention(answer: str) -> bool:
    normalized_answer = str(answer).strip()
    return any(phrase in normalized_answer for phrase in ABSTENTION_PHRASES)


def count_unsupported_claims(
    answer: str,
    citations: List[Dict[str, Any]]
) -> int:
    """
    统计与引用原文缺少词面重叠的回答句。

    这是无需额外模型的弱评测指标，只用于发现高风险用例，不等同于事实裁判。
    """
    if not answer or is_abstention(answer):
        return 0

    source_text = "\n".join(
        str(item.get("chunk_text") or item.get("text_preview") or "")
        for item in citations
    )
    source_bigrams = _character_bigrams(source_text)
    unsupported_count = 0

    for sentence in re.split(r"[。！？!?；;\n]+", answer):
        normalized_sentence = normalize_text(sentence)
        if len(normalized_sentence) < 8:
            continue
        if normalized_sentence in {"根据知识库资料可知", "根据知识库资料"}:
            continue

        sentence_bigrams = _character_bigrams(normalized_sentence)
        if not sentence_bigrams:
            continue

        overlap = (
            len(sentence_bigrams & source_bigrams) / len(sentence_bigrams)
            if source_bigrams else 0.0
        )
        if overlap < 0.2:
            unsupported_count += 1

    return unsupported_count


def _format_rate(value: Optional[float]) -> str:
    return "N/A" if value is None else f"{value:.2%}"


def _format_number(value: Optional[float], digits: int = 4) -> str:
    return "N/A" if value is None else f"{value:.{digits}f}"


def _escape_table_text(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def load_results_state() -> Dict[str, Any]:
    if not RESULTS_PATH.exists():
        return {}

    try:
        with RESULTS_PATH.open("r", encoding="utf-8") as file:
            state = json.load(file)
        return state if isinstance(state, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_report_section(section: str, data: Dict[str, Any]) -> None:
    state = load_results_state()
    state[section] = data
    if data.get("case_set_name"):
        state["case_set_name"] = data["case_set_name"]
    if data.get("case_file"):
        state["case_file"] = data["case_file"]
    state["generated_at"] = datetime.now().astimezone().isoformat(
        timespec="seconds"
    )

    with RESULTS_PATH.open("w", encoding="utf-8") as file:
        json.dump(state, file, ensure_ascii=False, indent=2)
        file.write("\n")

    REPORT_PATH.write_text(render_report(state), encoding="utf-8")


def render_report(state: Dict[str, Any]) -> str:
    retrieval = state.get("retrieval", {})
    answer = state.get("answer", {})
    generated_at = state.get("generated_at", "尚未运行")
    baseline = retrieval.get("baseline", {})
    rerank = retrieval.get("rerank", {})
    case_set_name = (
        state.get("case_set_name")
        or retrieval.get("case_set_name")
        or answer.get("case_set_name")
        or CASE_SET_NAMES[DEFAULT_CASES_PATH.name]
    )
    case_file = (
        state.get("case_file")
        or retrieval.get("case_file")
        or answer.get("case_file")
        or describe_case_set(DEFAULT_CASES_PATH)["case_file"]
    )

    lines = [
        "# RAG Builder 评测报告",
        "",
        "## 评测时间",
        "",
        f"- 最近更新时间：{generated_at}",
        "",
        "## 评测集",
        "",
        f"- 当前评测集：{case_set_name}",
        f"- 用例文件：{case_file}",
        "",
        "## 检索评测",
        "",
        f"- 运行状态：{retrieval.get('status', '尚未运行')}",
        f"- 用例数：{retrieval.get('case_count', 0)}",
        f"- 实际评测用例数：{baseline.get('evaluated_case_count', 0)}",
        f"- top_k：{retrieval.get('top_k', 'N/A')}",
        f"- baseline hit_rate@k：{_format_rate(baseline.get('hit_rate_at_k'))}",
        f"- baseline recall@k：{_format_rate(baseline.get('recall_at_k'))}",
        f"- baseline precision@k：{_format_rate(baseline.get('precision_at_k'))}",
        f"- baseline MRR：{_format_number(baseline.get('mrr'))}",
        f"- missing_expected_count：{baseline.get('missing_expected_count', 'N/A')}",
        f"- average_latency_ms：{_format_number(retrieval.get('average_latency_ms'), 2)}",
        f"- rerank enabled：{retrieval.get('rerank_enabled', False)}",
        f"- rerank status：{retrieval.get('rerank_status', '尚未运行')}",
        f"- rerank provider：{retrieval.get('rerank_provider', 'N/A')}",
        f"- rerank model：{retrieval.get('rerank_model', 'N/A')}",
        f"- average_rerank_latency_ms：{_format_number(retrieval.get('average_rerank_latency_ms'), 2)}",
        f"- rerank hit_rate@k：{_format_rate(rerank.get('hit_rate_at_k'))}",
        f"- rerank MRR：{_format_number(rerank.get('mrr'))}",
        f"- delta hit_rate：{_format_rate(retrieval.get('delta_hit_rate'))}",
        f"- delta MRR：{_format_number(retrieval.get('delta_mrr'))}",
        f"- 说明：{retrieval.get('message', '尚未运行检索评测。')}",
        "",
        "## 答案引用评测",
        "",
        f"- 运行状态：{answer.get('status', '尚未运行')}",
        f"- 用例数：{answer.get('answer_case_count', 0)}",
        f"- citation 字段模式：{answer.get('citation_field_mode', 'N/A')}",
        f"- citation coverage：{_format_rate(answer.get('citation_coverage_rate'))}",
        f"- sources 兼容 coverage：{_format_rate(answer.get('source_compat_coverage_rate'))}",
        f"- expected claim hit rate：{_format_rate(answer.get('expected_claim_hit_rate'))}",
        f"- unsupported claim count：{answer.get('unsupported_claim_count', 'N/A')}",
        f"- unanswerable abstention rate：{_format_rate(answer.get('unanswerable_abstention_rate'))}",
        f"- average_latency_ms：{_format_number(answer.get('average_latency_ms'), 2)}",
        f"- 说明：{answer.get('message', '尚未运行答案引用评测。')}",
        "",
        "## 失败用例",
        "",
        "| stage | case_id | query | failure_reason |",
        "|---|---|---|---|"
    ]

    failures = retrieval.get("failures", []) + answer.get("failures", [])
    if failures:
        for failure in failures:
            lines.append(
                "| {stage} | {case_id} | {query} | {reason} |".format(
                    stage=_escape_table_text(failure.get("stage", "")),
                    case_id=_escape_table_text(failure.get("case_id", "")),
                    query=_escape_table_text(failure.get("query", "")),
                    reason=_escape_table_text(
                        failure.get("failure_reason", "")
                    )
                )
            )
    else:
        lines.append("| - | - | - | 暂无失败用例或尚未运行评测 |")

    notes = retrieval.get("notes", []) + answer.get("notes", [])
    lines.extend([
        "",
        "## 下一步改进",
        ""
    ])

    if notes:
        for note in dict.fromkeys(notes):
            lines.append(f"- {note}")
    else:
        lines.append("- 用真实 chunk_id/doc_id 替换示例 case 中的空数组。")

    lines.extend([
        "- 固定一组稳定知识库数据后，再据此调整 top_k、阈值和混合检索权重。",
        "- unsupported claim count 是词面重叠弱评测，重要场景应增加人工或模型裁判复核。",
        ""
    ])
    return "\n".join(lines)
