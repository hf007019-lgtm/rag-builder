# RAG Builder README 图片素材说明

本文档记录 README 后续计划使用的图片、截图和架构素材。这里的提示词只用于生成视觉草图或制作截图，不代表项目已经存在相应图片，也不应直接复制为虚假的产品截图。

生成后建议人工核对界面内容、技术名词和项目实际能力，再将图片保存到对应路径。

## 1. 顶部横幅

**用途：** README 顶部项目横幅。

**生成提示词：**

```text
A clean modern GitHub README hero banner for a project named "RAG Builder".
Show a local enterprise RAG knowledge base engineering system with a blue and
white SaaS visual style. Include abstract visual elements representing document
ingestion, asynchronous processing, Elasticsearch hybrid retrieval, optional
rerank, LLM answer generation, citation grounding, and evaluation. The result
should feel like a professional open-source AI infrastructure project, not a
fantasy illustration. Use generic technical symbols instead of real product
logos. No fake metrics, no customer logos, no fake online demo.
```

**建议文件：**

```text
docs/assets/hero-banner.png
```

## 2. 系统架构图

**用途：** 展示主要组件与调用关系。

**生成提示词：**

```text
A clean technical architecture diagram for RAG Builder. Show User and Web
Console connecting to a FastAPI Backend. FastAPI connects to PostgreSQL metadata
database, MinIO object storage, Redis broker, and Elasticsearch. Redis dispatches
tasks to a Celery Worker. The Worker performs document parsing, cleaning,
chunking, DashScope Embedding, and writes chunks and vectors to Elasticsearch.
The query flow uses Hybrid Retrieval, optional qwen3-rerank, DashScope LLM, and
returns an Answer with Citations. Use a modern flat diagram, white background,
blue accents, readable labels, and a professional GitHub README layout.
```

**建议文件：**

```text
docs/assets/architecture.png
```

## 3. RAG 文档入库流水线

**用途：** 展示上传到可检索知识库的完整过程。

**生成提示词：**

```text
A horizontal engineering pipeline diagram for RAG Builder. Show Upload PDF or
TXT, validate and hash, store the original file in MinIO, create PENDING metadata
in PostgreSQL, send a task through Redis, Celery Worker parses and cleans the
document, split into chunks, generate embeddings, store chunks and vectors in
Elasticsearch, and update the document to SUCCESS. Use clean SaaS-style cards,
arrows, soft blue and gray colors, readable text, no fake performance metrics.
```

**建议文件：**

```text
docs/assets/rag-pipeline.png
```

## 4. 知识库工作台截图

**用途：** 展示全部知识库页面。

**制作说明：**

优先使用项目真实 Web 控制台截图。截图前准备少量公开测试文档，确保页面中不出现真实企业名称、个人信息、API Key 或内部资料。

**生成草图提示词：**

```text
A realistic browser screenshot mockup of a RAG Builder knowledge workspace.
Use a light professional SaaS layout with a left navigation sidebar. Show
knowledge base summary cards, document collection status, recent document
activity, an upload document action, evaluation summary, and runtime status
chips. Use clean spacing and blue accents. Do not copy any existing product
logo or brand identity.
```

**建议文件：**

```text
docs/assets/knowledge-workspace.png
```

## 5. 带引用的 RAG 问答截图

**用途：** 展示回答与引用证据。

**生成草图提示词：**

```text
A realistic web application screenshot mockup of a RAG chat workspace. Show a
user asking a question about a public sample document. The assistant provides
a grounded answer in the center panel. A source evidence panel displays citation
cards containing document name, chunk id, page number, retrieval score, and a
short original text preview. Use a clean white SaaS style with blue accents.
Do not include private company data or fake customer branding.
```

**建议文件：**

```text
docs/assets/rag-chat-citations.png
```

## 6. 检索与重排调试截图

**用途：** 展示 baseline 与 qwen3-rerank 对比。

**生成草图提示词：**

```text
A realistic screenshot mockup of a retrieval debug page for an open-source RAG
system. Show a query input, Top K and Top N settings, a rerank switch, baseline
hybrid retrieval results, optional qwen3-rerank results, rank changes, score
values, document names, chunk previews, latency values, and fallback messages.
Use a clean developer-tool interface with clear information hierarchy.
```

**建议文件：**

```text
docs/assets/retrieval-debug.png
```

## 7. RAG 评测报告截图

**用途：** 展示离线评测指标和失败用例。

**生成草图提示词：**

```text
A realistic analytics dashboard screenshot mockup for a RAG evaluation report.
Show metric cards for hit rate, recall, precision, MRR, citation coverage,
expected claim hit rate, unsupported claims, and abstention rate. Include a
small failure-case table and a note that the metrics come from offline fixed
test cases. Use a white background, blue accents, readable charts, and no
invented enterprise performance claims.
```

**建议文件：**

```text
docs/assets/evaluation-report.png
```

## 8. 系统状态截图

**用途：** 展示依赖、Worker 和模型配置状态。

**生成草图提示词：**

```text
A realistic dashboard screenshot mockup of the RAG Builder system status page.
Show grouped status cards for FastAPI, PostgreSQL, MinIO, Redis, Elasticsearch,
Celery Worker, Embedding model, Chat LLM, and optional Rerank model. Use clear
labels such as healthy, configured, disabled, unknown, or error. Use green,
yellow, gray, and red status indicators with accompanying text so color is not
the only signal.
```

**建议文件：**

```text
docs/assets/system-status.png
```

## 9. 上传与解析流水线截图

**用途：** 展示上传、任务状态和处理日志。

**生成草图提示词：**

```text
A realistic browser screenshot mockup of the RAG Builder upload and parsing
page. Show a PDF or TXT upload area, a recently uploaded document table,
document status transitions from PENDING to PARSING to SUCCESS, chunk count,
task log entries, and a clear failed-state message example. Use a clean
professional SaaS interface and only public sample filenames.
```

**建议文件：**

```text
docs/assets/upload-pipeline.png
```

## 图片发布前检查

- 图片不得包含真实 API Key、密码、连接凭据或 `.env` 内容。
- 图片不得包含个人隐私、内部文档原文或未授权数据。
- 不使用虚假的客户名称、线上地址和性能指标。
- 截图中的状态和功能应与当前代码实际能力一致。
- README 正式引用图片前，确认对应文件已经存在。
- 建议统一使用 16:9 或接近 1440 × 900 的画布，保持视觉节奏一致。
