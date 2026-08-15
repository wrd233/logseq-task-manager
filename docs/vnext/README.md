# Task Copilot vNext 设计与实施文档集

> 版本：Design Freeze / vNext Implementation Start  
> 日期：2026-08-12  
> 状态：高层架构与产品基线已完成 Grill，进入实施阶段  
> 适用仓库：`wrd233/logseq-task-manager`

---

## 0. 这组文档解决什么问题

这组文档把本轮围绕 Task Copilot vNext 的连续设计讨论冻结下来。它不是把旧设计重新抄一遍，而是明确记录：

1. 哪些旧假设继续成立；
2. 哪些旧设计被推翻、收窄或重新分层；
3. 外部 Agent 接入后，Task Copilot 本身究竟应该保留什么；
4. 哪些东西属于 Kernel 的正式事实，哪些属于 Agent 的认知产物；
5. Logseq、SQLite、Local Kernel Service、Plugin、CLI、MCP、Built-in Agent 与 External Agent 如何协作；
6. 哪些正式变化可以由 Agent 主动治理，哪些必须由用户亲自完成；
7. Commit / Undo / Recovery 如何在 SQLite 与 Logseq Graph 之间保持可信；
8. vNext 第一版应该做什么，以及更重要的——明确不做什么；
9. 如何把这些结论落实为仓库重构和 Codex 的可执行 Goal。

本轮设计的核心转变可以压缩为一句话：

> **Task Copilot 不再是“带 AI 的 Logseq 任务插件”，而是一个本地优先、拥有唯一正式写入权威的个人工作内核；Logseq 是自然工作现场，Agent 是可替换的认知执行器，正式事实只能通过受控语义事务改变。**

---

## 1. 文档清单

### 01 — Architecture & Product Baseline

文件：`01-Task-Copilot-vNext-Architecture-Product-Baseline.md`

这是最重要的设计基线。它从“项目为何存在”开始，系统性描述：

- 北极星与产品承诺；
- 信息分层与权威边界；
- WorkObject / ResponsibilityScope / Signal / Evidence / Artifact / Decision；
- Lifecycle / Engagement / Waiting / Parking；
- Project Intent、Objective、KR、Scope；
- Logseq Anchor 与 Managed Projection；
- Agent / Skill / Context / Read Gateway；
- Proposal / Operation / Revision / Commit；
- Agent Autonomy 与用户保留判断权；
- Completion / Cancellation / Amendment / Reopen；
- Local Kernel Service；
- SQLite Current State + Commit Ledger；
- Graph 跨介质事务；
- Local API、CLI 与 MCP；
- vNext UI；
- vNext MVP 的黄金链与故障链；
- 明确的非目标。

建议把它作为后续所有实现讨论的“宪法”。

### 02 — Repository Refactor & Implementation Blueprint

文件：`02-Task-Copilot-vNext-Repository-Refactor-Implementation-Blueprint.md`

这是从设计到工程的桥梁，重点回答：

- 旧系统哪些部分应直接删除；
- 什么情况下可以选择性移植旧实现；
- 新仓库目录与模块边界；
- Kernel、Domain、Store、Ledger、Graph Adapter、API、CLI、Plugin、Agent Adapter 如何依赖；
- 第一版 Operation Registry；
- Schema、事务、恢复、测试如何落地；
- 开发顺序如何保持纵向闭环，而不是横向平台化；
- 每个阶段的 Exit Criteria；
- 如何防止 vNext 再次复杂度膨胀。

### 03 — Codex Implementation Goal

文件：`03-Task-Copilot-vNext-Codex-Implementation-Goal.md`

这是一份可以直接交给 Codex 的实施 Goal。它不是要求 Codex 一次性实现完整 vNext，而是要求：

- 先调查当前仓库；
- 高破坏性清理旧架构；
- 建立 vNext 骨架；
- 严格按架构依赖方向施工；
- 以第一条纵向黄金链为首要目标；
- 通过 CLI 与自动化测试验证 Kernel；
- 再逐步接入 Logseq Plugin 和 Agent；
- 每个新增抽象都必须证明是黄金链或故障链真正需要的；
- 不因兼容 V1 制造长期复杂度。

### 04 — Decision Register 1–67

文件：`04-Task-Copilot-vNext-Decision-Register-1-67.md`

这是完整决策登记册，逐项记录本轮 67 个已锁定结论，包括：

- 决策内容；
- 决策原因；
- 对实现的约束；
- 被明确放弃的替代路线。

如果未来某个实现选择与本轮讨论发生冲突，应先查这份决策登记册，而不是凭印象解释。

---

## 2. 建议阅读顺序

如果是新 Session / 新 Agent 接手：

```text
01 Architecture & Product Baseline
        ↓
04 Decision Register
        ↓
02 Repository Refactor & Implementation Blueprint
        ↓
03 Codex Implementation Goal
```

如果是开发者准备开工：

```text
02 Implementation Blueprint
        ↓
03 Codex Goal
        ↓
遇到语义分歧时回查 01 / 04
```

---

## 3. 文档优先级

若四份文档出现理解差异，优先级如下：

1. **01 Architecture & Product Baseline**：当前总体设计真相；
2. **04 Decision Register**：具体问题的已锁定决策；
3. **02 Implementation Blueprint**：工程落地建议；
4. **03 Codex Implementation Goal**：某一阶段实施任务说明。

代码当前状态不自动高于设计基线。vNext 明确允许高破坏性重构，因此“旧代码现在这么做”不能作为保留旧结构的充分理由。

---

## 4. 历史文档如何看待

旧文档仍然非常有价值，特别是其中关于：

- 自然记录优先；
- 行动连续性；
- 对象腐化；
- 工作不能在完成后清零；
- Graph / SQLite 权威边界；
- Proposal-only；
- Commit / Undo / Recovery；
- 外部 Agent 与内置 LLM 分工；
- Skill 作为治理政策；

这些高层思想继续构成 vNext 的来源。

但旧文档中的某些具体实体、状态和工作流已经被本轮讨论有意推翻，例如：

- Candidate 不再是正式实体；
- Health Finding 不再是长期业务实体；
- Cohort 不再是正式业务对象；
- Proposal 不再支持任意部分提交；
- 旧 Session / Prompt 体系不再作为 Kernel 中心；
- Status 被拆成 Lifecycle 与 Engagement；
- vNext 不承担 V1 数据兼容义务；
- Local Kernel Service 被正式确立为唯一写权威。

因此，应当吸收旧设计的“安全知识与高层原则”，而不是复制旧实现形状。

---

## 5. 当前状态

本轮 Grill 已结束。

接下来不应继续无限扩展高层设计，而应正式切换到：

> **Design Freeze → Repository Refactor → Kernel Skeleton → First Vertical Slice → Golden Paths**

任何新想法先问：

> 它是否是当前 6 条黄金链或 4 条故障链真正需要的？

若答案只是“未来也许有用”，则第一版不做。

---

## 6. 实验经验（non-authoritative reference）

以下两份文档是 Object Lens / Logseq CDP 实验的**经验记录**，不是设计基线，也不是 UI 规范：

- [`../experience/LOGSEQ_CDP_EXPERIENCE.md`](../experience/LOGSEQ_CDP_EXPERIENCE.md)：真实 Logseq Desktop / CDP 操作、验证与恢复经验；
- [`../experience/OBJECT_LENS_UI_EXPERIENCE.md`](../experience/OBJECT_LENS_UI_EXPERIENCE.md)：Object Lens UI 原型实验经验，以及“不应机械继承”的清单。

它们不冻结未来 UI 形态；若与权威设计文档冲突，以第 3 节的文档优先级为准。
