# V2 原因化取消、显式重开与 Lifecycle Undo Desktop Report

日期：2026-07-22
状态：`TASK_PROJECT_REASONED_LIFECYCLE_DESKTOP_PASS`

## 结论

在 Logseq Desktop 0.10.15、专用 Test Graph 页面和隔离 SQLite schema v11 中，真实完成：

```text
OPEN Task
→ 填写取消原因并创建 READY Proposal
→ MEDIUM 接受但仍 OPEN
→ 最终确认后 CANCELLED
→ 填写重开原因并创建 READY Proposal
→ MEDIUM 接受但仍 CANCELLED
→ 最终确认后 OPEN
→ reload 后原因与 Undo 入口仍可读
→ Lifecycle inverse Commit
→ 恢复 CANCELLED
```

未修改用户正式 Graph，Service token 与 API Key 未进入报告、Graph、截图或 Git。

## 真实证据

1. 空取消/重开原因均被 Desktop 表单拒绝；对话框保持可修正，Proposal 数量不变。
2. 取消原因 `该验证任务已不再需要，保留记录用于回溯。` 只进入唯一 Proposal；接受组后 Task 仍为 `OPEN + v2`，最终确认后为 `CANCELLED + v3`。
3. 最终取消请求返回成功后立刻中断 Service。重启同一库后 Task 仍为 `CANCELLED + v3`，Proposal 为 `APPLIED`，对应 SemanticCommit 为 `COMPLETED`，Pending/Recovery 为 0；这证明中断发生在正式回执落盘之后，恢复没有建立第二事务。
4. 重开原因 `恢复该任务以验证显式重开和可逆性。` 的 Proposal 接受后 Task 仍 `CANCELLED + v3`；独立最终确认后为 `OPEN + v4`。
5. 冷重载 Logseq 后，Review Center 仍显示完整重开原因、`APPLIED` 状态与“撤销重开”入口。
6. Lifecycle Undo 后 Task 为 `CANCELLED + v5`；正向重开 Commit 为 `UNDONE`，逆向 `lifecycle-undo:*` Commit 为 `COMPLETED`。
7. 全程 Task Block 保持 `[任务] 桌面原因化取消与重开`；Condition 保持 `ACTIONABLE`，未产生 Focus、Ownership、Association 或 Graph Patch。

## 边界

- 本轮完整验收的是 Task 的 MEDIUM 取消/重开与 Undo。Project/MiniProject 继续使用 HIGH 组与各自 Closure 约束；本报告不以 Task 证据替代它们。
- Service 故障发生在 Commit 已落盘之后，因此本轮证明的是 completed-receipt restart readback；prepare-before-receipt 等故障窗口继续由 Service 自动 fault tests 证明。

## 复杂度结论

没有新增表、Schema、状态轴、扫描器、恢复器或写入入口。原因继续只存在于唯一 Proposal；正向和逆向变化复用既有 Object version、Application Command、SemanticCommit、Audit 与 Receipt。

## 2026-07-22 增量：Project HIGH 取消与 Undo

同一隔离 Desktop Runtime 又对已存在且带 active Page Anchor 的 Project 完成：

```text
OPEN Project v2
→ 填写原因创建唯一 HIGH Proposal
→ 独立确认接受后仍 OPEN v2
→ 最终确认后 CANCELLED v3
→ plugin reload 后原因与“撤销取消”仍可读
→ Lifecycle inverse Commit
→ OPEN v4
```

- HIGH 接受使用专用二次确认，且只改变 Proposal；最终确认继续独立存在。
- 正向 Commit 为 `COMPLETED` 后，Project 为 `CANCELLED v3`；Page Anchor 的 anchor_id、external page UUID 与 active 状态未变化，未改写 Graph。
- reload 后完整原因与专用 Undo 入口恢复；Undo 后正向 Commit 为 `UNDONE`、逆向 `lifecycle-undo:*` 为 `COMPLETED`，Project 恢复 `OPEN v4`，Closure 仍为空，Pending/Recovery 为 0。
- 结构化证据：`docs/testing/v2-project-reasoned-lifecycle-desktop-2026-07-22.json`。MiniProject 的 HIGH 原因化取消/重开仍单独保留，不能由本节替代。
