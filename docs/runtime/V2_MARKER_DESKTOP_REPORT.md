# V2 Marker / MiniProject Lifecycle Desktop Report

## 结论

```yaml
date: 2026-07-22
desktop: Logseq 0.10.15
gate: Slice B3 Marker and reviewed MiniProject completion
status: PASS
graph: isolated Test Graph
database: isolated schema v10 SQLite
```

真实 Desktop 已证明 Marker 只是 Logseq 正文中的执行输入，SQLite Lifecycle 仍是唯一正式状态。Task 的简单完成可直接同步；MiniProject 的 DONE 只能生成 Proposal，必须经过 HIGH 审阅、提交前重验和独立最终确认，才由 Local Service 的 Application Command 原子完成。

## Task Marker

1. OPEN Task 改为 DONE 后，同一 `object_id` 进入 `COMPLETED`，Condition 与 Focus 不变；重复 DONE 幂等。
2. 从正文移除 DONE 后，对象仍为 `COMPLETED`，没有隐式重开。
3. 已完成 Task 改成相反终态 Marker 时，诊断显示语义冲突；SQLite 零写入且 Service 保持健康。
4. OPEN Task 使用 CANCELED/CANCELLED 而未记录取消原因时，Lifecycle 保持 OPEN；系统没有从 Marker 猜测原因或静默取消。
5. Logseq 原生 Undo 只影响正文，不能逆转正式 Lifecycle。重新打开必须走后续显式命令/审阅路径。

## MiniProject Reviewed Completion

目标对象：`obj_20260721211459079_93c58422584a4dfabe7b710ccb4784ec`；Primary Anchor UUID：`6a5fe151-b1df-4665-bb79-746d01e4e679`。

1. OPEN MiniProject 出现 DONE 后，Service 生成确定性 Proposal `proposal_marker_closure_87e105d9de4657ecae41f3c041fd500e`；重试复用同一 Proposal。
2. Review Center 显示唯一 HIGH `TRANSITION_LIFECYCLE` 组和专用“确认完成 MiniProject”动作。
3. 接受 HIGH 组后对象仍为 `OPEN + v3`，证明 Review 不等于正式写入。
4. 提交前检查重读 Block hash、active Anchor 和 Object version；独立最终确认后，同一对象进入 `COMPLETED + v4`，Condition 保持 `ACTIONABLE`，Focus 为 0。
5. Proposal 为 `APPLIED`，只有一个 `proposal-commit:*` 且状态为 `COMPLETED`；Audit 的正式完成命令为 `complete_mini_project_from_marker`。
6. Plugin reload 后 Review 卡片仍显示已生效，Now Work 不再显示该已完成 MiniProject。
7. 随后从 Graph 移除 DONE，SQLite 仍保持 `COMPLETED + v4`，SemanticCommit 数量不变；没有用正文构造第二权威或隐式重开。
8. 收尾时 Pending Commit=0、`PRAGMA integrity_check=ok`、`foreign_key_check` 无记录；停止隔离 Service 后 descriptor 已删除。

关键本地截图位于 Git 忽略目录 `tmp/runtime/v2-desktop/marker/`：Task DONE/冲突/取消保护、MiniProject Review/HIGH 接受/提交前检查/最终确认/完成/reload，以及 Marker 移除不重开。它们是本次运行证据，不是产品状态源或发布资产。

## 发现与修复

此前 MiniProject DONE 只产生诊断，用户无法继续完成。修复没有新增表、状态机、扫描器、恢复器或第二写入路径：

- Proposal 继续使用 SQLite 的唯一机器表示与既有 Review 状态；
- 最终写入继续使用既有 SemanticCommit ledger，只新增一个封闭的 Domain Lifecycle 命令；
- 首次 DONE 的对象物化复用现有同步回执作为恢复点，重试确定性生成同一 Proposal；
- Plugin 只为这一种 accepted HIGH 操作提供专用最终确认，不把 SemanticCommit 扩成通用工作流平台；
- Project Closure 继续使用既有结构化 Closure Proposal，不与 MiniProject Marker 路径混合。

## Gate 结论

- Slice B3 的真实 Marker 形态、Task DONE/重复/移除/终态冲突/CANCELED 原因保护，以及 MiniProject reviewed completion 为 `PASS`。
- 本报告不声称 Task 取消原因录入、显式重开、Project Closure 或通用 Proposal Undo；这些分别由后续专用 Gate、E2E-20 和 Slice C 证据负责。
