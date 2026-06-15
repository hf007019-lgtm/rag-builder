# RAG Builder AI 开发规范

## 1. 文件定位

本文件是 AI、Codex 和后续开发者进入 `rag_builder` 仓库后必须优先阅读的项目级规则。执行任何修改前，还应阅读：

1. `docs/architecture/project_overview.md`：项目全景、架构、接口和配置。
2. `docs/architecture/stage_summary_current.md`：当前阶段、已知问题和下一步建议。
3. 与任务直接相关的代码及 `docs/` 下已有文档。

项目根目录：

```text
D:\PycharmProjects\rag_builder
```

## 2. 项目定位

`rag_builder` 是一个轻量级企业知识库 RAG 后端系统，目标是提供一套本地可运行、便于学习、验证和继续扩展的 RAG 工程能力。

核心能力包括：

- 文档上传、查重和原文件保存。
- 文档元数据及任务状态管理。
- Celery 异步解析、清洗、切块和向量化。
- Elasticsearch 文本与向量检索。
- 基于检索上下文的 LLM 问答与来源返回。
- 面向本地演示的轻量静态控制台。

本项目参考 RAGFlow 的工程分层思想，但不是 RAGFlow 的完整复刻，也不追求一次性实现商业化知识库平台的全部能力。

## 3. 本项目不是 exam_agent

`rag_builder` 与 `exam_agent` 是两个不同项目。

禁止把以下内容混入本仓库：

- 岗位推荐、岗位备选、岗位对比。
- 招考分析师、职位匹配或考试岗位分析。
- `exam_agent` 的业务页面、提示词、数据模型或专用 UI。

未来可以由 `exam_agent`、小程序或 Web 前端通过 API 调用本项目，把 RAG 能力作为政策或知识检索工具；这种对接必须保持清晰的系统边界，不能把调用方业务逻辑反向塞入 `rag_builder`。

## 4. 当前技术栈

| 层次 | 当前实现 |
|---|---|
| Web API | FastAPI、Uvicorn |
| 数据模型 | Pydantic、SQLAlchemy |
| 关系数据库 | PostgreSQL |
| 对象存储 | MinIO |
| 消息队列 | Redis |
| 异步任务 | Celery |
| 检索引擎 | Elasticsearch 8.11.1 |
| 文档解析 | pypdf；依赖中还包含 PyMuPDF |
| 文本切分 | langchain-text-splitters |
| LLM / Embedding | OpenAI Python SDK 兼容接口 |
| 当前模型服务 | DashScope OpenAI 兼容模式，默认 Qwen |
| 本地依赖编排 | Docker Compose |
| 演示页面 | 原生 HTML、CSS、JavaScript 静态控制台 |

## 5. 核心架构流程

### 5.1 同步上传阶段

FastAPI 上传接口只完成必要的同步工作：

```text
接收 PDF/TXT
-> 校验文件名、后缀和非空内容
-> 读取文件并计算 SHA-256
-> PostgreSQL 按 file_hash 查重
-> 原文件写入 MinIO
-> documents 写入 PostgreSQL，状态为 PENDING
-> 向 Redis/Celery 投递 parse_document_task
-> 立即返回 doc_id、文件名和状态
```

当前代码没有独立返回 Celery `task_id`，对外追踪主键是 `doc_id`。若未来增加 `task_id`，必须同步设计数据库字段、响应模型和查询接口。

### 5.2 异步解析阶段

Celery Worker 后台执行：

```text
接收 doc_id
-> 查询 documents
-> 创建 STARTED task_log
-> documents.status 更新为 PARSING
-> 从 MinIO 读取原文件
-> 解析 PDF/TXT
-> 清洗文本
-> 按约 500 字符、50 字符重叠切块
-> 调用 Embedding 接口
-> 写入 Elasticsearch
-> documents.status 更新为 SUCCESS
-> task_log 更新为 SUCCESS 并记录 chunk_count
```

任一步骤失败时，应尽量把文档状态更新为 `FAILED`，并在 `task_logs.error_message` 中保留可定位的失败原因。

### 5.3 检索问答阶段

```text
用户问题
-> 问题向量化
-> Elasticsearch 向量 + 关键词混合检索
-> 文件类型、最高分文档和相关性阈值过滤
-> 组织检索上下文
-> 调用 Chat 模型
-> 返回 answer 和 sources
```

