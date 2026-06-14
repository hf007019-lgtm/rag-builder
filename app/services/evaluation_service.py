"""读取离线评测产物，为控制台提供只读数据。"""

import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EVAL_RESULTS_PATH = PROJECT_ROOT / "evals" / "eval_results.json"
EVAL_REPORT_PATH = PROJECT_ROOT / "evals" / "eval_report.md"


def get_evaluation_report() -> dict:
    results = {}
    report_markdown = ""

    if EVAL_RESULTS_PATH.exists():
        try:
            results = json.loads(
                EVAL_RESULTS_PATH.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError):
            results = {}

    if EVAL_REPORT_PATH.exists():
        try:
            report_markdown = EVAL_REPORT_PATH.read_text(encoding="utf-8")
        except OSError:
            report_markdown = ""

    retrieval = results.get("retrieval")
    retrieval = retrieval if isinstance(retrieval, dict) else {}
    answer = results.get("answer")
    answer = answer if isinstance(answer, dict) else {}

    failures = []
    for section in (retrieval, answer):
        section_failures = section.get("failures", [])
        if isinstance(section_failures, list):
            failures.extend(
                item for item in section_failures
                if isinstance(item, dict)
            )

    available = bool(results or report_markdown)
    return {
        "available": available,
        "generated_at": results.get("generated_at"),
        "retrieval": retrieval,
        "answer": answer,
        "failures": failures,
        "report_markdown": report_markdown,
        "message": (
            "已读取最近一次离线评测结果"
            if available
            else "尚未生成评测报告，请先运行评测命令"
        )
    }
