# 常见问题排查

这里记录本地开发时遇到过的问题。排查时优先看两个地方：FastAPI 终端日志和 Celery Worker 终端日志。

## Docker Desktop 没启动

现象：

```text
error during connect
open //./pipe/dockerDesktopLinuxEngine
```

原因：Docker Desktop 或 Docker Engine 没有运行。

解决方式：

```powershell
docker ps
```

如果命令还是失败，先打开 Docker Desktop，等状态变成 Running 后再启动依赖。

## Redis 端口冲突

现象：Redis 容器启动失败，或提示端口被占用。

原因：本机已有服务占用了 `6379`。项目里 Redis 映射到宿主机 `16379`。

检查 `.env`：

```env
REDIS_URL=redis://127.0.0.1:16379/0
```

Worker 启动日志里也应该能看到这个地址。

## Python 导入了错误的 app 包

现象：

```text
D:\Python\Python313\Lib\site-packages\app\__init__.py
ModuleNotFoundError: No module named 'config'
```

原因：脚本没有优先加载当前项目根目录，误导入了环境里的第三方 `app` 包。

解决方式：确认从项目根目录执行命令：

```powershell
python scripts/init_db.py
```

如果仍然报错，检查脚本是否把项目根目录加入了 `sys.path`。当前 `scripts/init_db.py` 已处理这个问题。

## Celery 在 Windows 上启动失败

现象：Worker 启动时报多进程相关错误，或任务执行异常。

原因：Celery 默认进程池在 Windows 下不稳定。

解决方式：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

## Celery 报 Kerberos / gssapi 错误

现象：

```text
OSError: Could not find KfW installation
Could not find Kerberos for Windows
```

原因：环境里装了 `gssapi`，但 Windows 没有 Kerberos for Windows。这个项目使用 Redis + Celery，不需要 Kerberos。

解决方式：

```powershell
python -m pip uninstall -y gssapi
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

## Embedding API 返回 401

现象：

```text
HTTP/1.1 401 Unauthorized
Incorrect API key provided
invalid_api_key
```

原因：`LLM_API_KEY` 错误、失效，或者 Worker 没有读取到最新 `.env`。

检查配置：

```env
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=你的APIKey
EMBEDDING_MODEL_NAME=text-embedding-v2
CHAT_MODEL_NAME=qwen-plus
```

修改 `.env` 后重启 Worker。FastAPI 和 Worker 都是在启动时读取配置，不会自动刷新。

## Elasticsearch 连接失败

现象：

```text
无法连接 Elasticsearch
Connection refused
```

可能原因：

- `rag_es` 没启动
- `ES_URL` 写错
- Elasticsearch 还没启动完成
- 本地代理影响了 `127.0.0.1`

检查：

```powershell
docker ps
```

浏览器访问：

```text
http://127.0.0.1:9200
```

`.env` 示例：

```env
ES_URL=http://127.0.0.1:9200
ES_INDEX_NAME=rag_chunks
ES_VECTOR_DIMS=1536
```

如果是代理问题，确认本地请求没有走代理：

```env
NO_PROXY=127.0.0.1,localhost
```

## PowerShell curl 命令不符合预期

现象：执行 `curl -X DELETE ...` 时参数解析不对。

原因：PowerShell 里的 `curl` 是 `Invoke-WebRequest` 的别名。

解决方式：

```powershell
curl.exe -X DELETE "http://127.0.0.1:9200/rag_chunks"
```

或使用：

```powershell
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:9200/rag_chunks"
```

## 文档一直是 PENDING

现象：上传后状态长期停在 `PENDING`。

可能原因：

- Worker 没启动
- Redis 没启动
- FastAPI 和 Worker 使用的 `REDIS_URL` 不一致
- Worker 没加载 `worker.tasks.parse_document_task`

检查 Worker：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

启动时应看到：

```text
[tasks]
  . worker.tasks.parse_document_task
```

## 文档状态变成 FAILED

现象：状态接口返回 `FAILED`。

常见原因：

- MinIO 文件读取失败
- PDF 解析失败
- Embedding API Key 错误
- Elasticsearch 写入失败
- 网络或代理问题

先查任务日志：

```text
GET /api/v1/documents/{doc_id}/task-log
```

重点看 `error_message`。

## retry 接口在 PowerShell 里显示红色错误

现象：

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18000/api/v1/documents/15/retry"
```

PowerShell 显示：

```json
{
  "detail": "文档已经解析成功，无需重新解析"
}
```

原因：接口返回 HTTP 400，PowerShell 会当成异常显示。对 `SUCCESS` 文档禁止 retry 是正常业务逻辑。

只有 `FAILED` 文档才会重新进入队列。

## task-log 接口 404

现象：

```text
http://127.0.0.1:18000/api/v1/document/15/task-log
```

返回 404。

原因：路径写成了单数 `document`。

正确路径：

```text
http://127.0.0.1:18000/api/v1/documents/15/task-log
```

## FastAPI 出现 Duplicate Operation ID 警告

现象：启动时看到 `Duplicate Operation ID`。

原因通常是路由被重复注册，或同一个函数名对应了重复路径。

处理方式：先确认 Swagger 是否能正常打开，再检查 `app/main.py` 和对应 router 是否重复 include。这个警告不一定会阻断本地功能测试，但最好后续单独清理。

## health dependencies 有 error

现象：

```http
GET /api/v1/health/dependencies
```

返回 `degraded`，某个依赖是 `error`。

按依赖排查：

- PostgreSQL：容器是否启动，`DATABASE_URL` 是否正确
- MinIO：容器是否启动，bucket 是否存在
- Redis：端口是否是 `16379`
- Elasticsearch：`http://127.0.0.1:9200` 是否可访问

## 重复上传没有触发 Worker

现象：上传同一个文件后，看不到 Worker 新任务。

原因：上传链路会按文件 Hash 去重。内容完全相同的文件不会重复解析。

测试时可以改一行内容后重新上传。

## 修改 .env 后没有生效

原因：FastAPI 和 Worker 都是在启动时读取 `.env`。

修改配置后需要重启对应服务：

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 18000
```

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

## 建议排查顺序

```text
docker ps
-> /api/v1/health/dependencies
-> FastAPI 终端日志
-> Worker 终端日志
-> 文档 status
-> task_logs.error_message
-> .env
```
