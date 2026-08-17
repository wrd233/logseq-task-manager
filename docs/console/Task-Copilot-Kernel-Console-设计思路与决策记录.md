# Task Copilot Kernel Console：设计思路与决策记录

> 日期：2026-08-17  
> 来源：Task Copilot vNext 当前项目状态 + 最近多轮架构讨论 + 本轮 Grill Me  
> 目的：保存“为什么这样设计”，避免后续开发只看到最终 UI 规格，却重新打开已经解决的设计分支。

---

# 0. 为什么现在做 Kernel Console

当前 Task Copilot 已经从 Logseq Task Manager 演进为：

```text
Local-first Formal Work Kernel
+
Logseq Natural Workspace
+
Agent Cognition Layer
+
Governed Formal Operations
```

系统已经拥有比较成熟的：

- Formal Kernel；
- SQLite persistence；
- Formal Commit；
- Projection Obligation；
- Graph Adapter；
- Reconcile runtime；
- Evidence；
- User Decision；
- Agent；
- Closure；
- ProjectIntent；
- Object Surface；
- Now / Confirmation / Project / More；
- CLI；
- Backup / Restore / Doctor。

因此下一阶段的核心目标不再是：

> 把能力补得更完整。

而是：

> 进入真实 Production Dogfood，验证 Task Copilot 是否真的降低用户认知负担。

Kernel Console 被允许作为当前唯一优先新增的大能力，是因为它不是扩大业务能力，而是增加 **Formal World 可观察性**。

它可以帮助区分：

```text
系统缺能力
```

和：

```text
用户只是看不见 Kernel 当前到底发生了什么
```

---

# 1. 决策 1：下一阶段以 Production Dogfood 为主

## 结论

冻结核心 Domain / Formal Model 的扩张。

下一阶段：

```text
Production Dogfood
= 主线

Kernel Console
= 支撑观察与诊断的新增能力
```

不优先：

- 新对象类型；
- 更宽 Agent 权限；
- 大型自动化；
- 全局向量搜索；
- Hover 工具条；
- 第二套任务管理 UI。

## 原因

当前最大的未知不是：

> 系统还能不能做更多。

而是：

> 复杂的后台是否真的换来了更简单的真实工作体验。

---

# 2. 决策 2：Console 长期定位是观察 + 恢复治理，但 V0 严格只读

最初讨论了三个方向：

### A. 永久严格只读

优点：边界最干净。

缺点：未来 Anchor Recovery 等场景在 Console 看见问题后还必须去别处处理，可能产生额外摩擦。

### B. 观察为主，允许窄治理动作

未来可能合理：

- Reproject；
- Reassign Primary Anchor；
- Resolve relocation candidate；
- Recovery。

### C. 第二套 Kernel 操作前端

允许 create / complete / edit / ownership / workflow。

明确拒绝。

## 最终决策

长期：

> Console = Formal World Observatory + Recovery / Consistency Governance。

V0：

> 严格只读工作世界。

先观察真实使用中：

> 用户究竟需要直接看到什么。

再决定 V1 应开放哪些窄治理动作。

---

# 3. 决策 3：Console 必须符合用户心智，而不是系统心智

错误方向：

```text
Work Objects
Projection Obligations
Reconcile Jobs
Governance Issues
Context Associations
Agent Runs
```

这些是工程概念，不是用户理解工作的方式。

用户真正的问题是：

```text
我的正式事情有哪些？
它们现在怎么样？
它们之间是什么关系？
哪里出了问题？
```

因此首页必须是：

> Formal World。

而不是：

> System Dashboard。

---

# 4. 决策 4：首页首先展示 Formal World，而不是 Attention

曾考虑：

### A. Formal World 首页

优先看正式事项。

### B. Attention 首页

优先看 Missing Anchor / Projection Failure / Health。

最终选择 A。

原因：

