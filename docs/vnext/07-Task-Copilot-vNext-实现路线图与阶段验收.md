# Task Copilot vNext 实现路线图与阶段验收

> 文档定位：把《产品与治理宪章》和《领域模型与 Agent 架构规范》转化为一条可持续实施路线。目标不是“一次性重写所有东西”，而是每个 Phase 都形成可独立验证的 Golden Path，并持续保持 Kernel 权威、自然 Workspace 安全、Agent 权限可控。
>
> 实施原则：vNext 允许 breaking refactor，不以兼容旧内部 API/UI/state 为目标；但用户已有 Logseq 内容必须安全保留。任何 Phase 都不能通过“先做一个通用框架以后再说”来膨胀复杂度。

---

# 1. 当前工程基线与分支策略

## 1.1 仓库定位

同一仓库继续演进：

```text
wrd233/logseq-task-manager
```

推荐长期分支语义：

- `v1-final`：稳定 V1 归档，只做必要的历史保存；
- `vnext`：正式 vNext 产品实现主线；
- `experiment/*`：本地实验分支，不作为产品语义来源。

## 1.2 Object Lens 实验代码必须与正式主线隔离

此前 Object Lens 原型已经验证：

- Logseq Macro Renderer 可行；
- Block Renderer Slot 存在替换原 block 内容的风险；
- Lens 可以 Source → Logseq block 定位；
- Derived → Evidence → Source 可行；
- 多 Lens、不同宽度、Active Frontier scaling 均有可行原型。

但是这些仅是技术/认知实验。

后续原则：

> **Object Lens 的 UI 可以完全重构，之前 Card / Semantic Map / Re-entry Flow / Peek / Focus / Review 全部只作为研究材料，不作为实现约束。**

实验代码建议继续留在本地-only：

```text
experiment/object-lens-cognitive-lab
```

无 upstream，不 push；正式产品 UI 只有在新的认知契约验证后，才选择性移植必要基础设施。

## 1.3 已知阶段实现历史

历史阶段已经验证了一批基础能力：

- Phase 1/2：Kernel、SQLite current state、Commit ledger、Graph Adapter、transaction/recovery/undo；
- Phase 3：current_focus Agent path；
- Phase 4：ACTIONABLE↔WAITING；
- Phase 5：Task closure；
- Phase 5.5：Writing Language v1；
- Phase 6：External CLI Agent Bridge；
- Phase 7：MiniProject Governance / WorkIntent / Taste candidate。

历史 Phase 7 commit：

```text
ee31d4f0e50a3c2f9c490c73f8530c8a543f2951
```

当时测试记录：127/127。

这些代码应视为：

> **能力资产和测试基线，而不是新架构必须兼容的旧接口。**

---

# 2. 总体实施策略：先治理基础，再认知 UI

不建议下一步直接做“大而全 Object Lens”或“完整 Now 页面”。

原因：

- UI 依赖后台语义维护的 freshness / provenance / issue / decision package；
- 没有这些，Lens 只能展示静态字段；
- 一旦 UI 先行，很容易为迁就原型反向污染领域模型。

推荐顺序：

```text
Phase 8   Formal Kernel vNext hardening
Phase 9   Source Coverage + Reconciliation Queue
Phase 10  Context Association + Evidence v2
Phase 11  User Decision Compiler + Decision Package
Phase 12  Discovery / Formalization v2
Phase 13  Background Unattended Agent
Phase 14  Projection Obligation / Final Consistency
Phase 15  Project Objective/KR + Closure
Phase 16  Now / Pending / Formal Work Map information model
Phase 17  Object Lens UX re-exploration + production integration
Phase 18  Natural Content Curation
Phase 19  Taste / Skill learning governance
Phase 20  Reliability / Recovery / Product hardening
```

Phase 编号不是神圣的；真正重要的是依赖关系和验收边界。

---

# 3. Phase 8：Formal Kernel vNext Hardening

## 3.1 目标

先把 Grill 后已经冻结的 Formal Core 收紧，使后续 Agent / UI 不再依赖旧的模糊状态。

重点：

- lifecycle / engagement 语义；
- ownership 浅树；
- stable ID / Primary Anchor；
- WorkIntent / ProjectIntent；
- narrow semantic operations；
- protected Purge；
- current_focus optional target；
- WaitingCondition[]；
- user attention。

## 3.2 要实现

### A. WorkObject invariants

必须新增/验证：

```text
Project -> MiniProject / Task only
MiniProject -> Task only
Task leaf
single parent
no cycle
closed parent cannot have OPEN child
WAITING -> current_focus=null
PARKED parent cannot persist ACTIONABLE descendant
```

最后一条可采用：Kernel 拒绝“单独 PARK parent”并返回需要决策子树的结构化错误，而不是 Kernel 自己级联。

### B. CurrentFocus v2

