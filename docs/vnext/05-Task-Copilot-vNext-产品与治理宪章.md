# Task Copilot vNext 产品与治理宪章

> 文档定位：这不是功能列表，也不是 UI 规格，而是 Task Copilot vNext 的“产品宪法”。它回答：系统为什么存在、什么必须永远保持不变、什么可以随着实现演进、用户与 Agent / Kernel / Logseq 之间的权力边界在哪里，以及后续任何功能设计都必须遵守哪些高层原则。
>
> 适用范围：Logseq Task Copilot vNext。本文覆盖此前 V1/V2 设计积累、Phase 1～7 实现经验、Object Lens 技术原型，以及本轮 Grill Me 第 1～123 问冻结的所有核心产品决定。

---

## 1. 北极星：Task Copilot 不是“任务数据库”，而是“事务治理层”

Task Copilot 的根本问题从来不是“怎么把更多任务放进列表”，而是：现实工作从很多入口不断发生——Journal 随记、会议要求、聊天记录、文件、截图、系统故障、临时操作、项目页、Agent 对话——用户需要在**不牺牲自然记录习惯**的前提下，把真正值得持续治理的事情维持成可恢复、可行动、可结束、可追溯的工作对象。

因此 vNext 的北极星是：

1. **行动连续性**：用户隔几小时、几天、几周重新回来时，能够快速恢复“上次以后发生了什么、现在到底在哪里、接下来最自然从哪里继续”。
2. **低维护成本**：系统主动承担语义校准、上下文关联、低风险状态维护、事项发现、决策压缩，不把维护 Task Copilot 本身变成第二份工作。
3. **Formal Core 克制**：系统可以理解得很丰富，但只有那些需要稳定身份、权限保护、事务约束或长期历史连续性的内容才正式化。
4. **自然 Workspace 优先**：Logseq 是用户的工作现场，不因为加入任务治理而被迫模板化、字段化、重写或迁移。
5. **Agent 可替换**：Agent 是认知执行器，不是真相数据库，不拥有永久解释权。
6. **Kernel 唯一权威**：正式状态只有一个权威来源；UI、Logseq Managed Projection、Object Lens 都只是输入/展示层。
7. **权限越自然，来源越严格**：允许用户直接在自然语言里做决定，但必须可靠识别意图主体、时间语义、授权范围和当前上下文。
8. **自动化 ≠ 扩权**：后台运行更安静、更主动，但权限反而更窄；学习更懂用户，也不能因此获得更大写权限。
9. **现实可以领先模型**：Task Copilot 允许 Formal Model 暂时落后于真实工作，但不能伪装成已经追上；系统负责最终收敛。
10. **自然工作 Fail Open，正式治理 Fail Closed**：系统故障不能阻断用户继续工作；无法可靠验证的 Formal Mutation 宁可不提交。

一句话概括：

> **Task Copilot 的目标不是让用户维护一套更复杂的任务系统，而是让系统持续把现实工作压缩成足够小、足够可信、足够可恢复的治理结构。**

---

## 2. 四个基本角色：Workspace、Agent、Governance、Kernel

### 2.1 Logseq Natural Workspace：用户拥有的工作现场

Logseq 中的自然内容是用户真正工作的地方。用户可以：

- 在 Journal 里随手记录；
- 在 Project 页写长篇背景；
- 在某个 MiniProject 下乱记实验过程；
- 写错误判断、临时猜测、会议转述；
- 把文件路径、聊天结论、日志片段放在任何自然位置；
- 移动、改名、重组页面和 block。

系统不能要求：

- 每条工作都先变成 Task；
- 每条记录必须写属性；
- 为了让 Agent 理解而持续维护结构化模板；
- Formalization 之后搬家到“正确页面”；
- 后台为了整洁自动重写用户原文。

### 2.2 Agent：可替换的认知执行器

Agent 的职责是：

- 理解自然材料；
- 把变化与既有 WorkObject 对齐；
- 判断 low-risk operational semantics；
- 发现 Conflict / Unknown / Boundary Candidate；
- 提出 Formalization Candidate；
- 生成 Object Lens / Now 的 Derived Cognition；
- 与用户对话、Grill、解释和提出建议；
- 在明确授权下进行 Natural Content Curation。

Agent 不拥有：

- Formal Truth；
- USER 权限；
- 生命周期最终决定权；
- 通过隐藏记忆跨对象长期传播事实的权力；
- 因模型“更强”而覆盖其他 Agent 的权威等级。

### 2.3 Governance Layer：把“理解”变成“可治理变化”的中间层

关键结构包括：

- Frozen Evidence；
- User Decision；
- Proposal / Revision；
- Governance Issue；
- Formalization Candidate；
- FeedbackEvent；
- AgentRunReceipt；
- Resume Context；
- Semantic Impact；
- Projection Obligation。

它的作用是确保：

> Agent 可以自由理解，但只有经过来源、权限、版本和不变量约束的结果才能进入 Formal State。

### 2.4 Kernel：唯一正式权威

Kernel 保存正式事实并执行语义操作。它不关心某个判断来自 Codex、Claude、Built-in Agent 还是未来其他执行器；它只关心：

- 输入版本是否最新；
- Evidence 是否足够；
- operation 是否允许；
- actor/authorization 是否有效；
- Kernel invariant 是否满足；
- 是否存在 stale/conflict；
- 是否需要 USER Decision。

---

## 3. Formal WorkObject：只有三种，而且树必须浅

### 3.1 WorkObject 类型

正式工作对象只有：

- `TASK`
- `MINI_PROJECT`
- `PROJECT`

不增加：

- KR WorkObject；
- FrontierItem；
- AttentionContext；
- DailyReview；
- GovernanceIssue Task；
- ChatSession 领域对象；
- SubProject / Initiative / Epic 等任意层级。

### 3.2 Ownership 结构

合法关系：

```text
Project
├─ MiniProject
│  └─ Task
└─ Task
```

允许三种对象无 parent，形成独立对象。

禁止：

- Project → Project
- MiniProject → MiniProject
- Task → Task
- Task → anything
- 多 parent / DAG ownership

复杂结构应留在 Natural Workspace 或 Derived Cognition 中；真正超出粒度时，通过拆分、kind 变化或 ownership 迁移解决。

### 3.3 单 Parent 原则

一个 WorkObject 可以贡献给多个 Project / KR / 方向，但正式 ownership 只有一个。交叉价值默认属于认知关系，而不是第二个 parent。

---

## 4. 生命周期与投入状态：少、窄、语义稳定

### 4.1 Lifecycle

```text
OPEN
COMPLETED
CANCELLED
```

- `COMPLETED`：用户确认成果结束。
- `CANCELLED`：用户确认不再继续该真实工作。
- 正常真实工作没有普通 Delete。
- 永久 `PURGE` 只用于误创建、测试垃圾或明确数据修复。

