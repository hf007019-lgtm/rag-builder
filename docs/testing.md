# 本地测试步骤

这份文档用于从零检查本地服务是否能跑通。建议每次大改后按顺序走一遍。

## 1. 启动依赖

```powershell
docker compose up -d
docker ps
```

确认这些容器正常运行：

- `rag_postgres`
- `rag_minio`
- `rag_redis`
- `rag_es`

Kibana 是辅助工具，不影响核心接口测试。

## 2. 检查环境变量

```powershell
python scripts/check_env.py
```

预期：所有必需配置都存在。脚本会隐藏 Key 和 Secret 的中间部分。

## 3. 初始化数据库

```powershell
python scripts/init_db.py
```

预期输出类似：

```text
开始初始化 PostgreSQL 数据表...
PostgreSQL 数据表初始化完成
```

## 4. 启动 FastAPI

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 18000
```

打开：

```text
http://127.0.0.1:18000/docs
```

能看到 Swagger 页面就可以继续。

## 5. 启动 Worker

Windows 下使用：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

预期能看到 `ready`，并且任务列表里包含：

```text
worker.tasks.parse_document_task
```

## 6. 准备测试文件

### 任务日志测试文件

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

### 问答测试文件

文件名：

```text
rag_test_01.txt
```

内容：

```text
RAG 测试文档 01

RAG 的全称是 Retrieval-Augmented Generation，中文通常叫检索增强生成。

RAG 系统的核心流程是：先从知识库中检索与用户问题相关的内容，再把检索到的内容作为上下文交给大模型生成回答。

RAG 可以减少大模型幻觉，提高回答的准确性和可追溯性。

在本项目中，PostgreSQL 用于保存文档元数据，MinIO 用于保存原始文件，Redis 和 Celery 用于异步任务调度，Elasticsearch 用于保存文本切片和向量。
```

## 7. 上传文档

Swagger 中调用：

```http
POST /api/v1/documents/upload
```

返回示例：

```json
{
  "msg": "上传成功，后台解析任务已提交",
  "doc_id": 15,
  "file_name": "rag_test_01.txt",
  "status": "PENDING"
}
```

上传后看 Worker 终端，应能看到解析日志。最终文档状态应变为 `SUCCESS`。

## 8. 查询状态

```text
http://127.0.0.1:18000/api/v1/documents/15/status
```

预期：

```json
{
  "id": 15,
  "file_name": "rag_test_01.txt",
  "status": "SUCCESS"
}
```

如果状态是 `FAILED`，继续查任务日志。

## 9. 查询任务日志

```text
http://127.0.0.1:18000/api/v1/documents/15/task-log
```

预期：

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

## 10. 测试问答

接口：

```http
POST /api/v1/search/ask
```

请求：

```json
{
  "question": "RAG 是什么？"
}
```

预期重点：

- 返回 `answer`
- 返回 `sources`
- `sources.file_name` 指向上传的测试文件
- `sources.chunk_text` 来自测试文件内容
- `sources.score` 有值

## 11. 测试 retry

对已经成功的文档调用：

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18000/api/v1/documents/15/retry"
```

预期会返回业务错误：

```json
{
  "detail": "文档已经解析成功，无需重新解析"
}
```

这是正常限制，用来避免成功文档重复写入 ES。

如果文档状态是 `FAILED`，调用 retry 后应返回 `PENDING`，Worker 会重新处理。

## 12. 测试删除

```powershell
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:18000/api/v1/documents/15"
```

预期：

```json
{
  "msg": "文档删除成功",
  "doc_id": 15,
  "file_name": "rag_test_01.txt",
  "deleted_chunks": 1
}
```

删除会处理 MinIO 原文件、ES chunks 和 PostgreSQL `documents` 记录。`task_logs` 会保留。

## 13. 健康检查

```text
http://127.0.0.1:18000/api/v1/health
http://127.0.0.1:18000/api/v1/health/dependencies
```

`dependencies` 里 PostgreSQL、MinIO、Redis、Elasticsearch 都应为 `ok`。

## 14. 跑通标准

- FastAPI 能启动
- Worker 能启动并接到任务
- 文档能上传
- 文档状态能从 `PENDING` 到 `SUCCESS`
- `task_logs` 能查到成功或失败原因
- `/api/v1/search/ask` 能返回 `answer` 和 `sources`
- `/api/v1/health/dependencies` 全部为 `ok`
- 删除文档时 ES chunks 数量能正确返回

## 15. 轻量 RAG 评测

评测脚本复用现有 Elasticsearch 检索、Embedding 和问答服务，不启动 FastAPI、Worker 或浏览器。

基础运行：

```powershell
python evals/run_retrieval_eval.py
python evals/run_answer_eval.py
```

检索脚本默认计算：

- `hit_rate@k`
- `recall@k`
- `precision@k`
- `MRR`
- `average_latency_ms`
- `missing_expected_count`

启用 DashScope rerank 对比：

```powershell
python evals/run_retrieval_eval.py --use-rerank --top-k 3 --top-n 10
```

也可以设置：

```text
RERANK_ENABLED=true
RERANK_PROVIDER=dashscope
RERANK_MODEL_NAME=qwen3-rerank
RERANK_TOP_N=30
RERANK_TOP_K=5
RERANK_TIMEOUT_SECONDS=20
RERANK_APPLY_TO_ASK=false
```

API Key 优先读取 `DASHSCOPE_API_KEY`，未配置时复用现有 `LLM_API_KEY`。调用超时、鉴权失败或响应异常时会自动降级为 baseline，报告仍正常生成且不会记录 API Key。默认不影响 `/api/v1/search/ask`。

用例文件：

```text
evals/cases/rag_retrieval_cases.json
```

有真实知识库数据后，建议按以下优先级填写预期结果：

```text
expected_chunk_ids
-> expected_keywords
-> expected_doc_ids
```

答案评测会检查来源命中、expected claims、不可回答问题的拒答行为，并用词面重叠启发式统计 `unsupported_claim_count`。当前接口没有标准 `citations` 字段，因此标准 citation coverage 按兼容约定显示为 `N/A`；脚本会额外输出 `sources` 兼容命中率。

如果 ES 未启动、索引不存在或索引中没有 chunk，脚本不会崩溃，会在以下文件中记录“没有可评测数据”：

```text
evals/eval_report.md
evals/eval_results.json
```