从单纯字符串扩展为：

```text
summary
optional targetWorkObjectId
```

保持 backward reader 仅用于阶段性收敛，不继续扩展旧格式兼容性。

### C. WaitingCondition v2

支持少量数组条件；拒绝通用 dependency expression。

### D. ProjectIntent

新增：

- objective；
- 1~5 keyResults；
- optional scope；
- optional current_phase。

KR 不做 WorkObject，不做 progress field。

### E. Operations

至少明确：

```text
CREATE_WORK_OBJECT
UPDATE_TITLE
SET_CURRENT_FOCUS
CHANGE_ENGAGEMENT
SET_WAITING_CONDITIONS
UPDATE_WORK_INTENT
UPDATE_PROJECT_INTENT
SET_USER_ATTENTION
CLEAR_USER_ATTENTION
REASSIGN_PRIMARY_ANCHOR
CHANGE_OWNERSHIP
COMPLETE_WORK_OBJECT
CANCEL_WORK_OBJECT
REOPEN_WORK_OBJECT
AMEND_CLOSURE_RECORD
PURGE_WORK_OBJECT (protected)
```

不实现 generic object patch。

## 3.3 Golden Paths

### GP8-1：WAITING 多条件

1. MiniProject ACTIONABLE；
2. USER / Agent 使其 WAITING；
3. conditions = 厂商新版 + 测试窗口；
4. current_focus 自动 null；
5. 只解除厂商新版 → 仍 WAITING；
6. 两项都解除 → 进入 reconciliation，不由 Kernel 规则引擎自动 ACTIONABLE。

### GP8-2：浅 ownership

- Project 下创建 MiniProject；
- MiniProject 下创建 Task；
- 尝试 MiniProject→MiniProject 被 Kernel 拒绝；
- 尝试 Project→Project 被拒绝；
- 尝试多 parent 被拒绝。

### GP8-3：PARK parent

- Project 有 ACTIONABLE MiniProject；
- USER 只请求 PARK Project；
- Kernel/Compiler 返回“需要一并解决活跃 children”；
- 用户决定整棵暂停 → multiple narrow operations atomic/ordered；
- 用户决定保留 child → 先 ownership migration，再 park。

### GP8-4：Protected Purge

- 误创建且无依赖 → explicit protected purge；
- 有 child/evidence/history ref → 需要更强 repair workflow 或拒绝；
- 普通 UI 不把 Purge 当 lifecycle action。

## 3.4 验收

- 所有 invariants 有单元测试；
- operation actor/capability matrix 代码化；
- 无 generic patch API；
- WorkObject schema 不引入第四种类型；
- ProjectIntent 不引入 KR lifecycle/progress。

## 3.5 明确不做

- Relation Graph；
- Discovery；
- background queue；
- Object Lens UI。

---

# 4. Phase 9：Source Coverage 与 Reconciliation Queue

## 4.1 目标

实现“有界最终一致”的核心运行机制：

> 用户自由工作 → 系统机械记录变化 → Work Burst → persistent queue → bounded Agent reconciliation。

## 4.2 关键数据

### Source Coverage State

每个 Formal WorkObject 至少需要知道：

```text
lastObservedSourceSnapshot
lastReconciledSourceSnapshot
formalVersionAtLastReconcile
hasUncoveredChanges
```

不要用 `dirty=true` 同时表达：

- 有新材料；
- 有 conflict；
- Agent失败；
- 有待确认。

这些必须分开。

### ReconcileJob

持久化 queue，支持：

- dedupe；
- merge to latest snapshot；
- retry/backoff；
- stale；
- pause；
- priority class。

## 4.3 Work Burst detection

第一版保持简单：

- Formal WorkObject subtree/source 出现 substantive user changes；
- quiet period；
- user leaves / no longer active；
- merge into one burst。

quiet period 可配置但不要先做复杂自适应模型。

## 4.4 Graph mechanical filtering

必须首先区分：

```text
USER_NATURAL_EDIT
USER_MANAGED_PROJECTION_EDIT
SYSTEM_PROJECTION_WRITE
SYSTEM_CURATION_WRITE
IDENTITY_WRITE
STRUCTURAL_MOVE
UNKNOWN_EXTERNAL_EDIT
```

系统写入抑制 self-loop。

## 4.5 Local dirty 不 cascade

child changed：

- only nearest Formal WorkObject dirty；
- parent 不立即跑 Agent；
- 后续由 Semantic Impact 触发。

## 4.6 Golden Paths

### GP9-1：连续编辑只产生一轮 Agent

用户连续改 12 个 block → one Work Burst → one queued reconciliation。

### GP9-2：system projection 不自触发

Kernel change → renderer writes `[当前推进]` → Graph event observed → classified SYSTEM_PROJECTION_WRITE → no new reconcile job。

### GP9-3：Agent 已读但 Unknown

