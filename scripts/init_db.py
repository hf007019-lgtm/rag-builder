# 从 pathlib 模块导入 Path
# Path 用来处理项目路径，比手写字符串路径更稳定
from pathlib import Path


# 导入 sys 模块
# sys.path 可以控制 Python 优先从哪里查找模块
import sys


# 获取当前 init_db.py 文件的绝对路径
# __file__ 表示当前这个脚本文件本身
# resolve() 表示转成绝对路径
CURRENT_FILE = Path(__file__).resolve()


# 获取项目根目录
# parents[1] 表示当前文件的上两级目录
# 当前文件是 scripts/init_db.py，所以项目根目录就是 rag_builder
PROJECT_ROOT = CURRENT_FILE.parents[1]


# 判断项目根目录是否已经在 Python 模块搜索路径里
# 如果不在，就说明 Python 可能找不到你自己的 app 文件夹
if str(PROJECT_ROOT) not in sys.path:

    # 把项目根目录插入到 sys.path 最前面
    # 这样 import app 时，会优先导入 rag_builder/app，而不是 site-packages/app
    sys.path.insert(0, str(PROJECT_ROOT))


# 从数据库会话文件导入 Base 和 engine
# Base 记录了所有 SQLAlchemy 表模型
# engine 是连接 PostgreSQL 的数据库引擎
from app.db.session import Base, engine


# 导入 app.models
# 作用：让 Document、TaskLog 等模型被加载进 Base.metadata
# 如果不导入模型，create_all 可能不知道要创建哪些表
import app.models


# 定义初始化数据库函数
# 作用：根据 SQLAlchemy 模型创建 PostgreSQL 表
def init_db():

    # 打印开始初始化日志
    print("🚀 开始初始化 PostgreSQL 数据表...")

    # 根据所有继承 Base 的模型创建数据表
    # 如果表已经存在，SQLAlchemy 默认不会重复创建
    Base.metadata.create_all(bind=engine)

    # 打印初始化完成日志
    print("✅ PostgreSQL 数据表初始化完成")


# 判断当前文件是否是直接运行
# 如果是 python scripts/init_db.py 运行，就会进入这里
if __name__ == "__main__":

    # 执行数据库初始化函数
    init_db()