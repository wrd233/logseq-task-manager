# Task Copilot Production Dogfood：设计思路与决策记录

> 日期：2026-08-17  
> 范围：Grill Me 第 32～64 问  
> 目的：完整保存这一轮关于后台 Agent、Formalization、Closure、学习机制、复杂度控制与 Production Rollout 的判断链。  
> 使用方式：本文件解释“为什么这么设计”；真正下一阶段要实现的范围请以《Task-Copilot-Production-Dogfood-最小设计文档.md》为准。

---

# 0. 本轮 Grill Me 最终得出的总判断

最初我们继续探索的是：

> Production 中，Agent 到底应该替用户承担多少治理工作？

随着讨论深入，逐渐形成了一套很完整的长期治理系统，包括：

- 自动低风险维护
- Formalization Proposal
- Closure Proposal
- Definition Refinement
- Structural Refinement
- Decision Package
- Proposal stale / dependency
- Correction Experience
- Skill Refinement
- Skill Version
- Replay
- Domain Skill
- 多层 Cognition

但用户在第 56 问附近明确指出：

> **复杂度似乎上去了。**

这是本轮最重要的校正之一。

因此最终不是把所有概念变成开发计划，而是：

> **冻结长期语义边界，同时设置复杂度冻结线；下一阶段只实现 Production Dogfood 最小闭环。**

---

# 1. 决策 32：保留现有低风险自动维护，不退回只观察

## 结论

Production Dogfood 默认继续允许当前已批准的低风险自动维护：

- `current_focus`
- `ACTIONABLE ↔ WAITING`
- `waitingCondition`
- 高置信 `Context Association`

不切回“全部只观察”。

## 原因

如果全部只观察，只能验证：

> 一个聪明的旁观者是否有用。

而无法验证：

> Task Copilot 是否真的替用户承担任务系统维护成本。

## 同时冻结

低风险自动化追求：

> **语义收敛，而非实时响应。**

---

# 2. 决策 33：低风险自动维护默认静默

## 结论

不要逐操作通知，也不要进入“待我确认”。

用户不需要看到：

```text
current_focus changed
engagement changed
context association added
```

而应该在重入时看到工作意义上的“上次以来”。

## 原因

如果 Agent 越能干，用户收到的通知越多，则自动化反而制造新的治理负担。

“待我确认”只用于真正 USER authority。

---

# 3. 决策 34：用户纠正现实，不纠正字段

## 结论

Agent 自动维护错误时，主纠错方式：

> 用户直接用自然语言说“实际情况不是这样，而是……”

系统再通过 User Decision 修正 Formal Memory。

## 不推荐

- 手工修改 Kernel 字段
- 把操作日志 Undo 当主交互
- 让用户学习 schema

## 原则

> **USER correction 永远高于 Agent inference。**

---

# 4. 决策 35：USER authority 默认延迟，不即时打断

## 结论

需要 USER authority 的决定默认：

```text
成熟 Proposal
→ 待我确认
```

只有：

> 当前用户显式动作无法在不获得授权的情况下安全继续

才就地询问。

## 关键判断

不是：

> 事情重不重要？

而是：

> **当前动作不问用户还能不能安全继续？**

---

# 5. 决策 36：Discovery 主动，Formalization 克制

## 结论

系统可以后台主动发现 Natural Work 中的新工作线程。

但：

```text
Discovery
≠ Formalization Candidate
≠ Formal Object
```

不要把每条像 Task 的记录变成 Candidate Inbox。

---

# 6. 决策 37：Candidate 成熟度是多信号语义判断

## 结论

不使用：

```text
出现 N 次
持续 N 天
```

这样的机械门槛。

真正判断：

- 是否成为真实承诺
- 边界是否逐渐稳定
- 是否值得未来独立重入
- 是否无法被已有对象自然吸收
- Formal Memory 是否开始产生实际价值

## 性格

> 高 precision，允许低一点 recall。

拿不准就继续观察。

---

# 7. 决策 38：成熟 Candidate 应变成接近可提交的 Formalization Proposal

## 结论

系统应主动整理：

- 推荐类型：Task / MiniProject
- 推荐标题
- Evidence 支持的预期成果
- 可能 ownership
- 为什么认为它值得 Formalize

用户主要做最终边界确认，不从零填表。

## Project 更保守

