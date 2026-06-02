# 导入 re 正则模块
# 作用：用于清理多余空格、换行、特殊字符
import re


# 清洗文本内容
# raw_text：解析器提取出来的原始文本
def clean_text(raw_text: str) -> str:

    # 如果文本为空，直接返回空字符串
    if not raw_text:
        return ""

    # 去掉字符串首尾空白
    text = raw_text.strip()

    # 统一 Windows 换行符
    # 作用：把 \r\n 和 \r 都转成 \n
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # 把连续 3 个及以上换行压缩成 2 个换行
    # 作用：避免 PDF 解析出来大量空行
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 把每一行开头和结尾的空格去掉
    # 作用：让文本更干净
    lines = []

    # 遍历每一行文本
    for line in text.split("\n"):

        # 清理当前行首尾空格
        cleaned_line = line.strip()

        # 保存清洗后的行
        lines.append(cleaned_line)

    # 重新拼接文本
    text = "\n".join(lines)

    # 把多个连续空格压缩成一个空格
    # 作用：处理 PDF 中常见的异常空格
    text = re.sub(r"[ \t]{2,}", " ", text)

    # 去掉常见不可见字符
    # 作用：避免奇怪字符影响切块和 Embedding
    text = text.replace("\u00a0", " ")

    # 再次去掉首尾空白
    text = text.strip()

    # 返回清洗后的文本
    return text