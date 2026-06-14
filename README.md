# RAG Builder

RAG Builder 是一个本地可运行的 RAG 后端项目，用 FastAPI 提供接口，支持文档上传、异步解析、向量入库，以及基于知识库内容的问答。

这个项目参考 RAGFlow 的工程思路，但只保留轻量级 RAG 后端需要的核心部分。当前重点是把 PDF / TXT 文档从上传到检索问答的流程跑通，方便本地部署、功能演示和后续扩展。

## 已实现功能

- PDF / TXT 文档上传
- 文件 Hash 去重
- MinIO 保存原始文件
- PostgreSQL 保存文档元数据和任务日志
- Redis + Celery 异步解析文档
- 文本解析、清洗、切块
- Embedding 向量化
- Elasticsearch 保存 chunk 和 vector
- RAG 问答接口
- sources 来源追踪
- RAG 检索、rerank 对比和答案引用离线评测
- task_logs 任务日志查询
- 失败任务 retry
- 依赖健康检查

暂不包含用户登录、多租户、权限系统、后台 UI、OCR、知识图谱和复杂 Agent 流程。

## 技术栈

| 组件 | 用途 |
|---|---|
| FastAPI | 后端 API |
| PostgreSQL | 文档元数据、任务日志 |
| MinIO | 原始文件存储 |
| Redis | Celery 消息队列 |
| Celery | 后台解析任务 |
| Elasticsearch | 文本块和向量检索 |
| DashScope / Qwen | Embedding 和问答模型 |
| Docker Compose | 本地依赖服务 |

`docker-compose.yml` 里也包含 Kibana，主要用于本地查看 Elasticsearch 数据，不是核心链路必需项。

## 核心流程

### 文档入库

```text
上传 PDF/TXT
-> FastAPI 校验文件并计算 Hash
-> 原始文件写入 MinIO
-> documents 写入 PostgreSQL，状态为 PENDING
-> Celery 任务进入 Redis
-> Worker 解析、清洗、切块、向量化
-> chunks 和 vectors 写入 Elasticsearch
-> documents 状态更新为 SUCCESS
-> task_logs 记录执行结果
```

### 问答

```text
用户提问
-> 问题向量化
-> Elasticsearch 检索相关 chunks
-> 拼接上下文
-> 调用大模型生成回答
-> 返回 answer 和 sources
```

## 目录说明

```text
app/
  api/v1/              FastAPI 路由
  core/                配置和常量
  db/                  PostgreSQL、MinIO 连接
  models/              SQLAlchemy 模型
  schemas/             Pydantic 请求和响应模型
  services/            业务逻辑

worker/
  celery_app.py        Celery 应用
  tasks.py             后台任务
  deepdoc/             向量化和 ES 客户端
  pipeline/            解析、清洗、入库流程

scripts/
  check_env.py         环境变量检查
  init_db.py           初始化数据库表

evals/
  cases/               检索与答案评测用例
  run_retrieval_eval.py 检索和 rerank 对比
  run_answer_eval.py   答案、引用和拒答评测
  eval_report.md       最近一次评测报告

docs/
  api.md               接口说明
  architecture.md      架构说明
  testing.md           本地测试步骤
  troubleshooting.md   常见问题排查
  project_checklist.md 功能检查清单
```

## 本地启动

先根据自己的环境准备 `.env`。不要把真实 API Key 提交到仓库。

### 1. 检查环境变量

```powershell
python scripts/check_env.py
```

### 2. 启动依赖服务

```powershell
docker compose up -d
```

### 3. 初始化数据库

```powershell
python scripts/init_db.py
```

### 4. 启动 FastAPI

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 18000
```

Swagger 地址：

```text
http://127.0.0.1:18000/docs
```

### 5. 启动 Celery Worker

Windows 下建议使用 `--pool=solo`：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

## 常用接口

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/v1/documents/upload` | 上传文档 |
| `GET` | `/api/v1/documents/` | 查询文档列表 |
| `GET` | `/api/v1/documents/{doc_id}/status` | 查询文档状态 |
| `GET` | `/api/v1/documents/{doc_id}/task-log` | 查询任务日志 |
| `POST` | `/api/v1/documents/{doc_id}/retry` | 重试失败解析 |
| `DELETE` | `/api/v1/documents/{doc_id}` | 删除文档 |
| `POST` | `/api/v1/search/ask` | 知识库问答 |
| `GET` | `/api/v1/health` | 基础健康检查 |
| `GET` | `/api/v1/health/dependencies` | 依赖健康检查 |

完整接口示例见 [docs/api.md](docs/api.md)。

## 测试入口

本地完整测试步骤见 [docs/testing.md](docs/testing.md)。

推荐先按这个顺序检查：

```text
docker compose up -d
python scripts/check_env.py
python scripts/init_db.py
启动 FastAPI
启动 Celery Worker
上传 TXT 测试文件
查看文档状态和 task_logs
调用 /api/v1/search/ask
```

## 轻量 RAG 评测

评测脚本直接复用现有检索和问答服务，不需要启动 FastAPI 或浏览器。实际评测前需要 Elasticsearch 中已有解析成功的 chunk，并且问答/Embedding 配置可用。

```powershell
python evals/run_retrieval_eval.py
python evals/run_answer_eval.py
```

输出文件：

```text
evals/eval_report.md
evals/eval_results.json
```

默认只评测 baseline。需要比较 rerank 时可以显式启用：

```powershell
python evals/run_retrieval_eval.py --use-rerank --top-k 3 --top-n 10
```

rerank 使用 DashScope 文本重排序接口和 `qwen3-rerank`。API Key 优先读取 `DASHSCOPE_API_KEY`，未配置时复用项目已有的 `LLM_API_KEY`，不会写入代码或报告。常用配置：

```text
RERANK_ENABLED=false
RERANK_PROVIDER=dashscope
RERANK_MODEL_NAME=qwen3-rerank
RERANK_TOP_N=30
RERANK_TOP_K=5
RERANK_TIMEOUT_SECONDS=20
RERANK_APPLY_TO_ASK=false
```

远端调用失败时会保留 baseline 排序并在报告中说明降级原因。`RERANK_APPLY_TO_ASK=false` 时，正式问答链路保持原有行为。

当前样例 case 主要使用 `expected_keywords` 做弱评测。知识库数据稳定后，优先填写真实的 `expected_chunk_ids` 和 `expected_doc_ids`。现有接口没有标准 `citations` 字段，因此标准 citation coverage 会显示为 `N/A`，同时报告会额外给出 `sources` 兼容命中率。

## 当前边界

这个仓库目前只做轻量级 RAG 后端，不追求完整 RAGFlow 或商业化平台能力。

后续可以继续补：

- 更多文档格式
- 通过固定评测集验证 rerank 效果，再决定是否打开正式问答开关
- 更细的解析策略
- 简单 Web 前端
- 更完整的自动化测试

## 文档

- [API 接口](docs/api.md)
- [架构说明](docs/architecture.md)
- [本地测试](docs/testing.md)
- [问题排查](docs/troubleshooting.md)
- [功能检查清单](docs/project_checklist.md)