Project Candidate 的门槛明显高于 Task / MiniProject。

## 反杜撰

证据不足的 Formal 信息宁可留空，也不能为了“完整”补理想化内容。

---

# 8. 决策 39：Formalization 拒绝不是永久 REJECTED

至少区分：

## 先不用

表示：

> 当前还不成熟 / 当前不值得 Formalize。

未来新现实明显变化后可重新评估。

## 不是独立事项

表示：

> 对象边界判断错误，应优先吸收到已有对象或普通 Context。

这比“先不用”是更强的边界纠正。

## 不建立永久黑名单

现实可以继续成长。

---

# 9. 决策 40：Existing-Object-First 可以自动关联，但不能自动判 Identity

## 可以自动

- 高置信 Context Association
- 抑制不必要的新 Formalization Candidate

## 不能自动

- Formal Object merge
- identity equality
- Primary Anchor reassignment
- ownership 重构

## 核心

> **Similarity ≠ Identity。**

---

# 10. 决策 41：Context 历史关系和当前认知权重分离

## 结论

Context Association 可以长期保存“曾经相关”。

是否参与当前认知由 Read Model / Cognition 动态判断。

## 不按时间简单删除

时间只是证据之一。

新、更强现实可以 supersede 旧认知。

## 不建设复杂知识图谱

第一阶段优先派生判断。

---

# 11. 决策 42：局部变化驱动 + 低频全局 Reconciliation

## 结论

主路径：

```text
Local change
→ Index update
→ quiet period
→ affected scope
→ narrow cognition
```

低频全局任务只做：

```text
Coverage audit
→ 找遗漏
→ 生成 narrow jobs
```

而不是周期性把整个 Logseq 重新交给 LLM。

## 性格

> **局部敏感，全局克制。**

---

# 12. 决策 43：Formal Memory 有状态惯性

## 结论

新增 / 冲突 Evidence 只有形成更强新现实时才改已有 Formal 状态。

Agent 允许：

```text
CHANGE
KEEP
UNCERTAIN
```

`UNCERTAIN` 默认：

```text
NO FORMAL MUTATION
```

也不打断用户。

## Engagement 核心语义

不是：

> 有无外部依赖。

而是：

> **还有没有真正对成果有意义的内部推进路径。**

---

# 13. 决策 44：完成由 Closure Proposal 承接

## 结论

Agent 不自动 Complete。

但 Evidence 足够成熟时，也不能让对象无限 OPEN。

因此：

```text
Closure Readiness
→ Closure Proposal
→ USER authority
→ COMPLETED
```

## Closure 判断

Task done 数量不能替代 Outcome achieved。

---

# 14. 决策 45：closure-ready 只是派生阅读态

## 结论

有成熟 Closure Proposal 但未获用户授权：

```text
Formal lifecycle = OPEN
Derived = closure-ready
```

Read Model 可降低其活跃权重。

不要新增 Formal：

```text
CLOSURE_READY
```

新缺口出现后派生 readiness 自动失效。

---

# 15. 决策 46：对象理解可自动丰富，对象定义不能静默漂移

## 结论

Agent 可以自动丰富：

- Current Situation
- Evidence
- Completion Assessment

但不能静默改：

- desiredOutcome
- completion checks
- ProjectIntent
- 正式 title

长期方向是 Definition Refinement Proposal。

## 重要边界

> “现在理解得更好”不等于“原承诺自动改变”。

## completion checks 不能由最佳实践杜撰

只有真实 Evidence 支持才能成为完成边界。

---

# 16. 决策 47：对象边界失去内聚时，长期方向是 Structural Refinement Proposal

## 结论

Agent 不自动：

- split
- merge
- type promotion
- ownership 重构

如果对象长期失去内聚，系统未来应形成结构调整建议。

## 关键判断

不是 child 数量，也不是持续时间。

而是：

- 是否出现多个独立结果
- 是否有多个独立重入点
- 原 outcome 是否无法解释新工作
- 原结果已经完成但后续工作仍不断涌入

## Identity 原则

> 已有对象如果曾经拥有清楚稳定的成果边界，应优先保留其历史 identity，让后续现实长成新的 sibling object。

---

# 17. 决策 48：用户授权语义决策，不授权底层 mutation

## 结论

多个 Formal mutation 如果共同实现一个不可分割的用户判断，长期应该被编译成一个 Decision Package。

