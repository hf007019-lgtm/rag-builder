# 从 pydantic 导入 BaseModel
# 作用：BaseModel 用来定义接口请求和响应的数据格式
from pydantic import BaseModel

# 从 typing 导入 Optional
# Optional 表示这个字段可以有值，也可以是 None
from typing import Optional


# 从 datetime 导入 datetime
# datetime 用来表示创建时间、更新时间
from datetime import datetime


# 定义任务日志响应模型
# 这个模型用于 GET /api/v1/document/{doc_id}/task-log 接口返回数据
class TaskLogItem(BaseModel):

    # 任务日志 ID
    id: int

    # 文档 ID
    doc_id: int

    # 任务名称，例如 parse_document_task
    task_name: str

    # 任务状态，例如 STARTED、SUCCESS、FAILED
    status: str

    # 任务说明，例如“文档解析成功，共生成 1 个 chunk”
    message: Optional[str] = None

    # chunk 数量，任务未成功时可能为空
    chunk_count: Optional[int] = None

    # 错误信息，任务成功时一般为空
    error_message: Optional[str] = None

    # 日志创建时间
    created_at: datetime

    # 日志更新时间
    updated_at: datetime

    # Pydantic 配置
    # from_attributes=True 表示允许直接把 SQLAlchemy ORM 对象转换成响应模型
    model_config = {
        "from_attributes": True
    }

# 定义文档状态响应模型
# 作用：规定查询单个文档状态接口返回的数据格式
class DocumentStatusResponse(BaseModel):

    # 文档 ID
    # 作用：唯一标识一个上传文档
    id: int

    # 文件名
    # 作用：展示用户上传的原始文件名
    file_name: str

    # 文档状态
    # 作用：表示当前文档是 PENDING、PARSING、SUCCESS 还是 FAILED
    status: str


# 定义文档列表项模型
# 作用：规定文档列表接口中每一项的数据格式
class DocumentListItem(BaseModel):

    # 文档 ID
    # 作用：唯一标识一个上传文档
    id: int

    # 文件名
    # 作用：展示用户上传的原始文件名
    file_name: str

    # 文档状态
    # 作用：展示当前文档解析状态
    status: str

    # 上传时间
    created_at: Optional[datetime] = None

    # 最近一次成功解析生成的 chunk 数
    chunk_count: Optional[int] = None


# 定义上传文档响应模型
# 作用：规定上传接口返回给前端的数据格式
class UploadDocumentResponse(BaseModel):

    # 返回消息
    # 作用：告诉用户上传是否成功
    msg: str

    # 文档 ID
    # 作用：前端后续可以用这个 ID 查询状态
    doc_id: int

    # 文件名
    # 作用：返回上传的文件名
    file_name: str

    # 文档状态
    # 作用：上传后一般是 PENDING
    status: str


# 定义删除文档响应模型
# 作用：规定删除接口返回给前端的数据格式
class DeleteDocumentResponse(BaseModel):

    # 返回消息
    # 作用：告诉用户删除是否成功
    msg: str

    # 被删除的文档 ID
    # 作用：方便前端确认删除的是哪条数据
    doc_id: int

    # 被删除的文件名
    # 作用：方便前端展示删除结果
    file_name: str

    # 删除的 ES 文本块数量
    # 作用：告诉前端向量库里删掉了多少个 chunk
    deleted_chunks: int

# 定义重新解析文档的响应模型
# 这个模型用于 POST /api/v1/documents/{doc_id}/retry 接口
class RetryDocumentResponse(BaseModel):

    # 文档 ID
    # 表示这次重新解析的是哪个文档
    doc_id: int

    # 文档状态
    # 重新派发任务后，一般会变成 PENDING
    status: str

    # 返回给前端看的提示信息
    message: str
