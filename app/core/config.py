import os
from dotenv import load_dotenv

load_dotenv(override=True)

class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://rag_admin:rag_secure@127.0.0.1:15432/rag_db"

    )

    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "127.0.0.1:9002")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minio_admin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minio_secure")
    MINIO_BUCKET_NAME: str = os.getenv("MINIO_BUCKET_NAME", "rag-docs")

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:16379/0")

    ES_URL: str = os.getenv("ES_URL", "http://127.0.0.1:9200")
    ES_INDEX_NAME: str = os.getenv("ES_INDEX_NAME", "rag_chunks")
    ES_VECTOR_DIMS: int = int(os.getenv("ES_VECTOR_DIMS", "1536"))

    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")

    EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-v2")
    CHAT_MODEL_NAME: str = os.getenv("CHAT_MODEL_NAME", "qwen-plus")


settings = Settings()
