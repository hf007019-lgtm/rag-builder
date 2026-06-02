# RAG Builder API 接口文档

## 1. 项目说明

本项目是一个基于 FastAPI 的轻量级企业知识库 RAG 问答系统。

系统支持：

- PDF / TXT 文档上传
- 文档异步解析
- 文本清洗
- Chunk 切分
- Embedding 向量化
- Elasticsearch 向量检索
- RAG 智能问答
- 来源追踪
- 任务日志查询
- 失败任务重试
- 系统依赖健康检查

---

## 2. 服务地址

本地开发环境：

```text
http://127.0.0.1:18000