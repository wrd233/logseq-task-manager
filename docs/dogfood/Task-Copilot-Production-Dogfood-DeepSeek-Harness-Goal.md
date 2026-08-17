# Goal：完成 Task Copilot Production Dogfood 最小闭环

> 执行者：DeepSeek Harness（DSH）  
> 目标分支：`vnext`  
> 日期：2026-08-17  
> 任务性质：Production Dogfood Enablement / 最小治理闭环  
> 核心要求：**不要把长期设计全部实现。只实现真实 Production Dogfood 所需的最小能力。**

---

# 0. 开始前必须阅读

请完整阅读用户提供的：

1. `Task-Copilot-Production-Dogfood-最小设计文档.md`
2. `Task-Copilot-Production-Dogfood-设计思路与决策记录.md`

如果同时还有此前的 Kernel Console 设计文档，可以作为背景阅读，但本轮执行优先级为：

```text
当前两份 Production Dogfood 文档
> 之前更宽的长期治理设想
```

尤其注意：

> 第二份设计思路文档中讨论了很多长期能力，但大量内容已经明确标为 Deferred。  
> **不要因为文档中出现了某个概念，就默认本轮要实现它。**

---

# 1. 本轮真正目标

不是：

> “继续把 Task Copilot 的 Agent Governance 做完整。”

而是：

> **让当前 Task Copilot 在真实 Production Kernel + 真实 Logseq 中，先对少量真实工作对象稳定运行低风险自动维护，并验证用户自然语言纠错、Formalization、Closure 三条关键链路。**

完成后应该能够真实回答：

1. Agent 能不能安静地跟上已有 Formal Object 的现实？
2. Agent 做错时，用户能不能很轻松地纠正？
3. 新工作能不能克制地进入 Formal World？
4. 已完成工作能不能成熟地退出 OPEN World？
5. 这个过程有没有制造新的维护负担？

---

# 2. 第一原则：复杂度冻结

本轮**严禁**把以下长期方向顺手全部做掉：

- Structural Refinement Proposal
- Definition Refinement Proposal
- 通用 Decision Package Framework
- Proposal DAG / Workflow Engine
- Correction Experience Learning Platform
- Skill Refinement 自动化
- Skill Version Manager
- Experience Replay Framework
- Domain Skill Router
- Project / MiniProject Skill Override
- Routine / Advanced Agent Scheduler
- 动态模型路由
- 多 Agent 编排
- Model Marketplace
- 自动在线学习
- 自动 Skill rewriting
- 通用 Duplicate Merge
- 自动 Primary Anchor Recovery
- Presentation Feedback Learning
- Analytics Dashboard
- Dogfood Dashboard
- 灰度发布管理 UI

如果你发现这些未来会有帮助：

```text
记录到 Deferred / Follow-up
```

不要实现。

---

# 3. 不要因为概念存在就新建模型

例如设计文档中提到：

```text
Closure Proposal
Dogfood Evidence
Proposal revalidation
closure-ready
```

这些首先是**语义**。

请优先检查现有系统是否已经有：

- closure assessment
- user decision
- operation history
- candidate
- audit
- reconcile
- read model

如果可以复用已有结构实现：

> 就不要新建新表、新 lifecycle、新大状态机。

核心：

> **复杂语义 ≠ 复杂软件。**

---

# 4. 开始前先做 repo reconnaissance

不要按旧报告猜当前状态。

至少执行并记录：

```bash
git fetch origin
git status
git rev-parse HEAD
git rev-parse origin/vnext
git log --oneline --decorate -20
```

然后调查：

## 4.1 当前低风险自动维护

找到并理解：

- current_focus maintenance
- ACTIONABLE / WAITING
- waiting condition
- context association
- maintenance coordinator
- source coverage
- reconcile jobs
- quiet period
- evidence
- agent authority boundary

对每项标记：

```text
已真实运行
已有 domain/API 但未接 runtime
只有测试
当前缺口
```

不要重复造已经存在的能力。

---

## 4.2 当前 User Decision / correction 能力

调查：

- 用户自然语言输入进入 Agent 的路径
- User Decision Compiler
- Formal semantic operation
- Audit / History
- Undo
- authority 标记

判断：

> 当前是否已经可以低成本实现“用户纠正现实 → Formal 修正”。

优先复用。

---

## 4.3 当前 Formalization

调查：

