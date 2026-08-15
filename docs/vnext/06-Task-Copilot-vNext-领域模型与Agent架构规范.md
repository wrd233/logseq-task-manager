# Task Copilot vNext 领域模型与 Agent 架构规范

> 文档定位：这是 vNext 的“可实现语义规范”。它把产品与治理宪章落到领域对象、状态、权限、事务、队列、证据、Agent 契约、Graph 投影、Object Lens / Now Projection 等具体架构上。实现者应优先遵循本文的语义边界，而不是从旧代码结构反推新系统。
>
> 原则：除非本文明确写入 Formal Core，否则默认不正式化；除非本文明确赋予 Agent 自动写权限，否则默认需要 User Decision 或保持 Derived Cognition。

---

# 1. 总体架构

## 1.1 逻辑分层

```text
┌──────────────────────────────────────────────────────────────┐
│                    Logseq Natural Workspace                 │
│  Journal / Page / Block / File Link / User Notes / Source  │
│              用户拥有；自然工作；Fail Open                   │
└───────────────┬──────────────────────────────────────────────┘
                │ Graph observation / context / user edits
                ▼
┌──────────────────────────────────────────────────────────────┐
│                    Plugin / Graph Adapter                    │
│  Identity / Reader / Renderer / Change Classification / IO  │
│      只做确定性适配，不承担自然语言业务语义判定              │
└───────────────┬──────────────────────────────────────────────┘
                │ Local API
                ▼
┌──────────────────────────────────────────────────────────────┐
│                    Local Kernel Service                      │
│                                                              │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────┐ │
│  │ Formal Kernel│  │ Reconcile Queue│  │ Projection Queue │ │
│  └─────────────┘  └────────────────┘  └──────────────────┘ │
│                                                              │
│  Evidence / UserDecision / Proposal / Operation / Issues     │
│  AgentRun / Feedback / Taste / Skill / Context Association  │
└───────────────┬──────────────────────────────────────────────┘
                │ bounded context package / typed result
                ▼
┌──────────────────────────────────────────────────────────────┐
│                    Cognition Executors                       │
│  Built-in unattended Agent / External CLI Agent / Others    │
│         同一契约；执行器中立；权限由调用上下文决定            │
└──────────────────────────────────────────────────────────────┘

Derived Presentation:
  Kernel + Source + Context + Cognition
          ├─ Object Lens Projection
          ├─ Now Projection
          ├─ Decision Package Presentation
          └─ Project Formal Work Map
```

## 1.2 Authority Matrix

| 信息 | 权威来源 | Agent 是否可直接改 | 是否必须持久化 |
|---|---|---:|---:|
| Natural Workspace 原文 | 用户/外部 Source | 否；仅在 Curation 授权下 | Logseq 自身 |
| WorkObject lifecycle | Kernel | 否 | 是 |
| engagement | Kernel | 窄白名单可自动 | 是 |
| current_focus | Kernel | 严格条件下可自动 | 是 |
| WorkIntent | Kernel | 否，需 USER | 是 |
| Objective/KR | Kernel | 否，需 USER | 是 |
| ownership | Kernel | 否，需 USER | 是 |
| Primary Anchor | Kernel/identity registry | 迁移需 USER | 是 |
| Context Association | Task Copilot internal index | 高置信度可自动 | 是/轻量 |
| Frozen Evidence | Evidence Store | Agent 可发起 freeze | 是 |
| Governance Issue | Governance layer | 可自动创建/更新 | 是 |
| Work Frontier | Derived Cognition | 可生成 | 缓存可选 |
| Meaningful Changes | Derived Cognition | 可生成 | 缓存可选 |
| Now ranking/context | Derived Cognition | 可生成 | 仅缓存 |
| Taste | Governance config | 受限自动激活 | 是/versioned |
| Skill | Governance policy | 不可自行激活 | 是/versioned |

---

# 2. Formal Domain Model

## 2.1 WorkObject

建议概念结构：

```ts
type WorkObjectKind = 'TASK' | 'MINI_PROJECT' | 'PROJECT'
type Lifecycle = 'OPEN' | 'COMPLETED' | 'CANCELLED'
type Engagement = 'ACTIONABLE' | 'WAITING' | 'PARKED' | null

interface WorkObject {
  id: WorkObjectId
  kind: WorkObjectKind
  title: string

  lifecycle: Lifecycle
  engagement: Engagement       // lifecycle=OPEN 时有效

  parentId: WorkObjectId | null
  primaryAnchorId: AnchorId | null

  currentFocus: CurrentFocus | null
  userAttention: UserAttention | null

  workIntent?: WorkIntent       // MiniProject；Project 也可有更高层语义
  projectIntent?: ProjectIntent // Project 专属

  version: number
  createdAt: Instant
  updatedAt: Instant
}
```

注意：该结构是语义模型，不要求数据库按单表 JSON 实现。当前实现更适合 normalized SQLite current state + append-only operation/commit ledger。

## 2.2 生命周期约束

### OPEN

- `engagement` 必须为 ACTIONABLE / WAITING / PARKED；
- 可接受 routine semantic maintenance。

### COMPLETED / CANCELLED

- 不做 routine maintenance；
- 仍保留 stable ID / history / context；
- 新材料只做 post-closure detection；
- 新现实产生行动时，生成 Reopen/New-Follow-up Candidate，不自动改 lifecycle。

## 2.3 Ownership invariants

