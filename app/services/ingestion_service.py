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


# 从数据库会话文件导入 SessionLocal
# 作用：创建 PostgreSQL 数据库会话
from app.db.session import SessionLocal


# 从 MinIO 客户端文件导入相关对象和函数
# 作用：保存文件到 MinIO，并确保桶存在
from app.db.minio_client import minio_client, get_bucket_name, ensure_bucket_exists


# 从模型统一导出文件导入 Document
# 作用：操作 documents 表
from app.models import Document


# 从常量文件导入 PENDING 状态
# 作用：避免手写字符串
from app.core.constants import DOCUMENT_STATUS_PENDING


# 从 Celery 应用导入 celery_app
# 作用：上传成功后用 send_task 派发后台解析任务
from worker.celery_app import celery_app


# 允许上传的文件后缀
# 作用：第一阶段只支持 txt 和 pdf，防止用户上传乱七八糟的文件
ALLOWED_FILE_SUFFIXES = {".txt", ".pdf"}


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
            detail="文件缺少后缀名，目前仅支持：.txt、.pdf"
        )

    # 如果后缀不在允许列表中
    if suffix not in ALLOWED_FILE_SUFFIXES:

        # 返回 400 错误
        raise HTTPException(
            status_code=400,
            detail="暂不支持该文件类型，目前仅支持：.txt、.pdf"
        )

    # 返回合法后缀
    return suffix


# 定义上传文档业务函数
# 作用：完成文件类型校验、查重、保存文件、写数据库、派发 Celery 任务
async def upload_document(file: UploadFile):

    # 校验文件名是否存在
    if not file.filename:

        # 如果没有文件名，直接返回错误
        raise HTTPException(
            status_code=400,
            detail="上传文件名不能为空"
        )

    # 校验文件类型
    # 作用：只允许 .txt 和 .pdf
    validate_file_type(file.filename)

    # 确保 MinIO 桶存在
    ensure_bucket_exists()

    # 读取上传文件的全部二进制内容
    content = await file.read()

    # 如果文件内容为空
    if not content:

        # 直接返回错误
        raise HTTPException(
            status_code=400,
            detail="上传文件内容不能为空"
        )

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
                "status": existing_doc.status
            }

        # 获取 MinIO 桶名称
        bucket_name = get_bucket_name()

        # 使用原始文件名作为对象名
        # 注意：后面可以升级成 hash + 文件名，避免同名覆盖
        object_name = file.filename

        # 把二进制内容包装成文件流
        file_stream = BytesIO(content)

        # 上传文件到 MinIO
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=object_name,
            data=file_stream,
            length=len(content)
        )

        # 创建文档数据库对象，初始状态为 PENDING
        new_doc = Document(
            file_name=file.filename,
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
        celery_app.send_task(
            "worker.tasks.parse_document_task",
            args=[new_doc.id]
        )

        # 返回上传结果
        return {
            "msg": "上传成功，后台解析任务已提交",
            "doc_id": new_doc.id,
            "file_name": new_doc.file_name,
            "status": new_doc.status
        }

    # 最终关闭数据库连接
    finally:

        # 关闭数据库会话
        db.close()