### 4.2 Engagement

```text
ACTIONABLE
WAITING
PARKED
```

含义必须严格：

- **ACTIONABLE**：现实中仍存在合理主动推进路径。
- **WAITING**：整个 WorkObject 已经被明确外部条件阻断，没有合理主动推进路径。
- **PARKED**：用户明确决定当前阶段不主动投入。

不新增 `SCHEDULED / DEFERRED / SOMEDAY / BLOCKED` 等状态。

### 4.3 局部 blocker 不染色父对象

有局部等待项并不意味着整个对象 WAITING。一个复杂 MiniProject 完全可以：

- 整体 ACTIONABLE；
- 某个 Task WAITING；
- Lens 里显示局部“受阻方向”。

只有整个对象当前没有合理推进路径，才进入 WAITING。

### 4.4 WAITING 时 current_focus 为空

`current_focus` 表示现在正在推进的工作前沿；WAITING 表示现在没有合理主动推进路径。因此整个对象进入 WAITING 时：

```text
current_focus = null
```

“等待解除后从哪里继续”属于 Waiting 上下文或 Derived Cognition，不复用 current_focus。

### 4.5 WaitingCondition

WAITING 可以拥有少量多个正式阻塞条件，但不发展成通用依赖图或逻辑规则引擎。

原则：

- 条件必须描述为什么整个对象无法继续；
- 允许多个必要条件；
- 复杂 OR 现实用一条人类可读恢复条件表达；
- Kernel 不做通用 workflow engine；
- Agent 基于 Evidence 判断条件是否解除。

### 4.6 PARKED 的强语义

PARKED 不是“最近没做”，而是 USER-owned 的退出当前推进注意力决定。

- Agent 不能自动 PARK 或 Unpark；
- 新现实显著重新激活时，只形成 Resume Candidate；
- 用户实际重新持续工作时，可强提示“Formal State 可能失真”；
- `PARKED + 特别关注` 可以同时存在。

父对象 PARKED 时：

- 不做隐式级联；
- 但不能长期留下 ACTIONABLE 子树；
- 活跃 children 必须在同一 Decision Package 中一起暂停，或先迁出/重新归属。

---

## 5. current_focus：正式、单值、可以由 Agent 严格推断

### 5.1 它回答什么

`current_focus` 不是未完成清单，而是：

> **如果用户此刻重新进入这个 WorkObject，最有价值的正式重入锚点是什么？**

始终单值；并行方向交给子对象和 Derived Work Frontier。

### 5.2 Agent 可自动推断，但门槛严格

自动维护 current_focus 需要：

- 最新 Evidence 指向一个单一方向；
- 当前而非历史；
- 占主导；
- 低歧义；
- 反映真实工作，而非 Agent 建议。

证据强度大致：

1. 用户明确“接下来先做 X”；
2. 连续实际执行 X，并明确“明天继续 X”；
3. 一个 Work Burst 几乎都围绕 X 且仍未结束；
4. 多个并行方向无明显主次 → 不自动选；
5. Agent 认为“理论上应该 X” → 绝不能据此更新。

### 5.3 可选 Formal target

模型采用：

```text
current_focus:
  summary: 人类可读描述
  target_work_object_id: optional
```

只有唯一明确指向已有 Formal WorkObject 时才绑定 stable ID。

绑定：

- 便于稳定导航；
- 不创建对象；
- 不改变 ownership；
- 不要求所有 current_focus 都对象化。

---

## 6. Formalization：现实先发生，正式模型随后追上

### 6.1 普通 Logseq 内容默认不是 Formal WorkObject

Natural TODO、Journal 短句、随记都不会因为“看起来像任务”自动进入任务系统。

Formalization 是边界操作，必须有 USER Authorization。

### 6.2 Discovery 与 Semantic Maintenance 分离

- **Semantic Maintenance**：只持续维护 Formal WorkObject。
- **Discovery**：在“整理今天”、显式整理等受限检查点，从普通内容中寻找可能值得纳入的事项。

不做：

- 每个 block 改动都让 LLM 判断是否是 Task；
- 全 Graph 常驻任务扫描。

### 6.3 Existing-Object-First

发现新材料时优先判断：

1. 是否属于已有 WorkObject？
2. 若是，高置信度则建立 Context Association；
3. 只有无法合理吸收，且形成独立成果边界/持续性/重入价值/治理价值时，才形成 Formalization Candidate。

### 6.4 Formalization Candidate

候选：

- 可以跨会话短期保留；
- 会吸收新的支持材料；
- 可以合并；
- 被已有对象吸收、正式化或长期缺乏支持时自然失效/过期；
- 不是 Inbox；
- 用户不处理既不算 ACCEPT，也不算 REJECT。

### 6.5 kind 必须可见授权

Agent 不能在用户看不到的情况下静默决定 Task / MiniProject / Project。

但如果 Agent 已明确呈现：

> “建议作为 MiniProject 纳入 X Project”

用户说“纳入”，就同时授权 kind + parent + 已明确呈现的参数，无需重复问一次枚举值。

### 6.6 Formalization 可以携带初始 WorkIntent，但不要求填满

如果 Agent 已把 desiredOutcome / completionChecks 明确呈现在创建方案里，用户接受可以一次授权。

如果没呈现，则不能创建后后台偷偷补全。

正式化原则：

> 有多少已经清楚的正式语义，就授权多少；其余允许暂时未知。

### 6.7 创建后的基线语义校准

任何新 Formal WorkObject 创建后，立即进入一次 `FORMALIZATION_BASELINE` 校准：

- 用已有 Workspace 建立当前运行态；
- 仍遵守同样的 Evidence、权限、时间判断和 fail-closed；
- 初始化没有超级权限；
- 不借机会拆分、改 ownership、补 WorkIntent。

---

## 7. Primary Anchor：地址，不是身份

### 7.1 stable WorkObject ID 独立于 Graph

WorkObject 永久身份与 Logseq Block/Page 分离。

Primary Anchor 只是默认重入入口。

### 7.2 一个 WorkObject 最多一个 Primary Anchor

同时允许：

- 0..1 Primary Anchor；
- 0..N Context Association；
- 0..N Evidence。

一个对象可以在很多地方自然工作，但只有一个默认入口。

### 7.3 Anchor 可迁移，但需要 USER 授权

Agent 可以发现“某页面已成为主要工作现场”，但不能静默切换主入口。

旧 Anchor 迁移后可保留为 Context。

### 7.4 Anchor 丢失不等于 WorkObject 消失

删除 Anchor：

```text
Primary Anchor = missing
WorkObject = 仍存在
Formal State = 不变
```

优先确定性恢复；无法可靠恢复时，在自然触点提出重新绑定。

### 7.5 Task / MiniProject 原地正式化，Project 页面化

