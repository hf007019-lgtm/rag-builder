# 本地启动指南

## 文档说明

- 中文名：本地启动指南
- 文件作用：提供 Windows PowerShell 下从配置到启动的完整命令。
- 为什么需要：让新克隆仓库的开发者可以按固定顺序启动依赖、API 和 Worker。
- 英文文件名：`local_start.md`，意为“本地启动”。

## 前置条件

- Python 和 `pip`
- Docker Desktop
- 可用的 DashScope API Key
- PowerShell

## 1. 进入项目并创建配置

```powershell
cd D:\PycharmProjects\rag_builder
Copy-Item .env.example .env
```

从 GitHub 克隆到其他目录时，把第一行替换为实际项目路径。随后编辑 `.env`，填写自己的 `LLM_API_KEY` 和可选的 `DASHSCOPE_API_KEY`。

## 2. 创建虚拟环境并安装依赖

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

如果 PowerShell 禁止执行激活脚本，可在当前窗口临时执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## 3. 启动依赖并初始化数据库

```powershell
docker compose up -d
python scripts/check_env.py
python scripts/init_db.py
```

只检查 Compose 配置、不启动容器：

```powershell
docker compose --env-file .env.example config --quiet
```

## 4. 启动 FastAPI

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 18000
```

访问：

```text
Web 控制台：http://127.0.0.1:18000
Swagger：http://127.0.0.1:18000/docs
```

## 5. 启动 Celery Worker

在另一个已激活虚拟环境的 PowerShell 窗口运行：

```powershell
python -m celery -A worker.celery_app.celery_app worker --loglevel=info --pool=solo
```

等价的 Celery 参数写法：

```powershell
celery -A worker.celery_app.celery_app worker --loglevel=info -P solo
```

Windows 必须使用 `solo` 进程池。上传新文档时 Worker 必须保持运行。

## 6. 基础验证

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:18000/api/v1/health"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:18000/api/v1/health/dependencies"
```

完整验收步骤见 [本地测试](testing.md)。
