# ADR 017 — Governance Issue 与 dimension-level fail closed

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 10 章、`docs/vnext/06` 第 12 章、`docs/vnext/07` Phase 10
- 实现基线：schema v10 `governance_issues`

## 1. 决定

Reconciliation 得到 UNKNOWN / CONFLICT / BOUNDARY_CANDIDATE 时，系统可以推进 coverage（dirty 清掉），
同时把“尚未解决的语义债”持久为 lightweight Governance Issue。

Issue：

- 绑定 `workObjectId + dimension`；
- 不是 Task / Inbox / Proposal / Notification；
- 默认内部，未来只在影响 re-entry / next action / boundary / closure 时浮现；
- 不自动生成 Proposal 或 User Decision。

## 2. 具体实现

- 最小类型：`UNKNOWN`、`CONFLICT`、`BOUNDARY_CANDIDATE`；
- 状态：`OPEN`、`RESOLVED`、`SUPERSEDED`（历史保留，不删除）；
- dedupe：`(workObjectId, dimension, type, sourceSnapshotId)` 上 OPEN 唯一；
- `MaintenanceCoordinator`：
  - engagement / current_focus 各自按 reasonCode 映射 issue；
  - 检测到矛盾 source material 时只建 `dimension=engagement` 的 CONFLICT issue；
  - coverage 在 issue 存在时仍完成；
  - 对应 dimension 的 confirmed change 成功后 resolve 该 dimension 的 OPEN issues。
- API：`/v1/issues`、`/v1/issues/:id`、`/v1/issues/:id/resolve|supersede`；
  CLI：`issue list/show/resolve/supersede`。

## 3. 为什么

- 没有 Issue 层，UNKNOWN/CONFLICT 会在 run 结束后消失，下一次 reconciliation 重复踩同一语义债；
- whole-object freeze 会无限放大单点不确定；dimension-level fail closed 让无关维度继续维护；
- 持久但不展示，避免把系统内部积压转嫁给用户。

## 4. 不做什么

- 不做 issue inbox / escalation / SLA；
- 不做通用 workflow / dependency engine；
- 不把 Boundary Candidate 自动升级为 Proposal；
- 不让 issue 阻塞 coverage 或无关 dimension 的低风险维护。

## 5. 验收

`packages/test-support/tests/phase10-context-governance.test.ts` 覆盖 create/dedupe、resolve/supersede 历史、
conflict reconcile 后 issue OPEN + coverage clear + evidence 最小化；真实 Desktop 验证见
`tmp/phase10-real-background.mts` 与 `docs/golden-paths/phase10-context-governance.md`。
