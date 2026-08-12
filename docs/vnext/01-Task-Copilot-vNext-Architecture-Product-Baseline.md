# Task Copilot vNext · Architecture & Product Baseline

> 文档类型：架构与产品设计冻结基线  
> 版本：vNext Design Freeze 2026-08-12  
> 状态：可用于实施  
> 核心主题：可信工作内核、自然工作现场、Agent 治理、语义事务与低心智负担

---

# 0. 执行摘要

Task Copilot 的问题从来不是“缺一个 TODO 应用”。

真正的问题是：现实工作以自然、碎片、非结构化的方式发生；记录、任务、项目、文件、决定、成果和上下文分散在 Daily Journal、项目页、聊天、截图、表格、命令、外部模型对话和人的记忆中。用户可以很容易“写下来”，但很难保证一件事情在几天、几周甚至几个月之后仍然：

- 可以重新进入；
- 当前状态可信；
- 下一步明确；
- Waiting / Parking 的原因没有丢；
- 归属关系没有腐化；
- 重要决定能够追溯；
- 完成后仍保留结果与成果；
- Agent 的帮助不会把系统变成第二套工作区。

因此，vNext 的北极星是：

> **把自然工作记录持续翻译为可信行动、可恢复对象、可追溯成果和可复用能力，同时把结构化、对账、修复与低风险治理的劳动尽可能交给系统与 Agent。**

vNext 的架构中心不再是 Plugin，也不是 LLM，而是：

> **Local Kernel Service：正式事实与 Semantic Commit 的唯一写权威。**

Logseq 仍然是用户的自然工作现场；SQLite 保存正式状态；Commit Ledger 保存正式发生过什么；Plugin 提供低心智的人机界面；Built-in Agent 与 External Agent 都只是认知执行器；Skill 是可版本化的治理政策；正式改变必须被压缩为有限、可验证的 Semantic Operation，并通过统一事务内核落地。

---

# PART I：项目为何存在

## 1. 根问题：用户不缺记录入口，缺的是持续的行动连续性

现实工作不是从一张干净表单开始。

一件事情可能最初只是：

```text
下午问一下业务方什么时候能上线
```

也可能是：

```text
TODO 确认服务器的管理口 IP
```

或者是一段会议记录、错误日志、截图、Word 文档、微信群转述、一个本地文件夹、一段 Codex 对话。

如果系统要求用户在记录当下立刻回答：

- 这是 Task 还是 MiniProject？
- 属于哪个 Project？
- Objective 是什么？
- 当前 Engagement 是什么？
- 完成证据是什么？
- 是否需要 Artifact？
- review_at 是哪一天？

那么系统就在最不适合建模的时候，把建模成本推给用户。

vNext 的基本承诺是：

> **写的时候自然；整理的时候结构化。**

Logseq 的价值首先是“现场自由”。Task Copilot 不应为了治理，把 Logseq 变成一个字段表单系统。

## 2. 系统价值的最小单位不是“保存 TODO”，而是“可重新进入”

用户真正痛苦的往往不是忘记某个标题，而是重新进入一个事情时需要重新问：

- 这件事是为什么开始的？
- 我上次做到哪里了？
- 为什么停住？
- 是我主动不做，还是在等别人？
- 最近有什么新记录？
- 现在下一步是什么？
- 之前已经做过哪些决定？
- 有哪些文件和成果？
- 什么时候算结束？

因此：

```text
Task
→ 需要知道是否仍需执行、是否可行动、当前推进或等待条件

MiniProject
→ 需要恢复目标、完成检查、当前推进、内部 Task 与过程证据

Project
→ 需要稳定工作面、目标、结果标准、范围、阶段、当前推进、成果与关键决策
```

这就是“重入能力”。

## 3. 对象会腐化，所以持续治理比一次创建更重要

即使创建时完全正确，对象也会随着现实变化而过期：

```text
current_focus 已经完成
Waiting 条件已经解除
项目实际上结束了但仍 OPEN
某个 Task 已经迁移到别的 MiniProject
新的 Evidence 出现
旧标题已经不能准确表达工作
原来的范围发生变化
```

因此 vNext 不追求：

> 永久正确、永久完美的对象。

而追求：

> **对象始终能够回到“当前有证据支持的良好状态”。**

这也是 Agent 最有价值的地方之一：持续帮助发现、对账、修复、整理，而不是只在创建那一刻帮用户写一个漂亮标题。

## 4. 工作不能在完成后清零

`DONE` 不是工作的全部价值。

完成一件事之后，未来真正有用的是：

- 实际形成了什么；
- 哪个脚本、文档、配置或报告是成果；
- 为什么作出某个决定；
- 哪些经验可以复用；
- 哪些遗留仍需处理；
- 是否形成 SOP / Skill / Pattern；
- 下一次遇到类似问题时能否减少重新思考。

因此 vNext 将“完成”视为一次轻量结算，而不是简单隐藏。

但这不意味着每个 Task 都要填复杂结项表。vNext 的原则是：

> **普通 Task 的收尾保持一击完成，系统自动形成最小结算；更大的对象才承担更厚的结算责任。**

---

# PART II：不可违背的高层原则

## 5. 自然记录优先于预先结构化

Logseq 原文是用户自然工作现场。

系统不得因为治理而：

- 静默改写大量自然正文；
- 把自然记录强行变成正式 Task；
- 把用户未确认的语义解释当成事实；
- 要求用户为每条现场记录先完成建模。

## 6. 缩短用户链，不缩短安全链

用户不应该看到：

```text
解析
→ Candidate
→ Draft
→ Proposal
→ Validator
→ Commit
→ Ledger
→ Projection
```

用户可能只看到：

```text
Agent 已整理
→ 2 项需要你判断
```

但底层仍必须保留：

- Evidence；
- 版本；
- Hash；
- Scope；
- Risk；
- Proposal；
- Preconditions；
- Commit；
- Audit；
- Undo；
- Recovery。

> **低心智负担来自复杂度后置，不是来自删除安全机制。**