- Task / MiniProject：优先原地获得 identity + Anchor；
- Project：始终创建独立页面作为稳定入口；
- 原始自然内容不复制、不搬运；
- Primary Anchor 不意味着所有未来材料必须写在那里。

---

## 8. Context 与 Evidence：理解可以宽，证明必须窄

### 8.1 Context Association

高置信度“这段自然记录与某已有 WorkObject 有关”可以由 Agent 自动建立。

它必须：

- 不移动原文；
- 不重写原文；
- 有 provenance；
- 可撤销；
- 不改变 ownership；
- 不自动 Formalize。

### 8.2 自动关联不写回 Logseq

Agent 推断关系默认属于 Task Copilot 内部认知索引，不向自然 Workspace 自动添加：

- tag；
- page ref；
- property；
- metadata block。

用户主动写入 Graph 的关系是强信号；Agent 推断关系保持内部。

### 8.3 Context Association Correction

用户纠错后不能只删关系，还要保留有范围的 Association Correction：

- 当前 source/context；
- 被否定 target；
- 用户给出的正确关系（如有）；
- 适用对象版本/边界；
- 同时生成 FeedbackEvent。

不能泛化成永久关键词黑名单；对象边界真实变化后可以失效。

### 8.4 Frozen Evidence

Context 用于理解，Evidence 用于证明。

只有当具体材料实际参与 Formal Semantic 判断时，才冻结最小必要 Evidence；不把所有相关自然内容镜像进 Evidence Store。

Frozen Evidence 保存当时版本/hash，以回答：

> “当时为什么这样判断？”

### 8.5 Source 被修改后的原则

材料删除或实质修改：

- 触发相关语义重新校准；
- 不机械反转旧 Operation；
- 区分“材料变化”“事实反证”“用户改变决定”；
- USER Decision 仍是独立历史授权事实。

---

## 9. 用户自然语言就是一等治理入口，但授权必须严格编译

### 9.1 用户授权不依赖 UI 入口

可以发生在：

- Agent 对话；
- 明确 Managed Projection；
- 普通 Workspace；
- Object Lens。

只要用户已经明确、唯一、当前地表达某个决定，就不需要强制回到另一个界面二次确认。

### 9.2 User Decision Compiler

自然语言 USER Authorization 必须经过薄层编译：

- target WorkObject；
- operation；
- 参数；
- authorization scope；
- 原始用户表达；
- 输入版本；
- 是否无歧义；
- Kernel invariant revalidation。

Agent 不能直接以 USER 身份调用任意 Kernel op。

### 9.3 意图主体来源

只有可靠判断为“用户本人当前表达”的内容可以成为 USER Authorization。

以下只能是 Evidence：

- 他人说的话；
- 会议纪要；
- 引用；
- 复制材料；
- 用户转述；
- 来源不清的文本。

### 9.4 时间与语气门槛

即使是用户本人写的，也必须区分：

- 当前直接决定；
- 历史回顾；
- 条件计划；
- 假设；
- 探索；
- 被否定旧意图。

只有“当前、直接、准备现在生效”的表达才授权。

### 9.5 条件性未来计划

```text
“如果 X，就 Y”
→ 默认只是条件性用户计划

“如果 X，就自动 Y，不用再问”
→ 才可能建立严格范围的未来条件授权
```

执行前仍需重新校验对象、条件、版本和 invariants。

### 9.6 User Decision 是不可变历史事实

用户后来改变主意：

- 产生新的 User Decision；
- immediate/no-dependency 可 Undo；
- 否则用新的 Formal Operation；
- 历史不重写。

---

## 10. Proposal、Governance Issue 与“待我确认”

### 10.1 Proposal 不是所有未决问题的容器

只有存在具体 Formal Operation 候选时，才形成 Proposal。

未解决的 Conflict / Unknown / Boundary Candidate 更适合成为 lightweight Governance Issue。

### 10.2 Governance Issue

跨会话持久，但默认隐藏。

只有当其现在真正影响：

- 重入理解；
- 下一步；
- 对象边界；
- closure 判断；

才浮现。

### 10.3 “待我确认”不是 Inbox

只收：

- operation 已明确；
- 推荐已明确；
- 当前确实值得 USER 授权；
- 用户可以低认知成本完成的决定。

复杂问题仍在相关 Lens / Agent 对话中继续理解。

### 10.4 Decision Package

同一现实变化引出的多个相关决定，应在用户侧打包成一个连续上下文；Kernel 层仍执行多个窄义原子操作。

原则：

> **认知打包、授权精确、操作原子。**

用户可以“全同意”，也可以只接受其中部分。

### 10.5 Decision 原位承接

Decision Package 可以在：

- “现在”；
- Object Lens；
- Agent 对话；
- “待我确认”；

被引用和处理。

“待我确认”只是没有更自然承接位置时的兜底。

### 10.6 局部 fail-closed

未决决定只冻结对应语义维度和真正依赖它的下游判断，不冻结整个 WorkObject。

---

## 11. 后台语义维护：有界最终一致，而非实时自治

### 11.1 三个时钟

- **工作时钟**：用户在 Workspace 自由工作；
- **语义维护时钟**：后台 Agent / Kernel 追赶现实；
- **阅读时钟**：用户需要时通过 Lens / Now 重新理解。

三者不要求同步实时一致。

### 11.2 Work Burst + Dirty

不对每个 block edit 调 LLM。

默认：

> Formal WorkObject 出现有意义变化 → 用户离开/静默一段 → 形成 Work Burst 边界 → 进入持久校准队列。

Dirty 只表示：

> 有新 source change 尚未被校准覆盖。

一旦本轮 Agent 已读过 delta，即使结果是 UNKNOWN / CONFLICT，也应清 dirty；未解决问题由 Governance Issue 持续存在，防止重复死循环。

### 11.3 Delta-first bounded read

建议范围：

- L0：changed blocks + current Formal State；
- L1：root/direct context/current focus/waiting/intent/direct children；
- L2：linked Evidence/resources/parent/recent related journals；
- L3：更广 Project / Graph，只在必要时扩展。

不够就 Unknown/Needs More Context，不无限扩张。

### 11.4 local dirty 不级联祖先

子对象 source change 不直接 dirty 整棵祖先链。

子对象完成校准后，若确实影响 parent，产生轻量 `Semantic Impact`，由 parent 按自身节奏处理。

### 11.5 Snapshot-bound

每轮校准绑定：

- source version/hash；
- Formal state version；
- Evidence set/hash。

应用前重新校验；新材料可能影响判断时旧结果 stale / requeue，不允许旧 Agent 结果覆盖新现实。

### 11.6 结果类型

建议一等结果：

- CONFIRMED_CHANGE
- NO_CHANGE
- UNKNOWN
- CONFLICT
- BOUNDARY_CANDIDATE
- NEEDS_MORE_CONTEXT

### 11.7 后台自动操作白名单

允许：

