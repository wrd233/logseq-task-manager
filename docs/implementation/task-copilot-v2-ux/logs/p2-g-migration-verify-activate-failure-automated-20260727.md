# P2-G Migration Verify / Activate 失败重试自动 Gate（2026-07-27）

## 结论

`df5d2ea` 关闭 Migration Verify 与 Activate 的自动失败原子性和重试子 Gate：

- Verify 在正式事务前失败时，既有 run/batch 保持 `IMPORTING/IMPORTED`，已导入对象仍可读；
- 同一 run/batch 直接重试 Verify 后进入 `VERIFIED`；
- Activate 在正式事务前失败时，run/batch 保持 `VERIFIED/VERIFIED`；
- 同一 run 直接重试 Activate 后进入 `ACTIVATED`；
- 全程没有 `PENDING` 或 `RECOVERY_REQUIRED` SemanticCommit；
- 没有第二套 Migration 状态、恢复页、Undo、Runtime 或写入权威。

这证明“尚未应用，可以继续”可由既有 Migration ledger 与幂等 Application command
表达。它不证明当前 Logseq Desktop 的失败文案、按钮恢复、reload、Light 或窄栏 Gate。

## 实现边界

只在 Local Service 已有 test-only fault port 增加：

- `beforeMigrationVerify`
- `beforeMigrationActivate`

生产调用者不传这两个 hook。正式状态仍只由既有 SQLite Migration run/batch ledger
表达；Plugin、Launcher、Application、Domain 和 Storage 合同均未增加状态或恢复分支。

## 自动证据

- Node 20 targeted Local Service：
  - `Migration import survives a lost response after its atomic write and replays one ledger`
  - `Migration verify and activate failures preserve one retryable ledger without partial transitions`
  - 结果：`2 PASS`，其余按 test name pattern 跳过；
- Local Service typecheck：PASS；
- 根级 `./scripts/check.sh`：PASS；
- stable rule coverage：`145`；
- recovery rehearsal：`differences=[]`；
- repository boundary：PASS。

第一次误用系统 Node 25 运行 package test时，原生 `better-sqlite3` 的 ABI 与仓库
Node 20 依赖不匹配；改用仓库 Node 20 后目标测试与根级检查均通过。这是本地执行环境
问题，不是产品回归。

## Desktop 边界

已构建隔离故障 Service，并在不切换前台应用的情况下让 Logseq 进入 Launcher
descriptor 选择流程。最终“安全连接”会把隔离 Launcher token 写入插件私有
FileStorage，属于发生时必须确认的持久访问动作，因此本轮停在按钮前，没有配对，也没有
把这一尝试记录为 Desktop PASS。

随后已：

1. 停止隔离故障 Launcher；
2. 恢复原私有 descriptor；
3. 重新 bootstrap 正常 LaunchAgent；
4. 恢复 `serviceDescriptorPath`；
5. reload Plugin；
6. 在真实 Logseq 系统状态中读回“Task Copilot 可以正常使用”“正式状态与当前知识库已连接”。

正常 Launcher、Service 和原 database authority 已恢复；没有发生静默 authority 替换。

## 状态与复杂度

- `Migration Verify/Activate failure atomicity + retry`：
  `AUTOMATED_ONLY_PARTIAL → AUTOMATED_DONE_DESKTOP_CONFIRMATION_REQUIRED`；
- `Migration Verify/Activate failure Desktop`：仍 `OPEN`；
- P2-G 与完整 Goal：仍 `IN_PROGRESS`；
- 新增正式状态、顶层导航、Skill、Prompt、Validator、生产恢复分支、平行 Runtime、
  平行写入权威：均为 `0`；
- 新增 Partial：`0`；
- Partial 总量：不变；自动子 Gate 前移，但尚未关闭 Desktop Partial；
- Provider 调用：`0`；Validator 拒绝率和模型重试不适用；
- 新截图：`0`；未完成的 Desktop 尝试不生成 CURRENT 证据。

## 下一 Gate

获得发生时确认后，只对隔离测试数据库完成一次：

`Verify failure → 原 ledger 重试 → Activate failure → 原 ledger 重试 → reload`

并覆盖代表性用户文案与最终健康读回。完成后恢复正常 descriptor、LaunchAgent、
Service 和原 database authority；Light/窄栏另按代表性矩阵验证。

## 后续 Desktop 收口

同日后续 Gate 复用了安装态中已经存在的同一私有配对凭据，没有再次写入 Plugin
FileStorage，也没有创建新的持久访问权。隔离测试数据库已真实完成
`Verify failure → 原 ledger 重试 → Activate failure → 原 ledger 重试 → reload`，
本文件记录的 `OPEN` 历史状态已由
`p2-g-migration-verify-activate-failure-desktop-live-20260727.md` 取代。
