# ADR 032 — Ephemeral Stateful Object Conversation

- 状态：accepted
- 日期：2026-08-16
- 关联权威文档：`docs/agent/object-conversation-guide.md`

## 1. 决定

多轮对象对话使用 ephemeral session state，不持久化 transcript / CoT。

Runtime session state 仅包含：

- visible user / agent turns（recent bounded）；
- objectId 与最近一次 ObjectContextPack；
- askedQuestionKeys（canonical keys）；
- resolvedGaps；
- pendingRecommendation / pendingDecisionPackageId；
- discussionOnly / actionAllowed；
- formalVersion。

规则：

- 每个语义 mutation（low-risk apply / boundary decision）后必须重新读取 `object context <id>`，禁止继续使用旧 pack。
- 同一 question key 在一个 session 中只允许问一次；用户回答后记为 resolvedGap。
- “只是聊 / 先别改” 使 `actionAllowed=false`，只在本 session 生效，不写入 Taste。
- 用户明确“按你说的改”才恢复 actionAllowed。
- 跨 session 恢复仍只靠 ObjectContext，不依赖旧 transcript。

## 2. 不实现

- generic conversation DB；
- transcript 搜索/持久化；
- LLM judge platform；
- semantic search for question keys（使用模型输出的稳定 key + 简单 canonicalization）。

## 3. 验收

- Real DeepSeek multi-turn harness（`/tmp/tc-phase17-ux/multiturn-eval.json`）覆盖：low-risk apply + refresh、用户纠正、只讨论不修改、ProjectIntent boundary。
- Harness 只记录 visible turns / typed actions / metrics / formal version。
