# RAG Builder 项目概览

## 文档说明

- 中文名：项目全景说明
- 文件作用：集中记录项目定位、技术栈、接口、配置、已实现能力和已知风险。
- 为什么需要：为 AI、开发者和维护者提供进入仓库后的长期上下文。
- 英文文件名：`project_overview.md`，意为“项目概览”。

## 项目定位

RAG Builder 是一个本地可运行的轻量级企业知识库 RAG 工程系统。系统支持文档上传、异步解析、Embedding、Elasticsearch 混合检索、DashScope LLM 问答、qwen3-rerank 重排、引用溯源、RAG 离线评测和 Web 控制台。

项目核心是 RAG 后端和数据处理链路。静态 Web 控制台用于本地操作、调试和观测，不改变后端系统定位。

本项目不是 `exam_agent`。岗位推荐、招考分析、岗位备选和岗位对比等调用方业务不得放入本仓库。

## 技术栈

| 层次 | 当前实现 |
|---|---|
| API | FastAPI、Uvicorn、Pydantic |
| 数据访问 | SQLAlchemy、PostgreSQL |
| 对象存储 | MinIO |
| 队列与任务 | Redis、Celery |
| 检索 | Elasticsearch 8.11.1 |
| 文档处理 | pypdf、PyMuPDF、langchain-text-splitters |
| 模型调用 | OpenAI Python SDK 兼容接口 |
| 模型服务 | DashScope、Qwen、qwen3-rerank |
| 本地编排 | Docker Compose |
| 控制台 | HTML、CSS、JavaScript |

## 核心链路

### 文档上传

```text
接收 PDF/TXT
-> 校验文件名、后缀和空内容
-> 读取文件并计算 SHA-256
-> PostgreSQL 按 file_hash 查重
-> 原文件写入 MinIO
-> documents 写入 PENDING
-> 投递 parse_document_task
-> 返回 doc_id、文件名和状态
```

上传请求不会等待解析、Embedding 和 Elasticsearch 入库。

### 异步解析

```text
Worker 接收 doc_id
-> task_log = STARTED
-> document.status = PARSING
-> 从 MinIO 下载原文件
-> 解析、清洗、切块
-> 调用 Embedding
-> 写入 Elasticsearch
-> document.status = SUCCESS
-> task_log 记录 chunk_count
```

失败时尽量更新 `documents=FAILED` 和 `task_logs=FAILED`，并保留可诊断错误。

### 检索问答

```text
用户问题
-> 意图与空问题检查
-> 问题 Embedding
-> Elasticsearch KNN + 关键词混合检索
-> 可选 qwen3-rerank
-> 相关性过滤
-> 拼接上下文
-> 调用 Chat 模型
-> 返回 answer、citations、sources
```

简单问候可返回 `chitchat` 并跳过检索。没有可靠依据时返回 `unanswerable`，引用列表为空。

## 为什么先写 PENDING

`documents` 中的 `PENDING` 记录是异步任务的可追踪凭据：

- 上传接口可以立即返回 `doc_id`。
- Worker 运行前后都能查询文档状态。
- 失败原因可以关联到持久化记录。
- 后续可以实现 retry、超时巡检和任务补偿。

如果等 Worker 完成后才创建记录，任务执行期间系统无法查询该文档，也难以处理失败。

## 目录职责

```text
app/
  api/v1/                 FastAPI 路由
  core/                   配置、常量、本地代理处理
  db/                     PostgreSQL 会话和 MinIO 客户端
  models/                 SQLAlchemy 模型
  schemas/                Pydantic 模型
  services/               上传、文档、检索、问答、评测读取和状态服务
  static/                 本地 Web 控制台

worker/
  celery_app.py           Celery 应用
  tasks.py                异步任务和任务日志
  pipeline/               解析、清洗、元数据和入库流水线
  deepdoc/                文本切分、Embedding、Elasticsearch

evals/                    离线评测脚本、用例和结果
scripts/                  配置检查和数据库初始化
docs/                     架构、运维、评测和导入报告
```

