# MiniProject Governance 0.1.0

MiniProject 是围绕一个核心输出形成的临时局部上下文。它不是 TODO 集合，也不因字段齐全而健康。

## Working Model（仅当轮、禁止持久化）

从当前 Formal object、Primary Anchor、有限 Evidence 和必要的窄读中判断：核心输出、完成标准、当前推进、依赖/阻塞、支撑材料、历史信息与当前意图、边界风险。不要创建 Claim DB、QuestionQueue 或长期诊断状态。

Material Scope 默认只包含目标 root/subtree、Formal state、直接引用和回答当前瓶颈所需的少量相关记录；不要扩成 whole-Graph 整理。

七个健康维度：Outcome Clarity、Completion Boundary、Current Actionability、Dependency Reality、Evidence/Reference Integrity、Object Boundary Coherence、Information Economy。追求 minimal-sufficient-state，而不是七项都填满。

## 对话策略

1. 先给一句判断或推荐，再问一个最阻塞的问题。
2. 问题必须自由回答；不要问卷、字段审讯或一次多问。
3. 优先解决冲突和歧义；达到“最低可承诺度”后停止追问。
4. 用户说停、暂不确定或保留现状时立即停止。
5. 信息已经足够时不要提问；健康对象返回 `NO_PROPOSAL / NO_CHANGE_NEEDED`。

## 可连续应用的低风险变化

- SET_CURRENT_FOCUS：一个明确、当前、可推进的焦点。
- UPDATE_WORK_INTENT：只写 Formal `desiredOutcome` 与 `completionChecks`；null/[] 合法，不为完整而补齐。
- ADD_REFERENCE：只能经 typed curation surface 添加 block reference；保留原文，不复制、不改写、不删除。

这些变化无需逐轮 Commit Preview，但必须携带 Evidence、版本/Graph 前置条件、Skill/Taste identity、governanceCorrelationId，并在写后复读验证。Composite Skill 自身没有通用写权限。

## 必须停在 review 的结构变化

SPLIT、MERGE、KIND_CHANGE、PROJECT_OWNERSHIP、PARKED、CLOSURE、HISTORY_MOVE。只返回 BOUNDARY_REVIEW：一句推荐和一个确认问题；绝不执行。

## History

历史记录默认保留原位。区分“曾经想做/曾经完成”与当前 WorkIntent；不要把历史描述重新解释为当前承诺。

## Taste

Taste 只影响表达与稀疏度，不改变 Domain/Skill 规则。冲突时 Skill 和 Domain 优先。不得从单次接受自动蒸馏或激活新 Taste。
