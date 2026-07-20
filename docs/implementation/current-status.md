# V2 当前实施状态

## 当前 Slice

V1 frozen / Slice A0 complete / Slice A1-A4 foundation in progress / Slice B0 complete / Slice B1-B2 foundation in progress

## 当前阶段结论

```text
V1_RUNTIME_KERNEL_PASS
V1_MVP_PILOT_PARTIAL
V1_FROZEN_FOR_MIGRATION
V2_MIGRATION_DESIGN_READY
```

`V1_MVP_PILOT_SUCCESS` 未达到：Capture 与 Task 通过；MiniProject/Project 的主归属、推进、聚合以及 Decision/Output/Closure 没有形成低摩擦闭环。V1 不再扩建长期能力，这些差距转入 V2。

## 本轮完成

- 复核分支、remote、恢复包、Agent、FileStorage、测试 Graph 和 root checks；
- 正式接受 OD-001..003，并冻结三份 ADR；
- 在 Logseq Desktop 0.10.15 使用专用 copied-data 页面完成 Capture、Task、MiniProject、Project Pilot；
- 建立 Pilot 前后 0600 恢复包，回放 differences 为 `[]`，Pending/Recovery Required Commit 均为 0；
- 明确 V1 可复用内核、冻结边界和淘汰语义；
- 完成 FileStorage → SQLite 主权交接设计及 Legacy 状态映射；
- 完成 DeepSeek 安全配置探测；因缺少 Provider/Base URL/Model/secret reference 的完整配置，未发起真实调用。
- 建立 V2 六类对象、Lifecycle/Condition/Focus 纯 Domain seam；不含 Phase/Signal；
- 通过 Node 20/macOS arm64 SQLite Spike：Graph-bound 初始化、schema/损坏保护、版本/幂等写入、Doctor 和独立备份；
- 建立仅绑定 `127.0.0.1`、session-token 认证的只读 Local Service health/status/doctor/object 骨架。
- 建立 V2 Application Command envelope、版本前置、原子 Object+Audit receipt 和幂等重放；
- Primary Anchor 与 Primary Ownership 同时经过 Domain 与 SQLite 约束，失败事务不会推进对象版本；
- 建立 0600 runtime descriptor、版本化 Service Client、超时/断连/未授权/协议不兼容错误及受限状态；
- 建立可执行 `task-copilot-service` 与只读 `tc status/doctor/object`，完成独立进程冒烟。
- SQLite 写锁冲突已收敛为结构化零写入失败；Backup 增加不覆盖、只读 schema/Graph/完整性/外键校验。
- Local Service 开放受控 Backup Create/Restore Validate；只接受服务端 ID，拒绝客户端路径、遍历和超大请求，当前不执行 Restore 切换。
- SQLite schema 升至 v3；`initialize` 不静默升级，v1/v2→v3 需显式恢复点，在单一事务写 DDL/ledger/metadata/user_version，注入失败后零半写且可重试。
- Plugin 已接入版本化 Service Client：仅从设置读取非敏感 descriptor 绝对路径，通过 Electron bridge 校验非链接 0600 文件并执行 health probe；任何失败均进入脱敏 RESTRICTED 状态。
- descriptor 未配置时，Plugin 在创建 Logseq Adapter/FileStorage 前停止，欢迎页只提供“开始使用 / 迁移现有内容 / 检查系统状态”；无扫描、迁移或模型调用的自动分支证据已建立。
- SQLite 离线 Restore 原语已通过：候选 Backup 与当前库恢复点均先做只读校验，同目录原子激活后再 Doctor；注入失败会回滚原库并保留恢复点。该原语尚未开放 HTTP/CLI/Plugin 入口。
- SQLite schema 升至 v3，建立受约束 `semantic_commits` / `semantic_commit_steps`；v1/v2 都必须经显式快照迁移至 v3，无静默升级。当前只是 Saga 持久化结构，不表示 Slice C Commit 编排已完成。
- step ledger 最小状态机已通过：PENDING + PREPARED 原子准备、幂等重放、非法跳步拒绝、全 VERIFIED 后才能 COMPLETED、未补偿 step 不得标记 FAILED，RECOVERY_REQUIRED 可重启查询并补偿收口。
- Service Restore Apply 已通过：固定确认短语、服务端 Backup ID、恢复点、关闭 live Store、原子切换、Doctor、descriptor 删除和 Service 停止；无确认不产生变化。
- CLI 已提供 `backup create/validate/restore`；Restore 缺少精确 `--confirm RESTORE_AND_STOP_SERVICE` 时在加载 Service 前退出。独立进程冒烟已证明 CLI create → restore → Service exit/descriptor cleanup → restart → Doctor PASS。
- Slice B0 显式语法 Parser 已建立：只接受 `[任务]`、`[MiniProject]`/`#MiniProject`、`[决策]`、`[成果]`；Marker 不决定身份，裸 TODO 不物化，空标题/多类型冲突确定性拒绝，Area/Project 不使用未定义前缀猜测。Parser 只产出纯结果，尚未接 Block event 或正式写入。
- Slice B 防抖与首次物化基础已建立：UUID 级事件合并只交付最新 Parser 结果，失败显式回调；Application/SQLite 将 Object、Primary Anchor、Audit、Receipt 单事务写入并幂等重放，重复外部 Block 整笔回滚。
- Local Service 已开放唯一的 `POST /objects/materialize` 正式写路由并报告 `formalWrites=true`；请求不能携带 Graph/DB 路径/object_id/anchor_id/actor，只允许四类 Parser 对象、8 位 Anchor hash 和有界命令字段。Plugin `DB.onChanged` 与已绑定对象 update 尚未接入。

