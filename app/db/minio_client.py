# 从 minio 库中导入 Minio 客户端类
# 作用：用它连接 MinIO 对象存储服务
from minio import Minio

# 从统一配置中心导入 settings
# 作用：读取 MinIO 地址、账号、密码、桶名称
from app.core.config import settings


# 创建 MinIO 客户端对象
# 作用：以后上传文件、下载文件、创建桶，都通过这个 client 操作
minio_client = Minio(

    # MinIO 服务地址
    # 例如：127.0.0.1:9002
    settings.MINIO_ENDPOINT,

    # MinIO 访问账号
    # 例如：minio_admin
    access_key=settings.MINIO_ACCESS_KEY,

    # MinIO 访问密码
    # 例如：minio_secure
    secret_key=settings.MINIO_SECRET_KEY,

    # secure=False 表示本地开发环境不用 HTTPS
    secure=False
)


# 定义获取桶名称的函数
# 作用：避免其他文件直接写死 rag-docs
def get_bucket_name():

    # 返回配置文件中的 MinIO 桶名称
    return settings.MINIO_BUCKET_NAME


# 定义确保存储桶存在的函数
# 作用：如果 rag-docs 桶不存在，就自动创建
def ensure_bucket_exists():

    # 从配置中心读取桶名称
    bucket_name = settings.MINIO_BUCKET_NAME

    # 判断这个桶是否已经存在
    bucket_exists = minio_client.bucket_exists(bucket_name)

    # 如果桶不存在，就创建桶
    if not bucket_exists:

        # 创建 MinIO 存储桶
        minio_client.make_bucket(bucket_name)

        # 打印创建成功提示
        print(f"✅ MinIO 存储桶已创建: {bucket_name}")

    # 如果桶已经存在，就打印提示
    else:

        # 打印桶已存在提示
        print(f"✅ MinIO 存储桶已存在: {bucket_name}")