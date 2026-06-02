# 从 Celery 应用文件导入 celery_app
# celery_app 用来注册和执行后台任务
from worker.celery_app import celery_app


# 从数据库会话文件导入 SessionLocal
# SessionLocal 用来创建 PostgreSQL 数据库连接会话
from app.db.session import SessionLocal


# 从模型统一导出文件导入 Document 和 TaskLog
# Document 对应 documents 表
# TaskLog 对应 task_logs 表
from app.models import Document, TaskLog


# 从项目常量文件导入文档状态
# 这些状态用于更新 documents 表里的 status 字段
from app.core.constants import (
    DOCUMENT_STATUS_PARSING,
    DOCUMENT_STATUS_SUCCESS,
    DOCUMENT_STATUS_FAILED
)


# 从统一 MinIO 客户端文件导入相关工具
# minio_client 用来读取 MinIO 中的原始文件
# get_bucket_name 用来获取桶名称
# ensure_bucket_exists 用来确保桶存在
from app.db.minio_client import (
    minio_client,
    get_bucket_name,
    ensure_bucket_exists
)


# 从文档处理核心引擎导入 DeepDocEngine
# DeepDocEngine 负责文本切块和 Embedding 向量化
from worker.deepdoc.core_engine import DeepDocEngine


# 从文档入库流水线导入 DocumentIngestionPipeline
# DocumentIngestionPipeline 负责解析、清洗、切块、向量化、写入 ES 的完整流程
from worker.pipeline.ingestion_pipeline import DocumentIngestionPipeline


# Worker 启动时初始化一次 DeepDocEngine
# 这样每次任务执行时不用重复初始化大模型客户端
engine = DeepDocEngine()


# 创建文档入库流水线对象
# 把上面的 engine 传进去复用
ingestion_pipeline = DocumentIngestionPipeline(engine=engine)


# 定义创建任务日志的工具函数
# db 是数据库会话
# doc_id 是文档 ID
# status 是任务状态
# message 是任务说明
def create_task_log(db, doc_id: int, status: str, message: str):

    # 创建 TaskLog 对象
    # 这一步只是创建 Python 对象，还没有真正写入数据库
    task_log = TaskLog(
        doc_id=doc_id,
        task_name="parse_document_task",
        status=status,
        message=message
    )

    # 把任务日志对象加入数据库会话
    db.add(task_log)

    # 提交事务，把日志真正写入 PostgreSQL
    db.commit()

    # 刷新 task_log 对象，拿到数据库自动生成的 id
    db.refresh(task_log)

    # 返回任务日志对象
    return task_log


# 定义更新任务日志为成功的工具函数
# task_log 是前面创建的任务日志记录
# chunk_count 是最终生成的 chunk 数量
# message 是成功说明
def mark_task_log_success(db, task_log: TaskLog, chunk_count: int, message: str):

    # 把任务状态改成 SUCCESS
    task_log.status = "SUCCESS"

    # 保存成功说明
    task_log.message = message

    # 保存生成的 chunk 数量
    task_log.chunk_count = chunk_count

    # 提交更新到 PostgreSQL
    db.commit()


# 定义更新任务日志为失败的工具函数
# task_log 是前面创建的任务日志记录
# error_message 是失败原因
def mark_task_log_failed(db, task_log: TaskLog, error_message: str):

    # 把任务状态改成 FAILED
    task_log.status = "FAILED"

    # 保存失败说明
    task_log.message = "文档解析失败"

    # 保存详细错误原因
    task_log.error_message = error_message

    # 提交更新到 PostgreSQL
    db.commit()


