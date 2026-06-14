# 从 typing 导入 List 和 Optional
# List：列表类型
# Optional：可选字段类型
from typing import List, Optional, Union


# 从 pydantic 导入 BaseModel
# 作用：定义接口请求和响应格式
from pydantic import BaseModel


# 定义用户提问请求模型
class AskRequest(BaseModel):

    # 用户问题
    question: str


# 定义来源片段模型
class SourceChunk(BaseModel):

    # 文档 ID
    doc_id: Optional[Union[int, str]] = None

    # 文件名
    file_name: str = "未知来源"

    # chunk 唯一编号
    chunk_id: Optional[str] = None

    # 页码
    # txt 文件没有页码，所以允许为空
    page_number: Optional[int] = None

    # 文本块内容
    chunk_text: str = ""

    # 检索得分
    score: Optional[float] = None


# 定义问答响应模型
class AskResponse(BaseModel):

    # 最终答案
    answer: str

    # 来源文本片段列表
    sources: List[SourceChunk]

    # 标准引用字段，与 sources 保持兼容
    citations: List[SourceChunk]

    # grounded / unanswerable / chitchat
    answer_type: str

    # 是否执行了知识库检索
    used_retrieval: bool