合法：

```text
PROJECT -> MINI_PROJECT
PROJECT -> TASK
MINI_PROJECT -> TASK
```

非法：

```text
PROJECT -> PROJECT
MINI_PROJECT -> MINI_PROJECT
TASK -> *
```

额外约束：

- child 最多一个 parent；
- parent/child 不可形成 cycle；
- parent lifecycle 关闭前不能有 OPEN formal children；
- PARKED parent 不允许长期存在 ACTIONABLE descendant；
- ownership change 是边界操作，USER 授权；
- ownership change 若跨两个 parent，是一个真正跨对象原子事务。

## 2.4 CurrentFocus

```ts
interface CurrentFocus {
  summary: string
  targetWorkObjectId?: WorkObjectId
  setBy: 'USER' | 'AGENT'
  basisRef?: OperationOrDecisionRef
}
```

规则：

- 最多一个；
- WAITING 时必须 null；
- target 只在唯一明确对应已存在 Formal WorkObject 时使用；
- target 不创建 ownership；
- 不能用 Derived Next Step 反向自证 current_focus。

## 2.5 UserAttention

不设计传统 Priority。

```ts
interface UserAttention {
  mode: 'FOCUSED'
  validUntil?: Instant
  conditionRef?: ConditionRef
  decisionRef: UserDecisionId
}
```

- USER-owned；
- Agent 不得静默加/删；
- 对 Now ranking 是强信号而非 absolute rank。

注意力抑制属于 Now Projection preference，不应复用该字段，可单独建 scoped attention suppression record。

---

# 3. MiniProject WorkIntent

## 3.1 最小正式语义

```ts
interface WorkIntent {
  desiredOutcome?: string
  completionChecks: CompletionCheck[]
}

interface CompletionCheck {
  id: string
  text: string
}
```

设计目标：

- 表达成果承诺；
- 帮助完成判断；
- 不要求 schema completeness；
- Natural `[当前状态]`、背景、资源、成果说明不进入 Formal Core。

## 3.2 权限

`UPDATE_WORK_INTENT`：

- USER only；
- Agent 可 Proposal；
- 用户直接修改明确 Managed Projection 或明确自然语言决定，可以编译成 USER Operation；
- 后台 Agent 不自动补全。

## 3.3 Completion Readiness

Agent 可以判断所有 checks 是否 Evidence-backed satisfied。

结果：

```text
Closure Candidate
```

不是：

```text
lifecycle = COMPLETED
```

用户若说“还不行，要再观察三天”，可能同时产生：

1. reject current closure candidate；
2. UPDATE_WORK_INTENT completionChecks；
3. FeedbackEvent。

---

# 4. Project Objective / KR Model

## 4.1 ProjectIntent

```ts
interface ProjectIntent {
  objective?: string
  keyResults: KeyResult[] // 建议 1~5
  scope?: string
  currentPhase?: string
}

interface KeyResult {
  id: string
  text: string
  acceptanceDefinition?: string[]
  metricDefinition?: MetricDefinition
}
```

## 4.2 KR 不是 WorkObject

KR 不拥有：

- lifecycle；
- engagement；
- current_focus；
- ownership；
- Primary Anchor；
-独立 Lens。

它是成果承诺。

## 4.3 不维护通用进度百分比

如果 KR 有可测指标：

```text
目标：覆盖率 >= 90%
事实：18/20 = 90%
```

可显示真实值。

禁止 Agent 主观估算：

```text
KR 72%
Project 61%
```

## 4.4 Objective 不维护 achieved 状态

Closure review 判断：

- KR 是否被 Evidence 兑现；
- 是否存在现实反证说明 KR 不足以支撑 Objective。

如果失配，生成 Governance Issue，而不是 `objective_status`。

## 4.5 Project Closure

```text
成果侧：KR evidence-backed satisfied
    +
工作侧：no OPEN formal children
    +
无关键 unresolved boundary conflict
    ↓
Closure Candidate
    ↓
USER COMPLETE_PROJECT
```

---

# 5. WaitingCondition

## 5.1 结构

```ts
interface WaitingCondition {
  id: string
  description: string
  active: boolean
  sourceRefs: SourceRef[]
  evidenceRefs: EvidenceId[]
  targetWorkObjectId?: WorkObjectId
}
```

## 5.2 语义

- 只在整个 WorkObject WAITING 时正式存在；
- 描述“为什么整个对象当前没有合理主动推进路径”；
- 允许少量多个必要条件；
- 只要有必要 active condition 未解除，继续 WAITING；
- 所有 active blockers 解除后，只是“具备重新判断 ACTIONABLE 的条件”，仍需 reconciliation。

## 5.3 不做通用 dependency engine

禁止：

- arbitrary AND/OR AST；
- generalized predecessors/successors；
- automatic cross-project schedule propagation；
- workflow rule engine。

复杂现实优先保留一条人类可读条件，由 Agent 根据 Evidence 判断。

---

# 6. Anchor / Identity / Graph Model

## 6.1 Stable identity

WorkObject ID 与 Logseq identity 分离。

Primary Anchor 指向：

- File Graph：可通过 `id::` / block UUID registry；
- DB Graph：使用 host identity；
- Project page：稳定 page/block anchor。

## 6.2 Anchor record

```ts
interface Anchor {
  id: AnchorId
  workObjectId: WorkObjectId
  host: 'LOGSEQ'
  hostIdentity: string
  status: 'ACTIVE' | 'MISSING'
  lastKnownLocation?: string
  version: number
}
```

