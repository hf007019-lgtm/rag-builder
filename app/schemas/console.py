"""企业控制台轻量接口的响应模型。"""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class EvaluationReportResponse(BaseModel):
    available: bool
    generated_at: Optional[str] = None
    retrieval: Dict[str, Any] = Field(default_factory=dict)
    answer: Dict[str, Any] = Field(default_factory=dict)
    failures: List[Dict[str, Any]] = Field(default_factory=list)
    report_markdown: str = ""
    message: str


class SystemComponent(BaseModel):
    name: str
    status: str
    message: str
    model: Optional[str] = None


class SystemStatusResponse(BaseModel):
    status: str
    components: Dict[str, SystemComponent]
    retrieval: Dict[str, Any]
    api_port: Optional[int] = None


class RetrievalTestItem(BaseModel):
    rank: int
    score: Optional[float] = None
    vector_score: Optional[float] = None
    keyword_score: Optional[float] = None
    rerank_score: Optional[float] = None
    doc_id: Optional[Union[int, str]] = None
    file_name: str = "未知来源"
    chunk_id: Optional[str] = None
    page_number: Optional[int] = None
    chunk_text: str = ""


class RetrievalTestResponse(BaseModel):
    query: str
    top_k: int
    retrieval_mode: str
    rerank_requested: bool
    rerank_status: str
    rerank_message: str
    latency_ms: float
    results: List[RetrievalTestItem]
