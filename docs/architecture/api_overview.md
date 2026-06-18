# API 接口说明

本文档归档在 `docs/architecture/`，用于说明当前对外 HTTP 接口、响应字段和控制台只读接口。

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

用途：上传单个 PDF、TXT、Markdown 或 Word(.docx) 文件。上传成功后，FastAPI 会保存原始文件、写入文档记录，并派发 Celery 解析任务。

请求参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `file` | file | 上传文件，目前支持 `.pdf`、`.txt`、`.md`、`.docx` |

返回示例：

```json
{
  "msg": "上传成功，后台解析任务已提交",
  "doc_id": 15,
  "file_name": "rag_test_01.txt",
  "status": "PENDING",
  "task_id": "8c7d6f0d-2f5b-49e1-9f1d-2adf1b8f7e61"
}
```

注意：

- 相同内容的文件会按 Hash 去重，可能直接返回已有文档信息。
- 上传后解析是异步执行的，需要通过状态接口查看结果。
- 暂不支持 `.doc` 老格式，请转换为 `.docx` 后上传。

## 批量上传

接口：

```http
POST /api/v1/documents/batch-upload
```

用途：一次上传多个 PDF、TXT、Markdown 或 Word(.docx) 文件。接口会逐个校验、查重、保存原文件、创建文档记录并派发 Celery 解析任务；单个文件失败不会影响其他文件。

请求参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `files` | file[] | 多个上传文件，默认一次最多 10 个 |

返回示例：

```json
{
  "success": true,
  "total": 3,
  "accepted": 2,
  "failed": 1,
  "items": [
    {
      "filename": "policy_a.docx",
      "document_id": 21,
      "task_id": "8c7d6f0d-2f5b-49e1-9f1d-2adf1b8f7e61",
      "status": "PENDING",
      "message": "上传成功，后台解析任务已提交"
    },
    {
      "filename": "policy_b.txt",
      "document_id": 22,
      "task_id": "9b6c5f0d-7a1e-44d4-9e2f-4c90d0ef5b11",
      "status": "PENDING",
      "message": "上传成功，后台解析任务已提交"
    },
    {
      "filename": "old_file.doc",
      "document_id": null,
      "task_id": null,
      "status": "FAILED",
      "message": "暂不支持 .doc 老格式，请转换为 .docx 后上传。"
    }
  ]
}
```

注意：

- 支持扩展名：`.pdf`、`.txt`、`.md`、`.docx`。
- 单个文件超过配置的大小上限会在该文件结果中返回失败原因。
- 重复内容会按 Hash 命中已有文档，不会重复写入 MinIO 或重复派发解析任务。

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
    "status": "SUCCESS",
    "created_at": "2026-06-01T22:22:44",
    "chunk_count": 3,
    "error_message": null
  }
]
```

`chunk_count` 来自最近一次包含统计结果的解析任务；暂无统计时为 `null`。`error_message` 来自最近一次失败任务日志，成功文档通常为 `null`。

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
  "answer_type": "grounded",
  "used_retrieval": true,
  "sources": [
    {
      "doc_id": 15,
      "file_name": "rag_test_01.txt",
      "chunk_id": "doc_15_chunk_0",
      "page_number": null,
      "chunk_text": "RAG 的全称是 Retrieval-Augmented Generation...",
      "score": 4.12
    }
  ],
  "citations": [
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

字段说明：

| 字段 | 说明 |
|---|---|
| `answer_type` | `grounded`、`unanswerable` 或 `chitchat` |
| `used_retrieval` | 本次回答是否执行知识库检索 |
| `citations` | 标准引用字段 |
| `sources` | 为兼容现有调用方保留，与 `citations` 内容一致 |

普通问候和使用说明会直接返回 `chitchat`，不会调用 Embedding 或 Elasticsearch。检索结果不足或模型最终拒答时返回 `unanswerable`，并保证 `sources`、`citations` 都为空。

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

## 企业控制台评测报告

接口：

```http
GET /api/v1/eval/report
```

用途：只读加载 `evals/eval_results.json` 和 `evals/eval_report.md`，供控制台展示最近一次离线评测指标与失败用例。接口不会运行评测脚本，也不会修改评测产物。

主要返回字段：

| 字段 | 说明 |
|---|---|
| `available` | 是否读取到评测产物 |
| `generated_at` | 最近评测生成时间 |
| `retrieval` | 检索评测原始指标 |
| `answer` | 答案与引用评测原始指标 |
| `failures` | 汇总后的失败用例 |
| `report_markdown` | Markdown 报告原文 |
| `message` | 当前读取状态说明 |

## 企业控制台系统状态

接口：

```http
GET /api/v1/system/status
```

用途：汇总控制台需要的运行状态。PostgreSQL、MinIO、Redis、Elasticsearch 执行现有依赖检查；Celery 尝试 ping Worker；Embedding、LLM 和 Rerank 只展示配置状态，不主动发起模型调用。

状态可能包括：

| 状态 | 说明 |
|---|---|
| `ok` | 实际检查正常 |
| `error` | 实际检查异常 |
| `configured` | 已配置，但本接口未主动调用验证 |
| `disabled` | 当前未启用 |
| `unknown` | 无法确认运行状态 |

## 独立检索调试

接口：

```http
GET /api/v1/retrieval/test?query=RAG&top_k=5&top_n=30&use_rerank=false
```

用途：复用现有问题 Embedding 和 Elasticsearch Hybrid 检索能力返回排序后的 chunk，不调用 Chat 模型。`use_rerank=true` 时会对 baseline top_n 调用 DashScope `qwen3-rerank`；远端调用失败会保留 baseline 排序并返回 `fallback` 状态。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `query` | string | 必填，1 到 1000 个字符 |
| `top_k` | integer | 可选，范围 1 到 20，默认 5 |
| `top_n` | integer | 可选，范围 1 到 100，默认读取 `RERANK_TOP_N` |
| `use_rerank` | boolean | 可选，是否调用 DashScope 语义重排 |

响应同时返回 `baseline_results`、`rerank_results`、`rerank_status`、`rerank_provider`、`rerank_model` 和耗时字段。每条重排结果包含 `baseline_rank`、`rerank_rank` 与 `rerank_score`。`vector_score`、`keyword_score` 等字段可能为空；控制台只展示后端实际返回的分数字段。

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
      "message": "Redis 连接正常"
    },
    "elasticsearch": {
      "name": "Elasticsearch",
      "status": "ok",
      "message": "Elasticsearch 连接正常"
    }
  }
}
```
