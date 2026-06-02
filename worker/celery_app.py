from celery import Celery

celery_app = Celery(
    "rag_worker",
    broker="redis://127.0.0.1:16379/0",
    backend="redis://127.0.0.1:16379/0",
    include=["worker.tasks"]  # 告诉 Celery 去哪里找具体的任务代码
)