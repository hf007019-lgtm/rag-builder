# RAG Builder 项目概览

## 1. 项目简介

RAG Builder 是一个轻量级企业知识库 RAG 后端系统。它围绕“文档上传、异步解析、向量检索、知识问答”构建本地可运行的完整基础链路，适合学习、简历展示和后续接入其他应用。

项目核心是后端能力，不是以复杂前端产品为目标。仓库中已有一个原生 HTML/CSS/JavaScript 静态控制台，用于本地演示上传、问答、文档状态、任务日志和健康检查；它是演示入口，不改变项目的后端定位。

本项目不是 `exam_agent`。岗位推荐、招考分析师、岗位备选和岗位对比等业务不属于本仓库。未来 `exam_agent` 可以通过 API 使用 RAG Builder 的政策或知识检索能力。

## 2. 项目价值

- 把 RAG 的关键基础设施串成可理解的工程链路。
- 把耗时解析放入 Celery，避免上传接口长时间阻塞。
- 分离原文件、关系元数据和检索数据的存储职责。
- 通过状态和任务日志提供基础可观测性。
- 返回来源片段，便于解释回答依据。
- 使用 OpenAI 兼容接口，便于切换 DashScope 或其他兼容服务。
- 结构较轻，适合学生理解和后续逐步增强。

## 3. 当前技术栈

| 组件 | 用途 |
|---|---|
| FastAPI / Uvicorn | HTTP API 和静态控制台入口 |
| Pydantic | 请求与响应模型 |
| SQLAlchemy / PostgreSQL | 文档元数据和任务日志 |
| MinIO | PDF/TXT 原文件 |
| Redis | Celery broker 和 result backend |
| Celery | 后台解析任务 |
| Elasticsearch 8.11.1 | chunk、向量、关键词与向量混合检索 |
| OpenAI Python SDK | 调用 OpenAI 兼容 Embedding/Chat API |
| DashScope / Qwen | 当前 `.env` 指向的模型服务 |
| pypdf | PDF 文本提取 |
| langchain-text-splitters | 递归文本切分 |
| Docker Compose | PostgreSQL、MinIO、Redis、ES、Kibana 编排 |
| HTML / CSS / JavaScript | 本地演示控制台 |

## 4. 架构图文字版

```text
                           +----------------------+
                           |  静态演示控制台/API 调用方 |
                           +----------+-----------+
                                      |
                                      v
+-----------+    上传/查询/问答    +---+----------------+
| 用户/前端  +-------------------->+ FastAPI            |
+-----------+                     | app/api + services |
                                  +---+----+------+-----+
                                      |    |      |
                    元数据/状态/日志   |    |      | 原文件
                                      v    |      v
                               +------+--+ | +----+----+
                               |PostgreSQL| | |  MinIO  |
                               +---------+ | +---------+
                                           |
                                     Celery 任务
                                           v
                                      +----+----+
                                      |  Redis  |
                                      +----+----+
                                           |
                                           v
                               +-----------+----------+
                               | Celery Worker         |
                               | 解析/清洗/切块/Embedding |
                               +-----------+----------+
                                           |
                                           v
                                  +--------+--------+
                                  | Elasticsearch   |
                                  | chunks + vectors|
                                  +--------+--------+
                                           ^
                                           |
                         问题向量 + 关键词混合检索
                                           |
                                      +----+----+
                                      | FastAPI |
                                      +----+----+
                                           |
                                   检索上下文调用 Chat
                                           v
                              +------------+-------------+
                              | OpenAI 兼容模型服务       |
                              | 当前为 DashScope / Qwen  |
                              +--------------------------+
```

## 5. 核心流程

### 5.1 阶段一：同步上传

`POST /api/v1/documents/upload` 当前执行：

1. 校验文件名和 `.pdf` / `.txt` 后缀。
2. 读取文件内容并拒绝空文件。
3. 计算 SHA-256 `file_hash`。
4. 查询 PostgreSQL，重复内容直接返回已有文档。
5. 确认 MinIO bucket 存在。
6. 把原文件写入 MinIO。
7. 创建 `documents` 记录，状态为 `PENDING`。
8. 向 Celery 投递 `worker.tasks.parse_document_task`。
9. 返回 `doc_id`、文件名和状态。

