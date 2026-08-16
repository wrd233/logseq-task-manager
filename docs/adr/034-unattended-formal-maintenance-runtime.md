# ADR 034 — Unattended Formal Maintenance Runtime

- 状态：accepted
- 日期：2026-08-18
- 关联权威文档：Phase 8/9 文档、`docs/adr/019/029/030/031`

## 1. 决定

Formal WorkObject maintenance 可以在没有外部 Agent session 时运行，但仍然是 bounded runtime：

- 复用已有 persistent reconcile queue、Work Burst、Projection Obligation drain。
- 默认一个 worker 顺序 claim 一个 job；不引入 distributed queue / multi-agent scheduler。
- 每个 job 绑定 `formalVersion` 与 `semanticRevision`（schema v19：`reconcile_jobs.semantic_revision`）。
- Project 的 `semanticRevision = objectVersion:projectIntentRevision`；其他对象为 `objectVersion`。
- Tick 在 semantic revision 变化时刷新 job 并 requeue，不执行 stale cognition。
- 自动 apply 边界不变：只允许 current_focus / ACTIONABLE↔WAITING / WaitingCondition sync；CREATE/COMPLETE/CANCEL/PARK/Ownership/WorkIntent/ProjectIntent/Closure 仍然 USER-only。
- Natural Workspace Discovery 不 continuous；仍走 整理今天 / 显式 scope。

## 2. Queue 行为

- `recordSourceChange` 按 object + source snapshot 生成确定性 job id；enqueue 前 invalidate 同对象 QUEUED/RUNNING，source burst coalesce。
- pause 时 source changes 继续记录、job 保留；resume 后 claim。
- budget exhausted 时 `deferReconcileJob`：status=QUEUED、`lastError=DEFERRED_BY_BUDGET`、attempt 不增加。
- provider / graph 失败走 `failReconcileJob` bounded backoff；maxAttempts 后 FAILED。
- restart 后 queue 仍在 SQLite，worker 自动继续。

## 3. 验收

- `phase13-runtime.test.ts`：budget defer、semantic revision refresh、PAUSED/DEGRADED 状态。
- Real Desktop soak：12 raw changes → 5 jobs → 5 NO_CHANGE，final HEALTHY。
