# 从 typing 导入 List
# 作用：表示接口返回的是多个对象组成的列表
from typing import List


# 从 FastAPI 导入 APIRouter、UploadFile、File
# APIRouter：创建路由模块
# UploadFile：接收上传文件
# File：声明这是一个文件上传字段
from fastapi import APIRouter, UploadFile, File


# 从文档接口数据结构文件导入响应模型
from app.schemas.document import (
    DocumentStatusResponse,
    DocumentListItem,
    UploadDocumentResponse,
    BatchUploadResponse,
    DeleteDocumentResponse,
    TaskLogItem,
    RetryDocumentResponse
)


# 从文档业务服务文件导入业务函数
from app.services.document_service import (
    get_document_status,
    list_documents,
    delete_document,
    get_document_task_logs,
    retry_document_parse
)


# 从文档入库服务中导入 upload_document、batch_upload_documents
# 作用：处理文件上传、查重、保存 MinIO、写入数据库、派发 Celery 任务
from app.services.ingestion_service import upload_document, batch_upload_documents


# 创建文档路由对象
# 作用：main.py 会把这个 router 注册到 FastAPI 主应用里
router = APIRouter()


# 上传文档接口
# 最终访问路径：POST /api/v1/documents/upload
@router.post("/upload", response_model=UploadDocumentResponse)
async def upload(file: UploadFile = File(...)):

    # 调用文档上传业务函数
    return await upload_document(file)


# 批量上传文档接口
# 最终访问路径：POST /api/v1/documents/batch-upload
@router.post("/batch-upload", response_model=BatchUploadResponse)
async def batch_upload(files: List[UploadFile] = File(...)):

    # 调用批量上传业务函数
    return await batch_upload_documents(files)


# 获取文档列表接口
# 最终访问路径：GET /api/v1/documents/
@router.get("/", response_model=List[DocumentListItem])
def get_documents():

    # 调用文档列表业务函数
    return list_documents()


# 查询指定文档状态接口
# 最终访问路径：GET /api/v1/documents/{doc_id}/status
@router.get("/{doc_id}/status", response_model=DocumentStatusResponse)
def get_status(doc_id: int):

    # 调用文档状态查询函数
    return get_document_status(doc_id)


# 查询某个文档的任务日志
# 最终访问路径：GET /api/v1/documents/{doc_id}/task-log
@router.get("/{doc_id}/task-log", response_model=List[TaskLogItem])
def get_task_logs(doc_id: int):

    # 调用业务层函数查询任务日志
    return get_document_task_logs(doc_id)


# 重新解析失败文档
# 最终访问路径：POST /api/v1/documents/{doc_id}/retry
@router.post("/{doc_id}/retry", response_model=RetryDocumentResponse)
def retry_document(doc_id: int):

    # 调用业务层函数，重新派发 Celery 解析任务
    return retry_document_parse(doc_id)


# 删除指定文档接口
# 最终访问路径：DELETE /api/v1/documents/{doc_id}
@router.delete("/{doc_id}", response_model=DeleteDocumentResponse)
def delete_doc(doc_id: int):

    # 调用文档删除业务函数
    return delete_document(doc_id)