`sources` 当前包含 `doc_id`、`file_name`、`chunk_id`、`page_number`、`chunk_text` 和 `score`。

## 6. 为什么必须先写 PostgreSQL PENDING

`documents` 中的 `PENDING` 记录是异步任务的“任务小票”：

1. 上传接口可以立即返回 `doc_id`。
2. 用户可以在 Worker 完成前查询状态。
3. Worker 可以依据数据库记录追踪文档。
4. 失败后可以记录 `FAILED` 和错误原因。
5. 系统因此具备可观测、可重试和可追踪的基础。

不能等 Celery 完成后才创建数据库记录，否则任务执行期间系统不知道文档存在，也无法查询或恢复状态。

## 7. 目录结构和模块职责

```text
app/
  api/v1/                 FastAPI 路由
  core/                   配置、状态常量、本地代理处理
  db/                     PostgreSQL 会话和 MinIO 客户端
  models/                 SQLAlchemy 模型
  schemas/                Pydantic 请求/响应模型
  services/               上传、文档、检索、提示词、健康检查逻辑
  static/                 本地演示控制台
worker/
  celery_app.py           Celery 应用
  tasks.py                异步任务和任务日志
  pipeline/               解析、清洗、元数据和入库流水线
  deepdoc/                文本切分、Embedding、Elasticsearch
scripts/
  check_env.py            环境变量检查
  init_db.py              PostgreSQL 建表
docs/
  architecture/           项目全景、架构、RAG 流水线和接口说明
  operations/             本地启动、测试、排错和验收清单
  evaluation/             RAG 离线评测说明
  import_reports/         数据导入报告目录说明
```

模块职责必须保持清晰：

- 路由层只处理 HTTP 输入输出，不堆积复杂业务。
- `services/` 负责同步业务编排。
- `worker/` 负责耗时处理，不让上传请求长时间阻塞。
- PostgreSQL 保存结构化元数据和任务日志。
- MinIO 保存原始文件，不把原文件二进制塞进数据库。
- Elasticsearch 保存 chunk、向量和检索元数据。

## 8. 开发禁止事项

除非用户明确要求，否则禁止：

1. 把 `exam_agent` 的岗位推荐、招考分析、岗位备选或岗位对比内容混入本项目。
2. 随意修改 `docker-compose.yml` 的端口。
3. 随意修改 `.env` 中的密钥、数据库地址、模型地址或服务地址。
4. 删除 MinIO、PostgreSQL、Redis、Elasticsearch、Celery 相关代码。
5. 把上传接口改成长时间同步解析。
6. 让 FastAPI 上传请求等待完整解析、Embedding 和 ES 入库。
7. 绕过 Celery 异步链路。
8. 把原始文件直接保存为 PostgreSQL 大字段。
9. 把当前向量主存储从 Elasticsearch 随意迁入 PostgreSQL。
10. 未核对调用方就删除、改名或破坏已有接口。
11. 未经确认执行 `git add`、`git commit` 或 `git push`。
12. 没有实际运行测试命令却声称“已测试”或“已跑通”。
13. 为了顺手优化而修改任务范围外的业务代码、端口、正式数据或密钥。
14. 删除或覆盖用户已有改动。

## 9. 代码风格要求

- 函数名、变量名、类名保持清晰的英文命名。
- 面向学习的解释、复杂流程注释和业务日志优先使用中文。
- 注释解释“为什么”和关键约束，不重复翻译显而易见的代码。
- 异常信息必须指出失败组件和操作，例如“MinIO 下载失败”“Embedding 调用失败”“Elasticsearch 写入失败”。
- 避免难懂的炫技代码、过度抽象和与现有风格不一致的大型重构。
- 优先复用现有模块边界和辅助函数。
- 新增配置统一进入配置层，避免继续增加散落的硬编码地址。
- 对外响应模型、数据库模型和文档必须同步更新。

新增文件时，变更说明必须写清：

1. 中文名。
2. 文件作用。
3. 为什么需要。
4. 英文文件名或英文词义。

## 10. 日志风格要求

- 日志尽量使用清晰中文，明确 `doc_id`、文件名、组件和处理阶段。
- 不输出 API Key、密码、完整连接凭据或原文敏感内容。
- 成功日志应说明完成了什么，失败日志应说明在哪个组件失败。
- 不要只打印模糊的“处理失败”；应保留异常类型和可诊断信息。
- 生产化前应逐步用标准 `logging` 替代散落的 `print`，但不要在无关任务中整体重写。