1. 正常情况必须是主路径；
2. Kernel Console 不能被心智化成“只有坏了才打开的维修工具”；
3. Kernel 独立性的产品价值是：
   > 用户能直接看到 Task Copilot 真正记住的正式工作世界。

Attention 保留为稀疏聚合入口。

---

# 5. 决策 5：阅读排序不是 Formal Priority

曾讨论：

> Kernel 是否应保存 priority / rank 以控制 Console 排序？

明确否决。

原因：

一旦排序成为 Formal Fact，用户很快需要：

- 手动改优先级；
- 拖动顺序；
- P1 / P2；
- rank；
- 解决系统排序与用户排序冲突。

Console 会重新滑向传统 Task Manager。

最终：

```text
Formal Truth
↓
Presentation / Read Model
↓
阅读顺序 / 显著性
```

排序可以动态改变，不代表 WorkObject 被修改。

---

# 6. 决策 6：Formal World 以 ownership 关系为骨架

曾讨论：

### A. 稳定 ownership 结构

```text
Project
├─ MiniProject
└─ Task
```

### B. 完全动态推荐流

把最值得看的 WorkObject 从不同 Project 中打散出来。

最终选择：

> A 为骨架，B 只做局部阅读增强。

原因：

1. 保证事项高内聚；
2. 保留空间记忆；
3. Project 本身应作为完整工作边界；
4. 可以发现 Formal 结构问题；
5. 避免与 Now 重叠。

区别：

```text
Now
= 此刻最值得进入什么

Formal World
= 我的正式工作世界怎样组成
```

---

# 7. 决策 7：Project 首先作为一个整体被阅读

曾考虑：

### A. 首页直接完整展开对象树

优点：直接、完整。

缺点：很快变成对象浏览器。

### B. 先显示 Project Current Situation Card

需要时再展开对象树。

最终选择 B。

关键思想：

> Formal Object 存储结构不等于阅读结构。

Project 首页真正要回答：

```text
整个事情现在是什么局面？
哪些结果单元构成当前前沿？
```

而不是：

```text
这个 Project 有多少 Task？
```

---

# 8. 决策 8：默认 Card 展示“当前局面”

用户明确选择：

> 默认就是当前局面卡片。

点击后：

```text
Project Current Situation Card
↓
对象树
↓
每个对象继续展开
```

这定义了 Console 的基本交互：

> Formal World Explorer，而不是传统多页面 Web App。

---

# 9. 决策 9：三种对象必须使用不同阅读语法

拒绝：

```text
所有对象统一：
标题
状态
当前推进
所属
子项
历史
```

原因：

Task / MiniProject / Project 在人脑中承担不同认知角色。

最终：

```text
Project
= 整体现在是什么局面？

MiniProject
= 这个完整结果离完成还差什么？

Task
= 这个动作现在怎么处理？
```

这也是为什么 MiniProject 不能只是“小 Project”。

---

# 10. 决策 10：Current Situation 可以吸收 Natural Context，但只能用受治理材料

曾考虑：

### A. 只读 Kernel Formal Fields

优点：非常可信。

缺点：可能永远慢于真实工作。

### B. 同时吸收已关联 Natural Content / Evidence

最终选择 B。

但加限制：

```text
Formal Facts
+
已治理 Context Association
+
可信 Evidence
+
Formal History
+
受限 Derived Cognition
```

可以进入 Current Situation。

未经治理的全图相似内容不能直接进入。

因此：

```text
Relationship Hypothesis
≠
Current Situation Evidence
```

---

# 11. 决策 11：Current Situation 是 Derived Cognition，不新增 Formal Summary 字段

明确拒绝：

```text
project_summary
```

成为 Kernel Formal Fact。

否则马上产生：

- 谁修改；
- 更新时机；
- stale；
- conflict；
- Agent 权限；
- Formal Error。

Current Situation 只属于：

```text
Read Model / Derived Cognition
```

可以失效，可以重算。

---

# 12. 决策 12：Current Situation 使用事件失效 + 安静期刷新