## 7. 确定性工程优先于模型判断

能通过确定性规则确认的事情，不交给 Agent 猜。

例如：

- 对象版本是否改变；
- Block UUID 是否一致；
- Evidence Hash 是否变化；
- 某个父对象是否仍有 OPEN 子对象；
- Operation 是否违反 Kind 约束；
- Commit 是否完整执行；
- Projection 是否与 Kernel 一致；
- Undo 是否会覆盖用户后续编辑。

Agent 负责模糊语义；Kernel 负责边界与事实。

## 8. NO_PROPOSAL 是优质结果

Agent 不应为了证明自己有用而必须产生修改。

可能的正确结果包括：

```text
NO_PROPOSAL
证据不足
需要更多 Context
当前状态已经足够好
存在多个合理解释
高风险问题需要用户决定
```

智能质量不能用“Proposal 数量”衡量。

## 9. vNext 没有历史兼容义务

这是本轮设计中非常重要的工程原则。

> **兼容是偶然收益，不是设计目标。**

若旧实现可以几乎零成本兼容，则可以顺手兼容；若兼容要求：

- 维持旧 Domain；
- 增加双轨状态；
- 长期保留 Legacy Adapter；
- 建 Migration Framework；
- 让新模型迁就旧字段；
- 在新代码中持续出现 V1 特例；

则直接不兼容。

Git 历史就是旧代码档案。旧 Graph 是用户资料，继续保留；旧 SQLite 不再是 vNext 的正式来源。

---

# PART III：权威分层

## 10. 四层权威

vNext 必须始终区分以下层次：

| 层 | 权威内容 | 禁止行为 |
|---|---|---|
| Logseq Graph | 用户自然正文、Block/Page、现场层级与引用 | Kernel 为整理而吞掉或重写自然记录 |
| Kernel / SQLite | 正式 WorkObject、关系、Lifecycle、Engagement、Closure、Decision、事务事实 | UI、Agent、CLI 各自维护平行正式状态 |
| Projection | Now、Managed Summary、项目工作面、提示、Health/Cohort 结果 | 缓存或视图变成唯一事实 |
| Agent Output | 分析、推断、报告、Proposal、NO_PROPOSAL | 自然语言直接写入正式状态 |

## 11. Graph 与 Kernel 不是“双写同一事实”

不要把关系理解为：

```text
SQLite lifecycle = COMPLETED
Graph TODO = DONE
```

然后说“两个地方都是真相”。

更准确的是：

```text
Kernel
→ 正式语义：该 WorkObject 已完成

Graph
→ 用户工作现场中的受控命令入口 + 正式语义投影
```

用户明确将正式 Task 的 Marker 从 TODO 改为 DONE，可以被解释为一个显式命令输入；Kernel 成功 Commit 后，Graph Marker 又成为正式状态的可见投影。

自然文字则继续属于 Graph，而不自动成为 Kernel 字段。

---

# PART IV：核心信息模型

## 12. WorkObject：Task / MiniProject / Project 使用统一身份模型

vNext 不再维护三套不同对象仓库。

统一：

```yaml
work_object:
  id: stable-id
  kind: TASK | MINI_PROJECT | PROJECT
  title: ...
  lifecycle: ...
  engagement: ...
  primary_anchor: ...
  primary_owner: ...
  current_focus: ...
```

`kind` 是正式、稳定的语义区别，但不是三套数据库与三套 Commit 内核。

共同能力：

- 稳定 ID；
- Anchor；
- Evidence；
- Ownership；
- Lifecycle；
- Engagement；
- Audit；
- Proposal；
- Commit；
- Undo；
- Closure。

Kind 差异主要由：

- Policy；
- Intent Schema；
- Projection 厚度；
- UI；
- 关闭规则；
- Ownership 约束；

体现。

## 13. Lifecycle 与 Engagement 必须拆开

正式状态不再使用一个模糊 `status`。

### Lifecycle

```text
OPEN
COMPLETED
CANCELLED
```

回答：

> 这项正式工作是否仍然开放？

### Engagement

仅对 `OPEN` 对象有意义：

```text
ACTIONABLE
WAITING
PARKED
null
```

回答：

> 当前为什么做 / 不做？

两者不能混成：

```text
active / waiting / done / parked
```

因为“是否结束”和“当前是否可行动”不是一个维度。

## 14. `current_focus` 是最小确认事实，不是全文进度摘要

Kernel 只保存最小、当前认可的推进接口。

例如：

```text
准备与网络组确认 VLAN 后进行上架配置
```

不把长篇“项目目前进展如何”存成持续维护字段。

完整 Progress Narrative 应由：

- WorkObject；
- Evidence；
- Decision；
- Artifact；
- Recent Activity；

按需重建。

Task 经常不需要 `current_focus`；MiniProject / Project 更常需要。

## 15. Anchor 与 Evidence

WorkObject 拥有独立稳定 ID，不等同于某个 Block UUID。

每个 WorkObject 可以有：

```text
0..1 Primary Anchor
0..n Evidence References
```

第一版来源角色只需要：

```text
PRIMARY
EVIDENCE
```

避免一开始建设过多 source role。

## 16. Project 必须使用独立 Page 作为 Primary Anchor

规则：

```text
Task
→ 通常 Block

MiniProject
→ 通常 Block

Project
→ 必须 Page
```

当 MiniProject 升级为 Project：

```text
保留 WorkObject ID
→ 创建 Project Page
→ 新 Page 成为 Primary Anchor
→ 原 Block 保留为 Evidence / Entry
```

身份不因 Anchor 变化而重建。

## 17. ResponsibilityScope：Area 不属于 WorkObject

Area 的核心语义是长期责任，不是可完成工作。

因此单独建极简：

```yaml
responsibility_scope:
  id: ...
  title: ...
  status: ACTIVE | INACTIVE
  anchor: ...
```

它可以承载 Project Ownership 与长期聚合，但不拥有：