## 6.3 Anchor operations

- `BIND_PRIMARY_ANCHOR`
- `REASSIGN_PRIMARY_ANCHOR`
- `MARK_ANCHOR_MISSING`
- `RESTORE_ANCHOR`（确定性恢复）

Agent 不能静默迁移主入口；确定性 identity continuity 可自动更新物理 location。

## 6.4 Formalization spatial rules

- Task/MiniProject：原地 formalize；
- Project：创建独立 Project page；
- 不复制历史自然内容；
- 原始 block 可成为 Context / source provenance。

---

# 7. Context Association

## 7.1 定义

Context Association 表达：

> 理解 WorkObject 时，这段自然材料值得进入上下文。

不是：

- ownership；
- Formal evidence；
- Graph structural relation；
- user-authored knowledge relation。

## 7.2 建议记录

```ts
interface ContextAssociation {
  id: ContextAssociationId
  workObjectId: WorkObjectId
  sourceRef: SourceRef
  createdBy: 'USER' | 'AGENT' | 'SYSTEM'
  basisRunId?: AgentRunId
  sourceVersion: string
  status: 'ACTIVE' | 'INVALIDATED'
  createdAt: Instant
}
```

## 7.3 自动建立条件

仅高置信度 Existing-Object match：

- title/keyword 不是唯一依据；
- 综合所在上下文、显式引用、近期活跃对象、WorkIntent、ownership、时间连续性、current_focus；
- 不唯一时不自动绑定。

## 7.4 Graph policy

Agent-generated Context Association 默认不写：

- tags；
- properties；
- page refs；
- blocks。

需要写回 Graph 时必须进入 Natural Content Curation。

## 7.5 Association Correction

```ts
interface AssociationCorrection {
  id: string
  sourceRef: SourceRef
  rejectedWorkObjectId: WorkObjectId
  affirmedWorkObjectId?: WorkObjectId
  scopeSnapshot: string
  userDecisionRef: UserDecisionId
  createdAt: Instant
}
```

Matching pipeline 必须在自动关联前检查 active corrections。

---

# 8. Frozen Evidence

## 8.1 Evidence 角色

Context = 宽理解；Evidence = 窄证明。

Formal Proposal / auto-commit operational semantic 必须有 Frozen Evidence 支撑。

## 8.2 结构

```ts
interface Evidence {
  id: EvidenceId
  sourceRef: SourceRef
  sourceVersionHash: string
  frozenExcerptOrDigest: string
  frozenAt: Instant
  frozenByRunId: AgentRunId
  semanticClaim?: string
}
```

Evidence 最好反向链接：

```text
supports:
- Operation
- Proposal
- Governance Issue
- Closure Candidate
```

## 8.3 Hash 语义

至少区分：

- source content hash；
- semantic projection hash；
- managed projection hash；

不要把“用户自然内容变化”和“Renderer 变更”混成一个 stale 信号。

---

# 9. Working Model（Agent 暂态）

Agent 内部可使用：

Claim types：

- Confirmed Fact
- User Intent
- Agent Inference
- Recommendation
- Unknown
- Conflict

Temporal role：

- CURRENT
- HISTORICAL
- TIME_UNCLEAR

要求：

- Working Model 是暂态；
- 不存 chain-of-thought；
- 可存结构化结果/claims/provenance；
- 不因“Agent 说过”成为 Evidence。

---

# 10. User Decision

## 10.1 为什么必须独立存在

Proposal 表达系统建议；User Decision 表达用户实际授权。

自然语言 USER authorization 不应直接变成 Kernel op，而先编译为明确 Decision。

## 10.2 结构建议

```ts
interface UserDecision {
  id: UserDecisionId
  workObjectIds: WorkObjectId[]
  operationIntent: SemanticOperationIntent
  parameters: object
  authorizationScope: AuthorizationScope

  originalUserUtterance: string
  minimalDecisionContext: string

  inputVersions: Record<WorkObjectId, number>
  status: 'EXECUTED' | 'REJECTED' | 'SUPERSEDED' | 'UNDONE'

  createdAt: Instant
  executionRefs: OperationId[]
  supersedesDecisionId?: UserDecisionId
}
```

## 10.3 编译规则

要求：

- 意图主体 = USER；
- 当前生效，而非历史/假设；
- target 唯一；
- operation 唯一；
- 参数足够明确；
- scope 不扩张；
- apply 前 revalidate current context/invariants。

## 10.4 Workspace USER authorization

普通 Workspace 可授权，但必须区分：

- 用户本人直接表达；
- 他人要求；
- 用户转述；
- 引用/粘贴；
- 历史回顾；
- 条件计划。

不确定来源 → fail closed。

---

# 11. Proposal / Revision

## 11.1 角色

Proposal 是具体 Formal operation 的系统建议，不是未解决问题容器。

建议：

```ts
interface Proposal {
  id: ProposalId
  workObjectId: WorkObjectId
  operationIntent: SemanticOperationIntent
  status: 'OPEN' | 'APPLIED' | 'DISMISSED' | 'INVALIDATED'
  latestRevisionId: ProposalRevisionId
}

interface ProposalRevision {
  id: ProposalRevisionId
  proposalId: ProposalId
  parameters: object
  evidenceRefs: EvidenceId[]
  inputVersion: number
  createdByRunId: AgentRunId
  createdAt: Instant
}
```