- source dirty；
- Agent reads latest delta；
- result UNKNOWN；
- source coverage 更新到 latest；
- dirty cleared；
- Governance Issue persists；
- 不重复无限跑同一 evidence。

### GP9-4：stale run

- Run starts snapshot V10；
- user writes V11；
- Agent returns；
- freshness check fails；
- old result discarded/stale；
- queue latest snapshot。

## 4.7 验收

- queue persistence across process restart；
- dedupe；
- backoff；
- no self-trigger loop；
- source coverage 与 governance issue 状态分离。

---

# 5. Phase 10：Context Association + Evidence v2

## 5.1 目标

建立：

> “相关材料”与“正式证据”严格分层。

## 5.2 Context Association

实现内部 association store，不写 Logseq tag/property。

支持：

- agent-created；
- user-created；
- invalidation；
- correction；
- source version tracking。

## 5.3 Existing-Object matching

先做规则 + Agent hybrid，不做通用 embedding graph mega-system。

Input signal：

- current page/workspace locality；
- explicit references；
- existing Anchor；
- current active objects；
- WorkIntent/title；
- temporal continuity；
- ownership context。

Output：

```text
MATCH_HIGH_CONFIDENCE
MATCH_AMBIGUOUS
NO_EXISTING_MATCH
```

只有 HIGH_CONFIDENCE 自动关联。

## 5.4 Association Correction

实现 user correction memory：

- 不只 delete；
- 在相同 scope 下阻止重犯；
- 不泛化成 keyword blacklist；
- boundary version change 可 invalidate。

## 5.5 Evidence freeze

实现最小 freeze API：

```text
freeze sourceRef@version
→ EvidenceID
```

支持：

- content hash；
- provenance；
- supports links；
- source material changed → affected semantic re-evaluation trigger。

## 5.6 Golden Paths

### GP10-1：Journal 自动关联，不污染 Graph

- Journal 写法务探针新版；
- Agent high-confidence match existing MiniProject；
- internal Context Association created；
- Journal 无新增 property/tag/ref；
- Lens/CLI 可查询关联来源。

### GP10-2：错误关联纠正

- Agent 误关联梅北数据库记录到听云；
- USER 纠正；
- association removed；
- correction record saved；
- next same-scope matching respects correction。

### GP10-3：Context 不自动 Evidence

- 10 条 related blocks；
- Reconciliation 只用 2 条支撑 WAITING→ACTIONABLE；
- only 2 Frozen Evidence generated。

### GP10-4：source correction

- Evidence based on “正式新版已到”；
- user later corrects source “其实只是测试包”；
- old Evidence remains immutable；
- new source hash triggers re-reconcile；
- no mechanical inverse operation。

## 5.7 验收

- Context 和 Evidence 表/接口分离；
- automatic association never writes natural Graph；
- evidence history immutable；
- corrections scoped/version-aware。

---

# 6. Phase 11：User Decision Compiler + Decision Package

## 6.1 目标

实现最重要的自然交互能力：

> 用户在哪里表达决定都可以，但必须可靠编译为明确授权。

## 6.2 User Decision Compiler

输入：

- user utterance / direct managed edit；
- current target context；
- current Formal State；
- active Proposal/Decision Package；
- source provenance。

输出：

```text
AUTHORIZED_DECISION
AMBIGUOUS_NEEDS_ONE_QUESTION
NOT_A_DECISION
HISTORICAL_OR_HYPOTHETICAL
EXTERNAL_SPEAKER_EVIDENCE_ONLY
```

## 6.3 provenance gate

必须测试：

- 用户亲自“这个停掉” → USER intent；
- “领导说这个停掉” → Evidence only；
- “当时我决定停掉” → historical；
- “如果周五还没新版就停” → conditional plan；
- “如果周五还没新版就自动停，不用问” → conditional authorization candidate。

## 6.4 Decision Package

Agent 可以把同一现实变化中的：

- title；
- WorkIntent；
- Anchor；
- kind；
- ownership；

等多个边界建议包装成一个 context，但 Kernel op 独立。

支持 partial acceptance。

## 6.5 “待我确认”语义 API

不要实现“list all issues”。

只返回：

```text
mature decisions requiring current user authorization
```

复杂 Governance Issue 不进入。

## 6.6 Golden Paths

### GP11-1：Agent recommendation + “同意”

Agent 已明确：

> 建议把当前方向作为 MiniProject 纳入 Project A，目标 X，完成标准 Y。

USER：“同意。”

Compiler 生成：

- CREATE kind=MINI_PROJECT；
- parent=A；
- title；
- WorkIntent；

无需额外表单。

### GP11-2：普通 Workspace authorization

USER natural block：

> 完成标准改一下，至少稳定观察一天再结束。

明确当前对象/主体/时间 → UPDATE_WORK_INTENT USER Decision。

