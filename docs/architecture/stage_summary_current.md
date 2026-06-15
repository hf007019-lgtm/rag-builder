# 当前阶段总结

## 文档说明

- 中文名：当前阶段总结
- 文件作用：记录当前能力、验证范围、主要风险和下一阶段建议。
- 为什么需要：避免后续开发重复判断项目现状，或把静态确认误写成运行验证。
- 英文文件名：`stage_summary_current.md`，意为“当前阶段摘要”。

更新时间：2026-06-15

## 当前阶段

RAG Builder 已形成“文档上传 -> Celery 异步解析 -> Elasticsearch 入库 -> 混合检索 -> LLM 问答 -> 引用返回 -> 离线评测 -> Web 控制台”的本地工程链路。

项目定位仍是轻量级企业知识库 RAG 后端，不包含 `exam_agent` 的岗位推荐、招考分析或其他调用方业务。

## 已具备能力

- FastAPI、Swagger 和原生 Web 控制台
- PostgreSQL、MinIO、Redis、Elasticsearch、Kibana Compose 定义
- PDF/TXT 上传、空文件校验、后缀校验和 SHA-256 去重
- `PENDING/PARSING/SUCCESS/FAILED` 状态流转
- Celery Worker 异步解析、清洗、切块、Embedding 和入库
- 文档列表、状态、任务日志、失败重试和删除
- Elasticsearch 向量与关键词混合检索
- `grounded/unanswerable/chitchat` 回答类型
- `citations` 与兼容字段 `sources`
- qwen3-rerank 检索调试和可选问答重排
- 检索、答案、引用和拒答离线评测
- 控制台评测报告、系统状态和 Worker 活性展示

## 本轮 GitHub 整理范围

- 重写 GitHub README
- 归类架构、运维和评测文档
- 新增 `.env.example`
- 完善 `.gitignore`
- 参数化 Compose 本地凭据默认值，端口不变
- 清理缓存和临时文件
- 检查 Git 跟踪与敏感信息
- 执行 Python、JavaScript 和 Git 格式检查

本轮不启动 FastAPI、Celery Worker 或 Docker 长期服务，也不执行上传与问答端到端验证。

## 主要风险

### 高优先级

1. MinIO 对象名使用原文件名，同名不同内容可能覆盖。
2. Elasticsearch 部分写入后的 retry 缺少完整幂等策略。
3. Celery 投递失败可能留下长期 `PENDING`。
4. Redis、Elasticsearch 和向量维度配置仍有硬编码。
5. 删除流程遇到跨存储部分失败时可能留下残留。

### 中优先级

- 上传一次性读取完整文件，缺少大小限制和流式处理。
- 暂无独立 Celery `task_id` 持久化。
- PDF 解析不覆盖扫描件 OCR、复杂版面和表格。
- 自动化单元测试和接口测试仍缺失。
- 模型 API 状态主要是配置检查，不等同于实际调用成功。

## 下一阶段建议

1. 为 MinIO 引入稳定唯一的 `object_name`。
2. 为 Elasticsearch Chunk 使用稳定 `_id`，完善 retry 幂等。
3. 统一 Redis、Elasticsearch、索引名和维度配置。
4. 增加任务投递失败补偿、PENDING 重派和超时巡检。
5. 增加 pytest 单元测试、FastAPI 接口测试和最小端到端测试。
6. 使用固定知识库与固定问题集持续评估 baseline 和 rerank。
7. 增强 PDF 解析、OCR、页级引用和复杂布局处理。

## 开发约束

- 不把上传改成长时间同步解析。
- 不删除 PostgreSQL、MinIO、Redis、Celery 或 Elasticsearch。
- 不把原始文件或向量放入 PostgreSQL。
- 不把 `exam_agent` 业务逻辑混入仓库。
- 不提交 `.env`、真实密钥、私有数据或运行缓存。
- 未经确认不执行 `git add`、`git commit` 或 `git push`。

完整测试步骤见 [本地测试](../operations/testing.md)，常见问题见 [排错指南](../operations/troubleshooting.md)。
