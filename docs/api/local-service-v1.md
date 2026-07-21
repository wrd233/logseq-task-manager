# Local Service Protocol v1

> 状态：Slice A/B 基础协议；查询、受控 Backup/Restore、显式 Block 同步、Primary Anchor 观察与重新绑定写路由已实现。

## 连接与认证

- Service 只绑定 `127.0.0.1` 的随机端口；
- 启动时原子写入 0600 descriptor：`protocolVersion`、`url`、高熵 session token、PID、createdAt；
- Client 拒绝非 HTTP、非 `127.0.0.1`、带用户名/密码、非根路径或版本不兼容的 descriptor；
- 每个请求携带 `Authorization: Bearer <session token>`，但 token 不进入 stdout、错误、诊断或报告；
- Service 正常退出时删除本次 descriptor；过期 descriptor 的连接失败进入受限模式。
- Local Service 始终以绝对路径原子写入并强制 descriptor 为 0600。Logseq 0.10.15 的 plugin iframe 不暴露 Node `require`；因此 Plugin 设置只保存一个受限的私有 FileStorage 文件名 key，通过 Logseq 官方 FileStorage bridge 读取同一 descriptor，不保存 token。
- 私有 FileStorage 只承担会话发现，不存放 V2 领域状态，不恢复 V1 写入，也不与 SQLite 双写；兼容运行时若提供 Electron Node bridge，仍可校验绝对路径、普通文件、非符号链接与 0600。
- key 未配置/越界、读取失败、文件不安全、协议不兼容或 probe 失败时，Plugin 显式进入 `RESTRICTED`；原始错误、路径和 token 不进入诊断。

## Plugin 首次启用

`serviceDescriptorPath` 保留为兼容设置键，但其值在 Logseq Desktop 中是私有 FileStorage 文件名。空白时，Plugin 在 Service probe 后立即停在首次启用模式：不构造 Logseq Adapter，不初始化 V1 领域 FileStorage，不扫描、迁移或调用模型。欢迎页只有三个受控入口：

- “开始使用”：显示 Service/descriptor 配置和 reload 说明；
- “迁移现有内容”：只说明未启动的 Scan/Preview/Confirm 边界；
- “检查系统状态”：打开脱敏 Diagnostics。

实际 Electron bridge、reload 与原生正文编辑仍须按 `docs/runtime/V2_SLICE_A_DESKTOP_TEST_PLAN.md` 集中验收。

## 当前路由

