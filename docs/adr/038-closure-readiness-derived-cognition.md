# ADR 038 — Closure Readiness as Derived Cognition

- 状态：accepted
- 日期：2026-08-16

## 1. 决定

- `ClosureReadiness = READY | NOT_READY | UNKNOWN | CONFLICT`，不是 lifecycle。
- `ClosureAssessment` 是 derived record（schema v21 `closure_assessments`），绑定 `semanticRevision`：
  - 非 Project：`objectVersion`
  - Project：`objectVersion:projectIntentRevision`
- Deterministic-first：
  - open formal descendants → NOT_READY
  - 无 WorkIntent（MiniProject）→ UNKNOWN
  - 无 ProjectIntent（Project）→ UNKNOWN
  - OPEN CONFLICT Governance Issue → CONFLICT
  - 最小 Frozen Evidence 门槛只决定“是否值得进入语义评估”，不再以数量决定 READY（本轮语义由 ADR 040 接管；本节数量门槛已被 ADR 040 supersede）。
- 不做 percentage、Objective achieved flag、KR lifecycle、generic score。
- 后台可以维护 assessment；`NOT_READY/UNKNOWN → READY` 可以成为 meaningful change，但 READY 不自动生成 COMPLETE DecisionPackage。
- False READY 优先保守：证据不足永远 UNKNOWN。

## 2. 验收

- `phase14-closure.test.ts`：MiniProject UNKNOWN→NOT_READY→READY；Project UNKNOWN→NOT_READY→READY→USER Complete；child reopen 后 stale closure package 拒绝。
- Real DeepSeek 13-scenario closure eval：**false READY = 0**。
