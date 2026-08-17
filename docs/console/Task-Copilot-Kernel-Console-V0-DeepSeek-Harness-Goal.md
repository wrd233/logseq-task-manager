# Goal：实现 Task Copilot Kernel Console V0

> 目标执行者：DeepSeek Harness（DSH）  
> 目标仓库：`logseq-task-manager` / `vnext`  
> 日期：2026-08-17  
> 任务性质：端到端产品实现 + 架构对齐 + 自动测试 + 真实运行验证  
> 预期结果：完成一个真正可用于 Production Dogfood 的 **Kernel Console V0**，而不是一个静态 Demo、数据库浏览器或第二套任务管理器。

---

# 0. 你首先必须做的事情

在修改任何代码之前，**完整阅读用户提供的以下两份文档**：

1. `Task-Copilot-Kernel-Console-V0-设计文档.md`
2. `Task-Copilot-Kernel-Console-设计思路与决策记录.md`

两份文档的职责不同：

- 第一份是 **最终产品与交互规格**；
- 第二份是 **为什么这么设计、哪些分支已经讨论并冻结、哪些方向明确不做**。

不要只读摘要，不要只提取 TODO。

尤其要理解：

> 这次不是“给 Kernel 做个网页管理后台”。

而是：

> **给 Task Copilot 的 Formal World 建立一个符合用户工作心智的只读观察窗口，使隐藏在后台的 Formal Memory 第一次可以被人直接、低认知负担地阅读。**

如果代码中的现状与文档存在差异：

1. **产品语义与 UX 边界以这两份设计文档为准；**
2. **现有 Kernel / Domain invariants 以当前代码与现有 vNext 规范为准；**
3. 不允许为了实现 UI 破坏已经稳定的 Kernel authority、Projection、Agent authority、Graph 边界；
4. 如出现真正无法兼容的冲突，选择最小、最安全的实现，并在最终报告中明确指出，不要静默“自行修正规格”。

---

# 1. 任务的北极星

这轮开发的成功标准不是：

```text
新增了一个 Web 页面
```

而是：

> **用户打开 Console 后，可以非常快地理解 Task Copilot 真正记住的正式工作世界；需要真正工作时仍然自然返回 Logseq。**

理想体验：

```text
打开 Console
↓
我立刻知道自己有哪些正式事项
↓
Project 首先以“当前局面”出现，而不是一堆字段
↓
必要时原地展开对象树
↓
继续展开 MiniProject / Task
↓
需要知道“为什么这样理解”时查看依据
↓
需要看完整现场时准确跳回 Logseq
↓
只有排障时才打开技术详情
```

整个过程不应该让用户感觉：

```text
“我又多了一个任务管理器。”
```

而应该感觉：

```text
“这里是 Task Copilot 记住的正式工作世界。”
```

---

# 2. 当前 Task Copilot 的架构前提

在实现 Console 前，请先从仓库和现有文档确认这些前提仍然成立。

核心心智：

```text
Logseq
= Natural Workspace
= 写、想、记录、真正推进工作

Kernel + SQLite
= Formal Truth
= 正式工作事实唯一权威

Agent / Matcher
= Cognition
= 理解现实与 Formal Object 的关系

Projection
= Kernel → Logseq 的受控映射

Governance
= 决定哪些推断能成为 Formal Change

Kernel Console
= Formal World Observer
```

Console 必须建立在这个架构上，而不是绕开它。

---

# 3. 绝对不能破坏的架构边界

## 3.1 Console 不能直接读写 SQLite 作为产品数据源

优先且原则上必须通过：

```text
Kernel Service HTTP API
```

访问 Formal World。

理想结构：

```text
Kernel Service
├─ Logseq Plugin
├─ CLI
├─ External Agent
└─ Kernel Console
```

如果当前 API 缺少 Console 所需的只读数据：

- 先检查是否已有内部 read model / query 可复用；
- 必要时增加**窄、明确、只读**的 HTTP API；
- 不要让 Console 直接绑定数据库 schema；
- 不要为了 UI 一次性暴露整个 SQLite 内部模型。

---

## 3.2 V0 对“工作世界”严格只读

禁止从 Console 执行：

- CREATE WorkObject；
- Rename；
- Complete；
- Cancel；
- Reopen；
- PARKED；
- ownership 修改；
- WorkIntent / ProjectIntent 修改；
- current_focus 修改；
- Primary Anchor reassignment；
- Reproject；
- Recovery mutation；
- Purge；
- Presentation Feedback；
- Current Frontier correction；
- Natural Content edit。

**不要因为“实现很顺手”就加按钮。**