- COMPLETED；
- WAITING；
- Task Closure；
- Project KR；

等工作对象语义。

## 18. Primary Ownership 使用浅层受约束树

允许：

```text
ResponsibilityScope
    ↓
Project
    ↓
MiniProject
    ↓
Task
```

也允许：

```text
Project
    ↓
Task
```

约束：

- 一个对象最多一个 Primary Owner；
- 允许未归属；
- Project 不正式嵌套 Project；
- 不允许任意深度；
- 不允许循环；
- 不提供泛化 RELATED 来替代真正语义。

## 19. 删除泛化 RELATED

一条关系只有在能够回答以下问题时才进入 Kernel：

- 它表达什么正式语义？
- 对行为有什么影响？
- 有何约束？
- 如何 Undo？
- 在 UI 中为什么值得展示？

否则只是自然引用或 Evidence。

## 20. Signal：只是一张“线索收据”

Signal 不是 Task，也不是 Candidate。

最小结构：

```yaml
signal:
  id: ...
  source_identity: ...
  source_hash: ...
  captured_at: ...
  capture_reason: ...
  disposition: UNRESOLVED | ATTACHED | DISMISSED
```

它回答：

> 这里曾出现一个值得未来重新判断的线索。

不承担优先级、工作状态、Agent 记忆和任务身份。

## 21. Candidate 被删除

vNext 不再存在长期 Candidate Entity。

流程变成：

```text
Signal
→ Agent / Session 内部 Analysis Draft
→ NO_PROPOSAL
或
→ Formal Proposal
→ Commit
```

中间草稿属于执行过程，不需要成为新的业务实体。

## 22. ArtifactReference

Artifact 是工作形成或使用的重要成果引用，例如：

- 文档；
- 脚本；
- 配置；
- 报告；
- 表格；
- 文件夹；
- 外部 URL。

Task Copilot 不成为文件管理器。

Kernel 只保存轻量 `ArtifactReference`，可以关联 WorkObject 或 ResponsibilityScope。

## 23. DecisionRecord

重要、已确认决定使用独立最小记录：

```yaml
decision:
  id: ...
  statement: ...
  rationale: ...
  decided_at: ...
  evidence_refs: [...]
  superseded_by: ...
```

Decision 不是 Task。

---

# PART V：Intent 与对象粒度

## 24. Task Intent

Task 追求极低维护成本。

通常：

```text
title
```

就足够。

可选：

```text
desired_outcome
```

不要为普通 Task 强制建立 Objective、Scope、Completion Criteria 等重字段。

## 25. MiniProject Intent

MiniProject 表达几步内能够形成明确结果的工作单元。

建议正式 Intent：

```text
desired_outcome
completion_checks: 少量
```

内部 Task 可以继续使用 Logseq TODO 形式。

## 26. Project Intent：轻量 OKR-inspired，而不是 OKR 系统

Project：

```text
exactly one Objective
1–5 Key Results
optional Scope:
  included
  excluded
optional current_phase
current_focus
```

### Key Result

KR 是稳定结果判据，不是子任务。

它不拥有：

- 独立 lifecycle；
- 独立 owner；
- current_focus；
- 进度条。

项目进行中 KR satisfaction 属于 Projection。

项目关闭时，在 CompletionRecord 中记录最终判断：

```text
SATISFIED
WAIVED
NOT_MET
```

## 27. Project `current_phase`

不建设完整 Stage State Machine。

只保留可选、已确认的当前阶段标签：

```text
current_phase: 实施准备
```

详细阶段计划继续放在 Logseq 自然正文。

---

# PART VI：Logseq 的交互语义

## 28. Logseq TODO 不自动等于正式 Task

这条边界必须明确：

> **TODO 是写作形式；Task 是治理身份。**

只有真正需要：

- 独立 Lifecycle；
- Waiting；
- Now；
- 归属；
- 长期追踪；
- Audit；

的 TODO 才正式化为 WorkObject。

## 29. 正式 Task 的 Marker 是受控命令输入与投影

对已经正式化的 Task：

```text
TODO → DONE
```

可以解释为用户明确的完成命令。

但这不是简单字段双向同步。

流程应是：

```text
Graph Marker Change
→ 识别 Formal Task
→ Semantic Operation
→ Commit
→ Kernel Lifecycle
→ CompletionRecord
→ Projection Confirm
```

复杂、冲突或无法证明的变化暂停处理。

## 30. Formal Title 的权威

Kernel 保存正式 Title。

Primary Anchor 的可见标题既是：

- 用户自然编辑入口；
- Kernel Projection。

简单改名：

```text
用户编辑 Anchor Title
→ RENAME_WORK_OBJECT
```

Kind / 边界变化则不是 Rename，而需要更高层 Proposal。

Anchor 丢失时，Kernel Title 仍然存在。

## 31. 标题润色

标题润色由轻量 LLM / Agent 完成，但不阻塞用户。

流程：

```text
用户创建 / 修改标题
→ 先保存用户原文
→ deterministic heuristics 判断是否值得润色
→ 异步调用 title-polishing Skill
→ 建议更好的标题
→ 低风险治理 / 用户快速接受
```

不能：

- 创建时等待模型；
- 自动覆盖用户标题且无提示；
- 为标题润色建立专用写入路径。

正式修改仍通过 `RENAME_WORK_OBJECT`。

## 32. `CHANGE_WORK_KIND`

允许在保持 WorkObject ID 的前提下调整粒度。

### Task ↔ MiniProject

通常是低到中影响：

- ID 保持；
- Anchor 通常保持；
- Intent Schema 变化；
- Projection 厚度变化。

### MiniProject ↔ Project

属于高影响迁移：

- Project 必须 Page；
- Anchor 改变；
- Intent 变为 Objective/KR/Scope；
- Ownership 约束变化。

降级只有在不会静默丢语义时才允许。

---

# PART VII：Managed Projection

## 33. 正式事实以最小确定性摘要呈现在 Anchor 附近

不要把所有正式字段埋在 SQLite。

