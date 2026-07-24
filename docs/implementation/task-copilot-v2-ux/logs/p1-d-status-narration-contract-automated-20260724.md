# P1-D 确定性状态叙述契约自动证据（2026-07-24）

结论：`PARTIAL_AUTOMATED_PASS / APPLICATION_CONTRACT_READY / UI_AND_DESKTOP_OPEN`

## 契约

Application `StatusNarration` 固定包含：

- `conclusion`；
- `keyEvidence[]`；
- `facts[]`；
- `inferences[]`；
- `unknowns[]`；
- `nextActionEligible` 与可选结构化 `nextAction`；
- `evidenceScope`；
- deterministic rule `source` 与 version。

首轮输入只使用一个正式 V2 Object、可选的精确 blocker Object、观察时间和当前 scene。
没有 LLM、Graph 正文、宽检索、正式写入或新的持久化。

## 下一动作防线

只有以下确定性事实且 scene 不是后台检查时生成一个动作：

- WAITING `reviewAt` 已到；
- BLOCKED 的精确 `blockerObjectId` 对应 Object 已 `COMPLETED`；
- PAUSED `reviewAt` 已到。

以下情况 `nextActionEligible=false`：

- 未来 WAITING/PAUSED；
- 普通 ACTIONABLE；
- Project current focus；
- 已关闭对象；
- blocker 当前状态未读取；
- BACKGROUND scene。

普通 ACTIONABLE 会明确输出“正式状态没有提供足够信息来判断具体下一步”，不会从标题、
正文或 Project focus 猜动作。

## 信息密度与零丢失

- conclusion/key evidence 各封顶 160 字；
- next-action label 封顶 80 字；
- 一个 narration 最多两条 key evidence；
- Project current summary/focus 的完整正式文本仍保留在 facts；
- deterministic `inferences` 恒为空；
- 用户层文本不直接展示 Lifecycle/Condition 字段名；
- blocker identity 不匹配 fail closed。

## 自动 Gate

- WAITING due/future；
- blocker completed/missing/background/mismatch；
- PAUSED due/future；
- Project current interface；
- generic ACTIONABLE 与 closed lifecycle；
- invalid observedAt；
- 长 Project 正式文本首屏封顶、facts 零丢失；
- Application 91/91 tests、0 skipped；
- Application typecheck PASS；
- 根级 `./scripts/check.sh` PASS。

## 尚未声明

- 未接 Plugin ViewModel 或用户 UI；
- 未覆盖 Proposal/Commit/Anchor/System narration；
- 未建立受约束 LLM narration draft protocol；
- 未完成 Light/Dark/窄栏/Desktop 语言与操作距离 Gate。