- Discovery
- Candidate
- Existing object search
- Formalize API
- CREATE authority
- candidate governance
- Context Association
- 当前 Confirmation surface

---

## 4.4 当前 Closure

调查：

- closure assessment
- closure status / readiness
- completion checks
- lifecycle
- user complete flow
- Evidence
- 当前 Confirmation surface

---

# 5. 本轮只做四个实现主题

1. Production Dogfood Scope
2. 现有低风险后台维护稳定化
3. 自然语言纠错链
4. Formalization + Closure

其余不扩。

---

# 6. Theme A：Production Dogfood Scope

建立**极轻量** runtime scope。

## 目标

使用真实 Production：

- Kernel 全量
- Logseq 全量
- Console 全量
- Index / Source Coverage 全量

但后台主动低风险治理先只覆盖少量 root。

---

## 6.1 Scope 形态

优先最简单：

```text
profile / environment / runtime config
```

配置少量：

```text
Project ID
MiniProject ID
```

根据当前 Formal ownership 动态包含 descendants。

例如：

```yaml
dogfood:
  roots:
    - project-id-A
    - miniproject-id-X
```

---

## 6.2 禁止产品化

不要新增：

```text
dogfood_enabled
```

到 WorkObject。

不要做：

- Scope DB
- 管理页面
- checkbox
- 灰度平台
- per-task whitelist UI

---

## 6.3 Scope 只限制后台自主治理

Scope 应限制：

- 后台自主 Cognition
- 后台低风险 maintenance
- 后台 discovery / formalization
- 后台 closure detection

但不限制：

- Console
- Search
- Source Coverage
- Index
- 用户显式操作
- 用户显式只读 cognition
- 正常 Projection / Anchor

**Dogfood Scope ≠ Permission System。**

---

## 6.4 ownership 动态派生

如果对象从 root A 的子树移动到非 Dogfood root B：

> 根据当前 ownership 自动退出主动治理范围。

不要把 rollout 状态固化到对象。

---

# 7. Theme B：跑稳现有低风险自动维护

第一阶段重点：

```text
Context Association
current_focus
ACTIONABLE ↔ WAITING
waitingCondition
```

**不要增加新的自动 authority。**

---

## 7.1 quiet period

确认当前实现是否真的做到：

```text
Natural burst
→ 聚合
→ narrow cognition
→ 少量 maintenance
```

如果仍会高频触发，做最小修正。

不要为此重写整个 MaintenanceCoordinator。

---

## 7.2 Affected Scope

优先利用：

- source coverage
- anchor
- existing context association
- ownership neighborhood
- existing matcher / narrow skill

只处理局部受影响对象。

不要每次：

```text
scan entire graph with LLM
```

---

## 7.3 Formal state inertia

行为上支持：

```text
CHANGE
KEEP
UNCERTAIN
```

如果当前代码无需新增 enum 就能表达，不强制新建类型。

重点是：

> Evidence 不够强时，不要为了“必须产出答案”修改 Formal Truth。

---

## 7.4 ACTIONABLE / WAITING

检查当前 Skill / logic 是否存在：

```text
存在外部依赖
→ WAITING
```

的机械简化。

目标语义：

> **当前是否已经不存在真正对 Outcome 有意义的内部推进路径。**

例：

```text
等厂商新版
+
仍有真正有价值的本地兼容性测试
→ 可能仍 ACTIONABLE
```

而：

```text
等正式审批
+
审批结果前没有有效内部推进路径
→ WAITING
```

不要为了保持 ACTIONABLE 制造 filler 工作。

---

## 7.5 Context Association

高置信已有对象关系可以自动建立。

但必须守住：

```text
Similarity ≠ Identity
```

本轮不得借机实现：

- object merge
- automatic anchor reassignment
- ownership restructure
- identity unification

不确定时允许 UNKNOWN / keep observing。

---

# 8. Theme C：自然语言纠错链

这是本轮非常重要的一条安全链。

目标行为：

```text
Agent 自动维护
↓
用户：
“不是这样，实际是……”
↓
系统解析 USER correction
↓
合法 User Decision
↓
Formal semantic change
↓
Audit / History 可追溯
```

---

## 8.1 不要求复杂新 UI

优先复用：

- Agent 对话
- Object Surface
- existing User Decision flow

如果已有入口足够，不新建：

```text
Correction Center
Feedback Inbox
```

---

## 8.2 不要求 Learning Platform

