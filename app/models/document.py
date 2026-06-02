# 从 datetime 导入 datetime
# 作用：用于记录文档创建时间
from datetime import datetime


# 从 SQLAlchemy 导入字段类型
# Column：定义数据库字段
# Integer：整数类型
# String：字符串类型
# DateTime：日期时间类型
from sqlalchemy import Column, Integer, String, DateTime


# 从数据库会话文件导入 Base
# 作用：所有数据库模型类都要继承 Base
from app.db.session import Base


# 定义文档数据表模型
# 作用：对应 PostgreSQL 里的 documents 表
class Document(Base):

    # 指定数据库表名
    # 作用：SQLAlchemy 会把这个类映射到 documents 表
    __tablename__ = "documents"

    # 文档 ID
    # 作用：每个文档的唯一编号，主键，自增
    id = Column(Integer, primary_key=True, index=True)

    # 文件名
    # 作用：保存用户上传的原始文件名
    file_name = Column(String, nullable=False)

    # 文件哈希
    # 作用：用于判断文件是否重复上传
    file_hash = Column(String, unique=True, index=True, nullable=False)

    # 文档状态
    # 作用：保存 PENDING、PARSING、SUCCESS、FAILED 等状态
    status = Column(String, default="PENDING", nullable=False)

    # 创建时间
    # 作用：记录文档上传入库的时间
    created_at = Column(DateTime, default=datetime.utcnow)