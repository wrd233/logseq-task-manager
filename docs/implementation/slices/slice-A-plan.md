# Slice A 计划：领域骨架与 Local Service

## Goal

建立 V2 的单一 Domain/Application、SQLite 当前状态源、一个 Local Service、基础 CLI、Backup/Doctor/日志，以及插件 Service 不可用时的受限模式。完成后仍不接真实 Proposal Apply。

## 非目标

- 不实现真实 DeepSeek 调用、扫描、Now Work 最终 UI、完整迁移或外部 Agent workflow；
- 不自动读取、转换或删除 V1 FileStorage；
- 不让 Plugin/CLI 直接写 SQLite；
- 不一次性重写正式插件；
- 不以系统 `sqlite3` CLI 作为长期数据库 Adapter；
- 不在用户确认总体方案前改 Domain 或运行架构。

## 当前现状

- Domain/Application/Proposal Saga/Undo、Logseq Adapter、诊断和自动检查可复用；
- 当前 Domain 是 V1 Phase/Signal 模型；Store 是插件内 JSON/FileStorage；
- Local Service、SQLite、CLI 和协议均不存在；
- 当前 Desktop 仍有 V1 runtime checkpoint，不能转化为 V2 Gate 证据。

## 设计映射

| 要求 | 来源 | Slice A 落点 |
|---|---|---|
| 单一写入路径 | D-189..191、V2 §5.5 | Service command boundary；Plugin/CLI 仅 client |
| 一个 SQLite | D-190、V2 §34 | schema_meta、objects、anchors、associations、focus、waiting、commits/events 基础表 |
| 纯 Domain | V2 §31.1 | 无 Logseq/SQLite/HTTP/Provider import 的 contract tests |
| Local Service | D-198、D-216、V2 §30-32 | loopback service、health/status、协议版本、受限模式 |
| Doctor/Backup/日志 | D-192、D-204、V2 §53-56 | 只读 doctor、显式 backup、trace_id、敏感字段拒绝 |
| CLI 基础 | D-128、D-132、V2 §36-38 | `tc status`、`tc doctor`、`tc object show/list` read-only |

## 实施序列

### A0：冻结迁移合同

- 接受 V2 Goal 与 V1 历史边界；
- ADR：V2 lifecycle、V1 JSON 只读迁移、Service transport、SQLite driver；
- 建立 V2 schema/version/error contracts；
- 先写失败测试：未知 schema、重复初始化、锁、损坏、服务不可用。

### A1：V2 Domain/Application seam

- 在现有包内建立 V2 Lifecycle/Condition/Focus、六类对象和 Anchor 契约；
- 用兼容读取模型隔离 V1 `phase`/`signal`，不原地覆盖旧数据；
- Command 全部含 actor、expected version、idempotency key、trace_id；
- Query 无隐式写入。

### A2：SQLite Adapter

- 建 schema_meta 和核心表、约束、索引、migration ledger；
- 每 Graph 初始化 `.task-copilot/`，首次不扫描、不迁移、不调用 LLM；
- transaction、busy/locked、corruption、schema failure、idempotency 测试；
- backup/restore 到临时位置并在启用前 doctor。

### A2.5：首次启用

- 提供不含 secret 的 runtime、Provider 和 semantic config 模板；
- 检查 Graph identity/权限、数据库和 Service protocol，不做隐式修复；
- 欢迎页只提供“开始使用”“迁移现有内容”“检查系统状态”三个入口；
- 首次启动不扫描、不迁移、不调用模型，重复初始化必须幂等；
- Desktop 验证欢迎页、reload、Service unavailable 受限模式与原生正文编辑。

### A3：Local Service 与 client contract

- 一个 loopback 进程；`/health`、`/status`、`/doctor`、objects read API；
- 启动发现、协议不兼容、shutdown、取消和超时；
- Service 不可用时拒绝正式语义写入，正文编辑不受影响；
- 日志统一 trace_id，默认拒绝 Authorization/API Key 字段。

### A4：CLI 与 Plugin 受限模式

- `tc status/doctor/object` 只通过 Service；稳定 `--json`、schema_version、退出码；
- Plugin 先接 health/status 和受限状态，不切换正式写入；
- 在完整 Slice A gate 通过后，才计划把正式 command 迁到 Service。

### A5：V1 迁移准备

- 只读解析 V1 recovery bundle；
- 生成 mapping report，不写 Graph/SQLite；
- 保存 legacy ID、原状态、来源 hash 和无法确定项；
- 正式导入留到用户手动 Migration Slice。