本轮只保证：

- 原状态可追溯
- 自动判断可追溯
- 用户纠正内容可追溯
- 最终 Formal 状态可追溯
- 相关 Evidence 尽量可追溯

如果现有 Audit 已经覆盖：

> 不新建 `correction_experiences` 表。

---

## 8.3 必测场景

### Case 1：Engagement

Agent：

```text
ACTIONABLE → WAITING
```

用户：

> 不是，我还可以继续本地测试。

最终：

```text
ACTIONABLE
```

且 USER authority 清楚。

### Case 2：current_focus

Agent 自动更新错误。

用户直接描述真正的工作重入点。

系统合法修正。

### Case 3：纠正不能立即被旧 Evidence 覆盖

用户刚纠正后，同一批旧 Evidence 不应立刻再次把状态自动改回错误版本。

如果发生，优先检查：

- User Decision precedence
- source/evidence revision
- quiet period
- reconcile stale handling

---

# 9. Theme D：Formalization + Closure

Stage A/B 稳定以后才打开。

不建设 rollout framework。

最多用简单运行配置：

```yaml
dogfood:
  maintenance: true
  formalization: false
  closure: false
```

之后人工改为：

```yaml
formalization: true
closure: true
```

具体配置形式可由你根据现有项目选择。

---

# 10. Formalization 最小目标

目标链：

```text
Natural work thread
↓
Existing-Object-First
↓
没有合适已有对象
↓
Candidate maturity
↓
Formalization Proposal
↓
USER
↓
Formal Commit
```

---

## 10.1 Candidate 不用机械计数

不要实现：

```text
3 mentions + 2 days
→ candidate
```

成熟度应利用当前已有 Cognition/Skill 综合判断：

- independent commitment
- stable-enough boundary
- future re-entry value
- not naturally absorbable by existing object

允许保守。

---

## 10.2 Existing-Object-First 是硬要求

新 Candidate 进入 USER 视野前：

> 必须先检查现有 Formal Objects。

高置信已有对象：

```text
→ Context Association
→ suppress new Formalization
```

不确定：

```text
→ keep observing
```

不要为了追求 recall 强制创建 Candidate。

---

## 10.3 Formalization Proposal

尽量利用已有 Evidence 准备：

- recommended type
- title
- supported desired outcome
- possible ownership
- why this looks independent

不要为了完整杜撰：

- completion checks
- ProjectIntent
- imagined deliverables

---

## 10.4 Proposal actions

语义上优先支持：

```text
纳入
先不用
不是独立事项
```

但如果当前现有 User Decision 模型难以一次完整承载，不要因此建设大 Proposal Framework。

最低要求：

- 不自动 CREATE
- 用户能清楚授权
- “先不用”不会下一轮原样骚扰
- 拒绝不会形成永久 blacklist
- “不是独立事项”可以尽量反馈给 Existing-Object-First / Context reasoning

---

# 11. Closure 最小目标

目标链：

```text
Outcome evidence
↓
Closure Assessment
↓
成熟
↓
Closure Proposal
↓
USER Complete
```

**绝不自动 Complete。**

---

## 11.1 Closure 判断

对 MiniProject：

```text
child tasks all DONE
```

不能直接等于：

```text
desiredOutcome achieved
```

优先使用现有：

- desiredOutcome
- completion checks
- Evidence
- closure assessment
- remaining gap

如果当前 closure pipeline 已经有较好能力，复用而不是新造。

---

## 11.2 closure-ready

不要新增 Formal lifecycle。

如果已有 read model / closure assessment 能表达：

> OPEN but completion likely

直接复用。

---

## 11.3 Proposal stale

至少守住：

> 用户点击 Complete 前，如果新 Evidence 已明显推翻 Closure Readiness，不允许执行旧建议。

不要求 Proposal DAG。

可以通过：

- refresh assessment
- relevant revision
- small semantic precondition check

实现。

---

# 12. Rollout 顺序

## Stage A：Maintenance

只：

```text
maintenance = on
formalization = off
closure = off
```

真实跑少量 roots。

判断：

- no authority violation
- no obvious churn
- context mostly correct
- current_focus useful
- waiting stable

---

## Stage B：Correction

真实验证几次：

```text
agent mistake
→ user correction
→ User Decision
→ formal recovery
```

如果纠错不可靠：

> 不继续 Stage C。

---

## Stage C：Formalization + Closure