上传接口没有等待解析、Embedding 或 ES 入库，因此符合“快速返回”的异步设计。当前响应没有独立 `task_id`。

### 5.2 为什么先写 PENDING

先创建 PostgreSQL 记录相当于生成任务小票：

- 调用方立即获得 `doc_id`。
- 用户可以查询 `PENDING/PARSING/SUCCESS/FAILED`。
- Worker 可以基于持久记录执行任务。
- 失败后可以记录原因并提供 retry。
- 系统具备基础可观测性和可追踪性。

如果等 Worker 完成后才写数据库，执行期间没有可查询记录，也无法可靠处理失败。

### 5.3 阶段二：异步解析

Worker 收到 `doc_id` 后：

1. 查询 `documents`。
2. 创建 `STARTED` 任务日志。
3. 把文档状态更新为 `PARSING`。
4. 从 MinIO 下载原文件。
5. TXT 按 UTF-8/GBK 解码；PDF 使用 pypdf 提取文本。
6. 清洗换行、空格和不可见字符。
7. 使用递归切分器切块，当前 `chunk_size=500`、`chunk_overlap=50`。
8. 批量调用 Embedding 接口。
9. 为 chunk 生成 `chunk_id`，并尝试提取 PDF 页码。
10. 写入 Elasticsearch 并刷新索引。
11. 成功时更新 `documents=SUCCESS` 和任务日志。
12. 失败时更新 `documents=FAILED`，记录 `error_message`。

### 5.4 检索问答

`POST /api/v1/search/ask` 当前执行：

1. 校验问题非空。
2. 使用与文档一致的 Embedding 模型生成问题向量。
3. Elasticsearch 同时执行 KNN 向量检索和 `chunk_text` 关键词匹配。
4. 当前向量 boost 为 `0.7`，关键词 boost 为 `0.3`，初始召回 `5` 条。
5. 可按问题中的 PDF/TXT 意图过滤文件类型。
6. 选择最高分文档的候选 chunk。
7. 使用固定阈值 `0.6` 和最高分比例 `0.65` 过滤低相关结果。
8. 把来源片段拼成上下文并调用 Chat 模型。
9. 返回 `answer` 和 `sources`。

没有可靠来源时，服务返回固定的“知识库中没有找到足够依据”类答复。

## 6. 目录结构

```text
rag_builder/
  app/
    api/v1/
      document.py          文档上传、列表、状态、日志、重试、删除路由
      health.py            服务与依赖健康路由
      search.py            RAG 问答路由
    core/
      config.py            环境变量配置
      constants.py         文档状态和默认常量
      proxy_guard.py       localhost 代理绕过
    db/
      session.py           SQLAlchemy 引擎和会话
      minio_client.py      MinIO 客户端和 bucket 初始化
    models/
      document.py          documents 表
      task_log.py          task_logs 表
    schemas/
      document.py          文档接口响应模型
      search.py            问答接口模型
    services/
      ingestion_service.py 上传同步阶段
      document_service.py  查询、删除和重试
      search_service.py    检索、过滤和模型问答
      prompt_service.py    RAG Prompt 和无答案策略
      health_service.py    依赖健康检查
    static/                本地演示控制台
    main.py                FastAPI 应用入口
  worker/
    celery_app.py          Celery 配置
    tasks.py               parse_document_task
    pipeline/
      parser.py            PDF/TXT 解析
      cleaner.py           文本清洗
      metadata_extractor.py chunk_id 和页码
      ingestion_pipeline.py 入库流水线
    deepdoc/
      core_engine.py       切块和 Embedding
      es_client.py         ES 索引、写入、检索和删除
  scripts/
    check_env.py           配置检查
    init_db.py             数据表初始化
  docs/                    API、架构、测试和排障文档
  docker-compose.yml       本地依赖服务
  requirements.txt         Python 依赖
```

## 7. 核心接口

默认本地 API 地址按 README 为：