修改 Proposal 产生新 revision，不在原 revision 上变更。

## 11.2 Staleness

以下使 Proposal stale / invalidated：

- target Formal version change；
- supporting source materially changed；
- new relevant evidence arrives；
- boundary condition changed。

---

# 12. Governance Issue

## 12.1 角色

用于：

- Unknown；
- Conflict；
- boundary drift；
- anchor missing；
- title mismatch；
- reopen-vs-follow-up ambiguity；
- WorkIntent inconsistency；
- KR/Objective mismatch。

## 12.2 结构

```ts
interface GovernanceIssue {
  id: string
  workObjectId: WorkObjectId
  issueType: string
  semanticDimension: string
  evidenceRefs: EvidenceId[]
  sourceRefs: SourceRef[]
  status: 'UNRESOLVED' | 'RESOLVED' | 'INVALIDATED'
  createdByRunId?: AgentRunId
  createdAt: Instant
  resolvedByRef?: string
}
```

## 12.3 Visibility policy

Persist ≠ display。

只有 issue 当前 materially affects：

- re-entry；
- next action；
- boundary；
- closure；

才进入 Lens / Now / Agent 对话。

不形成治理 Inbox。

---

# 13. Formalization Candidate

## 13.1 定位

短期“发现记忆”，不是 WorkObject。

```ts
interface FormalizationCandidate {
  id: string
  proposedKind?: WorkObjectKind
  proposedParentId?: WorkObjectId
  proposedTitle?: string
  proposedIntent?: WorkIntent | ProjectIntent

  sourceRefs: SourceRef[]
  supportCount: number
  status: 'ACTIVE' | 'EXPIRED' | 'MATERIALIZED' | 'INVALIDATED'
  createdAt: Instant
  lastSupportedAt: Instant
}
```

## 13.2 生命周期

- similar material → merge / strengthen；
- absorbed by existing object → invalidate；
- USER formalize → materialized；
- long no support → expire；
- silent user → no feedback semantics。

---

# 14. Reconciliation Queue

## 14.1 Trigger Types

建议：

```text
WORK_BURST_ENDED
FORMALIZATION_BASELINE
EVIDENCE_CHANGED
MANUAL_RECONCILE
SEMANTIC_IMPACT
POST_CLOSURE_ACTIVITY
RESUME_FROM_PAUSE
```

不把 Skill/model version upgrade 当普通 trigger。

## 14.2 Queue Item

```ts
interface ReconcileJob {
  id: string
  workObjectId: WorkObjectId
  triggerType: string
  sourceSnapshotId: string
  formalVersion: number
  priorityClass: 'NORMAL' | 'INTERACTIVE' | 'SYSTEM_RECOVERY'
  attempt: number
  notBefore?: Instant
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'STALE'
}
```

## 14.3 Merge / dedupe

同一个 WorkObject 多次变化应尽量合并成最新 snapshot；不需要按每个 block change 逐条重放自然语言理解。

## 14.4 Budget

执行器层必须有：

- concurrency cap；
- per-run context cap；
- expansion cap；
- retry cap；
- backoff；
- execution profile budget。

预算耗尽 → 保留 queue，不扩大权限。

---

# 15. Semantic Reconciliation Algorithm

建议统一流程：

```text
1. LOAD JOB
2. VERIFY PAUSE / EXECUTION PROFILE
3. LOAD FORMAL STATE @ version
4. LOAD DELTA / L0 CONTEXT
5. EXPAND L1/L2/L3 AS NEEDED WITHIN POLICY
6. BUILD WORKING MODEL
7. FREEZE MINIMAL EVIDENCE NEEDED FOR FORMAL JUDGMENT
8. PRODUCE TYPED RECONCILIATION RESULT
9. FRESHNESS REVALIDATION
10. AUTHORIZE EACH SEMANTIC OP
11. BUILD ORDERED CHANGE SET
12. KERNEL APPLY / COMMIT
13. CREATE PROJECTION OBLIGATION
14. UPDATE GOVERNANCE ISSUE / FEEDBACK / RUN RECEIPT
15. CLEAR COVERAGE DIRTY FOR THIS SNAPSHOT
```

## 15.1 Result

```ts
type ReconcileResult =
  | { type: 'NO_CHANGE' }
  | { type: 'CONFIRMED_CHANGE'; changes: SemanticChange[] }
  | { type: 'UNKNOWN'; issue: IssueDraft }
  | { type: 'CONFLICT'; issue: IssueDraft }
  | { type: 'BOUNDARY_CANDIDATE'; issue: IssueDraft; proposal?: ProposalDraft }
  | { type: 'NEEDS_MORE_CONTEXT'; reason: string }
```

## 15.2 Change Set

一次 AgentRun 可以产出多个相关 low-risk op：

```text
CHANGE_ENGAGEMENT WAITING -> ACTIONABLE
SET_CURRENT_FOCUS null -> "验证新版探针"
```

共同：

- snapshot；
- evidence context；
- agent run；
- governanceCorrelationId。

仍分别：

- authorization check；
- old/new；
- operation type；
- undo semantics。

依赖 operation 必须有序；前置变化 stale 时整个旧 change set 不继续执行。

---

# 16. Agent Executor Contract

## 16.1 执行器类型

```text
BUILT_IN_UNATTENDED
EXTERNAL_CLI
FUTURE_PROVIDER
```

