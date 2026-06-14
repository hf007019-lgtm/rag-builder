# 从 SQLAlchemy 导入 text
# text 用来执行简单 SQL，比如 SELECT 1
from sqlalchemy import text


# 从 Redis 客户端库导入 Redis
# Redis 用来连接 Redis 服务，并执行 ping 检查
from redis import Redis


# 从 Elasticsearch 客户端库导入 Elasticsearch
# Elasticsearch 用来连接 ES 服务，并执行 ping 检查
from elasticsearch import Elasticsearch


# 从数据库会话文件导入 SessionLocal
# SessionLocal 用来创建 PostgreSQL 数据库会话
from app.db.session import SessionLocal


# 从项目配置文件导入 settings
# settings 里保存 REDIS_URL、ES_URL 等配置
from app.core.config import settings


# 从 MinIO 客户端文件导入 minio_client 和 get_bucket_name
# minio_client 用来访问 MinIO
# get_bucket_name 用来获取当前项目使用的桶名
from app.db.minio_client import minio_client, get_bucket_name


# 定义生成成功结果的工具函数
# name 表示依赖名称，比如 PostgreSQL
# message 表示成功说明
def build_ok_result(name: str, message: str):

    # 返回统一格式的成功结果
    return {
        "name": name,
        "status": "ok",
        "message": message
    }


# 定义生成失败结果的工具函数
# name 表示依赖名称
# error 表示错误原因
def build_error_result(name: str, error: Exception):

    # 返回统一格式的失败结果
    return {
        "name": name,
        "status": "error",
        "message": f"{name} 检查失败：{type(error).__name__}"
    }


# 检查 PostgreSQL 是否正常
def check_postgresql():

    # 创建数据库会话
    db = SessionLocal()

    # 使用 try/except/finally 包住检查逻辑
    try:

        # 执行最简单的 SQL
        # SELECT 1 成功，说明 PostgreSQL 可以正常连接和执行查询
        db.execute(text("SELECT 1"))

        # 返回成功结果
        return build_ok_result(
            name="PostgreSQL",
            message="PostgreSQL 连接正常"
        )

    # 如果连接或查询失败
    except Exception as e:

        # 返回失败结果
        return build_error_result(
            name="PostgreSQL",
            error=e
        )

    # 无论成功失败，最后都关闭数据库连接
    finally:

        # 关闭数据库会话
        db.close()


# 检查 MinIO 是否正常
def check_minio():

    # 使用 try/except 捕获 MinIO 检查异常
    try:

        # 获取当前项目配置的 MinIO 桶名
        bucket_name = get_bucket_name()

        # 检查桶是否存在
        # 如果 MinIO 服务异常，这里会报错
        bucket_exists = minio_client.bucket_exists(bucket_name)

        # 如果桶不存在
        if not bucket_exists:

            # 主动抛出错误
            raise RuntimeError(f"MinIO 存储桶不存在：{bucket_name}")

        # 返回成功结果
        return build_ok_result(
            name="MinIO",
            message=f"MinIO 连接正常，存储桶存在：{bucket_name}"
        )

    # 如果 MinIO 检查失败
    except Exception as e:

        # 返回失败结果
        return build_error_result(
            name="MinIO",
            error=e
        )


# 检查 Redis 是否正常
def check_redis():

    # 使用 try/except 捕获 Redis 检查异常
    try:

        # 从 settings 中读取 Redis 地址
        # 如果没有配置，就使用你当前项目常用的本地 Redis 地址兜底
        redis_url = getattr(
            settings,
            "REDIS_URL",
            "redis://127.0.0.1:16379/0"
        )

        # 根据 redis_url 创建 Redis 客户端
        # socket_connect_timeout 表示连接超时时间，避免接口卡太久
        # socket_timeout 表示读写超时时间
        redis_client = Redis.from_url(
            redis_url,
            socket_connect_timeout=2,
            socket_timeout=2,
            decode_responses=True
        )

        # 执行 ping
        # 如果 Redis 正常，会返回 True
        redis_client.ping()

        # 关闭 Redis 连接
        redis_client.close()

        # 返回成功结果
        return build_ok_result(
            name="Redis",
            message="Redis 连接正常"
        )

    # 如果 Redis 检查失败
    except Exception as e:

        # 返回失败结果
        return build_error_result(
            name="Redis",
            error=e
        )


# 检查 Elasticsearch 是否正常
def check_elasticsearch():

    # 使用 try/except 捕获 ES 检查异常
    try:

        # 从 settings 中读取 Elasticsearch 地址
        # 如果没有配置，就使用本地默认地址兜底
        es_url = getattr(
            settings,
            "ES_URL",
            "http://127.0.0.1:9200"
        )

        # 创建 Elasticsearch 客户端
        es_client = Elasticsearch(
            es_url,
            headers={"Connection": "close"}
        )

        # 执行 ping 检查
        es_ok = es_client.ping()

        # 如果 ping 不通
        if not es_ok:

            # 主动抛出错误
            raise RuntimeError(f"Elasticsearch 无法连接：{es_url}")

        # 关闭 ES 客户端连接
        es_client.close()

        # 返回成功结果
        return build_ok_result(
            name="Elasticsearch",
            message="Elasticsearch 连接正常"
        )

    # 如果 ES 检查失败
    except Exception as e:

        # 返回失败结果
        return build_error_result(
            name="Elasticsearch",
            error=e
        )


# 检查全部依赖
def check_all_dependencies():

    # 依次检查所有依赖
    dependencies = {
        "postgresql": check_postgresql(),
        "minio": check_minio(),
        "redis": check_redis(),
        "elasticsearch": check_elasticsearch()
    }

    # 判断是否所有依赖都是 ok
    all_ok = all(
        item["status"] == "ok"
        for item in dependencies.values()
    )

    # 如果全部正常，整体状态就是 ok
    if all_ok:

        # 设置整体状态为 ok
        overall_status = "ok"

    # 如果有任何一个依赖异常，整体状态就是 degraded
    else:

        # degraded 表示系统部分依赖异常，但接口本身还能返回检查结果
        overall_status = "degraded"

    # 返回最终健康检查结果
    return {
        "status": overall_status,
        "dependencies": dependencies
    }
