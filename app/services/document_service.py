# 从 FastAPI 导入 HTTPException
# 作用：当文档不存在、状态不允许操作时，返回接口错误
from fastapi import HTTPException


# 从数据库会话文件导入 SessionLocal
# 作用：创建 PostgreSQL 数据库连接
from app.db.session import SessionLocal


# 从模型统一导出文件导入 Document 和 TaskLog
# Document 对应 documents 表
# TaskLog 对应 task_logs 表
from app.models import Document, TaskLog


# 从项目常量文件导入文档状态
# 作用：避免在代码里到处手写 "PENDING"、"PARSING"、"SUCCESS"、"FAILED"
from app.core.constants import (
    DOCUMENT_STATUS_PENDING,
    DOCUMENT_STATUS_PARSING,
    DOCUMENT_STATUS_SUCCESS,
    DOCUMENT_STATUS_FAILED
)


# 从 MinIO 客户端文件导入 minio_client 和桶名函数
# 作用：删除 MinIO 中的原始文件
from app.db.minio_client import minio_client, get_bucket_name


# 从 Elasticsearch 向量库客户端导入 VectorStore
# 作用：删除 ES 中该文档对应的 chunks
from worker.deepdoc.es_client import VectorStore


# 从 Celery 应用文件导入 celery_app
# 作用：重新派发后台解析任务
# 注意：这里不要直接 import worker.tasks，否则 FastAPI 启动时可能提前初始化 Worker 任务
from worker.celery_app import celery_app


# 查询单个文档状态
# doc_id：文档 ID
def get_document_status(doc_id: int):

    # 创建数据库会话
    db = SessionLocal()

    # 使用 try/finally 保证数据库连接最终关闭
    try:

        # 根据 doc_id 查询文档
        doc = db.query(Document).filter(Document.id == doc_id).first()

        # 如果文档不存在，返回 404
        if not doc:
            raise HTTPException(status_code=404, detail="文档不存在")

        # 返回文档状态信息
        return {
            "id": doc.id,
            "file_name": doc.file_name,
            "status": doc.status
        }

    # 最终关闭数据库连接
    finally:

        # 关闭数据库会话
        db.close()


# 查询文档列表
# 作用：返回所有上传过的文档
def list_documents():

    # 创建数据库会话
    db = SessionLocal()

    # 使用 try/finally 保证数据库连接最终关闭
    try:

        # 查询所有文档，并按 ID 倒序排列
        docs = db.query(Document).order_by(Document.id.desc()).all()

        # 一次读取任务日志，补充最近一次可用的 chunk 数量。
        doc_ids = [doc.id for doc in docs]
        chunk_count_by_doc_id = {}

        if doc_ids:
            logs = (
                db.query(TaskLog)
                .filter(TaskLog.doc_id.in_(doc_ids))
                .order_by(TaskLog.id.desc())
                .all()
            )

            for log in logs:
                if (
                    log.doc_id not in chunk_count_by_doc_id
                    and log.chunk_count is not None
                ):
                    chunk_count_by_doc_id[log.doc_id] = log.chunk_count

        # 创建结果列表
        result = []

        # 遍历每一个文档对象
        for doc in docs:

            # 把 ORM 对象转换成普通字典
            result.append({
                "id": doc.id,
                "file_name": doc.file_name,
                "status": doc.status,
                "created_at": doc.created_at,
                "chunk_count": chunk_count_by_doc_id.get(doc.id)
            })

        # 返回文档列表
        return result

    # 最终关闭数据库连接
    finally:

        # 关闭数据库会话
        db.close()


