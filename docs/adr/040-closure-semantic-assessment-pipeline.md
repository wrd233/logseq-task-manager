# ADR 040 — Closure Semantic Assessment Pipeline

- 状态：accepted
- 日期：2026-08-19

## 1. 决定

Production `ClosureAssessment` 不再使用 Evidence 数量门槛。`evidence.length >= checks/KR 数量 → READY` 已删除。

两段式：

- Stage 1 Deterministic Gate（无模型、无远程）：
  - OPEN CONFLICT Governance Issue → CONFLICT
  - TASK → READY（Task 由 USER marker closure 决定，不做语义评估）
  - MiniProject：无 WorkIntent → UNKNOWN；有 OPEN descendant → NOT_READY；无 Frozen Evidence → UNKNOWN
  - Project：无 ProjectIntent objective → UNKNOWN；有 OPEN descendant → NOT_READY；无 Frozen Evidence → UNKNOWN
  - gate blocked 时 assessment 直接持久化，provenance=DETERMINISTIC
- Stage 2 Semantic Outcome Assessment（gate pass 后，异步）：
  - `ClosureAssessor`（Fake / DeepSeek）只输出 `items[] + objectiveJudgment`，逐 Check / 逐 KR：SATISFIED / UNSATISFIED / UNKNOWN / CONTRADICTED + `supportingEvidenceIds[]` + `rationale`
  - Host `aggregateClosureSemanticJudgment` 决定 readiness，LLM 不决定 lifecycle

## 2. Host 汇总规则

- 任何 CONTRADICTED / objectiveContradiction / outcomeContradiction / scopeMismatch → CONFLICT
- 任何 UNSATISFIED → NOT_READY
- 任何 UNKNOWN → UNKNOWN
- 全部 SATISFIED 且 objectiveJudgment SATISFIED → READY（无 desiredOutcome 的 MiniProject 以 checks 为准；Project Objective 必须独立满足）

## 3. No Semantic Repair

- 模型 SATISFIED 但 `supportingEvidenceIds=[]` → 该项降为 UNKNOWN，Host 不替它选 Evidence
- 未知 evidence id / 重复 key / 缺 key / kind 不匹配 → 整次结果 INVALID，job 失败重试；last good assessment 保持最保守状态
- DeepSeek 解析 syntax-only，缺失字段抛错，不截断不补全

## 4. 冻结原则

- 宁可 UNKNOWN，false READY 极低
- 活动多 ≠ outcome 完成；child closed ≠ Project outcome；KR supported ≠ Objective fulfilled
- 新 Evidence 可否定旧 Evidence；contradiction 优先 CONFLICT

## 5. 验收

- `phase14-closure.test.ts`：无关 Evidence 数量达标仍 UNKNOWN；逐项 attribution 后才 READY
- `phase15-closure-semantic.test.ts`：gate 无模型调用、empty support 降级、invalid ref 失败、contradiction→CONFLICT
- Gold set：`packages/test-support/src/closure-gold-set.ts`（40 anonymized cases）；`scripts/eval-closure-semantic.ts` 输出 false READY / false NOT_READY / UNKNOWN restraint / CONFLICT detection / attribution accuracy / invalid ref rate / latency / tokens
- Real DeepSeek 40-case run（2026-08-19）：**false READY = 0，false NOT_READY = 0**；readiness 35/40；item status 47/53；attribution 23/24；invalid evidence ref 0；parse/model-format failure 2/40（全部 fail-safe 为 null/UNKNOWN，绝不 READY）；avg latency ≈ 18.0s；tokens ≈ 67k in / 65k out（全量累计）