## 11. RAG 数据流规范

- 文档状态按 `PENDING -> PARSING -> SUCCESS/FAILED` 流转。
- 状态更新、任务日志和实际处理阶段应保持一致。
- chunk 必须能够追溯到 `doc_id` 和 `file_name`。
- PDF 来源尽量保留 `page_number`；TXT 可为空。
- `chunk_id` 应稳定且可用于幂等写入，后续修改不能破坏已有来源展示。
- 任何跨 PostgreSQL、MinIO、Redis、Elasticsearch 的操作都要考虑部分成功和补偿策略。

## 12. 文档上传规范

- 当前只接受 `.pdf` 和 `.txt`。
- 必须校验文件名、后缀、空文件和重复内容。
- 使用 SHA-256 `file_hash` 做内容查重。
- 上传接口应快速返回，不承担解析和模型调用。
- 原文件进入 MinIO，PostgreSQL 只保存元数据。
- 当前 MinIO 对象名直接使用原文件名，存在“同名不同内容覆盖”风险；扩展上传逻辑时优先改为稳定唯一对象名，并同时保存 `object_name`。
- 大文件场景应考虑流式读取、文件大小限制和超时，不能无限制把全部文件读入内存。

## 13. 异步任务规范

- 耗时解析必须由 Celery Worker 执行。
- Worker 必须能依据 `doc_id` 获取数据库记录和 MinIO 对象。
- 开始处理时写 `STARTED` 日志并更新为 `PARSING`。
- 成功时同时更新 `documents` 和 `task_logs`。
- 失败时尽可能写入 `FAILED` 和错误原因，再把异常交还 Celery。
- 重试必须考虑 ES 部分写入后的幂等和清理，不能制造重复 chunk。
- 不要让 Web 进程通过直接调用任务函数替代消息队列。

## 14. 向量检索规范

- 文档 chunk 和查询问题必须使用兼容的 Embedding 模型。
- Embedding 维度必须与 Elasticsearch mapping 一致。
- 当前基础检索为向量 KNN 与 `chunk_text` 关键词匹配的混合检索。
- 调整 `top_k`、boost 或相关性阈值前，应使用固定测试集验证召回质量。
- 无可靠检索结果时返回“知识库中没有足够依据”，不要让模型脱离上下文编造。
- 返回给调用方的来源字段不得由模型虚构。

## 15. Elasticsearch 使用规范

- Elasticsearch 是当前 chunk 和向量的主存储。
- 索引字段至少保持：`doc_id`、`file_name`、`chunk_id`、`page_number`、`chunk_text`、`vector`。
- `vector.dims` 必须与实际 Embedding 输出一致。
- 优先从统一配置读取 URL、索引名和维度；当前硬编码属于待治理问题，不应继续扩散。
- 写入、检索、删除都要处理连接失败和索引不存在。
- 重试或重新入库前，应设计按 `doc_id` 清理或以稳定 `_id` 覆盖的幂等策略。

## 16. MinIO 使用规范

- MinIO 只保存原始文档及未来需要的文件型产物。
- bucket 名通过配置管理，代码负责确认 bucket 存在。
- 数据库应保存稳定的 MinIO `object_name`，不能长期只依赖用户文件名。
- 下载响应必须关闭并释放连接。
- 删除文档时要明确 MinIO 删除失败后的处理策略，避免数据库记录消失但对象残留。
- 不在日志中输出 MinIO Secret。

## 17. PostgreSQL 元数据规范

- `documents` 当前保存 `id`、`file_name`、`file_hash`、`status`、`created_at`。
- `task_logs` 当前保存任务名、状态、说明、chunk 数量、错误信息和时间。
- 原文件和向量不写入 PostgreSQL。
- 文档记录必须先于异步任务存在。
- 事务失败时必须回滚或明确补偿，不留下难以恢复的半完成状态。
- 后续可增加 `object_name`、文件大小、MIME 类型、独立任务 ID、更新时间和重试次数。

## 18. Redis / Celery 规范

