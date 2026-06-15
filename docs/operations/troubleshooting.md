# 常见问题排查

## 文档说明

- 中文名：常见问题排查
- 文件作用：提供本地依赖、模型配置、Worker 和评测问题的快速检查命令。
- 为什么需要：减少新环境中因 Docker、端口、配置和终端编码导致的启动阻塞。
- 英文文件名：`troubleshooting.md`，意为“故障排查”。

## Docker Desktop 未启动

现象通常包含 `dockerDesktopLinuxEngine` 或 `error during connect`。

```powershell
docker ps
```

先启动 Docker Desktop，等待 Engine 进入 Running 状态，再执行：

```powershell
docker compose up -d
```

## PostgreSQL 连接失败

```powershell
docker ps --filter "name=rag_postgres"
docker logs rag_postgres --tail 100
```

确认 `.env` 中的 `DATABASE_URL` 使用宿主机端口 `15432`，并与 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 一致。

## MinIO 连接失败

```powershell
docker ps --filter "name=rag_minio"
docker logs rag_minio --tail 100
```

本地 API 地址应为：

```env
MINIO_ENDPOINT=127.0.0.1:19002
```

`.env` 中的 `MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY` 必须与 Compose 初始化值一致。

## Redis 连接失败

项目宿主机端口是 `16379`：

```env
REDIS_URL=redis://127.0.0.1:16379/0
```

检查：

```powershell
docker ps --filter "name=rag_redis"
docker logs rag_redis --tail 100
```

FastAPI 和 Worker 必须使用同一 Redis 地址。

## Elasticsearch 连接失败

```powershell
docker ps --filter "name=rag_es"
docker logs rag_es --tail 100
Invoke-RestMethod -Uri "http://127.0.0.1:9200"
```

确认：

```env
ES_URL=http://127.0.0.1:9200
NO_PROXY=127.0.0.1,localhost
```

Elasticsearch 首次启动可能需要等待一段时间。Embedding 维度还必须与 `ES_VECTOR_DIMS` 一致。

## 文档一直 PENDING

优先检查 Worker 和 Redis：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

启动日志应包含：

```text
worker.tasks.parse_document_task
```

如果 Worker 已启动，继续检查 FastAPI 与 Worker 的 Redis 地址是否一致，以及上传时是否出现 Celery 投递异常。

## PowerShell 中文乱码

先切换当前终端到 UTF-8：

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

读取文件时显式指定编码：

```powershell
Get-Content -Encoding UTF8 README.md
```

## DashScope API Key 未配置

`.env` 中应使用自己的 Key：

```env
LLM_API_KEY=your_dashscope_api_key
DASHSCOPE_API_KEY=your_dashscope_api_key
```

检查配置：

```powershell
python scripts/check_env.py
```

修改 `.env` 后需要重启 FastAPI 和 Worker。不要把真实 Key 写入 README、日志或 Git。

## Rerank 未开启

默认配置不会把 rerank 应用到正式问答：

```env
RERANK_ENABLED=false
RERANK_APPLY_TO_ASK=false
```

仅做检索评测时可直接运行：

```powershell
python evals/run_retrieval_eval.py --use-rerank --top-k 3 --top-n 30
```

控制台检索调试也可以显式启用 rerank。远端调用失败时系统会回退 baseline，并返回降级原因。

## 评测结果为 0

先确认 Elasticsearch 中存在与用例匹配的 Chunk：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:9200/rag_chunks/_count"
```

结果为 0 或用例关键词与知识库不匹配时，召回指标为 0 是预期现象，不代表整个系统损坏。上传并解析对应测试文档后重新运行：

```powershell
python evals/run_retrieval_eval.py
python evals/run_answer_eval.py
```

## Worker 在 Windows 启动失败

使用 `solo`：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

如果出现 Kerberos / `gssapi` 错误，而项目并不使用 Kerberos：

```powershell
python -m pip uninstall -y gssapi
```

## 修改 .env 后没有生效

配置在进程启动时加载。停止并重新启动 FastAPI 和 Worker，不要只刷新浏览器。

## 推荐排查顺序

```text
docker ps
-> docker logs 对应容器
-> /api/v1/health/dependencies
-> FastAPI 日志
-> Worker 日志
-> documents.status
-> task_logs.error_message
-> .env 配置
```
