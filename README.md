# RAG Builder：轻量级企业知识库 RAG 问答系统

## 1. 项目简介

RAG Builder 是一个基于 FastAPI 构建的轻量级企业知识库 RAG 问答系统，也是一个本地可运行的 RAG 后端系统。

项目是参考 RAGFlow 工程思想的轻量实现，不追求复刻完整 RAGFlow，聚焦核心 RAG 链路实现，适合本地部署、功能演示和二次扩展。

系统支持 PDF / TXT 文档上传、异步解析、文本清洗、Chunk 切分、Embedding 向量化、Elasticsearch 检索、RAG 智能问答、来源追踪、任务日志、失败重试和系统依赖健康检查。

---

## 2. 项目定位

本项目目标是完成一个本地可运行的 RAG 后端系统，聚焦核心 RAG 链路实现，重点体现：

- RAG 核心链路设计能力
- FastAPI 后端开发能力
- 异步任务处理能力
- 向量检索工程实践能力
- 文档解析与入库流程设计能力
- 系统可观测性与错误追踪能力

本项目不是完整商业化系统，当前不包含用户登录、多租户权限、复杂前端后台、OCR 深度解析、知识图谱和复杂 Agent 工作流。

---

## 3. 核心功能

### 3.1 文档管理

- 支持 PDF / TXT 文档上传
- 支持文件类型校验
- 支持文件 Hash 去重
- 支持文档列表查询
- 支持文档状态查询
- 支持文档删除

### 3.2 异步解析

- 使用 Redis 作为任务队列
- 使用 Celery Worker 执行后台解析任务
- 上传后立即返回，不阻塞用户请求
- 后台完成文档解析、清洗、切块、向量化和入库

### 3.3 RAG 问答

- 用户问题 Embedding 向量化
- Elasticsearch 检索相关 chunk
- 构建 RAG 上下文
- 调用大模型生成回答
- 返回 answer 和 sources 来源

### 3.4 来源追踪

系统返回的 sources 包含：

- doc_id
- file_name
- chunk_id
- page_number
- chunk_text
- score

这样可以知道答案来自哪个文件、哪个文本块、哪一页。

### 3.5 任务日志

系统支持记录 Celery Worker 的任务执行过程，包括：

- 任务开始
- 任务成功
- 任务失败
- 失败原因
- 生成的 chunk 数量

### 3.6 失败重试

当文档解析失败后，可以通过接口重新派发解析任务。

### 3.7 健康检查

系统提供依赖健康检查接口，用于检查：

- PostgreSQL
- MinIO
- Redis
- Elasticsearch

---

## 4. 技术栈

| 技术 | 作用 |
|---|---|
| FastAPI | 后端 API 网关 |
| PostgreSQL | 保存文档元数据和任务日志 |
| SQLAlchemy | ORM 数据库操作 |
| MinIO | 保存原始 PDF / TXT 文件 |
| Redis | Celery 消息队列 |
| Celery | 异步任务处理 |
| Elasticsearch | 保存 chunk 和 vector，提供检索能力 |
| DashScope / Qwen | Embedding 和大模型回答 |
| Pydantic | 请求和响应数据模型 |
| Docker Compose | 本地依赖服务编排 |

---

## 5. 系统架构

```text
用户 / 前端 / 小程序
        ↓
FastAPI API 网关
        ↓
PostgreSQL / MinIO / Redis
        ↓
Celery Worker 后台解析
        ↓
Parser / Cleaner / Chunk / Embedding
        ↓
Elasticsearch 向量库
        ↓
RAG 检索问答
        ↓
大模型生成回答
```

核心组件职责：

```text
FastAPI：接收请求，提供接口
PostgreSQL：保存文档元数据、任务日志
MinIO：保存用户上传的原始文件
Redis：保存待执行的异步任务
Celery Worker：后台处理文档解析和入库
Elasticsearch：保存 chunk 和 vector，支持检索
大模型 API：提供 Embedding 和 Chat 能力
```

---

## 6. 项目目录结构

```text
rag_builder/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── document.py
│   │       ├── search.py
│   │       └── health.py
│   ├── core/
│   │   ├── config.py
│   │   ├── constants.py
│   │   └── proxy_guard.py
│   ├── db/
│   │   ├── session.py
│   │   └── minio_client.py
│   ├── models/
│   │   ├── document.py
│   │   └── task_log.py
│   ├── schemas/
│   │   ├── document.py
│   │   └── search.py
│   └── services/
│       ├── ingestion_service.py
│       ├── document_service.py
│       ├── search_service.py
│       └── health_service.py
│
├── worker/
│   ├── celery_app.py
│   ├── tasks.py
│   ├── deepdoc/
│   │   ├── core_engine.py
│   │   └── es_client.py
│   └── pipeline/
│       ├── ingestion_pipeline.py
│       ├── parser.py
│       ├── cleaner.py
│       └── metadata_extractor.py
│
├── scripts/
│   └── init_db.py
│
├── docs/
│   ├── api.md
│   └── architecture.md
│
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── README.md
```

---

## 7. 核心流程

### 7.1 文档上传流程

```text
用户上传 PDF/TXT
↓
FastAPI 接收文件
↓
校验文件类型
↓
读取文件内容
↓
计算文件 Hash
↓
判断是否重复上传
↓
保存原始文件到 MinIO
↓
写入 documents 表，状态为 PENDING
↓
发送 Celery 异步任务
↓
立即返回上传成功
```

### 7.2 文档解析入库流程