Kernel 不做语义权威等级。

## 16.2 AgentRunReceipt

```ts
interface AgentRunReceipt {
  id: AgentRunId
  executorType: string
  executorId: string
  modelId?: string
  providerId?: string

  skillId: string
  skillVersion: string
  tasteVersion: string
  executionProfileId: string

  inputSnapshotId: string
  formalVersion: number
  contextScopeUsed: string
  evidenceRefs: EvidenceId[]

  outputType: string
  startedAt: Instant
  completedAt: Instant
}
```

## 16.3 Built-in unattended 权限

建议 capability：

允许：

- read bounded context；
- freeze evidence；
- SET_CURRENT_FOCUS；
- CHANGE_ENGAGEMENT ACTIONABLE↔WAITING；
- WaitingCondition sync；
- Context Association；
- Governance Issue；
- typed NO_PROPOSAL / UNKNOWN / CONFLICT。

禁止：

- CREATE；
- COMPLETE/CANCEL/REOPEN；
- PARKED；
- UPDATE_WORK_INTENT；
- UPDATE_PROJECT_INTENT；
- ownership；
- kind；
- split/merge；
- title；
- Primary Anchor migration。

## 16.4 External Agent

External CLI Agent：

- 可更广泛探索 local Graph/filesystem/Shell（受 execution profile 限制）；
- 仍只有 Frozen Evidence 可以支持 Formal Proposal；
- 不得 impersonate USER；
- USER natural-language authorization 必须经过 User Decision Compiler；
- deep Grill / review 是其核心优势，不意味着 Formal 权限更高。

---

# 17. Execution Profile / Privacy Boundary

建议：

```ts
interface ExecutionProfile {
  id: string
  executorId: string
  remoteAllowed: boolean
  dataScopePolicy: DataScopePolicy
  maxContextLevel: 'L0' | 'L1' | 'L2' | 'L3'
  allowFileEvidence: boolean
  allowShell: boolean
  autoMutationCapabilities: string[]
  budgetPolicy: BudgetPolicy
}
```

核心：

- profile 用户可理解、可检查；
- 无 authorized executor → queue waits；
- no silent provider fallback；
- no silent local→remote crossing；
- no “need more context” 自动扩大 scope。

---

# 18. Skill

## 18.1 Skill Package

Skill 应独立于 Agent：

- immutable；
- versioned；
- human readable；
- hash-addressed；
- 可被 Built-in / External Agent 同样读取；
- Kernel 控制 active version。

建议 package 包含：

```text
manifest
policy/instructions
examples
schema references
evaluation metadata
hash
```

## 18.2 Candidate / Active

- Agent 可生成 Skill candidate；
- 可运行 replay/eval；
- 不能自动 overwrite/activate；
- USER Decision 激活。

模型升级不自动触发旧 Formal State 重算。

---

# 19. Taste

## 19.1 Taste 内容

适合：

- question granularity；
- recommendation-first；
- split conservatism；
- current_focus evidence preference；
- verbosity / presentation preference；
- low-risk interruption tolerance。

不适合：

- 某一个 Project 的真实业务规则；
- capability；
- privacy；
- Formal invariants；
- operation authorization。

## 19.2 Feedback pipeline

```text
Interaction / correction
→ FeedbackEvent
→ pattern aggregation
→ Taste Candidate
→ replay evaluation
→ eligible limited auto activation
→ Active Taste version
```

不因为“后台没被纠正”生成正反馈。

## 19.3 自动激活硬边界

Taste update 不得：

- 扩大 Agent 权限；
- 增加 auto mutation operation；
- 改 privacy scope；
- 取消 USER authorization；
- 改 Kernel invariant。

---

# 20. FeedbackEvent

建议：

```ts
interface FeedbackEvent {
  id: string
  workObjectId?: WorkObjectId
  agentRunId?: AgentRunId
  proposalId?: ProposalId
  operationId?: OperationId
  skillVersion: string
  tasteVersion: string

  outcome:
    | 'ACCEPTED'
    | 'MODIFIED'
    | 'REJECTED'
    | 'IGNORED'
    | 'UNDONE_AFTER_APPLY'
    | 'ASSOCIATION_CORRECTED'
    | 'COGNITION_CORRECTED'

  strength: 'STRONG' | 'WEAK'
  userVisibleBeforeFeedback: boolean
  details?: object
}
```

规则：

- invisible silence ≠ positive feedback；
- visible continued compatible behavior 可 weak positive；
- explicit correction strong。

---

# 21. Natural Content Curation Architecture

## 21.1 与 Reconciliation 分离

`Semantic Reconciliation`：理解 Workspace，不默认改自然内容。

`Natural Content Curation`：用户明确授权后的自然内容变换。

两者不同 Agent capability / operation domain。

## 21.2 Curation Authorization

```ts
interface CurationAuthorization {
  id: string
  scope: SourceScope
  goals: string[]
  allowedTransformations: string[]
  forbiddenTransformations: string[]
  persistence: 'ONE_SHOT' | 'MANAGED_REGION'
  userDecisionRef: UserDecisionId
}
```

## 21.3 One-shot

允许范围内连续低风险执行；最终提供 high-density change summary + Undo。

高风险变换需要新的 User Decision：

- 删除；
- 压缩并删除原文；
- 语义改写；
- 大范围结构迁移。

## 21.4 Managed Curation Region