### GP11-3：引用不得授权

Paste：

> “王工：OA 这块不用做了。”

→ Evidence only，不能 CANCEL / change scope。

### GP11-4：partial decision package

USER：

> 标题和 Anchor 按建议改，完成标准先不动。

→ accepted operations 2；remaining decision remains unresolved without blocking unrelated semantic maintenance。

## 6.7 验收

- Agent never impersonates USER；
- original utterance + exact scope persisted；
- old Decision cannot be reinterpreted by newer Skill to expand authorization；
- ambiguous case asks exactly one needed question。

---

# 7. Phase 12：Discovery / Formalization v2

## 7.1 目标

把“碎片记录 → 值得治理的对象”尽量外包给 Agent，同时不制造候选 Inbox。

## 7.2 Discovery entry points

第一版只支持：

- `整理今天`；
- explicit discover within bounded source；
- perhaps low-frequency journal checkpoint after product validation。

不全 Graph 常驻扫描。

## 7.3 Candidate threshold

Candidate 不是“能起标题”。至少综合：

- independent outcome；
- persistence；
- re-entry need；
- completion boundary；
- governance value；
- existing-object mismatch。

## 7.4 Candidate decay

实现：

- strengthen；
- merge；
- expire；
- absorbed；
- materialized。

不要做复杂 workflow statuses。

## 7.5 Spatial formalization

### Task / MiniProject

- 原地 formalize；
- stable ID；
- Primary Anchor = existing block；
- preserve natural children/text。

### Project

- create independent page；
- minimal skeleton；
- original source remains where it was；
- association/evidence link to origin。

## 7.6 Baseline reconciliation

Formalization 成功后 immediately enqueue `FORMALIZATION_BASELINE` interactive-priority job。

但：

- 不扩写 WorkIntent；
- 不 split；
- 不改 ownership；
- 不 park/complete。

## 7.7 “整理今天” Golden Path

输入：一天 Journal。

期望输出类似：

> 今天主要推进海丝采购规格书和法务探针验证。法务新版已到，Formal State 已恢复可推进；另有一次服务器上架协作，但更像一次性现场工作，不建议正式化。当前只有一项边界建议：规格书工作已形成独立 MiniProject，建议纳入海丝项目。

而不是显示内部 counts。

## 7.8 验收

- no auto CREATE；
- existing-object-first；
- candidate never creates user backlog by itself；
- formalization no content migration；
- baseline uses same reconciliation engine。

---

# 8. Phase 13：Built-in Unattended Agent

## 8.1 目标

让后台 semantic maintenance 不依赖外部 Agent session。

## 8.2 Execution Profile

至少实现：

- executor；
- local/remote；
- allowed data scope；
- max L0-L3 context expansion；
- file evidence permission；
- shell permission（后台默认否）；
- auto mutation capability；
- budget。

## 8.3 Provider strategy

第一版不要做 provider mega-framework。

实现一个明确、可用的 Built-in executor interface 即可；未来第二 provider 出现时再抽象共性。

## 8.4 Background pause

实现：

- global pause；
- per-object pause；
- manual reconcile once；
- pause does not clear queue/source change；
- Lens read does not auto unpause。

## 8.5 Budget

默认保守：

- concurrency 1~2（具体实现可调）；
- bounded expansion；
- retry backoff；
- no infinite retries；
- queue persistence。

不要把预算数字暴露成日常 UI。

## 8.6 Golden Paths

### GP13-1：后台运行低风险变化

Work Burst → Built-in Agent → Evidence → WAITING→ACTIONABLE + current_focus → Kernel commit。

### GP13-2：boundary candidate 不执行

Agent 认为应该改 WorkIntent → create/update Governance Issue/Proposal → no Formal mutation。

### GP13-3：no executor

Executor unavailable → queue remains → no silent provider fallback → system health eventually shows degraded background maintenance。

### GP13-4：pause

per-object pause → source change recorded → no Agent run → Lens shows last trusted state + unreconciled changes → manual one-shot reconcile works → pause remains。

## 8.7 验收

- no privilege difference due to model strength；
- AgentRunReceipt complete；
- remote scope explicit；
- no silent data expansion。

---

# 9. Phase 14：Projection Obligation / Graph 最终一致

## 9.1 目标

正式完成第 122 问对早期事务模型的修订。

## 9.2 Formal commit sequence

```text
validate
prepare
kernel apply
verify formal invariants
commit ledger
create projection obligation
```

Graph apply 不再阻塞 Formal commit。

## 9.3 Projection worker

处理：

- canonical render；
- anchor availability；
- apply；
- verify hash/version；
- retry/backoff；
- system-write provenance。

## 9.4 Managed edit input

USER 直接改 Managed Projection：

