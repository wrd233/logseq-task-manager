# Task Copilot Production Dogfood 最小设计文档

> 版本：V0 / Production Dogfood 收敛版  
> 日期：2026-08-17  
> 来源：Grill Me 第 32～64 问  
> 目标：把 Task Copilot 从“架构上具备自动治理能力”推进到“真实 Production 中低心智负担、可持续使用”  
> **重要约束：本设计主动限制复杂度。除本文列出的最小能力外，其余长期治理设计全部 Deferred。**

---

# 0. 一句话目标

下一阶段不再继续扩建“未来完整治理系统”，而是：

> **让现有 Task Copilot 在真实 Production Logseq + Kernel 中，安静、稳定地跟随少量真实工作对象；用户只在真正需要时纠正或授权，再用真实 Dogfood 证据决定下一步是否值得增加复杂度。**

---

# 1. 下一阶段真正要验证什么

不是 Agent 能否做更多，也不是 Console、Proposal、Skill 学习系统能否变得更完整，而是四个更基础的问题：

1. **已有 Formal Object 的现实是否能被系统稳定跟上？**
2. **Agent 做错时，用户是否能极低成本地纠正现实？**
3. **真正的新工作是否能克制地进入 Formal World？**
4. **真正结束的工作是否能成熟地退出 OPEN World？**

只要这四个问题还没有被真实 Production 证明，其他高级治理能力都不应该继续实体化。

---

# 2. 系统心智保持不变

```text
Logseq
= Natural Workspace
= 用户真正工作、记录、思考、推进现实的地方

Kernel
= Formal Truth
= 正式工作事实的可靠底账

Agent / Cognition
= 理解 Natural Reality 与 Formal World 的关系

Governance
= 决定什么理解可以成为 Formal Change

Kernel Console
= Formal World 的只读人类阅读层
```

Production Dogfood 不改变这套边界。

---

# 3. 下一阶段只允许三类新增/完善工作

## 3.1 跑稳现有低风险后台维护

允许后台在已批准范围内维护：

- `current_focus`
- `ACTIONABLE ↔ WAITING`
- `waitingCondition`
- 高置信 `Context Association`

目标不是“实时”，而是“稳定压缩现实”。

理想链路：

```text
Natural Work burst
→ Workspace Index / Source Coverage 增量变化
→ quiet period
→ 小范围 Cognition
→ 少量、稳定的 Formal Maintenance
```

禁止：

```text
每条 Natural Record
→ 立刻修改 Kernel
```

### 成功标准

- 同一对象很少短时间反复修改 `current_focus`
- `ACTIONABLE ↔ WAITING` 不高频翻转
- Context Association 不大量误关联
- 几天后回看 Kernel，Formal Memory 基本跟得上现实

---

## 3.2 跑顺“自然语言纠错 → Formal 修正”

当 Agent 的低风险自动维护理解错误时，主纠错方式不是用户学习 Kernel schema、自己改字段或去操作历史里寻找 Undo，而是：

> **用户直接纠正现实是什么。**

例如：

```text
系统：
WAITING

用户：
不是，我还可以继续做兼容性测试。
```

系统应把这句话编译为受治理的 USER Decision，并修正 Formal Memory。

第一阶段至少做到：

```text
Agent 原自动判断
↓
用户自然语言纠正
↓
明确解析用户语义
↓
User Decision / Audit
↓
Formal 修正
↓
可追溯前后变化
```

第一阶段不要求：

- 独立 Correction Experience 平台
- 自动 Skill 学习
- 自动经验聚类
- 在线强化学习
- Feedback Dashboard

如果现有 User Decision / Audit 已经能留下足够上下文，先复用。

---

## 3.3 跑顺 Formalization / Closure 两条生命周期链

只优先验证：

```text
进入 Formal World
Formalization

退出 Active Formal World
Closure
```

暂时不实现 Definition Refinement、Structural Refinement 等更复杂治理。

---

# 4. Production Dogfood 总体闭环

