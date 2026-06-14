"""DashScope qwen3-rerank 语义重排服务。"""

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests

from app.core.config import settings


logger = logging.getLogger(__name__)

RERANK_STATUS_DISABLED = "disabled"
RERANK_STATUS_ENABLED = "enabled"
RERANK_STATUS_FALLBACK = "fallback"

_runtime_status = {
    "status": "not_run",
    "message": "尚未调用 rerank",
    "error": None,
    "latency_ms": None
}


def get_rerank_runtime_status() -> Dict[str, Any]:
    """返回当前 FastAPI 进程最近一次实际 rerank 调用状态。"""
    return dict(_runtime_status)


@dataclass
class RerankResult:
    status: str
    results: List[Dict[str, Any]]
    provider: str
    model: str
    message: str
    error: Optional[str] = None
    latency_ms: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rerank_status": self.status,
            "rerank_provider": self.provider,
            "rerank_model": self.model,
            "rerank_message": self.message,
            "rerank_error": self.error,
            "rerank_latency_ms": self.latency_ms,
            "results": self.results
        }


class RerankerService:
    """通过 DashScope 兼容接口对 Elasticsearch 候选结果做二阶段重排。"""

    def __init__(
        self,
        provider: Optional[str] = None,
        model_name: Optional[str] = None
    ):
        self.provider = provider or settings.RERANK_PROVIDER
        self.model_name = model_name or settings.RERANK_MODEL_NAME
        self.base_url = settings.RERANK_BASE_URL
        self.api_key = settings.DASHSCOPE_API_KEY
        self.timeout_seconds = settings.RERANK_TIMEOUT_SECONDS
        self.last_status = RERANK_STATUS_DISABLED
        self.last_message = "语义重排未启用"
        self.last_error = None
        self.last_latency_ms = None

    @staticmethod
    def _metadata(candidate: Dict[str, Any]) -> Dict[str, Any]:
        metadata = candidate.get("metadata")
        return metadata if isinstance(metadata, dict) else {}

    @classmethod
    def _first_value(cls, candidate: Dict[str, Any], *keys: str) -> Any:
        metadata = cls._metadata(candidate)
        for key in keys:
            value = candidate.get(key)
            if value is None:
                value = metadata.get(key)
            if value is not None and str(value).strip():
                return value
        return None

    @classmethod
    def _build_document(cls, candidate: Dict[str, Any]) -> str:
        text = cls._first_value(
            candidate,
            "chunk_text",
            "text",
            "content",
            "text_preview",
            "preview"
        )
        text = str(text or "").strip()
        file_name = cls._first_value(
            candidate,
            "document_name",
            "filename",
            "file_name",
            "doc_name",
            "source_name"
        )
        page_number = cls._first_value(
            candidate,
            "page_number",
            "page"
        )

        parts = []
        if file_name:
            parts.append(f"文档名：{file_name}")
        if page_number is not None:
            parts.append(f"页码：{page_number}")
        if parts:
            parts.append(f"片段内容：{text or '暂无片段内容'}")
            document = "\n".join(parts)
        else:
            document = text or "暂无片段内容"

        return document[:settings.RERANK_MAX_DOCUMENT_CHARS]

    def _annotate_baseline(
        self,
        candidates: List[Dict[str, Any]],
        limit: int,
        status: str
    ) -> List[Dict[str, Any]]:
        annotated = []
        for baseline_rank, candidate in enumerate(candidates[:limit], start=1):
            item = dict(candidate)
            item["baseline_rank"] = baseline_rank
            item["original_rank"] = baseline_rank
            item["rerank_rank"] = (
                baseline_rank if status == RERANK_STATUS_FALLBACK else None
            )
            item["rerank_score"] = None
            item["semantic_score"] = None
            item["rerank_status"] = status
            item["rerank_provider"] = self.provider
            item["rerank_model"] = self.model_name
            annotated.append(item)
        return annotated

    @staticmethod
    def _response_results(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        results = payload.get("results")
        if isinstance(results, list):
            return results

        output = payload.get("output")
        if isinstance(output, dict) and isinstance(output.get("results"), list):
            return output["results"]

        raise ValueError("DashScope 响应缺少 results")

    @staticmethod
    def _http_error_summary(response: requests.Response) -> str:
        summary = f"HTTP {response.status_code}"
        try:
            payload = response.json()
        except ValueError:
            return summary

        if not isinstance(payload, dict):
            return summary
        detail = payload.get("message")
        error_payload = payload.get("error")
        if not detail and isinstance(error_payload, dict):
            detail = error_payload.get("message")
        if detail:
            return f"{summary}: {str(detail)[:300]}"
        return summary

    def _finish(
        self,
        status: str,
        results: List[Dict[str, Any]],
        message: str,
        error: Optional[str] = None,
        latency_ms: Optional[float] = None
    ) -> RerankResult:
        if status != RERANK_STATUS_DISABLED:
            _runtime_status.update({
                "status": status,
                "message": message,
                "error": error,
                "latency_ms": latency_ms
            })
        self.last_status = status
        self.last_message = message
        self.last_error = error
        self.last_latency_ms = latency_ms
        return RerankResult(
            status=status,
            results=results,
            provider=self.provider,
            model=self.model_name,
            message=message,
            error=error,
            latency_ms=latency_ms
        )

    def _fallback(
        self,
        candidates: List[Dict[str, Any]],
        limit: int,
        error: str,
        latency_ms: Optional[float] = None
    ) -> RerankResult:
        safe_error = str(error)
        if self.api_key:
            safe_error = safe_error.replace(self.api_key, "[REDACTED]")
        message = "Rerank 调用失败，已回退到原始检索排序。"
        logger.warning(
            "DashScope rerank 调用失败，已回退到原始排序：%s",
            safe_error
        )
        return self._finish(
            status=RERANK_STATUS_FALLBACK,
            results=self._annotate_baseline(
                candidates,
                limit,
                RERANK_STATUS_FALLBACK
            ),
            message=message,
            error=safe_error,
            latency_ms=latency_ms
        )

    def rerank_chunks(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: Optional[int] = None,
        use_rerank: Optional[bool] = None
    ) -> RerankResult:
        requested = settings.RERANK_ENABLED if use_rerank is None else use_rerank
        candidates = list(chunks[:500])
        limit = min(
            max(1, top_k or settings.RERANK_TOP_K),
            len(candidates)
        ) if candidates else 0

        if not requested:
            return self._finish(
                status=RERANK_STATUS_DISABLED,
                results=self._annotate_baseline(
                    candidates,
                    limit,
                    RERANK_STATUS_DISABLED
                ),
                message="Rerank 未启用，本次仅使用 baseline 检索排序。"
            )

        if not candidates:
            return self._finish(
                status=RERANK_STATUS_ENABLED,
                results=[],
                message="没有候选 chunk 需要重排。",
                latency_ms=0.0
            )

        if self.provider.lower() != "dashscope":
            return self._fallback(
                candidates,
                limit,
                f"不支持的 rerank provider：{self.provider}"
            )
        if not self.api_key:
            return self._fallback(
                candidates,
                limit,
                "缺少 DASHSCOPE_API_KEY 或可复用的模型服务 API Key"
            )

        request_body = {
            "model": self.model_name,
            "query": query,
            "documents": [
                self._build_document(candidate)
                for candidate in candidates
            ],
            "top_n": limit,
            "instruct": settings.RERANK_INSTRUCT
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        logger.info(
            "正在调用 DashScope %s，候选数量：%s",
            self.model_name,
            len(candidates)
        )
        started_at = time.perf_counter()
        try:
            response = requests.post(
                self.base_url,
                headers=headers,
                json=request_body,
                timeout=self.timeout_seconds
            )
            latency_ms = (time.perf_counter() - started_at) * 1000
            if not response.ok:
                return self._fallback(
                    candidates,
                    limit,
                    self._http_error_summary(response),
                    round(latency_ms, 2)
                )

            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("DashScope 响应不是 JSON 对象")
            response_results = self._response_results(payload)
            mapped_results = []
            for result in response_results:
                index = result.get("index")
                relevance_score = result.get("relevance_score")
                if not isinstance(index, int) or not 0 <= index < len(candidates):
                    continue

                item = dict(candidates[index])
                item["baseline_rank"] = index + 1
                item["original_rank"] = index + 1
                item["rerank_score"] = float(relevance_score)
                item["semantic_score"] = float(relevance_score)
                item["rerank_status"] = RERANK_STATUS_ENABLED
                item["rerank_provider"] = self.provider
                item["rerank_model"] = self.model_name
                mapped_results.append(item)

            if not mapped_results:
                raise ValueError("DashScope 响应没有可映射的重排结果")

            mapped_results.sort(
                key=lambda item: item["rerank_score"],
                reverse=True
            )
            for rerank_rank, item in enumerate(mapped_results, start=1):
                item["rerank_rank"] = rerank_rank

            logger.info(
                "DashScope rerank 调用成功，返回数量：%s",
                len(mapped_results)
            )
            return self._finish(
                status=RERANK_STATUS_ENABLED,
                results=mapped_results[:limit],
                message=(
                    f"已使用 DashScope {self.model_name} 完成语义重排。"
                ),
                latency_ms=round(latency_ms, 2)
            )
        except requests.RequestException as exc:
            latency_ms = (time.perf_counter() - started_at) * 1000
            return self._fallback(
                candidates,
                limit,
                f"{type(exc).__name__}: 远端请求失败",
                round(latency_ms, 2)
            )
        except (TypeError, ValueError) as exc:
            latency_ms = (time.perf_counter() - started_at) * 1000
            return self._fallback(
                candidates,
                limit,
                f"{type(exc).__name__}: {str(exc)[:300]}",
                round(latency_ms, 2)
            )

    def rerank(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        top_k: Optional[int] = None,
        use_rerank: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        """保留旧调用方式，返回统一结果对象中的 results。"""
        return self.rerank_chunks(
            query=query,
            chunks=candidates,
            top_k=top_k,
            use_rerank=use_rerank
        ).results


def rerank_chunks(
    query: str,
    chunks: List[Dict[str, Any]],
    top_k: Optional[int] = None
) -> RerankResult:
    """供无需持有服务实例的调用方使用。"""
    return RerankerService().rerank_chunks(
        query=query,
        chunks=chunks,
        top_k=top_k
    )