用户必须在 Logseq 工作现场看到足够的正式信息。

但也不能让 Plugin 接管正文。

因此使用：

> **最小 Managed Summary + 用户自然正文。**

## 34. Managed Summary 采用稳定身份 + 字段级子块

推荐结构：

```text
> [Task Copilot]
  - 当前推进：……
  - 等待：……
  - 目标：……
```

底层通过：

- Block UUID；
- 最小 properties / registry；
- field identity；

识别每个受管理投影。

不要把所有字段拼成一个巨大文本块后整体覆盖。

## 35. 投影厚度按 Kind 不同

### Task

通常一行或极少字段。

只有 WAITING / PARKED 等情况才额外展示条件。

### MiniProject

自动显示非空：

- desired outcome；
- completion checks；
- current focus；
- engagement 条件。

### Project

稳定紧凑展示：

- Objective；
- KR；
- Scope；
- current_phase；
- current_focus。

不显示大量空占位。

## 36. 用户可离线编辑 Managed Projection

Task Copilot 不要求用户永远只能通过 Plugin UI 编辑。

Plugin 重启后进行 Base–Graph–Kernel 三方对账：

```text
Graph only changed + low risk
→ 自动解释为 Command 并 Commit

Kernel only changed
→ 刷新 Graph

both changed
→ 显式冲突

Graph high-impact changed
→ Review
```

不得静默覆盖用户离线修改。

## 37. 自然工作正文不会直接改变正式语义

Managed Projection 外的记录，例如：

```text
今天和业务方聊了，可能下周上线。
```

属于 Source Observation / Evidence。

它可以：

- 让 Agent 重新分析；
- 使旧 Proposal 过期；
- 触发 Finding；
- 形成新 Proposal；

但不能直接把 Lifecycle / Engagement / Ownership 改掉。

---

# PART VIII：Now、Health 与 Cohort

## 38. Now 是 Projection，不是正式状态

Kernel 只保存最小 `AttentionIntent`。

Now 可以综合：

- ACTIONABLE；
- 用户显式 focus；
- Waiting review；
- Recovery；
- 少量可解释建议。

Agent 不能直接“编辑 Now”。

## 39. Health Finding 不成为长期业务实体

Health 是诊断结果，可重建。

系统可以保存最小处置收据，例如：

```text
SNOOZED
DISMISSED
HANDLED_BY_PROPOSAL
```

收据以稳定 fingerprint 关联 Finding。

真正修复后通过重新扫描消失，而不是把 Finding 改成 `RESOLVED` 并长期维护一套 Finding 生命周期。

## 40. Cohort 是动态集合定义，不是正式工作对象

例如：

```text
所有 WAITING 超过 14 天的 MiniProject
```

这是 Query / Analysis Scope。

某次 Agent Job 开始时冻结成员快照：

```text
member ids
object versions
context hashes
```

之后逐对象生成 Proposal。

不要为 Cohort 建长期 owner/status/lifecycle。

---

# PART IX：Agent 运行模型

## 41. AgentRunReceipt：Kernel 只保存运行收据

Kernel 不保存完整 Agent 心智历史。

最小收据记录：

- purpose；
- executor；
- contract version；
- Skill ID / version / hash；
- Context snapshot；
- proposal ids；
- NO_PROPOSAL；
- stale / unresolved；
- handoff status。

完整：

- tool calls；
- planning；
- checkpoints；
- chain-of-thought；
- 大量中间文件；

属于 Agent Runner。

## 42. Context 分三层

### Context Manifest

Kernel 长期保存的最小事实：

- objects / versions；
- source hashes；
- Skill hash；
- permission；
- export policy。

### Local Context Package

一次运行的冻结本地执行材料：

- 可过期；
- 可清理；
- 必要时 Pin。

### Remote Agent Export Package

经过限制 / 脱敏 / 授权后提供给远程 Agent。

不得把“本地 Agent 可以读”自动等价为“可以远程发送”。

## 43. 读取可以大，正式影响必须有限

用户明确希望更相信 Agent，特别是本地 Agent。

因此读取授权可以比较宽：

```text
current object
current Project
current ResponsibilityScope
all formal objects
full Graph
Graph + allowlisted local directories
```

但：

> **Broad Read Authorization ≠ Broad Formal Write Authority。**

## 44. Read Gateway：宽授权 + 按需读取

不要把整个 Graph 一次塞进上下文。

流程：

```text
small bootstrap context
→ agent search/list/read
→ actual reads become receipts
→ important sources freeze as Evidence
→ Proposal cites finite evidence
```

这样既允许 Agent 自由探索，又避免 Context 爆炸。

## 45. 可信本地 Agent 可以直接探索文件系统，但正式 Evidence 必须经过 Gateway 冻结

本地 Codex / Claude Code 可能已经拥有：

- Shell；
- 文件系统；
- Graph 文件；
- Git；

等能力。

vNext 不需要把 Agent 关进一个过度严格的认知沙箱。

允许：

```text
直接探索
→ 发现材料
```

但要进入正式 Proposal：

```text
发现材料
→ Read Gateway freeze/import
→ Evidence ID
→ Proposal reference
```

报告可以区分：

```text
Verified Findings
Exploratory Observations
```

Task Copilot 控制“什么能够影响事实”，而不是控制 Agent 的全部思考。

---

# PART X：Agent 报告、Skill 与反馈

## 46. Agent Report 不是 Kernel 业务实体

深度分析报告可以保存在：

- Markdown；
- Logseq Page；
- Agent Runner output；
- 其他文档。

有长期价值时，通过 `ArtifactReference` 与 `AgentRunReceipt` 关联。

报告中的一句：

```text
Project A 可能已经完成
```

不是正式事实。

只有独立 Proposal 经 Commit 后才改变 Kernel。

## 47. Skill 是独立、可读、版本化、使用后不可变的治理包

Skill 不再是代码里的大 Prompt。

建议：

