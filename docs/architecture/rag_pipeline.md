# RAG 流水线

## 文档说明

- 中文名：RAG 数据处理流水线
- 文件作用：说明文档入库、检索问答和离线评测的实际执行顺序。
- 为什么需要：便于定位跨 PostgreSQL、MinIO、Redis、Celery、Elasticsearch 和模型服务的问题。
- 英文文件名：`rag_pipeline.md`，意为“RAG 流水线”。

## 文档入库

```text
接收 PDF/TXT
-> 校验文件名、后缀和空内容
-> 计算 SHA-256 并按 file_hash 查重
-> 原文件写入 MinIO
-> PostgreSQL 创建 PENDING 文档记录
-> 向 Redis/Celery 投递 parse_document_task
-> FastAPI 返回 doc_id
```

Worker 随后执行：

```text
读取 documents
-> 写 STARTED task_log
-> documents.status = PARSING
-> 从 MinIO 下载原文件
-> 解析 PDF/TXT
-> 清洗文本
-> 递归切分 Chunk
-> 调用 Embedding
-> 写入 Elasticsearch
-> documents.status = SUCCESS
-> task_log 记录 SUCCESS 与 chunk_count
```

任一步骤失败时，应尽量写入：

```text
documents.status = FAILED
task_logs.status = FAILED
task_logs.error_message = 可诊断错误
```

## 检索问答

```text
用户问题
-> 判断是否为无需检索的简单交互
-> 问题 Embedding
-> Elasticsearch Hybrid 检索
-> 可选 qwen3-rerank
-> 相关性过滤
-> 拼接检索上下文
-> 调用 Chat 模型
-> 返回 answer + citations + sources
```

没有可靠来源时，服务应返回 `unanswerable`，并清空引用字段。

## 离线评测

```text
加载 evals/cases/rag_retrieval_cases.json
-> 检查 Elasticsearch 是否存在可评测 Chunk
-> 运行 baseline 检索指标
-> 可选运行 rerank 对比
-> 运行答案、引用和拒答评测
-> 更新 eval_report.md 与 eval_results.json
```

评测产物不会随普通问答自动更新。

## 一致性注意事项

- PostgreSQL 记录必须先于 Celery 任务存在。
- MinIO、PostgreSQL 和 Elasticsearch 可能出现部分成功，需要补偿策略。
- retry 必须考虑 Elasticsearch 已写入部分 Chunk 的幂等。
- Chunk 必须持续保留 `doc_id`、`file_name`、`chunk_id` 和页码信息。
- Embedding 模型输出维度必须与 Elasticsearch Mapping 一致。
