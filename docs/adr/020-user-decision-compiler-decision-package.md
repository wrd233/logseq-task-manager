# ADR 020 — User Decision Compiler 与 Decision Package

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 9/10 章、`docs/vnext/06` 第 10/11/29 章、`docs/vnext/07` Phase 11

## 1. 决定

自然语言 USER 授权必须经过薄层编译，Agent 不能 impersonate USER。

- `DecisionPackage` 是认知层 bundle：一个 package 可含多个 precise candidate operations；
- `UserDecision` 是 immutable 授权事实：保存 utterance、scope、input versions、package correlation、execution refs；
- `compileUserDecision` 只在唯一 OPEN package + 唯一 OPEN candidate + 明确接受语 + 当前版本 fresh 时输出 `AUTHORIZED_DECISION`；
- `executeUserDecision` 以 `actor.type=USER` 调用 `commitFormal`，版本变化则 STALE fail closed；
- 引用/历史/条件语气是 `NOT_AUTHORIZATION`；多 package/多 candidate 是 `AMBIGUOUS`。

## 2. 实现

- schema v12：`decision_packages`、`decision_candidates`、`user_decisions`；
- Kernel：`createDecisionPackage` / `compileUserDecision` / `executeUserDecision` / list APIs；
- CLI：`decision-package list/show`、`decision compile/execute`、`user-decision list`；
- Decision 执行仍走既有 SemanticOperation registry + Formal Commit + Projection Obligation。

## 3. 不做什么

- 不保存整段聊天 transcript；
- 不做 conditional trigger engine（DEFERRED_BY_DESIGN）；
- 不给 External Agent 提供 `--actor USER`；
- 不把 Package 做成 workflow engine。