## 当前证据

- Git：`feature/task-copilot-mvp`；当前阶段包含 Service/CLI 基础与 SQLite 恢复加固；
- 自动检查：2026-07-20 `./scripts/check.sh` PASS，146 tests、145 rules、0 skipped；typecheck、lint、build、package/bootstrap/dist、边界与恢复演练全过；
- Process smoke：独立 Service 进程、0600 descriptor、`tc --json status`、`tc doctor`、schema v3 status、Backup create/validate、CLI Restore 停服、descriptor 清理、重启后 Doctor PASS、0700/0600 权限均 PASS；
- Runtime：`docs/runtime/V1_MVP_PILOT_REPORT.md`；
- Recovery：Pilot 前后 bundle 均已做 checksum/readback；Pilot 后 8 objects、14 captures、23 proposals、20 commits、1 relation、66 events；
- Pilot 后恢复包 SHA-256：`4e9dd666697b94ca0d6b81e7dc7bd0c12c82d0f432b2363eddfbc95a1a602612`；
- DeepSeek：`docs/testing/deepseek-v4-live-test-report.md`，状态 `NOT_RUN_CONFIG_INCOMPLETE`。

## 冻结与复用

- 复用：Domain/Application 分层、object_id、Anchor observation/rebind、Proposal DAG、SemanticCommit/inverse Commit、Pending/Recovery、A/B 恢复、Diagnostics、Logseq Adapter 和 runtime 测试纪律。
- 冻结只读：V1 FileStorage、恢复包、旧 Phase/Signal、Proposal/Commit/Event 历史。
- 淘汰：V1 长期写入模型、Phase/Signal 当前轴、Plugin 直写 Store、长期 V1/V2 双模式和双写。

## 下一步

1. 继续 Slice B1-B2：Block event/防抖/有限子树读取，以及幂等 materialize/update Application Command；
2. 将 Backup/Restore/Service restart/Doctor 纳入 Desktop 集中验收；
3. 按 `docs/runtime/V2_SLICE_A_DESKTOP_TEST_PLAN.md` 集中验收 Plugin Electron bridge、Service READY/RESTRICTED、首次启用、reload 和原生正文编辑；
4. 在 Desktop 证据通过后再将 V2-FIRST-001 / E2E-15 标记为 DONE；
5. 在 Slice A-C 闭环后接入 Provider abstraction，再运行 bounded DeepSeek live gate。

## 仍需用户决定

当前没有新的产品语义决定。真实 DeepSeek Gate 需要用户以环境变量或 Keychain reference 提供完整 Provider、Base URL、Model ID 与 Key 引用；这不阻塞 Slice A-C 自动化工作。