```text
skills/
└── repair-mini-project/
    ├── 1.0.0/
    │   ├── manifest.yaml
    │   ├── policy.md
    │   ├── output.schema.json
    │   ├── examples/
    │   └── eval-cases/
```

Skill 定义：

- goal；
- stop conditions；
- context scope；
- evidence rules；
- allowed operations；
- forbidden actions；
- NO_PROPOSAL；
- output schema；
- evaluation criteria。

一旦被 Agent Run 使用，该版本冻结。

修改必须新建版本。

## 48. Skill Registry 只决定 Active Version

Kernel 可以保存：

```text
repair-mini-project → 1.2.0
title-polishing → 1.1.3
```

Agent 可以生成 Skill Candidate，但不能直接激活。

新版本应经过：

```text
static validation
→ eval cases
→ shadow
→ review
→ user activate
```

Skill 不能通过自然语言为自己创造新权限。

## 49. FeedbackEvent：用户纠偏不会立即改 Skill

有意义的用户反馈保存为最小结构化事件：

```text
ACCEPTED
MODIFIED
REJECTED
IGNORED
UNDONE_AFTER_APPLY
```

关联：

- Skill；
- AgentRun；
- Proposal；
- Operation；
- 用户原因。

Feedback 不会即时变成“自动学习”。

它进入周期性：

```text
Skill Review Package
→ stronger governance agent
→ Skill Candidate
→ eval/shadow
→ user activation
```

---

# PART XI：Built-in 与 External Agent

## 50. Built-in LLM 被降级为“薄 Agent Adapter”

vNext 可以保留内置智能，但它不是特权路径。

它必须与外部 Agent 使用同一套：

- Skill；
- Context；
- Proposal；
- Operation；
- Validator；
- Commit。

适合：

- 标题润色；
- 单对象轻量提问；
- current_focus 提炼；
- 小范围文本整理。

不适合：

- 跨对象治理；
- 历史重建；
- Cohort；
- 长时间搜索；
- 大范围文件探索。

删除 Built-in Adapter 后，Kernel 仍然完整成立。

## 51. Executor Routing 根据能力需求，不根据模型品牌

Skill 声明：

```text
SYNC / ASYNC
SINGLE_OBJECT / GLOBAL
BOUNDED / OPEN_ENDED
TOOL_USE
LARGE_CONTEXT
```

Executor Registry 将其映射到：

- Built-in；
- Codex；
- Claude Code；
- 其他 Agent。

用户通常看到：

```text
快速处理
深度处理
```

而不是每次先选模型。

不得静默跨越：

- local → remote；
- small read → full graph；
- no file → file content；
- sync → long background。

Run 创建后冻结 executor。

---

# PART XII：Agent Autonomy

## 52. 总原则：更多相信 Agent，但不把高风险判断外包

本轮设计明确调整为：

> **低风险治理默认由 Agent 主动处理，用户主要审阅异常、边界与结果，而不是逐项审批。**

安全机制是：

```text
Evidence
+ Operation Boundary
+ Validator
+ Precondition
+ Undo
+ Receipt
```

而不是“每一步都先问用户”。

## 53. Level 1：确定性直接执行

例如：

- 用户明确编辑 Managed Summary；
- 正式 Task TODO→DONE；
- Projection refresh；
- Proposal invalidation；
- Source hash refresh。

## 54. Level 2：Agent 主动治理

低风险、证据充分、可撤销的动作可以自动提交，例如：

- title polishing；
- current_focus；
- Evidence 增加；
- 明确 Signal attach；
- Waiting/Parking 文本说明更新；
- 小范围表达整理。

自动治理后以紧凑 Receipt 展示。

## 55. `ACTIONABLE ↔ WAITING`：可自动，但必须显著提示

现阶段允许 Agent 在证据明确时改变：

```text
ACTIONABLE ↔ WAITING
```

但不能安静埋在 Activity。

必须明显告诉用户：

- 什么变了；
- 为什么；
- 依据是什么；
- 如何 Undo。

未来若有 Webhook / Connector 提供更可靠外部事件，可进一步提高自动化。

## 56. `PARKED` 更谨慎

`WAITING` 表达外部条件未满足。

`PARKED` 表达用户主动决定暂时不投入。

因此：

```text
进入 PARKED
离开 PARKED
```

默认需要用户确认。

Agent 可以准备理由和 review_at，但不能替用户静默做投入决策。

## 57. Agent 不能自动完成 Task

这一点是用户主动收尾权的明确保留。

即使 Agent 有非常强证据：

```text
Task 看起来已经完成
```

也只能：

- 提醒；
- 准备 Completion；
- 放进“需要我判断”。

用户必须通过：

- TODO→DONE；
- 点击完成；
- 明确批量完成确认；

主动完成。

MiniProject / Project 更不自动完成。

## 58. Agent 不自主取消或 Reopen

同理：

```text
CANCEL
REOPEN
```

必须用户明确决定。

---

# PART XIII：Closure

## 59. CompletionRecord

WorkObject 本体只保存：

```text
lifecycle = COMPLETED
```

完成时原子生成最小 `CompletionRecord`。

普通 Task：

- 用户一次明确完成动作即可；
- outcome 可以自动准备；
- 有必要时才补充 Artifact / Evidence / 遗留。

丰富 Closure Dossier 是可重建投影，不作为巨大 Aggregate。

## 60. CancellationRecord

取消和完成语义不同，因此使用独立最小记录。

回答：

- 为什么不再继续；
- 是否有替代对象；
- 有哪些已有成果或遗留。

Task 可以很轻；Project 必须更完整。

Agent 可准备，用户确认。

## 61. 父对象不能在保留 OPEN 正式子对象的情况下关闭

关闭 Project / MiniProject 前，所有 OPEN 子对象必须在同一个原子计划中：

```text
complete
cancel
move
detach
```

之一。

禁止 cascade complete。

## 62. Closure Amendment 与 Reopen

CompletionRecord / CancellationRecord 不原地覆盖。

### 内容修正

```text
Closure Amendment
```