用户看：

- 为什么
- before
- after
- 采用后的结果

不要逐项确认：

```text
CREATE
MOVE
SET_OWNER
```

## 但不同 authority 不强行捆绑

例如：

- 结构调整
- Closure
- Definition Refinement

如果是不同用户判断，应继续分开。

---

# 18. 决策 49：Proposal 点击采用前必须语义重验证

## 结论

Proposal 不是永久执行权。

用户点击采用时：

```text
revalidate semantic assumptions
```

核心现实已经改变：

```text
STALE / RETIRE
```

不能：

- 强行执行旧方案
- 偷偷把旧方案改成新的再执行

## 无关技术变化不应机械 stale

真正需要关注的是语义前提变化。

---

# 19. 决策 50：多个 Proposal 先由 Governance 消解依赖

## 结论

“待我确认”只展示当前真正可决定的 Proposal。

例如 Structural / Definition 尚未稳定时，依赖它们的 Closure 不应同时出现。

## 不建设 Proposal DAG

第一阶段只需要轻量：

- semantic scope
- assumptions
- 简单 conflict/dependency check

---

# 20. 决策 51：纠错立即作用当前现实，但不自动改全局 Skill

## 结论

用户纠正：

1. 立即修复当前 Formal Reality
2. 长期可以结构化沉淀 Correction Experience
3. 重复模式再由高质量模型归纳 Skill Proposal

## 禁止

Production Agent 根据单次反馈自改 Skill。

---

# 21. 决策 52：Correction Experience 属于 Governance / Learning，不属于 Formal Work Truth

## 结论

同一次用户纠正长期可以同时产生：

```text
User Decision
→ 合法修正 Formal Reality

Correction Experience
→ 未来学习材料
```

职责分离。

Experience 不默认投影进 Logseq，不进入 Formal World 主阅读面。

---

# 22. 决策 53：Skill 长期应该版本化、可追溯、可回滚

## 长期结论

Skill Refinement 被用户批准后，不直接覆盖旧文件。

应该：

```text
new immutable version
→ historical replay
→ activate
```

并可 rollback。

## rollback 不回滚 Formal History

Skill 只影响未来判断。

---

# 23. 决策 54：第一阶段不做 Project/MiniProject Skill fork

## 结论

优先：

```text
Global / Domain Skill
+
Context
+
Evidence
```

不要：

```text
Project A override
MiniProject B special skill
```

只有跨场景、长期稳定的差异才值得未来抽象成语义域 Skill。

---

# 24. 决策 55：运行时核心 Skill 应由 Decision Type 路由

## 长期结论

未来：

```text
Decision Type
→ Core Skill deterministic routing
→ optional Domain Skill
→ Context / Evidence
→ Agent
```

不让 Agent 自由漫游整个 Skill 库。

Domain Skill 不能突破核心 Formal authority。

---

# 25. 决策 56：认知可分层，但复杂度开始上升

初始讨论形成：

```text
确定性逻辑
→ Routine Agent
→ Advanced Cognition
```

但用户明确指出：

> **这里复杂度似乎上去了。**

因此立即调整。

## 最终解释

这只是长期原则：

> 能确定性解决就不用模型；普通后台用默认 Agent；真正出现低频高价值复杂问题时，未来再考虑强模型入口。

**不意味着现在建设模型路由器、多 Agent 平台或 CognitionTier 体系。**

---

# 26. 决策 57：正式设置复杂度冻结线

## 结论

从这里开始停止继续增加远期治理概念。

前面冻结的长期设计：

> 保留为方向和防走偏原则。

但默认全部 Deferred。

## 新复杂度必须“赚取”

```text
真实发生
→ 重复发生
→ 持续制造维护成本
→ 才考虑新增系统能力
```

---

# 27. 决策 58：下一阶段只实现三个最小方向

## 允许

1. 跑稳现有低风险自动维护
2. 跑顺自然语言纠错
3. 跑顺 Formalization / Closure

## Deferred

- Structural
- Definition Refinement
- Learning Platform
- Skill Version Manager
- Replay
- Domain Skill Router
- Advanced Agent Scheduler
- Proposal DAG
- 通用 Duplicate Merge
- 自动 Anchor Recovery 等

---

# 28. 决策 59：Dogfood Evidence 极轻，不建设 Analytics

