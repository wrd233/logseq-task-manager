# Task Copilot Kernel Console V0 设计文档

> 版本：V0  
> 日期：2026-08-17  
> 状态：Grill Me 决策收敛版  
> 适用范围：Task Copilot vNext / Kernel Console 第一版  
> 目标读者：产品设计、架构设计、Codex / DSH / 开发 Agent、后续维护者

---

# 0. 一句话定义

**Kernel Console V0 是 Task Copilot Formal World 的只读观察前端。**

它的职责不是成为第二个任务管理器，也不是复制 Logseq，而是：

> 让用户以符合工作心智的方式，直接看到 Kernel 记住的正式事项世界，并通过渐进展开恢复事项结构、当前局面、当前前沿、上次以来的重要变化、依据与必要的技术诊断信息。

Console 的核心价值是：

1. 让 Kernel 的独立 Formal Truth 对用户可见；
2. 降低用户重新进入 Project / MiniProject / Task 的认知成本；
3. 在 Production Dogfood 过程中帮助观察 Kernel、Projection、Anchor、Derived Cognition 是否真正跟得上现实；
4. 为未来 Recovery / Matcher / Governance 提供自然承载面，但 **V0 不执行这些写操作**。

---

# 1. 背景与产品定位

Task Copilot 当前的核心架构已经稳定为：

```text
Logseq
= Natural Workspace
= 用户写、想、记录、推进真实工作的地方

Kernel + SQLite
= Formal Truth
= 正式工作对象、生命周期、关系、意图、当前推进等可信底账

Agent / Matcher
= Cognition
= 理解现实与 Formal World 之间的关系

Projection
= Kernel → Logseq 的受控映射

Governance
= 决定哪些推断可以改变 Formal Truth
```

Kernel Console 引入后形成：

```text
                    用户
                     │
                     ▼
              Kernel Console
          Formal World Observer
                     │
                     ▼
                  Kernel
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
       Logseq                 Agent
  Natural Workspace          Cognition
```

Console 不是新的工作区。

## 1.1 Console 与 Logseq 的职责边界

### Logseq

负责：

- 自然记录；
- Journal；
- Project 页面；
- 完整上下文阅读；
- 思考；
- 修改自然内容；
- 真正推进工作；
- Agent 协作；
- 完整现场。

### Kernel Console

负责：

- 看见正式事项世界；
- 理解 Project 当前局面；
- 查看 Formal ownership 结构；
- 查看 MiniProject 的成果与完成缺口；
- 查看 Task 当前动作状态；
- 查看“上次以来”的关键变化；
- 查看系统为什么这样理解；
- 查看 Anchor / Projection 等系统状态；
- 在需要完整现场时跳回 Logseq。

### 明确不做

V0 不做：

- 创建 Task / MiniProject / Project；
- 修改标题；
- 修改 current_focus；
- Complete / Cancel / Reopen；
- 修改 ownership；
- 修改 Intent / ProjectIntent；
- 重绑 Primary Anchor；
- Reproject；
- Recovery；
- Presentation Feedback；
- Current Frontier 纠正；
- Markdown 编辑；
- Journal；
- Kanban；
- 拖拽排序；
- 第二套 Project Workspace。

---

# 2. V0 的核心产品原则

## 2.1 Formal World，而不是数据库浏览器

用户打开 Console 时，不是来问：

```text
work_objects 表里有什么？
projection_obligations 有多少？
reconcile_jobs 状态是什么？
```

而是：

```text
我正式有哪些事情？
这些事情现在是什么局面？
它们之间是什么关系？
有没有什么地方不对？
我想找的那件事情在哪里？
```

因此 UI 必须以“正式事项世界”为心智，而不是以 Kernel schema 为心智。

---

## 2.2 关系是 Formal World 的骨架

正式事项世界以 ownership 关系组织：

```text
Project
├─ MiniProject
│  └─ Task
└─ Task
```

允许：

```text
Project → MiniProject
Project → Task
MiniProject → Task
```

不引入无限层级，不做 DAG。

**关系结构优先于纯动态排序。**

系统可以优化：

- Project 出现顺序；
- 默认展开程度；
- 卡片视觉显著性；
- Current Frontier 的选择。

