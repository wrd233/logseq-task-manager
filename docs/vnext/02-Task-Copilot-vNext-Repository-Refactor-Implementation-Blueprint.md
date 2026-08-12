# Task Copilot vNext · Repository Refactor & Implementation Blueprint

> 文档类型：仓库重构与实施蓝图  
> 目标：把已冻结的 vNext 架构转化为可执行工程结构  
> 核心原则：高破坏性清仓、小而完整、纵向闭环优先、拒绝历史负担

---

# 0. 工程目标

本次不是在 V1 上继续添加功能。

目标是：

> **从当前设计真相出发，建立一条干净的 vNext 主干，使 Kernel、Plugin、CLI 和 Agent 都围绕同一正式事实与 Semantic Commit 工作。**

仓库必须从“历史实验、旧流程、旧 Prompt、旧 Candidate/Session/UI 状态的叠加体”收敛为：

```text
可信 Kernel
+ 薄 Logseq Plugin
+ Reference CLI
+ 可替换 Agent Adapters
+ 版本化 Skills
+ 小而明确的 UI
```

这份蓝图不要求物理目录一字不差地照抄。Codex 可以根据当前 monorepo、构建工具和 Logseq 插件约束调整，但必须保持本文定义的职责边界和依赖方向。

---

# PART I：重构策略

## 1. 允许高破坏性重构

本次明确允许：

- 删除旧目录；
- 删除旧 API；
- 删除旧数据库 Schema；
- 删除旧 UI；
- 删除旧 Prompt；
- 删除旧 Candidate / Session / Proposal 实现；
- 删除 Capability Lab；
- 删除为了兼容历史而存在的 Adapter；
- 重新命名包；
- 重新建立 Local Service；
- 重建数据库。

不要为了“现在还能跑”而维护旧形状。

## 2. Git History 就是代码档案

不要建立以下长期目录：

```text
legacy/
old-v1/
deprecated/
compat/
v1-backup/
```

若一段旧代码只是“以后也许想参考”，Git 已足够。

主分支必须表达：

> **当前系统相信什么。**

## 3. 选择性移植，而不是 Legacy Preservation

可以移植旧实现的条件：

1. 它是确定性工程知识；
2. 与新 Domain Contract 不冲突；
3. 可以被隔离地重新测试；
4. 移植后不会迫使新架构兼容旧 API；
5. 删除旧模块后仍能独立存在。

可能值得保留的“知识”：

- Logseq SDK 的可靠调用方式；
- Block / Page UUID 处理；
- Graph event debounce；
- SQLite 基础设施；
- Undo 中保护用户后续编辑的实现经验；
- Commit fail-closed 的测试方法；
- Provider structured output 的兼容技巧；
- 已验证的 UI host limitation；
- Service lifecycle 的工程经验。

不应因为这些知识存在，就把旧模块整体搬过来。

---

# PART II：建议仓库结构

## 4. 目标物理结构示意

```text
/
├─ apps/
│  ├─ logseq-plugin/
│  │  ├─ src/
│  │  │  ├─ graph/
│  │  │  ├─ projection/
│  │  │  ├─ ui/
│  │  │  └─ kernel-client/
│  │  └─ ...
│  │
│  └─ kernel-service/
│     ├─ src/
│     │  ├─ bootstrap/
│     │  ├─ api/
│     │  └─ runtime/
│     └─ ...
│
├─ packages/
│  ├─ domain/
│  ├─ operation-contracts/
│  ├─ proposal-contracts/
│  ├─ kernel-application/
│  ├─ sqlite-store/
│  ├─ commit-ledger/
│  ├─ graph-contracts/
│  ├─ agent-contracts/
│  ├─ skill-contracts/
│  ├─ kernel-client/
│  └─ test-support/
│
├─ cli/
│  └─ task-copilot/
│
├─ adapters/
│  ├─ builtin-agent/
│  └─ mcp/
│
├─ skills/
│  ├─ title-polishing/
│  ├─ current-focus/
│  └─ ...
│
├─ docs/
│  ├─ architecture/
│  ├─ adr/
│  └─ golden-paths/
│
└─ tests/
   ├─ integration/
   ├─ failure-injection/
   └─ golden-paths/
```

