# Task Copilot vNext · Decision Register 1–67

> **STATUS: HISTORICAL / SUPERSEDED by `05-Task-Copilot-vNext-产品与治理宪章.md` (2026-08-15). Keep for archaeology only; do not treat as current truth.**

> 文档类型：已锁定设计决策登记册  
> 目的：记录本轮 Grill 的全部关键结论，防止实现阶段重新回到模糊讨论  
> 规则：实现若与本登记册冲突，应显式提出 ADR，而不是静默偏离

---

# 使用方式

每条记录包含：

- **已锁定决策**：本轮讨论最终选择；
- **为什么**：背后的高层理由；
- **实施含义**：对代码、UI、Agent 或数据模型的直接约束。

这些决策不是要求一次性全部实现。它们定义的是边界；第一版实现范围仍由黄金链决定。

---

## 决策 01

**已锁定决策**

允许高破坏性重构，不承担旧数据/API/UI/Prompt/状态机的兼容义务。

**为什么**

vNext 的正确边界高于历史连续性；兼容若要求新架构迁就旧模型，则放弃。

**实施含义**

旧实现可删除；新 Schema 可重建；不得因为 V1 存在而扭曲 Domain。

---

## 决策 02

**已锁定决策**

主仓库积极清仓，main 只表达当前真相。

**为什么**

Git history 已承担档案作用，长期 legacy 目录只会增加认知与构建成本。

**实施含义**

旧目录、旧实验与废弃入口不保留为长期代码。

---

## 决策 03

**已锁定决策**

Capability Lab 与 V1 可直接删除，只在确有价值时保留极小 SDK probe / 一次性工具。

**为什么**

实验性结构不应成为产品架构依赖。

**实施含义**

不做 Lab 长期兼容层。

---

## 决策 04

**已锁定决策**

采用干净 vNext 纵向架构，选择性移植已验证的安全知识与孤立实现。

**为什么**

避免“重写一切”丢失工程经验，也避免“保留一切”继续双轨。

**实施含义**

移植以契约和测试为准，不以旧模块边界为准。

---

## 决策 05

**已锁定决策**

Kernel 是“窄但完整的正式工作事实内核”。

**为什么**

Now、Health、Cohort、长摘要等大多可投影，Kernel 只承担必须稳定、审计、事务化的事实。

**实施含义**

拒绝把所有产品概念永久化为业务实体。

---

## 决策 06

**已锁定决策**

Task / MiniProject / Project 统一为 WorkObject，kind 为正式字段。

**为什么**

三者共享身份、来源、事务、生命周期；差异主要是治理政策与 Intent。

**实施含义**

一套 Store、一套 Commit、一套 Proposal，不建三套仓库。

---

## 决策 07

**已锁定决策**

Lifecycle 与 Engagement 拆分：OPEN/COMPLETED/CANCELLED；ACTIONABLE/WAITING/PARKED/null。

**为什么**

结束状态与当前投入状态是两个独立维度。

**实施含义**

删除 ACTIVE/INBOX 等混合状态语义。

---

## 决策 08

**已锁定决策**

Kernel 只保存最小 confirmed current_focus，不保存完整动态进度叙事。

**为什么**

长进度可以从 Evidence/Activity 重建，长期维护会腐化。

**实施含义**

Task 可无 current_focus，Project/MiniProject 更常有。

---

## 决策 09

**已锁定决策**

WorkObject 有独立稳定 ID；最多一个 Primary Anchor，可有多个 Evidence。

**为什么**

对象身份不应绑死在某个 Logseq Block。

**实施含义**

Anchor 移动/重建不改变 WorkObject ID。

---

## 决策 10

**已锁定决策**

Area 不属于 WorkObject，建极简 ResponsibilityScope。

**为什么**

Area 是长期责任，不以 DONE 为目标。

**实施含义**

Area 只承担 ACTIVE/INACTIVE、Anchor、Project Ownership 等。

---

## 决策 11

**已锁定决策**

Primary Ownership 是浅层受约束树。

**为什么**

减少任意图关系带来的治理复杂度。

