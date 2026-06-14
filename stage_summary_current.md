# RAG 后端基础链路阶段总结

## 1. 当前阶段名称

**文档上传、异步解析与检索问答基础链路阶段**

版本参考：当前 Git `master`，HEAD 为 `v0.2.1`。

本阶段已经从单纯后端接口扩展到带本地静态演示控制台的轻量 RAG 系统，但核心定位仍是 RAG 后端，不是 `exam_agent`，也不是岗位推荐或招考分析系统。

## 2. 当前已完成能力

从当前代码可以确认：

- FastAPI 主入口、Swagger 和静态控制台。
- PostgreSQL、MinIO、Redis、Elasticsearch、Kibana 的 Docker Compose 定义。
- PDF/TXT 上传、文件类型校验、空文件校验和 SHA-256 去重。
- MinIO 原文件上传、读取和删除。
- PostgreSQL `documents` 与 `task_logs`。
- 文档 `PENDING/PARSING/SUCCESS/FAILED` 状态流转。
- Redis + Celery 后台解析。
- TXT 解码、pypdf PDF 提取、文本清洗和递归切块。
- OpenAI 兼容 Embedding 调用。
- Elasticsearch chunk/vector 索引和基础混合检索。
- 文档列表、状态、任务日志、失败重试和删除。
- `/api/v1/search/ask` 问答及来源返回。
- PostgreSQL、MinIO、Redis、Elasticsearch 依赖健康检查。
- Windows Celery `--pool=solo` 和常见问题文档。
- 本地演示控制台可调用健康、上传、问答、日志、重试和删除接口。

以上是静态代码确认。本轮没有启动依赖、FastAPI 或 Worker，也没有执行浏览器验证。

## 3. 当前项目可形成的链路

### 3.1 文档入库链路

```text
上传 PDF/TXT
-> FastAPI 校验并读取文件
-> SHA-256 内容查重
-> MinIO 保存原文件
-> PostgreSQL 创建 PENDING 文档
-> Celery 任务进入 Redis
-> Worker 更新 PARSING 并创建 STARTED 日志
-> 从 MinIO 读取原文件
-> 解析、清洗、切块
-> 调用 Embedding
-> Elasticsearch 写入 chunk 和 vector
-> PostgreSQL 更新 SUCCESS
-> task_logs 记录 chunk_count
```

失败路径：

```text
任一异步步骤异常
-> documents.status = FAILED
-> task_logs.status = FAILED
-> task_logs.error_message 记录原因
-> 用户可调用 retry
```

### 3.2 RAG 问答链路

```text
POST /api/v1/search/ask
-> 问题 Embedding
-> ES KNN + 关键词混合检索
-> 文件类型/最高分文档/相关性过滤
-> 拼接来源上下文
-> 调用 Chat 模型
-> 返回 answer + sources
```

### 3.3 管理与观测链路

```text
文档列表
-> 状态查询
-> 任务日志
-> FAILED 重试
-> 删除 PostgreSQL/MinIO/ES 关联资源
```

## 4. 已解决或已有处理的问题

根据当前代码、Git 历史和已有文档，可确认项目已处理或规避：

- Redis 默认端口冲突：当前宿主机使用 `16379`，避开常见的 `6379` 占用。
- MinIO 端口调整：当前 API 使用 `19002`，Console 使用 `19003`。
- 本地代理影响 ES 等服务：代码设置 localhost `NO_PROXY/no_proxy`。
- Windows Celery 进程池兼容：文档推荐 `--pool=solo`。
- Python 错误导入第三方 `app` 包：`scripts/init_db.py` 把项目根目录置于 `sys.path` 前部。
- 重复内容反复解析：上传按 SHA-256 查重。
- 任务不可观察：已有文档状态、任务日志和错误信息。
- 失败后无法再次解析：已有仅针对 `FAILED` 的 retry 接口。
- 回答无法说明依据：接口已返回来源文件、chunk、页码和分数。
- 文档删除缺少跨存储处理：当前已覆盖 MinIO、ES 和 PostgreSQL 主记录。

## 5. 未解决问题

### 高优先级

1. **同名不同内容可能覆盖 MinIO 原文件**  
   MinIO 对象名直接使用 `file.filename`。两个内容不同但文件名相同的文档会通过 hash 查重，却可能指向同一个被覆盖的对象。

2. **失败重试缺少 ES 幂等**  
   ES 写入使用自动 `_id`。若任务写入部分 chunk 后失败，再 retry 可能产生重复 chunk。

3. **Celery 投递失败可能留下长期 PENDING**  
   上传先提交 PostgreSQL，再调用 `send_task`。投递异常后缺少补偿和可用的 PENDING 重派机制。

