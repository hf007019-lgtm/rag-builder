# 从 io 导入 BytesIO
# 作用：把 bytes 包装成文件流，方便 MinIO 上传
from io import BytesIO


# 导入 hashlib
# 作用：计算 SHA256 文件哈希，防止重复上传
import hashlib


# 从 pathlib 导入 Path
# 作用：获取文件后缀名，例如 .txt、.pdf
from pathlib import Path


# 从 FastAPI 导入 UploadFile 和 HTTPException
# UploadFile：表示用户上传的文件对象
# HTTPException：用于返回清晰的接口错误
from fastapi import UploadFile, HTTPException


# 从配置层导入 settings
# 作用：统一读取上传大小和批量数量限制
from app.core.config import settings


# 从数据库会话文件导入 SessionLocal
# 作用：创建 PostgreSQL 数据库会话
from app.db.session import SessionLocal


# 从 MinIO 客户端文件导入相关对象和函数
# 作用：保存文件到 MinIO，并确保桶存在
from app.db.minio_client import minio_client, get_bucket_name, ensure_bucket_exists


# 从模型统一导出文件导入 Document
# 作用：操作 documents 表
from app.models import Document


# 从常量文件导入文档状态
# 作用：避免手写字符串
from app.core.constants import DOCUMENT_STATUS_PENDING, DOCUMENT_STATUS_FAILED


# 从 Celery 应用导入 celery_app
# 作用：上传成功后用 send_task 派发后台解析任务
from worker.celery_app import celery_app


# 从用户文案服务导入异常脱敏函数
# 作用：避免上传接口把 Python 原始异常直接展示给用户。
from app.services.user_message_service import format_user_error_message


# 当前统一支持的上传文件后缀
# 说明：.doc 老格式暂不支持，避免解析结果不稳定
ALLOWED_FILE_SUFFIXES = {".txt", ".pdf", ".md", ".docx"}
SUPPORTED_FILE_TYPE_TEXT = "PDF、TXT、Markdown、Word(.docx)"


# 获取单文件上传大小上限
def get_max_upload_size_bytes() -> int:

    # 至少保留 1 MB，避免错误配置成 0 后所有文件都无法上传
    max_mb = max(settings.MAX_UPLOAD_FILE_SIZE_MB, 1)

    # 返回字节数
    return max_mb * 1024 * 1024


# 生成不支持文件类型的中文提示
def build_unsupported_file_type_message(suffix: str) -> str:

    # suffix 为空时给出更容易理解的提示
    suffix_text = suffix or "无后缀"

    # 返回统一提示
    return f"不支持的文件类型：{suffix_text}。当前支持 {SUPPORTED_FILE_TYPE_TEXT}。"


# 校验上传文件类型
# file_name：用户上传的文件名
def validate_file_type(file_name: str):

    # 获取文件后缀并转成小写
    suffix = Path(file_name).suffix.lower()

    # 如果文件没有后缀
    if not suffix:

        # 返回 400 错误
        raise HTTPException(
            status_code=400,
            detail=build_unsupported_file_type_message("")
        )

    # .doc 是 Word 老格式，当前不强制支持
    if suffix == ".doc":

        # 返回明确中文提示
        raise HTTPException(
            status_code=400,
            detail="暂不支持 .doc 老格式，请转换为 .docx 后上传。"
        )

    # 如果后缀不在允许列表中
    if suffix not in ALLOWED_FILE_SUFFIXES:

        # 返回 400 错误
        raise HTTPException(
            status_code=400,
            detail=build_unsupported_file_type_message(suffix)
        )

    # 返回合法后缀
    return suffix


# 读取上传文件内容，并执行空文件和大小校验
async def read_upload_content(file: UploadFile) -> bytes:

    # 获取大小上限
    max_bytes = get_max_upload_size_bytes()

    # 只多读 1 个字节，用于判断是否超过限制
    content = await file.read(max_bytes + 1)

    # 如果文件内容为空
    if not content:

        # 直接返回错误
        raise HTTPException(
            status_code=400,
            detail="上传文件内容不能为空"
        )

    # 如果超过大小上限
    if len(content) > max_bytes:

        # 返回 413 错误
        raise HTTPException(
            status_code=413,
            detail=f"文件大小超过限制：单个文件最大 {settings.MAX_UPLOAD_FILE_SIZE_MB} MB"
        )

    # 返回读取到的内容
    return content