但不能把 Project 内部对象全部拆散后重新拼成“今日推荐流”。

---

## 2.3 完整性属于系统，注意力属于 Read Model

Kernel Formal World 可以长期保存全部正式对象。

Console 默认阅读面只需要高质量压缩。

因此：

```text
Formal World
= 完整、长期、可追溯

默认阅读面
= Hot Work 为主
+ 少量仍有解释价值的刚结束对象

Cold History
= 完整存在，但默认退出主阅读面
```

---

## 2.4 阅读排序不是 Formal Priority

Console 可以根据：

- 当前阶段；
- engagement；
- current_focus；
- 近期 meaningful change；
- WAITING 条件；
- 用户近期重入；
- child 的实际工作活跃度；

优化显示顺序。

但这种顺序属于：

```text
Presentation / Read Model
```

不能写成：

```text
priority = P1
rank = 3
```

V0 不新增正式 Priority / Rank。

---

## 2.5 当前局面是派生认知，不是 Formal Truth

“当前局面”可以综合：

```text
Formal Facts
+
已治理的 Context Association
+
可信 Evidence
+
近期 Formal History
+
受约束 Derived Cognition
```

但它本身不是新的 Formal 字段。

不新增：

```text
project_summary
```

作为 Formal Truth。

---

## 2.6 Stale 不等于不可用

Current Situation 是可失效的派生阅读结果。

当语义环境发生有意义变化：

```text
current_focus 改变
engagement 改变
WAITING condition 改变
child lifecycle 改变
Project phase 改变
新的高价值 Context / Evidence
重要 User Decision
```

Current Situation 可标为 stale。

此时：

- 旧摘要仍然可读；
- UI 可轻提示“此后有新变化”；
- 后台安静期刷新；
- 用户打开时必要补刷新；
- 不应该整卡 Loading；
- 不应该把 stale 当系统异常。

---

# 3. V0 的“只读”精确定义

V0 不是绝对无状态，而是：

> **工作世界只读，阅读状态可写。**

## 3.1 不允许写入

禁止修改：

- Formal Truth；
- Workspace；
- Derived Cognition；
- Governance；
- Presentation Feedback；
- Current Frontier judgment；
- Anchor；
- Projection；
- ownership；
- lifecycle；
- intent；
- title。

## 3.2 允许写入

只允许持久化 Presentation / Read State：

- Project User Read Baseline；
- MiniProject User Read Baseline；
- Task User Read Baseline；
- 当前展开 / 折叠状态；
- 最近停留对象；
- 必要的纯本地 UI 偏好。

---

# 4. 顶层信息架构

V0 顶层保持极少入口。

建议：

```text
正式事项
需要注意
搜索
```

可另有弱入口：

```text
历史
技术状态（可隐藏）
```

但不建议形成复杂导航栏。

## 4.1 正式事项

主入口。

回答：

> 我的正式工作世界是什么样？

默认展示：

```text
Project Current Situation Cards
+
独立事项
+
历史入口
```

## 4.2 需要注意

不是第二套世界。

它是：

> Formal World 中稳定系统异常的过滤视图。

问题先附着在事项上，再聚合。

## 4.3 搜索

搜索目标是：

> 找正式事项。

结果一级单位始终为 WorkObject。

可使用已治理 Natural Content / Evidence 提高召回。

---

# 5. 正式事项首页

## 5.1 Project 是主要阅读单位

首页不默认展示完整对象树。

默认显示：

```text
Project Current Situation Card
```

而不是：

```text
Project
├─ MiniProject
├─ MiniProject
├─ Task
├─ Task
...
```

原因：

Project 首页阅读目标不是“浏览 schema”，而是：

> 先理解这个完整事情现在处于什么局面。

---

# 6. Project Current Situation Card

## 6.1 固定阅读骨架

V0 不允许 Agent 自由重排卡片结构。

稳定顺序：

```text
Project 名称

当前局面

当前前沿（有意义时）

上次以来（有重入价值时）

轻量异常（必要时）
```

系统智能主要体现在：

- 内容如何压缩；
- 哪些区块出现；
- 内容长度；
- 少量视觉显著性。

而不是动态重新设计版式。