- `current_focus`
- `ACTIONABLE ↔ WAITING`
- WaitingCondition
- 高置信度 Context Association
- Governance Issue creation/update

禁止静默：

- WorkIntent
- PARKED
- COMPLETE/CANCEL
- kind
- ownership
- split/merge
- CREATE
- title
- Primary Anchor migration
- Objective/KR

### 11.8 Built-in unattended Agent

后台必须有 Task Copilot 自己可调度的窄权限 Agent Executor，不能依赖 Codex/Claude session 一直在线。

Kernel / Local Service 负责：

- queue；
- snapshot；
- budget；
- freshness；
- commit。

Agent 只负责 cognition。

### 11.9 Logseq 退出后的策略

第一版：

- 队列必须持久；
- Logseq / Local Service 恢复后继续消化；
- 不要求 24×7 daemon；
- 未来按真实价值升级常驻 Local Service。

### 11.10 后台资源必须有界

- 有限并发；
- 有限上下文；
- 有限重试 + backoff；
- 执行预算；
- 队列可积压；
- 不为了清零队列无限调用 Agent。

最终一致 ≠ 立即一致。

### 11.11 后台执行与隐私范围

远程 LLM 可以用于后台，但必须绑定用户显式配置的执行档案：

- executor；
- data scope；
- context expansion range；
- allowed operations。

禁止：

- 静默 fallback 到另一个模型；
- 本地 → 远程自动越界；
- 扩大上下文读取范围；
- 为了“完成任务”绕开权限。

### 11.12 暂停后台维护

支持：

- global pause；
- per-object pause。

暂停：

- 不改变 ACTIONABLE/WAITING/PARKED；
- 继续记录变化；
- 不自动跑 Agent；
- 恢复后基于最新快照统一校准。

打开 Lens 不会偷偷解除暂停或触发 Agent；用户可以显式“一次性校准”，但暂停仍保持。

---

## 12. Graph Projection：从强事务改为最终一致派生层

早期模型：

```text
VALIDATE → PREPARE → KERNEL_APPLY → GRAPH_APPLY → VERIFY → COMMIT
```

经 Grill 修订为：

```text
VALIDATE
→ PREPARE
→ KERNEL APPLY
→ FORMAL COMMIT
→ durable Projection Obligation
→ GRAPH APPLY
→ VERIFY
→ converged
```

Kernel Formal Commit 不再被 Graph Adapter 在线状态绑架。

### 12.1 Managed Projection

现阶段 Writing Language v1 的 `[当前推进] / [等待] / [核心输出] / [完成标准]` 等，只要仍是正式 Managed Projection，就必须最终与 Kernel 收敛。

后台正式变化后：

- Kernel 先提交；
- Graph 可立即同步，也可 pending；
- 系统知道旧 Graph 只是 stale projection；
- 不把旧投影误判成新 USER intent。

### 12.2 用户直接编辑 Managed Projection

Graph 可以是 USER input surface：

```text
Graph Edit
→ semantic interpretation
→ User Decision / USER Operation
→ Kernel Commit
→ renderer 重新生成 canonical projection
```

Kernel 拒绝时，Managed Projection 需要恢复为 canonical state；用户自然内容不能因此被破坏。

---

## 13. Writing Language v2：最小常驻投影

长期方向：

> **Schema 可以丰富，但 Workspace 必须克制。**

目前 v1 保持可靠基线；未来 Object Lens 经过长期真实验证后，再逐项决定哪些 Formal Semantic 仍值得常驻正文。

长期可能：

- 对象身份 / TODO-DONE 等直接行动语义保留；
- current_focus / waiting 等高频运行态逐渐更多交给 Lens；
- WorkIntent / completionChecks 是否常驻按对象复杂度决定；
- 任何字段移出正文都必须证明有更低心智负担的可靠替代。

---

## 14. Object Lens：冻结认知契约，不冻结 UI

此前 Card / Semantic Map / Re-entry Flow、Peek / Focus / Review 只属于实验验证，不是最终产品模型。

当前只冻结：

### 14.1 Lens 是按需认知界面

不是：

- 常驻 Dashboard；
- 传统任务控制面板；
- Schema 可视化；
- Agent 建议面板。

它服务于：

- 重入；
- 回顾；
- 理解；
- 质疑；
- 必要的治理决定。

### 14.2 Reality-first

信息优先级：

1. 现实发生了什么；
2. Formal State；
3. Agent 对现实的 Derived Cognition；
4. 不确定 / Conflict；
5. Advice，默认退后一层。

### 14.3 Source / Formal / Derived 三层必须可区分

- Source correction → 回原始 Workspace；
- Formal correction → USER Operation；
- Derived correction → Feedback + cognition invalidation/recompute；
- 一句话可能同时含 Derived correction + 新 USER intent，需要分别编译。

### 14.4 不确定性语义化，不做虚假概率

内部可区分：

- direct/confirmed；
- reliable inference；
- uncertain；
- conflict。

只在不确定性影响理解时显式突出，不展示 0.83 式 confidence。

### 14.5 Meaningful Changes

“上次以后发生了什么”不是最近日志摘要，而是相对于用户认知基线的认知差异：

> 如果用户不知道这件事，他对对象当前现实的理解是否会明显错误或不完整？

完整 Source 仍可追溯。

### 14.6 用户认知基线独立于 Agent 覆盖进度

需要两条游标：

- Agent semantic coverage cursor；
- User cognitive reading cursor。

后台校准不会推进用户认知基线；只有真正有效的用户重入/Review/工作接管才推进。

### 14.7 Work Frontier

复杂 Project 默认展示当前真正活跃、影响现实理解的少量工作前沿，而不是完整 ownership tree。

工作前沿可以包含：

- Formal child；
- 少量尚未 Formalize 但现实中明确活跃的方向。

Frontier Item 本身不是持久对象，只是 Derived Cognition。

### 14.8 Formalization Candidate 门槛高于 Frontier

“现在真实在做”不等于“值得独立治理”。

认知梯度：

```text
自然材料
→ 活跃工作方向
→ Formalization Candidate
→ USER Formalization
→ Formal WorkObject
```

### 14.9 Derived Next Step ≠ current_focus

Lens 可以推导：

> “如果现在重新开始，最自然的一步是什么？”

它不是 Formal State，也不能因为被 Lens 展示就成为 current_focus 的 Evidence。

### 14.10 Lens 可承接已想明白的决定

如果问题已经压缩成：

- target 唯一；
- operation 唯一；
- 参数明确；
- 依据足够；

Lens 可以直接承接 USER Decision。

如果仍需探索、权衡、补充意图，则进入 Agent 对话。

---

## 15. “现在 / 待我确认 / 项目 / 更多”：四个顶层入口的宪法

### 15.1 现在：注意力

回答：

> **此刻什么值得进入我的意识？**

特点：

