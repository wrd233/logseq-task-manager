# `tc` CLI 基础

> CLI 是 Local Service Client，不是第二个 Store 或领域内核。对象查询保持只读；Proposal submit 只进入既有审阅队列，不是正式 Commit。

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
tc [--service-descriptor <path>] [--json] doctor [--export <diagnostics.zip>]
tc [--service-descriptor <path>] [--json] object list [--type <type>] [--lifecycle <lifecycle>]
tc [--service-descriptor <path>] [--json] object show <object_id>
tc [--service-descriptor <path>] [--json] object search <keyword> [--type <type>] [--lifecycle <lifecycle>]
tc [--service-descriptor <path>] [--json] graph page <name-or-uuid> [--depth <0..5>]
tc [--service-descriptor <path>] [--json] graph block <uuid> [--children] [--parents <0..8>]
tc [--service-descriptor <path>] [--json] graph resolve <block-ref-or-page-name>
tc [--service-descriptor <path>] [--json] proposal list
tc [--service-descriptor <path>] [--json] proposal show <proposal_id>
tc [--service-descriptor <path>] [--json] proposal validate <proposal.json>
tc [--service-descriptor <path>] [--json] proposal submit <proposal.json>
tc [--service-descriptor <path>] [--json] skill list
tc [--service-descriptor <path>] [--json] skill show <name>
tc [--service-descriptor <path>] [--json] context export --scope block --block <uuid> --out <directory>
tc [--service-descriptor <path>] [--json] context export --scope page --page <name> --out <directory>
tc [--service-descriptor <path>] [--json] context export --scope object --object <object_id> --out <directory>
tc [--service-descriptor <path>] [--json] context export --scope project --project <project_id> --out <directory>
tc [--service-descriptor <path>] [--json] migration scan <v1-recovery-bundle.json>
tc [--service-descriptor <path>] [--json] migration preview <v1-recovery-bundle.json> --decisions <decisions.json>
tc [--service-descriptor <path>] [--json] migration show <run_id>
tc [--service-descriptor <path>] [--json] migration import <run_id> --bundle <bundle.json> --batch <batch.json> --backup <backup_id> --confirm IMPORT_REVIEWED_V1_BATCH
tc [--service-descriptor <path>] [--json] migration verify <run_id> --batch <batch_id>
tc [--service-descriptor <path>] [--json] migration undo <run_id> --batch <batch_id> --confirm UNDO_MIGRATION_BATCH
tc [--service-descriptor <path>] [--json] migration activate <run_id> --confirm ACTIVATE_V2_SQLITE
tc [--service-descriptor <path>] [--json] backup create
tc [--service-descriptor <path>] [--json] backup validate <backup_id>
tc [--service-descriptor <path>] [--json] backup restore <backup_id> --confirm RESTORE_AND_STOP_SERVICE
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
| 6 | 对象、Proposal 或 Graph 目标不存在 |
| 7 | Doctor 运行完成但未通过 |
| 8 | 其他结构化失败 |

CLI 不接受 SQLite path 作为查询参数，不 import persistence driver，不提供 `force`、`proposal apply` 或 `proposal commit`。`proposal validate` 只调用现有 Domain Validator，零持久化；`proposal submit` 只把合法的 `READY` Proposal 放进与 Plugin 共用的 Local Service 审阅队列，输出明确标记 `formalWritesExecuted: false`。正式变化仍必须在 Plugin 中经过 Review、版本重验、独立确认和 SemanticCommit。

`object list` 可用 `--type` 选择 `AREA / PROJECT / MINI_PROJECT / TASK / DECISION / OUTPUT`，并用 `--lifecycle` 选择 `OPEN / COMPLETED / CANCELLED / ARCHIVED`；选项不区分大小写。`object search` 在同一 Local Service 对象投影中对 `object_id` 与正文做不区分大小写的子串检索，并可叠加相同筛选。非法筛选在读取对象投影前拒绝；这两个命令都不直读 SQLite，也不创建索引、缓存或第二状态源。

Proposal 文件必须是 UTF-8 JSON 普通文件且不超过 1 MiB。CLI 不扫描 Graph、不推断 scope，也不重写外部 Agent 的内容；Service 继续负责 schema、scope、hash、risk 和 dependency 校验。

`graph page/block/resolve` 通过运行中的 Logseq Desktop Plugin 执行瞬态只读桥接；CLI 和 Local Service 都不扫描 Graph 文件或猜测页面文件名。Page depth 限于 0..5，Block parents 限于 0..8，单次最多 256 Blocks / 1 MiB；无 Desktop、超时、目标不存在、越界或 hash 不一致均结构化失败且不返回缓存。`id::` 身份行保留在可读 excerpt 中，但 Block revalidation hash 复用正式 Proposal 的去身份语义算法；Page 使用同一 revalidation evidence hash。

`context export` 开放 `block / page / object / project` 四种设计既定范围。Project 递归包含 Primary Ownership 下最多 255 个后代（总计最多 256 个对象）；block/page 只包含本次 Logseq bridge snapshot 中锚定的 SQLite 正式对象。包内严格分离 Graph excerpt、SQLite 正式事实、空的检索候选、Anchor、Ownership、版本、SHA-256 和完整 Skill。它是 0700/0600 的只读派生目录，已存在目录会被拒绝，`manifest.json` 最后写入。Graph scope 标记 `AVAILABLE_FROM_LOGSEQ_BRIDGE`；object/project 不伪造 Graph，标记 `NOT_INCLUDED`。桥接不持久化正文，不新增表、缓存、Graph 写路径或第二权威，技术决定见 `docs/adr/ADR-LOGSEQ-GRAPH-READ-BRIDGE.md`。

`migration scan` 必须由用户显式提供不超过 8 MiB 的 V1 Recovery Bundle JSON。Service 校验 bundle schema/checksum/round-trip，发现 PENDING 或 RECOVERY_REQUIRED Commit 立即停止；报告逐项保留旧 Phase/Condition/Signal、建议、理由、信息损失和冲突，但不回传正文且不写 SQLite。`preview/show` 提供审阅与续跑；`import/undo/activate` 分别要求命令中列出的精确确认短语，批次最多 50 项，并继续通过 Local Service 的单一 Application/SQLite 写入路径。迁移不会复用 SemanticCommit，也不会恢复 V1/V2 双写。

Backup 三个命令只接受服务端 ID，不接受文件路径。`backup restore` 是唯一已开放的高影响运维 apply；必须精确提供 `--confirm RESTORE_AND_STOP_SERVICE`，否则 CLI 在发请求前退出 2。成功后 Service 已停止，输出 recovery backup ID；需显式重启 Service 并再运行 `tc doctor`。它不是领域对象的 `force apply`。