---

## 3.3 唯一允许的持久写入：Read / Presentation State

V0 可以保存：

```text
Project User Read Baseline
MiniProject User Read Baseline
Task User Read Baseline

展开 / 折叠状态
最近停留对象
必要的本地 UI 偏好
```

注意：

```text
页面渲染 ≠ 已读
```

只有明确主动展开相应对象，才推进该对象粒度的 read baseline。

---

## 3.4 Agent 不能因为 Console 获得新的 Formal authority

不要借 Console 任务：

- 扩大 Agent 自动写权限；
- 增加 autonomous rename；
- 增加 autonomous complete；
- 增加 ownership 修改；
- 增加 anchor migration；
- 增加任何高风险 Formal Change。

本轮重点是观察 Formal World，不是扩自动化。

---

# 4. 先理解现有仓库，再决定怎么实现

在编码前完成一次有针对性的 repo reconnaissance。

至少确认：

## 4.1 Git / 分支事实

执行并记录：

```bash
git fetch origin
git status
git rev-parse HEAD
git rev-parse vnext
git rev-parse origin/vnext
git log --oneline origin/vnext..vnext
```

不要信旧报告中的 push 状态，以 Git 当前事实为准。

---

## 4.2 Kernel Service 现有能力

调查并列出：

- work object query API；
- object detail API；
- ownership / child 查询；
- history；
- lifecycle；
- current_focus；
- intent；
- ProjectIntent；
- closure；
- anchor 状态；
- projection obligation / health；
- graph session / graphId；
- evidence；
- context association；
- user read baseline；
- derived cognition；
- search；
- runtime health。

对每项标记：

```text
已有可直接复用
已有但接口不适合
需要很小扩展
当前完全缺失
```

---

## 4.3 现有 Web / UI 技术栈

不要先入为主新建一整套技术框架。

先确认 monorepo 已有：

- React / bundler；
- shared components；
- design tokens；
- TypeScript config；
- API client；
- build scripts；
- test stack；
- lint / check；
- CSS conventions。

优先复用当前工程体系。

---

## 4.4 当前 Logseq Plugin 的视觉和交互语言

Console 不是 Logseq Plugin 的复制品，但两者应属于同一个产品。

参考现有：

- Docked Sidebar；
- Object Surface；
- typography；
- marker；
- spacing；
- card density；
- system state wording。

目标是：

> Console 看起来像 Task Copilot 的 Formal World 观察面，而不是突然出现一个完全不相关的 SaaS Dashboard。

---

# 5. 建议的应用边界

如果当前仓库结构适合，优先考虑新增类似：

```text
apps/
  kernel-console/
```

但这只是推荐，不是强制路径。

无论目录如何，逻辑边界必须清楚：

```text
kernel-console
├─ api/client
├─ read-model
├─ state/read-baseline
├─ views
├─ components
└─ diagnostics
```

避免：

```text
一个巨大 App.tsx
+
直接拼所有 Kernel DTO
```

同时也不要为了“架构漂亮”做全仓大搬家。

原则：

> **新增能力沿新的模块边界生长，不为了 Console 重构已经稳定的 Kernel。**

---

# 6. V0 顶层信息架构

尽量保持极简。

主入口：

```text
正式事项
需要注意
搜索
```

历史可以作为：

```text
正式事项页面中的弱入口
```

技术详情：

```text
隐藏在对象内部
```

不要创建：

```text
Dashboard
Analytics
Governance
Agent
System
Queues
Evidence
Projection
Settings
```

这类一排系统菜单。

用户应该始终首先看到：

> **我的事情。**

---

# 7. Formal World 首页

## 7.1 首页主单位是 Project Current Situation Card

不要默认展示完整树。

首页结构大致：

```text
正式事项

[Project Current Situation Card]
[Project Current Situation Card]
[Project Current Situation Card]

独立事项
[MiniProject compact card]
[Task compact item]

历史
已完成 N · 已取消 N
```

---

## 7.2 V0 不引入“主要工作 / 其他活跃项目”的显式分区

用户已经明确要求：

> 最开始弱表现，不在这里引入过多复杂度。

因此：

- 所有 Hot Project 一个 Formal World；
- 只通过顺序、字重、卡片信息密度、留白做弱阅读引导；
- 不创建新的用户概念；
- 不新增 Formal priority。

---

# 8. Project Current Situation Card：固定骨架

卡片必须保持稳定扫描路径。

推荐顺序：

```text
Project 名称

当前局面

当前前沿（有意义时）

上次以来（有重入价值时）

轻量异常（必要时）
```