打开：

```text
formalization = on
closure = on
```

不再细拆更多阶段。

---

# 13. Dogfood Evidence：只做最轻量支持

不要做 Analytics UI。

优先复用：

- operation history
- audit
- user decision
- existing logs

如果可以极小成本增加：

```text
dogfood note / mark
```

让用户补一句自然语言反馈，可以做。

但不要为了它新增复杂前端。

---

## 13.1 可自动捕获的少量异常

如果成本很低，可以确定性记录：

- engagement 短时间多次翻转
- current_focus 短时间多次自动改
- same proposal repeatedly generated/staled
- maintenance failure
- formal write failure

这里只记录案例：

> 不自动建 Issue，不自动改 Skill。

---

# 14. 真实 Dogfood roots

如果代码无法知道用户最终想选哪些真实 root：

> 不要自己把某些业务对象永久写死。

提供清晰、极简的配置方式，并在最终报告中说明如何填写。

如果仓库有 canonical fixture / real graph profile：

可以先用它完成 smoke/integration。

但最终报告必须区分：

```text
fixture verification
real graph verification
production dogfood
```

不要把 smoke 写成完整 Production Dogfood。

---

# 15. 测试要求

本轮所有新增行为必须可测试。

---

## 15.1 Scope Tests

覆盖：

- root Project descendants included
- root MiniProject descendants included
- ownership move updates effective scope
- scope outside still readable/searchable
- user explicit action not blocked by scope

---

## 15.2 Maintenance Tests

覆盖：

- quiet period aggregation
- repeated Natural burst does not cause churn
- uncertain evidence keeps Formal state
- WAITING does not simply follow external dependency
- high-confidence Context can auto associate
- uncertain association stays uncommitted

---

## 15.3 Correction Tests

覆盖：

- USER correction overrides Agent inference
- old evidence does not immediately reapply wrong state
- audit / decision provenance exists
- Agent cannot impersonate USER
- correction uses governed semantic operation

---

## 15.4 Formalization Tests

覆盖：

- existing object suppresses duplicate candidate
- weak thread stays observation
- mature thread can produce proposal
- no automatic CREATE
- rejection does not become permanent blacklist
- no invented Formal facts

---

## 15.5 Closure Tests

覆盖：

- child DONE alone does not force complete
- strong outcome evidence can produce readiness/proposal
- no automatic COMPLETE
- USER complete works
- new contrary evidence invalidates stale readiness
- closure-ready remains Formal OPEN until user commit

---

# 16. Integration / Runtime 验证

不要只跑 unit tests。

至少验证：

## Scenario A：Natural burst

一个真实/canonical Project 内连续写多条 Natural Context。

确认：

- quiet period
- one stable current_focus
- no flip storm

## Scenario B：外部等待但仍可推进

确认不被机械 WAITING。

## Scenario C：真正完全卡住

确认可进入 WAITING。

## Scenario D：用户自然纠错

Agent 误判后，用户一句话纠正。

确认 Formal Truth 合法修复。

## Scenario E：Existing-Object-First

Natural thread 与已有 MiniProject 高度匹配。

确认：

```text
Context Association
```

而不是 duplicate candidate。

## Scenario F：真正新线程

确认产生 Formalization Proposal，而非自动 CREATE。

## Scenario G：Outcome 实现

确认 Closure Proposal，而非自动 Complete。

## Scenario H：Closure 后新缺口

确认旧 readiness 不再可直接执行。

---

# 17. 必须保持的 authority 边界

Agent 仍然不能自动：

- CREATE
- COMPLETE
- CANCEL
- REOPEN
- PARKED
- Rename
- ownership
- desiredOutcome
- completion checks
- ProjectIntent
- Primary Anchor
- merge
- structural move
- purge

不要借 Production Dogfood 扩权。

---

# 18. Console 本轮原则

Console V0 已经完成当前观察层任务。

本轮不要开启 Console Feature Sprint。

只允许：

- 因 Dogfood 暴露出的明确 correctness fix
- 为观察本轮行为所必需的极小只读补充

不要新增：

- Learning page
- Proposal debugger
- Dogfood dashboard
- Agent analytics
- skill manager

---

# 19. 不要重构不相关系统

本轮不做：

- monorepo 大搬家
- Kernel domain 重写
- SQLite schema 清洁重构
- 通用 Matcher 全面重写
- 新 UI Design System
- 大型 Agent architecture rewrite

