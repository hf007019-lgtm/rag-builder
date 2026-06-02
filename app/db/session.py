# 从 SQLAlchemy 导入 create_engine
# 作用：create_engine 用来创建数据库连接引擎
from sqlalchemy import create_engine

# 从 SQLAlchemy 导入 sessionmaker 和 declarative_base
# sessionmaker：用来创建数据库会话工厂
# declarative_base：用来创建 ORM 模型的基类
from sqlalchemy.orm import sessionmaker, declarative_base

# 从统一配置中心导入 settings
# 作用：以后数据库地址从 .env 读取，不再写死在代码里
from app.core.config import settings


# 创建 SQLAlchemy 的模型基类 Base
# 作用：以后所有数据库表模型都要继承这个 Base
Base = declarative_base()


# 创建数据库连接引擎 engine
# 作用：engine 是 Python 程序和 PostgreSQL 数据库之间的底层连接对象
engine = create_engine(settings.DATABASE_URL)


# 创建数据库会话工厂 SessionLocal
# 作用：以后每次操作数据库，都通过 SessionLocal() 创建一个数据库会话
SessionLocal = sessionmaker(
    # autocommit=False 表示不会自动提交事务，需要我们手动 db.commit()
    autocommit=False,

    # autoflush=False 表示不会自动刷新数据到数据库，避免小白阶段出现难理解的行为
    autoflush=False,

    # bind=engine 表示这个会话工厂绑定到上面创建的 PostgreSQL 连接引擎
    bind=engine
)