# 删除文档业务函数
# 作用：同时删除 PostgreSQL 记录、MinIO 原文件、Elasticsearch chunks
# 注意：这里不删除 task_logs，保留历史任务日志
def delete_document(doc_id: int):

    # 创建数据库会话
    db = SessionLocal()

    # 使用 try/finally 保证数据库连接最终关闭
    try:

        # 根据 doc_id 查询文档
        doc = db.query(Document).filter(Document.id == doc_id).first()

        # 如果文档不存在，返回 404
        if not doc:
            raise HTTPException(status_code=404, detail="文档不存在")

        # 保存文件名
        # 作用：后面删除 MinIO 文件和返回结果都要用
        file_name = doc.file_name

        # 获取 MinIO 桶名
        bucket_name = get_bucket_name()

        # 尝试删除 MinIO 原始文件
        try:

            # 从 MinIO 删除对象
            minio_client.remove_object(
                bucket_name=bucket_name,
                object_name=file_name
            )

            # 打印删除成功日志
            print(f"✅ 已删除 MinIO 文件: {file_name}")

        # 如果 MinIO 删除失败
        except Exception as e:

            # 打印警告，不直接中断
            # 原因：有些历史测试数据可能数据库里有记录，但 MinIO 文件已不存在
            print(f"⚠️ 删除 MinIO 文件失败，可能文件已不存在: {e}")

        # 创建 VectorStore 实例
        # 作用：连接 ES，准备删除 chunks
        vector_store = VectorStore()

        # 删除 Elasticsearch 中该文档对应的所有 chunks
        deleted_chunks = vector_store.delete_chunks_by_doc_id(doc_id)

        # 从 PostgreSQL 删除文档记录
        db.delete(doc)

        # 提交数据库事务
        db.commit()

        # 返回删除结果
        return {
            "msg": "文档删除成功",
            "doc_id": doc_id,
            "file_name": file_name,
            "deleted_chunks": deleted_chunks
        }

    # 最终关闭数据库连接
    finally:

        # 关闭数据库会话
        db.close()


# 查询某个文档的任务日志
# doc_id 表示 documents 表里的文档 ID
def get_document_task_logs(doc_id: int):

    # 创建数据库会话
    db = SessionLocal()

    # 使用 try/finally 保证最后一定关闭数据库连接
    try:

        # 先查询文档是否存在
        document = db.query(Document).filter(Document.id == doc_id).first()

        # 如果文档不存在
        if not document:

            # 返回 404 错误
            raise HTTPException(
                status_code=404,
                detail=f"文档不存在：doc_id={doc_id}"
            )

        # 查询这个文档对应的所有任务日志
        # 按 id 从大到小排序，最新日志排在最前面
        logs = (
            db.query(TaskLog)
            .filter(TaskLog.doc_id == doc_id)
            .order_by(TaskLog.id.desc())
            .all()
        )

        # 返回日志列表
        return logs

    # 无论成功还是失败，最后都关闭数据库会话
    finally:

        # 关闭数据库连接，避免连接泄漏
        db.close()


# 重新解析失败文档
# doc_id 表示 documents 表里的文档 ID
def retry_document_parse(doc_id: int):

    # 创建数据库会话
    db = SessionLocal()

    # 使用 try/finally 保证数据库连接最终关闭
    try:

        # 根据 doc_id 查询文档
        document = db.query(Document).filter(Document.id == doc_id).first()

        # 如果文档不存在，返回 404
        if not document:
            raise HTTPException(
                status_code=404,
                detail=f"文档不存在：doc_id={doc_id}"
            )

        # 如果文档已经在等待解析中，不允许重复重试
        if document.status == DOCUMENT_STATUS_PENDING:
            raise HTTPException(
                status_code=400,
                detail="文档已经在等待解析中，请不要重复重试"
            )

        # 如果文档正在解析中，不允许重复重试
        if document.status == DOCUMENT_STATUS_PARSING:
            raise HTTPException(
                status_code=400,
                detail="文档正在解析中，请等待当前任务完成"
            )

        # 如果文档已经成功，不允许重试
        # 原因：直接重试成功文档会导致 Elasticsearch 里重复写入 chunk
        if document.status == DOCUMENT_STATUS_SUCCESS:
            raise HTTPException(
                status_code=400,
                detail="文档已经解析成功，无需重新解析"
            )

        # 如果文档不是 FAILED，也不允许重试
        if document.status != DOCUMENT_STATUS_FAILED:
            raise HTTPException(
                status_code=400,
                detail=f"当前文档状态不支持重新解析：{document.status}"
            )

        # 把文档状态改回 PENDING
        # PENDING 表示重新进入等待解析队列
        document.status = DOCUMENT_STATUS_PENDING

        # 提交状态修改
        db.commit()

        # 重新派发 Celery 后台解析任务
        celery_app.send_task(
            "worker.tasks.parse_document_task",
            args=[doc_id]
        )

        # 返回接口响应
        return {
            "doc_id": doc_id,
            "status": DOCUMENT_STATUS_PENDING,
            "message": "文档已重新加入解析队列"
        }

    # 无论成功还是失败，最后都关闭数据库会话
    finally:

        # 关闭数据库连接
        db.close()