如果现有工具链不适合上述目录层级，可以合并物理 package，但不能重新把 Domain、SQLite、Graph SDK、React 和 Agent SDK 塞进一个巨大插件包。

---

# PART III：依赖方向

## 5. Domain

`domain` 必须是纯领域层。

允许依赖：

- 标准库；
- 纯数据结构；
- 小型 schema validator abstraction。

不得依赖：

- React；
- Logseq SDK；
- HTTP；
- SQLite；
- Node fs；
- LLM SDK；
- MCP；
- CLI parsing。

第一阶段核心类型：

```text
WorkObject
ResponsibilityScope
Signal
EvidenceReference
ArtifactReference
DecisionRecord
CompletionRecord
CancellationRecord
ClosureAmendment
ReopenRecord
AttentionIntent
```

但不要因为模型里“未来存在”就一次性全部建表和 UI。Domain 类型与第一阶段持久化范围可以分开。

## 6. Operation Contracts

定义稳定 Semantic Operation。

完整第一版候选控制在约 12–16 个：

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

Operation 必须明确：

- payload schema；
- actor requirement；
- risk；
- target kind constraints；
- preconditions；
- evidence requirements；
- expected Graph Effects；
- inverse / compensation strategy。

禁止：

```text
UPDATE_OBJECT
PATCH_JSON
SET_FIELD
DELETE_ARBITRARY_RELATION
```

等泛化操作。

## 7. Proposal Contracts

Proposal 结构应表达：

```yaml
proposal:
  id: ...
  run_id: ...
  purpose: ...
  target_scope: ...
  revision: 1

  evidence_dependencies: ...
  target_dependencies: ...
  skill_ref: ...

  operations: [...]
  rationale_summary: ...
  risk_summary: ...

  status: OPEN
```

关键规则：

- Proposal 是一个原子语义判断；
- 一个 Proposal 可以有多个相互依赖 Operation；
- 不允许 Commit 时随意勾掉一部分；
- 用户修改产生新 Revision；
- 一次 Agent Run 可以产生多个独立 Proposal；
- Proposal 状态不长期保存 ACCEPTED。

## 8. Kernel Application

负责：

```text
validate proposal
validate user command
authorize actor
resolve autonomy policy
prepare semantic commit
execute kernel mutations
dispatch graph effects
verify
finalize
undo
recover
```

所有客户端必须经过这里。

## 9. SQLite Store

Store 只负责持久化和 Query，不应承载领域判断。

不要把以下规则塞进 Repository：

- lifecycle transition policy；
- ownership legality；
- Agent autonomy；
- Proposal risk；
- Project close semantics。

## 10. Commit Ledger

Ledger 是结构化、机器可恢复的事务事实，不是文本日志。

建议状态：

```text
PREPARED
KERNEL_APPLIED
GRAPH_APPLIED
COMMITTED
ABORTED
RECOVERY_REQUIRED
```

每次 Commit 应能回答：

- 谁发起；
- 为什么；
- 哪些 Operation；
- 目标版本是什么；
- Evidence 是什么；
- Graph 计划是什么；
- Kernel 实际写了什么；
- Graph 实际发生了什么；
- 当前能否 Undo；
- 是否需要 Recovery。

## 11. Graph Contracts

Kernel 不直接 import Logseq SDK。

定义确定性 Graph Effect：

```yaml
effect:
  id: ...
  commit_id: ...
  target: ...
  expected: ...
  mutation: ...
```

Plugin Graph Adapter 负责：

```text
read snapshot
apply effect
return actual result
```

它不负责决定“这个对象应不应该完成”。

---

# PART IV：Local Kernel Service

## 12. 进程边界

Kernel Service 是唯一正式写进程。

Logseq Plugin 即使能访问本地文件，也不得直接：