```text
Graph user edit
→ classify as USER_MANAGED_PROJECTION_EDIT
→ semantic compile
→ USER operation
→ Kernel
→ canonical re-render
```

Kernel 拒绝：

- managed projection 恢复 canonical；
- 用户其他 natural content 不受影响。

## 9.5 Golden Paths

### GP14-1：Logseq offline

- background Formal commit succeeds；
- ProjectionObligation=PENDING；
- reopen Logseq；
- adapter syncs latest version；
- old Graph text never interpreted as new user state。

### GP14-2：projection write failure

- retry；
- Formal ledger unchanged；
- long failure becomes system health, not user todo。

### GP14-3：concurrent user edit

- user modifies managed projection while pending；
- detect actual user intent vs old stale text；
- compile against latest Formal version；
- no lost update。

## 9.6 验收

- restart-safe outbox/projection queue；
- no formal rollback due to Graph offline；
- no dual authority。

---

# 10. Phase 15：Project Outcome Model / Closure

## 10.1 目标

把 Objective/KR 从“字段”变成真正可治理但克制的成果模型。

## 10.2 实现

- UPDATE_PROJECT_INTENT USER operation；
- KR evidence assessment as cognition；
- metric-backed real measurement optional；
- Project closure readiness derived；
- Objective/KR mismatch Governance Issue；
- work→KR contributions default derived。

## 10.3 Closure Golden Paths

### GP15-1：KR fulfilled + children closed

→ Lens/Agent reports closure-ready → USER complete → CompletionRecord。

### GP15-2：KR fulfilled + open child

→ no complete；
→ Agent explains child may need cancel/move or KR may be incomplete；
→ Decision Package。

### GP15-3：children closed + KR gap

→ no complete；
→ identify missing outcome/evidence/intent mismatch。

### GP15-4：KR fulfilled but Objective contradicted

→ Governance Issue；
→ no `objective_achieved=false` formal field。

## 10.4 验收

- no generic percentage；
- no KR WorkObject；
- no Objective lifecycle；
- Project closure remains USER-only。

---

# 11. Phase 16：顶层四视图的信息模型

> 这一 Phase 先做“信息契约和数据源”，不要急着做最终视觉设计。

## 11.1 “现在”

先实现 projection engine / API：

- dynamic attention selection；
- explanations；
- no rank persistence；
- attention budget；
- optional Attention Context aggregation；
- user attention signal；
- attention suppression；
- lifecycle surfacing rules；
- rare active nonformal work。

### Now API Golden Path

同一天 14 个 ACTIONABLE objects + 3 WAITING + 1 reopened reality：

API 只输出 2~4 个真正有当前价值的 contexts，并说明“为什么现在”。

不输出 score=87。

## 11.2 “待我确认”

API 只查询 mature decisions：

- user authorization needed；
- current decision value；
- low cognitive cost；
- no better natural context。

不要 query all GovernanceIssue。

## 11.3 “项目”

确定性 Formal Work Map：

- Project；
- independent Task/MiniProject；
- lifecycle filter；
- history；
- search。

绝不使用 Agent ranking 决定 existence visibility。

## 11.4 “更多”

系统控制与深度审计 API：

- queue status；
- background pause；
- executor profile；
- operation history；
- projection lag；
- Skill/Taste；
- diagnostics。

不显示为 backlog。

## 11.5 验收

- 四入口数据职责互不重叠；
- Now 可以为空；
- Pending 极少；
- Project 完整；
- More 长期不打开系统仍健康。

---

# 12. Phase 17：Object Lens 重新设计与产品化

## 12.1 重要前提

**不要直接把之前实验原型生产化。**

新一轮设计从认知契约出发：

- Reality-first；
- Meaningful Changes relative to user cognitive baseline；
- Formal/Source/Derived distinction；
- uncertainty/conflict；
- Work Frontier；
- Derived Next Step；
- Advice secondary；
- Source traceability；
- direct mature decisions；
- deep Agent discussion for unresolved ambiguity。

## 12.2 应重新探索的 UI 问题

全部开放：

- spatial vs linear；
- inline vs overlay；
- macro vs other Logseq UI host；
- always-hidden vs contextual affordance；
- Task/MiniProject/Project 是否不同 grammar；
- how Meaningful Changes unfolds；
- how evidence/provenance exposed；
- how uncertainty appears；
- how decision package anchored；
- how narrow split panes adapt。

## 12.3 不允许 UI 反推 Domain

如果某 UI 想要：

- FrontierItem stable ID；
- LensMode Formal State；
- persistent node positions；
- generic field edit mode；

必须先证明它真的属于 domain correctness，而不是为了前端方便。

默认拒绝。

## 12.4 Cognitive cursor

实现 User Cognitive Baseline：

- Lens meaningful re-entry；
- relevant Agent discussion；
- real active work；
- explicit review；

才推进。

短暂页面 open / background Agent 不推进。

