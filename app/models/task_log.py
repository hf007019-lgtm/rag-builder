# 从 datetime 模块导入 datetime 类
# datetime 用来生成当前时间，例如创建时间、更新时间
from datetime import datetime


# 从 SQLAlchemy 导入 Column、Integer、String、DateTime、Text
# Column 用来定义数据库表字段
# Integer 表示整数字段
# String 表示短文本字段
# DateTime 表示时间字段
# Text 表示长文本字段，适合保存错误信息
from sqlalchemy import Column, Integer, String, DateTime, Text


# 从数据库会话文件导入 Base
# Base 是所有 SQLAlchemy ORM 模型的父类
# 只有继承 Base，这个类才会被识别成数据库表模型
from app.db.session import Base


# 定义 TaskLog 任务日志模型类
# 这个类对应 PostgreSQL 里的 task_logs 表
class TaskLog(Base):

    # 指定数据库表名
    # SQLAlchemy 会根据这个名字在 PostgreSQL 里创建 task_logs 表
    __tablename__ = "task_logs"

    # 定义主键 id 字段
    # Integer 表示整数类型
    # primary_key=True 表示这是主键
    # index=True 表示给这个字段创建索引，方便查询
    id = Column(Integer, primary_key=True, index=True)

    # 定义 doc_id 字段
    # doc_id 表示这个任务日志属于哪个文档
    # 它对应 documents 表里的文档 id
    doc_id = Column(Integer, index=True, nullable=False)

    # 定义 task_name 字段
    # task_name 表示任务名称
    # 例如：parse_document_task
    task_name = Column(String, nullable=False)

    # 定义 status 字段
    # status 表示任务当前状态
    # 例如：STARTED、SUCCESS、FAILED
    status = Column(String, nullable=False)

    # 定义 message 字段
    # message 用来保存任务过程中的简短说明
    # 例如：Worker 已接到任务、文档处理成功
    message = Column(String, nullable=True)

    # 定义 chunk_count 字段
    # chunk_count 表示这个文档最终生成了多少个文本切片
    # 任务还没完成时可以为空，所以 nullable=True
    chunk_count = Column(Integer, nullable=True)

    # 定义 error_message 字段
    # error_message 用来保存任务失败时的详细错误原因
    # Text 比 String 更适合保存较长错误信息
    error_message = Column(Text, nullable=True)

    # 定义 created_at 字段
    # created_at 表示这条任务日志创建的时间
    # default=datetime.utcnow 表示默认使用当前 UTC 时间
    created_at = Column(DateTime, default=datetime.utcnow)

    # 定义 updated_at 字段
    # updated_at 表示这条任务日志最后更新的时间
    # default=datetime.utcnow 表示创建时默认使用当前 UTC 时间
    # onupdate=datetime.utcnow 表示每次更新这条记录时自动更新时间
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )