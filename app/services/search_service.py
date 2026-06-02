# 导入 os 模块
# 作用：读取 .env 或系统环境变量里的 CHAT_MODEL_NAME
import os


# 从 FastAPI 导入 HTTPException
# 作用：当用户问题为空时，主动返回 400 错误
from fastapi import HTTPException


# 从 DeepDocEngine 导入大模型和 Embedding 引擎
# 作用：用于把用户问题转成向量，以及调用大模型生成最终答案
from worker.deepdoc.core_engine import DeepDocEngine


# 从 VectorStore 导入 Elasticsearch 向量库客户端
# 作用：用于从 Elasticsearch 中检索和用户问题相关的 chunk
from worker.deepdoc.es_client import VectorStore


# 从 Prompt 服务中导入系统提示词、上下文构建函数、用户提示词构建函数、无答案文本函数
# SYSTEM_PROMPT：系统提示词，约束大模型不能乱编
# build_context_text：把 sources 列表拼成知识库上下文
# build_rag_user_prompt：把知识库上下文和用户问题拼成最终 Prompt
# build_no_answer_text：没有足够依据时，统一返回固定话术
from app.services.prompt_service import (
    SYSTEM_PROMPT,
    build_context_text,
    build_rag_user_prompt,
    build_no_answer_text
)


# 创建 DeepDocEngine 实例
# 作用：用于问题向量化和调用大模型回答
# 注意：这里会初始化 OpenAI 兼容客户端，读取 LLM_API_KEY 和 LLM_BASE_URL
search_engine = DeepDocEngine()


# 创建 VectorStore 实例
# 作用：连接 Elasticsearch，并用于后续 hybrid_search 检索相关 chunk
vector_store = VectorStore()


# 从环境变量读取聊天模型名称
# 如果 .env 中没有 CHAT_MODEL_NAME，就默认使用 qwen-plus
CHAT_MODEL_NAME = os.getenv("CHAT_MODEL_NAME", "qwen-plus")


# 最多召回多少个候选片段
# 作用：先从 Elasticsearch 多召回几个 chunk，再进行过滤
RETRIEVAL_TOP_K = 5


# 最低相关性阈值
# 作用：分数低于这个值的 chunk 会被过滤掉
MIN_RELEVANCE_SCORE = 0.6


# 动态阈值比例
# 作用：只保留接近最高分的结果，避免低分无关内容混进来
RELATIVE_SCORE_RATIO = 0.65


# 根据用户问题判断目标文件类型
# 作用：用户说 PDF 时，系统自动优先使用 PDF 文档；用户说 TXT 时，系统自动优先使用 TXT 文档
def detect_target_file_suffix(question: str):

    # 把用户问题转成小写
    # 作用：兼容 PDF、pdf、Pdf 等不同写法
    lower_question = question.lower()

    # 如果用户问题中包含 pdf
    if "pdf" in lower_question:

        # 返回 PDF 文件后缀
        return ".pdf"

    # 如果用户问题中包含 txt，或者中文里提到“文本文件”
    if "txt" in lower_question or "文本文件" in question:

        # 返回 TXT 文件后缀
        return ".txt"

    # 如果用户没有明确指定文件类型
    return None


# 根据文件类型过滤检索结果
# retrieved_chunks：Elasticsearch 检索出来的候选片段列表
# target_suffix：目标文件后缀，例如 .pdf 或 .txt
def filter_by_file_suffix(retrieved_chunks: list, target_suffix: str):

    # 如果用户没有明确指定 PDF 或 TXT
    # 说明不需要按文件类型过滤，直接返回原始检索结果
    if not target_suffix:

        # 返回原始检索结果
        return retrieved_chunks

    # 创建过滤后的结果列表
    # 后面只保存符合目标文件后缀的 chunk
    filtered_chunks = []

    # 遍历所有候选 chunk
    for item in retrieved_chunks:

        # 从当前 chunk 中获取文件名
        # 如果没有 file_name，就使用空字符串兜底，避免报错
        file_name = item.get("file_name", "")

        # 判断文件名是否以目标后缀结尾
        # 例如用户问 PDF，就只保留 .pdf 文件里的 chunk
        if file_name.lower().endswith(target_suffix):

            # 如果文件类型匹配，就保留当前 chunk
            filtered_chunks.append(item)

        # 如果文件类型不匹配
        else:

            # 打印过滤日志，方便调试为什么某些文件没有参与回答
            print(
                f"📌 文件类型过滤：用户问题需要 {target_suffix}，"
                f"已过滤文件：{file_name}"
            )

    # 如果过滤后还有结果
    if filtered_chunks:

        # 返回过滤后的结果
        return filtered_chunks

    # 如果过滤后一个结果都没有
    # 这里返回原始结果，避免因为用户表达不准导致完全没有答案
    return retrieved_chunks