- 改 vNext SQLite；
- 绕过 Commit Ledger；
- 修改正式关系；
- 创建 CompletionRecord。

CLI 与 Agent 同理。

## 13. Local API

第一版建议：

```text
localhost-only HTTP/JSON
```

只监听 `127.0.0.1`。

建议 API 分类：

```text
/system/*
/queries/*
/objects/*
/proposals/*
/commits/*
/recovery/*
/agent-runs/*
/skills/*
/graph-effects/*
```

但请求语义围绕 Command / Query，而不是裸 REST CRUD。

禁止：

```text
PATCH /objects/:id
DELETE /objects/:id
```

## 14. Kernel Descriptor / Token

例如：

```text
~/.task-copilot/kernel.json
```

字段：

```json
{
  "instance_id": "...",
  "port": 38172,
  "token": "...",
  "protocol_version": "..."
}
```

文件权限限制当前用户。

第一版不要建设企业 RBAC。

可用 Capability 只需少量：

```text
READ_FORMAL_STATE
READ_GRAPH
SUBMIT_PROPOSAL
COMMIT_USER_COMMAND
EXECUTE_GRAPH_EFFECT
ADMIN_RECOVERY
```

网络/API Capability 与领域语义权限必须分开。

---

# PART V：Plugin

## 15. Plugin 的职责

Plugin 负责：

- Graph Adapter；
- Logseq event ingestion；
- Managed Projection；
- Now；
- 需要我判断；
- Project Worksite；
- More；
- Notification / Receipt；
- Undo / Recovery UI；
- Kernel Client。

不负责：

- Domain truth；
- Proposal validation；
- Agent policy；
- 事务状态；
- SQLite write。

## 16. Capture 不重做

Logseq 就是 Capture。

Plugin 只提供轻量入口：

```text
正式化
让 Agent 看一下
打开 Worksite
```

不要新建重量级 Capture Inbox。

## 17. Managed Projection

第一版投影要克制：

- 一个稳定容器；
- 字段级 child blocks；
- 稳定 Block UUID；
- 只显示非空正式字段；
- 用户自然正文不被整体重写。

Task 应极薄。

---

# PART VI：CLI

## 18. CLI 是第一等 Reference Client

优先实现：

```text
task-copilot status
task-copilot object list
task-copilot object show <id>
task-copilot proposal show <id>
task-copilot commit show <id>
task-copilot recovery list
task-copilot doctor
```

之后再实现：

```text
task-copilot agent run ...
```

CLI 输出同时支持：

- human readable；
- `--json`。

CLI 不直接连接 SQLite。

---

# PART VII：Agent

## 19. Built-in Adapter

第一版只承担：

- title polishing；
- current_focus；
- 极小范围语义提炼。

全部经过：

```text
Skill
→ Context
→ Agent Contract
→ Proposal
```

不要迁移旧 Prompt Runtime 的所有功能。

## 20. MCP Adapter

晚于 Local API。

MCP 只是把 Kernel Query / Read Gateway / Proposal Submission 适配成 Agent Tool。

不要让 MCP 成为第二业务层。

## 21. Read Gateway

第一版至少支持：

```text
search formal objects
read work object
read anchor/source
search graph
freeze evidence
```

本地 Agent 可以直接探索，但正式 Proposal Evidence 必须通过 freeze。

---

# PART VIII：Skill

## 22. Skill Package

建议：

```text
skills/<skill-id>/<version>/
├─ manifest.yaml
├─ policy.md
├─ output.schema.json
├─ examples/
└─ eval-cases/
```

一旦运行引用，版本不可改。

## 23. 第一批 Skill

不要一次建设 Skill 平台。

只做黄金链需要的：

```text
title-polishing
current-focus-maintenance
engagement-reconciliation
formalize-task
```

External Agent 深度治理可在后续 Vertical Slice 加入。

---

# PART IX：数据库设计原则

## 24. Current State

建议按领域实体规范化，不必过早极端抽象。

可能包括：

