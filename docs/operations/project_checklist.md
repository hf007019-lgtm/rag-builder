# 项目功能检查清单

这份清单用于确认本地 RAG 后端是否能跑通。

## 环境

- [ ] Docker Desktop 已启动。
- [ ] `docker compose up -d` 执行成功。
- [ ] PostgreSQL 容器正常。
- [ ] MinIO 容器正常。
- [ ] Redis 容器正常。
- [ ] Elasticsearch 容器正常。
- [ ] `python scripts/check_env.py` 通过。
- [ ] `python scripts/init_db.py` 成功。

## 服务

- [ ] FastAPI 能启动。
- [ ] Swagger 能打开：`http://127.0.0.1:18000/docs`。
- [ ] Celery Worker 能启动。
- [ ] Worker 任务列表包含 `worker.tasks.parse_document_task`。
- [ ] `GET /api/v1/health` 返回 `ok`。
- [ ] `GET /api/v1/health/dependencies` 中依赖全部为 `ok`。

## 文档入库

- [ ] `.txt` 文件能上传。
- [ ] `.pdf` 文件能上传。
- [ ] 不支持的文件类型会被拒绝。
- [ ] 重复文件不会重复解析。
- [ ] 上传后返回 `doc_id`。
- [ ] 新文档初始状态为 `PENDING`。
- [ ] Worker 能接到解析任务。
- [ ] 文档状态能变成 `SUCCESS`。
- [ ] 失败时状态能变成 `FAILED`。
- [ ] Elasticsearch 中能查到对应 chunks。

## 任务日志和重试

- [ ] 成功任务会写入 `task_logs`。
- [ ] 失败任务会记录 `error_message`。
- [ ] `GET /api/v1/documents/{doc_id}/task-log` 能查到日志。
- [ ] `FAILED` 文档可以调用 retry。
- [ ] `SUCCESS` 文档调用 retry 会被拒绝。

## 问答

- [ ] `POST /api/v1/search/ask` 能返回 `answer`。
- [ ] `POST /api/v1/search/ask` 能返回 `sources`。
- [ ] `POST /api/v1/search/ask` 能返回 `citations`。
- [ ] 响应包含 `answer_type` 和 `used_retrieval`。
- [ ] `sources` 包含 `doc_id`。
- [ ] `sources` 包含 `file_name`。
- [ ] `sources` 包含 `chunk_id`。
- [ ] `sources` 包含 `page_number`。
- [ ] `sources` 包含 `chunk_text`。
- [ ] `sources` 包含 `score`。

## 删除

- [ ] 删除文档接口能返回成功。
- [ ] MinIO 原文件被删除。
- [ ] Elasticsearch chunks 被删除。
- [ ] PostgreSQL `documents` 记录被删除。
- [ ] `task_logs` 历史记录按当前设计保留。

## 文档

- [ ] README 能说明项目用途和启动方式。
- [ ] `docs/architecture/api_overview.md` 接口路径与代码一致。
- [ ] `docs/architecture/project_architecture.md` 说明当前模块边界。
- [ ] `docs/operations/testing.md` 可以按步骤完成本地测试。
- [ ] `docs/operations/troubleshooting.md` 覆盖常见本地问题。
- [ ] `docs/evaluation/rag_evaluation.md` 说明离线评测边界。