# 保存文件、写入数据库并派发解析任务
# file_name：用户上传的文件名
# content：上传文件的二进制内容
def store_document_and_dispatch_task(file_name: str, content: bytes):

    # 确保 MinIO 桶存在
    ensure_bucket_exists()

    # 计算文件 SHA256 哈希
    # 作用：同一个文件内容只入库一次
    file_hash = hashlib.sha256(content).hexdigest()

    # 创建数据库会话
    db = SessionLocal()

    # 使用 try/finally 保证数据库连接最终关闭
    try:

        # 根据文件哈希查询是否已经上传过
        existing_doc = db.query(Document).filter(Document.file_hash == file_hash).first()

        # 如果文件已存在，直接返回已有文档信息，不重复入库、不重复派任务
        if existing_doc:
            return {
                "msg": "文件已存在，秒传成功",
                "doc_id": existing_doc.id,
                "file_name": existing_doc.file_name,
                "status": existing_doc.status,
                "task_id": None
            }

        # 获取 MinIO 桶名称
        bucket_name = get_bucket_name()

        # 使用原始文件名作为对象名
        # 注意：后面可以升级成 hash + 文件名，避免同名覆盖
        object_name = file_name

        # 把二进制内容包装成文件流
        file_stream = BytesIO(content)

        # 上传文件到 MinIO
        try:
            minio_client.put_object(
                bucket_name=bucket_name,
                object_name=object_name,
                data=file_stream,
                length=len(content)
            )
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"MinIO 上传失败：{exc}"
            ) from exc

        # 创建文档数据库对象，初始状态为 PENDING
        new_doc = Document(
            file_name=file_name,
            file_hash=file_hash,
            status=DOCUMENT_STATUS_PENDING
        )

        # 添加到数据库会话
        db.add(new_doc)

        # 提交数据库事务
        db.commit()

        # 刷新对象，拿到数据库生成的 id
        db.refresh(new_doc)

        # 派发 Celery 后台解析任务
        # 作用：让 Worker 根据 doc_id 去 MinIO 读取文件并解析入库
        try:
            async_result = celery_app.send_task(
                "worker.tasks.parse_document_task",
                args=[new_doc.id]
            )
        except Exception as exc:

            # 投递失败时保留文档记录，并标记为 FAILED 方便排查
            new_doc.status = DOCUMENT_STATUS_FAILED
            db.commit()
            raise HTTPException(
                status_code=503,
                detail=f"Celery 任务投递失败：{exc}"
            ) from exc

        # 返回上传结果
        return {
            "msg": "已提交解析，等待后台处理",
            "doc_id": new_doc.id,
            "file_name": new_doc.file_name,
            "status": new_doc.status,
            "task_id": async_result.id
        }

    # 最终关闭数据库连接
    finally:

        # 关闭数据库会话
        db.close()


# 处理单个 UploadFile
async def process_upload_file(file: UploadFile):

    # 校验文件名是否存在
    if not file.filename:

        # 如果没有文件名，直接返回错误
        raise HTTPException(
            status_code=400,
            detail="上传文件名不能为空"
        )

    # 校验文件类型
    validate_file_type(file.filename)

    # 读取上传文件的全部二进制内容
    content = await read_upload_content(file)

    # 保存文件、写入数据库并派发任务
    return store_document_and_dispatch_task(
        file_name=file.filename,
        content=content
    )


# 定义上传文档业务函数
# 作用：完成文件类型校验、查重、保存文件、写数据库、派发 Celery 任务
async def upload_document(file: UploadFile):

    # 保持原单文件接口行为：校验错误仍返回明确的 HTTP 错误
    try:
        return await process_upload_file(file)
    except HTTPException:
        raise
    except Exception as exc:
        message = format_user_error_message(f"上传处理失败：{exc}")
        raise HTTPException(
            status_code=500,
            detail=message or "上传处理失败，请稍后重试"
        ) from exc


# 批量上传文档
# 作用：逐个处理文件，单个失败不影响其他文件
async def batch_upload_documents(files: list[UploadFile]):

    # 校验是否真的上传了文件
    if not files:
        raise HTTPException(
            status_code=400,
            detail="请至少选择一个文件上传"
        )

    # 校验批量数量上限
    if len(files) > settings.BATCH_UPLOAD_MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"一次最多上传 {settings.BATCH_UPLOAD_MAX_FILES} 个文件"
        )

    # 保存每个文件独立处理结果
    items = []

    # 逐个处理文件
    for file in files:
        filename = file.filename or "未命名文件"

        try:
            result = await process_upload_file(file)
            items.append({
                "filename": filename,
                "document_id": result["doc_id"],
                "task_id": result.get("task_id"),
                "status": result["status"],
                "message": result.get("msg") or "已提交解析"
            })
        except HTTPException as exc:
            message = format_user_error_message(str(exc.detail))
            items.append({
                "filename": filename,
                "document_id": None,
                "task_id": None,
                "status": "FAILED",
                "message": message or "上传失败，请检查文件后重试"
            })
        except Exception as exc:
            message = format_user_error_message(f"上传处理失败：{exc}")
            items.append({
                "filename": filename,
                "document_id": None,
                "task_id": None,
                "status": "FAILED",
                "message": message or "上传处理失败，请稍后重试"
            })

    # 只要产生了 document_id，就说明该文件已被系统接收或命中已有文档
    accepted = sum(1 for item in items if item["document_id"] is not None)
    total = len(items)

    # 返回批量处理摘要
    return {
        "success": accepted > 0,
        "total": total,
        "accepted": accepted,
        "failed": total - accepted,
        "items": items
    }