不要让 Agent / Read Model 动态重排版式。

系统的“聪明”应该体现在：

- 当前局面如何压缩；
- 哪些前沿真正值得展示；
- 上次以来是否有必要；
- 文案长度；
- 轻微视觉强弱。

而不是：

> 每个 Project 今天长得都不一样。

---

# 9. Current Situation：当前局面

回答：

> **这个 Project 现在是什么现实？**

应该是自然、短、高密度的阅读表达。

例如：

```text
项目已经完成方案谈判，目前进入方案审批与采购准备阶段。
技术规格书主体已经形成，当前仍在收口部分实施边界。
```

而不是：

```text
OPEN
ACTIONABLE=3
WAITING=1
Phase=procurement
```

---

## 9.1 Current Situation 的数据来源

允许：

```text
Formal Facts
+
已治理 Context Association
+
可信 Evidence
+
近期 Formal History
+
当前已有的受约束 Derived Cognition
```

禁止：

```text
临时扫整个 Logseq
+
embedding 找到“看起来相关”
+
直接写进 Current Situation
```

未经治理的 Relationship Hypothesis 不能污染当前局面。

---

## 9.2 不新增 Formal project_summary

如果当前系统没有合适的 Current Situation：

优先实现：

```text
deterministic / constrained read model
```

而不是给 Kernel 增加新的 Formal summary 字段。

如果需要 Agent 派生摘要：

- 必须属于 Derived Cognition；
- 可失效；
- 可重算；
- 可追溯 Evidence；
- 不能成为 Formal Truth。

---

# 10. Current Situation 的更新模型

禁止：

```text
每次打开 Console 都现场调用 LLM
```

禁止：

```text
每次 block change 就重算
```

推荐：

```text
Meaningful Semantic Change
↓
mark stale
↓
quiet period
↓
background refresh
```

如果用户先打开：

```text
显示旧摘要
+
轻提示：
“此后有新变化”
```

核心：

> **stale ≠ unusable。**

不要整张卡片进入 Loading。

---

# 11. Current Frontier：当前前沿

定义：

> **最能解释 Project 此刻为什么处于当前局面的少量 Formal Object。**

它不是：

```text
所有 OPEN
```

也不是：

```text
所有 ACTIONABLE
```

更不是：

```text
AI 给出的优先级排行
```

---

## 11.1 压缩原则

通常只显示：

```text
1–4 个
```

但不要写死 Top 3。

如果 Read Model 总想显示很多对象，应该认为压缩逻辑有问题。

---

## 11.2 内聚优先

例如：

```text
Project
└─ MiniProject A
   ├─ Task A1
   ├─ Task A2
   └─ Task A3
```

如果 MiniProject A 已足以代表该工作面：

```text
Current Frontier
= MiniProject A
```

不要同时把 A1/A2/A3 提成同级。

原则：

> **优先选择能够代表整支工作结构的最高合适粒度。**

---

## 11.3 WAITING 可以属于 Frontier

Current Frontier 回答：

> 当前工作面在哪里？

不是：

> 现在立刻能执行什么？

因此一个 WAITING MiniProject 如果决定整个 Project 当前现实，仍应该出现。

---

## 11.4 V0 不实现 Frontier Feedback

不要添加：

```text
这个不是前沿
这个才是前沿
```

按钮。

这属于后续 V1。

但为以后预留干净架构，不要把 Frontier 硬编码成无法解释的排序。

---

# 12. Meaningful Changes：上次以来

必须与 Current Situation 分开。

```text
Current Situation
= 现在是什么样

Meaningful Changes
= 从我上次知道它以后，工作意义上发生了什么
```

示例：

```text
上次以来
✓ 技术规格书完成
✓ 项目谈判结束
→ 工作重点转入方案审批
```

禁止变成系统流水账：

```text
current_focus changed
context association added
projection succeeded
```

---

## 12.1 条件出现

只有真正帮助重入时才显示。

例如：

- 长时间没有进入；
- phase 改变；
- 重要 MiniProject 完成；
- WAITING → ACTIONABLE；
- 关键 Evidence / Decision；
- 工作方向明显改变。

如果没有真正有意义的变化：

```text
不要为了填满卡片而显示。
```

---

# 13. User Read Baseline

这是 V0 唯一重要的持久写入能力之一。

必须分：

```text
Project baseline
MiniProject baseline
Task baseline
```

---

## 13.1 不允许父级吞掉子级阅读状态

用户展开 Project：

```text
只推进 Project baseline
```

不能自动推进：

```text
所有 descendant baseline
```