```text
                   Natural Work
                       │
                       ▼
            Source Coverage / Index
                       │
                       ▼
                 quiet period
                       │
                       ▼
              Narrow Cognition
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
  Existing Object    不确定         新工作线程
         │             │             │
         ▼             ▼             ▼
低风险自动维护        KEEP       继续观察 / Discovery
         │                           │
         │                           ▼
         │                  Existing-Object-First
         │                           │
         │                     无合适已有对象
         │                           │
         │                     Candidate 成熟
         │                           │
         │                           ▼
         │                  Formalization Proposal
         │                           │
         │                     USER authority
         │                           │
         └──────────────┬────────────┘
                        ▼
                   Formal Kernel
                        │
                 Outcome 达成证据
                        │
                        ▼
                Closure Assessment
                        │
                 Evidence 足够成熟
                        │
                        ▼
                 Closure Proposal
                        │
                  USER authority
                        │
                        ▼
                    COMPLETED
```

---

# 5. 自动维护核心行为

## 5.1 默认静默

低风险自动维护：

```text
执行
→ 默认不通知
→ 不进入“待我确认”
```

用户不需要看到：

```text
current_focus changed
engagement changed
context association added
```

系统应展示工作意义，而不是操作流水。

## 5.2 低风险 ≠ 高频

后台 Agent 不追求实时追踪每个 Natural Change。

例如：

```text
试旧版
→ 不行
→ 怀疑版本问题
→ 问厂商
→ 厂商确认
```

理想是现实稳定后一次收敛：

```text
current_focus:
已确认旧版不兼容，等待新版验证

engagement:
WAITING

waitingCondition:
厂商提供兼容版本
```

而不是中间反复修改五次。

## 5.3 Formal Memory 具有状态惯性

新增 Evidence 不等于必须修改已有状态。

低风险判断允许三种语义结果：

```text
CHANGE
KEEP
UNCERTAIN
```

- `CHANGE`：Evidence 明确形成更强的新现实。
- `KEEP`：有新 Context，但没有改变当前 Formal Reality。
- `UNCERTAIN`：证据不足、冲突或语义模糊。

默认：

```text
UNCERTAIN
→ 不改 Formal Truth
→ 不打断用户
→ 等待后续现实
```

## 5.4 Derived Cognition 可以模糊，Formal Mutation 必须明确

例如：

> 可能要等厂商，但似乎还能继续检查配置。

Derived Cognition 可以保留模糊性，但不能因此强制：

```text
ACTIONABLE → WAITING
```

---

# 6. ACTIONABLE / WAITING 核心语义

不要问：

> 是否存在外部依赖？

而问：

> **当前是否仍然存在一个真正对目标有意义的内部推进路径？**

例如：

```text
等待厂商新版
+
仍然可以完成真正有价值的兼容性排查
→ 可以保持 ACTIONABLE
```

而：

```text
等待审批
+
审批结果出来前没有任何真正值得推进的内部工作
→ WAITING
```

不要为了保持 ACTIONABLE，凭空制造“整理文档”之类的 filler 工作。

---

# 7. Context Association 原则

## 7.1 高置信关联可以自动

Natural Content 与已有 Formal Object 的关系非常明确时：

```text
Natural Block
→ Context Association
→ Existing WorkObject
```

可以属于低风险自动维护。

## 7.2 Similarity ≠ Identity

高相似度可以支持：

- Context Association
- Existing-Object-First
- 抑制不必要的新 Formalization Candidate

但不能自动支持：

- Merge Formal Objects
- Identity 判断
- Primary Anchor 重绑定
- ownership 重构

## 7.3 不确定时允许 UNKNOWN

多个候选接近、Evidence 不够时：

```text
不强行选择
→ 继续观察
```

## 7.4 历史关联与当前认知权重分离

Context Association 回答：

> 这段自然内容曾经与这个对象有关吗？

Read Model / Cognition 再回答：

> 它现在还应该多大程度参与当前理解？

旧 Evidence 不删除，但不永久等权参与 Current Situation。新的、更强现实可以在认知层覆盖旧判断。第一阶段不因此建设复杂 Evidence 生命周期或知识图谱。

---

# 8. Existing-Object-First

任何可能的新工作线程，在 Formalization 前必须优先问：

> **这是不是其实已经属于一个已有 Formal Object？**

推荐顺序：

```text
Natural Thread
↓
Existing Object Search
↓
有高置信已有对象？
├─ 是
│  → Context Association
│  → 必要的低风险 current reality maintenance
│  → 不生成新 Candidate
│
└─ 否
   → 继续评估是否形成新的独立工作线程
```

