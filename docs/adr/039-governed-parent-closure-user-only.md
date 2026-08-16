# ADR 039 — Governed Parent Closure and USER-only Lifecycle Completion

- 状态：accepted
- 日期：2026-08-16

## 1. 决定

- Complete / Cancel / Reopen / Amend 扩展到 MiniProject 和 Project，但 Formal Closure 永远 USER-only。
- Parent closure invariant：Complete 或 Cancel 前，所有 formal descendants 必须非 OPEN；不 silent cascade。
- Reopen 不 cascade；保留 Closure history，readiness 重新失效/评估。
- Project/MiniProject 的 formal closure commit 允许无 Graph snapshot（不改变 marker）；ProjectionObligation 仍异步收敛。
- External Agent closure intent 只能创建 `COMPLETE_WORK_OBJECT` DecisionPackage；Plugin Trusted USER Channel 确认后才执行。
- Stale closure package：child reopen / intent revision / version 变化后执行 fail closed（`PARENT_HAS_OPEN_CHILDREN` 或 version stale）。
- Cancellation 与 Completion 语义分离；Cancel 不要求 outcome readiness，但仍受 parent invariant 约束。

## 2. 验收

- `phase14-closure.test.ts`：parent complete 成功、child OPEN 拒绝、stale package 拒绝、USER-only。
- `phase5-task-closure.test.ts` 更新为 governed parent closure 语义。