- 动态；
- 有损；
- 可解释；
- 不保存 rank/score；
- 可以为空；
- 有明确注意力预算；
- 每多显示一项都必须证明认知价值。

`ACTIONABLE` 不是充分条件；`WAITING` 也不是绝对排除条件。

### 15.2 WAITING 在“现在”中的规则

安静、没有新变化的 WAITING 默认隐藏。

仅当：

- 等待状态有 Meaningful Change；
- 恢复 ACTIONABLE；
- 影响当前其他工作；
- 存在 USER Attention；

才进入。

### 15.3 PARKED 在“现在”中的规则

默认退出。

只有现实显著重新激活时，作为 Resume Candidate / Formal-State-mismatch 浮现；仍需 USER Unpark。

### 15.4 COMPLETED/CANCELLED 在“现在”中的规则

默认完全退出。

历史补充不重新出现。

只有新现实产生行动或动摇原关闭判断时，以“Reopen vs New Follow-up”承接候选短暂浮现。

### 15.5 非 Formal work 可以极少量进入“现在”

如果真实工作已经发生、当前高度相关、Formal Model 还没追上，并且不显示会使“现在”明显失真，可以作为 Derived Cognition 出现。

不因此获得 Formal 状态，也不自动变成 Formalization Candidate。

### 15.6 Attention Context

Now 的展示单位不必等于 WorkObject。多个对象/非正式方向如果构成同一个连续行动情境，可以临时聚合。

Attention Context：

- 没有 stable ID；
- 没有 lifecycle；
- 不改变 ownership；
- 随现实自由重组。

### 15.7 USER 特别关注

不建立 HIGH/MEDIUM/LOW Priority。

保留非常轻的 USER Attention：

- Agent 不能静默加/删；
- 可以由用户指定时间/条件范围；
- 无范围则持续有效；
- 只提高动态可见性，不等于永远排第一。

### 15.8 USER 注意力抑制

允许用户说：

> “这个现在先别推给我。”

只影响 Now Projection：

- 不 PARK；
- 不改优先级；
- 不暂停后台维护；
- 不影响 Lens/Project；
- 范围优先遵循用户明确时间/条件。

### 15.9 待我确认：授权

回答：

> **还有哪些已经想明白，只差我拍板？**

极度稀疏；不是治理问题 Inbox。

### 15.10 项目：完整性

回答：

> **我正式治理的工作世界到底是什么？**

是完整、稳定、确定性的 Formal Work Map。

- 所有 Project 可找到；
- 无 parent Task/MiniProject 有独立事项入口；
- 生命周期筛选/搜索可以有；
- Agent 不能因为不重要而隐藏正式对象；
- 已关闭对象有稳定历史入口。

### 15.11 更多：控制面

回答：

> **我主动管理 Task Copilot 自己时去哪里？**

可以包含：

- 后台状态；
- Agent 执行档案；
- Skill / Taste；
- 历史/Undo；
- 调试/诊断；
- 导入导出；
- 显式整理/发现工具。

不能成为：

- unresolved issue backlog；
- candidate backlog；
- dirty queue；
- failure todo list。

用户几个月不打开“更多”，系统仍必须健康运行。

---

## 16. Project：成果地图与工作地图正交

### 16.1 Objective / KR

Project 可以拥有：

- Objective；
- 1～5 KR；
- optional Scope；
- optional current_phase。

KR 是 Formal Commitment，不是 WorkObject。

### 16.2 不维护伪精确进度

不建立：

- KR 73%；
- Project 62%；
- 通用 ON_TRACK / AT_RISK 作为 Formal State。

如果 KR 本身有真实量化指标，可以展示真实测量值。

### 16.3 Work → KR 关系默认认知化

某 MiniProject 支撑哪些 KR，Agent 可以推导。

用户明确、长期稳定、确实影响治理的关系可以正式化，但不建设通用 Relation Graph。

### 16.4 Project 收尾：双重收敛

成果侧：

- KR 是否被 Evidence 支撑兑现；

工作侧：

- 是否仍有 OPEN Formal children。

两边都收敛 + 无重大边界冲突，形成高置信度 Closure Candidate。

最终 Project COMPLETED 仍需 USER。

### 16.5 Objective 不建立独立 achieved 状态

Objective 是方向承诺，KR 是主要验证机制。

如果 KR 全满足但现实仍明显不支持 Objective：

> 这是 Objective ↔ KR 设计失配的治理问题，不再增加一个 ObjectiveStatus 补丁字段。

---

## 17. Completion、Reopen 与 Follow-up

### 17.1 completionChecks 满足 ≠ COMPLETED

完成标准满足，只意味着“具备收尾条件”。

产生 Closure Candidate，最终由 USER 关闭。

### 17.2 Parent Closure invariant

存在 OPEN formal children 时，父对象不能关闭。

如果 KR 已满足但还有 OPEN children，属于收尾治理信号：

- 取消？
- 迁移？
- 说明 KR 不完整？

不能直接 100%。

### 17.3 Reopen vs New Follow-up

核心判据：

> **是不是原来的同一个成果承诺其实仍未兑现？**

- 原完成判断被新 Evidence 推翻 → Reopen；
- 原成果真实完成后发生新故障/新阶段/新升级 → 新 WorkObject + follow-up relationship；
- 仅补历史材料 → 不行动。

CANCELLED 也按“是否仍是同一承诺边界”判断恢复还是新 Project。

---

## 18. Natural Content Curation：独立、明确 opt-in

### 18.1 后台不能自动整理 Workspace

后台 Semantic Maintenance 可以理解自然内容，但不能因为“更整洁”而：

- 移动；
- 重写；
- 删除；
- 压缩；
- 归档用户自然记录。

### 18.2 范围授权，而不是逐 Diff 审批

用户明确发起整理后：

- 低风险、可逆、保留原意的变换可以连续执行；
- 删除历史、压缩原文、改变含义、大规模重构必须再次取得更强授权。

### 18.3 Agent 派生内容不是新 Evidence

禁止自引用闭环：

```text
Agent 总结
→ 写回 Graph
→ 再把自己写的总结当 Evidence
→ 证明自己正确
```

Curated content 需要 provenance，正式判断最终追到底层 Source。

### 18.4 用户接管

Agent 生成内容一旦被用户实质编辑，默认转为 USER-owned；普通 Curation 不得再自动覆盖。

### 18.5 长期托管区域

如果用户明确希望某段自然内容由 Agent 长期维护，必须绑定明确、局部的 Managed Curation Region：

- scope；
- purpose；
- allowed transformation；
- forbidden operations。

默认 Workspace 其他区域全部 USER-owned。

---

## 19. Skill、Taste 与 Feedback：学习不能变成自我扩权

### 19.1 Feedback

来源可以包括：

- ACCEPTED；
- MODIFIED；
- REJECTED；
- IGNORED；
- UNDONE_AFTER_APPLY；
- Association Correction；
- Derived Cognition correction。

