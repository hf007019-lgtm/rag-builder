# 从 FastAPI 导入 APIRouter
# 作用：创建一个独立的问答路由模块
from fastapi import APIRouter


# 从问答数据模型中导入 AskRequest 和 AskResponse
# AskRequest：规定用户提问格式
# AskResponse：规定系统回答格式
from app.schemas.search import AskRequest, AskResponse


# 从问答业务服务中导入 ask_question
# 作用：真正的 RAG 检索问答逻辑在 service 层
from app.services.search_service import ask_question


# 创建问答路由对象
# 作用：main.py 会导入这个 router 并注册
router = APIRouter()


# 定义 RAG 问答接口
# 访问路径最终会是：POST /api/v1/search/ask
@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):

    # 调用问答业务服务
    # 作用：把用户问题交给 search_service.py 处理
    return ask_question(req.question)