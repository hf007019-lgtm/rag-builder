# 从 FastAPI 导入 FastAPI
# 作用：FastAPI 是创建后端服务的核心类
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


# 从本地代理防御文件导入 disable_proxy_for_localhost
# 作用：防止访问 127.0.0.1 时被 Clash / V2ray 等代理软件拦截
from app.core.proxy_guard import disable_proxy_for_localhost


# 从健康检查接口文件导入 router
# 作用：把 health.py 里的接口注册到主应用
from app.api.v1.health import router as health_router


# 从文档接口文件导入 router
# 作用：把 document.py 里的接口注册到主应用
from app.api.v1.document import router as document_router


# 从 RAG 问答接口文件导入 router
# 作用：把 search.py 里的问答接口注册到主应用
from app.api.v1.search import router as search_router
from app.api.v1.console import router as console_router

# 调用本地代理防御函数
# 作用：让 PostgreSQL、MinIO、Redis、ES 这些本地服务不走代理
disable_proxy_for_localhost()


# 创建 FastAPI 应用对象
# 作用：app 就是整个后端服务的核心入口
app = FastAPI(
    title="RAG Builder API",
    description="本地 RAG 文档问答系统",
    version="0.1.0"
)


# 注册健康检查路由
# 访问前缀：/api/v1/health
app.include_router(
    health_router,
    prefix="/api/v1/health",
    tags=["Health"]
)


# 注册文档相关路由
# 访问前缀：/api/v1/documents
app.include_router(
    document_router,
    prefix="/api/v1/documents",
    tags=["Documents"]
)


# 注册 RAG 问答相关路由
# 访问前缀：/api/v1/search
app.include_router(
    search_router,
    prefix="/api/v1/search",
    tags=["Search"]
)


# 注册企业控制台只读与检索调试接口
app.include_router(
    console_router,
    prefix="/api/v1",
    tags=["Console"]
)

# 挂载前端静态资源目录
# 作用：让浏览器可以访问 /static/styles.css 和 /static/app.js
app.mount("/static", StaticFiles(directory="app/static"), name="static")


# 返回 RAG Builder Web 控制台首页
# 作用：浏览器访问 http://127.0.0.1:18000/ 时直接打开单页工作台
@app.get("/")
def index():
    return FileResponse("app/static/index.html")