```text
http://127.0.0.1:18000
```

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` | `/` | 静态演示控制台 |
| `GET` | `/docs` | Swagger |
| `GET` | `/api/v1/health` | FastAPI 基础健康 |
| `GET` | `/api/v1/health/dependencies` | PostgreSQL、MinIO、Redis、ES 健康 |
| `POST` | `/api/v1/documents/upload` | 上传 PDF/TXT 并派发任务 |
| `GET` | `/api/v1/documents/` | 文档列表 |
| `GET` | `/api/v1/documents/{doc_id}/status` | 文档状态 |
| `GET` | `/api/v1/documents/{doc_id}/task-log` | 任务日志 |
| `POST` | `/api/v1/documents/{doc_id}/retry` | 仅重试 FAILED 文档 |
| `DELETE` | `/api/v1/documents/{doc_id}` | 删除文档及关联对象 |
| `POST` | `/api/v1/search/ask` | RAG 问答 |

## 8. 核心配置

配置来自项目根目录 `.env`。不要把真实密钥写入文档或提交到 Git。

| 配置 | 作用 |
|---|---|
| `DATABASE_URL` | PostgreSQL SQLAlchemy 连接 |
| `MINIO_ENDPOINT` | MinIO API 地址 |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO 凭据 |
| `MINIO_BUCKET_NAME` | 原文件 bucket，当前为 `rag-docs` |
| `REDIS_URL` | Celery 使用的 Redis |
| `ES_URL` | Elasticsearch 地址 |
| `ES_INDEX_NAME` | chunk 索引名，当前为 `rag_chunks` |
| `ES_VECTOR_DIMS` | 向量维度，当前为 `1536` |
| `LLM_BASE_URL` | OpenAI 兼容 API 地址 |
| `LLM_API_KEY` | 模型 API Key |
| `EMBEDDING_MODEL_NAME` | 当前为 `text-embedding-v2` |
| `CHAT_MODEL_NAME` | 当前为 `qwen-plus` |

当前本地端口以代码和 `docker-compose.yml` 为准：

| 服务 | 宿主机 -> 容器 |
|---|---|
| PostgreSQL | `15432 -> 5432` |
| MinIO API | `19002 -> 9000` |
| MinIO Console | `19003 -> 9001` |
| Redis | `16379 -> 6379` |
| Elasticsearch | `9200 -> 9200` |
| Kibana | `15601 -> 5601` |
| FastAPI | README 启动命令使用 `18000` |

注意：`app/core/config.py` 中 MinIO 的代码默认值仍写为 `127.0.0.1:9002`，但当前 `.env` 使用 `127.0.0.1:19002`。正常本地运行依赖 `.env` 覆盖该默认值。

常用命令：

```powershell
python scripts/check_env.py
docker compose up -d
python scripts/init_db.py
uvicorn app.main:app --host 127.0.0.1 --port 18000
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

## 9. PostgreSQL 数据模型

### documents

| 字段 | 作用 |
|---|---|
| `id` | 文档主键和对外追踪 ID |
| `file_name` | 用户上传文件名 |
| `file_hash` | SHA-256，唯一索引 |
| `status` | `PENDING/PARSING/SUCCESS/FAILED` |
| `created_at` | 创建时间 |

### task_logs

| 字段 | 作用 |
|---|---|
| `id` | 日志主键 |
| `doc_id` | 关联文档 ID，目前未声明数据库外键 |
| `task_name` | 当前为 `parse_document_task` |
| `status` | `STARTED/SUCCESS/FAILED` |
| `message` | 任务说明 |
| `chunk_count` | 成功生成的 chunk 数 |
| `error_message` | 失败详情 |
| `created_at/updated_at` | 时间信息 |

删除文档时，当前设计保留 `task_logs` 历史记录。

## 10. Elasticsearch 数据结构

`rag_chunks` 当前字段：

```json
{
  "doc_id": 15,
  "file_name": "example.pdf",
  "chunk_id": "doc_15_chunk_0",
  "page_number": 1,
  "chunk_text": "文档片段",
  "vector": [0.01, -0.02]
}
```

`vector` 是 `dense_vector`，当前 mapping 固定为 1536 维、cosine 相似度。

## 11. 当前代码已实现能力

以下能力能从代码中直接确认：