但：

> 不可见的沉默不是接受。

只有用户明确反馈，或真正看见结果后表现出与之相容的后续行为，才允许形成正反馈；后者只能是弱证据。

### 19.2 Taste

Taste 表达跨 WorkObject 稳定的协作偏好，例如：

- 推荐优先；
- 一次只问一个真正瓶颈；
- 对拆分更克制；
- current_focus 更重视明确用户主线；
- 低风险少打扰。

单个 Project 的特殊规则不自动变成 Local Taste。

第一版默认 user-level active Taste；未来只有真实证明跨场景稳定冲突时，才考虑用户可理解的少量 scope。

### 19.3 Skill

Skill 是治理政策，不是偏好。

- immutable；
- versioned；
- human-readable；
- hash-addressed；
- Agent 可以提出 candidate；
- Agent 不得覆盖或自行激活。

### 19.4 激活策略

- **Skill**：默认 USER 显式激活；
- **Taste**：在充分反馈 + replay evaluation + 不扩大权限/数据/规则的前提下，可以有限自动激活；
- 所有版本可追溯、可回退。

### 19.5 学习不能升级权限

Taste 永远不能：

- 增加 Formal operation 自动白名单；
- 改 privacy scope；
- 取消 USER confirm；
- 改 Kernel invariant；
- 让 PARKED / COMPLETE 变自动。

---

## 20. Agent Conversation：保存结果，不保存认知过程为核心事实

完整 transcript 不是 Formal Domain。

长期可信保存：

- User Decision；
- Evidence；
- Operation；
- Governance Issue；
- Feedback；
- 必要 Resume Context。

Resume Context：

- 为跨会话继续讨论服务；
- 绑定对象/版本；
- 旧现实变化后需要 revalidate；
- 不能替代 USER Authorization / Evidence。

Agent 的短期会话记忆可以跨 WorkObject 帮助自然指代，但跨对象长期生效的信息必须落到 Context/Evidence/Formal Relation/User Decision scope。

---

## 21. 多 Agent：执行器中立

Kernel 不认识“高级 Agent / 低级 Agent”。

同一 snapshot 不同 Agent 结论冲突：

- 不 last-writer-wins；
- 不模型等级覆盖；
- 重新基于 Evidence 校准；
- 仍无法消歧则 fail closed；
- 明确 USER intent 可以给出最终语义授权。

模型/Skill/Taste 升级本身不触发全库 Formal State 重算。

新版本默认只影响未来校准与 Derived Cognition；数据修复必须走显式范围、dry-run、差异审查。

---

## 22. 故障与降级：系统出问题，用户仍然能工作

总原则：

> **Natural Work Fail Open；Formal Governance Fail Closed。**

### Agent 不可用

- 用户继续写；
- Kernel 仍可执行不需要 Agent 的确定性 USER Operation；
- Agent-based cognition 延迟。

### Kernel 不可用

- Logseq 自然工作继续；
- 新材料后续重新追赶；
- Formal Mutation 不假装成功。

### Graph Adapter 不可用

- Kernel 可提交；
- Projection pending；
- 恢复后最终一致。

### Skill/执行档案有问题

- 相关自动治理暂停；
- 既有 Formal State 不失效。

系统异常提示只描述：

> 哪个能力暂时不可用、哪些理解可能不是最新、自然工作是否受影响。

---

## 23. “整理今天”：复合治理检查点，不是 Daily Review 工作流

用户说“整理今天”时，系统编排已有能力：

1. 读取当天新增材料；
2. Existing-Object-First 建立/修正 Context Association；
3. 提高今天相关 Formal WorkObject 的校准优先级；
4. 对普通内容做受限 Discovery；
5. 真正成熟且值得拍板的边界决定压缩成极少数 Decision Package；
6. 其他内容继续留在 Natural Workspace。

默认不做 Natural Content Curation。

最终输出应该是现实摘要，而不是内部流水账。

---

## 24. 反模式清单：任何未来设计碰到这些信号都要警惕

### 24.1 把所有现实都正式化

症状：

- 看到一个工作方向就建对象；
- FrontierItem/AttentionContext 全部持久化；
- 任何相关关系都进入 Relation Graph。

原则：认知丰富，Formal 克制。

### 24.2 把 Agent 内部工作转嫁给用户

症状：

- 待校准 Inbox；
- Governance Issue Inbox；
- Formalization Candidate Inbox；
- 每天必须清“更多”。

原则：系统自己承担内部积压。

### 24.3 为了安全逐操作确认

症状：

- 内容整理每移动一个 block 都问一次；
- 创建对象每个字段都确认一次。

原则：范围授权 + 精确越界确认。

### 24.4 为了智能偷偷扩权

症状：

- “模型更强所以自动覆盖”；
- “Taste 学会了所以可以自动 complete”；
- “远程模型更好所以 fallback 上传更多数据”。

原则：认知能力与权限永远分离。

### 24.5 让 UI 变成 Schema 的镜子

症状：

- Workspace 永久展示所有 Formal 字段；
- Lens 展示完整 ownership tree；
- Now 显示所有 ACTIONABLE。

原则：结构完整 ≠ 阅读时完整展示。

### 24.6 让 Graph 与 Kernel 成为双权威

症状：

- Managed Projection 旧文本反向覆盖 Kernel；
- Graph Adapter 离线导致 Formal State 无法合法更新。

原则：Kernel 唯一权威，Graph 最终一致投影。

---

# 附录 A：Grill Me 第 1～123 问冻结决策索引

> 该索引用于保证本轮讨论没有被主题化整理“吃掉”。正文负责解释原则；本附录按原 Grill 次序保留所有决策结论。

