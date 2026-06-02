# RAG Builder 项目功能验收清单

## 1. 文档说明

本文档用于检查 RAG Builder 的核心功能是否完整、服务是否可运行、接口是否可测试。

项目定位是轻量级企业知识库 RAG 系统，参考 RAGFlow 工程思想做轻量实现，聚焦核心 RAG 链路实现。

---

## 2. 基础环境验收

- [ ] Docker 依赖服务是否正常启动。
- [ ] PostgreSQL 容器是否正常运行。
- [ ] MinIO 容器是否正常运行。
- [ ] Redis 容器是否正常运行。
- [ ] Elasticsearch 容器是否正常运行。
- [ ] `python scripts/check_env.py` 是否通过。
- [ ] `python scripts/init_db.py` 是否成功。

---

## 3. 服务启动验收

- [ ] FastAPI 是否能正常启动。
- [ ] Celery Worker 是否能正常启动。
- [ ] `GET /api/v1/health` 是否返回正常状态。
- [ ] `GET /api/v1/health/dependencies` 是否全部为 `ok`。

---

## 4. 文档处理链路验收

- [ ] 文档是否能通过接口上传。
- [ ] 上传后文档状态是否为 `PENDING`。
- [ ] Worker 是否能接收解析任务。
- [ ] Worker 是否能完成文档解析。
- [ ] Worker 是否能完成文本清洗。
- [ ] Worker 是否能完成 chunk 切分。
- [ ] Worker 是否能完成 Embedding 向量化。
- [ ] Worker 是否能把 chunks 和 vectors 写入 Elasticsearch。
- [ ] 文档状态是否能从 `PENDING` 变成 `SUCCESS`。

---

## 5. 任务日志与重试验收

- [ ] `task_logs` 是否能记录任务成功信息。
- [ ] `task_logs` 是否能记录任务失败原因。
- [ ] `GET /api/v1/documents/{doc_id}/task-log` 是否能查询任务日志。
- [ ] `POST /api/v1/documents/{doc_id}/retry` 是否能重新派发失败文档的解析任务。
- [ ] `POST /api/v1/documents/{doc_id}/retry` 是否能限制 `SUCCESS` 文档重复解析。

---

## 6. RAG 问答验收

- [ ] `POST /api/v1/search/ask` 是否能返回 `answer`。
- [ ] `POST /api/v1/search/ask` 是否能返回 `sources`。
- [ ] `sources` 是否包含 `doc_id`。
- [ ] `sources` 是否包含 `file_name`。
- [ ] `sources` 是否包含 `chunk_id`。
- [ ] `sources` 是否包含 `page_number`。
- [ ] `sources` 是否包含 `chunk_text`。
- [ ] `sources` 是否包含 `score`。

---

## 7. 文档删除验收

- [ ] 删除文档时是否能删除 MinIO 原文件。
- [ ] 删除文档时是否能删除 Elasticsearch 中对应的 chunks。
- [ ] 删除文档时是否能删除 PostgreSQL `documents` 记录。

---

## 8. 文档完整性验收

- [ ] README 或项目说明文档是否完整。
- [ ] `docs/api.md` 是否描述主要接口。
- [ ] `docs/architecture.md` 是否描述系统架构。
- [ ] `docs/testing.md` 是否描述测试流程。
- [ ] `docs/troubleshooting.md` 是否描述常见问题和排查方法。
- [ ] 本清单是否随核心功能变化同步更新。