用户真正展开 MiniProject 后，才推进该 MiniProject baseline。

---

## 13.2 页面渲染不算读过

不要：

```text
首页一加载
→ 所有 Project baseline 都更新
```

只有显式用户进入行为算读过。

---

# 14. 点击 Project：原地渐进展开

V0 交互：

```text
Current Situation Card
↓ click
Project Formal Tree
↓ click child
Object Expansion
```

不要做：

```text
首页
→ Project详情页
→ MiniProject详情页
→ Task详情页
```

Console 应该像：

> 一层层拨开 Formal World。

---

## 14.1 保留 sibling 与 ownership 上下文

展开某个 MiniProject 时：

- 仍然看得见 sibling；
- 仍然知道它属于哪个 Project；
- 不把用户完全带离结构上下文。

---

## 14.2 控制页面长度

V0 建议：

> 同一 Project 默认仅一个 child 处于深度展开态。

其他 sibling 保持 compact。

不要整棵树同时展开成长页面。

---

# 15. 三种对象的专属阅读语法

## 15.1 Project

回答：

> 整个事情现在是什么局面？

核心：

- Current Situation；
- ProjectIntent / Objective / Phase 的人类可读表达；
- Current Frontier；
- Meaningful Changes；
- object tree；
- 必要 closure / completion 信息；
- work location；
- evidence；
- technical details。

---

## 15.2 MiniProject

回答：

> 这个完整结果离完成还差什么？

必须强调：

```text
desiredOutcome
completionChecks
current situation
completion gap
internal tasks
```

推荐顺序：

```text
MiniProject 名称

预期成果

当前局面

完成条件
✓ ...
○ ...

上次以来（必要时）

内部行动

所属

依据
工作位置
技术详情
```

MiniProject 不要做成“小 Project Dashboard”。

---

## 15.3 Task

回答：

> 这个动作现在怎么处理？

保持紧凑：

```text
Task 名称

当前状态（人类语言）

current_focus（若有价值）

等待什么（如果 WAITING）

上次以来（必要时）

所属

关键依据

工作位置

技术详情
```

不要给 Task 堆很多 panel。

---

# 16. Object Tree

展开 Project 后要能够清楚看到：

```text
Project
├─ MiniProject
│  ├─ Task
│  └─ Task
├─ MiniProject
└─ Task
```

它的目的：

- ownership；
- 完整 Formal 结构；
- Current Frontier 在结构中的位置；
- 继续下钻。

不要增加：

- drag；
- reorder；
- inline edit；
- checkbox mutation；
- priority control。

---

# 17. 独立事项

没有 Project 归属的 WorkObject 是合法结构。

必须使用：

```text
独立事项
```

而不是：

```text
其他
未整理
待归属
```

核心：

```text
Unowned ≠ Mis-owned
```

无归属本身不显示异常。

---

## 17.1 独立 MiniProject

仍作为完整结果单元显示，可有：

- current situation；
- outcome；
- completion checks；
- internal tasks。

## 17.2 独立 Task

保持紧凑。

---

# 18. Natural Content / Evidence

Console 不得重新变成 Logseq Reader。

默认只展示：

```text
压缩理解
+
Formal Structure
```

Natural Content 放到：

```text
依据
```

---

## 18.1 依据层

点击后可看到：

```text
8 月 17 日 Journal
“厂商确认兼容版本预计周三提供……”

来源：[[2026-08-17]]
```

优先展示：

- 摘要；
- 来源；
- 为什么与当前理解相关。

不需要在 Console 完整渲染整个 Page。

---

## 18.2 只展示支撑该粒度认知的 Evidence

Project：

> 支撑 Project Current Situation / Frontier 的材料。

MiniProject：

> 支撑 Outcome / Completion Gap 的材料。

Task：

> 支撑当前动作状态的少量材料。

避免同一 Evidence 在所有祖先层大量重复。

---

# 19. 回到 Logseq

Evidence / Anchor / work location 应提供：

```text
在 Logseq 中打开
```

理想：

```text
correct graph
→ page
→ exact block / anchor
→ focus
```

不要只打开整个 Page 让用户自己找。

Console 负责理解，Logseq 负责完整现场和真正工作。

---

# 20. Search

一级结果必须始终是：

```text
Formal WorkObject
```

允许通过：

- formal title；
- intent / outcome；
- ownership；
- current_focus；
- governed Context Association；
- Evidence；
- Cold History；

提高召回。

示例：

搜索：

```text
交换机参数
```

结果：

```text
完成采购技术规格书
MiniProject · 海丝独立建设

匹配依据：
近期相关记录提到“交换机参数”
```