1. 允许 Agent 在用户不聊天时后台做语义校准；自动理解与自动修改分离，仅低风险、证据清晰的变化可自动落地。
2. 不实时逐 block 调 LLM；采用 Dirty accumulation + Work Burst / natural checkpoint。
3. Work Burst 默认由“对象发生有意义变化 + 安静期 + 用户已离开/不再活跃”形成。
4. 后台语义维护不自动整理、改写或重组自然 Workspace。
5. 自动提交仅 Operational Semantics：current_focus、ACTIONABLE↔WAITING、WaitingCondition；WorkIntent/PARKED/关闭/kind/ownership/split/merge 等只形成候选。
6. Boundary Candidate 不主动打扰；在下一次相关 Agent 对话、Review Lens、显式治理等自然触点浮现。
7. Dirty Lens 打开采用“可信缓存立即显示 + 后台 re-entry reconciliation”，不阻塞 UI；旧状态不能假装最新。
8. Agent delta-first、bounded context，L0→L1→L2→L3 按需扩展，不足就 Unknown/Needs More Context。
9. 子对象 source dirty 不级联祖先；只有有意义的 semantic impact 向上传播。
10. 用户直接编辑明确 Managed/Formal Projection 是强 USER intent，但仍做语义编译，不做机械字符串同步。
11. 所有 silent Agent Formal changes 必须 traceable / correctable / undoable；不默认通知。
12. 新材料与 Formal State 冲突且无法可靠裁决时 fail closed，保持现状并记录 Conflict/Unknown。
13. Conflict/Unknown 采用 dimension-level、dependency-aware fail-closed，而非整对象冻结。
14. 区分 Source Coverage/Freshness 与 Semantic Certainty/Open Issues；Agent 已读 delta 后清 dirty，未决问题另存。
15. Conflict/Unknown/Boundary Candidate 跨会话持久为 lightweight Governance Issue；只有具体 Formal op 才进入 Proposal。
16. Governance Issue 默认隐藏，只在当前对重入/下一步/边界/closure 有决策价值时浮现。
17. Recent Meaningful Changes / why-now / work frontier 等属于 Derived Cognition，可缓存但非正式权威。
18. 每个有意义 Work Burst 最终都进入持久后台校准队列；允许合并、去重、延迟、有限并发。
19. 每轮 reconciliation 绑定明确 input snapshot；apply 前 freshness revalidation，stale result 不覆盖新现实。
20. 自然内容默认归属最近 Formal WorkObject；tree 内局部 dirty，tree 外通过显式 ref/Evidence 传播。
21. Agent 可以发现新 Task/MiniProject/Project 候选，但不能静默创建 Formal WorkObject。
22. 对明确边界 Proposal，用户自然语言的清晰同意就是 USER Authorization，不需要额外按钮确认。
23. 自然语言授权必须先编译成结构化 User Decision，再成为 USER command。
24. 跨会话保存最小充分 User Decision evidence，不保存整段聊天作为授权；旧决定不可被新模型扩大解释。
25. 已执行 User Decision 是不可变历史事实；改变主意形成新 Decision/Undo/新 Operation，不重写历史。
26. Evidence 源材料删除/修改触发重新校准，不机械反演旧 Operation；USER Decision 保持独立授权历史。
27. Graph change 先机械过滤来源；抑制 Task Copilot 自身 projection / curation / identity side effects，避免自触发。
28. 完整后台 semantic maintenance 只针对 Formal WorkObject；普通 Logseq 不因“像任务”获得 dirty queue / governance / Lens。
29. Maintenance intensity 随 lifecycle：OPEN 正常；PARKED 降低/暂停；CLOSED 无 routine maintenance，只检测实质 post-closure work。
30. 后台 semantic maintenance 不每次重生成完整 Lens cognition；只 invalidation，Lens lazy/on-demand，必要时 idle prewarm。
31. 后台需要 Task Copilot 自己可无人值守调用的窄权限 Agent executor；不完全依赖外部 Codex/Claude 在线。
32. 后台任务必须持久可恢复；第一版不要求 Logseq 关闭后 24×7 继续运行 Agent。
33. 不建立日常治理队列/Inbox；正常后台状态隐形，按需系统状态，持续故障才主动提示。
34. 现阶段 Formal Semantic 仍同步现有 Managed Graph Projection；未来 Lens 成熟后逐项减少常驻投影。
35. Agent 可从自然记录严格推断 current_focus，但要求单一、当前、占主导、低歧义，不能把建议写成现实。
36. Agent 可自动推断 WAITING，但只有明确外部依赖真正阻断当前合理推进路径才成立。
37. 局部 blocker 可与 ACTIONABLE 共存；只有整个 WorkObject 没有合理主动路径才 WAITING。
38. current_focus 保持单值；并行方向交给子对象和 Derived Work Frontier。
39. 整个对象 WAITING 时 current_focus 清空；恢复后再建立。
40. ACTIONABLE 对象内部局部 blocker 默认不正式化到父对象；WaitingCondition 只描述整个对象为何 WAITING。
41. 普通 Workspace 中用户明确、无歧义的目标/完成边界/PARKED 等决定可成为 USER Authorization。
42. 只有可靠确认是用户本人当前表达的决定可授权；引用/转述/外部材料只是 Evidence。
43. 用户本人文字仍需区分当前决定与历史/假设/探索；只有当前直接生效意图授权。
44. “如果 X 就 Y”默认只是条件性计划；只有明确“到时自动执行”才建立严格未来条件授权。
45. 后台静默变化未被纠正不构成正反馈；只有用户看见后的兼容行为可算弱证据，明确反馈才强。
46. 提供 global + per-object pause unattended maintenance；与 PARKED、privacy 分离。
47. pause 状态打开 Lens 不自动 Agent；允许显式一次性校准，且不解除暂停。
48. 后台可用远程 LLM，但必须在用户事先配置的 executor/data scope 下，不静默跨界/fallback。
49. 后台资源消耗有硬约束：有限并发、上下文、重试、预算；允许积压。
50. 一次 AgentRun 可产生多个相关低风险 operation；共享批次但仍是窄义原子语义操作，不建万能 Patch。
51. 普通跨对象影响采用“最小拥有者提交→Semantic Impact→目标对象独立校准”；真正跨对象关系操作才原子事务。
52. Agent/Skill/Taste 升级不自动全库重算 Formal State；新版本默认向前生效。
53. Formalization 成功后立即触发受限 baseline reconciliation，不长期保持空壳对象。
54. 新事项发现与已有对象维护分离；只在受限自然检查点运行 Discovery，不全 Graph 常驻扫描。
55. Formalization Candidate 允许短期跨会话记忆并自然衰减，不形成永久待办。
56. Discovery Existing-Object-First：先尝试吸收到已有 Formal WorkObject，再考虑新对象。
57. 高置信度既有对象匹配可自动建立非破坏、可撤销 Context/Evidence association；不移动原文、不改 ownership。
58. 不把所有相关自然记录自动 Evidence 化；先 Context Association，真正参与 Formal 判断时再冻结最小 Evidence。
59. Agent 自动 Context Association 默认不写 tag/property/page-ref 到 Logseq；Agent 推断关系与用户 Graph 关系分离。
60. 用户纠正错误 Association 后持久化有范围的 Association Correction，防止相同现实下重复犯错。
61. kind 不能在用户不可见时静默决定；Agent 已明确呈现类型后，用户一句“纳入”可同时授权。
62. Task/MiniProject 优先原地正式化，Project 始终独立页面；Formalization 不搬运/复制自然内容。
63. WorkObject stable ID 独立于 Primary Anchor；Anchor 移动/改名/删除不改变对象身份。
64. 每个 WorkObject 最多一个 Primary Anchor + 多 Context；迁移主入口需 USER 授权。
65. Reopen vs new work 以“是否同一个未兑现成果承诺”为核心分界，而非主题相似度。
66. Formal title 不进入后台自动修改白名单；Agent 可发现失真并推荐，USER 授权后修改。
67. Writing Language v2 方向为“最小常驻投影”，具体字段退出正文要经过真实 Lens 使用验证。
68. Object Lens 只冻结认知职责/语义边界/可信度，不冻结 Peek/Focus/Review 等任何具体 UI。
69. Object Lens Reality-first，而非 Advice-first；建议默认退后一层。
70. Lens 必须诚实表达不确定性，但用语义化状态而非数值 confidence，只在影响理解时突出。
71. Lens correction 必须按 Source/Formal/Derived 分层处理，不能统一等于改 Kernel。
72. Lens 可直接承接已经想明白、只差授权的决定；复杂问题进入 Agent 对话，不强行按钮化。
73. Derived Next Step 与 Formal current_focus 分离；Agent 自己的下一步推导不能自证为 Formal State。
74. 区分 Agent semantic coverage 与 User cognitive reading baseline；“上次以后”基于后者。
75. “上次以后发生了什么”是 Meaningful Changes，不是新增记录时间线摘要。
76. 复杂 Project 的 Lens 默认展示当前工作前沿，而非完整子对象树。
77. Work Frontier 可以包含尚未 Formalize 但现实中明确活跃的方向；展示不等于 Formalization。
78. Frontier item 不自动成为 Formalization Candidate；正式化门槛更高。
79. Work Frontier Item 不持久为新领域对象，只是可缓存 Derived Cognition。
80. Natural Content Curation 必须 opt-in；后台语义维护不得自动整理自然 Workspace。
81. Curation 采用范围授权 + 连续低风险执行；信息损失/含义改变/大重构需要再次确认。
82. Agent Curation 派生内容不能成为新的独立 Evidence，也不能触发 Agent 自引用循环。
83. Agent 生成自然内容被用户实质编辑后默认 USER-owned，普通 Curation 不得自动覆盖。
84. 长期 Curation 只能发生在用户明确授权的局部 Managed Curation Region，不能开放全 Workspace 持续写权。
85. Formalization 可以一次建立已明确呈现的 WorkIntent，但不要求初始化时填满目标/完成标准。
86. completionChecks 全满足只表示 closure-ready，COMPLETED 永远仍需 USER Decision。
87. Project 不维护通用 KR 完成百分比；Formal KR + Evidence-backed reality/gap。
88. KR 不成为第四种 WorkObject；Work map 与成果 map 正交。
89. Project closure 采用成果侧(KR) + 工作侧(open children)双重收敛。
90. Objective 不拥有独立 ACHIEVED 状态；KR+Evidence 支撑，失配变 Governance Issue。
91. current_focus = human-readable summary + optional stable Formal WorkObject target。
92. WaitingCondition 可少量多个正式 blocker，但拒绝通用依赖/AND-OR workflow engine。
93. 不新增 SCHEDULED/DEFERRED engagement；“什么时候做”与“能不能做”分离。
94. 不建立 HIGH/MEDIUM/LOW Formal Priority；采用动态 attention ranking + 轻量 USER attention。
95. 特别关注是 USER-owned intent；Agent 不能静默加/删，可由用户指定时间/条件范围。
96. Now 排序不正式化，不保存 rank/score/today_order；是可解释 Derived Projection。
97. Now 以 Formal WorkObject 为主干，但可极少量展示现实已发生、尚未 Formalize 的工作。
98. “待我确认”只收明确操作+明确推荐+当前值得拍板的低认知成本决定，不收所有 unresolved issue。
99. 未处理 Decision 只冻结相关语义和依赖判断，不冻结整个对象，也不按时间自动升级催办。
100. 同一现实变化的多个决策用户侧合并成 Decision Package；Kernel 仍保持独立 operation。
101. 安静、无新变化 WAITING 默认不进 Now；只有重新产生行动/认知价值才浮现。
102. 所有 ACTIONABLE 不自动进 Now；Now 只选少量当前 attention value 足够高的事项，并允许为空。
103. PARKED 默认不进 Now；只有现实明显重新激活时以 Resume Candidate 浮现，仍需 USER Unpark。
104. COMPLETED/CANCELLED 默认退出 Now；只有现实重新产生行动或动摇旧关闭判断时短暂浮现。
105. Now 有明确 attention budget，允许有损认知压缩，不追求覆盖所有可能相关事项。
106. Now 可把多个 WorkObject/非正式方向聚合成临时 Attention Context；不是持久对象。
107. 用户可以对 Now 做独立 attention suppression，不改变 WorkObject Formal State。
108. 已成熟 Decision 若直接影响 Now Context，可在原位浮现并处理；“待我确认”只是兜底。
109. “项目”是稳定完整 Formal Work Map，不受 Agent attention filtering；独立 Task/MiniProject 也有稳定入口。
110. “更多”是低频系统控制/历史/专项工具入口，不是剩余复杂度垃圾桶。
111. 正常真实 WorkObject 不提供普通 Delete；只有误创建/测试/数据修复可受保护 Purge。
112. 父 PARKED 不隐式级联，但必须显式解决仍活跃子树：一起暂停或先迁移。
113. Formal ownership 深度受类型限制：Project→MiniProject/Task，MiniProject→Task，Task 叶节点。
114. Formal ownership 永远单 parent；跨方向贡献用其他关系/认知表达。
115. 跨 WorkObject relation 默认认知化；只有 Kernel correctness / 长期历史 / 用户明确需要时逐种正式化，不建通用 Relation Graph。
116. “整理今天”是现有治理能力的复合显式检查点，不建立独立 Daily Review 工作流。
117. Agent Conversation 不是 Formal Domain；长期保存结构化结果和轻量 version-bound Resume Context。
118. Agent 可有跨对象短期会话记忆，但长期跨对象语义必须落到 Context/Evidence/Formal Relation/User Decision scope。
119. Taste 默认 user-level 跨对象稳定协作偏好；单对象规则不形成隐形 Local Taste。
120. Skill 默认 USER 显式激活；Taste 可在严格边界下有限自动激活；学习绝不等于权限升级。
121. 不同 Agent/模型无领域层权威等级；冲突靠 Evidence/版本/治理规则/USER 决定，不 last-writer-wins。
122. Formal Commit 与 Graph Projection 解耦：Kernel 原子提交 + durable projection obligation + Graph eventual consistency。
123. Task Copilot 故障遵循 Natural Work Fail Open / Formal Governance Fail Closed。

---

# 附录 B：最终四句产品契约

如果后续设计只记得四句话，应保留：

1. **Workspace 是用户的工作现场，不是 Task Copilot 的数据库 UI。**
2. **Kernel 只保存需要稳定治理的正式事实，Agent 可以理解得远比 Kernel 存得丰富。**
3. **系统负责把复杂现实压缩成少量值得用户知道或拍板的东西，而不是把内部未决问题转嫁成 Inbox。**
4. **任何自动化都必须让用户更少维护系统，而不是让系统获得更多隐含权力。**
