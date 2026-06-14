"""企业控制台的评测、系统状态和检索调试接口。"""

from typing import Optional

from fastapi import APIRouter, Query

from app.schemas.console import (
    EvaluationReportResponse,
    RetrievalTestResponse,
    SystemStatusResponse
)
from app.services.evaluation_service import get_evaluation_report
from app.services.retrieval_debug_service import run_retrieval_test
from app.services.system_status_service import get_system_status


router = APIRouter()


@router.get("/eval/report", response_model=EvaluationReportResponse)
def evaluation_report():
    return get_evaluation_report()


@router.get("/system/status", response_model=SystemStatusResponse)
def system_status():
    return get_system_status()


@router.get("/retrieval/test", response_model=RetrievalTestResponse)
def retrieval_test(
    query: str = Query(min_length=1, max_length=1000),
    top_k: int = Query(default=5, ge=1, le=20),
    top_n: Optional[int] = Query(default=None, ge=1, le=100),
    use_rerank: bool = False
):
    return run_retrieval_test(
        query=query.strip(),
        top_k=top_k,
        top_n=top_n,
        use_rerank=use_rerank
    )
