# RAG 离线评测

## 文档说明

- 中文名：RAG 离线评测说明
- 文件作用：说明评测入口、指标、产物和结果解释。
- 为什么需要：避免把离线报告误认为实时监控，也避免把数据不匹配造成的零分误判为系统故障。
- 英文文件名：`rag_evaluation.md`，意为“RAG 评测”。

## 评测入口

```powershell
python evals/run_retrieval_eval.py
python evals/run_answer_eval.py
```

默认使用 `evals/cases/rag_retrieval_cases.json`，这套用例面向 RAG Builder 项目说明文档。若当前知识库主要是公务员/事业单位政策文件，可以切换到政策评测集：

```powershell
python evals/run_retrieval_eval.py --case-file evals/cases/exam_policy_cases.json
python evals/run_answer_eval.py --case-file evals/cases/exam_policy_cases.json
```

`--cases` 仍可继续使用，`--case-file` 是更直观的等价参数。

启用 qwen3-rerank 对比：

```powershell
python evals/run_retrieval_eval.py --use-rerank --top-k 3 --top-n 30
```

## 前置条件

- Elasticsearch 可访问。
- `rag_chunks` 中存在已解析成功的 Chunk。
- Embedding 配置可用；文档入库阶段支持按 `EMBEDDING_BATCH_SIZE` 分批，默认每批 20 条。
- 答案评测需要 Chat 模型配置可用。
- Rerank 对比需要有效的 DashScope Key。
- 当前上传链路支持单文件和批量上传 PDF / TXT / Markdown / Word(.docx)，`.doc` 需要先转换为 `.docx`。

## 评测内容

检索评测包括：

- `hit_rate@k`
- `recall@k`
- `precision@k`
- `MRR`
- baseline 与 rerank 差异
- 检索和重排耗时

答案评测包括：

- `citations` 引用覆盖
- `sources` 兼容覆盖
- expected claims 命中率
- unsupported claim 弱检查
- 不可回答问题拒答率
- `answer_type` 与 `used_retrieval`

## 用例与产物

```text
evals/cases/rag_retrieval_cases.json   默认 RAG Builder 项目评测集
evals/cases/exam_policy_cases.json     公务员/事业单位政策评测集
evals/eval_report.md                   最近一次 Markdown 报告
evals/eval_results.json                最近一次结构化结果
```

这些文件是离线产物。普通 `/api/v1/search/ask` 请求不会自动更新它们，控制台只读展示最近一次结果。
报告会记录最近一次运行所使用的评测集名称和用例文件。

政策评测集不强依赖本地数据库中的固定 `doc_id`。推荐优先使用：

```text
expected_chunk_ids
-> expected_file_name_keywords + expected_keywords
-> expected_keywords
-> expected_doc_ids
```

其中 `optional_doc_id_hints` 只用于记录当前本地样例中的参考 ID，不参与强制命中判断。

## 如何解释零分

以下情况都可能使部分或全部指标为 0：

- Elasticsearch 索引为空。
- 测试用例与当前知识库内容不匹配。
- 用例期望的 Chunk 或文档已被删除。
- 模型或 Elasticsearch 暂时不可用。
- `expected_keywords` 没有覆盖实际文本表达。

应先检查知识库数据与用例是否匹配，再判断检索或问答实现是否存在问题。

## 当前报告

仓库保留 `evals/eval_report.md` 和 `evals/eval_results.json` 作为最近一次离线评测结果。报告中的数据只代表当时的本地知识库、配置和用例，不代表生产环境或真实官方政策。