## 12.5 Interaction contracts

### Source

click → navigate to original Logseq source；修改回原文。

### Formal

明确操作 → User Decision Compiler → Kernel。

### Derived

“这个不对” → feedback / invalidate/recompute；如果用户同时明确新 formal intent，则另行编译。

### Complex governance

进入 Agent discussion；不硬塞几个按钮。

## 12.6 Golden Path

用户 2 周后打开 MiniProject Lens：

- 立即展示 trusted cache；
- 标识有最近未覆盖材料时的 freshness；
- Meaningful Changes 只显示真正改变现实的 3 件事；
- Formal current state；
- Derived next step；
- 一个重要 unresolved conflict；
- source/evidence 可追溯；
- “完成标准可能已满足”可直接承接 USER complete decision；
- UI 不展示完整 tree/dashboard。

## 12.7 验收

重点不是像素，而是：

- 3~10 秒能否恢复连续性；
- 是否减少重新读 Workspace；
- 是否不会把 Agent 建议伪装成现实；
- 是否能追溯；
- 是否不会变成任务 Dashboard；
- 是否在 640/720/900 split 下仍合理。

---

# 13. Phase 18：Natural Content Curation

## 13.1 目标

让 Agent 真正可以在用户明确授权后替用户整理自然内容，但不把这种能力混入后台语义维护。

## 13.2 One-shot Curation

User：

> 把这个 MiniProject 最近记录整理一下，资源归到 `[资源]`，历史过程不要删。

Agent：

- 可连续执行低风险范围内操作；
- 不逐 block ask；
- 输出 change summary；
- supports undo。

## 13.3 Risk taxonomy

低风险：

- 新增轻量标题；
- 同类靠近；
- move explicit links into resource section；
- format normalization；
- add non-destructive summary。

高风险：

- delete；
- summarize-and-delete；
- rewrite judgement；
- erase historical mistakes；
- large cross-workspace restructure。

高风险需新 Decision。

## 13.4 Provenance

Agent-derived content：

- source lineage；
- curation run；
- not independent evidence；
- system graph write suppressed from semantic dirty。

## 13.5 User takeover

用户实质编辑 Agent-generated region → managed status stops / USER-owned。

## 13.6 Managed Region

后续支持明确长期托管：

- one region；
- one purpose；
- narrow allowed transform；
- explicit USER authorization；
- no whole-workspace managed mode。

## 13.7 验收

- no self-evidence loop；
- no overwrite user-taken-over content；
- no silent delete；
- no curation triggered by background semantic maintenance。

---

# 14. Phase 19：Taste / Skill 学习治理

## 14.1 Feedback capture

覆盖：

- accepted；
- modified；
- rejected；
- undo；
- association correction；
- cognition correction；
- weak visible acceptance。

禁止把 invisible silence 记为 positive。

## 14.2 Taste Candidate

聚合稳定跨对象模式。

重要 classifier：

```text
这是用户级稳定协作偏好？
还是对象自身的特殊事实/边界？
```

后者不能写入 global Taste。

## 14.3 Taste evaluation

回放真实历史 case：

- current_focus accuracy；
- over-formalization；
- unnecessary question count；
- correction rate；
- boundary misclassification；
- interruption rate。

Taste candidate 只改 behavior preference，不改 capability。

## 14.4 Skill candidate

Agent 可以：

- 分析 Feedback；
- 生成候选 markdown Skill；
- replay/evaluate；
- 说明 differences/risks。

不能自己 activate。

## 14.5 Golden Path

用户多次纠正“最近出现最多 ≠ current focus” → feedback aggregation → Taste candidate → replay improvement → limited auto activate → later user correction can attribute regression to new Taste version and rollback。

## 14.6 验收

- every AgentRun records skill+taste version；
- active version changes traceable；
- no capability escalation；
- no per-object hidden Taste system。

---

# 15. Phase 20：Reliability / Recovery / Product Hardening

## 15.1 故障注入测试

必须主动测试：

- Kernel down；
- Agent provider down；
- Logseq closed；
- projection write fails；
- stale Agent result；
- source edited during run；
- duplicate queue jobs；
- restart mid operation；
- Skill missing；
- remote executor scope denied；
- Graph identity missing；
- Anchor deleted；
- user edits stale Managed Projection。

## 15.2 Fail-open/fail-closed acceptance

每种故障都回答：

```text
用户还能不能继续自然写？  必须 YES
错误 Formal change 会不会提交？ 必须 NO
系统是否能恢复追赶？       必须 YES
```

## 15.3 Recovery

- persistent queue；
- projection obligation；
- deterministic retry；
- stale invalidation；
- idempotent apply where possible；
- no background duplicate side effects。

## 15.4 System Health UX

正常隐形。

持续异常时告诉用户：