**实施含义**

Scope→Project；Project→MiniProject/Task；MiniProject→Task；单一 primary owner；允许未归属。

---

## 决策 12

**已锁定决策**

删除泛化 RELATED，只允许有明确语义的 typed relation。

**为什么**

泛关系会成为不可解释垃圾桶。

**实施含义**

每种正式关系必须有行为、约束、UI 价值与 Undo 语义。

---

## 决策 13

**已锁定决策**

Signal 是最小线索收据，不是 Task/优先级/Agent Memory。

**为什么**

保留未来重新判断价值，而不提前正式化。

**实施含义**

UNRESOLVED/ATTACHED/DISMISSED + source identity/hash/reason。

---

## 决策 14

**已锁定决策**

删除长期 Candidate Entity。

**为什么**

Candidate 只是一次分析过程中的临时概念。

**实施含义**

Signal→Analysis Draft→NO_PROPOSAL 或 Proposal。

---

## 决策 15

**已锁定决策**

Proposal 不保存长期 ACCEPTED；状态收敛为 OPEN/APPLIED/DISMISSED/INVALIDATED。

**为什么**

用户确认是瞬时交互，提交失败属于 Commit/Recovery。

**实施含义**

减少 Proposal 状态机。

---

## 决策 16

**已锁定决策**

使用统一 Proposal Envelope + 少量稳定 Semantic Operation。

**为什么**

Agent 不应依赖内部表结构或 arbitrary patch。

**实施含义**

禁止裸 CRUD/JSON Patch。

---

## 决策 17

**已锁定决策**

Artifact 是独立最小 ArtifactReference。

**为什么**

保留成果引用价值，不把 Task Copilot 变成文件管理器。

**实施含义**

可关联 WorkObject/Scope；正文仍在原文件。

---

## 决策 18

**已锁定决策**

Decision 使用最小 confirmed DecisionRecord。

**为什么**

重要决定不是 Task，但需要被长期追溯。

**实施含义**

statement/rationale/decided_at/evidence/superseded_by。

---

## 决策 19

**已锁定决策**

WorkObject 只保存 lifecycle；完成原子创建 CompletionRecord；丰富 Closure Dossier 可重建。

**为什么**

避免 Closure Aggregate 膨胀，同时保留工作结算。

**实施含义**

CompletionRecord 是最小正式结算事实。

---

## 决策 20

**已锁定决策**

父 WorkObject 关闭时不能保留 OPEN 正式子对象。

**为什么**

关闭父对象后仍有开放正式子工作会制造语义矛盾。

**实施含义**

子对象必须 complete/cancel/move/detach；不 cascade complete。

---

## 决策 21

**已锁定决策**

Intent 按 kind 分层：Task 极轻，MiniProject 有 desired outcome/checks，Project 用 Objective+1–5 KR+可选 Scope。

**为什么**

不同粒度需要不同治理成本。

**实施含义**

不建完整 OKR 系统。

---

## 决策 22

**已锁定决策**

KR 是稳定结果判据，不是 WorkObject。

**为什么**

KR 不应拥有任务状态、owner、focus。

**实施含义**

Project closure 时记录 SATISFIED/WAIVED/NOT_MET。

---

## 决策 23

**已锁定决策**

Project 只保留可选 confirmed current_phase，不建完整 Stage State Machine。

**为什么**

阶段计划更适合自然文本。

**实施含义**

避免阶段映射与状态机复杂化。

---

## 决策 24

**已锁定决策**

Logseq TODO 不自动等于 Formal Task。

**为什么**

TODO 是写作形式，Task 是治理身份。

**实施含义**

只有需要独立治理的 TODO 才正式化。

---

## 决策 25

**已锁定决策**

正式 Task 的 TODO/DONE Marker 是受控自然命令输入 + Projection，不是字段双向同步。

**为什么**

保留 Logseq 习惯，同时保证正式语义通过 Kernel。

**实施含义**

简单低风险自动 Commit；冲突/复杂变化暂停。

---

## 决策 26

**已锁定决策**