如果最小 Dogfood 必须补一个窄 API / small module：

可以做。

其余 Deferred。

---

# 20. Git / 开发纪律

- 使用小而语义明确的 commits
- 每阶段保持 tests green
- 不把无关重构混入
- 不做破坏性 Git 操作
- 不破坏 Production Graph
- 不批量改真实用户内容
- 是否 push 按当前用户明确要求执行
- 最终报告明确 HEAD / commits / working tree / push 状态

---

# 21. Definition of Done

## Scope

- [ ] 少量 root 可配置
- [ ] descendants 自动继承
- [ ] 不污染 Formal model
- [ ] 只限制后台主动治理

## Low-risk maintenance

- [ ] quiet period 有效
- [ ] local/narrow cognition
- [ ] current_focus 不明显抖动
- [ ] engagement 不机械随外部依赖切换
- [ ] uncertainty 可以 KEEP
- [ ] Context Association 追求 high precision

## Correction

- [ ] 用户自然语言能纠正自动维护
- [ ] USER Decision authority 正确
- [ ] Formal Memory 被合法修正
- [ ] 有完整可追溯记录

## Formalization

- [ ] Existing-Object-First
- [ ] Candidate 克制
- [ ] 不自动 CREATE
- [ ] Proposal 接近可提交
- [ ] 不杜撰 Formal facts

## Closure

- [ ] Outcome-based assessment
- [ ] 不自动 Complete
- [ ] Closure Proposal / confirmation
- [ ] 用户最终授权
- [ ] stale readiness 可失效

## Safety

- [ ] repo 原有 checks 全绿
- [ ] 无 authority regression
- [ ] 无生产数据破坏
- [ ] 未引入 Deferred 大系统

---

# 22. 最终收尾报告必须包含

## 22.1 Repo baseline

- HEAD
- origin/vnext
- working tree
- relevant existing components found

## 22.2 实现摘要

只说明本轮真正做了什么。

## 22.3 Scope

- 配置形式
- descendants resolution
- runtime enforcement points

## 22.4 Maintenance

- quiet period
- affected scope
- state inertia
- engagement semantics
- Context Association

## 22.5 Correction

给一个完整例子：

```text
Agent before
↓
User correction
↓
User Decision
↓
Formal after
```

## 22.6 Formalization

至少给：

- Existing-Object-First case
- Mature new thread case

## 22.7 Closure

至少给：

- outcome evidence
- closure proposal
- USER complete
- stale invalidation

## 22.8 Tests

列：

- commands
- test counts
- result
- integration evidence

## 22.9 Runtime dogfood evidence

明确区分：

- canonical fixture
- real graph
- real Production
- smoke only

## 22.10 Known Issues

诚实列出，不要用“基本完成”覆盖缺口。

## 22.11 Deferred

明确说明本轮刻意没有实现：

- Learning
- Skill versioning
- Structural refinement
- Definition refinement
- multi-model
- Proposal DAG
- analytics
- recovery automation

---

# 23. 完成前的“有没有做过头”自检

逐条问：

### 这个新表/模块是不是 Production Dogfood 当前真实必需？

如果只是以后可能有用：

> 删除或 Deferred。

### 我是不是因为文档里出现了一个名词，就把它实体化了？

如果是：

> 回退。

### 这个能力是否让用户需要学习更多系统概念？

如果是：

> 尽量隐藏或简化。

### 我是不是在实现一个 Learning Platform / Workflow Engine / Multi-Agent System？

如果是：

> 停止。本轮明确不做。

### 我有没有扩大 Agent Formal authority？

如果是：

> 回退。

### 最终体验是否更接近：

```text
我正常工作
系统自己跟上
错了我说一句
真正需要我的决定才问我
```

如果不是：

> 重新检查实现。

---

# 24. 本轮真正的完成形态

我们想看到的不是“功能很多”，而是：

```text
真实 Production 中
少量代表性工作对象
↓
Agent 安静地维护
↓
Formal Memory 基本跟得上
↓
偶尔错了，用户一句话修正
↓
真正新事情少量进入 Formalization
↓
真正完成的事情少量进入 Closure
↓
待我确认保持稀疏
↓
Console 中的 Formal World 比以前更干净
```

如果这个闭环成立：

> **本轮 Goal 就完成了。**

不要为了让收尾报告更“完整”继续实现 Deferred 能力。
