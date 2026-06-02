# 从文档解析器导入 parse_document_content
# 作用：根据文件类型自动解析 txt、pdf 等文档
from worker.pipeline.parser import parse_document_content


# 从文本清洗器导入 clean_text
# 作用：清理 PDF / TXT 中多余空格、换行和异常字符
from worker.pipeline.cleaner import clean_text


# 从文档处理核心引擎导入 DeepDocEngine
# 作用：负责文本切块和 Embedding 向量化
from worker.deepdoc.core_engine import DeepDocEngine


# 从 Elasticsearch 向量库客户端导入 VectorStore
# 作用：负责把文本块和向量写入 Elasticsearch
from worker.deepdoc.es_client import VectorStore

# 从元数据提取器导入 build_chunk_metadata
# 作用：给每个 chunk 生成 chunk_id 和 page_number
from worker.pipeline.metadata_extractor import build_chunk_metadata


# 定义文档入库流水线类
# 作用：把“解析、清洗、切块、向量化、写入 ES”封装成完整流程
class DocumentIngestionPipeline:

    # 初始化流水线
    # engine：Embedding 和切块引擎，可传入已有实例
    def __init__(self, engine=None):

        # 如果外部传入了 engine，就复用外部的
        if engine:

            # 保存外部传入的 engine
            self.engine = engine

        # 如果外部没有传入 engine
        else:

            # 创建新的 DeepDocEngine
            self.engine = DeepDocEngine()

    # 处理单个文档
    # doc_id：文档 ID
    # file_name：文件名
    # file_bytes：文件二进制内容
    def process(self, doc_id: int, file_name: str, file_bytes: bytes):

        # 打印流水线开始日志
        print(f"🚀 开始执行文档入库流水线: doc_id={doc_id}, file_name={file_name}")

        # 根据文件类型解析文本
        # 作用：txt 走文本解码，pdf 走 PDF 解析
        raw_text = parse_document_content(
            file_name=file_name,
            content=file_bytes
        )

        # 如果解析出来的原始文本为空
        if not raw_text.strip():

            # 抛出错误
            raise ValueError("文件内容为空，无法解析")

        # 打印原始文本长度
        print(f"📖 文档解析成功，原始长度: {len(raw_text)} 字符")

        # 清洗文本
        # 作用：去掉多余空格、异常换行和不可见字符
        cleaned_text = clean_text(raw_text)

        # 如果清洗后文本为空
        if not cleaned_text.strip():

            # 抛出错误
            raise ValueError("文件清洗后内容为空，无法解析")

        # 打印清洗后文本长度
        print(f"🧼 文本清洗完成，清洗后长度: {len(cleaned_text)} 字符")

        # 文本切块 + Embedding
        # 作用：把清洗后的文本切成 chunk，并转成向量
        processed_data = self.engine.process_and_embed(cleaned_text)

        # 打印切片数量
        print(f"🧩 文档共生成 {len(processed_data)} 个文本切片")

        # 创建 Elasticsearch 向量库客户端
        vector_store = VectorStore()

        # 遍历每一个文本切片
        for chunk_index, item in enumerate(processed_data):
            # 构建 chunk 元数据
            # 作用：生成 chunk_id，并尝试提取 PDF 页码
            metadata = build_chunk_metadata(
                doc_id=doc_id,
                chunk_index=chunk_index,
                chunk_text=item["chunk_text"]
            )

            # 把文本块写入 Elasticsearch
            vector_store.insert_chunk(
                doc_id=doc_id,
                file_name=file_name,
                chunk_id=metadata["chunk_id"],
                page_number=metadata["page_number"],
                chunk_text=item["chunk_text"],
                vector=item["vector"]
            )

        # 立即刷新 ES 索引
        vector_store.es.indices.refresh(index=vector_store.index_name)

        # 打印流水线完成日志
        print(f"✅ 文档入库流水线完成: doc_id={doc_id}, chunks={len(processed_data)}")

        # 返回处理结果
        return {
            "doc_id": doc_id,
            "file_name": file_name,
            "chunk_count": len(processed_data)
        }