长期维护必须绑定明确 region：

```ts
interface ManagedCurationRegion {
  id: string
  sourceRef: SourceRef
  purpose: string
  policyRef: string
  authorizationRef: UserDecisionId
  status: 'ACTIVE' | 'USER_TAKEN_OVER' | 'PAUSED'
}
```

用户实质编辑 → 默认 `USER_TAKEN_OVER`。

## 21.5 Provenance / self-loop suppression

Agent 生成/移动内容：

- 标记 system/curation provenance；
- Graph Adapter 不把这些写入作为新 external reality dirty；
- Curated text 默认不作为 independent Evidence；
- Formal reasoning 追到底层 source。

用户随后实质编辑 → 新用户材料进入正常 dirty/reconciliation。

---

# 22. Graph Change Classification

Plugin 只做机械分类，不做自然语言业务语义。

建议事件来源：

```text
USER_NATURAL_EDIT
USER_MANAGED_PROJECTION_EDIT
SYSTEM_PROJECTION_WRITE
SYSTEM_CURATION_WRITE
IDENTITY_WRITE
HOST_STRUCTURAL_MOVE
UNKNOWN_EXTERNAL_EDIT
```

规则：

- SYSTEM_PROJECTION_WRITE / SYSTEM_CURATION_WRITE / identity side effects → suppression；
- same WorkObject internal move, content unchanged → 通常不语义 dirty；
- move across WorkObject owners → source context changes，触发相应重新关联/校准；
- UNKNOWN_EXTERNAL_EDIT → 保守当外部材料变化。

---

# 23. Kernel Semantic Operations

不提供 generic CRUD patch。建议 operation 集合明确、窄义。

## 23.1 典型操作

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
PURGE_WORK_OBJECT   // protected maintenance only
```

可能未来逐种加入：

```text
CREATE_FOLLOW_UP_RELATION
```

但默认拒绝通用 relation CRUD。

## 23.2 actor/capability

示意：

| Operation | USER | Built-in Agent | External Agent without USER decision | SYSTEM |
|---|---:|---:|---:|---:|
| CREATE | ✅ | ❌ | ❌ | ❌ |
| SET_CURRENT_FOCUS | ✅ | ✅ narrow | ✅ narrow | ❌ |
| ACTIONABLE↔WAITING | ✅ | ✅ narrow | ✅ narrow | ❌ |
| PARKED | ✅ | ❌ | ❌ | ❌ |
| UPDATE_WORK_INTENT | ✅ | ❌ | ❌ | ❌ |
| UPDATE_PROJECT_INTENT | ✅ | ❌ | ❌ | ❌ |
| ownership | ✅ | ❌ | ❌ | ❌ |
| title | ✅ | ❌ | ❌ | ❌ |
| COMPLETE/CANCEL/REOPEN | ✅ | ❌ | ❌ | ❌ |
| Anchor migration | ✅ | ❌ | ❌ | deterministic restore only |
| Context Association | ✅ | ✅ high-confidence | ✅ high-confidence | ✅ deterministic |
| PURGE | protected USER/maintenance | ❌ | ❌ | protected repair only |

注意 External Agent 可以承接用户自然语言决定，但最终 actor 仍是 USER Decision，不是 External Agent 自身升级权限。

---

# 24. Transaction Model

## 24.1 Formal transaction

```text
VALIDATE
→ PREPARE durable intent if needed
→ APPLY formal operation(s)
→ VERIFY invariants
→ COMMIT ledger
```

对于真正跨对象操作（ownership、split/merge future）：

- atomic all-or-nothing；
- 不用 eventual semantic propagation 替代关系事务。

## 24.2 Ordinary cross-object semantic impact

```text
Child Formal Commit
→ SemanticImpact(parent)
→ parent queue
→ parent independent reconciliation
```

不做 ancestor cascade atomic transaction。

## 24.3 Projection transaction

Formal commit 后：

```text
CREATE ProjectionObligation
→ Graph Adapter apply when available
→ verify canonical projection/hash
→ mark CONVERGED
```

Graph failure 不回滚 Formal Commit。

---

# 25. Projection Obligation

建议：

```ts
interface ProjectionObligation {
  id: string
  workObjectId: WorkObjectId
  formalVersion: number
  targetAnchorId: AnchorId
  desiredProjectionHash: string
  status: 'PENDING' | 'APPLIED' | 'VERIFIED' | 'FAILED'
  attempt: number
  lastError?: string
}
```

关键：

- 旧 Graph projection 不应再次被解释成 USER edit；
- projection 有 version/hash；
- system write 有 provenance；
- long failure 属于系统健康问题，而非用户待办。

---

# 26. Undo / Correction

## 26.1 Formal operations

每个 operation 保留：

- old value；
- new value；
- actor；
- decision/proposal/run/evidence refs；
- timestamp；
- governanceCorrelationId。

Undo：

- immediate + dependency safe 时可 inverse operation；
- later/dependent 时优先新 corrective operation；
- 不重写历史 ledger。

## 26.2 Silent Agent change

Silent ≠ invisible forever。

Object Lens / history 可下钻：

- 发生了什么现实变化；
- 哪次 AgentRun；
- 哪个 Skill；
- 哪些 Evidence；
- Undo / correct。

---

# 27. Object Lens Projection Contract

## 27.1 输入

```text
Formal State
+ User Cognitive Baseline
+ Source/Context delta
+ Frozen Evidence
+ Governance Issues
+ Active Formal children
+ Derived Cognition cache
```

## 27.2 输出语义层

至少可表达：

1. Source / direct facts；
2. Formal Semantic；
3. Derived Cognition；
4. Unknown / Conflict；
5. Advice / Governance recommendation。

不冻结具体 UI。

## 27.3 Meaningful Change generation

比较：

```text
user cognitive baseline model
vs
current reality model
```

输出只保留会改变用户当前心智模型的重要差异。

## 27.4 Cognitive Cursor

建议：

```ts
interface UserCognitiveCursor {
  workObjectId: WorkObjectId
  sourceCoverageSnapshotId: string
  formalVersion: number
  advancedAt: Instant
  advancedBy: 'LENS_REENTRY' | 'AGENT_DISCUSSION' | 'ACTIVE_WORK' | 'REVIEW'
}
```

保守推进：不清楚用户是否真正掌握时，不推进。

## 27.5 Work Frontier

Derived only；可以从：

- Formal children；
- Context；
- recent active nonformal work；
- blockers；

推导。

不持久 stable ID。

---

# 28. Now Projection Contract

## 28.1 输入信号

Formal：

- lifecycle；
- engagement；
- current_focus；
- userAttention；
- ownership。

Reality/Cognition：

- recent Meaningful Changes；
- work continuity；
- explicit recent commitment；
- time constraint；
- waiting changes；
- unresolved material governance issue；
- current work frontier；
- active nonformal work；
- attention suppression。

## 28.2 不产生 Formal rank

输出是动态 projection，可缓存：

```ts
interface NowProjection {
  generatedAt: Instant
  basisSnapshot: string
  contexts: AttentionContextView[]
}
```

AttentionContextView 没有 domain identity。

## 28.3 Attention Budget

原则不是固定 N，而是：

> 每增加一项都必须证明额外认知负担值得。

允许 0 项。

## 28.4 Lifecycle surfacing policy

### ACTIONABLE

可做 ≠ 值得现在展示。

### WAITING

安静等待默认不展示；重要变化/恢复/影响当前工作才展示。

### PARKED

默认不展示；现实显著重新激活时展示 Resume Candidate，但不自动 Unpark。

### CLOSED

默认不展示；新现实产生行动/动摇 closure 时展示 Reopen vs Follow-up context。

## 28.5 非 Formal work

极少数可以进入 Now，但必须：

- 已真实发生行动；
- 当前高度相关；
- Existing Object 无法合理吸收；
- 不显示会让 Now 明显失真。

不获得 lifecycle/state。

## 28.6 Attention Suppression

USER 可以明确：

```text
“这个现在先别推给我”
```

记录只影响 Now；支持 current / time-bound / condition-bound scope。

---

# 29. Decision Package Presentation

Decision Package 是 presentation/governance composition，不是新的万能 Kernel op。

```ts
interface DecisionPackage {
  id: string
  contextSummary: string
  rationale: string
  decisions: DecisionItem[]
  relevanceToNow?: string
}