---

## 6.2 当前局面

回答：

> 这个 Project 现在是什么现实？

示例：

```text
海丝独立建设

当前局面
项目已经完成方案谈判，目前进入方案审批与采购准备阶段。
技术规格书主体已经形成，当前仍在收口部分实施边界。
```

Current Situation 应优先是短而高密度的自然语言。

不应变成：

```text
阶段：采购
状态：OPEN
ACTIONABLE：3
WAITING：1
...
```

---

## 6.3 当前前沿 Current Frontier

回答：

> 哪几个 Formal Object 最能解释这个 Project 此刻为什么是现在这个局面？

不是：

> 哪几个 Task 可以现在执行？

因此：

```text
Current Frontier ≠ ACTIONABLE List
```

WAITING MiniProject 如果决定当前项目现实，也可以属于 Frontier。

### 默认数量

建议：

```text
1–4 个
```

但不是固定 Top 3。

如果系统想展示 8–10 个前沿对象，应视为压缩失败。

### 粒度原则

优先选择：

> 能代表整支工作结构的最高合适粒度。

例如：

```text
Project
└─ MiniProject A
   ├─ Task A1
   ├─ Task A2
   └─ Task A3
```

如果 MiniProject A 已足够表达该工作支线，则首页只显示 A，不同时把 A1/A2/A3 提升成同级前沿。

这保证内聚性。

---

## 6.4 上次以来 Meaningful Changes

回答：

> 从我上次在这个认知粒度上重新掌握它之后，工作意义上发生了什么？

它不是 Change Log。

### 示例

```text
上次以来
✓ 技术规格书已经完成
✓ 项目谈判已经结束
→ 工作重点转入方案审批
```

### 不应展示

```text
current_focus updated
projection obligation completed
context association created
reconcile job succeeded
```

用户需要的是工作意义变化，不是系统操作流水。

### 条件出现

仅在有重入价值时出现，例如：

- 长时间未进入；
- Project phase 改变；
- 重要 MiniProject 完成；
- WAITING → ACTIONABLE；
- 重要 Evidence / Decision；
- 明显工作方向变化。

---

## 6.5 轻量异常

只展示已经被产品语义判断为稳定异常的问题。

正常文案必须翻译成人类工作心智。

例如：

```text
工作位置暂时不可用
```

而不是：

```text
ANCHOR_MISSING
```

或者：

```text
Logseq 中的显示尚未恢复
```

而不是：

```text
PROJECTION_OBLIGATION_FAILED
```

技术术语只进入“技术详情”。

---

# 7. 首页排序与视觉显著性

V0 不引入显式：

```text
主要工作世界
其他活跃项目
```

这样的额外分类。

所有 Hot Project 仍处于同一个 Formal World。

只允许弱处理：

- 顺序优化；
- 信息密度轻微变化；
- 字重；
- 留白；
- 折叠程度；
- 当前更值得阅读的卡片稍完整。

原则：

> 复杂度躲在排序和阅读引导中，不新增用户需要学习的新概念。

---

# 8. 点击 Project：原地渐进展开

## 8.1 不进入多级详情页

V0 使用：

```text
Current Situation Card
      ↓ click
Formal Object Tree
      ↓ click
Object Expansion
```

而不是：

```text
首页
→ Project Detail
→ MiniProject Detail
→ Task Detail
```

---

## 8.2 目标

用户不是在“页面跳转”，而是在：

> 一层层拨开 Formal World。

这可以保持：

- sibling；
- ownership；
- Project 上下文；
- 结构位置感。

---

## 8.3 同一 Project 深度展开限制

为了避免页面无限增长：

> 同一 Project 默认只允许一个 child 进入深度展开态。

例如：

```text
Project
├─ MiniProject A [deep expanded]
├─ MiniProject B [compact]
└─ Task C [compact]
```

点击 B 时，A 回到紧凑状态。

---

# 9. Object Tree

展开 Project 后：

```text
Project
├─ MiniProject A
│  ├─ Task A1
│  └─ Task A2
├─ MiniProject B
└─ Task C
```

对象树目的：

