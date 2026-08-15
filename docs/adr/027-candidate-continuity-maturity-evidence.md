# ADR 027 — Formalization Candidate Continuity, Maturity Gate, and Evidence

- 状态：accepted
- 日期：2026-08-15
- 关联：docs/vnext/07 Phase 12.5、ADR-024

## 决定

Discovery 的优先顺序升级为：

1. Existing Formal WorkObject；
2. Existing OPEN Formalization Candidate（`ATTACH_TO_CANDIDATE`）；
3. NO_CANDIDATE；
4. 新 FORMALIZATION_CANDIDATE。

- Candidate identity 是 creation-stable key（初始 sorted SourceRefs + scope）；后续 source attach 不改变 id；
- Discovery prompt 只收到 bounded OPEN candidate 摘要；模型必须复制真实 candidateId，host 校验 OPEN 状态；
- Candidate 默认 `KEEP_OBSERVING`。`READY_FOR_DECISION` 只有在边界/kind/owner/outcome/支持材料完整，或存在明确强 USER commitment 时才输出；
- organize-today 只为 `READY_FOR_DECISION` candidate 创建 DecisionPackage；`KEEP_OBSERVING` 安静存在，不打扰用户；
- 成熟 package 前，host 按 `supportingHandles`（或最小 first source）冻结 proof-bound `FormalizationEvidence`；DecisionCandidate.evidenceIds 引用这些 evidence；
- maturity 不是 confidence score，也不是 USER authorization；即使 READY 仍走 Trusted USER 链。

## 不做什么

- 不做 semantic clustering merge；
- 不让模型虚构 candidateId；
- 不把 Evidence 等价于 source freshness；
- 不为 schema 完整 backfill WorkIntent/Owner。
