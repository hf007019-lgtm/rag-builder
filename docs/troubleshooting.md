# RAG Builder 踩坑与故障排查文档

## 1. 文档说明

本文档记录 RAG Builder 项目开发和运行过程中常见的问题、原因分析和解决方案。

本项目依赖组件较多，包括：

- FastAPI
- PostgreSQL
- MinIO
- Redis
- Celery
- Elasticsearch
- DashScope / Qwen API

因此在本地开发过程中，常见问题通常来自：

- 服务未启动
- 端口冲突
- 环境变量配置错误
- Python 导入路径错误
- Windows 本地环境兼容问题
- API Key 配置错误
- 本地代理影响 127.0.0.1 请求

---

## 2. Docker Desktop 未启动

### 报错现象

执行 Docker 命令时报错，可能看到类似：

```text
error during connect
open //./pipe/dockerDesktopLinuxEngine
```

### 原因

Docker Desktop 没有启动，或者 Docker Engine 没有正常运行。

### 解决方案

1. 打开 Docker Desktop
2. 等待 Docker Desktop 显示 Running
3. 重新执行：

```powershell
docker ps
```

如果能看到容器列表，说明 Docker 正常。

---

## 3. Redis 端口冲突

### 报错现象

Redis 容器启动失败，或者提示端口被占用。

### 原因

本机已有其他项目占用了 Redis 默认端口：

```text
6379
```

例如 Dify 本地环境可能已经占用 6379。

### 解决方案

本项目 Redis 使用宿主机端口：

```text
16379
```

`.env` 中配置：

```env
REDIS_URL=redis://127.0.0.1:16379/0
```

Celery 启动日志中应该能看到：

```text
Connected to redis://127.0.0.1:16379/0
```

---

## 4. Python 导入了错误的 app 包

### 报错现象

执行：

```powershell
python scripts/init_db.py
```

出现类似错误：

```text
D:\Python\Python313\Lib\site-packages\app\__init__.py
ModuleNotFoundError: No module named 'config'
```

### 原因

Python 没有导入当前项目里的：

```text
rag_builder/app
```

而是错误导入了 Python 环境中的第三方包：

```text
site-packages/app
```

### 解决方案

在 `scripts/init_db.py` 顶部加入项目根目录路径：

```python
from pathlib import Path
import sys

CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
```

同时确认这些文件存在：

```powershell
Test-Path app\__init__.py
Test-Path app\models\__init__.py
Test-Path app\db\__init__.py
```

如果返回 `False`，就创建：

```powershell
New-Item app\db\__init__.py -ItemType File
```

---

## 5. Celery 在 Windows 上启动失败

### 报错现象

Celery Worker 启动异常，或者出现多进程相关错误。

### 原因

Celery 默认使用多进程池，在 Windows 环境下容易出现兼容问题。

### 解决方案

Windows 下启动 Worker 时加上：

```powershell
--pool=solo
```

完整命令：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

成功后应该看到：

```text
celery@你的电脑名 ready.
```

---

## 6. Celery 启动时报 Kerberos / gssapi 错误

### 报错现象

Celery 启动时报错：

```text
OSError: Could not find KfW installation
```

或者：

```text
Could not find Kerberos for Windows
```

### 原因

Python 环境中安装了 `gssapi`，但 Windows 没有安装 Kerberos for Windows。

本项目使用的是：

```text
Redis + Celery
```

不需要 Kerberos。

### 解决方案

卸载 `gssapi`：

```powershell
python -m pip uninstall -y gssapi
```

然后重新启动 Worker：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

---

## 7. Embedding API 返回 401

### 报错现象

Worker 日志中出现：

```text
HTTP/1.1 401 Unauthorized
Incorrect API key provided
invalid_api_key
```

### 原因

大模型 API Key 配置错误、失效，或者 Worker 没有读取到最新 `.env`。

### 解决方案

检查 `.env`：

```env
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=你的APIKey
EMBEDDING_MODEL_NAME=text-embedding-v2
CHAT_MODEL_NAME=qwen-plus
```

检查环境变量是否读取到：

```powershell
python -c "from dotenv import load_dotenv; import os; load_dotenv('.env', override=True); k=os.getenv('LLM_API_KEY'); print('LLM_API_KEY存在:', bool(k)); print('长度:', len(k or '')); print('LLM_BASE_URL:', os.getenv('LLM_BASE_URL')); print('EMBEDDING_MODEL_NAME:', os.getenv('EMBEDDING_MODEL_NAME'))"
```

修改 `.env` 后必须重启 Worker：

```powershell
Ctrl + C
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

---

## 8. Elasticsearch 连接失败

### 报错现象

日志中出现：

```text
无法连接 Elasticsearch
Connection refused
```

或者 ES ping 失败。

### 原因

可能原因：

1. Elasticsearch 容器没有启动
2. `ES_URL` 配置错误
3. 本地代理影响了 `127.0.0.1`
4. ES 启动较慢，程序连接太早

### 解决方案

检查容器：

```powershell
docker ps
```

检查 `.env`：

```env
ES_URL=http://127.0.0.1:9200
ES_INDEX_NAME=rag_chunks
ES_VECTOR_DIMS=1536
```

浏览器访问：

```text
http://127.0.0.1:9200
```

如果能看到 ES 返回 JSON，说明 ES 正常。

如果本地代理影响连接，需要设置：

```env
NO_PROXY=127.0.0.1,localhost
```

或者在代码中设置：

```python
import os

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
```

---

## 9. PowerShell curl 命令不符合预期

### 报错现象

在 PowerShell 中执行：

```powershell
curl -X DELETE http://127.0.0.1:9200/rag_chunks
```

可能报参数错误。

### 原因

PowerShell 里的 `curl` 不是原生 curl，而是 `Invoke-WebRequest` 的别名。

### 解决方案

使用：

```powershell
curl.exe -X DELETE "http://127.0.0.1:9200/rag_chunks"
```

或者：

```powershell
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:9200/rag_chunks"
```

---

## 10. 文档一直是 PENDING

### 现象

上传文档后，状态一直是：

```text
PENDING
```

### 原因

可能是：

1. Celery Worker 没有启动
2. Redis 没有启动
3. FastAPI 和 Worker 使用的 Redis 地址不一致
4. Celery 任务名写错
5. Worker 没有加载 `worker.tasks`

### 解决方案

确认 Worker 启动：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

Worker 启动后应该能看到：

```text
[tasks]
  . worker.tasks.parse_document_task
