"""用于离线评测的可选语义重排服务。"""

from typing import Any, Dict, List, Optional

from app.core.config import settings


RERANK_STATUS_DISABLED = "disabled"
RERANK_STATUS_ENABLED = "enabled"
RERANK_STATUS_UNAVAILABLE = "unavailable"
RERANK_STATUS_FAILED = "failed"


class RerankerService:
    """使用本地 CrossEncoder 对候选 chunk 做二阶段重排。"""

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or settings.RERANK_MODEL_NAME
        self._model = None
        self.last_status = RERANK_STATUS_DISABLED
        self.last_message = "语义重排未启用"

    def _load_model(self):
        """只加载本地已有模型，避免评测脚本自动下载大模型。"""
        if self._model is not None:
            return self._model

        try:
            from sentence_transformers import CrossEncoder
        except ImportError:
            self.last_status = RERANK_STATUS_UNAVAILABLE
            self.last_message = (
                "未安装 sentence-transformers，已自动降级为 baseline 排序"
            )
            return None

        try:
            self._model = CrossEncoder(
                self.model_name,
                local_files_only=True
            )
        except TypeError:
            self.last_status = RERANK_STATUS_UNAVAILABLE
            self.last_message = (
                "当前 sentence-transformers 版本不支持本地只读加载，"
                "为避免自动下载模型，已降级为 baseline 排序"
            )
            return None
        except Exception as exc:
            self.last_status = RERANK_STATUS_UNAVAILABLE
            self.last_message = (
                f"本地 rerank 模型不可用（{type(exc).__name__}），"
                "已自动降级为 baseline 排序"
            )
            return None

        return self._model

    @staticmethod
    def _annotate_candidates(
        candidates: List[Dict[str, Any]],
        status: str
    ) -> List[Dict[str, Any]]:
        """复制候选结果并补充重排状态，避免修改原始检索结果。"""
        annotated = []

        for rank, candidate in enumerate(candidates, start=1):
            item = dict(candidate)
            item["original_rank"] = rank
            item["rerank_status"] = status
            item["semantic_score"] = None
            annotated.append(item)

        return annotated

    def rerank(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        top_k: Optional[int] = None,
        use_rerank: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        """
        对候选 chunk 重排。

        use_rerank=None 时读取 RERANK_ENABLED；显式传入 True/False 时按调用方选择。
        """
        requested = settings.RERANK_ENABLED if use_rerank is None else use_rerank
        limit = top_k if top_k is not None else len(candidates)

        if not requested:
            self.last_status = RERANK_STATUS_DISABLED
            self.last_message = "语义重排未启用，本次仅评测 baseline 检索"
            return self._annotate_candidates(
                candidates[:limit],
                RERANK_STATUS_DISABLED
            )

        if not candidates:
            self.last_status = RERANK_STATUS_ENABLED
            self.last_message = "没有候选 chunk 需要重排"
            return []

        model = self._load_model()
        if model is None:
            return self._annotate_candidates(
                candidates[:limit],
                self.last_status
            )

        pairs = [
            [query, str(candidate.get("chunk_text", ""))]
            for candidate in candidates
        ]

        try:
            scores = model.predict(pairs)
        except Exception as exc:
            self.last_status = RERANK_STATUS_FAILED
            self.last_message = (
                f"rerank 推理失败（{type(exc).__name__}），"
                "已自动降级为 baseline 排序"
            )
            return self._annotate_candidates(
                candidates[:limit],
                RERANK_STATUS_FAILED
            )

        reranked = []
        for rank, (candidate, score) in enumerate(
            zip(candidates, scores),
            start=1
        ):
            item = dict(candidate)
            item["original_rank"] = rank
            item["rerank_status"] = RERANK_STATUS_ENABLED
            item["semantic_score"] = float(score)
            reranked.append(item)

        reranked.sort(
            key=lambda item: item["semantic_score"],
            reverse=True
        )

        self.last_status = RERANK_STATUS_ENABLED
        self.last_message = (
            f"已使用本地模型 {self.model_name} 完成语义重排"
        )
        return reranked[:limit]