- 哪个能力不可用；
- 哪些对象可能未校准；
- Natural Workspace 是否安全；
- 是否会自动恢复。

不产生“系统维护任务”给用户。

---

# 16. 测试体系建议

## 16.1 测试金字塔

### Kernel unit tests

最密集：

- invariants；
- operation authorization；
- lifecycle；
- ownership；
- current_focus/WAITING；
- Decision scope；
- protected purge。

### Contract tests

- Agent Result schema；
- Evidence freeze；
- User Decision Compiler；
- Projection Obligation；
- Graph Adapter classification。

### Reconciliation scenario tests

使用 deterministic fake agent cases：

- NO_CHANGE；
- UNKNOWN；
- CONFLICT；
- multi-change；
- stale；
- boundary candidate。

### Real Agent replay tests

使用固定 source packs + expected semantic bounds，验证：

- 不过度 Formalize；
- 不越权；
- unknown 时愿意停；
- current_focus 不把建议当现实。

### Real Logseq Golden Path

必须继续在 Logseq Desktop 实机验证：

- identity；
- user edit detection；
- projection write suppression；
- Anchor moves；
- split pane；
- Project page；
- natural Journal work。

## 16.2 测试优先级

比 UI snapshot 更重要：

1. Formal correctness；
2. permission correctness；
3. provenance；
4. stale/recovery；
5. no self-loop；
6. no user-content loss；
7. cognitive usefulness；
8. visual polish。

---

# 17. 每个 Phase 的通用 Definition of Done

一个 Phase 不能只以“代码写完”结束。至少满足：

1. **语义文档**：本 Phase 新增的 Formal/Derived 边界清楚；
2. **Kernel tests**：所有新增 invariant/operation 有测试；
3. **权限测试**：USER / AGENT / SYSTEM / external path 明确；
4. **stale test**：旧输入不会覆盖新现实；
5. **recovery test**：重启/失败可恢复；
6. **real Logseq test**：涉及 Graph 的能力必须实机；
7. **no Graph pollution**：未授权自然内容不被改写；
8. **no new Inbox**：没有把内部状态转成用户 backlog；
9. **no generic framework inflation**：新增抽象必须由两个真实 use case 证明；
10. **Golden Path report**：有一份从用户操作到最终状态的端到端证据。

---

# 18. Implementation Guardrails：Codex 必须遵守

后续给 Codex 的 Goal 建议固定包含以下约束。

## 18.1 先读原则，再读旧代码

不得从旧接口“顺手扩展”出新语义。

顺序：

1. 产品与治理宪章；
2. Domain/Agent Spec；
3. 当前 Phase Goal；
4. 现有代码作为可复用实现资产。

## 18.2 不自行扩大 Phase

Codex 若发现：

- 通用 Relation Graph；
- generic workflow；
- migration framework；
- provider framework；
- Object Lens UI mega-rewrite；

“以后可能有用”，默认不做。

## 18.3 允许重构，但保护用户 Graph

仓库代码可 breaking refactor；真实 Logseq Graph：

- 不删除用户内容；
- 不大规模迁移；
- 测试写入限定 controlled blocks；
- screenshots/DB/backups/scan dumps 不提交远端。

## 18.4 Agent 测试请求节制

真实 LLM / 听云等外部系统调用：

- 先 fake/deterministic tests；
- 再少量 golden path；
- 不高频试错请求。

---

# 19. 真实用户验收场景集合

以下场景应逐渐成为最终产品回归集。

## 场景 A：自然记录 → 已有对象吸收

用户 Journal：

> 厂商第二版拿到了，法务重新部署还是启动失败，明天继续看 JAVA_TOOL_OPTIONS。

系统应：

- 不创建 Task；
- high-confidence 关联已有法务 MiniProject；
- freeze minimal evidence；
- WAITING→ACTIONABLE；
- set current_focus；
- update Managed Projection eventually；
- Lens 下次显示 Meaningful Change。

## 场景 B：自然记录 → 新 MiniProject

连续两天规格书工作形成独立成果边界。

系统应：

- Discovery candidate；
- Agent 推荐 kind/parent/intent；
- 用户“纳入”；
- User Decision compiler；
- 原地 Formalization；
- baseline reconcile；
- 不搬运自然内容。

## 场景 C：边界变化

用户写：

> 这个 MiniProject 后面只做法务，不做 OA。

系统应：

- 可靠确认是用户当前直接决定；
- UPDATE_WORK_INTENT USER；
- 不二次确认；
- preserve original utterance scope。

## 场景 D：他人指令

用户记录：

> 导师说“这个项目先停”。

系统应：

- Evidence；
- maybe boundary candidate；
- 绝不能 USER PARKED。

## 场景 E：WAITING 局部 blocker

MiniProject 仍可准备环境，但厂商新版没到。

系统应：

