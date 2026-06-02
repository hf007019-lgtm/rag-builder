# RAG Builder 测试流程文档

## 1. 测试目标

本文档用于记录 RAG Builder 项目的本地测试流程。

测试目标是验证以下能力是否正常：

- FastAPI 服务是否能启动
- PostgreSQL 是否能保存文档元数据
- MinIO 是否能保存原始文件
- Redis 是否能派发 Celery 任务
- Celery Worker 是否能后台解析文档
- Elasticsearch 是否能保存 chunk 和 vector
- RAG 问答接口是否能返回答案和来源
- task_logs 是否能记录任务日志
- retry 接口是否能处理失败任务
- health 接口是否能检查系统依赖

---

## 2. 启动顺序

建议按照下面顺序启动项目。

### 2.1 启动 Docker 依赖服务

```powershell
docker compose up -d
```

需要确认以下服务正常运行：

- PostgreSQL
- MinIO
- Redis
- Elasticsearch

可以执行：

```powershell
docker ps
```

---

### 2.2 初始化数据库

```powershell
python scripts/init_db.py
```

成功结果：

```text
🚀 开始初始化 PostgreSQL 数据表...
✅ PostgreSQL 数据表初始化完成
```

---

### 2.3 启动 FastAPI

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 18000
```

成功后浏览器访问：

```text
http://127.0.0.1:18000/docs
```

如果能看到 Swagger 接口页面，说明 FastAPI 启动成功。

---

### 2.4 启动 Celery Worker

Windows 环境建议使用：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

成功后终端应该看到类似：

```text
celery@你的电脑名 ready.
```

---

## 3. 测试文档准备

### 3.1 TXT 测试文件

文件名：

```text
task_log_test_01.txt
```

文件内容：

```text
任务日志测试文档 01

这是一个用于测试 task_logs 表的 RAG 文档。

如果系统正常工作，FastAPI 会把文档上传到 MinIO，并在 PostgreSQL 的 documents 表中创建记录。

随后 Celery Worker 会接收解析任务，读取 MinIO 文件，执行解析、清洗、切块、向量化，并写入 Elasticsearch。

最后 Worker 应该把任务执行结果写入 task_logs 表，包括任务状态、chunk 数量和执行说明。
```

---

### 3.2 RAG 问答测试文件

文件名：

```text
rag_test_01.txt
```

文件内容：

```text
RAG 测试文档 01

RAG 的全称是 Retrieval-Augmented Generation，中文通常叫检索增强生成。

RAG 系统的核心流程是：先从知识库中检索与用户问题相关的内容，再把检索到的内容作为上下文交给大模型生成回答。

RAG 可以减少大模型幻觉，提高回答的准确性和可追溯性。

在本项目中，PostgreSQL 用于保存文档元数据，MinIO 用于保存原始文件，Redis 和 Celery 用于异步任务调度，Elasticsearch 用于保存文本切片和向量。
```

---

## 4. 文档上传测试

### 4.1 接口地址

```http
POST /api/v1/documents/upload
```

浏览器打开 Swagger：

```text
http://127.0.0.1:18000/docs
```

找到：

```text
POST /api/v1/documents/upload
```

上传 `task_log_test_01.txt` 或 `rag_test_01.txt`。

---

### 4.2 预期结果

上传成功后返回类似：

```json
{
  "id": 15,
  "file_name": "task_log_test_01.txt",
  "status": "PENDING",
  "message": "文档上传成功，已加入解析队列"
}
```

---

## 5. Worker 解析测试

上传文档后，观察 Celery Worker 终端。

正常应该看到类似日志：

```text
🌟 Worker 接到任务：开始解析文档 ID [15]
📄 当前处理文件：task_log_test_01.txt
📖 文档解析成功，原始长度: xxx 字符
🧼 文本清洗完成，清洗后长度: xxx 字符
🔪 开始切分文本
🧩 文本被成功切分为 x 块
🧠 开始调用 Embedding 模型提取向量特征
✨ 向量化完成
📥 成功将数据存入向量数据库
✅ 文档 ID [15] 处理成功
```

---

## 6. 查询文档状态

### 6.1 接口地址

```http
GET /api/v1/documents/{doc_id}/status
```

示例：

```text
http://127.0.0.1:18000/api/v1/documents/15/status
```

---

### 6.2 预期结果

```json
{
  "id": 15,
  "file_name": "task_log_test_01.txt",
  "status": "SUCCESS"
}
```

如果状态是：

```text
PENDING
```

说明任务还在等待。

如果状态是：

```text
PARSING
```

说明 Worker 正在解析。

如果状态是：

```text
FAILED
```

说明后台解析失败，需要查看任务日志。

---

## 7. 查询任务日志

### 7.1 接口地址

```http
GET /api/v1/documents/{doc_id}/task-log
```

示例：

```text
http://127.0.0.1:18000/api/v1/documents/15/task-log
```

---

### 7.2 预期结果

```json
[
  {
    "id": 2,
    "doc_id": 15,
    "task_name": "parse_document_task",
    "status": "SUCCESS",
    "message": "文档解析成功，共生成 1 个 chunk",
    "chunk_count": 1,
    "error_message": null,
    "created_at": "2026-06-01T22:22:44.000000",
    "updated_at": "2026-06-01T22:22:45.000000"
  }
]
```

---

## 8. RAG 问答测试

### 8.1 接口地址

```http
POST /api/v1/search/ask
```

### 8.2 请求参数

```json
{
  "question": "RAG 是什么？"
}
```

---

### 8.3 预期结果

```json
{
  "answer": "RAG 是检索增强生成，它会先从知识库中检索相关内容，再交给大模型生成回答。",
  "sources": [
    {
      "doc_id": 16,
      "file_name": "rag_test_01.txt",
      "chunk_id": "doc_16_chunk_0",
      "page_number": null,
      "chunk_text": "RAG 的全称是 Retrieval-Augmented Generation...",
      "score": 4.12
    }
  ]
}
```

重点检查：

- answer 是否能回答问题
- sources 是否有内容
- file_name 是否正确
- chunk_text 是否来自上传文档
- score 是否存在

---

## 9. 失败重试测试

### 9.1 接口地址

```http
POST /api/v1/documents/{doc_id}/retry
```

示例：

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18000/api/v1/documents/15/retry"
```

