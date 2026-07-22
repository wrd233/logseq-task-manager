# V2 Proposal 暂缓与依赖组 Desktop Report

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 结论：`PASS`，`V2-PROP-001` 与 `E2E-08` 可收口为 `DONE`

## 真实审阅闭环

- 在真实 Review Center 提交一个两组 Proposal：`publish-output` 显式依赖 `record-decision`，两组均为 LOW，且本 Gate 不执行 Commit。
- 先接受依赖后置组时，界面明确显示“不能只接受依赖链的后半段”；Proposal 保持 `READY`，两组均未改变，正式状态零写入。
- 将前置组暂缓至 2026-07-30 09:30，填写“等待验收负责人确认”；Proposal 进入 `IN_REVIEW`，卡片直接显示暂缓时间和原因。
- 通过 Logseq 插件管理器真实 reload 后，暂缓时间、原因、`DEFERRED` 状态和其余 `PENDING` 组均从 SQLite Proposal 权威恢复。
- 前置组仍为 `DEFERRED` 时再次接受后置组，依赖保护继续拒绝且没有静默变化。
- 最后按前置组、后置组顺序接受，Proposal 进入 `ACCEPTED`；界面只提供“确认最终提交”并明确“尚未正式生效”。本 Gate 没有点击 Commit。

## 正式状态与权威边界

- 前后对象快照一致：Area 保持 v3，Project 保持 v2；没有生成 Decision 或 Output。
- Audit 保持 4；SemanticCommit 保持既有 1 条已完成 Project 创建记录，`PENDING/RECOVERY_REQUIRED=0`。
- 暂缓与接受只更新既有 `proposals/proposal_groups`；没有新增表、状态、协议、扫描器、恢复路径、Graph 写入或第二机器表示。
- UI 修复只投影既有 `deferredUntil/deferReason`，不改变 Proposal Schema 或审阅状态机。

## 工程证据

- `apps/task-copilot-logseq-plugin/tests/ui.test.ts` 覆盖暂缓时间/原因可见、仍可继续接受或重设暂缓。
- 插件定向测试为 122/122 通过，构建通过；根级检查见提交前验证。
- 运行时使用 prerelease package version 仅绕过 Logseq unpacked plugin 缓存；验收后源码恢复 `0.1.0`，临时值未提交。
- 脱敏机器证据：`docs/testing/v2-proposal-dependency-defer-desktop-2026-07-22.json`。