interface DecisionItem {
  proposedOperation: SemanticOperationIntent
  parameters: object
  evidenceRefs: EvidenceId[]
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED'
}
```

一项 package 可以部分接受。

其展示入口：

- Object Lens；
- Now context；
- Agent dialogue；
- Pending Approval fallback。

---

# 30. Discovery Pipeline

建议流程：

```text
Bounded natural content scan
→ classify ordinary notes / existing-object context / independent work
→ Existing-Object matching
  ├─ high-confidence → Context Association
  ├─ ambiguous → hold weak candidate relation, no write
  └─ no fit
      ↓
  independent governance value assessment
      ↓
  Formalization Candidate only if threshold met
```

独立治理价值维度：

- outcome boundary；
- persistence over time；
- re-entry value；
- completion verifiability；
- boundary independence；
- maintenance value。

---

# 31. “整理今天”编排

建议 command orchestration：

```text
整理今天
→ determine today's bounded source window
→ run Discovery over new natural material
→ existing-object associations
→ prioritize touched Formal objects for reconciliation
→ wait within interactive budget
→ collect Meaningful Changes
→ collect mature Decision Packages
→ output compact real-world summary
```

不创建 DailyReview entity，不默认改 Journal。

---

# 32. Resume Context

```ts
interface ResumeContext {
  id: string
  workObjectId: WorkObjectId
  formalVersion: number
  sourceSnapshotId: string
  confirmedDiscussionOutcomes: string[]
  openQuestions: string[]
  refs: string[]
  createdAt: Instant
}
```

- 只为 continuation；
- stale 时 revalidate；
- 不把 Agent summary 当 USER authorization；
- 不保存 chain-of-thought。

---

# 33. Cross-Agent Conflict

同一 snapshot 上不同 Agent 输出冲突：

```text
Agent A result
Agent B result
      ↓
not last-writer-wins
not model-rank-wins
      ↓
reconciliation / conflict issue
      ↓