这是控制 Formal World 膨胀的核心机制之一。

---

# 9. Discovery 与 Formalization

## 9.1 Discovery 可以主动

后台可以观察 Journal、Project 页面、已有关联 Context、连续 Natural Work，并形成弱的工作线程理解。

## 9.2 Formalization 必须克制

不要：

```text
看到一句像任务的话
→ Candidate
```

Candidate 成熟的核心语义：

```text
真实工作承诺
+
边界开始稳定
+
未来值得独立重入
+
无法被已有对象自然吸收
+
Formal Memory 开始真正有价值
```

重复次数、持续天数、TODO marker 只作为证据，不是机械门槛。

## 9.3 高 precision 优先

拿不准：

```text
继续观察
```

漏掉一次 Candidate 的代价通常小于过早制造一个 Formal Object。

---

# 10. Formalization Proposal

成熟 Candidate 不应只是：

> “发现可能有件事情，要建吗？”

系统应尽量整理为接近可提交的 Proposal，例如：

```text
建议纳入

类型：
MiniProject

标题：
整理并收口 OA 告警规则配置

预期成果：
形成一套完成核心场景梳理、可用于后续配置与维护的 OA 告警规则方案。

可能归属：
OA / 应用监控相关 Project

依据：
- 连续出现独立推进记录
- 已形成明确结果
- 包含多个内部行动
- 未来需要多次重入
- 未找到可自然吸收它的已有对象
```

用户主要确认：

```text
[纳入]
[先不用]
[不是独立事项]
```

具体 UI 可以更轻，但语义要保留。

### 拒绝语义

**先不用**：当前还不值得 Formalize，未来新现实明显变化后可重新评估。

**不是独立事项**：系统的对象边界判断错了，应优先重新理解为已有对象 Context 或普通自然记录。

不要建立永久黑名单。

---

# 11. Closure

## 11.1 Agent 不能自动 Complete

无论置信度多高：

```text
OPEN → COMPLETED
```

仍属于 USER authority。

## 11.2 但系统不能什么都不做

现实已经明显完成而长期保持 OPEN，会污染 Formal World。

因此需要：

```text
Closure Assessment
→ Closure Proposal
```

---

# 12. Closure Proposal

成熟 Proposal 应尽量整理：

```text
对象

预期成果

完成依据
✓ ...

仍存缺口
...

建议
完成此对象
```

用户只承担最后授权：

```text
[完成]
[暂不完成]
```

对 MiniProject：

```text
所有 child Task DONE
≠ desiredOutcome 一定实现
```

Closure 判断优先看：

- desiredOutcome
- completion checks
- 真正 completion gap
- 近期 Evidence
- 是否已经跨过该结果边界进入后续工作

“暂不完成”本身也是有价值的新 Evidence，但第一阶段只需进入 User Decision / Audit，不必立刻建设 Definition Refinement。

---

# 13. closure-ready 只作为派生状态

已经形成成熟 Closure Proposal 但还没 USER Complete 时：

```text
Formal:
OPEN

Derived:
closure-ready / completion likely
```

不要增加 `CLOSURE_READY` Formal lifecycle。

如果没有真实 completion gap、没有值得继续推进的 actionable path，则 Read Model 可以：

- 降低 Current Frontier / Now 的活跃权重；
- 停止无意义重复 Cognition；
- 等待 USER 处理。

新 Evidence 出现真实缺口后，closure readiness 自动失效。

---

# 14. USER authority 与打断策略

需要 USER authority 的事情默认：

```text
成熟 Proposal
→ 待我确认
```

只有：

> **用户当前显式动作如果没有这个决定就无法安全继续**

才就地询问。

判断是否打断的标准不是“重要不重要”，而是：

> 当前动作不问用户还能不能安全继续？

---

# 15. “待我确认”的质量标准

“待我确认”不是 Agent uncertainty inbox。

只有系统已经完成证据收集、理解、候选整理，现在真正只剩 USER authority，才能进入。

不要放：

- current_focus 小修改确认
- Context Association 确认
- Agent 不确定
- 未成熟 Candidate
- “可能需要研究”

目标：

> Confirmation 少，但每一条都值得用户亲自决定。

---

# 16. Proposal 最小正确性

第一阶段不要建设 Proposal DAG、Workflow Engine。