```text
work_objects
work_intents
anchors
evidence_references
ownerships
responsibility_scopes
signals
artifact_references
decision_records
completion_records
cancellation_records
closure_amendments
reopen_records
attention_intents
agent_run_receipts
feedback_events
skill_registry
```

不要把所有东西塞进 universal entity / JSON blob。

第一阶段只建立当前纵向链需要的子集。

## 25. Proposal / Commit

可能结构：

```text
proposals
proposal_revisions
proposal_operations
commits
commit_operations
commit_graph_effects
commit_preconditions
```

具体是否拆表由真实 Query 决定，但结构上必须支持：

- Revision；
- immutable Ledger；
- recovery；
- operation-level evidence；
- actor；
- before / after 或 inverse。

## 26. 不采用 Event Sourcing

Current State 可直接查询。

Ledger 用于：

- Audit；
- Undo；
- Recovery；
- 历史解释。

启动不能依赖重放全部事件才能构建系统。

---

# PART X：第一条 Vertical Slice

## 27. 第一阶段目标

只证明：

```text
自然 Logseq 记录
→ 显式正式化
→ CREATE_WORK_OBJECT
→ Kernel Commit
→ SQLite
→ Graph Managed Projection
→ Audit
→ Undo
```

External Agent 暂时不是第一刀。

## 28. 建议开发顺序

### Step 1：Domain

实现：

- WorkObject；
- lifecycle；
- engagement；
- anchor；
- evidence；
- ownership 最小规则；
- CREATE / RENAME；
- 基本 invariant tests。

### Step 2：SQLite

实现 Current State 最小表 + vNext schema baseline。

### Step 3：Ledger

实现：

```text
PREPARED
KERNEL_APPLIED
GRAPH_APPLIED
COMMITTED
RECOVERY_REQUIRED
```

### Step 4：Kernel API

启动 localhost service。

### Step 5：CLI

用 CLI 创建和查看 WorkObject。

此时不需要 Logseq UI，也能测试 Kernel。

### Step 6：Graph Adapter Contract

实现 Fake Adapter。

### Step 7：Fault Injection

模拟：

```text
Graph apply fail
Kernel crash after KERNEL_APPLIED
Graph expected hash mismatch
```

### Step 8：Logseq Adapter

真实 Block 读取、Projection 写入。

### Step 9：Plugin UI

“正式化”入口 + Object 简单工作面。

### Step 10：Undo

验证用户后续编辑保护。

---

# PART XI：第二条 Vertical Slice

## 29. current_focus + Agent

实现：

```text
new natural note
→ read context
→ built-in skill
→ evidence freeze
→ SET_CURRENT_FOCUS proposal
→ auto governance
→ receipt
→ undo
→ feedback
```

这是真正开始验证 Agent 减负。

---

# PART XII：第三条 Vertical Slice

## 30. Waiting

实现：

```text
ACTIONABLE ↔ WAITING
WaitingCondition
Now Projection
prominent notification
Undo
```

`PARKED` 仍需确认。

---

# PART XIII：第四条 Vertical Slice

## 31. 用户主动 Completion

实现：

```text
TODO → DONE
→ user command
→ COMPLETE_WORK_OBJECT
→ CompletionRecord
→ Graph Marker
→ Commit
```

Agent 不自动 complete。

同时准备：

- CancellationRecord；
- Closure Amendment；
- Reopen；

但不要让它们阻塞普通 Task Completion 黄金链。

---

# PART XIV：第五条 Vertical Slice

## 32. External Agent

此时再接：

```text
CLI / MCP
Read Gateway
broad read
freeze evidence
AgentRunReceipt
multiple proposals
NO_PROPOSAL
```

原因是：

> External Agent 的价值依赖 Kernel Contract 已经稳定。

---

# PART XV：第六条 Vertical Slice

## 33. Project Re-entry

构建 Project Worksite 的最小版本。

必须能恢复：