USER intent if needed
```

如果新 Agent 使用更新 snapshot，则它可以基于新 Evidence 产生合法新 operation，但原因是“现实更新”，不是“模型更强”。

---

# 34. System Health / Failure Isolation

## 34.1 Natural Work Fail Open

任意组件失败：

- Logseq natural editing 继续；
- 不要求用户停止工作；
- source change 后续追赶。

## 34.2 Formal Governance Fail Closed

以下失败时不假装 Formal success：

- Kernel unavailable；
- authorization unclear；
- evidence insufficient；
- stale snapshot；
- invariant failure。

## 34.3 Health surface

正常：尽量隐形。

按需“更多/系统状态”：

- queue；
- executor availability；
- projection lag；
- recent failures；
- pause state。

持续系统故障才主动提醒。

后台积压不是用户工作项。

---

# 35. 已知实现基线（Phase 1～7）

> 本节记录此前阶段性实现，以帮助 vNext 继续演进；它不是“旧实现必须兼容”的约束。vNext 明确允许 breaking refactor。

## Phase 1/2：Kernel / Graph Foundation

已建立：

- normalized SQLite current state；
- append-only Commit ledger；
- Plugin Graph Adapter；
- deterministic projection；
- transaction / recovery / undo；
- Logseq Desktop 0.10.15 Golden Path。

## Phase 3：current_focus Agent path

已建立：

- `SET_CURRENT_FOCUS`；
- SHA-256 Evidence；
- Proposal / Revision；
- `current-focus-maintenance@0.1.0`；
- AgentRunReceipt；
- Fake Agent；
- narrow AGENT authorization；
- NO_PROPOSAL；
- auto apply / feedback / undo / stale handling。

## Phase 4：engagement reconciliation

已建立：

- ACTIONABLE↔WAITING；
- WaitingCondition；
- `CHANGE_ENGAGEMENT`；
- `engagement-reconciliation` Skill；
- PARKED denied。

## Phase 5：Task Closure

已建立：

- COMPLETE/CANCEL/REOPEN/AMEND；
- closure records；
- USER only；
- TODO→DONE projection。

## Phase 5.5：Writing Language v1

已建立：

- Natural source primary；
- default OPEN+ACTIONABLE no-focus visually `TODO xxx`；
- stable identity independent visible labels；
- pure Renderer / identity-based Reader / Graph Adapter IO；
- visible labels：`[当前推进] / [等待] / [复查] / [完成] / [取消]`；
- presentation refresh 不生成 Domain commit；
- bounded old-format reader。

历史基线 commit 曾记录为：`e1351c...`。

## Phase 6：External CLI Agent Bridge

已建立：

- external shell-capable Agent read WorkObjects / search Logseq / freeze Evidence / consume same Skills；
- JSON-first CLI；
- `executor.type = EXTERNAL_CLI`；
- ReadReceipt vs FrozenEvidence 分离；
- NO_PROPOSAL / NEEDS_MORE_CONTEXT；
- external Agent 不 impersonate USER。

## Phase 7：MiniProject Governance

已建立：

- `miniproject-governance@0.1.0` composite read-only governance；
- `work-intent-maintenance` mutation skill；
- typed curation `ADD_REFERENCE`；
- WorkIntent Formal extension；
- Agent WorkIntent actor 仍为 AGENT path, no fake USER；
- curation target `[资源] / [支撑交付物]`；
- ephemeral Working Model；
- governanceCorrelationId；
- review-only boundary mutation；
- Taste active 0.1.0 / candidate 0.1.1 inactive；
- Plugin command formalize current record to MiniProject via USER create；
- External Agent bootstrap still forbidden CREATE。

历史阶段 commit：`ee31d4f0e50a3c2f9c490c73f8530c8a543f2951`；当时测试记录 127/127。

> 注意：Grill Me 后的目标架构对 Phase 7 的部分授权/事务/Projection 策略已经进一步收紧或修订，实现时应以本文最新规范为准，而不是机械延续 Phase 7 行为。

---

# 36. 明确 Non-goals

vNext 第一阶段明确不建设：

- Event Sourcing 全体系；
- generic migration framework；
- generic CRUD Patch API；
- provider abstraction mega-framework；
- 任意 WorkObject relation graph；
- 通用 dependency/workflow engine；
- 多级 priority matrix；
- progress percentage engine；
- arbitrary nested projects；
- permanent conversation transcript store；
- background Natural Workspace rewrite；
- Agent-generated full knowledge graph；
- Daily Review workflow system；
- Governance Inbox；
- Agent self-modifying Skill；
- model-based authority hierarchy。

---

# 37. 最终架构检查表

任何新设计/PR 在合并前，应能回答：

1. 这是 Formal fact 还是 Derived Cognition？为什么必须持久化？
2. 如果不放进 Kernel，会不会真的导致 correctness 错误？
3. Agent 的写权限是否被无意扩大？
4. 是否产生了一个新的 Inbox / backlog 给用户维护？
5. 是否把自然 Workspace 变成 Schema UI？
6. 是否让 Agent 生成的内容成为 Agent 自己的 Evidence？
7. 是否区分 USER Authorization 与 Agent recommendation？
8. 是否绑定 input snapshot 并在 apply 前 revalidate freshness？
9. 是否把“现实变化”与“模型/Skill 升级”混淆？
10. Graph Adapter 离线时 Formal Kernel 是否仍能保持正确？
11. Kernel 故障时用户是否仍可自然工作？
12. 是否能用更小、更窄的语义 operation 代替 generic patch？
13. 是否因为 UI 方便而创造新的 domain entity？
14. 是否保留 Source/Evidence/User Decision provenance？
15. 失败时是自然工作 Fail Open、正式修改 Fail Closed 吗？

只要其中任一项回答不清楚，就不应直接扩展 Formal Core。