保留原判断与修订历史。

### 终态判断错误

```text
REOPEN_WORK_OBJECT
→ ReopenRecord
```

原 Completion/Cancellation 历史继续存在。

Agent 不能自行 Amendment / Reopen。

---

# PART XIV：Proposal Contract

## 63. Proposal 不是任意 JSON Patch

使用统一 Proposal Envelope + 少量 Semantic Operation。

不允许：

```text
PATCH object
arbitrary JSON
direct CRUD
```

因为 Agent 不应该了解内部表结构，也不应获得任意字段写入能力。

## 64. Proposal Status

不保存持久 `ACCEPTED`。

建议状态：

```text
OPEN
APPLIED
DISMISSED
INVALIDATED
```

“用户刚刚确认”只是 UI 交互瞬时，不需要长期状态。

提交失败属于 Commit / Recovery，而不是 Proposal 状态。

## 65. 一份 Proposal = 一个原子语义决定

Proposal 内可以有多个 Operation，但它们必须共同表达一个完整判断。

例如：

```text
ACTIONABLE → WAITING
+ WaitingCondition
+ current_focus adjustment
```

Commit 必须整体成功或整体失败。

不再支持通用：

```text
勾掉 op2
勾掉 op4
提交剩余碎片
```

## 66. 用户修改 Proposal 形成新 Revision

如果用户不认可原方案的一部分：

```text
Revision 1
→ user edit
→ Revision 2
```

Revision 2 重新计算：

- impact；
- risk；
- evidence；
- preconditions；
- undo；
- scope。

最终 Commit 当前 Revision。

## 67. 一次 Agent Run 可以产生很多独立 Proposal

批量分析时：

```text
Agent Run
├─ Proposal A
├─ Proposal B
├─ Proposal C
└─ NO_PROPOSAL for others
```

低风险 Proposal 可以自动提交；高风险进入“需要我判断”。

不要制造巨型全局 Proposal。

---

# PART XV：Proposal Staleness 与 Evidence

## 68. Proposal Revision 只绑定真正依赖的事实

包括：

```text
target object versions
evidence fragment hashes
skill version/hash
operation contract version
```

## 69. 失效规则

### 目标正式事实改变

```text
INVALIDATED: TARGET_VERSION_CHANGED
```

### Evidence 内容改变

```text
INVALIDATED: EVIDENCE_CHANGED
```

### Evidence 仅移动但内容不变

更新 Locator，不必失效。

### 无关材料变化

不影响 Proposal。

## 70. 新的直接相关材料出现

即使旧 Evidence 没变，如果目标对象出现新的关联 Evidence / Signal：

```text
禁止旧 Proposal 自动提交
→ 快速 Revalidate
```

可产生：

- 新 Revision；
- 新 Proposal；
- NO_PROPOSAL。

---

# PART XVI：Kernel Service

## 71. Local Kernel Service 是唯一正式写权威

总体架构：

```text
Logseq Plugin ───────┐
CLI ─────────────────┤
Built-in Agent ──────┤
MCP Adapter ─────────┼── Local Kernel API ── Local Kernel Service
Future Connector ───┘                         ├─ Domain
External Agent ─MCP───────────────────────────├─ Validator
                                              ├─ Commit Engine
                                              ├─ Current State
                                              └─ Commit Ledger
```

Plugin 不拥有另一套 Domain。

CLI 不直接操作 SQLite。

Agent 不直接写 Graph。

## 72. Kernel 边界：窄，但完整

Kernel 只保存：

- 已确认正式事实；
- 稳定身份；
- Evidence identity；
- 正式关系；
- Lifecycle / Engagement；
- Closure；
- 事务；
- 权限与版本。

不保存：

- 长篇进度总结；
- Agent 报告正文；
- Cohort 业务对象；
- Health Finding 生命周期；
- 模型思考过程；
- 全量 Context；
- 第二套项目文档。

---

# PART XVII：Persistence

## 73. SQLite Current State + Append-only Commit Ledger

不采用完整 Event Sourcing。

### Current State

回答：

> 现在系统正式认可什么？

### Commit Ledger

回答：

> 正式发生过什么？

### Audit Projection

回答：

> 用户怎样理解这些变化？

### Undo / Recovery

回答：

> 怎样安全纠正？

## 74. Undo 是补偿 Commit

不删除旧事务，也不强制数据库回滚到历史快照。

例如：

```text
Commit 202:
ACTIONABLE → WAITING

Commit 209:
Undo Commit 202
WAITING → ACTIONABLE
```

历史保持真实。

---

# PART XVIII：SQLite 与 Graph 的跨介质事务

## 75. 正式事务状态机

推荐：

```text
VALIDATE
→ PREPARE
→ KERNEL_APPLY
→ GRAPH_APPLY
→ VERIFY
→ COMMIT
```

Kernel 先持久化事务意图，因此任何崩溃都有明确身份。

## 76. PREPARE

检查：

- target versions；
- evidence hashes；
- domain invariants；
- graph anchor；
- graph expected hash；
- undo plan；
- conflicting pending commit。

然后 Ledger 写：

```text
PREPARED
```

## 77. KERNEL_APPLY

在本地 SQLite 事务内应用：

- WorkObject changes；
- Closure；
- relations；
- ledger state。

进入：

```text
KERNEL_APPLIED
```

## 78. GRAPH_APPLY

Graph Adapter 接收确定性 Effect Plan：

```yaml
effect:
  target:
    block_uuid: ...
  expected:
    marker: TODO
    projection_hash: ...
  mutation:
    marker: DONE
```

Plugin 不自行推断 Domain。

## 79. VERIFY / COMMIT

只有 Kernel 与 Graph 均满足期望才宣布：

```text
COMMITTED
```

如果 Graph 被用户中途修改：

```text
RECOVERY_REQUIRED
```

绝不覆盖用户正文。

## 80. Recovery 的用户语言

正常事务内部状态不暴露。

只有真正无法自动续跑时显示：

