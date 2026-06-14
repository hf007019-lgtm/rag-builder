"""汇总控制台可安全展示的系统组件状态。"""

from app.core.config import settings
from app.services.health_service import check_all_dependencies


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
    components["rerank"] = _component(
        "Rerank Model",
        "configured" if settings.RERANK_ENABLED else "disabled",
        (
            "离线评测已配置启用 rerank"
            if settings.RERANK_ENABLED
            else "在线问答未启用 rerank"
        ),
        settings.RERANK_MODEL_NAME
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
            "citation_threshold": 0.6,
            "relative_score_ratio": 0.65,
            "rerank_enabled": False
        }
    }