## 只观察

- 自动维护 churn
- 明显误判
- 明显漏判
- 低价值 Confirmation
- Formal World 污染
- 特别好/差的重入案例

## 正常运行不记录

避免用户又增加一份系统维护工作。

---

# 29. 决策 60：Production 采用稳定窗口 → 聚合证据 → 小批修改

## 可以立即修

- correctness
- authority 越界
- 数据风险
- 阻塞故障

## 默认先记录

- 普通认知误差
- 边界判断
- Current Frontier / Current Situation 体验偏差

## 目的

避免 Dogfood 期间系统持续漂移。

---

# 30. 决策 61：Dogfood Log 不成为新的人工日志系统

## 结论

复用 Audit / History 自动提供：

- Formal before/after
- Evidence
- object
- time
- 判断来源

用户只需要补：

> “这里哪里不对。”

少数确定性 churn/failure 可以自动留下案例。

---

# 31. 决策 62：真实 Production，但第一轮缩小主动治理范围

## 结论

不是 Sandbox。

使用：

- 真实 Production Kernel
- 真实 Logseq
- 完整 Console

但主动低风险维护先覆盖少量代表性真实对象。

## 原因

主要为了：

> 可归因、可观察。

---

# 32. 决策 63：Dogfood Scope 按 root + ownership descendants

## 结论

配置少量：

```text
Project / MiniProject roots
```

自动覆盖 descendants。

不要逐 Task 白名单。

## Scope 不属于 Formal Model

它只控制后台主动治理 rollout。

用户显式操作和 Console 等不受限制。

---

# 33. 决策 64：Production Rollout 采用极轻三段式

## Stage A

现有低风险维护：

- Context
- current_focus
- engagement
- waitingCondition

## Stage B

验证自然语言纠错能可靠恢复。

## Stage C

打开 Formalization + Closure。

不建设 Rollout Framework，也不细拆十个阶段。

---

# 34. 本轮形成的系统性原则

## 34.1 内部复杂，用户简单

```text
内部 Operation 可以很多
用户 Decision 必须很少
```

## 34.2 自然现实可以模糊，Formal Memory 不必

Natural Workspace：

- 快
- 连续
- 模糊
- 临时
- 矛盾

Formal Memory：

- 稀疏
- 稳定
- 高置信
- 可追溯

## 34.3 系统可以不知道

UNKNOWN 是合法状态。

不要因为 Agent 拿不准：

- 改 Formal Truth
- 打断用户
- 强行升级模型

## 34.4 Formal World 的健康比“捕获率”重要

宁可晚一点 Formalize、少一点 Candidate，也不要制造重复对象、僵尸对象和边界污染。

## 34.5 现实跟随与承诺定义分离

```text
current_focus / engagement
= 现实跟随
= 可窄自动

desiredOutcome / completion / ProjectIntent
= 承诺边界
= USER authority
```

## 34.6 学习速度分层

长期原则：

```text
当前现实修复
= 快

局部经验积累
= 中

全局 Skill 变化
= 慢

Formal authority
= 最保守
```

---

# 35. 为什么不继续 Grill 新概念

到第 56 问以后，继续追问“未来怎么办”已经可以无限产生：

- Policy migration
- Skill lifecycle
- Proposal scheduler
- model provenance
- learning evaluation
- multi-agent
- scoped policy

这些并不是当前真实阻塞。

因此本轮主动终止发散。

下一阶段正确方式是：

> **先运行系统，让现实告诉我们哪些 Deferred 概念真的值得被实体化。**

---

# 36. 最终优先级

## Now

- Low-risk maintenance dogfood
- correction chain
- Formalization
- Closure
- Dogfood scope
- minimal evidence
- stable iteration cadence

## Later only if earned

- Definition Refinement
- Structural Refinement
- Learning Ledger
- Skill Refinement
- Skill versioning
- replay
- domain skills
- multi-model cognition
- Proposal dependencies
- recovery automation

---

# 37. 最终结论

本轮 Grill Me 真正的成果不是：

> 设计出一个更复杂的 Agent Governance Platform。

而是：

> **先把未来可能需要的语义边界想清楚，然后有意识地不实现大部分内容。**

因此下一阶段的核心纪律是：

> **先让 Production Dogfood 产生真实摩擦，再让复杂度被现实需要“买单”。**