- Redis 作为 Celery broker 和 result backend，不承担文档持久化。
- FastAPI 与 Worker 必须使用同一 Redis 地址和队列约定。
- 当前本地端口是宿主机 `16379 -> 6379`，用于避开本机其他 Redis。
- 当前 `worker/celery_app.py` 仍硬编码 Redis URL；后续应统一从配置读取。
- Windows 启动 Worker 使用 `--pool=solo`。
- Worker 未启动时文档会停留在 `PENDING`，这是首要排查点。

## 19. LLM / Embedding 调用规范

- 使用 OpenAI 兼容客户端，不把实现绑定死在单一厂商业务 SDK。
- `LLM_BASE_URL`、`LLM_API_KEY`、模型名必须由环境配置提供。
- API Key 不写入代码、文档、日志或 Git。
- Embedding 和 Chat 模型职责分开。
- 调用失败应说明是鉴权、限流、网络、模型不存在还是响应格式异常。
- 未来增加批处理、超时、重试和限流时，应避免造成重复 ES 写入。
- 模型回答只能基于检索上下文，缺少依据时明确拒答。

## 20. 错误处理规范

- HTTP 输入错误使用清晰的 4xx；依赖或内部错误保留组件上下文。
- 数据库会话、MinIO 响应和 ES 客户端应可靠关闭。
- 不用空 `except` 吞掉关键错误。
- 如果为了用户体验继续执行，必须记录告警并说明可能产生的数据不一致。
- 跨组件操作失败时，优先保证状态可查询、错误可追踪、任务可恢复。
- 不向外部响应泄露密钥、密码或不必要的内部堆栈。

## 21. 测试检查清单

提交功能前，按改动范围选择并真实执行：

- 配置检查：`python scripts/check_env.py`
- Compose 配置检查：`docker compose config`
- PostgreSQL 建表：`python scripts/init_db.py`
- FastAPI 启动：`uvicorn app.main:app --host 127.0.0.1 --port 18000`
- Windows Worker：`python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo`
- 基础健康：`GET /api/v1/health`
- 依赖健康：`GET /api/v1/health/dependencies`
- 上传 TXT/PDF，并检查 `PENDING -> PARSING -> SUCCESS`
- 检查 `task_logs`、失败状态和 retry
- 检查 `/api/v1/search/ask` 的 `answer` 与 `sources`
- 检查删除时 PostgreSQL、MinIO 和 ES 的一致性
- 检查重复内容、同名不同内容、空文件和不支持后缀

仓库当前没有自动化测试目录，不能把手工文档当作自动测试。没有执行命令时，明确写“未运行”。

## 22. Git 提交规范

- 未经用户确认，不执行 `git add`、`git commit` 或 `git push`。
- 提交前先检查 `git status`，不要混入无关文件、密钥、数据库数据或缓存。
- 提交信息使用清晰的类型和范围，例如：

```text
docs: add AI development context for rag builder
fix: make document retry idempotent
feat: add document parsing status endpoint
```

- 一次提交聚焦一个可解释目标。
- 文档中声明的测试必须与实际执行记录一致。

## 23. 当前已知风险

- `worker/celery_app.py` 硬编码 Redis 地址。
- `worker/deepdoc/es_client.py` 硬编码 ES 地址、索引名和 1536 维 mapping。
- MinIO 对象名直接使用原文件名，同名不同内容可能覆盖。
- 上传在数据库提交后再投递 Celery；若投递失败，可能留下长期 `PENDING`。
- 失败任务若已写入部分 chunk，retry 可能重复写入。
- 删除流程对 MinIO/ES 的部分失败处理较宽松，可能形成残留数据。
- 上传仍会一次性读取完整文件，尚未设置文件大小限制。
- 仓库已有离线 RAG 评测，但尚无 pytest 自动化测试目录。

修改相关代码时应优先解决对应风险，但不要在无关任务中扩大范围。

## 24. 后续规划

建议按风险和价值排序：

1. 统一 Redis、ES、MinIO 配置读取，移除硬编码。
2. 为 MinIO 引入唯一 `object_name`，完善同名文件策略。
3. 完善投递失败补偿、任务超时、重试和幂等写入。
4. 增加单元测试、接口测试和稳定的端到端评测数据。
5. 提升 PDF 解析稳定性，补充 OCR 和版面处理。
6. 增强 chunk 元数据、引用来源和检索质量评估。
7. 用固定评测集持续验证混合检索权重和 rerank 收益。
8. 增加多轮对话、权限、多租户等可选能力。
9. 通过 API 与 `exam_agent` 等调用方对接，但保持仓库边界。