- 看 ownership；
- 看 Project 内部组成；
- 看当前 Frontier 在结构中的位置；
- 看完整 Hot Formal Object；
- 查看近期完成对象的弱化存在；
- 进一步展开特定对象。

不是：

- 优先级列表；
- Kanban；
- backlog。

---

# 10. 三种对象的不同阅读语法

统一的是交互骨架，不统一的是对象展开内容。

---

## 10.1 Project

核心问题：

> 整个事情现在是什么局面？

优先内容：

```text
当前局面
当前阶段 / Objective / ProjectIntent（人类可读）
当前前沿
重要上次以来变化
对象结构
必要的 Completion / Closure 信息
工作位置
依据
技术详情
```

---

## 10.2 MiniProject

核心问题：

> 这个完整结果离完成还差什么？

建议阅读语法：

```text
MiniProject 名称

预期成果
desiredOutcome

当前局面
这个结果单元现在处于什么现实

完成条件
✓ 已满足
○ 未满足
? 不明确（若模型允许）

上次以来
关键意义变化

内部行动
Task children

所属
Project / parent

依据

工作位置

技术详情
```

MiniProject 不应只是“小 Project Dashboard”。

它的核心是：

```text
Outcome
→ Completion Gap
→ Internal Actions
```

---

## 10.3 Task

核心问题：

> 这个动作现在怎么处理？

保持轻量：

```text
Task 名称

当前状态
ACTIONABLE / WAITING / PARKED 的人类语言表达

当前推进
current_focus（若有价值）

如果 WAITING
等待什么

上次以来
仅必要时

所属
Project / MiniProject

关键依据
少量

工作位置

技术详情
```

Task 不应该拥有大量卡片结构。

---

# 11. Natural Content / Evidence 的展示原则

## 11.1 Natural Content 不成为 Console 主体

展开一个对象后，不直接列出十几条 Related Natural Content。

默认展示：

```text
压缩后的理解
+
Formal Structure
```

Natural Content 进入更深一层：

```text
依据
```

---

## 11.2 三层阅读深度

建议固定为：

```text
第一层：理解
Current Situation / Outcome / Action State

第二层：Formal Structure
ownership / completion checks / object tree

第三层：Evidence
Related Natural Content / source
```

---

## 11.3 依据只展示支撑本层理解的材料

Project：

> 只展示支撑 Project Current Situation / Frontier 的 Evidence。

MiniProject：

> 只展示支撑其 Outcome / Current Situation / Completion Gap 的材料。

Task：

> 只展示支撑当前动作状态的少量关键材料。

避免同一条 Natural Content 在多个层级反复大量展示。

---

# 12. 从 Console 回到 Logseq

## 12.1 Console 不复制 Logseq

Evidence 中只提供足够理解的紧凑预览。

例如：

```text
8 月 17 日 Journal
厂商确认兼容版本预计周三提供……

来源：[[2026-08-17]]
```

需要完整现场时：

```text
在 Logseq 中打开
```

---

## 12.2 精确定位

理想行为：

```text
Console Evidence
↓
Open in Logseq
↓
正确 Graph
↓
Page
↓
对应 Block / Anchor
↓
聚焦
```

不要只打开整个页面后让用户自己找。

---

## 12.3 Graph 不可用时

如果 Logseq Offline：

```text
当前无法打开工作位置
```

不执行自动 Graph 切换，不恢复，不改 Anchor。

---

# 13. Search 设计

## 13.1 一级结果永远是 Formal WorkObject

搜索：

```text
交换机参数
```

可能返回：

```text
完成采购技术规格书
MiniProject · 海丝独立建设

匹配依据：
近期相关工作记录提到“交换机参数”
```

而不是直接返回 Journal Block 列表。

---

## 13.2 可用于检索的数据

允许：

- Formal title；
- Formal intent / outcome；
- ownership；
- current_focus（视索引策略）；
- 已治理 Context Association；
- Evidence；
- Cold History。

---

## 13.3 不做

V0 不：

```text
实时扫描全 Logseq
→ semantic search
→ 临时猜测关系
```

这属于未来 Matcher。

---

## 13.4 与 Logseq Search 的边界

```text
Logseq Search
= 我在哪里写过什么？

Console Search
= 我记得这件工作的某个线索，它是哪件正式事项？
```

