# 导入 os 模块
# 作用：设置本地请求不走代理
import os

# 导入 time 模块
# 作用：连接 ES 失败时等待重试
import time


# 强制绕过系统代理
# 作用：防止请求 127.0.0.1 时被 Clash / V2ray 等代理软件拦截
os.environ["NO_PROXY"] = "127.0.0.1,localhost"

# 小写版本也设置一遍
# 作用：兼容不同底层库读取环境变量的方式
os.environ["no_proxy"] = "127.0.0.1,localhost"


# 从 elasticsearch 库导入 Elasticsearch 客户端
# 作用：用于连接和操作 Elasticsearch
from elasticsearch import Elasticsearch


# 定义向量库操作类
# 作用：封装 ES 的连接、建索引、写入、检索、删除
class VectorStore:

    # 初始化 VectorStore
    # 作用：创建 ES 客户端，并确保索引存在
    def __init__(self):

        # 创建 Elasticsearch 客户端
        # 作用：连接本地 ES 服务
        self.es = Elasticsearch(
            "http://127.0.0.1:9200",
            headers={"Connection": "close"}
        )

        # 定义索引名称
        # 作用：所有 chunk 都存到 rag_chunks 这个索引里
        self.index_name = "rag_chunks"

        # 等待 ES 服务启动完成
        self._wait_for_es()

        # 初始化 ES 索引
        self._init_index()

    # 等待 Elasticsearch 就绪
    # timeout 表示最多等待多少秒
    def _wait_for_es(self, timeout=30):

        # 打印连接提示
        print("⏳ 正在连接 Elasticsearch...")

        # 记录开始时间
        start_time = time.time()

        # 在超时时间内不断尝试连接 ES
        while time.time() - start_time < timeout:

            # 尝试 ping ES
            try:

                # 如果 ES 有响应
                if self.es.ping():

                    # 打印成功日志
                    print("✅ 成功连接到 Elasticsearch")

                    # 结束函数
                    return

            # 如果连接失败
            except Exception as e:

                # 打印失败原因
                print(f"⚠️ 连接失败，3秒后重试... ({e})")

                # 等待 3 秒后重试
                time.sleep(3)

        # 超时后仍然连接不上，直接抛错
        raise ConnectionError(
            f"❌ 无法在 {timeout} 秒内连接到 Elasticsearch (http://127.0.0.1:9200)\n"
            f"请确保已启动 Docker Compose 服务：docker compose up -d"
        )

    # 初始化 Elasticsearch 索引
    # 作用：如果 rag_chunks 不存在，就创建它
    def _init_index(self):

        # 捕获初始化索引时可能出现的异常
        try:

            # 判断索引是否不存在
            if not self.es.indices.exists(index=self.index_name):

                # 定义 Elasticsearch 索引结构
                # 作用：告诉 ES 每个字段是什么类型
                mapping = {
                    "mappings": {
                        "properties": {

                            # 文档 ID
                            # 作用：记录当前 chunk 属于哪一个文档
                            "doc_id": {
                                "type": "integer"
                            },

                            # 文件名
                            # 作用：记录当前 chunk 来自哪个原始文件
                            "file_name": {
                                "type": "keyword"
                            },
                            # 文本块 ID
                            # 作用：唯一标识一个 chunk
                            "chunk_id": {
                                "type": "keyword"
                            },

                            # 页码
                            # 作用：记录 PDF chunk 来自第几页
                            "page_number": {
                                "type": "integer"
                            },

                            # 文本块内容
                            # 作用：用于 BM25 关键词检索
                            "chunk_text": {
                                "type": "text"
                            },

                            # 向量字段
                            # 作用：用于语义相似度检索
                            "vector": {
                                "type": "dense_vector",
                                "dims": 1536,
                                "index": True,
                                "similarity": "cosine"
                            }
                        }
                    }
                }

                # 创建 ES 索引
                # 作用：创建 rag_chunks 并应用上面的 mapping
                self.es.indices.create(
                    index=self.index_name,
                    body=mapping
                )

                # 打印成功日志
                print(f"📦 成功在 Elasticsearch 中创建了向量索引: {self.index_name}")

            # 如果索引已经存在
            else:

                # 打印提示
                print(f"📦 Elasticsearch 索引已存在: {self.index_name}")

        # 如果初始化索引失败
        except Exception as e:

            # 打印错误
            print(f"❌ 初始化 Elasticsearch 索引失败: {e}")

            # 抛出异常
            raise

    # 把一个文本块和它的向量写入 Elasticsearch
    # doc_id：文档 ID
    # file_name：文件名
    # chunk_text：文本块内容
    # vector：文本块向量
    def insert_chunk(self,doc_id: int,file_name: str,chunk_text: str,vector: list,chunk_id: str = None,page_number: int = None):

        # 组装要写入 Elasticsearch 的数据
        # 作用：一条数据就是一个 chunk
        doc = {
            "doc_id": doc_id,
            "file_name": file_name,
            "chunk_id": chunk_id,
            "page_number": page_number,
            "chunk_text": chunk_text,
            "vector": vector
        }

        # 写入 Elasticsearch
        # 作用：把当前 chunk 存进 rag_chunks 索引
        self.es.index(
            index=self.index_name,
            document=doc
        )

        # 打印成功日志
        print(f"📥 成功将 Doc {doc_id} [{file_name}] 的一块数据存入向量数据库！")

    # 执行混合检索
    # query_text：用户原始问题
    # query_vector：用户问题对应的向量
    # top_k：返回前几个最相关片段
    def hybrid_search(self, query_text: str, query_vector: list, top_k: int = 3):

        # 打印检索日志
        print(f"🔎 开始多路召回检索，目标问题: '{query_text}'")

        # 构建 ES 混合检索语句
        # 作用：同时使用向量检索和关键词检索
        search_query = {

            # 向量检索部分
            # 作用：根据语义相似度查找相关 chunk
            "knn": {
                "field": "vector",
                "query_vector": query_vector,
                "k": top_k,
                "num_candidates": 10,
                "boost": 0.7
            },

            # 关键词检索部分
            # 作用：根据文本关键词匹配 chunk_text
            "query": {
                "match": {
                    "chunk_text": {
                        "query": query_text,
                        "boost": 0.3
                    }
                }
            },

            # 最多返回 top_k 条结果
            "size": top_k
        }

        # 捕获 ES 检索异常
        try:

            # 执行 ES 搜索
            response = self.es.search(
                index=self.index_name,
                body=search_query
            )

            # 创建空列表
            # 作用：保存最终返回给 search_service.py 的检索结果
            results = []

            # 获取命中结果列表
            hits = response["hits"]["hits"]

            # 打印检索完成日志
            print(f"🎯 检索完成！找到 {len(hits)} 个高价值片段。")

            # 遍历 Elasticsearch 返回的每一个命中结果
            for hit in hits:

                # 获取相关性得分
                # 作用：分数越高，说明这个文本块和用户问题越相关
                score = hit["_score"]

                # 获取当前命中的原始数据
                # 作用：里面包含 doc_id、file_name、chunk_text、vector 等字段
                source = hit["_source"]

                # 获取文档 ID
                # 作用：告诉前端这个文本块来自哪一个文档
                doc_id = source.get("doc_id")

                # 获取文件名
                # 作用：告诉前端这个文本块来自哪个文件
                file_name = source.get("file_name", "")

                # 获取文本块内容
                # 作用：这是实际参与问答的知识库片段
                chunk_text = source.get("chunk_text", "")

                # 打印命中日志
                # 作用：方便你在终端看到检索到了什么
                print(f"   -> [得分: {score:.4f}] 来自文档 {doc_id} [{file_name}]: {chunk_text[:30]}...")

                # 把完整来源信息加入结果列表
                results.append({
                    "doc_id": doc_id,
                    "file_name": file_name,
                    "chunk_id": source.get("chunk_id", ""),
                    "page_number": source.get("page_number"),
                    "chunk_text": chunk_text,
                    "score": score
                })

            # 返回完整来源信息
            return results

        # 如果 ES 检索失败
        except Exception as e:

            # 打印错误信息
            print(f"❌ ES 检索失败: {e}")

            # 返回空列表，避免接口直接崩溃
            return []

    # 根据文档 ID 删除 Elasticsearch 中的所有文本块
    # doc_id：要删除的文档 ID
    def delete_chunks_by_doc_id(self, doc_id: int):

        # 打印删除提示
        # 作用：方便你在终端看到当前正在删除哪个文档的向量数据
        print(f"🗑️ 准备删除 Elasticsearch 中 Doc {doc_id} 的所有文本块...")

        # 构建删除查询
        # 作用：删除 doc_id 等于目标文档 ID 的所有 chunk
        delete_query = {
            "query": {
                "term": {
                    "doc_id": doc_id
                }
            }
        }

        # 捕获删除过程中可能出现的异常
        # 作用：避免 ES 删除失败时整个程序直接崩溃
        try:

            # 执行 delete_by_query
            # 作用：根据查询条件批量删除 ES 中的数据
            response = self.es.delete_by_query(
                index=self.index_name,
                body=delete_query,
                refresh=True,
                conflicts="proceed"
            )

            # 获取删除数量
            # 作用：知道这次实际删除了多少个 chunk
            deleted_count = response.get("deleted", 0)

            # 打印成功日志
            print(f"✅ 已删除 Elasticsearch 中 Doc {doc_id} 的 {deleted_count} 个文本块")

            # 返回删除数量
            return deleted_count

        # 如果删除失败
        except Exception as e:

            # 打印错误信息
            print(f"⚠️ 删除 Elasticsearch chunks 失败: {e}")

            # 返回 0，表示没有成功删除 chunk
            return 0