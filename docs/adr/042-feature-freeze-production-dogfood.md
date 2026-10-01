# ADR 042 — Feature Freeze and Production Dogfood Scope

- 状态：accepted
- 日期：2026-08-16
- 适用范围补注（2026-10-01）：以下决定保留为当时 Formal Kernel RC / dogfood 的冻结范围。后来明确授权的插件整合见[整合说明](../integration/README.md)，行为保持的重构见[第一轮结果](../refactoring/round-01-results.md)。本轮没有新增 Domain capability；新[工作区需求](../requirements/2026-10-01-project-workspace-collaboration.md)仍是目标提案，不代表已实现，也不替代正式权限和恢复约束。

## 1. 决定

从 Round 12 开始，vNext 进入 Feature Freeze：除 release blocker、semantic correctness、runtime reliability、UI dedupe/copy simplification、prompt restraint、latency、stale handling、recovery、security、docs、tests 外，不增加新的 Domain capability。

## 2. 明确禁止

continuous Discovery、Natural Content Curation、Taste auto-learning、KR progress %、Objective status、generic relation graph、notification platform、provider router、agent marketplace、workflow engine、design system rewrite。

## 3. 允许并优先

- 删除 dogfood 暴露的低价值 UI/logic duplication，不做 sunk-cost preservation
- Now/Project/MiniProject 文案收敛：真实 diff 优先，不重复 title/phase/分类文案
- Confirmation 保持稀疏；More 正常态一行
- Closure semantic hardening 与 async cached assessment（ADR 040/041）
- Long-horizon dogfood 中发现的 bug fix

## 4. 验收

- `RC_INPUT_CHECKLIST.md` 如实维护 Known Issues / Release Blockers
- README 与 docs/vnext/README 的 Current/Completed/Next 与实际一致
- 本 ADR 生效后，任何新 Domain capability 必须先推翻本 ADR
