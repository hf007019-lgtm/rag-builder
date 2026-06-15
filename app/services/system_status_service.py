"""汇总控制台可安全展示的系统组件状态。"""

from app.core.config import settings
from app.services.health_service import check_all_dependencies
from app.services.reranker_service import get_rerank_runtime_status


def _component(
    name: str,
    status: str,
    message: str,
    model: str = None,
    category: str = None,
    impact: str = None,
    action: str = None,
    endpoint: str = None,
    optional: bool = False
):
    result = {
        "name": name,
        "status": status,
        "message": message,
        "optional": optional
    }
    if model:
        result["model"] = model
    if category:
        result["category"] = category
    if impact:
        result["impact"] = impact
    if action:
        result["action"] = action
    if endpoint:
        result["endpoint"] = endpoint
    return result


def _check_celery_worker() -> dict:
    try:
        from worker.celery_app import celery_app

        replies = celery_app.control.ping(timeout=1.0)
        if replies:
            return _component(
                "解析 Worker",
                "ok",
                f"已检测到 {len(replies)} 个可响应 Worker",
                category="document_processing"
            )
        return _component(
            "解析 Worker",
            "unknown",
            (
                "解析 Worker：未检测\n"
                "影响：新上传文档可能无法自动解析。\n"
                "已有知识库问答不受影响。\n"
                "启动方式：python -m celery -A worker.celery_app.celery_app "
                "worker --loglevel=info --pool=solo"
            ),
            category="document_processing",
            impact="仅影响新文档解析，不影响已有知识库问答",
            action=(
                "python -m celery -A worker.celery_app.celery_app "
                "worker --loglevel=info --pool=solo"
            )
        )
    except Exception:
        return _component(
            "解析 Worker",
            "unknown",
            (
                "解析 Worker：状态检查未完成\n"
                "影响：新上传文档可能无法自动解析。\n"
                "已有知识库问答不受影响。\n"
                "启动方式：python -m celery -A worker.celery_app.celery_app "
                "worker --loglevel=info --pool=solo"
            ),
            category="document_processing",
            impact="仅影响新文档解析，不影响已有知识库问答",
            action=(
                "python -m celery -A worker.celery_app.celery_app "
                "worker --loglevel=info --pool=solo"
            )
        )


def get_system_status() -> dict:
    dependency_result = check_all_dependencies()
    dependencies = dependency_result.get("dependencies", {})
    rerank_runtime = get_rerank_runtime_status()

    components = {
        "fastapi": _component(
            "FastAPI",
            "ok",
            "FastAPI 可以正常处理当前请求",
            category="core"
        )
    }

    for key in ("postgresql", "minio", "redis", "elasticsearch"):
        item = dependencies.get(key, {})
        category = "document_processing" if key == "minio" else "core"
        components[key] = _component(
            item.get("name", key.title()),
            item.get("status", "unknown"),
            item.get("message", "当前没有可用状态"),
            category=category,
            endpoint=item.get("endpoint")
        )

    components["embedding"] = _component(
        "Embedding Model",
        "configured",
        "已配置 Embedding 模型；该接口不主动发起模型调用",
        settings.EMBEDDING_MODEL_NAME,
        category="ai"
    )
    components["llm"] = _component(
        "LLM",
        "configured",
        "已配置 Chat 模型；该接口不主动发起模型调用",
        settings.CHAT_MODEL_NAME,
        category="ai"
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
        rerank_component_status = "optional"
        rerank_component_message = (
            "检索重排：未开启\n"
            "说明：当前使用基础检索；开启 qwen3-rerank 后可对候选片段进行二次排序。\n"
            "状态：可选功能"
        )

    components["rerank"] = _component(
        "Rerank Model",
        rerank_component_status,
        rerank_component_message,
        (
            f"{settings.RERANK_PROVIDER} / {settings.RERANK_MODEL_NAME}"
            if settings.RERANK_ENABLED
            or rerank_runtime["status"] in {"enabled", "fallback"}
            else settings.RERANK_MODEL_NAME
        ),
        category="ai",
        optional=not settings.RERANK_ENABLED
    )
    components["celery"] = _check_celery_worker()

    core_keys = ("fastapi", "postgresql", "redis", "elasticsearch")
    core_ok = all(
        components[key]["status"] in {"ok", "configured"}
        for key in core_keys
    )
    minio_status = components["minio"]["status"]
    celery_status = components["celery"]["status"]
    upload_status = (
        "error"
        if minio_status in {"error", "failed"}
        else "unknown"
        if celery_status == "unknown"
        else "error"
        if celery_status in {"error", "failed"}
        else "ok"
    )
    overall_status = "error" if not core_ok else "degraded" if upload_status != "ok" else "ok"

    return {
        "status": overall_status,
        "service_status": {
            "core": "ok" if core_ok else "error",
            "upload": upload_status,
            "rerank": rerank_component_status
        },
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
