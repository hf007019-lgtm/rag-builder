# 数据导入指南

## 文档说明

- 中文名：数据导入指南
- 文件作用：说明公开仓库中可使用的数据类型和导入前安全检查。
- 为什么需要：避免把私有原文、生产数据或敏感报告误提交到 Git。
- 英文文件名：`data_drop_guide.md`，`data drop` 指批量投放或导入数据。

## 当前支持格式

- `.pdf`
- `.txt`

导入前应确认文件不为空、内容可公开或已获得授权，并且不包含个人隐私、生产凭据或内部机密。

## 导入方式

启动 FastAPI 和 Celery Worker 后，通过 Web 控制台“上传解析”页面或以下接口导入：

```http
POST /api/v1/documents/upload
```

上传成功后按 `doc_id` 查询 `PENDING -> PARSING -> SUCCESS/FAILED` 状态。

## Git 安全

- 不要把原始私有数据放进仓库。
- 本地数据目录使用 `data/`、`uploads/`、`storage/` 或 `raw_private/`，这些路径已被 `.gitignore` 忽略。
- 导入报告只能记录脱敏统计和公开信息。
- 不要在报告中记录 API Key、数据库密码、完整连接凭据或大段受版权保护的原文。