# 定义从 MinIO 读取文件二进制内容的函数
# file_name 是 MinIO 里的对象名称，也就是用户上传时的文件名
def read_file_bytes_from_minio(file_name: str) -> bytes:

    # 确保 MinIO 桶存在
    # 正常上传时桶已经存在，这里再检查一次是为了 Worker 更稳定
    ensure_bucket_exists()

    # 获取当前配置里的 MinIO 桶名称
    bucket_name = get_bucket_name()

    # 从 MinIO 获取文件对象
    response = minio_client.get_object(
        bucket_name=bucket_name,
        object_name=file_name
    )

    # 使用 try/finally 保证读取结束后一定释放连接
    try:

        # 读取文件二进制内容
        file_bytes = response.read()

    finally:

        # 关闭 MinIO 响应对象
        response.close()

        # 释放底层网络连接
        response.release_conn()

    # 返回读取到的文件内容
    return file_bytes


# 注册 Celery 后台任务
# FastAPI 上传文件后，会发送这个任务给 Worker
@celery_app.task
def parse_document_task(doc_id: int):

    # 打印任务开始日志
    print(f"🌟 Worker 接到任务：开始解析文档 ID [{doc_id}]")

    # 创建 PostgreSQL 数据库会话
    db = SessionLocal()

    # 先定义 task_log 为空
    # 这样如果任务中途失败，except 里也能判断有没有日志可更新
    task_log = None

    try:

        # 根据 doc_id 查询 documents 表
        doc = db.query(Document).filter(Document.id == doc_id).first()

        # 如果文档不存在，直接抛出错误
        if not doc:
            raise ValueError(f"文档不存在：doc_id={doc_id}")

        # 创建一条任务开始日志
        task_log = create_task_log(
            db=db,
            doc_id=doc_id,
            status="STARTED",
            message="Worker 已接到任务，开始解析文档"
        )

        # 把文档状态改成 PARSING
        # 表示 Worker 已经开始处理这个文档
        doc.status = DOCUMENT_STATUS_PARSING

        # 提交文档状态更新
        db.commit()

        # 打印当前正在处理的文件名
        print(f"📄 当前处理文件：{doc.file_name}")

        # 从 MinIO 读取原始文件二进制内容
        file_bytes = read_file_bytes_from_minio(doc.file_name)

        # 调用文档入库流水线
        # 这里会完成：解析、清洗、切块、向量化、写入 Elasticsearch
        result = ingestion_pipeline.process(
            doc_id=doc_id,
            file_name=doc.file_name,
            file_bytes=file_bytes
        )

        # 从流水线结果中取出 chunk 数量
        chunk_count = result["chunk_count"]

        # 把文档状态改成 SUCCESS
        doc.status = DOCUMENT_STATUS_SUCCESS

        # 提交文档成功状态
        db.commit()

        # 更新任务日志为成功
        mark_task_log_success(
            db=db,
            task_log=task_log,
            chunk_count=chunk_count,
            message=f"文档解析成功，共生成 {chunk_count} 个 chunk"
        )

        # 打印成功日志
        print(
            f"✅ 文档 ID [{doc_id}] 处理成功，"
            f"共生成 {chunk_count} 个 chunk"
        )

        # 返回中文任务结果
        return f"文档 {doc_id} 处理成功，共生成 {chunk_count} 个 chunk"

    except Exception as e:

        # 把异常转成字符串，方便保存到数据库
        error_message = str(e)

        # 打印失败日志
        print(f"❌ 文档 ID [{doc_id}] 解析失败：{error_message}")

        # 尝试查询失败的文档
        failed_doc = db.query(Document).filter(Document.id == doc_id).first()

        # 如果文档存在，就把状态改成 FAILED
        if failed_doc:

            # 更新文档状态为 FAILED
            failed_doc.status = DOCUMENT_STATUS_FAILED

            # 提交失败状态
            db.commit()

        # 如果前面已经创建了任务日志，就更新为失败
        if task_log:

            # 更新任务日志为失败
            mark_task_log_failed(
                db=db,
                task_log=task_log,
                error_message=error_message
            )

        # 继续抛出异常
        # 这样 Celery 终端可以看到完整错误信息
        raise e

    finally:

        # 无论成功还是失败，都关闭数据库会话
        db.close()