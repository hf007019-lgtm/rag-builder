# 引入 SQLAlchemy 中定义数据表所需的各类列类型
from sqlalchemy import Column, Integer, String, DateTime, create_engine
# 引入用于创建基础映射类的工厂函数
from sqlalchemy.ext.declarative import declarative_base
# 引入时间模块，用于记录数据的创建/更新时间
from datetime import datetime

# 调用工厂函数，生成一个所有模型类都必须继承的基类
# 以后所有定义的数据表模型，都要继承这个 Base
Base = declarative_base()


# 定义文档记录表模型，继承自 Base
class Document(Base):
    # __tablename__ 是 SQLAlchemy 的特殊属性，指定在 PostgreSQL 中真实创建的表名
    __tablename__ = "documents"

    # 主键字段：自增整数。这是数据库记录的唯一物理标识
    id = Column(Integer, primary_key=True, autoincrement=True)

    # 文件名字段：最大长度255，nullable=False 表示不允许为空（必填项）
    file_name = Column(String(255), nullable=False)

    # 核心字段：文件内容哈希值（通常是 SHA256，固定 64 位字符）
    # unique=True 表示数据库层面强制唯一，这是实现“防重上传”和“秒传”的物理防线
    file_hash = Column(String(64), unique=True, nullable=False)

    # 核心状态机：控制文档解析的生命周期
    # 默认值设为 "PENDING"（等待处理），意味着一入库就处于等待 Worker 领取的排队状态
    status = Column(String(50), default="PENDING", nullable=False)

    # 审计字段：记录文件的上传时间。默认值为当前的 UTC 时间（生产环境统一用 UTC 防时区错乱）
    created_at = Column(DateTime, default=datetime.utcnow)


# ----------------- 数据库连接配置区 -----------------

# 数据库连接字符串格式：postgresql://用户名:密码@主机IP:端口/数据库名
# 这里的配置必须与 docker-compose.yml 中的环境变量完全对应
DATABASE_URL = "postgresql://rag_admin:rag_secure@127.0.0.1:15432/rag_db"

# create_engine 是整个 SQLAlchemy 的核心，它负责维护与数据库底层的连接池
# 每次增删改查底层都要经过这个 engine
engine = create_engine(DATABASE_URL)

# 这是建表的终极指令。
# bind=engine 告诉 SQLAlchemy 使用上面配置的连接。
# create_all 会扫描所有继承自 Base 的类（这里就是 Document），并在数据库里把真实的表建出来。
# （生产环境通常会用 Alembic 做迁移脚本，但在前期开发为了效率我们先用 create_all）
Base.metadata.create_all(bind=engine)

from sqlalchemy.orm import sessionmaker
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)