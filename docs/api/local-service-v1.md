# Local Service Protocol v1

> 状态：Slice A 基础协议；只读能力已实现，正式写路由尚未开放。

## 连接与认证

- Service 只绑定 `127.0.0.1` 的随机端口；
- 启动时原子写入 0600 descriptor：`protocolVersion`、`url`、高熵 session token、PID、createdAt；
- Client 拒绝非 HTTP、非 `127.0.0.1`、带用户名/密码、非根路径或版本不兼容的 descriptor；
- 每个请求携带 `Authorization: Bearer <session token>`，但 token 不进入 stdout、错误、诊断或报告；
- Service 正常退出时删除本次 descriptor；过期 descriptor 的连接失败进入受限模式。

## 当前路由

| Method | Path | 结果 | 写入 |
|---|---|---|---|
| GET | `/health` | READY、protocol、capabilities | 无 |
| GET | `/status` | protocol、DB schema、对象数 | 无 |
| POST | `/doctor` | integrity、foreign keys、对象数 | 无 |
| GET | `/objects` | V2 对象列表 | 无 |
| GET | `/objects/{object_id}` | 单对象或 `OBJECT_NOT_FOUND` | 无 |

未知路由返回 404。当前 `capabilities.formalWrites/migration/provider` 均为 `false`；在 Graph + SQLite SemanticCommit Gate 完成前，不提供对象写 HTTP 路由。

## Client 错误

| Code | 含义 |
|---|---|
| `SERVICE_DESCRIPTOR_INVALID` | descriptor 缺字段或非法 JSON |
| `SERVICE_DESCRIPTOR_INSECURE` | 文件权限不是 0600 |
| `SERVICE_DESCRIPTOR_NON_LOOPBACK` | URL 不是受控 loopback 根地址 |
| `SERVICE_UNAVAILABLE` | 拒绝连接或网络失败 |
| `SERVICE_TIMEOUT` | 有界请求超时 |
| `SERVICE_UNAUTHORIZED` | session token 不匹配 |
| `SERVICE_PROTOCOL_MISMATCH` | descriptor 或运行响应版本不兼容 |
| `SERVICE_RESPONSE_INVALID` | 非 JSON 响应 |

上述错误均禁止正式写入，但 `graphEditingAvailable=true`：Logseq 原生正文编辑不依赖 Service。

## 版本纪律

协议版本当前为 1。Client 同时校验 descriptor 与运行响应，不能只信启动文件。新增字段必须向后兼容；破坏性变化提升 protocol version，并使旧 Client 明确进入受限模式。
