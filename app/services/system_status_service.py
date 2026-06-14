"""汇总控制台可安全展示的系统组件状态。"""

from app.core.config import settings
from app.services.health_service import check_all_dependencies
from app.services.reranker_service import get_rerank_runtime_status


def _component(name: str, status: str, message: str, model: str = None):
    result = {
        "name": name,
        "status": status,
        "message": message
    }
    if model:
        result["model"] = model
    return result


def _check_celery_worker() -> dict:
    try:
        from worker.celery_app import celery_app

        replies = celery_app.control.ping(timeout=1.0)
        if replies:
            return _component(
                "Celery Worker",
                "ok",
                f"检测到 {len(replies)} 个可响应 Worker"
            )
        return _component(
            "Celery Worker",
            "unknown",
            "未检测到可响应 Worker；Worker 未启动时文档会停留在 PENDING"
        )
    except Exception as exc:
        return _component(
            "Celery Worker",
            "unknown",
            f"Worker 状态检查未完成：{type(exc).__name__}"
        )


def get_system_status() -> dict:
    dependency_result = check_all_dependencies()
    dependencies = dependency_result.get("dependencies", {})
    rerank_runtime = get_rerank_runtime_status()

    components = {
        "fastapi": _component(
            "FastAPI",
            "ok",
            "FastAPI 可以正常处理当前请求"
        )
    }

    for key in ("postgresql", "minio", "redis", "elasticsearch"):
        item = dependencies.get(key, {})
        components[key] = _component(
            item.get("name", key.title()),
            item.get("status", "unknown"),
            item.get("message", "当前没有可用状态")
        )

    components["embedding"] = _component(
        "Embedding Model",
        "configured",
        "已配置 Embedding 模型；该接口不主动发起模型调用",
        settings.EMBEDDING_MODEL_NAME
    )
    components["llm"] = _component(
        "LLM",
        "configured",
        "已配置 Chat 模型；该接口不主动发起模型调用",
        settings.CHAT_MODEL_NAME
    )
    if rerank_runtime["status"] == "enabled":
        rerank_component_status = "ok"
        rerank_component_message = "最近一次 DashScope rerank 调用成功"
    elif rerank_runtime["status"] == "fallback":
        rerank_component_status = "warning"
        rerank_component_message = "最近一次 rerank 调用失败，已回退 baseline"
    elif settings.RERANK_ENABLED and settings.DASHSCOPE_API_KEY:
        rerank_component_status = "configured"
        rerank_component_message = "已配置 DashScope rerank；尚未实际调用验证"
    elif settings.RERANK_ENABLED:
        rerank_component_status = "unknown"
        rerank_component_message = "Rerank 已启用，但没有可用的 DashScope API Key"
    else:
        rerank_component_status = "disabled"
        rerank_component_message = "Rerank 未启用"

    components["rerank"] = _component(
        "Rerank Model",
        rerank_component_status,
        rerank_component_message,
        (
            f"{settings.RERANK_PROVIDER} / {settings.RERANK_MODEL_NAME}"
            if settings.RERANK_ENABLED
            or rerank_runtime["status"] in {"enabled", "fallback"}
            else None
        )
    )
    components["celery"] = _check_celery_worker()

    component_statuses = [
        item["status"]
        for item in components.values()
    ]
    overall_status = (
        "ok"
        if component_statuses
        and all(
            status in {"ok", "configured", "disabled"}
            for status in component_statuses
        )
        else "degraded"
    )

    return {
        "status": overall_status,
        "components": components,
        "retrieval": {
            "mode": "Hybrid",
            "top_k": 5,
            "rerank_top_n": settings.RERANK_TOP_N,
            "rerank_top_k": settings.RERANK_TOP_K,
            "citation_threshold": 0.6,
            "relative_score_ratio": 0.65,
            "rerank_enabled": settings.RERANK_ENABLED,
            "rerank_provider": settings.RERANK_PROVIDER,
            "rerank_model": settings.RERANK_MODEL_NAME,
            "rerank_apply_to_ask": settings.RERANK_APPLY_TO_ASK,
            "rerank_runtime_status": rerank_runtime["status"],
            "rerank_runtime_message": rerank_runtime["message"]
        }
    }