---

## 20.1 不允许

V0 不做：

```text
临时全图 semantic scan
```

不把：

```text
Natural Block
```

作为一级搜索结果。

---

# 21. Hot / Cold Formal World

## 21.1 Hot

主要是：

```text
OPEN
```

默认首页。

## 21.2 Cold

```text
COMPLETED
CANCELLED
```

完整保存、可搜索、可进入，但默认退出首页。

---

## 21.3 刚结束对象

不要新增：

```text
RECENTLY_COMPLETED
```

Formal lifecycle。

通过 Read Model 派生：

```text
刚刚完成
```

帮助用户理解最近现实变化。

之后自然沉入 History。

---

# 22. Attention / 需要注意

Attention 不是第二套世界。

它是：

> Formal World 中稳定系统异常的过滤视图。

---

## 22.1 V0 可纳入

- OPEN object + verified Primary Anchor MISSING；
- stable Projection Drift / Failure；
- stable Recovery anomaly；
- Graph mismatch；
- 明确 Formal consistency anomaly。

---

## 22.2 V0 不纳入

- WAITING；
- PARKED；
- 长期未推进；
- Closure NOT_READY；
- Agent uncertainty；
- 无 ownership；
- ordinary stale current situation；
- temporary retry；
- Logseq Offline。

---

## 22.3 用户文案必须翻译

例如：

```text
工作位置暂时不可用
```

而不是：

```text
ANCHOR_MISSING
```

技术术语仅技术详情可见。

---

# 23. Workspace 状态语义

必须严格区分：

## Workspace Offline

```text
无法验证
```

不是错误。

## Anchor Missing

```text
Workspace 可验证，且实体已确认不存在
```

## Graph Mismatch

```text
当前 Logseq Graph 与此 Kernel / Formal World 不匹配
```

必须 fail closed。

不要因为 Logseq 关闭：

```text
需要注意 = 37
```

---

# 24. Console 必须在 Logseq 不运行时可读

只要 Kernel Service 正常：

Console 仍应展示：

- Project；
- MiniProject；
- Task；
- lifecycle；
- ownership；
- current_focus；
- intent；
- closure；
- history；
- 已有 derived cognition；
- evidence metadata。

Logseq Offline 只影响：

- anchor verify；
- natural content fetch；
- open in Logseq；
- workspace state。

这不是容错附加项，而是 Kernel 独立性的核心产品表达。

---

# 25. Environment / Profile

V0 不做：

```text
Production ▼ Sandbox
```

UI 切换器。

原则：

```text
一个 Console Runtime
= 一个 Kernel state
= 一个 Formal World
```

通过启动层 / state dir / profile 隔离。

---

## 25.1 环境身份必须清楚

Production：

```text
正式工作
```

Sandbox：

```text
测试环境
```

建议浏览器标题也体现 Sandbox。

同时显示：

- expected graph；
- current workspace online/offline/mismatch。

---

# 26. 技术详情 / Diagnostics

V0 必须保留隐藏诊断层，帮助 Production Dogfood。

阅读深度：

```text
正常阅读
↓
依据
↓
技术详情
```

---

## 26.1 可以展示

根据当前系统实际能力选择：

- workObjectId；
- revision；
- graphId；
- anchor UUID；
- anchor state；
- last verified；
- projection health；
- pending / failed obligation；
- evidence revision；
- derived cognition revision；
- stale state；
- runtime health。

---

## 26.2 不允许任何诊断写操作

禁止：

- retry；
- reset；
- force verify；
- reproject；
- delete；
- SQL；
- edit。

---

# 27. Read Model 应尽可能可解释

这点非常重要。

Current Situation / Current Frontier / Meaningful Changes 不应该只是：

```text
LLM 说了算
```

必须至少在 debug / evidence 层能够回答：

```text
为什么这个 Project 是这个局面？
为什么这个 MiniProject 被选进 Frontier？
为什么出现“上次以来”？
```

例如：

```text
Current Frontier reasons:
- current phase aligned
- recent meaningful context
- active current_focus
- waiting condition blocks project
```

正常用户不需要看这些术语，但 Dogfood 时必须能追溯。

---

# 28. 不要为了 V0 引入过多新模型

优先复用现有：

- lifecycle；
- engagement；
- current_focus；
- ProjectIntent；
- closure；
- evidence；
- context association；
- history；
- user read baseline；
- projection health；
- anchor state。

如果可以通过：

```text
derived query / read model
```

得到 Console 数据，就不要新增数据库实体。

尤其避免：

```text
console_project_card
project_summary
frontier_rank
recently_completed
attention_state
```