---

# 14. 独立事项

没有 Project 归属的 WorkObject 是合法 Formal 结构。

首页单独区域：

```text
独立事项
```

而不是：

```text
其他
未整理
待归属
```

---

## 14.1 无归属不是异常

```text
Unowned ≠ Mis-owned
```

只有 Matcher / Governance 未来有额外证据时，才可能产生 ownership candidate。

V0 不显示：

```text
⚠ 尚未归属 Project
```

---

## 14.2 独立 MiniProject 与独立 Task 仍使用不同阅读语法

独立 MiniProject：

> 小型完整结果单元，可拥有 Current Situation / Completion Gap。

独立 Task：

> 紧凑行动项。

---

# 15. Hot / Cold Formal World

## 15.1 Hot Work

默认主阅读面：

```text
OPEN
```

以及少量仍然帮助理解当前现实的最近结束对象。

---

## 15.2 Cold History

```text
COMPLETED
CANCELLED
```

完整保存，可搜索，可进入。

但默认退出首页。

---

## 15.3 刚结束对象

不新增：

```text
RECENTLY_COMPLETED
```

Formal lifecycle。

由 Read Model 基于：

```text
completion time
read baseline
meaningful change relevance
```

决定是否暂时显示：

```text
刚刚完成
```

或者进入：

```text
上次以来
```

之后自然沉入 History。

---

# 16. User Read Baseline

## 16.1 对象级、粒度级

分别维护：

```text
Project baseline
MiniProject baseline
Task baseline
```

看 Project 不等于看过所有 child。

---

## 16.2 主动进入才推进

V0 保守定义：

```text
页面渲染 ≠ 已读
```

只有：

```text
主动展开 Project
→ 推进 Project baseline

主动展开 MiniProject
→ 推进 MiniProject baseline

主动展开 Task
→ 推进 Task baseline
```

---

## 16.3 父级摘要覆盖不吞掉子级重入价值

Project 已经总结：

```text
技术规格书已经完成
```

则 Project 层不再重复提醒。

但用户首次重新进入 MiniProject 时，仍可看到：

```text
上次进入此 MiniProject 以来：
参数确认完成
最终校对完成
正式结束
```

---

# 17. Attention / 需要注意

## 17.1 定义

Attention 是：

> Formal World 中稳定系统一致性 / 可达性问题的过滤视图。

不是 AI Inbox，不是业务风险列表。

---

## 17.2 V0 建议包含

- OPEN object + Primary Anchor MISSING；
- 稳定 Projection Failure / Drift；
- 需要人工理解的稳定 Recovery 状态；
- Workspace / Graph mismatch；
- 明确的 Formal consistency anomaly。

---

## 17.3 不包含

- WAITING；
- PARKED；
- 长期未推进；
- Closure NOT_READY；
- Agent uncertainty；
- 无 ownership；
- Current Situation 普通 stale；
- 普通 retry；
- Graph Offline；
- 业务“进度慢”。

---

## 17.4 问题先属于事项

正常 Formal World 中：

```text
完成采购技术规格书
工作位置暂时不可用
```

Attention 中再聚合：

```text
完成采购技术规格书
海丝独立建设
工作位置暂时不可用
```

---

# 18. Workspace Offline / Anchor Missing / Graph Mismatch

必须严格区分。

## 18.1 Workspace Offline

```text
Kernel online
Logseq offline
```

含义：

> 当前无法验证 Workspace。

不等于 Anchor Missing。

---

## 18.2 Anchor Missing

必须是：

> Workspace 可验证，且对应实体明确不存在。

---

## 18.3 Graph Mismatch

例如：

```text
Production Kernel
expected graph = Real Graph

当前 Logseq = Sandbox Graph
```

必须 fail closed。

不能开始把所有 Production Anchor 判为 Missing。

---

# 19. Console 离线能力

Kernel Service 在线即可阅读：

- Formal World；
- Project；
- MiniProject；
- Task；
- ownership；
- lifecycle；
- current_focus；
- closure；
- 已缓存 Derived Cognition；
- History；
- Evidence metadata。

Logseq 离线只影响：

- Anchor verification；
- Natural Content 实时获取；
- Open in Logseq；
- Workspace availability。