- Objective；
- Key Results；
- Scope；
- current_phase；
- current_focus；
- active child work；
- Waiting；
- recent Evidence；
- Artifact；
- Decision；
- recent Activity。

不要为了视觉完整性增加额外正式字段。

---

# PART XVI：UI 实施顺序

## 34. 先对象现场，再完整导航

第一阶段只需要足够 UI 完成黄金链。

随后构建：

```text
现在
需要我判断
项目
更多
```

不要为了页面完整性阻塞 Kernel 纵向链。

## 35. 「需要我判断」不是 Proposal Inbox

只进入真正不能由 Agent 自主决定的事项：

- Park / Unpark；
- Complete；
- Cancel；
- Reopen；
- Project Objective/KR/Scope；
- 高影响 Ownership；
- 高影响 Kind Change；
- Conflict；
- Recovery。

低风险 Agent 治理不能重新堆成 30 条待审批项。

---

# PART XVII：测试策略

## 36. Unit Tests

必须覆盖：

- lifecycle invariants；
- engagement；
- parent close；
- kind conversion；
- intent schema；
- ownership；
- proposal atomicity；
- staleness；
- autonomy policy。

## 37. Contract Tests

Kernel API / Graph Adapter / Agent Adapter 使用 Contract Test。

避免 Plugin 与 Service 因升级静默错位。

## 38. Golden Path Tests

最终必须自动或半自动验证 6 条黄金链。

每条测试都应保存：

```text
input
expected formal state
expected graph state
expected ledger
expected receipts
```

## 39. Failure Injection

至少：

```text
before PREPARE crash
after KERNEL_APPLIED crash
graph adapter timeout
graph expected hash mismatch
evidence changed
undo after graph user edit
```

Recovery 不是最后再补。

---

# PART XVIII：删除清单

## 40. 可直接删除的概念

若现有代码对应以下概念，并没有独立的仍需复用价值，应删除：

```text
Candidate Entity
generic RELATED
persistent Health Finding lifecycle
persistent Cohort entity
legacy Session as domain center
special-purpose AI write path
arbitrary partial proposal apply
legacy Prompt-per-flow
V1 migration-specific UI
Capability Lab product code
old duplicate Now/Attention state
```

## 41. 旧 Proposal 代码

不要因为名字相同就复用。

vNext Proposal 的语义已发生变化：

- atomic semantic decision；
- revision；
- precise evidence deps；
- no persistent ACCEPTED；
- no arbitrary partial apply。

若旧实现与此冲突，重写更便宜。

## 42. 旧 Session / Prompt

旧流程若把 Prompt、Session、Candidate、Proposal、UI 绑定在一起，应优先拆除。

只保留真正有价值的：

- Provider 调用经验；
- structured output 解析；
- timeout / retry；
-模型适配 quirks。

治理规则迁入 Skill，不迁入新的巨大 Prompt Runtime。

---

# PART XIX：兼容策略

## 43. Zero-Obligation Compatibility

实现时使用如下判断：

```text
兼容成本 ≈ 0
→ 可以做

兼容要求引入新分支 / adapter / migration / domain compromise
→ 不做
```

任何“为了旧数据必须……”都需要高门槛证明。

## 44. 旧 Graph 与旧 DB 分开看

旧 Graph 是用户资料，不能误当作 legacy garbage。

旧 SQLite 是旧系统的解释，不是 vNext 必须承认的正式事实。

因此：

```text
Graph
→ 保留

Old SQLite
→ 可备份
→ vNext 默认不读作正式来源
```

不要专门建设 Legacy Import 产品，除非未来“从自然材料正式化”能力本来就需要它。

---

# PART XX：复杂度预算

## 45. 禁止过早建设

第一版禁止：

- generic workflow engine；
- rule DSL；
- trigger engine；
- enterprise permission system；
- agent scheduler platform；
- general file manager；
- general relation graph；
- general OKR platform；
- event sourcing framework；
- migration platform；
- multi-provider router；
- prompt CMS；
- full health center；
- full cohort manager。

## 46. 每个 PR 需要回答四个问题