## 数据变化

- 新建 `<graph>/.task-copilot/task-copilot.db` 和受控目录；
- V1 FileStorage 只读，禁止双写；
- database/domain/proposal/protocol schema 分别版本化；
- 高影响提交前快照；未知/损坏 schema 进入只读受限模式。

## API 初版

```text
GET  /health
GET  /status
POST /doctor
GET  /objects
GET  /objects/{id}
POST /backup/create
POST /backup/restore/validate
POST /service/shutdown
```

写命令仅在 Application/SQLite/Saga gate 完整后逐项开放，不提供 `force`。

## 测试

- Domain：Lifecycle、Condition、Focus、Ownership、Primary Anchor、六类对象；
- Application：版本、idempotency、命令错误、Service unavailable；
- SQLite：初始化、迁移幂等、事务回滚、锁、损坏、未知 schema、backup/restore；
- Service：loopback、协议版本、并发、取消、结构化错误、日志脱敏；
- CLI：help、JSON schema、stdout/stderr、exit code 2-8；
- Plugin：受限状态、不阻塞正文、无 Store 直写；
- 首次启用：空 Graph、重复启动、reload、欢迎页三入口、无隐式扫描/迁移/模型调用；
- 回归：现有 91 tests 和 `./scripts/check.sh` 持续通过。

## 风险与回滚

| 风险 | 控制 | 回滚 |
|---|---|---|
| V1 语义丢失 | legacy read model + mapping fixture + 人工确认 | 不启用新 DB，继续运行当前 V1 提交 |
| 双权威 | 明确 read-only V1；边界检查禁止 Plugin/CLI DB import | 删除未启用的临时 V2 DB，不碰 V1 原字节 |
| native driver 不兼容 | 独立 spike、锁定 Node20/arm64、CI/build 验证 | 切换同一 Store port 的备选 driver |
| Service 崩溃 | 短事务、幂等、受限模式、doctor | 停止 Service；Logseq 正文继续使用 |
| 半提交 | 复用 pending-first Saga + SQLite savepoint + step ledger | compensation 或 RECOVERY_REQUIRED，不显示成功 |

## Gate

- Domain 不依赖 Logseq/SQLite/HTTP/模型；
- SQLite 是 V2 唯一当前状态源，V1 Store 未双写；
- migration 幂等，未知/损坏 schema 不覆盖；
- Primary Anchor/Ownership 数据约束与 Domain 双重验证；
- health/status/doctor/CLI 使用同一 Application；
- Service 不可用不阻塞 Logseq 正文；
- 首次启用幂等，欢迎页三入口可用，且无隐式扫描、迁移或模型调用；
- backup/restore 临时演练通过；
- 全部新失败路径和根级检查通过；
- 文档、ADR、追踪和已知限制同步更新。

## 2026-07-20 实施进度

已完成并自动验证：

- A0：V1/V2 主权、FileStorage 只读、Legacy 映射 ADR；
- A1 foundation：六类对象、Lifecycle/Condition/Focus、Application command envelope、版本与幂等；
- A2 foundation：Graph-bound SQLite schema v3、显式快照后的 v1/v2→v3 ledger 升级、受约束 SemanticCommit/step 表、失败全量回滚/重试、Object/Audit 原子事务、Primary Anchor/Owner 唯一约束、损坏/未知 schema 保护、写锁零写入、Doctor、防覆盖 Backup 与只读 Restore Validate；
- A3 foundation：仅 loopback、session auth、0600 descriptor、Client protocol/timeout/unavailable restricted state，受控 Backup API 拒绝客户端路径、路径遍历与超大 request body；
- A4 foundation：可执行 Service，`tc status/doctor/object`、JSON envelope、退出码和独立进程冒烟。
- A2.5/A4 自动 foundation：Plugin 通过 Desktop Electron bridge 安全读取 0600 descriptor，验证 loopback/protocol 并 probe Service；未配置时在初始化 Adapter/FileStorage 前停止，显示三入口欢迎页，Diagnostics 明确 `formalWrites=false` / `graphEditing=true`。

尚未满足 Slice A Gate：

- Plugin 的真实 Electron bridge、reload 与 Desktop 受限模式集中验收；
- 实际 Restore 切换/回滚、SemanticCommit step ledger 完整失败路径；
- 首次启用的真实 reload、零隐式请求和原生正文编辑证据；
- 正式 Graph + SQLite write route（在 SemanticCommit Gate 前保持关闭）；
- 完整 CLI graph/context/proposal/skill 属 Slice F，不在 A 中冒充完成。