这类为了 UI 创建的 Formal state。

---

# 29. Current Frontier / Situation 的实现策略

如果当前项目中已有足够的 Derived Cognition：

优先复用。

如果没有：

第一版允许使用：

```text
deterministic / bounded rules
```

生成高质量 Read Model。

例如：

```text
Project phase
+
open MiniProject
+
current_focus
+
WAITING
+
recent lifecycle changes
```

先形成稳定卡片。

不要因为追求“AI 感”而强行实时调用 LLM。

---

# 30. 视觉设计原则

具体视觉实现可以自主设计，但必须遵守：

- 高信息密度；
- 少颜色；
- 弱卡片；
- 清晰层级；
- 字重 / 留白 / 缩进引导；
- 稳定阅读顺序；
- 异常才使用明显强调；
- 不把所有 taxonomy 做 badge；
- 不把每个字段做成一个独立卡片；
- 不做 SaaS Dashboard 风格的大 KPI tile；
- 不做大型彩色状态矩阵。

目标：

> **Formal World 的可折叠认知地图。**

---

# 31. 推荐实现阶段

不要一次写完再测试。

## Phase A：Baseline + API Map

产出：

- 当前 API / model 能力表；
- Console 需要的数据差距；
- 最小实现路径。

先不要大改。

---

## Phase B：Console App 骨架

完成：

- localhost 启动；
- Kernel Service client；
- environment identity；
- Formal World 基本读取；
- offline / mismatch 基本状态。

---

## Phase C：Formal World 首页

完成：

- Hot Project；
- Current Situation Card；
- 独立事项；
- History 弱入口；
- 弱排序；
- 稳定视觉骨架。

---

## Phase D：Project 原地展开

完成：

- object tree；
- single deep child；
- ownership context；
- read baseline。

---

## Phase E：MiniProject / Task 专属阅读语法

不要共用一个万能详情模板。

---

## Phase F：Meaningful Changes / Evidence

完成：

- read baseline；
- meaningful delta；
- evidence；
- source preview；
- Open in Logseq。

---

## Phase G：Search / History / Attention

完成：

- Formal Object search；
- governed context recall；
- Cold History；
- stable system attention。

---

## Phase H：Technical Diagnostics

补充用于 dogfood 的隐藏技术详情。

---

# 32. 每个阶段都要测试，不允许 UI 最后才整体测试

至少建立：

## Unit / Read Model Tests

覆盖：

- Current Frontier 压缩；
- WAITING frontier；
- highest cohesive grain；
- Meaningful Changes；
- Hot / Cold；
- recently completed derived behavior；
- Workspace Offline vs Anchor Missing；
- Graph mismatch；
- Attention filtering；
- search recall；
- baseline semantics。

---

## API / Integration Tests

覆盖：

- Console only uses Kernel Service；
- Logseq offline；
- graph mismatch；
- exact object detail；
- history；
- evidence；
- read baseline persistence；
- Console 不产生 Formal mutation。

---

## UI / Component Tests

覆盖：

- Project Card stable order；
- conditional sections；
- inline expansion；
- only one deep child；
- MiniProject / Task distinct templates；
- diagnostics hidden；
- attention wording；
- environment identity。

---

# 33. 必须做真实运行验证

自动测试通过并不等于产品完成。

至少验证：

## Scenario 1：正常 Project

```text
Project
├─ 2 MiniProjects
└─ direct Task
```

确认：

- 当前局面可读；
- Current Frontier 内聚；
- 展开结构正确；
- child 下钻自然。

---

## Scenario 2：WAITING Project frontier

确认 WAITING 结果单元仍可正确解释当前现实。

---

## Scenario 3：Meaningful Changes

制造：

```text
MiniProject complete
phase change
WAITING → ACTIONABLE
```

确认：

- Project 上次以来正确；
- child baseline 不被父级吞掉。

---

## Scenario 4：Independent WorkObject

确认：

- 独立 MiniProject 是一等结果单元；
- 独立 Task 紧凑；
- 不出现“待归属”警告。

---

## Scenario 5：Cold History

确认：

- 首页退场；
- Search 可找；
- History 可进入。

---

## Scenario 6：Logseq Offline

关闭 Logseq：

- Console 继续可读；
- 不能显示大量 Missing Anchor；
- Open in Logseq 诚实不可用。

---

## Scenario 7：Verified Missing Anchor

在可验证 Workspace 中制造真实 Anchor Missing：

- object 仍存在；
- Formal World 显示轻量异常；
- Attention 聚合；
- V0 不提供 recovery button。

---