1. 它服务哪条黄金链 / 故障链？
2. 它是否新增了永久领域概念？
3. 若新增，为什么不能用 Projection / Receipt / Skill / 普通文件解决？
4. 删除它会不会让核心链仍然成立？

若第 1 个问题答不出，延后。

---

# PART XXI：阶段性 Exit Criteria

## Phase 0：清仓完成

- 旧 Lab / V1 关键死代码删除；
- 新目录骨架建立；
- Architecture Baseline 入 repo；
- 不保留长期双轨；
- 清楚列出少量暂时保留的桥接代码以及删除条件。

## Phase 1：Kernel Skeleton

- Local Service 启动；
- SQLite Current State；
- Ledger；
- Local API；
- CLI；
- CREATE / RENAME；
- unit tests。

## Phase 2：Graph Transaction

- Fake Graph Adapter；
- Real Graph Adapter；
- cross-medium commit；
- recovery；
- undo；
- 第一黄金链。

## Phase 3：Agent Low-risk Governance

- Skill package；
- Built-in Adapter；
- current_focus；
- FeedbackEvent；
- 第二黄金链。

## Phase 4：Engagement

- Waiting；
- prominent receipts；
- Now Projection；
- 第三黄金链。

## Phase 5：Closure

- CompletionRecord；
- CancellationRecord；
- Amendment；
- Reopen；
- 第四黄金链。

## Phase 6：External Agent

- Read Gateway；
- AgentRunReceipt；
- MCP Adapter；
- multiple Proposal；
- NO_PROPOSAL；
- 第五黄金链。

## Phase 7：Product MVP

- 4 top-level surfaces；
- Project re-entry；
- 6 golden paths；
- 4 failure paths；
- MVP evaluation。

---

# PART XXII：建议的 ADR 清单

实现过程中建议至少建立以下 ADR：

```text
ADR-001 Kernel Service as Single Writer
ADR-002 WorkObject Unified Model
ADR-003 Lifecycle vs Engagement
ADR-004 Current State + Commit Ledger
ADR-005 Cross-medium Commit Protocol
ADR-006 Proposal Atomic Revision Model
ADR-007 Local HTTP API + Capability Token
ADR-008 Managed Projection Ownership
ADR-009 Agent Evidence Freeze Boundary
ADR-010 Zero-Obligation Legacy Compatibility
```

ADR 不需要重复整篇基线，只需说明实际工程选择与实现偏差。

---

# PART XXIII：实施期间的健康信号

## 47. 好的迹象

- 删除代码多于新增兼容层；
- Kernel 可以脱离 Logseq 启动并测试；
- CLI 与 Plugin 使用相同 API；
- Agent 没有 direct-write shortcut；
- Graph Failure 可以稳定复现并恢复；
- 第一个 Vertical Slice 很早出现；
- 新增 Entity 很少；
- UI 概念数量持续下降。

## 48. 危险迹象

出现以下情况应暂停并重新检查：

```text
“为了先跑起来，让 Plugin 直接写 DB”
“为了 Agent 方便，加一个 generic update”
“旧 Candidate 先保留，以后再删”
“先把所有 Operation 都定义完”
“Recovery 等功能完成以后再补”
“为了兼容 V1，再维护一套 status 映射”
“加一个万能 metadata JSON，以后都能放”
“先做完整 MCP Server，再做 Kernel API”
```

这些都很可能重新把复杂度带回系统中心。

---

# PART XXIV：最终施工原则

代码实现必须始终保持：

```text
Plugin owns experience
Kernel owns facts
Agent owns reasoning
Skill owns governance policy
Graph owns natural workspace
Ledger owns formal history
```

如果某段新代码开始同时承担上述两种以上责任，应优先怀疑边界是否已经重新塌陷。

本轮重构成功的标志不是“V1 全部功能重新出现”，而是：

> **最少的稳定概念，真正承住第一批可信端到端链路，并为外部 Agent 提供一个不会绕过事实与事务边界的工作内核。**