| Method | Path | 结果 | 写入 |
|---|---|---|---|
| GET | `/health` | READY、protocol、capabilities | 无 |
| GET | `/status` | protocol、DB schema、对象数 | 无 |
| POST | `/doctor` | integrity、foreign keys、对象数 | 无 |
| POST | `/backup/create` | 服务端生成 ID 的 0600 SQLite 快照及校验结果 | 只写 Backup，不改当前状态 |
| POST | `/backup/restore/validate` | 只读校验指定 `backupId` | 无；不切换 DB |
| POST | `/backup/restore/apply` | 创建恢复点、离线切换、Doctor，然后停止 Service | 替换当前 DB；高影响 |
| POST | `/objects/materialize` | 显式 Block 首次物化的 Object + Primary Anchor + Audit + Receipt | SQLite 单事务正式写入 |
| POST | `/objects/synchronize` | 按绑定状态选择首次物化或同类型标题/Anchor 更新 | SQLite 单事务正式写入 |
| POST | `/anchors/primary/observe` | 将已知 Primary Anchor 观察为 `active / missing / conflict` | Object version + Anchor + Audit + Receipt 单事务写入；不删对象 |
| POST | `/anchors/primary/rebind` | 显式确认后把对象绑定到新的同类型 Block | Object + 旧 Anchor `replaced` + 新 active Anchor + Audit + Receipt 单事务写入 |
| POST | `/proposals/validate` | 验证 Proposal 并生成确定性两文件 | 无 |
| POST | `/proposals/submit` | 将 READY Proposal 提交至审阅队列 | Proposal + Group 单事务写入；不改正文/对象 |
| POST | `/provider/proposals/generate` | 五层 Prompt → Structured Output → Validator → READY Proposal，或 `NO_PROPOSAL` 理由 | 仅校验成功的 Proposal + Group；不改 Graph/对象/Anchor/Lifecycle/Condition/Focus |
| GET | `/proposals` | 按创建顺序列出已提交 Proposal | 无 |
| GET | `/proposals/{id}` | 读取单个 Proposal、两文件和 `updatedAt` | 无 |
| POST | `/proposals/{id}/review` | 按语义组接受/拒绝/暂缓 | Proposal + Group 单事务写入；不改正文/对象 |
| POST | `/proposals/{id}/revalidate` | 重验 read scope 与 accepted modify scope | 成功只读；stale 只标记 Proposal，不改正文/对象 |
| POST | `/proposals/{id}/commit/prepare` | 重验并准备单 Block 正式化账本 | 只写 PENDING ledger；不改 Graph/对象 |
| POST | `/proposals/{id}/commit/finalize` | 验证 Graph after evidence 后物化对象 | Object + Anchor + Audit + Receipt；ledger + Proposal APPLIED |
| POST | `/proposals/{id}/commit/compensate` | 验证 Graph 已逆写 before evidence | ledger COMPENSATED/FAILED + Proposal FAILED |
| GET | `/objects` | V2 对象列表 | 无 |
| GET | `/objects/{object_id}` | 单对象或 `OBJECT_NOT_FOUND` | 无 |
| GET | `/now-work` | 三个可解释区域、Focus、到期 Waiting、临近 Task 期限与开放对象 Condition 选择项 | 无；可重建投影 |
| PATCH | `/objects/{object_id}/condition` | 设置 ACTIONABLE / WAITING / BLOCKED / PAUSED | Object + Audit + Receipt 单事务写入 |
| PATCH | `/objects/{object_id}/deadline` | 设置或清除 Task `due_at` | Object + Audit + Receipt 单事务写入；不产生分数 |
| GET | `/anchors/primary?after=<cursor>&includeReplaced=1` | 当前 Graph Primary Anchor 身份分页；默认只含 `active / missing / conflict`，候选去重可显式包含历史 `replaced` tombstone | 无；每页最多 256，`nextCursor` 驱动后续有界查询；`includeReplaced` 只接受固定值 `1` |

未知路由返回 404。当前 `capabilities.backup=true`、`formalWrites=true`、`migration=false`；`provider` 仅在 Service runner 显式选择并成功解析安全配置后为 `true`。`formalWrites` 只表示已列出的受约束正式命令可用，不表示迁移或 Provider 已配置。Proposal generate/submit/review 只改审阅状态，不是正式领域生效；只有已接受且重验通过的受限 Proposal 才能进入 prepare/finalize Commit 路由。

## Provider runtime

