# RAG Builder 评测报告

## 评测时间

- 最近更新时间：2026-06-14T17:04:08+08:00

## 检索评测

- 运行状态：completed
- 用例数：9
- 实际评测用例数：6
- top_k：3
- baseline hit_rate@k：100.00%
- baseline recall@k：87.50%
- baseline precision@k：66.67%
- baseline MRR：1.0000
- missing_expected_count：2
- average_latency_ms：492.50
- rerank enabled：True
- rerank status：enabled
- rerank provider：dashscope
- rerank model：qwen3-rerank
- average_rerank_latency_ms：601.09
- rerank hit_rate@k：100.00%
- rerank MRR：1.0000
- delta hit_rate：0.00%
- delta MRR：0.0000
- 说明：已使用 DashScope qwen3-rerank 完成语义重排。

## 答案引用评测

- 运行状态：completed
- 用例数：9
- citation 字段模式：citations
- citation coverage：100.00%
- sources 兼容 coverage：N/A
- expected claim hit rate：93.33%
- unsupported claim count：0
- unanswerable abstention rate：100.00%
- average_latency_ms：1215.58
- 说明：答案、引用与意图行为评测完成

## 失败用例

| stage | case_id | query | failure_reason |
|---|---|---|---|
| answer | case_005 | RAG 对降低幻觉和来源追踪有什么帮助？ | expected claims 命中 1/2 |

## 下一步改进

- 示例 case 默认使用 expected_keywords 弱评测；有真实 ID 后优先填写 expected_chunk_ids。
- 优先评估标准 citations；旧版 sources 仍作为兼容字段支持。
- answer_type、used_retrieval 和预期引用数量按用例可选字段校验。
- expected claim 使用精确包含和字符二元组召回率进行轻量判断。
- 固定一组稳定知识库数据后，再据此调整 top_k、阈值和混合检索权重。
- unsupported claim count 是词面重叠弱评测，重要场景应增加人工或模型裁判复核。