Now 是 Projection；Kernel 仅存最小 AttentionIntent。

**为什么**

Now 是多信号结果，不应成为额外 status。

**实施含义**

Agent 不能直接编辑 Now。

---

## 决策 27

**已锁定决策**

WAITING 必须带最小 WaitingCondition。

**为什么**

Waiting 必须回答在等什么。

**实施含义**

description/since/optional review_at/evidence；不做 trigger DSL。

---

## 决策 28

**已锁定决策**

PARKED 带最小 ParkingNote。

**为什么**

PARKED 是用户主动延后，需要原因与可选复查。

**实施含义**

与 WAITING 明确区分。

---

## 决策 29

**已锁定决策**

Kernel 保存 Formal Title；Primary Anchor 的标题是输入/投影。

**为什么**

对象 Title 不能因 Anchor 丢失而消失。

**实施含义**

简单编辑走 RENAME_WORK_OBJECT。

---

## 决策 30

**已锁定决策**

标题润色采用异步、条件触发、低打扰 Agent 建议。

**为什么**

不阻塞创建，也不自动覆盖。

**实施含义**

使用统一 RENAME_WORK_OBJECT，不建专用写路径。

---

## 决策 31

**已锁定决策**

允许 CHANGE_WORK_KIND 且保持 object ID。

**为什么**

粒度会随理解变化，不应重建身份。

**实施含义**

Task↔MiniProject 简化；MiniProject↔Project 高影响迁移；降级不得静默丢语义。

---

## 决策 32

**已锁定决策**

Project 必须独立 Logseq Page；Task/MiniProject 通常 Block。

**为什么**

Project 需要稳定工作面。

**实施含义**

MiniProject→Project 创建 Page，原 Block 变 Evidence/Entry。

---

## 决策 33

**已锁定决策**

正式事实在 Anchor 附近以最小 deterministic managed summary 呈现。

**为什么**

用户需要在工作现场看见正式状态，但系统不能接管正文。

**实施含义**

自然过程文本继续由用户拥有。

---

## 决策 34

**已锁定决策**

Managed Summary 使用可见自然文本 + 稳定隐藏身份，字段级更新。

**为什么**

避免整体覆盖和脆弱字符串匹配。

**实施含义**

删除 Projection 不等于删除 Formal Fact。

---

## 决策 35

**已锁定决策**

Managed Summary 使用一个稳定容器 + 独立字段子块，可采用 quote/reference 风格。

**为什么**

提高增量更新与可读性。

**实施含义**

不要一个大文本块反复重写。

---

## 决策 36

**已锁定决策**

Projection 厚度按 kind 不同。

**为什么**

Task 要轻，Project 需要足够重入信息。

**实施含义**

只显示非空正式字段，不铺空模板。

---

## 决策 37

**已锁定决策**

允许离线编辑 Managed Projection，重启后 Base–Graph–Kernel 三方对账。

**为什么**

Logseq 用户不会永远通过 Plugin UI 修改。

**实施含义**

Graph-only simple 自动 Commit；Kernel-only refresh；both changed conflict；高影响 review。

---

## 决策 38

**已锁定决策**

Managed Summary 外的自然工作记录只作为 Evidence/Source Observation，不直接改变 Formal Fact。

**为什么**

自然语言不可直接成为写操作。

**实施含义**

可触发 Agent/Proposal/invalidations。

---

## 决策 39

**已锁定决策**

Health Finding 是可重建诊断，不是长期业务实体；仅存最小 disposition receipt。

**为什么**

避免 Health 生命周期成为第二套任务系统。

**实施含义**

修复通过重扫使 Finding 消失。

---

## 决策 40

**已锁定决策**

Cohort 是动态定义/query；Agent Job 冻结成员快照。

**为什么**

Cohort 是分析范围而不是长期工作对象。

**实施含义**

不建 Cohort status/owner/lifecycle。

---

## 决策 41

**已锁定决策**

Kernel 只保存最小 AgentRunReceipt。

**为什么**

运行证据需要追溯，但完整 Agent 过程不属于 Work Kernel。