- FastAPI 应用入口和 Swagger。
- PDF/TXT 上传、空文件校验和后缀校验。
- SHA-256 内容去重。
- MinIO bucket 检查、原文件上传、读取和删除。
- PostgreSQL `documents`、`task_logs` 模型及建表脚本。
- `PENDING/PARSING/SUCCESS/FAILED` 状态流转。
- Redis + Celery 异步解析任务。
- TXT 解码、PDF 文本提取和文本清洗。
- 递归切块与 Embedding。
- ES 索引创建、chunk 写入、混合检索和按文档删除。
- 文档列表、状态、任务日志、失败重试和删除接口。
- `/api/v1/search/ask` 问答链路。
- 来源片段、chunk ID、页码和分数返回。
- PostgreSQL、MinIO、Redis、ES 依赖健康检查。
- 本地静态演示控制台。
- 本地代理绕过处理。

本轮仅做静态代码核对，没有启动服务，因此不能把上述内容表述为“本轮已运行验证”。

## 12. 当前未完成或待加强能力

- 自动化单元测试、接口测试和 RAG 质量评测集。
- 更稳定的 PDF 版面解析、扫描件 OCR、表格和图片处理。
- 上传文件大小限制、流式 hash/上传和安全扫描。
- MinIO 唯一对象名及数据库 `object_name` 字段。
- Celery 投递失败补偿、超时任务恢复和定时巡检。
- 部分写入后的 retry 幂等。
- 配置统一：Redis、ES URL、索引名和维度仍有硬编码。
- FastAPI 启动与 Elasticsearch 解耦。
- 完整的事务/补偿机制和一致性修复工具。
- Rerank、可配置混合检索权重和离线评测。
- 多轮对话、用户、权限和多租户。
- 更完整的管理后台；当前只有本地演示控制台。

## 13. 已知问题和风险

1. `app/main.py` 把健康路由注册了两次，可能产生 Duplicate Operation ID。
2. `worker/celery_app.py` 硬编码 `redis://127.0.0.1:16379/0`，没有使用统一配置。
3. `worker/deepdoc/es_client.py` 硬编码 ES URL、索引名和 1536 维。
4. `search_service.py` 导入时就创建 `VectorStore`，ES 不可用会阻塞或阻止 FastAPI 启动。
5. MinIO `object_name` 直接使用原文件名；同名不同内容可能覆盖旧文件。
6. 数据库提交后才投递 Celery；投递失败可能留下无法自动恢复的 `PENDING`。
7. 失败任务若已写入部分 ES chunk，retry 可能重复写入。
8. 删除时 MinIO 或 ES 失败可能被降级处理，随后仍删除 PostgreSQL 文档记录。
9. 现有源码和部分旧文档的显示编码在某些 PowerShell 读取方式下可能出现乱码，编辑时应保持 UTF-8。

## 14. 常见问题

### Docker 连接报错

通常是 Docker Desktop 或 Docker Engine 未启动。先用 `docker ps` 检查。

### Redis 6379 被占用

本项目当前映射为宿主机 `16379`，`.env` 应与 Celery 保持一致。

### 文档长期 PENDING

优先检查：

1. Celery Worker 是否单独启动。
2. Redis 是否可访问。
3. FastAPI 与 Worker 是否使用同一 Redis。
4. Worker 是否加载 `worker.tasks.parse_document_task`。

### Elasticsearch 本地连接失败

检查容器、`ES_URL` 和代理设置。项目会设置：

```text
NO_PROXY=127.0.0.1,localhost
```

### PowerShell 的 curl 行为不同

PowerShell 中 `curl` 可能是 `Invoke-WebRequest` 别名。使用 `curl.exe` 或 `Invoke-RestMethod`。

### Embedding 维度错误

实际模型输出维度必须与 ES mapping 一致。当前代码 mapping 固定为 1536。

### 修改 .env 后未生效

FastAPI 和 Worker 在启动时读取配置，修改后需要重启对应进程。

## 15. 后续计划

建议下一阶段优先：

1. 解决同名文件覆盖和 ES retry 幂等。
2. 统一配置来源，移除 Redis/ES 硬编码。
3. 修复重复路由和启动阶段 ES 强耦合。
4. 增加自动化测试与固定问答评测集。
5. 增强 PDF 解析、chunk 元数据和引用定位。
6. 优化混合检索并增加 rerank。
7. 完善任务恢复、删除补偿和一致性巡检。
8. 按 API 边界接入 `exam_agent`、小程序或其他 Web 前端。

