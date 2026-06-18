# 用户可见错误文案转换服务
# 作用：把后台原始异常转换成适合接口和前端展示的中文产品提示。
DOCX_DEPENDENCY_MESSAGE = "Word 文档解析失败：当前环境缺少 Word 解析依赖，请安装 python-docx 后重试。"
DOCX_DEPENDENCY_DETAIL_MESSAGE = "Word 解析组件未安装，请安装 python-docx 后重试。"
DOCX_INVALID_FORMAT_MESSAGE = "Word 文档格式无效：该文件不是标准 .docx，请用 Word/WPS 另存为 .docx 后重新上传。"
DOCX_STRUCTURE_MESSAGE = "Word 文档结构异常：文件可能已损坏或不是标准 .docx，请重新下载或另存为 .docx 后上传。"
EMBEDDING_BATCH_SIZE_MESSAGE = "Embedding 批量处理失败：单次向量化文本块数量超过模型限制，请启用分批处理后重试。"
MODEL_CALL_MESSAGE = "模型调用失败：Embedding 服务返回异常，请稍后重试或检查模型配置。"


def is_docx_dependency_missing(raw_message: str) -> bool:

    # 统一判断 python-docx 依赖缺失，避免接口或前端漏出原始 Python 异常。
    normalized = raw_message.lower()
    return (
        "no module named 'docx'" in normalized
        or 'no module named "docx"' in normalized
        or "当前环境缺少 word 解析依赖" in normalized
        or "word 解析组件未安装" in normalized
    )


def is_docx_invalid_format(raw_message: str) -> bool:

    # python-docx 读取非标准 docx 时会抛出英文 zip 异常，用户侧统一提示重新另存。
    normalized = raw_message.lower()
    return "file is not a zip file" in normalized


def is_docx_structure_invalid(raw_message: str) -> bool:

    # 关系表缺失通常说明 docx 内部结构损坏或并非标准文件。
    normalized = raw_message.lower()
    return "no relationship of type" in normalized


def is_embedding_batch_size_invalid(raw_message: str) -> bool:

    normalized = raw_message.lower()
    return (
        "batch size is invalid" in normalized
        or "internalerror.algo.invalidparameter" in normalized
    )


def format_user_error_message(error_message: str | None):

    # 没有错误信息时直接返回空
    if not error_message:
        return None

    # 转成字符串，便于统一匹配
    raw_message = str(error_message)
    normalized = raw_message.lower()

    # Word 解析依赖缺失的专门提示
    if is_docx_dependency_missing(raw_message):
        return DOCX_DEPENDENCY_MESSAGE

    # Word 文件本身不是标准 docx，避免暴露 zip 底层异常。
    if is_docx_invalid_format(raw_message):
        return DOCX_INVALID_FORMAT_MESSAGE

    # Word 内部 relationship 结构异常，避免暴露 OpenXML 关系类型。
    if is_docx_structure_invalid(raw_message):
        return DOCX_STRUCTURE_MESSAGE

    # Embedding 批量大小超出模型限制时，不展示底层英文错误。
    if is_embedding_batch_size_invalid(raw_message):
        return EMBEDDING_BATCH_SIZE_MESSAGE

    # OpenAI 兼容客户端异常不直接展示给用户。
    if "openaierror" in normalized:
        return MODEL_CALL_MESSAGE

    # 其他 Python 模块缺失不直接暴露原始异常
    if "no module named" in normalized:
        return "文档解析失败：当前运行环境缺少必要依赖，请补充依赖后重试。"

    # 常见 Word 空文档提示已经是中文产品文案，可以直接展示
    if "word 文档未提取到有效文本" in normalized:
        return "Word 文档未提取到有效文本，请确认文档内容不是空白或纯图片。"

    # 避免把明显的 Python 异常类名直接展示给用户
    python_error_tokens = (
        "modulenotfounderror",
        "importerror",
        "traceback",
        "filenotfounderror",
        "valueerror",
        "typeerror",
    )
    if any(token in normalized for token in python_error_tokens):
        return "文档处理失败，请检查文件内容、格式或后台依赖后重试。"

    # 已经是中文业务错误时保留原文
    return raw_message


def format_user_error_detail_message(error_message: str | None):

    # 详情区更短，便于用户直接看到修复动作。
    if not error_message:
        return None

    raw_message = str(error_message)
    if is_docx_dependency_missing(raw_message):
        return DOCX_DEPENDENCY_DETAIL_MESSAGE

    return format_user_error_message(raw_message)
