# 导入 os 模块
# 作用：从系统环境变量或 .env 文件中读取配置
import os


# 从 dotenv 导入 load_dotenv
# 作用：加载项目根目录下的 .env 文件
from dotenv import load_dotenv


# 加载 .env 文件
# override=True 表示优先使用 .env 中的配置覆盖系统已有配置
load_dotenv(override=True)


# 定义读取必填环境变量的函数
# key：环境变量名称
# description：这个变量的中文说明
def get_required_env(key: str, description: str) -> str:

    # 从环境变量中读取配置值
    value = os.getenv(key)

    # 如果配置不存在或是空字符串
    if not value:

        # 抛出中文错误，方便你定位是哪一项配置缺失
        raise ValueError(f"缺少必要环境变量：{key}（{description}），请检查 .env 文件")

    # 返回读取到的配置值
    return value


# 定义读取可选环境变量的函数
# key：环境变量名称
# default：默认值
def get_optional_env(key: str, default: str) -> str:

    # 从环境变量中读取配置
    # 如果没有读取到，就使用默认值
    return os.getenv(key, default)


# 定义项目配置类
# 作用：统一管理数据库、MinIO、Redis、Elasticsearch、大模型等配置
class Settings:

    # PostgreSQL 数据库连接地址
    # 这是敏感配置，必须从 .env 中读取，不能在代码里写死账号密码
    DATABASE_URL: str = get_required_env(
        "DATABASE_URL",
        "PostgreSQL 数据库连接地址"
    )

    # MinIO 服务地址
    # 本地默认使用 127.0.0.1:9002
    MINIO_ENDPOINT: str = get_optional_env(
        "MINIO_ENDPOINT",
        "127.0.0.1:9002"
    )

    # MinIO 访问账号
    # 本地开发可以使用默认值，生产环境建议在 .env 中显式配置
    MINIO_ACCESS_KEY: str = get_optional_env(
        "MINIO_ACCESS_KEY",
        "minio_admin"
    )

    # MinIO 访问密码
    # 本地开发可以使用默认值，生产环境建议在 .env 中显式配置
    MINIO_SECRET_KEY: str = get_optional_env(
        "MINIO_SECRET_KEY",
        "minio_secure"
    )

    # MinIO 存储桶名称
    # 用于保存用户上传的 PDF/TXT 原始文件
    MINIO_BUCKET_NAME: str = get_optional_env(
        "MINIO_BUCKET_NAME",
        "rag-docs"
    )

    # Redis 连接地址
    # Redis 用作 Celery 的消息队列
    REDIS_URL: str = get_optional_env(
        "REDIS_URL",
        "redis://127.0.0.1:16379/0"
    )

    # Elasticsearch 服务地址
    # 用于保存 chunk 和 vector，并提供检索能力
    ES_URL: str = get_optional_env(
        "ES_URL",
        "http://127.0.0.1:9200"
    )

    # Elasticsearch 索引名称
    # 本项目默认使用 rag_chunks 保存文本块和向量
    ES_INDEX_NAME: str = get_optional_env(
        "ES_INDEX_NAME",
        "rag_chunks"
    )

    # Elasticsearch 向量维度
    # 必须和 Embedding 模型输出维度一致
    ES_VECTOR_DIMS: int = int(
        get_optional_env(
            "ES_VECTOR_DIMS",
            "1536"
        )
    )

    # 大模型 API 地址
    # 例如 DashScope 的 OpenAI 兼容接口地址
    LLM_BASE_URL: str = get_required_env(
        "LLM_BASE_URL",
        "大模型 API 地址"
    )

    # 大模型 API Key
    # 这是敏感配置，必须从 .env 中读取，不能写进代码或公开文档
    LLM_API_KEY: str = get_required_env(
        "LLM_API_KEY",
        "大模型 API Key"
    )

    # Embedding 模型名称
    # 用于把文本 chunk 和用户问题转成向量
    EMBEDDING_MODEL_NAME: str = get_optional_env(
        "EMBEDDING_MODEL_NAME",
        "text-embedding-v2"
    )

    # 聊天模型名称
    # 用于根据检索到的上下文生成最终回答
    CHAT_MODEL_NAME: str = get_optional_env(
        "CHAT_MODEL_NAME",
        "qwen-plus"
    )


# 创建全局配置对象
# 项目其他地方通过 from app.core.config import settings 来使用配置
settings = Settings()