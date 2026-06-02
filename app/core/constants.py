# 文档状态：等待解析
# 意思：文件已经上传成功，但是 Celery Worker 还没有开始处理
DOCUMENT_STATUS_PENDING = "PENDING"


# 文档状态：正在解析
# 意思：Celery Worker 已经拿到任务，正在读取文件、切块、向量化
DOCUMENT_STATUS_PARSING = "PARSING"


# 文档状态：解析成功
# 意思：文件已经完成切块、Embedding，并成功写入 Elasticsearch
DOCUMENT_STATUS_SUCCESS = "SUCCESS"


# 文档状态：解析失败
# 意思：文档解析、向量化或写入 Elasticsearch 的过程中出现了错误
DOCUMENT_STATUS_FAILED = "FAILED"


# 默认检索数量
# 意思：用户提问时，默认从 Elasticsearch 里取最相关的几个文本块
DEFAULT_TOP_K = 3