拒绝：

### 每次打开实时 LLM

问题：

- 慢；
- 表达不稳定；
- 成本；
- Console 变成 AI Live Page。

### 每个 Block change 都更新

问题：

- 高频抖动；
- 工作 burst 被错误实时化；
- 语义维护变同步系统。

最终：

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
旧摘要仍显示
+
“此后有新变化”
```

核心原则：

> stale ≠ unusable。

---

# 13. 决策 13：“当前局面”和“上次以来”必须分开

曾考虑把二者写进同一段摘要：

> 过去两周从 A 推进到 B，现在 C……

最终拒绝。

原因：

两个认知问题不同：

```text
State
= 现在是什么现实？

Delta
= 从我上次知道它以后发生了什么？
```

最终分别呈现：

```text
当前局面
上次以来
```

“上次以来”只在有重入价值时出现，不做 Change Log。

---

# 14. 决策 14：User Read Baseline 必须对象级、粒度级

关键问题：

> 看过 Project 卡片，是否等于看过全部 MiniProject / Task？

答案：

> 不等于。

最终：

```text
Project baseline
MiniProject baseline
Task baseline
```

分别存在。

这样可以：

- 日常只看 Project；
- 一个月没进入 MiniProject；
- 真正进入时仍然得到该 MiniProject 粒度的变化摘要。

---

# 15. 决策 15：页面渲染不算“读过”

拒绝：

```text
首页渲染 10 张 Project 卡
→ 10 个 baseline 自动推进
```

V0 保守定义：

```text
主动展开 Project
→ Project baseline

主动展开 MiniProject
→ MiniProject baseline

主动展开 Task
→ Task baseline
```

这样“读过”拥有明确用户行为语义。

---

# 16. 决策 16：Project Card 允许展示 Current Frontier，但不做行动建议

曾考虑：

> 卡片是否应告诉用户“下一步应该做什么”？

最终只保留：

```text
Current Frontier
```

定义：

> 哪些 Formal Object 最能解释当前 Project 的实际工作面。

边界：

```text
Console
= 工作前沿在哪

Now
= 此刻最值得进入什么

Agent
= 具体下一步怎么推进
```

避免 Console 成为工作调度器。

---

# 17. 决策 17：Current Frontier 必须主动压缩

明确拒绝：

```text
Current Frontier
= 所有 OPEN
```

也拒绝：

```text
= 所有 ACTIONABLE
```

最终：

```text
1–4 个
```

真正解释当前局面的对象。

重要原则：

> 选择能代表整支工作结构的最高合适粒度。

如果 MiniProject 已经代表一整支工作，不把内部 Task 打散到首页。

这保证内聚性。

---

# 18. 决策 18：未来允许用户纠正 Frontier，但反馈不是 Formal Priority

未来 V1 方向：

```text
这个暂时不是当前前沿
这个才是当前关键工作面
```

这种反馈属于：

```text
Presentation Feedback
```

不属于：

```text
Formal Priority
```

用户是在纠正：

> 系统如何压缩 Formal World。

而不是维护优先级列表。

---

# 19. 决策 19：反馈先局部生效，慢泛化

拒绝：

> 用户纠正一次 → 全局行为立即改变。

最终经验分层：

```text
一次纠正
→ 当前 Project / Object 局部经验

多个场景重复
→ 模式候选

高级归纳 / 用户认可
→ 全局 Skill
```

原则：

```text
局部学习快
全局学习慢
Formal Truth 更慢
```

---

# 20. 决策 20：局部反馈是 Context-bound Soft Experience

用户说：

> “实施准备现在还不是前沿。”

系统不能永久保存：

```text
实施准备 = 非前沿
```

而应保存：

```text
当时 Project phase
当时 engagement
当时 evidence
当时 system reasoning
用户反馈
```

现实变化后：

- 降权；
- 失效；
- 可被新现实覆盖。

不采用固定 30 天 TTL。

核心：

> 语义环境变化比时间更重要。

---

# 21. 决策 21：但以上反馈机制不进入 V0

这里解决了一个重要矛盾：

如果 V0 严格只读，就不能偷偷保存 Presentation Feedback。

最终：

```text
V0
= 观察系统如何理解