4. **配置存在硬编码和双来源**  
   Celery Redis、ES URL、索引名和 1536 维 mapping 没有全部使用 `settings`。修改 `.env` 可能只对部分模块生效。

5. **FastAPI 启动强依赖 Elasticsearch**  
   `search_service.py` 在导入时创建 `VectorStore`，会等待 ES；ES 不可用时基础 API 和健康检查也可能无法正常启动。

### 中优先级

- `app/main.py` 重复注册健康路由，可能产生 Duplicate Operation ID。
- 删除流程对 MinIO/ES 失败采用继续执行策略，可能出现数据库已删、对象残留。
- 上传会一次性把整个文件读入内存，没有大小限制或流式处理。
- 当前没有独立 Celery `task_id` 的持久化和查询。
- PDF 仅做基础文本提取，不支持扫描件 OCR、复杂版面和表格。
- `task_logs.doc_id` 未声明数据库外键；当前保留孤立历史日志是设计行为，但约束不明确。
- 健康检查不覆盖模型 API 和 Celery Worker 活性。
- 源码及旧文档在部分 PowerShell 读取方式下会显示乱码，需要统一 UTF-8 工具链。

### 测试与质量

- 仓库没有自动化测试目录。
- 没有固定的 RAG 检索/问答评测集。
- 混合检索权重和阈值主要是代码常量，缺少数据驱动调优。
- 已接入 DashScope `qwen3-rerank`，默认用于检索调试和显式启用的离线评测；调用失败自动回退 baseline。
- 本轮没有运行服务，因此运行状态仍需用户验收。

## 6. 下一阶段建议

建议按以下顺序推进：

1. 为 MinIO 使用 `doc_id/hash + 安全文件名` 生成唯一 `object_name`，并写入 PostgreSQL。
2. 让 ES 使用稳定 chunk `_id`，retry 前按 `doc_id` 清理或覆盖，实现幂等。
3. 统一从 `settings` 读取 Redis、ES URL、索引名和向量维度。
4. 修复重复健康路由，把 ES 初始化从模块导入阶段移到可控生命周期。
5. 增加任务投递失败补偿、PENDING 重派和超时巡检。
6. 增加 pytest 单元测试、FastAPI 接口测试和最小端到端测试。
7. 提升 PDF 解析，逐步支持 OCR、页级元数据和复杂布局。
8. 建立固定问题集评测召回率、来源正确率和拒答行为。
9. 用稳定知识库和固定问题集评估 rerank 指标，再决定是否启用正式问答链路。
10. 最后再扩展多轮对话、权限、管理页面和外部项目接入。

## 7. 当前不要做的事情

- 不要把 `exam_agent` 的岗位推荐、招考分析师、岗位备选或岗位对比代码复制进来。
- 不要为了“统一”而删除 PostgreSQL、MinIO、Redis、Celery 或 Elasticsearch。
- 不要把上传改成全同步解析。
- 不要把原文件或向量直接塞进 PostgreSQL。
- 不要随意改 `docker-compose.yml` 端口或 `.env` 密钥。
- 不要先做复杂 Agent、知识图谱或大型前端，再补基础一致性。
- 不要在没有测试数据的情况下随意调检索阈值并宣称效果提升。
- 不要未经确认执行 Git 暂存、提交或推送。

## 8. 推荐测试命令

本轮未运行以下命令，它们用于下一步本地验收。

### 8.1 不启动服务的基础检查

```powershell
docker compose config
python scripts/check_env.py
git status --short
```

### 8.2 启动依赖和初始化

```powershell
docker compose up -d
docker ps
python scripts/init_db.py
```

### 8.3 启动应用

FastAPI：

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 18000
```

Celery Worker：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

### 8.4 接口验收

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:18000/api/v1/health"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:18000/api/v1/health/dependencies"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:18000/api/v1/documents/"
```

随后按 `docs/testing.md` 验证：

- TXT/PDF 上传。
- 状态从 `PENDING` 到 `SUCCESS`。
- `task_logs` 成功和失败信息。
- `/api/v1/search/ask` 的答案和来源。
- `FAILED` retry。
- 文档删除后的 PostgreSQL、MinIO 和 ES 一致性。
- 重复内容与同名不同内容两个边界场景。

## 9. 推荐提交说明

本轮文档变更适合的提交信息：

```text
docs: add long-term AI context for rag builder
```

推荐提交范围仅包含：

```text
AGENTS.md
project_overview.md
stage_summary_current.md
```

不要把 `.env`、业务代码、`docker-compose.yml` 或运行生成数据混入该文档提交。

## 10. 本阶段结论

RAG Builder 已具备轻量 RAG 后端的主要代码链路，并有可用于演示的静态控制台。下一阶段不应急于扩大功能面，而应优先处理对象命名、任务投递、retry 幂等、配置统一和自动化测试，让现有链路更可靠、更容易维护。