但 Proposal 必须守住底线：

```text
Proposal ready
↓
等待 USER
↓
用户点击采用
↓
重新验证核心语义前提
↓
仍然成立
→ Commit

核心现实已经变化
→ Proposal stale / retire
→ 不执行
```

无关技术变化不应机械 invalidate。

下一阶段真正优先实现的 Proposal 类型只有：

1. `Formalization Proposal`
2. `Closure Proposal`

其他全部 Deferred。

---

# 17. 后台认知节奏

采用：

> **局部变化驱动 + quiet period + 小范围 Cognition**

Workspace Index 可以较快增量维护。

真正 Semantic Cognition 等 quiet period 后：

```text
Affected Scope
↓
Narrow Cognition
```

低频全局任务只做 Coverage / Reconciliation：

- 哪些 Source 从未处理
- 哪些 Index stale
- 哪些 Coverage 有缺口
- 哪些长期异常

再拆成窄任务。

不要周期性把整个 Logseq 全量重新交给 LLM。

---

# 18. Dogfood Scope

第一轮使用：

- 真实 Production Kernel
- 真实 Production Logseq
- 完整 Formal World
- 完整 Console

但主动低风险维护只先作用于少量代表性 root。

## 18.1 按 root 定义

例如：

```yaml
dogfood:
  roots:
    - project-id-A
    - miniproject-id-X
```

按当前 Formal ownership 自动覆盖 descendants。

不要逐 Task 白名单。

## 18.2 Scope 不属于 Formal Fact

不要新增 `dogfood_enabled` 字段。

它属于 Environment / Profile / Runtime config。

## 18.3 Scope 只控制后台主动治理

Scope 外仍允许：

- Console
- Search
- Index / Source Coverage
- Anchor / Projection 正常机制
- 用户显式只读 Cognition
- 用户显式 Formal 操作

它不是 Permission System。

## 18.4 ownership 变化后动态派生

对象进入/离开某个 root 后，根据当前 ownership 自动重新计算主动治理范围。

---

# 19. 第一轮建议选择的真实对象

建议 3～5 个，不追求数量，覆盖不同工作形态：

- 一个长期技术 Project
- 一个流程/采购/建设型 Project
- 一个近期高活跃 MiniProject
- 一个 WAITING 较多的对象
- 一个简单独立事项

目标是代表性，而不是全面。

---

# 20. Rollout 顺序

不建设 Rollout Framework，只采用极轻的运行顺序。

## Stage A：已有对象现实跟随

只开放：

- Context Association
- current_focus
- ACTIONABLE ↔ WAITING
- WaitingCondition

观察：

- churn
- 错误关联
- current_focus 价值
- WAITING 质量
- quiet period
- Source Coverage

## Stage B：验证纠错兜底

真实验证：

```text
Agent 做错
→ 用户自然语言纠正
→ User Decision
→ Formal Memory 修复
→ Audit 可追溯
```

如果纠错链不顺，不扩大主动治理。

## Stage C：打开 Formalization + Closure

当 Stage A/B 基本可信后：

```text
formalization: true
closure: true
```

开始验证 Formal World 进入/退出生命周期。

不继续拆更多 Stage。

---

# 21. Dogfood Evidence

不建设 Analytics / Learning Dashboard。

使用：

```text
已有 Audit / History
+
用户极轻量自然语言反馈
+
少量确定性异常捕获
```

## 21.1 用户不记录正常运行

只记录：

- 明显误判
- 明显漏判
- 自动维护 churn
- 低价值 Confirmation
- Formal World 污染
- 特别好/特别差的重入案例

## 21.2 系统自动保留客观事实

复用现有 Audit / History：

- 对象
- 时间
- Formal before/after
- Evidence
- 判断来源
- User correction
- 最终结果

用户只补：

> “这里为什么不对。”

## 21.3 少量可自动捕获的坏味道

例如：

- 同对象短时间 engagement 多次翻转
- current_focus 短时间多次自动改写
- 同一 Proposal 反复生成 / stale
- Formal write failure
- maintenance loop

只留 Evidence，不自动改系统。

---

# 22. Dogfood 修改节奏

采用：

```text
稳定运行窗口
↓
轻量 Evidence
↓
集中复盘
↓
只选少量真正重复的问题
↓
小批修改
↓
再次稳定运行
```

