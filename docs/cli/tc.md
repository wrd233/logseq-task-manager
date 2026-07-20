# `tc` CLI 基础

> Slice A 当前只读。CLI 是 Local Service Client，不是第二个 Store 或领域内核。

## 构建

```bash
npm run build --workspace @task-copilot/local-service
npm run build --workspace @task-copilot/cli
```

## 启动 Service

```bash
task-copilot-service \
  --database <graph>/.task-copilot/task-copilot.db \
  --graph-id <stable-graph-id> \
  --descriptor <private-runtime-dir>/service.json
```

三个参数必须显式提供。首次启动只建立空 SQLite 基础，不扫描 Graph、不迁移 FileStorage、不调用模型。启动输出不包含 session token；token 仅在 0600 descriptor 中。

## 命令

```text
tc [--service-descriptor <path>] [--json] status
tc [--service-descriptor <path>] [--json] doctor
tc [--service-descriptor <path>] [--json] object list
tc [--service-descriptor <path>] [--json] object show <object_id>
```

也可用 `TASK_COPILOT_SERVICE_DESCRIPTOR` 指定 descriptor。`--json` 输出固定顶层：

```json
{"schema_version":1,"data":{}}
```

## 退出码

| Code | 含义 |
|---|---|
| 0 | 成功 |
| 2 | 命令/参数错误 |
| 3 | descriptor 缺失、非法或不安全 |
| 4 | Service 不可用或超时 |
| 5 | 未授权或协议不兼容 |
| 6 | 对象不存在 |
| 7 | Doctor 运行完成但未通过 |
| 8 | 其他结构化失败 |

CLI 不接受 SQLite path 作为查询参数，不 import persistence driver，不提供 `force` 或 apply。正式 Proposal submit 与写命令将在对应 Application / Commit Gate 完成后逐项开放。
