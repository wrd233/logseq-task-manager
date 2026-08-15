# ADR 023 — Governance Issue Identity 与 Causal Dimension-Checked Resolution

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/06` Governance Issue、`docs/vnext/07` Phase 11.5、ADR-017

## 1. 决定

Governance Issue 的持久化身份来自**正式因果结构**，而不是 LLM 生成的 summary 措辞；Issue 的自动 resolve 必须经过维度校验。

- issue key 固定为 `stableHash([workObjectId, judgment.kind, dimension, ...sorted(selectedHandles)])`；
  - LLM 把 summary 从“方向冲突”改写成“目标存在矛盾”不会生成新 Issue；
  - 同一因果结构（相同 handles）跨轮次 dedupe，不同 handles 成为不同 Issue；
- `#resolveIssueIfMatching(workObjectId, issueId, dimension)` 只 resolve：
  - `issue.workObjectId === workObjectId`；
  - `issue.status === "OPEN"`；
  - `issue.dimension === judgment.dimension`；
  - 维度不匹配时静默跳过，Issue 继续 OPEN，绝不被无关维度误清；
- `CONFIRMED_CHANGE` 与 `NO_CHANGE` 的 `resolvesIssueIds` 都必须携带 judgment 自身 dimension。

## 2. 为什么

- Issue 是 formal uncertainty，不是聊天记录：身份必须可稳定复现，不能随语言模型措辞漂移；
- 维度是因果边界：`current_focus` 的 NO_CHANGE 不能“顺手”关掉一个 `engagement` conflict；
- 自动 resolve 是最危险的维护动作之一，只允许 same-object + same-dimension + still-OPEN 的精确命中。

## 3. 实现

- `apps/kernel-service/src/maintenance-coordinator.ts`：`issueKey` 与 `#resolveIssueIfMatching`；
- 测试：`packages/test-support/tests/phase10-context-governance.test.ts` 证明错误维度不 resolve、正确维度才 resolve；
- 旧行为（把 summary/rationale wording 参与 hash、只按 id resolve）被废弃。

## 4. 不做什么

- 不用 LLM 措辞做 Issue 主键；
- 不 resolve 其他 object / 其他 dimension / 已关闭 Issue；
- 不给 Agent 一个“resolve any issue”的通用 API。