# 按最高分文档聚合过滤
# 作用：如果多个文档都被召回，只选择最高分文档，避免多个文档混在一起干扰回答
def filter_by_best_document(retrieved_chunks: list) -> list:

    # 如果没有检索结果，直接返回空列表
    if not retrieved_chunks:

        # 返回空列表
        return []

    # 取第一个结果作为最高分结果
    # 说明：hybrid_search 一般会按 score 从高到低返回
    best_chunk = retrieved_chunks[0]

    # 获取最高分结果所属的文档 ID
    best_doc_id = best_chunk.get("doc_id")

    # 获取最高分结果所属的文件名
    best_file_name = best_chunk.get("file_name", "")

    # 打印自动选中文档日志
    # 作用：方便你观察模型到底选择了哪个文档作为主要依据
    print(
        f"🎯 自动选择最相关文档："
        f"doc_id={best_doc_id}, file_name={best_file_name}"
    )

    # 创建最高分文档 chunk 列表
    # 后面只保存属于 best_doc_id 的 chunk
    best_doc_chunks = []

    # 遍历所有候选 chunk
    for item in retrieved_chunks:

        # 如果当前 chunk 属于最高分文档
        if item.get("doc_id") == best_doc_id:

            # 保留当前 chunk
            best_doc_chunks.append(item)

        # 如果当前 chunk 不属于最高分文档
        else:

            # 打印被过滤的其他文档
            print(
                f"📄 文档聚合过滤：已过滤其他文档 "
                f"doc_id={item.get('doc_id')}, file={item.get('file_name', '')}"
            )

    # 返回最高分文档里的相关 chunks
    return best_doc_chunks


# 过滤低相关检索结果
# retrieved_chunks：ES 返回的候选片段列表
def filter_relevant_chunks(retrieved_chunks: list) -> list:

    # 如果没有检索结果，直接返回空列表
    if not retrieved_chunks:

        # 返回空列表
        return []

    # 获取最高分
    # 作用：最高分通常代表当前问题最相关的 chunk
    max_score = retrieved_chunks[0].get("score", 0)

    # 计算动态阈值
    # 作用：只保留不低于最高分一定比例的结果
    dynamic_threshold = max_score * RELATIVE_SCORE_RATIO

    # 取固定阈值和动态阈值中更高的那个
    # 作用：既防止低分混入，也避免不同问题分数波动导致误判
    final_threshold = max(MIN_RELEVANCE_SCORE, dynamic_threshold)

    # 打印过滤阈值
    # 作用：方便你调试相关性过滤是否过严或过松
    print(
        f"🧹 开始过滤低相关 chunk："
        f"max_score={max_score:.4f}, "
        f"threshold={final_threshold:.4f}"
    )

    # 创建过滤后的结果列表
    filtered_chunks = []

    # 遍历所有候选 chunk
    for item in retrieved_chunks:

        # 获取当前 chunk 的相关性得分
        score = item.get("score", 0)

        # 如果得分达到最终阈值
        if score >= final_threshold:

            # 保留当前 chunk
            filtered_chunks.append(item)

        # 如果得分太低
        else:

            # 打印低相关过滤日志
            print(
                f"🚫 过滤低相关 chunk："
                f"score={score:.4f}, "
                f"file={item.get('file_name', '')}"
            )

    # 返回过滤后的 chunk 列表
    return filtered_chunks