---

# 20. Environment / Profile

V0：

> 单 Console = 单 Formal World。

不提供网页内：

```text
Production ▼
Sandbox
```

切换器。

通过启动层 / state dir / profile 物理隔离。

---

## 20.1 Console 必须强显示当前环境身份

例如：

```text
Task Copilot
正式事项

生产环境
工作区：My Logseq Graph
```

Sandbox：

```text
Task Copilot — Sandbox
测试环境
```

避免误认世界。

---

# 21. 技术详情 / 诊断层

V0 保留，但默认完全隐藏。

阅读深度：

```text
正常阅读
↓
依据
↓
技术详情
```

---

## 21.1 可展示

例如：

```text
Formal Object
ID
Revision

Kernel
schema / revision

Primary Anchor
graphId
UUID
state
last verified

Projection
state
obligation
verify state

Derived Cognition
revision
generatedAt
stale state

Evidence
count / revision
```

---

## 21.2 不允许

技术详情中也不提供：

- Retry；
- Force Verify；
- Reset；
- Delete；
- Edit；
- Reproject；
- SQL 操作；
- Recovery mutation。

V0 仍只读。

---

# 22. V0 明确不实现的后续能力

以下已经讨论，但保留到 V1+。

## 22.1 Presentation Feedback

未来允许：

```text
这个暂时不是当前前沿
这个才是当前关键工作面
```

这些反馈：

- 不改 Formal priority；
- 先局部生效；
- 带当时上下文；
- 现实变化后可衰减；
- 多次相似反馈后可形成模式候选；
- 最终由高级 Agent / 用户认可沉淀成全局 Skill。

V0 不实现任何反馈写入。

---

## 22.2 Recovery Governance

未来：

```text
Anchor Missing
↓
Matcher 找到候选
↓
Console 展示候选
↓
用户确认
↓
REASSIGN_PRIMARY_ANCHOR
```

V0 只观察，不操作。

---

## 22.3 Duplicate / Existing-Object-First

未来 Matcher 成熟后：

```text
Formalize 前
→ Search existing objects
→ candidate
```

不属于 Console V0。

---

# 23. Current Situation 更新机制

建议采用：

```text
语义变化
↓
Current Situation 标记 stale
↓
等待 quiet period
↓
后台有预算时更新
↓
用户先打开则显示旧摘要 + “此后有新变化”
↓
必要时触发受限刷新
```

不采用：

```text
每次打开实时 LLM
```

也不采用：

```text
每个 Block change 都重算
```

---

# 24. V0 用户心智模型

用户应该自然形成：

```text
Logseq
= 我真正工作和记录的地方

Kernel Console
= Task Copilot 记住的正式工作世界

当前局面
= 系统对这个事情现在现实的压缩理解

当前前沿
= 这个 Project 当前实际集中在哪几支工作上

上次以来
= 从我上次掌握它以后，真正重要的变化

对象树
= 这个事情的正式组成关系

依据
= 为什么系统这样理解

技术详情
= Task Copilot 自己内部发生了什么

需要注意
= 少量稳定系统问题

历史
= 已经退出当前工作面的正式工作记忆
```

---

# 25. 推荐的 V0 页面草图

```text
┌─────────────────────────────────────────────┐
│ Task Copilot                    生产环境     │
│ 正式事项 · 搜索 · 需要注意 1               │
├─────────────────────────────────────────────┤
│                                             │
│ 海丝独立建设                                │
│                                             │
│ 当前局面                                    │
│ 项目已完成谈判，目前进入方案审批与采购准备。 │
│ 技术规格书主体已完成，正在收口实施边界。      │
│                                             │
│ 当前前沿                                    │
│ ◇ 完成采购技术规格书                        │
│ ◇ 推进方案审批                              │
│                                             │
│ 上次以来                                    │
│ ✓ 项目谈判完成                              │
│ → 工作重点转入方案审批                      │
│                                             │
│                             展开项目结构  ›  │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│ 听云 APM                                    │
│                                             │
│ 当前局面                                    │
│ 旧版探针兼容问题已确认，目前等待厂商新版……   │
│                                             │
│ 当前前沿                                    │
│ ◇ K8s 探针接入 — 等待新版                   │
│ ◇ CLI 黄金链路完善                          │
│                                             │
├─────────────────────────────────────────────┤
│ 独立事项                                    │
│                                             │
│ ◇ 数据库高可用实践整理                      │
│   当前正在沉淀演练过程和关键操作流程          │
│                                             │
│ 联系厂商确认版本                            │
│   等待厂商回复                              │
│                                             │
├─────────────────────────────────────────────┤
│ 历史                         已完成 127 ›    │
└─────────────────────────────────────────────┘
```

