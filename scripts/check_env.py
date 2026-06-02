# 从 pathlib 模块导入 Path
# 作用：用来检查 .env 文件是否存在
from pathlib import Path


# 从 dotenv 导入 load_dotenv
# 作用：读取 .env 文件里的环境变量
from dotenv import load_dotenv


# 导入 os 模块
# 作用：从系统环境变量中读取配置
import os


# 定义项目根目录
# Path(__file__) 表示当前 check_env.py 文件
# resolve() 表示转成绝对路径
# parents[1] 表示 scripts 目录的上一级，也就是项目根目录
PROJECT_ROOT = Path(__file__).resolve().parents[1]


# 定义 .env 文件路径
# 作用：检查项目根目录下是否存在 .env
ENV_FILE = PROJECT_ROOT / ".env"


# 定义必须检查的环境变量列表
# 每一项是一个二元组：变量名 + 中文说明
REQUIRED_ENV_VARS = [
    ("DATABASE_URL", "PostgreSQL 数据库连接地址"),
    ("MINIO_ENDPOINT", "MinIO 服务地址"),
    ("MINIO_ACCESS_KEY", "MinIO 访问账号"),
    ("MINIO_SECRET_KEY", "MinIO 访问密码"),
    ("MINIO_BUCKET_NAME", "MinIO 存储桶名称"),
    ("REDIS_URL", "Redis 连接地址"),
    ("ES_URL", "Elasticsearch 服务地址"),
    ("ES_INDEX_NAME", "Elasticsearch 索引名称"),
    ("ES_VECTOR_DIMS", "Embedding 向量维度"),
    ("LLM_BASE_URL", "大模型 API 地址"),
    ("LLM_API_KEY", "大模型 API Key"),
    ("EMBEDDING_MODEL_NAME", "Embedding 模型名称"),
    ("CHAT_MODEL_NAME", "聊天模型名称"),
]


# 定义隐藏敏感信息的函数
# 作用：打印 API Key 时不显示完整内容，避免泄露
def mask_secret(value: str) -> str:

    # 如果值为空
    if not value:

        # 返回空字符串
        return ""

    # 如果长度小于等于 8
    if len(value) <= 8:

        # 直接用星号隐藏
        return "*" * len(value)

    # 保留前 4 位和后 4 位，中间用星号隐藏
    return value[:4] + "****" + value[-4:]


# 定义主检查函数
def check_env():

    # 打印开始检查提示
    print("🚀 开始检查 RAG Builder 环境配置...")

    # 检查 .env 文件是否存在
    if not ENV_FILE.exists():

        # 如果不存在，打印错误
        print(f"❌ 未找到 .env 文件：{ENV_FILE}")

        # 提示用户复制 .env.example
        print("👉 请先根据 .env.example 创建 .env 文件")

        # 返回 False 表示检查失败
        return False

    # 如果 .env 存在，打印成功
    print(f"✅ 已找到 .env 文件：{ENV_FILE}")

    # 加载 .env 文件
    # override=True 表示优先使用 .env 里的配置
    load_dotenv(ENV_FILE, override=True)

    # 定义是否全部通过
    all_ok = True

    # 遍历所有必需环境变量
    for key, description in REQUIRED_ENV_VARS:

        # 读取环境变量值
        value = os.getenv(key)

        # 如果值不存在或为空字符串
        if not value:

            # 打印缺失提示
            print(f"❌ 缺少配置：{key}（{description}）")

            # 标记检查失败
            all_ok = False

        # 如果值存在
        else:

            # 如果是敏感配置
            if "KEY" in key or "SECRET" in key:

                # 隐藏敏感信息后打印
                display_value = mask_secret(value)

            # 如果不是敏感配置
            else:

                # 直接打印配置值
                display_value = value

            # 打印成功配置
            print(f"✅ {key} = {display_value}  # {description}")

    # 如果全部配置都存在
    if all_ok:

        # 打印通过提示
        print("🎉 环境变量检查通过，可以启动项目。")

    # 如果有配置缺失
    else:

        # 打印失败提示
        print("⚠️ 环境变量检查未通过，请补全上面的缺失配置。")

    # 返回检查结果
    return all_ok


# 判断当前文件是否直接运行
if __name__ == "__main__":

    # 执行环境检查
    check_env()