## Scenario 8：Graph Mismatch

确认：

- fail closed；
- 不将对象批量标 Missing；
- 环境身份清晰。

---

## Scenario 9：Search by Natural Clue

Formal title 不含关键词，但 governed context 包含。

确认能找到 WorkObject，并解释命中来源。

---

## Scenario 10：Technical Details

确认正常用户界面完全不需要理解 projection / UUID；
打开技术详情后能排障。

---

# 34. 如果有浏览器 / 视觉能力，请实际 Dogfood UI

如果 Harness 环境能够：

- 启动 Web；
- 使用浏览器；
- 截图；
- 检查布局；

则必须实际检查：

- 宽屏；
- 普通桌面宽度；
- 较窄窗口；
- 长 Project 名称；
- 0/1/4 个 Current Frontier；
- 大量 History；
- long evidence preview；
- expanded tree。

重点看：

- 有没有过度卡片化；
- 信息是否太稀；
- 页面是否无限变长；
- sibling 是否仍然可见；
- 异常是否过度抢眼；
- 技术信息是否泄露进正常阅读面。

如果环境没有视觉能力：

- 不要假装做过视觉验证；
- 使用 DOM / layout / component tests；
- 在最终报告中明确说明视觉 dogfood 缺口。

---

# 35. 真实数据安全要求

不要为了测试破坏 Production Graph。

如果使用真实 Logseq：

- 优先只读；
- Console V0 不应写 Formal Work；
- 不批量重写；
- 不自动恢复 Anchor；
- 不生成侵入性 fixture。

如需要构造异常：

优先使用：

```text
sandbox / canonical fixture
```

不要在 production 中制造大量坏状态。

---

# 36. Canonical Console Fixture

如果当前没有稳定测试宇宙，建议建立一个**最小、可重复**的 fixture，用于 Console。

例如：

```text
2 Projects
4–5 MiniProjects
10–15 Tasks
```

覆盖：

- ACTIONABLE；
- WAITING；
- PARKED；
- recently completed；
- Cold History；
- independent MiniProject；
- independent Task；
- missing anchor；
- projection anomaly；
- governed context search；
- meaningful changes。

不要把 fixture 设计得过度庞大。

---

# 37. 性能与后台行为

Console 是阅读面。

要求：

- 打开首页不应触发 N×LLM；
- 展开对象不应每次重新跑大规模 cognition；
- Search 不应实时全图 semantic scan；
- 使用缓存 / read model；
- stale 可显示旧结果；
- Evidence 按需加载；
- Technical details 按需加载；
- 大历史默认不一次全部渲染。

---

# 38. 安全 / 网络

Kernel 当前是 local-first / localhost authority。

保持：

- localhost binding；
- 不新增公网暴露；
- 不为了 Console 引入云端后端；
- 不扩大信任边界；
- 不新增远程 Formal mutation 通道。

---

# 39. 不要做这些“顺手优化”

本轮明确不要：

```text
重写 Kernel
大规模移动现有 packages
全局向量数据库
通用 Matcher
自动 duplicate merge
auto ownership
Natural Content Curation
Hover toolbar
Kanban
Priority
Deadline system
Analytics dashboard
完整 Profile manager
多 Kernel UI 切换
完整恢复控制台
```

如果发现确实需要未来处理：

写进最终报告的：

```text
Deferred / Follow-up
```

不要顺手扩大 scope。

---

# 40. Git 工作方式

开发过程中：

- 保持工作区可理解；
- 使用小而语义明确的 commits；
- 不把无关重构混进 Console commit；
- 每个阶段保持 tests green；
- 不删除用户历史代码以“方便重写”；
- 不进行破坏性 Git 操作。

除非用户另有明确授权：

> **完成本地 commits 即可，不要自行 push。**

最终报告里给出：

```text
HEAD
commit list
git status
tests
known issues
```

---

# 41. 完成定义（Definition of Done）

只有满足以下条件，才能称为 Console V0 完成。

## 产品

- [ ] 用户打开后首先看到 Formal World，而不是系统内部；
- [ ] Project 默认显示 Current Situation Card；
- [ ] Card 阅读骨架稳定；
- [ ] Current Frontier 被主动压缩；
- [ ] Current Situation 与 Meaningful Changes 分离；
- [ ] Project 原地展开 Formal Tree；
- [ ] MiniProject / Task 有不同阅读语法；
- [ ] 独立事项是一等区域；
- [ ] Hot / Cold 区分成立；
- [ ] Natural Content 默认只在 Evidence 层；
- [ ] 可精确回到 Logseq；
- [ ] Search 返回 Formal WorkObject；
- [ ] Attention 是稀疏异常过滤视图；
- [ ] Technical Details 默认隐藏。

