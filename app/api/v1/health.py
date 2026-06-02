# 从 FastAPI 导入 APIRouter
# 作用：APIRouter 用来创建一个独立的接口路由模块
from fastapi import APIRouter


# 从健康检查业务服务文件导入 check_all_dependencies
# 作用：检查 PostgreSQL、MinIO、Redis、Elasticsearch 等依赖服务是否正常
from app.services.health_service import check_all_dependencies


# 创建健康检查路由对象
# 作用：main.py 会把这个 router 注册到 FastAPI 主应用中
router = APIRouter()


# 基础健康检查接口
# 最终访问路径：GET /api/v1/health
# 作用：只检查 FastAPI 服务本身是否正常运行
@router.get("")
def health_check():

    # 返回基础健康状态
    # status=ok 表示 FastAPI 服务可以正常响应请求
    return {
        "status": "ok",
        "message": "RAG FastAPI 服务运行正常"
    }


# 系统依赖健康检查接口
# 最终访问路径：GET /api/v1/health/dependencies
# 作用：检查 PostgreSQL、MinIO、Redis、Elasticsearch 是否正常
@router.get("/dependencies")
def dependencies_health_check():

    # 调用业务层函数，执行所有依赖服务的健康检查
    return check_all_dependencies()