---

### 9.2 SUCCESS 文档的预期结果

如果文档已经是 `SUCCESS`，返回：

```json
{
  "detail": "文档已经解析成功，无需重新解析"
}
```

这是正常结果。

原因是：

```text
成功文档不允许重复解析，避免 Elasticsearch 中重复写入 chunk。
```

---

### 9.3 FAILED 文档的预期结果

如果文档状态是 `FAILED`，调用 retry 后返回：

```json
{
  "doc_id": 20,
  "status": "PENDING",
  "message": "文档已重新加入解析队列"
}
```

然后 Worker 会重新执行解析任务。

---

## 10. 删除文档测试

### 10.1 接口地址

```http
DELETE /api/v1/documents/{doc_id}
```

示例：

```powershell
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:18000/api/v1/documents/15"
```

---

### 10.2 预期结果

```json
{
  "msg": "文档删除成功",
  "doc_id": 15,
  "file_name": "task_log_test_01.txt",
  "deleted_chunks": 1
}
```

删除时系统会尝试删除：

- MinIO 原始文件
- Elasticsearch chunks
- PostgreSQL documents 记录

当前设计中：

```text
task_logs 历史日志保留。
```

---

## 11. 健康检查测试

### 11.1 基础健康检查

接口地址：

```http
GET /api/v1/health
```

浏览器访问：

```text
http://127.0.0.1:18000/api/v1/health
```

预期结果：

```json
{
  "status": "ok",
  "message": "RAG FastAPI 服务运行正常"
}
```

---

### 11.2 依赖健康检查

接口地址：

```http
GET /api/v1/health/dependencies
```

浏览器访问：

```text
http://127.0.0.1:18000/api/v1/health/dependencies
```

预期结果：

```json
{
  "status": "ok",
  "dependencies": {
    "postgresql": {
      "name": "PostgreSQL",
      "status": "ok",
      "message": "PostgreSQL 连接正常"
    },
    "minio": {
      "name": "MinIO",
      "status": "ok",
      "message": "MinIO 连接正常，存储桶存在：rag-docs"
    },
    "redis": {
      "name": "Redis",
      "status": "ok",
      "message": "Redis 连接正常：redis://127.0.0.1:16379/0"
    },
    "elasticsearch": {
      "name": "Elasticsearch",
      "status": "ok",
      "message": "Elasticsearch 连接正常：http://127.0.0.1:9200"
    }
  }
}
```

如果某个依赖是：

```text
error
```

说明对应服务没有启动或配置错误。

---

## 12. 常见问题

### 12.1 Worker 没有接到任务

检查：

1. Redis 是否启动
2. FastAPI 和 Worker 是否使用同一个 REDIS_URL
3. Worker 是否用正确命令启动

正确命令：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

---

### 12.2 文档一直是 PENDING

可能原因：

1. Worker 没启动
2. Redis 地址不一致
3. Celery 任务没有注册成功

---

### 12.3 Embedding 报 401

原因：

```text
LLM_API_KEY 错误、失效或没有读取到。
```

解决：

1. 检查 `.env`
2. 修改 `LLM_API_KEY`
3. 重启 Worker

---

### 12.4 Elasticsearch 连接失败

检查：

1. Docker 里的 Elasticsearch 是否启动
2. `ES_URL` 是否正确
3. 本地代理是否影响 127.0.0.1

---

### 12.5 PowerShell 调接口出现红色报错

如果接口返回 400 / 404，PowerShell 会显示红色异常。

例如：

```text
{"detail":"文档已经解析成功，无需重新解析"}
```

这不是程序崩溃，而是接口主动返回的业务错误。

---

## 13. 测试完成标准

当以下内容全部通过时，说明项目核心功能测试完成：

- FastAPI 能正常启动
- Worker 能正常启动
- 文档能上传
- 文档状态能从 PENDING 变成 SUCCESS
- Worker 日志显示解析成功
- task_logs 能查询到 SUCCESS 记录
- RAG 问答能返回 answer
- RAG 问答能返回 sources
- health dependencies 全部为 ok
- 删除文档能删除 ES chunks
- retry 接口能正确限制 SUCCESS 文档