```text
Celery Worker 接收任务
↓
从 PostgreSQL 查询文档记录
↓
从 MinIO 读取原始文件
↓
parser.py 解析 PDF/TXT
↓
cleaner.py 清洗文本
↓
core_engine.py 切块并生成 Embedding
↓
metadata_extractor.py 生成 chunk_id / page_number
↓
es_client.py 写入 Elasticsearch
↓
更新 documents 状态为 SUCCESS
↓
写入 task_logs 任务日志
```

### 7.3 RAG 问答流程

```text
用户输入问题
↓
问题向量化
↓
Elasticsearch 检索相关 chunk
↓
过滤低相关内容
↓
拼接上下文
↓
调用大模型生成回答
↓
返回 answer + sources
```

---

## 8. 环境变量配置

项目使用 `.env` 管理配置。

示例：

```env
DATABASE_URL=postgresql://rag_admin:rag_secure@127.0.0.1:15432/rag_db

MINIO_ENDPOINT=127.0.0.1:9002
MINIO_ACCESS_KEY=minio_admin
MINIO_SECRET_KEY=minio_secure
MINIO_BUCKET_NAME=rag-docs

REDIS_URL=redis://127.0.0.1:16379/0

ES_URL=http://127.0.0.1:9200
ES_INDEX_NAME=rag_chunks
ES_VECTOR_DIMS=1536

LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=你的APIKey
EMBEDDING_MODEL_NAME=text-embedding-v2
CHAT_MODEL_NAME=qwen-plus
```

注意：

```text
不要把真实 API Key 提交到 GitHub。
```

---

## 9. 本地启动方式

### 9.1 启动依赖服务

```powershell
docker compose up -d
```

### 9.2 初始化数据库

```powershell
python scripts/init_db.py
```

### 9.3 启动 FastAPI

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 18000
```

### 9.4 启动 Celery Worker

Windows 环境建议使用：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

---

## 10. 常用接口

### 10.1 上传文档

```http
POST /api/v1/documents/upload
```

### 10.2 查询文档列表

```http
GET /api/v1/documents/
```

### 10.3 查询文档状态

```http
GET /api/v1/documents/{doc_id}/status
```

### 10.4 查询任务日志

```http
GET /api/v1/documents/{doc_id}/task-log
```

### 10.5 重新解析失败文档

```http
POST /api/v1/documents/{doc_id}/retry
```

### 10.6 删除文档

```http
DELETE /api/v1/documents/{doc_id}
```

### 10.7 RAG 问答

```http
POST /api/v1/search/ask
```

### 10.8 基础健康检查

```http
GET /api/v1/health
```

### 10.9 依赖健康检查

```http
GET /api/v1/health/dependencies
```

详细接口说明见：

```text
docs/api.md
```

系统架构说明见：

```text
docs/architecture.md
```

---

## 11. 测试文档示例

可以创建一个 TXT 文件用于测试上传：

文件名：

```text
task_log_test_01.txt
```

内容：

```text
任务日志测试文档 01

这是一个用于测试 task_logs 表的 RAG 文档。

如果系统正常工作，FastAPI 会把文档上传到 MinIO，并在 PostgreSQL 的 documents 表中创建记录。

随后 Celery Worker 会接收解析任务，读取 MinIO 文件，执行解析、清洗、切块、向量化，并写入 Elasticsearch。

最后 Worker 应该把任务执行结果写入 task_logs 表，包括任务状态、chunk 数量和执行说明。
```

---

## 12. 项目亮点

1. 实现了文档上传、异步解析、向量入库、RAG 问答完整链路。
2. 使用 PostgreSQL 保存结构化元数据，使用 MinIO 保存原始文件。
3. 使用 Redis + Celery 实现耗时任务异步化，提升接口响应速度。
4. 使用 Elasticsearch 保存 chunk 和 vector，实现语义检索。
5. 支持 sources 来源追踪，提高 RAG 回答可信度。
6. 支持 task_logs 任务日志，方便定位解析失败原因。
7. 支持 retry 失败重试，提高系统可维护性。
8. 支持 health dependencies 依赖健康检查，方便本地部署和排查问题。
9. 项目采用 API 层、Service 层、Worker 层、DB 层分层设计，结构清晰，便于扩展。

---

## 13. 当前项目边界

当前版本是本地可运行的 RAG 后端系统，不追求完整商业化能力。

暂不包含：

- 用户登录
- 多租户权限
- 复杂后台管理系统
- OCR 深度文档解析
- 知识图谱
- 完整 Agent 工作流
- 企业级权限管理

后续可以扩展：

- Rerank 二次排序
- 更丰富的文档格式解析
- 简单 Web 前端或微信小程序前端
- Agent 工具调用能力

---

## 14. 项目公开描述

项目名称：

```text
企业级知识库 RAG 问答系统
```

项目描述：

```text
基于 FastAPI、PostgreSQL、MinIO、Redis、Celery、Elasticsearch 和大模型 API 构建轻量级企业知识库 RAG 问答系统，支持 PDF/TXT 文档上传、异步解析、文本清洗、Chunk 切分、Embedding 向量化、向量检索、来源追踪、任务日志、失败重试和依赖健康检查。
```

项目职责：

```text
负责后端 API 设计、文档上传链路、异步解析任务、向量入库流程、RAG 问答接口、任务日志和失败重试机制设计。
```

---

## 15. 总结

RAG Builder 是一个轻量级企业知识库 RAG 系统。

它是参考 RAGFlow 工程思想的轻量实现，但控制在可完成、可理解、可演示的规模。

项目重点不是堆砌复杂功能，而是把 RAG 的核心工程链路完整跑通，并便于本地验证、功能演示和二次扩展：

```text
文件如何上传
任务如何异步执行
文本如何解析和切块
向量如何入库
问题如何检索
答案如何生成
来源如何追踪
失败如何排查和重试
```