> 一次正式修改没有完整完成，系统没有把它当成成功。请查看差异并选择恢复方式。

用户不需要理解 WAL、事务日志或内部 stage。

---

# PART XIX：Local API / CLI / MCP

## 81. Kernel API 与 Agent Protocol 解耦

基础接口采用：

```text
localhost-only HTTP/JSON
+ minimal event channel
```

仅监听：

```text
127.0.0.1
```

不监听公网。

## 82. Localhost 仍需认证

使用随机 Capability Token，例如：

```text
~/.task-copilot/kernel.json
```

包含：

- port；
- instance_id；
- token。

网络认证与领域权限分开。

## 83. 第一版 Capability 保持少量

例如：

```text
READ_FORMAL_STATE
READ_GRAPH
SUBMIT_PROPOSAL
COMMIT_USER_COMMAND
EXECUTE_GRAPH_EFFECT
ADMIN_RECOVERY
```

不要建设企业 RBAC。

## 84. CLI 是参考客户端

CLI 不拥有独立 Domain。

它是：

- Kernel API 的最清楚客户端；
- Codex 开发时的验证工具；
- 故障注入入口；
- Agent Integration Bootstrap。

## 85. MCP 是 Adapter

```text
External Agent
→ MCP Adapter
→ Local Kernel API
```

MCP 暴露适合 Agent 的工具：

- search；
- read；
- freeze evidence；
- submit proposal；
- request context。

不暴露内部任意 DB 修改。

---

# PART XX：第一版 Operation Registry

## 86. 小而完整

第一版只实现黄金链真正需要的约 12–16 个 Operation。

建议起始集合：

```text
CREATE_WORK_OBJECT
RENAME_WORK_OBJECT
CHANGE_WORK_KIND

SET_CURRENT_FOCUS
CHANGE_ENGAGEMENT
SET_WAITING_CONDITION
SET_PARKING_NOTE

CHANGE_PRIMARY_OWNER
SET_PRIMARY_ANCHOR
ADD_EVIDENCE_REFERENCE
REMOVE_EVIDENCE_REFERENCE

UPDATE_WORK_INTENT

COMPLETE_WORK_OBJECT
CANCEL_WORK_OBJECT
REOPEN_WORK_OBJECT
AMEND_CLOSURE
```

最终可根据实现验证微调，但不得为了“以后可能需要”提前扩张。

## 87. Operation 存在 ≠ Agent 有权限

例如：

```text
COMPLETE_WORK_OBJECT
```

必须存在，因为用户要完成 Task。

但 Agent Policy 明确禁止 Agent 自主调用完成。

权限由：

```text
Actor
+ Skill
+ Operation
+ Risk
+ Autonomy Policy
```

共同决定。

---

# PART XXI：vNext UI

## 88. 一级入口只有四个

```text
现在
需要我判断
项目
更多
```

## 89. 「现在」

回答：

> 我现在应该推进什么？

它是 Projection，不是管理后台。

显示：

- actionable work；
- attention intent；
- review due；
- 少量重要 Agent 变更；
- 明确 Recovery。

不显示全部 Agent 日志。

## 90. 「需要我判断」

这是非常重要的产品转变。

它不是：

> Agent 做了 30 个 Proposal，请审批。

而是：

> 只有这些东西 Agent 不应该替你决定。

典型：

- PARKED；
- 完成；
- 取消；
- Reopen；
- Project Intent；
- 高影响 Ownership；
- 高影响 Kind Change；
- 冲突；
- Recovery；
- 证据无法决定的关键边界。

## 91. 「项目」

稳定重入工作面：

- Objective；
- KR；
- Scope；
- phase；
- current_focus；
- active child work；
- Waiting；
- recent Evidence；
- Artifact；
- Decision；
- Activity。

保持高信息密度，但不变成项目管理 SaaS。

## 92. 「更多」

低频：

- Activity；
- Recovery；
- Agent Runs；
- Skills；
- Responsibility Scopes；
- Settings；
- Diagnostics。

部分第一版甚至可以只有 CLI。

## 93. Logseq 本身就是 Capture Surface

不建立重量级 Capture 页面。

用户继续在 Logseq 里自然写。

Task Copilot 提供：

```text
正式化
让 Agent 看一下
```

等轻量入口。

---

# PART XXII：Agent 自动治理的可见性

## 94. 默认不是“事前审批”，而是“事后高质量收据”

例如：

```text
Agent 已自动整理 14 项

current_focus 更新      5
Evidence 增加           4
标题优化                3
Waiting 条件说明         2

需要你判断              2
NO_PROPOSAL             6
```

用户可以：

- 查看；
- Undo；
- 修改；
- 反馈。

## 95. 某些自动变化必须显著提示

尤其：

```text
ACTIONABLE ↔ WAITING
```

因为它影响 Now 与用户行动理解。

不能只埋在批次收据。

---

# PART XXIII：vNext 的历史策略

## 96. 新 Kernel 从干净状态开始

不要求迁移旧 SQLite Domain。

旧 Graph：

- 是用户资料；
- 继续保留；
- vNext 可按正常自然正式化能力重新理解。

旧 SQLite：

- 可以保留备份；
- 不作为 vNext 依赖；
- 不为它建立复杂迁移框架。

## 97. 不专门建设“旧系统迁移产品”

如果未来存在：

```text
bootstrap-existing-work
```

它应该是普适的“从已有自然材料正式化工作”的能力，而不是为 V1 服务的迁移器。

---

# PART XXIV：vNext MVP

## 98. MVP 的判定方式

不看：

- 页面数量；
- 表数量；
- API 数量；
- Operation 数量。

看：

> **6 条黄金链 + 4 条故障链是否真实、可信、可重复地跑通。**

## 99. 黄金链 1：自然记录 → 正式 Task

```text
Logseq Natural Record
→ Evidence
→ CREATE_WORK_OBJECT
→ Semantic Commit
→ Kernel WorkObject
→ Anchor / Projection
→ Audit
```

必须保证原文不被破坏。