## 可以立即修

- correctness bug
- authority 越界
- 数据风险
- Formal Truth 可能损坏
- 系统阻塞性故障

## 默认先记录

- current_focus 不够理想
- WAITING 边界微妙
- Context 关联勉强
- Formalization 早一点/晚一点
- Console 某次摘要不理想
- Current Frontier 阅读偏差

每轮复盘优先只改少量最有价值问题。

核心：

> **运行快，架构变化慢。**

---

# 23. Production Dogfood 最重要的观察问题

## Kernel 是否跟上现实？

几天后回来：

- `current_focus` 是否大体对
- `WAITING` 是否可信
- Context 是否有用
- Formal Object 是否还处于正确阶段

## 用户还要维护多少系统？

理想是：

```text
自然工作很多
Agent 自动维护不少
用户纠正很少
真正 USER authority 更少
```

## Formal World 是否越来越干净？

观察：

- duplicate 是否增加
- zombie OPEN 是否积累
- MiniProject 是否越来越像 Task dump
- 独立事项是否合理
- 不值得存在的 Formal Object 是否膨胀

## 重入成本是否下降？

简单人工记录：

```text
A：几乎立即恢复
B：看一点 Evidence 后恢复
C：仍需要重新翻大量 Logseq
```

无需 KPI Dashboard。

---

# 24. 当前明确 Deferred 的长期设计

以下设计原则已经讨论并认可，但**本阶段默认不实现**：

- Definition Refinement Proposal
- Structural Refinement Proposal
- 通用 Decision Package 平台
- Proposal dependency graph / workflow engine
- Correction Experience 独立 Learning Ledger
- Skill Refinement Proposal 自动化
- Skill immutable version manager
- Experience Replay framework
- Domain Skill routing
- Project/MiniProject scoped skill override
- Routine / Advanced 多模型调度框架
- Model marketplace
- 自动在线学习
- 自动 Skill rewriting
- 通用 Duplicate Merge
- 自动 Primary Anchor relocation
- 复杂 Presentation Feedback learning
- Analytics Dashboard
- Dogfood management UI
- 灰度发布平台

---

# 25. 复杂度冻结原则

从现在开始：

```text
真实发生过？
├─ 否 → 不实现
└─ 是
   ↓
重复发生过？
├─ 否 → 先人工 / 临时处理
└─ 是
   ↓
已经持续制造明显维护成本？
├─ 否 → 继续观察
└─ 是 → 才考虑新增系统能力
```

同时坚持：

> **先冻结语义，不急着实体化概念。**

例如 `Closure Proposal` 可以只是现有 Closure Assessment + User Decision 的一种呈现；`Dogfood Evidence` 可以先复用 Audit + 一句自然语言备注。

---

# 26. 下一阶段完成定义

第一轮可以认为达到阶段目标，当：

1. 少量真实 roots 已连续运行；
2. 没有 authority 越界；
3. 没有持续 Formal churn；
4. Context Association 大体可信；
5. `current_focus` 对重入有明显帮助；
6. `ACTIONABLE / WAITING` 大体稳定；
7. 用户自然语言纠错能够可靠修复 Formal Memory；
8. Formalization Candidate 少而有价值；
9. Closure Proposal 少而成熟；
10. “待我确认”没有迅速膨胀；
11. Console 能帮助用户理解完整 Formal World；
12. 已积累一批真实 Dogfood Evidence，可以支持下一轮判断。

---

# 27. 最终设计宪法

> **Production Dogfood 的目的不是证明系统能做多少，而是证明用户可以少维护多少。**
>
> **自然现实可以连续、模糊、快速变化；Formal Memory 应该稀疏、稳定、经过压缩。**
>
> **低风险自动维护默认静默，USER authority 稀疏出现。**
>
> **Agent 拿不准时可以 KEEP，不需要把不确定性变成用户工作。**
>
> **Existing-Object-First 优先于 Formal Object 增长。**
>
> **Formalization 负责什么时候值得正式记住，Closure 负责什么时候可以正式退出 OPEN World。**
>
> **用户纠正现实，不维护 Kernel schema。**
>
> **复杂能力必须由真实 Dogfood 摩擦赚取，而不是由设计想象提前获得。**
