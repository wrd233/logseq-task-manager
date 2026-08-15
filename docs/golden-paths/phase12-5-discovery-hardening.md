# Golden Path：Phase 12.5 Discovery 使用硬化

> 状态：2026-08-15。Coverage / Continuity / Maturity / Evidence / Evaluation / Latency 六项全部落地；全量门禁见 commit。

## A. Coverage Honesty
- `DiscoveryRun` 记录 `scopeTotal/selected/processed/covered/remaining/continuationToken`。
- 7 sources + cap 3：`PARTIAL(4) -> PARTIAL(1) -> COMPLETED`，三个 run 覆盖无重复。
- `整理今天` 循环至多 3 个 batch，末尾保留 continuation；输出明确“还有一部分尚未完成”。

## B. Candidate Continuity
- 优先级：Existing Object → Existing OPEN Candidate → NO_CANDIDATE → New Candidate。
- `ATTACH_TO_CANDIDATE` 由 host 校验 OPEN + source handles；跨天 source 合并到同一 candidate，identity 不变。
- 未变化 rerun 不再重复远程调用（counting executor 证明 2 次 run 1 次 judge）。

## C. Maturity Gate
- 新 candidate 默认 `KEEP_OBSERVING`；`READY_FOR_DECISION` 需模型显式给出，host 校验支持材料。
- organize-today 只为 READY 生成 DecisionPackage；KEEP/UNEVALUATED 不打扰用户。
- prompt injection 无法强制 READY / 纳入。

## D. Evidence
- 成熟 package 前按 supporting handles 冻结最小 proof-bound `FormalizationEvidence`。
- `DecisionCandidate.evidenceIds` 非空；`candidate_evidence` 可追溯。

## E. Evaluation
- 62-case synthetic gold set 提交于 `packages/test-support/src/discovery-gold-set.ts`。
- `scripts/eval-discovery-restraint.ts` 计算 Association/Formalization P/R、Unresolved、Duplicate、Premature、batch errors、latency/tokens。
- DeepSeek 实测：Association P=0.857 R=1.0；Formalization P=1.0 R=0.417；Unresolved=0；Duplicate=0；Premature=0。
- Fake baseline：P=1.0 R=0（restraint-only，明确不伪装成完整能力）。

## F. Latency / Rework
- 本地 prefilter：active association、materialized candidate source、同 hash 已完成 source、空/属性块。
- 同 hash 已完成 source 记 `ALREADY_COVERED`，不再送 remote。
- DeepSeek 输出 budget 16k，batch 10；失败 batch 显式 `batchErrors`。