## 核心接口

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` | `/` | Web 控制台 |
| `GET` | `/docs` | Swagger |
| `GET` | `/api/v1/health` | FastAPI 基础健康 |
| `GET` | `/api/v1/health/dependencies` | 核心依赖健康 |
| `POST` | `/api/v1/documents/upload` | 上传 PDF/TXT 并派发任务 |
| `GET` | `/api/v1/documents/` | 文档列表 |
| `GET` | `/api/v1/documents/{doc_id}/status` | 文档状态 |
| `GET` | `/api/v1/documents/{doc_id}/task-log` | 任务日志 |
| `POST` | `/api/v1/documents/{doc_id}/retry` | 重试 FAILED 文档 |
| `DELETE` | `/api/v1/documents/{doc_id}` | 删除文档及关联资源 |
| `POST` | `/api/v1/search/ask` | RAG 问答 |
| `GET` | `/api/v1/retrieval/test` | 独立检索与 rerank 调试 |
| `GET` | `/api/v1/eval/report` | 读取最近一次离线评测 |
| `GET` | `/api/v1/system/status` | 控制台系统状态 |

## 关键配置

配置来自根目录 `.env`，公开示例为 `.env.example`。

| 配置 | 作用 |
|---|---|
| `DATABASE_URL` | PostgreSQL SQLAlchemy 连接 |
| `MINIO_ENDPOINT` | MinIO API 地址 |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO 本地凭据 |
| `MINIO_BUCKET_NAME` | 原始文件 Bucket |
| `REDIS_URL` | Celery Redis 地址 |
| `ES_URL` | Elasticsearch 地址 |
| `ES_INDEX_NAME` | Chunk 索引名 |
| `ES_VECTOR_DIMS` | 向量维度 |
| `LLM_BASE_URL` | OpenAI 兼容模型地址 |
| `LLM_API_KEY` | Embedding / Chat Key |
| `EMBEDDING_MODEL_NAME` | Embedding 模型 |
| `CHAT_MODEL_NAME` | Chat 模型 |
| `DASHSCOPE_API_KEY` | 可选独立 Rerank Key |
| `RERANK_*` | Rerank 模型、数量、超时和应用范围 |

任何真实 Key、密码和生产连接信息都不能进入 Git、README、日志或评测报告。

## 数据模型

### documents

| 字段 | 作用 |
|---|---|
| `id` | 文档主键和对外追踪 ID |
| `file_name` | 原始文件名 |
| `file_hash` | SHA-256 内容哈希 |
| `status` | `PENDING/PARSING/SUCCESS/FAILED` |
| `created_at` | 创建时间 |

### task_logs

| 字段 | 作用 |
|---|---|
| `doc_id` | 关联文档 ID |
| `task_name` | 任务名称 |
| `status` | `STARTED/SUCCESS/FAILED` |
| `message` | 任务说明 |
| `chunk_count` | 成功生成的 Chunk 数 |
| `error_message` | 失败详情 |
| `created_at/updated_at` | 时间信息 |

## 当前已实现能力

- PDF/TXT 上传、空文件校验、后缀校验和内容去重
- MinIO 原文件上传、读取和删除
- PostgreSQL 文档状态和任务日志
- Redis + Celery 异步解析
- 文本解析、清洗、切块和 Embedding
- Elasticsearch Chunk / Vector 写入、混合检索和按文档删除
- 文档列表、状态、日志、失败重试和删除
- 带 `answer_type`、`used_retrieval`、`citations`、`sources` 的问答响应
- qwen3-rerank 检索调试和离线评测
- 检索、答案、引用与拒答离线评测
- Web 控制台、依赖健康、Worker 活性和配置状态展示

## 已知风险

1. MinIO 对象名仍直接依赖原文件名，同名不同内容可能覆盖。
2. Celery Redis 地址仍在 `worker/celery_app.py` 硬编码。
3. Elasticsearch URL、索引名和向量维度仍有硬编码。
4. Celery 投递失败可能留下长期 `PENDING`。
5. 部分 Elasticsearch 写入后的 retry 缺少完整幂等保障。
6. 删除流程遇到跨存储部分失败时可能产生残留。
7. 上传仍会一次性读取完整文件，尚无大小限制和流式处理。
8. 仓库尚无 pytest 自动化测试目录。

## 后续优先级

1. 增加稳定唯一的 MinIO `object_name`。
2. 使用稳定 Chunk `_id` 并完善 retry 幂等。
3. 统一 Redis、Elasticsearch 和向量维度配置。
4. 增加 Celery 投递补偿和超时巡检。
5. 增加单元测试、接口测试和固定端到端评测数据。
6. 增强 PDF 解析、OCR、页级元数据和复杂布局支持。
7. 完善权限、多租户和生产可观测性。

详细架构见 [系统架构](project_architecture.md)，当前阶段见 [阶段总结](stage_summary_current.md)。