# 把用户问题转成向量
# question：用户输入的问题
def embed_question(question: str) -> list:

    # 调用 Embedding 接口
    # input=[question] 表示只对用户问题生成一个向量
    # model=search_engine.embed_model_name 表示使用当前配置的 Embedding 模型
    response = search_engine.client.embeddings.create(
        input=[question],
        model=search_engine.embed_model_name
    )

    # 从响应中取出第一个 embedding 向量
    # 因为 input 里只有一个问题，所以 data[0] 就是这个问题的向量
    query_vector = response.data[0].embedding

    # 返回问题向量
    return query_vector


# 定义 RAG 问答函数
# question：用户提出的问题
def ask_question(question: str):

    # 判断 question 是否为空或者全是空格
    # 作用：防止用户提交空问题
    if not question or not question.strip():

        # 抛出 400 错误
        # detail 是返回给前端看的错误信息
        raise HTTPException(status_code=400, detail="问题不能为空")

    # 去掉问题前后的空格
    # 作用：让后续检索更干净
    question = question.strip()

    # 根据用户问题判断目标文件类型
    # 例如用户提到 PDF，就自动优先使用 PDF 文件
    target_suffix = detect_target_file_suffix(question)

    # 如果识别到了目标文件类型
    if target_suffix:

        # 打印查询意图识别日志
        print(f"🧭 查询意图识别：用户问题倾向于检索 {target_suffix} 文件")

    # 把用户问题向量化
    # 作用：后面用这个 query_vector 去 Elasticsearch 里做语义检索
    query_vector = embed_question(question)

    # 调用 Elasticsearch 混合检索
    # query_text 用于关键词检索
    # query_vector 用于向量检索
    # top_k 表示最多召回多少个候选 chunk
    retrieved_chunks = vector_store.hybrid_search(
        query_text=question,
        query_vector=query_vector,
        top_k=RETRIEVAL_TOP_K
    )

    # 如果完全没有检索到内容
    if not retrieved_chunks:

        # 返回统一的无答案文本
        return {
            "answer": build_no_answer_text(),
            "sources": []
        }

    # 先按文件类型过滤
    # 作用：用户问 PDF 时，尽量过滤掉 TXT 等其他文件类型
    type_filtered_chunks = filter_by_file_suffix(
        retrieved_chunks=retrieved_chunks,
        target_suffix=target_suffix
    )

    # 再自动选择最高分文档
    # 作用：如果多个文件都被召回，只保留最相关文档里的 chunks
    best_document_chunks = filter_by_best_document(type_filtered_chunks)

    # 最后过滤低相关 chunk
    # 作用：在最相关文档内部继续去掉低质量片段
    relevant_chunks = filter_relevant_chunks(best_document_chunks)

    # 如果过滤后没有可用内容
    if not relevant_chunks:

        # 返回统一的无答案文本
        return {
            "answer": build_no_answer_text(),
            "sources": []
        }

    # 调用 prompt_service.py 里的 build_context_text
    # 作用：把 sources 列表统一拼成知识库上下文
    context_text = build_context_text(relevant_chunks)

    # 调用 prompt_service.py 里的 build_rag_user_prompt
    # 作用：把知识库上下文和用户问题拼成最终发给大模型的 Prompt
    user_prompt = build_rag_user_prompt(
        context_text=context_text,
        question=question
    )

    # 调用大模型生成最终答案
    # model 使用 CHAT_MODEL_NAME，默认是 qwen-plus
    # messages 中 system 负责约束规则，user 负责提供上下文和问题
    chat_response = search_engine.client.chat.completions.create(
        model=CHAT_MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ]
    )

    # 从大模型响应里取出最终答案
    # choices[0].message.content 是模型生成的文本内容
    final_answer = chat_response.choices[0].message.content

    # 返回最终答案和过滤后的来源信息
    # answer 给用户看
    # sources 给前端展示来源、文件名、chunk、页码和分数
    return {
        "answer": final_answer,
        "sources": relevant_chunks
    }