V1
= 允许纠正 Read Model

V2
= 局部经验 → Skill
```

V0 只要求：

> 足够强的可解释性。

---

# 22. 决策 22：V0 可以写 Read State

“严格只读”进一步精确：

```text
工作世界只读
Presentation / Read State 可写
```

否则“上次以来”无法成立。

允许：

- User Read Baseline；
- 展开状态；
- 最近对象；
- UI state。

不允许：

- Feedback；
- Formal mutation；
- Derived Cognition edit。

---

# 23. 决策 23：Hot Formal World 为首页，Cold History 默认退场

拒绝：

> 首页完整展示所有历史对象。

原因：

半年后一定失控。

最终：

```text
OPEN
→ Hot Work
→ 首页主阅读面

COMPLETED / CANCELLED
→ Cold History
→ 完整保存、可搜索、可进入
```

---

# 24. 决策 24：刚完成对象可以短暂保留，但不新增 lifecycle

拒绝：

```text
RECENTLY_COMPLETED
```

Formal 状态。

由 Read Model 根据：

- completion time；
- read baseline；
- meaningful change relevance；

短暂显示：

```text
刚刚完成
```

或者进入：

```text
上次以来
```

之后沉入 History。

---

# 25. 决策 25：独立事项是合法一等结构

明确拒绝把 Unowned WorkObject 放入：

```text
其他
待整理
未归属
```

因为这会制造错误治理压力。

最终：

```text
独立事项
```

是正式一级区域。

原则：

```text
Unowned ≠ Mis-owned
```

无归属只是事实，不是异常。

---

# 26. 决策 26：Attention 是 Formal World 的过滤视图

拒绝：

> 再建立一套独立 System Issues World。

最终：

```text
问题首先属于事项
↓
Attention 只是聚合
```

例如：

正常页面：

```text
完成采购技术规格书
工作位置暂时不可用
```

Attention：

```text
完成采购技术规格书
海丝独立建设
工作位置暂时不可用
```

---

# 27. 决策 27：Attention 只包含稳定系统问题

V0 包含：

- Anchor Missing；
- stable Projection Drift / Failure；
- stable Recovery anomaly；
- Graph mismatch；
- Formal consistency anomaly。

明确不包含：

- WAITING；
- PARKED；
- 项目慢；
- 无归属；
- Closure NOT_READY；
- Agent uncertainty；
- Current Situation stale；
- 普通 retry。

目的：

> Attention 应该越稀疏越健康。

---

# 28. 决策 28：搜索 Formal Object，而不是搜索笔记

曾考虑：

### A. 只搜 Formal title

太弱。

### B. WorkObject 为主，但利用已关联 Natural Content 提高召回

选择 B。

### C. Natural Block 直接成为一级搜索结果

拒绝。

最终定位：

```text
Logseq Search
= 我在哪里写过什么？