## 100. 黄金链 2：自然推进 → Agent 维护 current_focus

```text
new note
→ Agent read
→ freeze evidence
→ SET_CURRENT_FOCUS
→ auto apply
→ receipt / undo
```

验证 Agent 是否减少治理劳动。

## 101. 黄金链 3：ACTIONABLE ↔ WAITING

```text
new evidence
→ agent reasoning
→ engagement proposal
→ commit
→ prominent notification
→ Now changes
```

验证状态治理与可见性。

## 102. 黄金链 4：用户主动完成 Task

```text
TODO → DONE
→ COMPLETE_WORK_OBJECT
→ CompletionRecord
→ cross-medium commit
→ audit
→ undo
```

必须证明 Agent 不能绕过用户主动收尾。

## 103. 黄金链 5：External Agent 深度治理

```text
Agent Run
→ Skill
→ broad Read Gateway
→ evidence freeze
→ multiple atomic proposals / NO_PROPOSAL
→ low-risk auto governance
→ high-risk user judgment
→ receipts
```

验证外部 Agent 真正是可替换认知层。

## 104. 黄金链 6：Project 重入

隔一段时间后进入 Project，用户无需先读大量历史就能回答：

- 目标是什么；
- 当前阶段；
- current_focus；
- active children；
- Waiting；
- recent changes；
- Artifact；
- Decision；
- 下一步。

---

# PART XXV：4 条故障链

## 105. Evidence Change

Proposal 生成后 Evidence 变化：

```text
INVALIDATE / REVALIDATE
```

不能继续自动 Commit。

## 106. Kernel Applied / Graph Failed

模拟 Graph Adapter Failure。

系统重启后必须：

```text
发现未完成 Ledger
→ 确定性续跑
或
→ RECOVERY_REQUIRED
```

不能显示成功。

## 107. Graph Mid-Commit User Edit

用户在事务期间修改 Graph：

```text
expected hash != actual
→ 不覆盖
→ Recovery
```

## 108. Undo Agent Governance

Agent 自动把 ACTIONABLE→WAITING 后用户撤销：

```text
compensation commit
→ formal state restored
→ graph restored
→ ledger preserved
→ FeedbackEvent
```

---

# PART XXVI：明确非目标

第一版不要求：

- Webhook / Email / Calendar Connector；
- 完整 MCP 生态；
- 多模型智能路由；
- Skill 管理后台；
- 完整 Cohort 产品；
- 复杂 Health Dashboard；
- V1 数据迁移；
- 自动 Project Closure；
- 企业级 RBAC；
- Cloud Sync；
- Mobile；
- 完整 Artifact Manager；
- 高级 OKR；
- 全部未来 Operation；
- 完整 Event Sourcing；
- 第二套 Chat 工作区；
- Agent 的长期思考数据库。

---

# PART XXVII：复杂度护栏

## 109. 每新增一个抽象都必须回答

> **它是哪一条黄金链或故障链真正需要的？**

如果答案只是：

```text
以后可能有用
架构更完整
看起来更通用
方便未来扩展
```

第一版拒绝。

## 110. 不用领域实体解决 UI 问题

不要因为 UI 想展示：

```text
待处理
分析中
已读
已展开
```

就新增 Kernel 状态。

优先：

- Projection；
- local UI state；
- Receipt；
- query。

## 111. 不用 Agent 自由度解决 API 设计问题

Agent 不需要：

```text
generic update
delete arbitrary object
edit raw graph
direct sqlite
```

它需要：

- broad read；
- clear evidence；
- small semantic operation surface；
- fast feedback；
- good receipts。

## 112. 不用“人工审批一切”解决模型风险

vNext 选择的是：

```text
高影响：事前阻止
低影响：自动治理 + 可见 + Undo
```

而不是把用户变成每条 Proposal 的审批员。

---

# PART XXVIII：最终架构图

```text
                         ┌─────────────────────┐
                         │     Logseq Graph     │
                         │ Natural Workspace    │
                         └──────────┬───────────┘
                                    │
                              Graph Adapter
                                    │
                         ┌──────────▼───────────┐
                         │    Logseq Plugin      │
                         │ Now / Judgment /      │
                         │ Projects / More       │
                         └──────────┬───────────┘
                                    │
                           localhost HTTP/JSON
                                    │
┌───────────────────────────────────▼──────────────────────────────────┐
│                       Local Kernel Service                          │
│                                                                     │
│  Domain / WorkObject / Intent / Ownership                           │
│  Evidence / Artifact / Decision / Closure                           │
│  Proposal Validator / Operation Registry / Autonomy Policy          │
│  Semantic Commit / Undo / Recovery                                  │
│  Skill Registry / Context Manifest / AgentRunReceipt                 │
│                                                                     │
│  ┌───────────────────────┐       ┌───────────────────────────────┐  │
│  │ SQLite Current State  │       │ Append-only Commit Ledger     │  │
│  └───────────────────────┘       └───────────────────────────────┘  │
└───────────────┬───────────────────┬───────────────────┬─────────────┘
                │                   │                   │
               CLI           Built-in Adapter      MCP Adapter
                │                                       │
                │                                External Agents
                │                               Codex / Claude / ...
                │
         Reference Client

External / Built-in Agent:
Read widely → reason → freeze finite Evidence → Proposal / NO_PROPOSAL
                                             ↓
                                     Validator / Policy
                                             ↓
                               Semantic Commit / User Judgment
```

---

# PART XXIX：最终产品判断

Task Copilot vNext 的成功，不是：

> “AI 帮我自动管理了一切。”

也不是：

> “所有动作都非常安全，因为每一步都问我。”

而是：

> **我继续自然地在 Logseq 中工作；系统和 Agent 默默承担大部分整理、识别、对账和低风险治理；真正涉及我的投入、工作结束、项目边界和关键承诺时，系统把少量高信息密度的问题交给我；任何正式改变都可解释、可撤销、可恢复。**

这就是 vNext 的设计中心。
