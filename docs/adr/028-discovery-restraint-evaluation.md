# ADR 028 — Discovery Restraint Evaluation and Association Precision

- 状态：accepted
- 日期：2026-08-15
- 关联：docs/vnext/07 Phase 12.5

## 决定

Discovery 必须以可重复 synthetic gold set 量化，而不是只看一个 happy path。

- 提交 `packages/test-support/src/discovery-gold-set.ts`（62 条 anonymized synthetic cases）与 `scripts/eval-discovery-restraint.ts`；
- 指标：Association Precision/Recall、Formalization Precision/Recall、Unresolved Rate、Duplicate Coverage Rate、Premature Package Rate、batch errors、latency/tokens；
- Precision 优先于 Recall；禁止通过全 NO_CANDIDATE 作弊（Fake baseline 明确标注 recall=0）；
- exact-title mention 是 strong evidence，但不是无条件 ASSOCIATE：history/quote/comparison/completed/negative 由 gold set 校验；
- DeepSeek 结果作为 runtime evidence 记录；不因单次模型波动改 Skill，先收集 pattern。

## 实测基线（2026-08-15，deepseek-v4-flash）

- 62 cases：Association P=0.857 / R=1.0；Formalization P=1.0 / R=0.417；Unresolved=0；Duplicate=0；Premature=0；
- Fake baseline：P=1.0 / R=0.0（restraint-only）。