**实施含义**

完整计划/tool call/checkpoint 归 Runner。

---

## 决策 42

**已锁定决策**

Context 分为长期 Manifest、临时 Local Package、独立 Remote Export Package。

**为什么**

稳定事实、执行上下文、远程隐私边界需求不同。

**实施含义**

全量 Context 可过期/清理；远程需单独授权。

---

## 决策 43

**已锁定决策**

本地 Agent 的 Read 权限可以很宽。

**为什么**

用户希望减少手工提供上下文，强 Agent 应能探索。

**实施含义**

宽读不等于宽写；实际读取记录。

---

## 决策 44

**已锁定决策**

采用宽 Read Gateway + on-demand querying，而不是一次 dump 整个 Graph。

**为什么**

保持探索能力并控制上下文大小。

**实施含义**

small bootstrap→search/list/read→actual reads→final context snapshot。

---

## 决策 45

**已锁定决策**

可信本地 Agent 可自由直接探索，但只有通过 Read Gateway 冻结/导入的材料能成为 Formal Evidence。

**为什么**

Task Copilot 管影响事实的证据链，而非 Agent 的全部认知。

**实施含义**

报告区分 Verified Findings 与 Exploratory Observations。

---

## 决策 46

**已锁定决策**

Agent Report 不成为 Kernel 新实体；长期价值报告作为普通文档/Logseq Page，通过 ArtifactReference 与 AgentRunReceipt 关联。

**为什么**

避免报告管理系统和“报告结论=正式事实”的混淆。

**实施含义**

报告正文不能直接改 Kernel。

---

## 决策 47

**已锁定决策**

Skill 是独立、可读、Hash 寻址、使用后不可变的版本化文件包；Agent 可产 Candidate，但用户决定 Active Version。

**为什么**

治理规则必须可审阅、可追溯、可回退。

**实施含义**

Kernel 仍控制硬权限；Skill 不可自授权。

---

## 决策 48

**已锁定决策**

用户反馈以最小结构化 FeedbackEvent 保存，不立即自动学习。

**为什么**

避免黑盒偏好漂移。

**实施含义**

反馈进入 Skill Review Package→Candidate→Eval/Shadow→用户激活。

---

## 决策 49

**已锁定决策**

保留极薄 Built-in Agent Adapter，但与外部 Agent 使用完全相同的合同。

**为什么**

小任务需要低延迟，但不能维护两套智能体系。

**实施含义**

Built-in 可删除而 Kernel 仍成立。

---

## 决策 50

**已锁定决策**

Executor 由 Skill 的能力需求与任务规模默认路由，用户通常不选模型；跨隐私边界不得静默。

**为什么**

减少模型选择心智并保持 Agent 可替换。

**实施含义**

Run 创建后冻结 executor/scope/context。

---

## 决策 51

**已锁定决策**

总体自动化方向是更信任 Agent：低风险默认主动治理，用户审阅异常、收据与高影响边界。

**为什么**

逐项审批会让 Proposal Review 成为第二个 Inbox。

**实施含义**

安全依赖 Evidence/Operation/Validator/Undo，而不是人工点确认。

---

## 决策 52

**已锁定决策**

现阶段 Agent 可以改变 Engagement，但必须明显提示；未来有 Webhook/可靠外界事件后可提升自动化。

**为什么**

Engagement 变化影响 Now 和行动理解。

**实施含义**

不能安静埋在批量 Activity。

---

## 决策 53

**已锁定决策**

ACTIONABLE↔WAITING 可在证据明确时自动且显著提示；进入/离开 PARKED 默认用户确认。

**为什么**

WAITING 多为外部事实，PARKED 是用户投入决策。

**实施含义**

PARKED 不能由“长期没进展”推断。

---

## 决策 54

**已锁定决策**

Agent 不得自主完成任何 Formal Task。

**为什么**

用户希望主动为每个任务收尾，完成本身是重要心理与治理动作。

**实施含义**

Agent 只能准备证据/Completion 建议。

---

## 决策 55

**已锁定决策**