## 架构

- [ ] Console 通过 Kernel Service；
- [ ] 不直接绑定 SQLite；
- [ ] 无新增 Formal priority / rank；
- [ ] 无新增 Formal project_summary；
- [ ] Agent authority 未扩大；
- [ ] V0 没有 Formal mutation；
- [ ] Read baseline 是唯一核心持久交互状态之一；
- [ ] Workspace Offline / Missing / Mismatch 语义正确；
- [ ] Console 可在 Logseq Offline 时工作。

## 测试

- [ ] repo 原有测试保持 green；
- [ ] Console read-model tests；
- [ ] Console integration tests；
- [ ] UI / interaction tests；
- [ ] Offline / mismatch tests；
- [ ] Search / History / Attention tests；
- [ ] baseline tests。

## Dogfood

- [ ] 至少完成上述核心真实场景；
- [ ] 如有视觉能力，完成真实 UI 截图 / 浏览检查；
- [ ] 如无视觉能力，明确说明；
- [ ] 不存在明显第二套 Task Manager 倾向。

---

# 42. 最终收尾报告必须包含

完成开发后，请给出一份高质量收尾报告，至少包括：

## 42.1 结果摘要

Console V0 现在能做什么。

## 42.2 架构实现

```text
Console
→ 哪些 API
→ 哪些 read model
→ baseline 如何保存
→ Derived Cognition 如何获取
```

## 42.3 与设计文档逐项对照

明确：

```text
已完成
部分完成
Deferred
与设计存在差异
```

不要只写“基本完成”。

## 42.4 测试证据

给出：

- test commands；
- test counts；
- result；
- integration verification；
- dogfood evidence。

## 42.5 视觉 / UX 证据

如支持截图：

- 首页；
- Project 展开；
- MiniProject 展开；
- Task 展开；
- Attention；
- Search；
- Offline；
- Technical Details。

如不支持，明确说明。

## 42.6 已知问题

不要隐藏。

尤其说明：

- 哪些 Current Situation 仍为 deterministic fallback；
- 哪些 Evidence API 不完整；
- 哪些 Logseq jump 受 host 限制；
- 哪些状态没有真实 Desktop dogfood。

## 42.7 Deferred

只列真正值得以后做的：

- Presentation Feedback；
- Read Model learning；
- Recovery actions；
- Matcher；
- Duplicate detection；
- Profile manager。

## 42.8 Git 状态

```text
HEAD
local commits
origin/vnext difference
working tree
是否 push
```

---

# 43. 你拥有的自主空间

这份 Goal 对产品边界要求严格，但不希望限制你在工程实现上的判断。

你可以自主决定：

- Console 前端具体框架与目录，只要适合当前 repo；
- API DTO 具体形状；
- read-model 代码组织；
- component 分解；
- caching；
- state management；
- styling implementation；
-测试方式；
-如何复用已有 client；
-如何构造 deterministic Current Situation；
-如何设计 responsive behavior。

如果你发现：

> 有比文档建议更简单、耦合更低、长期更稳的实现方式，

可以采用。

但必须满足：

1. 不改变已经冻结的用户心智；
2. 不扩大 Formal authority；
3. 不让 Console 成为第二套 Task Manager；
4. 不让 UI schema 化；
5. 在最终报告说明你做了什么工程取舍。

---

# 44. 这轮开发真正应该追求的感觉

实现完成后，Console 不应该给人的第一感受是：

> “哇，Kernel 暴露了好多状态。”

而应该是：

> **“我终于能非常自然地看清 Task Copilot 记住的整个正式工作世界了。”**

默认阅读时：

```text
系统复杂度几乎不可见
```

需要解释时：

```text
依据可以展开
```

需要排障时：

```text
技术详情可以展开
```

需要真正工作时：

```text
回到 Logseq
```

这就是本轮工作的完成形态。

---

# 45. 最后再次强调

不要把这轮任务理解成：

> “实现一个 Kernel Web UI。”

正确理解是：

> **实现 Formal Work Memory 的人类阅读层。**

如果某项实现让 Console：

- 更像数据库；
- 更像 Jira；
- 更像第二个 Logseq；
- 更像 AI Dashboard；
- 更需要用户维护；

即使工程上很漂亮，也应该重新审视。

我们真正想得到的是：

```text
内部越来越强
↓
外部越来越安静
↓
重入越来越快
↓
用户越来越少维护系统
```

请以这个目标完成 Kernel Console V0。