Console Search
= 我记得某些工作线索，它是哪件正式事项？
```

---

# 29. 决策 29：首页项目数量最初弱处理，不引入显式分区

曾讨论：

```text
当前主要工作
其他活跃项目
```

用户明确要求：

> 最开始弱表现，不要在这里引入过多复杂度。

最终：

- 所有 Hot Project 一个 Formal World；
- 只做弱排序；
- 卡片信息密度轻微不同；
- 视觉显著性轻微不同；
- 不新增用户概念。

未来真实数量增长后再评估显式分区。

---

# 30. 决策 30：Project Card 采用稳定骨架，不允许动态版式

拒绝：

> Agent 根据当天情况自由重新排版。

最终固定：

```text
Project Name
Current Situation
Current Frontier
Meaningful Changes
Light Anomaly
```

区块可条件出现，但顺序稳定。

原因：

> 用户需要形成稳定扫描路径。

---

# 31. 决策 31：原地渐进展开，而不是详情页层层导航

选择：

```text
Card
↓
Tree
↓
Object Expansion
```

而不是：

```text
List Page
→ Project Page
→ MiniProject Page
→ Task Page
```

原因：

1. 保留 relationship context；
2. 保留 sibling；
3. 更符合 Formal World Explorer；
4. 避免 SaaS 管理后台心智；
5. 与 User Read Baseline 有自然交互映射。

---

# 32. 决策 32：同一 Project 默认只深度展开一个 child

原因：

原地展开如果无限制，会变成十几屏长页面。

最终：

```text
一个 deep expanded child
+
其他 compact siblings
```

这不是严格永远单选，而是 V0 简单限制。

---

# 33. 决策 33：Natural Content 默认进入 Evidence 层

拒绝：

> MiniProject 一展开就列出十几条 Journal。

因为 Console 会重新变成 Logseq Reader。

最终三层：

```text
理解
↓
Formal Structure
↓
Evidence
```

Natural Content 是：

> 支撑理解的依据。

不是 Console 主体。

---

# 34. 决策 34：完整现场回 Logseq 看

Console 只提供紧凑预览。

点击：

```text
在 Logseq 中打开
```

应尽可能定位到：

```text
Graph
→ Page
→ Block / Anchor
→ Focus
```

核心职责：

```text
Console
= 理解到足够判断

Logseq
= 完整现场 + 真正工作
```

---

# 35. 决策 35：Console 在 Logseq Offline 时仍应完整可用

这是 Kernel 独立性的重要产品表达。

只依赖：

```text
Kernel Service
```

即可阅读 Formal World。

Logseq Offline 只影响：

- Anchor verify；
- Natural Content；
- Open in Logseq；
- Workspace 状态。

---

# 36. 决策 36：Workspace Offline ≠ Anchor Missing

必须三分：

```text
Workspace Offline
= 无法验证

Anchor Missing
= 已验证不存在

Graph Mismatch
= 当前连接的不是这个 Formal World 的预期 Workspace
```

核心：

> UNKNOWN 不能伪装成 FALSE。

---

# 37. 决策 37：V0 不提供 Production / Sandbox UI 切换

未来需要隔离：

```text
production
sandbox
```

但 V0 不做多 Kernel 管理平台。

最终：

```text
一个 Console Runtime
= 一个 Formal World
= 一个 Kernel state/profile
```

通过启动层分离。

---

# 38. 决策 38：环境身份必须强显示

因为误认 Sandbox / Production 有真实风险。

Console 应明确展示：

- Production；
- Sandbox；
- expected graph；
- current workspace status。

但不允许 UI 中随手切换。

---

# 39. 决策 39：保留隐藏的技术详情层

看似与“符合用户心智”矛盾，但在 Production Dogfood 中非常重要。

最终形成：

```text
正常阅读
→ 我的事情现在怎么样？

依据
→ Task Copilot 为什么这样理解？

技术详情
→ Task Copilot 内部到底是什么状态？
```

技术层默认隐藏。

---

# 40. 决策 40：技术详情仍然只读

即使技术详情暴露：

- object id；
- graph id；
- anchor uuid；
- projection；
- evidence revision；
- cognition revision；

也不提供：

- Retry；
- Force；
- Reset；
- Edit；
- Delete；
- SQL。

否则 V0 会偷偷变运维控制台。

---

# 41. 当前 Console V0 最终心智

用户不需要理解 Kernel 内部复杂度。

理想用户理解只有：

```text
正式事项
= Task Copilot 真正记住的工作

当前局面
= 这件事情现在是什么现实

当前前沿
= 这个 Project 现在真正集中在哪几支工作

上次以来
= 我上次掌握以后发生了什么重要变化

