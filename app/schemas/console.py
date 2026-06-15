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
    category: Optional[str] = None
    impact: Optional[str] = None
    action: Optional[str] = None
    endpoint: Optional[str] = None
    optional: bool = False


class SystemStatusResponse(BaseModel):
    status: str
    service_status: Dict[str, str] = Field(default_factory=dict)
    components: Dict[str, SystemComponent]
    retrieval: Dict[str, Any]
    api_port: Optional[int] = None


class RetrievalTestItem(BaseModel):
    rank: int
    baseline_rank: Optional[int] = None
    rerank_rank: Optional[int] = None
    score: Optional[float] = None
    hybrid_score: Optional[float] = None
    vector_score: Optional[float] = None
    keyword_score: Optional[float] = None
    rerank_score: Optional[float] = None
    rerank_provider: Optional[str] = None
    rerank_model: Optional[str] = None
    doc_id: Optional[Union[int, str]] = None
    file_name: str = "未知来源"
    chunk_id: Optional[str] = None
    page_number: Optional[int] = None
    chunk_text: str = ""


class RetrievalTestResponse(BaseModel):
    query: str
    top_k: int
    top_n: int
    retrieval_mode: str
    rerank_requested: bool
    rerank_status: str
    rerank_provider: str
    rerank_model: str
    rerank_message: str
    rerank_error: Optional[str] = None
    retrieval_latency_ms: float
    rerank_latency_ms: Optional[float] = None
    latency_ms: float
    baseline_results: List[RetrievalTestItem]
    rerank_results: List[RetrievalTestItem]
    results: List[RetrievalTestItem]