```

上传文件后，Worker 终端应该出现：

```text
Task worker.tasks.parse_document_task received
```

---

## 11. 文档状态变成 FAILED

### 现象

文档状态为：

```text
FAILED
```

### 原因

Worker 执行解析任务失败。

常见原因：

1. MinIO 文件不存在
2. PDF 解析失败
3. Embedding API Key 错误
4. Elasticsearch 写入失败
5. 网络异常

### 解决方案

查询任务日志：

```text
GET /api/v1/documents/{doc_id}/task-log
```

例如：

```text
http://127.0.0.1:18000/api/v1/documents/15/task-log
```

查看：

```text
error_message
```

根据错误信息继续定位问题。

---

## 12. retry 接口返回红色 PowerShell 报错

### 现象

执行：

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18000/api/v1/documents/15/retry"
```

PowerShell 显示红色错误：

```text
{"detail":"文档已经解析成功，无需重新解析"}
```

### 原因

接口返回了 HTTP 400，PowerShell 会把 400 当成异常显示。

但这不是程序崩溃，而是正常业务限制：

```text
SUCCESS 文档不允许重复 retry
```

### 解决方案

如果返回：

```json
{
  "detail": "文档已经解析成功，无需重新解析"
}
```

说明接口逻辑正常。

只有 `FAILED` 状态的文档才允许 retry。

---

## 13. 访问 task-log 接口返回 404

### 现象

访问：

```text
http://127.0.0.1:18000/api/v1/document/15/task-log
```

返回：

```text
404 Not Found
```

### 原因

路由前缀写错了。

项目真实接口是复数：

```text
documents
```

不是单数：

```text
document
```

### 解决方案

使用正确地址：

```text
http://127.0.0.1:18000/api/v1/documents/15/task-log
```

---

## 14. FastAPI 出现 Duplicate Operation ID 警告

### 报错现象

FastAPI 启动时出现：

```text
Duplicate Operation ID
```

### 原因

同一个路由函数被重复定义了。

例如 `app/api/v1/document.py` 里出现了两个：

```python
@router.get("/{doc_id}/status")
def get_status(doc_id: int):
    ...
```

### 解决方案

删除重复的路由函数，只保留一个。

---

## 15. health dependencies 某个依赖是 error

### 现象

访问：

```text
GET /api/v1/health/dependencies
```

返回：

```json
{
  "status": "degraded"
}
```

某个依赖状态是：

```text
error
```

### 原因

说明该依赖服务不可用。

例如：

- PostgreSQL error：数据库没启动或连接字符串错误
- MinIO error：MinIO 没启动或 bucket 不存在
- Redis error：Redis 没启动或端口错误
- Elasticsearch error：ES 没启动或 URL 错误

### 解决方案

根据具体依赖排查：

```powershell
docker ps
```

检查 `.env`：

```env
DATABASE_URL=...
MINIO_ENDPOINT=...
REDIS_URL=...
ES_URL=...
```

---

## 16. 上传重复文件没有触发 Worker

### 现象

上传一个之前上传过的文件，没有看到 Worker 执行任务。

### 原因

项目中有文件 Hash 去重逻辑。

如果同一个文件内容已经上传过，系统会识别为重复文件，可能直接返回已有文档信息，不重新解析。

### 解决方案

测试时使用新文件内容。

例如给测试文件加一行：

```text
这是第二次测试，内容不同。
```

然后重新上传。

---

## 17. 修改 .env 后没有生效

### 现象

修改 `.env` 后，程序仍然使用旧配置。

### 原因

FastAPI 或 Worker 在启动时读取 `.env`。

如果服务已经启动，修改 `.env` 不会自动生效。

### 解决方案

修改 `.env` 后重启对应服务：

```powershell
Ctrl + C
uvicorn app.main:app --host 127.0.0.1 --port 18000
```

或者重启 Worker：

```powershell
Ctrl + C
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

---

## 18. 快速排查顺序

如果项目运行异常，建议按这个顺序排查：

```text
1. docker ps 看依赖服务是否启动
2. 访问 /api/v1/health/dependencies 看哪个依赖异常
3. 看 FastAPI 终端日志
4. 看 Celery Worker 终端日志
5. 查 documents 状态
6. 查 task_logs 错误信息
7. 检查 .env 配置
8. 重启 FastAPI 和 Worker
```

---

## 19. 总结

RAG Builder 的常见问题主要集中在：

```text
Docker 服务
端口冲突
环境变量
Celery Worker
Embedding API
Elasticsearch
本地代理
路由路径
```

本项目通过以下方式提高可排查性：

- health dependencies 检查依赖状态
- task_logs 记录任务执行过程
- retry 支持失败任务重试
- sources 支持回答来源追踪