- overall ACTIONABLE；
- current_focus = 准备环境；
- local blocker derived / child WAITING；
- 不把 parent WAITING。

## 场景 F：完成标准全部满足

系统应：

- closure-ready；
- 不自动 complete；
- natural context 中提出轻量 USER decision。

## 场景 G：完成后新故障

已完成法务接入，一个月后 JDK 升级导致故障。

系统应：

- old object remains completed；
- determine reopen vs new follow-up candidate；
- Now 可短暂展示承接问题；
- USER decides。

## 场景 H：后台暂停

用户 pause MiniProject；继续写两天。

系统应：

- source uncovered；
- no Agent run；
- Lens last trusted + unreconciled notice；
- one-shot manual reconcile works without unpausing。

## 场景 I：Logseq 关闭

后台 Local Service 得到合法 low-risk semantic result。

系统应：

- Kernel commit；
- Projection pending；
- reopen Logseq sync canonical；
- old projection not treated as user fact。

## 场景 J：Curation

用户：

> 把最近记录整理一下，资源集中，历史不要删。

系统应：

- low-risk continuous edit；
- no per-block confirm；
- no delete；
- provenance；
- no self-evidence loop；
- user edits generated summary → user takeover。

## 场景 K：“现在”

系统有 15 actionable + 5 waiting + 3 parked。

Now 应：

- 只展示极少数 current contexts；
- explain why-now；
- quiet waiting absent；
- parked absent unless reactivated；
- formal + rare nonformal work may coexist；
- no scores；
- can be empty。

## 场景 L：“待我确认”

内部 12 Governance Issues，只有 1 个成熟低认知 Decision Package。

UI 只显示 1 个，不显示 12 条 backlog。

---

# 20. 近期最推荐的实际执行顺序

如果现在就让 Codex 接手，我建议不要一次下达 Phase 8～20。

第一轮只做：

```text
Phase 8 + Phase 9 的设计收敛与实现
```

理由：

- Kernel invariants 是所有后续的地基；
- Reconciliation queue 是后台语义维护的真实骨架；
- 两者均不依赖最终 UI；
- 能尽早暴露现有代码与新语义的冲突；
- 风险可控、可测试。

完成后再进入：

```text
Context/Evidence v2
→ User Decision Compiler
→ Discovery
→ Built-in unattended Agent
```

直到这些稳定，才值得大规模重做用户视图。

---

# 21. 关键“不要提前做”的事项

在真实需求出现前，不要提前：

- 设计通用 Attention scoring model；
- 做 vector DB 作为 Graph 大脑；
- 做 autonomous agent scheduler；
- 做 multi-provider routing；
- 做永久 agent memory；
- 做 knowledge graph relation system；
- 做 project progress dashboard；
- 做任意 dependency engine；
- 做 configurable workflow builder；
- 做全自动 Workspace cleanup；
- 做大量 Lens node types；
- 把所有 Grill 决策翻成配置项。

宪章是**设计约束**，不是“用户必须配置的 123 个选项”。

---

# 22. vNext 完成的产品级 Definition of Success

vNext 真正成功，不是因为：

- 有多少按钮；
- 有多少 Agent operation；
- Lens 多漂亮；
- Kernel 存多少字段。

而是用户真实使用一段时间后出现以下体验：

### 22.1 Capture 几乎无摩擦

用户继续按原习惯写 Logseq，不需要每次判断“这是不是 Task”。

### 22.2 Formal Model 更少，而不是更多

真正值得长期治理的对象数量适中；大量自然工作被 Agent 理解，但没有被强制对象化。

### 22.3 重入更快

隔几天打开一个 MiniProject，几秒能恢复：

- meaningful changes；
- current reality；
- current formal state；
- natural next step；
- key uncertainty。

### 22.4 后台治理大部分隐形

用户不清队列、不审候选、不维护 priority、不整理 status。

### 22.5 USER 决策变少但更有价值

“待我确认”非常稀疏；出现时基本可以几十秒拍板。

### 22.6 Agent 可靠而不越权

用户敢让后台 Agent 长期运行，因为：

- low-risk 可自动；
- boundary 仍由 USER；
- Evidence 可追；
- Undo 可用；
- 远程 scope 可控；
- failure 不影响 natural work。

### 22.7 Workspace 越来越像用户自己的工作区

不是越用 Task Copilot，Logseq 中字段越多；而是 Writing Language v2 逐步减少常驻系统结构，把认知信息放在真正需要的时候展示。

### 22.8 Agent 可替换

更换模型、Skill、外部 Agent 不会导致 Formal Truth 漂移；历史决定、Evidence、Kernel State 仍然成立。

---

# 23. 最终实施原则

> **先证明语义，再增加自动化；先证明自动化，再减少常驻 UI；先证明认知价值，再正式化数据。**

任何下一 Phase 的 Goal，都应以这句话作为收尾检查。
