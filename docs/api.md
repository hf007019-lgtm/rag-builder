# API 接口说明

服务默认地址：

```text
http://127.0.0.1:18000
```

Swagger 页面：

```text
http://127.0.0.1:18000/docs
```

## 文档上传

接口：

```http
POST /api/v1/documents/upload
```

用途：上传 PDF 或 TXT 文件。上传成功后，FastAPI 会保存原始文件、写入文档记录，并派发 Celery 解析任务。

请求参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `file` | file | 上传文件，目前支持 `.pdf`、`.txt` |

返回示例：

```json
{
  "msg": "上传成功，后台解析任务已提交",
  "doc_id": 15,
  "file_name": "rag_test_01.txt",
  "status": "PENDING"
}
```

注意：

- 相同内容的文件会按 Hash 去重，可能直接返回已有文档信息。
- 上传后解析是异步执行的，需要通过状态接口查看结果。

## 文档列表

接口：

```http
GET /api/v1/documents/
```

用途：查看已上传文档。

返回示例：

```json
[
  {
    "id": 15,
    "file_name": "rag_test_01.txt",
    "status": "SUCCESS"
  }
]
```

## 文档状态

接口：

```http
GET /api/v1/documents/{doc_id}/status
```

用途：查看单个文档当前解析状态。

返回示例：

```json
{
  "id": 15,
  "file_name": "rag_test_01.txt",
  "status": "SUCCESS"
}
```

状态说明：

| 状态 | 说明 |
|---|---|
| `PENDING` | 等待 Worker 处理 |
| `PARSING` | Worker 正在解析 |
| `SUCCESS` | 已写入 Elasticsearch |
| `FAILED` | 解析或入库失败 |

## 任务日志

接口：

```http
GET /api/v1/documents/{doc_id}/task-log
```

用途：查看 Worker 执行过程和失败原因。

返回示例：

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
    "created_at": "2026-06-01T22:22:44",
    "updated_at": "2026-06-01T22:22:45"
  }
]
```

## 重试解析

接口：

```http
POST /api/v1/documents/{doc_id}/retry
```

用途：重新派发失败文档的解析任务。

返回示例：

```json
{
  "doc_id": 20,
  "status": "PENDING",
  "message": "文档已重新加入解析队列"
}
```

注意：

- 只有 `FAILED` 文档允许重试。
- `SUCCESS` 文档会被拒绝，避免重复写入 Elasticsearch。

## 删除文档

接口：

```http
DELETE /api/v1/documents/{doc_id}
```

用途：删除文档记录及关联资源。

返回示例：

```json
{
  "msg": "文档删除成功",
  "doc_id": 15,
  "file_name": "rag_test_01.txt",
  "deleted_chunks": 1
}
```

删除时会处理：

- MinIO 原始文件
- Elasticsearch 中对应 chunks
- PostgreSQL `documents` 记录

当前实现会保留 `task_logs` 历史记录。

## RAG 问答

接口：

```http
POST /api/v1/search/ask
```

用途：基于已入库的文档内容回答问题，并返回来源片段。

请求参数：

```json
{
  "question": "RAG 是什么？"
}
```

返回示例：

```json
{
  "answer": "RAG 是检索增强生成，会先检索相关知识，再结合上下文生成回答。",
  "sources": [
    {
      "doc_id": 15,
      "file_name": "rag_test_01.txt",
      "chunk_id": "doc_15_chunk_0",
      "page_number": null,
      "chunk_text": "RAG 的全称是 Retrieval-Augmented Generation...",
      "score": 4.12
    }
  ]
}
```

## 健康检查

基础检查：

```http
GET /api/v1/health
```

返回示例：

```json
{
  "status": "ok",
  "message": "RAG FastAPI 服务运行正常"
}
```

依赖检查：

```http
GET /api/v1/health/dependencies
```

返回示例：

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
