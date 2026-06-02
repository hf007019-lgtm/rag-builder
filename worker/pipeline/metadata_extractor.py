# 导入 re 正则模块
# 作用：从文本中识别类似【第 1 页】这样的页码标记
import re


# 从 chunk 文本中提取页码
# chunk_text：一个文本块内容
def extract_page_number(chunk_text: str):

    # 使用正则查找页码
    # 例如：【第 1 页】
    match = re.search(r"【第\s*(\d+)\s*页】", chunk_text)

    # 如果找到了页码
    if match:

        # 返回页码数字
        return int(match.group(1))

    # 如果没有找到页码，返回 None
    return None


# 构建 chunk 元数据
# doc_id：文档 ID
# chunk_index：当前 chunk 的序号
# chunk_text：当前 chunk 文本
def build_chunk_metadata(doc_id: int, chunk_index: int, chunk_text: str):

    # 构建 chunk_id
    # 作用：给每个 chunk 一个唯一编号
    chunk_id = f"doc_{doc_id}_chunk_{chunk_index}"

    # 提取页码
    page_number = extract_page_number(chunk_text)

    # 返回元数据字典
    return {
        "chunk_id": chunk_id,
        "page_number": page_number
    }