对象树
= 这件事情由哪些正式结果和动作组成

依据
= 为什么系统这样理解

工作位置
= 回到 Logseq 真实现场

需要注意
= 少量真正的系统一致性问题

历史
= 已经退出活跃工作面的正式记忆
```

---

# 42. 与整个 Task Copilot 架构的关系

Console 设计再次强化了当前架构宪法：

> Kernel 不理解整个 Logseq；Logseq 不决定 Formal Truth；Matcher 只提出关系假设；Governance 决定哪些假设可以成为正式关系；Projection 只恢复系统拥有的内容；Console 只让人看见 Formal World。

新增一条产品层表达：

> **Console 不把 Kernel schema 展示给用户，而是把 Formal Truth 翻译成符合工作认知的阅读结构。**

---

# 43. Console 与未来 Matcher 的关系

V0 不依赖通用 Matcher。

未来：

```text
Anchor Missing
↓
Workspace Index / Matcher
↓
Relocation Candidate
↓
Console 展示
↓
User Decision
↓
Governance
↓
Kernel
```

Console 是候选的承载面，但 Matcher 不能直接写 Kernel。

---

# 44. Console 与未来学习机制的关系

未来 Read Model 可接受用户纠正：

```text
这个不是当前前沿
这个才是
```

形成：

```text
Context-bound Local Feedback
↓
Pattern Candidate
↓
Skill
```

这是一套“系统学习用户如何阅读工作世界”的机制。

但它不应该变成：

```text
用户手动维护排序
```

---

# 45. 为什么没有继续 Grill 更多 Console 视觉细节

到当前阶段，大部分具体视觉选择已经可以从原则推导：

- 高信息密度；
- 少颜色；
- 弱卡片；
- 稳定层级；
- 字重 / 留白 / 缩进引导；
- 异常才使用明显强调；
- 不把系统 taxonomy 全做成 badge；
- 不为每个字段画独立卡片。

因此具体：

- 圆角多少；
- 字号；
- icon；
- hover；
- spacing；
- animation；

可以交由实际视觉实现根据 Logseq / 当前 UI 风格决定。

这些不是需要用户继续承担认知负担的高层产品决策。

---

# 46. 本轮 Grill Me 暂停位置

Console 分支已基本收敛。

后续 Grill Me 原本准备继续进入：

> Production Dogfood 中后台 Agent 的主动维护到底做到什么程度。

已初步打开的判断：

- 已批准的低风险自动维护继续保留；
- 不退回全部只观察；
- 采用语义安静期；
- 避免每条 Natural Work 触发高频 Kernel 抖动；
- 成功标准是长期 Formal Memory 是否跟得上现实，而不是 Agent 每一步是否实时反应。

该分支尚未完成，当前按用户要求暂停。

---

# 47. 最后：为什么这个 Console 值得做

Kernel Console 不是因为：

> “既然有后端，就顺便做个网页。”

它解决的是当前 Task Copilot 从架构走向长期使用时的一个根本缺口：

> **Formal Truth 已经独立存在，但用户还没有一个符合自己工作心智的地方直接看见它。**

一旦 Console 成立，整个系统关系会非常清楚：

```text
Logseq
= Natural Workspace
= 我真正工作

Kernel
= Formal Work Memory
= Task Copilot 真正记住

Console
= Formal Memory Observatory
= 我直接看见 Task Copilot 记住的世界

Agent
= Cognition
= 帮我理解现实与 Formal Memory 的关系

Matcher
= Semantic Bridge
= 判断 Natural Content 与 Formal Object 可能是什么关系

Governance
= Authority Boundary
= 决定哪些理解可以改变 Formal Truth
```

而 Console 最终应该给用户的感觉不是：

> “我又多了一个任务管理器。”

而是：

> **“我终于有一个地方，可以非常快地看清 Task Copilot 记住的正式工作世界；需要真正工作时，我仍然回到 Logseq。”**