Provider 默认关闭；runner 只有在 `TASK_COPILOT_LLM_PROVIDER=deepseek` 且 Base URL、实际 Model ID、secret reference 均有效时才启用 capability。非敏感配置使用 `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 与 `TASK_COPILOT_DEEPSEEK_API_KEY_REF`。secret reference 只允许 `env:<VARIABLE>` 或 `keychain:<service>/<account>`；兼容 `DEEPSEEK_API_KEY` 时只在进程内将其视为 `env:DEEPSEEK_API_KEY`，不写入 descriptor、Graph、SQLite、日志或报告。

Plugin Review Center 的“分析当前块”只发送当前选中 Block 的有界正文、UUID/hash 与五层 Prompt。Service 发放 proposal_id 并覆盖模型返回的 source/status/createdAt；text patch hash 由机器计算，Domain Validator 再检查 scope、group dependency、risk 和最终对象正文。普通记录允许返回有界 `NO_PROPOSAL` 理由且零持久化；非法、空、截断、超时、取消、认证、限流和网络响应都不能创建 Proposal 或正式写入。

`GET /now-work` 的 `conditionOptions` 仅包含当前 OPEN 对象的 `objectId / objectType / text`，供插件以可读选择器设置可选 `BLOCKED.blockerObjectId`；它不是第二份对象状态。Application 拒绝不存在、已关闭或自引用的阻碍对象。若 Focus A 的 `blockerObjectId` 指向 B，则可行动 B 会以“阻碍当前关注”进入可解释排序；安静的 Waiting B 也会被唤醒进入“等待与复查”。

## 显式 Block 物化

`POST /objects/materialize` 只接受固定七字段加一个可选 Marker 证据：

```json
{
  "objectType": "TASK",
  "text": "核对时间同步来源",
  "marker": "TODO",
  "externalId": "logseq-block-uuid",
  "inputVersion": "logseq-updated-at",
  "contentHash": "1dd75803",
  "idempotencyKey": "graph-scoped-block-first-seen-key",
  "traceId": "trace-materialize"
}
```

- `objectType` 仅允许 Parser 管理的 `TASK / MINI_PROJECT / DECISION / OUTPUT`；Area 和 Project 走各自受控创建入口；
- `marker` 可省略，只允许 `TODO / NOW / DOING / DONE / CANCELED / CANCELLED / WAITING`；Client 不得直接传 Lifecycle/Condition，Domain 按 `docs/implementation/V2_MARKER_LIFECYCLE_CONTRACT.md` 决定结果；
- Graph ID、SQLite 路径、object_id、anchor_id 与 actor 都由 Service/Application 持有，客户端携带这些额外字段会整包拒绝；
- `contentHash` 必须符合当前 Anchor 契约的 8 位小写 CRC32；
- `inputVersion` 来自本次 Logseq Block 观察版本；Service 用自身 Graph ID、Block UUID 与该版本计算 SHA-256 幂等键，不接受客户端选择领域幂等边界；请求中的 `idempotencyKey` 仅保留为有界传输关联字段；
- Application 在单一 SQLite 事务中写入 Object、Primary Anchor、Audit 和幂等 Receipt；
- 同一 Graph/Block/inputVersion 只重放原结果，不用新正文覆盖；同一 Graph Block 再次首次物化会冲突并整笔回滚；
- Parser、Block event 和防抖运行在 Logseq Adapter；该 HTTP 路由本身不猜自然语言、不扫描 Graph、不调用模型。

`POST /objects/synchronize` 使用相同字段，但由 Service 查询当前 Graph 的 Primary Anchor：未绑定时走首次物化；已绑定且类型相同时更新标题缓存、Marker 语义、Anchor content hash/last seen 和对象版本；标识类型变化返回 `V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL`。Task CANCELED/CANCELLED 在记录取消原因前返回 `V2_TASK_CANCELLATION_REASON_REQUIRED`；复杂关闭、Marker 不支持或终态冲突也返回结构化 409。这些语义拒绝均不修改对象，也不错将健康 Service 降级为断线。相同 Graph/Block/inputVersion 会按原命令类型重放，因此首次请求在 Anchor 建立后重试也不会被误判成更新。

`POST /anchors/primary/observe` 只接受：

```json
{"anchorId":"anc_...","status":"missing","traceId":"trace-observe"}
```

- Graph ID、actor、object_id、expected version 和幂等键由 Service 注入，客户端多传字段会整包拒绝；
- `missing` 保留最后一次确认可见的 hash/lastSeenAt，`conflict` 表示 UUID 返回形态或显式语法不再可信；两者都不删除 Object；
- 同一 UUID 恢复为合法显式 Block 时，观察或同类型同步可将 Anchor 恢复为 `active`；`replaced` 只作为历史证据，此路径不能复活；
- 重复的相同状态是无写入重放，不膨胀 Object version。

`POST /anchors/primary/rebind` 只接受固定十一字段：

```json
{"previousAnchorId":"anc_old","previewObjectVersion":5,"previewAnchorStatus":"missing","previewAnchorContentHash":"8d5ac210","objectType":"TASK","text":"新的主正文","externalId":"new-block-uuid","inputVersion":"logseq-updated-at","contentHash":"1dd75803","confirmation":"REBIND_PRIMARY_ANCHOR","traceId":"trace-rebind"}
```

- 精确确认短语由 Application 再次校验；缺失或拼写不同整包拒绝且零写入；
- `previewObjectVersion` 与旧 Anchor 的 status/hash 是 Service 预览返回的乐观并发前置，不是客户端可选的领域权限；Service/Application/SQLite 会在同一写入链中校验，任一变化都以 `V2_REBIND_PREVIEW_STALE` 零写入停止；
- Graph ID、object_id、新 anchor_id、actor 和领域幂等键全部由 Service/Application 持有，客户端额外传入即拒绝；
- 新 Block 必须在当前 Graph、与对象类型一致、UUID 不同且从未被任何 Primary Anchor（包括历史 `replaced`）占用；类型变化进入 Proposal，不借 rebind 静默迁移；
- 单一事务推进对象版本与标题缓存、将旧 Anchor 标记为 `replaced`、插入新 active Anchor、写 Audit/Receipt；任一步失败全部回滚，Primary Ownership 不变；
- Service 以 Graph、旧 Anchor、新 UUID 与输入版本生成幂等键；首次成功后的完全重试返回原 Receipt，不因旧 Anchor 已变为 `replaced` 而误报不存在。

## Backup 请求

`POST /backup/create` 不接受 request body、路径或文件名。Service 在受控的 0700 Backup 目录中生成 `backup_<timestamp>_<128-bit entropy>`，以 0600 权限创建快照，并在响应前进行只读校验：

```json
{
  "backupId": "backup_...",
  "createdAt": "2026-07-20T00:00:00.000Z",
  "validation": {
    "status": "PASS",
    "schemaVersion": 6,
    "integrity": "ok",
    "foreignKeyViolations": 0,
    "objectCount": 0
  }
}
```

`POST /backup/restore/validate` 只接受 `{"backupId":"backup_..."}`，且只能解析受控 Backup 目录内的服务端 ID。它校验 schema 版本、Graph identity、SQLite integrity 和 foreign keys，不修改快照字节，不停 Service，不替换当前 DB。实际 Restore 仍属后续高影响闭环。

`POST /backup/restore/apply` 只接受：

```json
{"backupId":"backup_...","confirmation":"RESTORE_AND_STOP_SERVICE"}
```

它先再次只读校验候选快照，然后将 Service 置为 stopping、关闭 live Store，为当前库创建新的服务端 recovery backup，原子激活候选快照并运行 Doctor。成功响应只返回两个 Backup ID 和校验结果，不返回路径。随后删除 descriptor 并停止 Service，用户必须显式重启；失败时底层原语回滚原库，Service 仍停止，不在可疑状态继续写入。

## Client 错误

| Code | 含义 |
|---|---|
| `SERVICE_DESCRIPTOR_INVALID` | descriptor 缺字段或非法 JSON |
| `SERVICE_DESCRIPTOR_PATH_REQUIRED` | Plugin 尚未配置 descriptor 私有存储 key（保留旧 code 名称） |
| `SERVICE_DESCRIPTOR_PATH_INVALID` | Plugin 设置的 key 越界，或兼容 Node reader 的路径不是绝对路径 |
| `SERVICE_DESCRIPTOR_READER_UNAVAILABLE` | 运行时既无私有 FileStorage bridge，也无兼容 Electron reader |
| `SERVICE_DESCRIPTOR_READ_FAILED` | descriptor 无法读取；诊断不暴露原始 cause 或路径 |
| `SERVICE_DESCRIPTOR_INSECURE` | 文件权限不是 0600 |
| `SERVICE_DESCRIPTOR_NON_LOOPBACK` | URL 不是受控 loopback 根地址 |
| `SERVICE_UNAVAILABLE` | 拒绝连接或网络失败 |
| `SERVICE_TIMEOUT` | 有界请求超时 |
| `SERVICE_UNAUTHORIZED` | session token 不匹配 |
| `SERVICE_PROTOCOL_MISMATCH` | descriptor 或运行响应版本不兼容 |
| `SERVICE_RESPONSE_INVALID` | 非 JSON 响应 |
| `REQUEST_BODY_NOT_ALLOWED` | Backup 创建携带了客户端参数或路径 |
| `REQUEST_BODY_TOO_LARGE` | request body 超过 16 KiB |
| `REQUEST_JSON_INVALID` | restore validate 请求不是合法 JSON |
| `BACKUP_ID_INVALID` | ID 格式不符合服务端生成规则，包括路径遍历 |
| `RESTORE_CONFIRMATION_REQUIRED` | Restore Apply 缺少精确高影响确认 |
| `MATERIALIZATION_REQUEST_INVALID` | 显式物化字段、类型、长度或服务端所有权边界无效 |
| `PRIMARY_ANCHOR_REBIND_INVALID` | rebind 字段、确认、类型、长度或服务端所有权边界无效 |
| `V2_REBIND_PREVIEW_STALE` | 预览后 Object version 或旧 Anchor status/hash 已变化，本次零写入停止 |
| `V2_REBIND_TARGET_ALREADY_BOUND` | 新 Block UUID 已有当前或历史 Primary Anchor 记录 |
| `PRIMARY_ANCHOR_OBSERVATION_INVALID` | Anchor 观察字段、状态或服务端所有权边界无效 |
| `V2_PRIMARY_ANCHOR_NOT_FOUND` | Anchor 不属于当前 Graph、不存在或已被替换 |
| `V2_EXTERNAL_PRIMARY_ANCHOR_EXISTS` | 同一 Graph Block 已绑定正式对象，必须转入同步而非重复物化 |
| `V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL` | 已绑定对象的显式类型变化，必须进入可审阅 Proposal |
| `V2_PROPOSAL_NOT_READY` | 只有 READY Proposal 可进入审阅队列 |
| `V2_PROPOSAL_ID_CONFLICT` | 相同 Proposal ID 已有不同内容 |
| `V2_PROPOSAL_NOT_FOUND` | Proposal 不存在 |
| `V2_PROPOSAL_REVIEW_STALE` | Proposal 审阅版本已变化，本次零写入 |
| `PROPOSAL_REVIEW_REQUEST_INVALID` | 分组决定、暂缓信息或请求字段无效 |
| `PROPOSAL_REVALIDATION_REQUEST_INVALID` | 重验请求字段、Block/Page 证据或证据数量无效 |
| `V2_PROPOSAL_REVALIDATION_STALE` | 重验前 Proposal 审阅版本已变化，本次零写入 |
| `V2_PROPOSAL_NOT_ACCEPTED` | Proposal 没有可进入提交前重验的 accepted 语义组 |
| `PROPOSAL_COMMIT_REQUEST_INVALID` | finalize/compensate 证据字段或客户端权限越界 |
| `V2_PROPOSAL_COMMIT_RECOVERY_REQUIRED` | 同 Proposal 已有需恢复事务，禁止平行 Commit |
| `V2_PROPOSAL_COMMIT_GRAPH_EVIDENCE_MISMATCH` | Graph after hash 与已审阅 Patch 不一致 |
| `V2_PROPOSAL_COMPENSATION_EVIDENCE_MISMATCH` | Graph before hash 与恢复账本不一致 |
| `SERVICE_STOPPING` | Restore 进行中拒绝新请求 |
| `V2_GRAPH_ID_MISMATCH` | Backup 不属于当前 Graph |
| `V2_UNSUPPORTED_DATABASE_SCHEMA` | Backup schema 版本不受支持 |
| `V2_BACKUP_VALIDATION_FAILED` | Backup 损坏或无法完成只读校验 |

上述错误均禁止正式写入，但 `graphEditingAvailable=true`：Logseq 原生正文编辑不依赖 Service。

## 版本纪律

协议版本当前为 1。Client 同时校验 descriptor 与运行响应，不能只信启动文件。新增字段必须向后兼容；破坏性变化提升 protocol version，并使旧 Client 明确进入受限模式。
