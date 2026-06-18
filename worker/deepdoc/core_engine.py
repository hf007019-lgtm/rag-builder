# 从 openai 库导入 OpenAI 客户端
# 作用：用于调用兼容 OpenAI 格式的大模型接口，例如通义千问 DashScope
from openai import OpenAI

# 从统一配置层导入 settings
# 作用：统一读取模型地址、Key、Embedding 模型和批量大小。
from app.core.config import settings

# 从 langchain_text_splitters 导入递归文本切分器
# 作用：把长文本切成适合 Embedding 的小文本块
from langchain_text_splitters import RecursiveCharacterTextSplitter


MAX_EMBEDDING_BATCH_SIZE = 20

#对象前面加self的作用是：以后这个对象的其他方法也能用
class DeepDocEngine:
    def __init__(self):
        api_key = settings.LLM_API_KEY
        base_url = settings.LLM_BASE_URL
        # 优先读取 .env 里的 EMBEDDING_MODEL_NAME，如果没写，就默认用 text-embedding-v2
        self.embed_model_name = settings.EMBEDDING_MODEL_NAME
        self.embedding_batch_size = self._normalize_embedding_batch_size(
            settings.EMBEDDING_BATCH_SIZE
        )

        #如果没有配置 LLM_API_KEY程序直接报错不要继续往下跑
        if not api_key:
            raise ValueError("⚠️ 致命错误: 未找到 LLM_API_KEY 环境变量！")

        print(
            f"🤖 正在初始化大模型引擎，目标地址: {base_url}，"
            f"Embedding 批量大小: {self.embedding_batch_size}"
        )

        #初始化 OpenAI 客户端，OpenAI 这个库 = 通用客户端,base_url = 你真正请求的平台地址,api_key = 访问凭证
        self.client = OpenAI(api_key=api_key,base_url=base_url)

        #文本切分器
        self.text_splitter=RecursiveCharacterTextSplitter(
            chunk_size=500,#每个文本块尽量控制在 500 个字符左右
            chunk_overlap=50,#相邻两个文本块之间保留 50 个字符的重叠内容
            separators=["\n\n", "\n", "。", "！", "？", "，", "、", " ", ""]
        )

    def _normalize_embedding_batch_size(self, batch_size: int) -> int:

        # DashScope 对单次 input 数量有限制。无论 .env 如何配置，这里都强制不超过 20。
        if batch_size < 1:
            print("警告：EMBEDDING_BATCH_SIZE 小于 1，已回退为 20")
            return MAX_EMBEDDING_BATCH_SIZE

        if batch_size > MAX_EMBEDDING_BATCH_SIZE:
            print(
                f"警告：EMBEDDING_BATCH_SIZE={batch_size} 超过安全上限，"
                f"已按 {MAX_EMBEDDING_BATCH_SIZE} 执行"
            )
            return MAX_EMBEDDING_BATCH_SIZE

        return batch_size

    def process_and_embed(self,raw_text:str):

        print(f"🔪 开始切分文本，总长度: {len(raw_text)} 字符...")

        chunks = self.text_splitter.split_text(raw_text)
        print(f"🧩 文本被成功切分为 {len(chunks)} 块！")

        if not chunks:
            print("⚠️ 文本切分结果为空，跳过向量化")
            return []

        print(f"🧠 开始调用 [{self.embed_model_name}] 模型提取向量特征...")

        #把多个文本块 chunks 发给 embedding 模型，让模型把每个文本块转成一个数字数组（向量）
        """
        chunks = [
            "RAG 是检索增强生成技术。",
            "它可以降低幻觉。",
            "它支持企业私有知识问答。"
        ]
        
        chunks[0] → response.data[0]
        chunks[1] → response.data[1]
        chunks[2] → response.data[2]
        
        当前是第几个 i 当前的 embedding 对象 chunk_data
        """
        results =[]

        batch_size = min(self.embedding_batch_size, MAX_EMBEDDING_BATCH_SIZE)
        total_batches = (len(chunks) + batch_size - 1) // batch_size
        print(
            f"Embedding 分批处理：共 {len(chunks)} 个 chunk，"
            f"每批 {batch_size}，共 {total_batches} 批"
        )

        for batch_number, start in enumerate(
            range(0, len(chunks), batch_size),
            start=1
        ):
            batch_chunks = chunks[start:start + batch_size]
            print(f"正在处理 Embedding 批次 {batch_number}/{total_batches}，数量 {len(batch_chunks)}")

            if len(batch_chunks) > MAX_EMBEDDING_BATCH_SIZE:
                raise RuntimeError(
                    f"Embedding 批次过大：当前 {len(batch_chunks)} 个 chunk，"
                    f"最多 {MAX_EMBEDDING_BATCH_SIZE} 个"
                )

            try:
                response = self.client.embeddings.create(
                    input=batch_chunks,
                    model=self.embed_model_name
                )
            except Exception as exc:
                raise RuntimeError(f"Embedding 第 {batch_number} 批处理失败：{exc}") from exc

            if len(response.data) != len(batch_chunks):
                raise RuntimeError(
                    f"Embedding 第 {batch_number} 批响应数量异常："
                    f"请求 {len(batch_chunks)} 个，返回 {len(response.data)} 个"
                )

            # 按响应 index 复原本批顺序；若服务端未返回 index，则沿用响应顺序。
            batch_vectors = [None] * len(batch_chunks)
            for position, chunk_data in enumerate(response.data):
                response_index = getattr(chunk_data, "index", position)
                if isinstance(response_index, int) and 0 <= response_index < len(batch_chunks):
                    batch_vectors[response_index] = chunk_data.embedding
                else:
                    batch_vectors[position] = chunk_data.embedding

            for i, vector in enumerate(batch_vectors):
                if vector is None:
                    raise ValueError("Embedding 响应缺少部分文本块向量")

                results.append({
                    "chunk_text": batch_chunks[i],
                    "vector": vector
                })

        print(f"✨ 向量化完成！第一块文本提取到了 {len(results[0]['vector'])} 维的特征。")

        return results