Task 完成只需用户一次明确动作，系统自动创建最小 CompletionRecord。

**为什么**

保留主动收尾权但不把简单 Task 变成结项表单。

**实施含义**

有遗留/成果/异常时才扩展。

---

## 决策 56

**已锁定决策**

取消也必须由用户主动确认，并创建独立最小 CancellationRecord。

**为什么**

“为什么不再做”比完成更难从历史重建。

**实施含义**

Agent 可预填原因，不能自主取消。

---

## 决策 57

**已锁定决策**

Completion/Cancellation Record 不原地覆盖；内容修正用 Amendment；终态判断错误用 REOPEN_WORK_OBJECT + ReopenRecord。

**为什么**

同时保留历史真实性与当前准确性。

**实施含义**

Agent 不自主改写/重开。

---

## 决策 58

**已锁定决策**

Proposal 是一个原子语义决策；Commit 不允许任意部分执行；用户修改形成新 Revision。

**为什么**

部分删除 Operation 会破坏理由、依赖、risk 与 undo。

**实施含义**

一次 Agent Run 应拆多个独立 Proposal。

---

## 决策 59

**已锁定决策**

Proposal Revision 只绑定真实 target/evidence/contract 依赖；相关变化失效，无关变化不影响；新直接相关材料触发 revalidate。

**为什么**

既避免 stale commit，也避免大范围读取导致全局过期。

**实施含义**

Evidence Fragment hash 是关键。

---

## 决策 60

**已锁定决策**

Local Kernel Service 是正式事实与 Semantic Commit 的唯一写权威。

**为什么**

Plugin/CLI/Agent 生命周期与写入逻辑必须统一。

**实施含义**

所有客户端通过统一 API；不得直写 DB。

---

## 决策 61

**已锁定决策**

Persistence 使用 SQLite Current State + append-only Commit Ledger，不采用完整 Event Sourcing。

**为什么**

当前查询简单，同时保留 Audit/Undo/Recovery。

**实施含义**

Undo 为补偿 Commit。

---

## 决策 62

**已锁定决策**

SQLite 与 Logseq Graph 跨介质事务采用 VALIDATE→PREPARE→KERNEL_APPLY→GRAPH_APPLY→VERIFY→COMMIT。

**为什么**

两者无法真正 ACID，必须持久化事务意图并可恢复。

**实施含义**

半成功绝不显示成功；冲突进入 RECOVERY_REQUIRED。

---

## 决策 63

**已锁定决策**

第一版 Operation Registry 只实现约 12–16 个黄金链真正需要的稳定语义操作。

**为什么**

避免在第一条纵向链之前建设操作平台。

**实施含义**

Domain 可稍丰富，暴露操作面必须克制。

---

## 决策 64

**已锁定决策**

Kernel 基础接口为 localhost-only HTTP/JSON + 最小事件机制 + 随机 Capability Token；CLI 是参考客户端，MCP 是上层 Adapter。

**为什么**

基础应用协议不应被某个 Agent 协议塑形。

**实施含义**

网络权限与领域权限分离。

---

## 决策 65

**已锁定决策**

vNext 从干净 Kernel 出发，对旧系统无历史负担；兼容只在近乎零复杂度时做。

**为什么**

迁移旧数据库不是核心用户价值。

**实施含义**

旧 Graph 仍是用户自然资料，可被正常 formalization 能力重新理解。

---

## 决策 66

**已锁定决策**

第一版 UI 一级入口为：现在 / 需要我判断 / 项目 / 更多；Logseq 自身承担 Capture。

**为什么**

避免把领域架构翻译成菜单和重新建立待整理→待审阅长链。

**实施含义**

Activity/Recovery/Agent Runs/Skills 等放 More。

---

## 决策 67

**已锁定决策**

vNext MVP 用 6 条黄金链 + 4 条故障链验收，而不是功能清单。

**为什么**

系统必须证明端到端可信与恢复能力，而非模块存在。

**实施含义**

允许功能少、UI 朴素，但不能半成功、不可解释、不可 Undo/Recovery。

---
