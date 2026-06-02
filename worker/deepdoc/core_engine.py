# 导入 os 模块
# 作用：读取 .env 里的环境变量
import os

# 从 dotenv 导入 load_dotenv
# 作用：加载 .env 文件中的配置
from dotenv import load_dotenv

# 从 openai 库导入 OpenAI 客户端
# 作用：用于调用兼容 OpenAI 格式的大模型接口，例如通义千问 DashScope
from openai import OpenAI

# 从 langchain_text_splitters 导入递归文本切分器
# 作用：把长文本切成适合 Embedding 的小文本块
from langchain_text_splitters import RecursiveCharacterTextSplitter
load_dotenv(override=True)

#对象前面加self的作用是：以后这个对象的其他方法也能用
class DeepDocEngine:
    def __init__(self):
        api_key=os.getenv("LLM_API_KEY")
        base_url=os.getenv("LLM_BASE_URL")
        #优先读取 .env 里的 EMBEDDING_MODEL_NAME如果没写，就默认用 text-embedding-v2
        self.embed_model_name=os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-v2")

        #如果没有配置 LLM_API_KEY程序直接报错不要继续往下跑
        if not api_key:
            raise ValueError("⚠️ 致命错误: 未找到 LLM_API_KEY 环境变量！")

        print(f"🤖 正在初始化大模型引擎，目标地址: {base_url}")

        #初始化 OpenAI 客户端，OpenAI 这个库 = 通用客户端,base_url = 你真正请求的平台地址,api_key = 访问凭证
        self.client = OpenAI(api_key=api_key,base_url=base_url)

        #文本切分器
        self.text_splitter=RecursiveCharacterTextSplitter(
            chunk_size=500,#每个文本块尽量控制在 500 个字符左右
            chunk_overlap=50,#相邻两个文本块之间保留 50 个字符的重叠内容
            separators=["\n\n", "\n", "。", "！", "？", "，", "、", " ", ""]
        )

    def process_and_embed(self,raw_text:str):

        print(f"🔪 开始切分文本，总长度: {len(raw_text)} 字符...")

        chunks = self.text_splitter.split_text(raw_text)
        print(f"🧩 文本被成功切分为 {len(chunks)} 块！")

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
        response = self.client.embeddings.create(
            input=chunks,
            model=self.embed_model_name
        )

        #把每个文本块和它对应的向量绑定起来
        results =[]
        for i,chunk_data in enumerate(response.data):#enumerate = 同时给你下标和值
            results.append({
                "chunk_text":chunks[i],
                "vector":chunk_data.embedding
            })

        print(f"✨ 向量化完成！第一块文本提取到了 {len(results[0]['vector'])} 维的特征。")

        return results