展开：

```text
海丝独立建设
│
├─ ◇ 完成采购技术规格书
│   ├─ 确认设备参数
│   └─ 最终校对
│
├─ ◇ 推进方案审批
│
└─ 实施准备
```

再展开 MiniProject：

```text
├─ ◇ 完成采购技术规格书
│
│   预期成果
│   形成可进入采购流程的最终技术规格书
│
│   当前局面
│   主体已经完成，目前还剩实施边界收口。
│
│   完成条件
│   ✓ 项目范围
│   ✓ 主要参数
│   ○ 实施要求确认
│   ○ 最终校对
│
│   内部行动
│   ├─ 确认实施边界
│   └─ 最终校对
│
│   依据 6 · 工作位置 · 技术详情
```

---

# 26. V0 成功标准

不要只检查“页面是否做出来”。

核心验证：

## 26.1 Formal World 是否终于可理解

用户是否能快速回答：

```text
Kernel 里到底有什么？
```

---

## 26.2 Project 是否能快速重入

用户隔几天打开 Project Card，是否可以在数秒内回答：

```text
现在是什么局面？
工作前沿在哪？
上次以后发生了什么？
```

---

## 26.3 Console 是否保持安静

Kernel 对象数量增加后：

```text
用户日常看到的信息
```

不应同比增长。

---

## 26.4 是否没有成为第二套任务管理器

如果用户开始想：

```text
我应该在 Console 还是 Logseq 工作？
```

设计失败。

---

## 26.5 是否帮助 Production Dogfood 排障

体验不对时，能否从：

```text
正常阅读
→ 依据
→ 技术详情
```

快速判断问题在：

- Formal Fact；
- Context Association；
- Evidence；
- Derived Cognition；
- Projection；
- Anchor；
- Workspace。

---

# 27. 实现优先级建议

## Phase 0：最小 Read Model

先打通：

```text
Kernel objects
ownership
lifecycle
current_focus
anchor status
projection health
history
```

---

## Phase 1：首页 Project Card

实现：

```text
当前局面
当前前沿
上次以来
轻量异常
```

如果部分 Derived 数据当前不存在，可以先使用确定性 Read Model。

---

## Phase 2：原地对象树

实现：

```text
Project
→ MiniProject / Task
→ object expansion
```

---

## Phase 3：对象级阅读语法

分别完成：

```text
Project
MiniProject
Task
```

---

## Phase 4：Evidence / Logseq Jump

实现：

```text
依据
紧凑预览
Open in Logseq
```

---

## Phase 5：Search / History / Attention

---

## Phase 6：Technical Details

用于 Dogfood。

---

# 28. 架构约束

Console 不应：

```text
直接读写 SQLite 文件
```

优先：

```text
Kernel Service HTTP API
```

形成：

```text
Kernel Service
├─ Logseq Plugin
├─ CLI
├─ External Agent
└─ Kernel Console
```

Console 只是新的受控 client。

---

# 29. 最终设计宪法

> **Kernel Console 展示的是 Formal World 的阅读视图，不是 Kernel 数据库的镜子。**
>
> **关系决定世界结构，Read Model 决定阅读顺序。**
>
> **Project 先作为整体被理解，再按需展开内部结构。**
>
> **Project 看局面，MiniProject 看结果缺口，Task 看动作状态。**
>
> **Natural Content 是依据，不是 Console 主体。**
>
> **Console 帮用户理解 Formal Memory，Logseq 承载真正工作。**
>
> **V0 对工作世界严格只读，只允许记录用户阅读状态。**
>
> **系统内部可以非常复杂，但用户首先只应该看到：我的事情现在怎么样。**
