# Task Copilot 工作台

Task Copilot 工作台将工作视图、Graph 外的 Markdown 材料和 vNext 任务管理整合为一个 Logseq 插件。工作视图与材料可独立使用，本地 Kernel 继续管理正式任务状态与语义提交。

当前整合结构、启用方法与边界见 [整合说明](docs/integration/README.md)；[交互需求树](docs/integration/requirements.html)展示从核心需求到实现位置和默认启用情况。需求数据在 `docs/integration/requirements.json`，运行 `npm run docs:requirements` 更新 HTML。

2026-10-01 的下一阶段设计讨论见 [工作区协作需求](docs/requirements/2026-10-01-project-workspace-collaboration.md)与[架构分析报告](docs/architecture/2026-10-01-workspace-architecture-review.md)（[PDF](docs/architecture/2026-10-01-workspace-architecture-review.pdf)）。这些是演进提案；代码瘦身按[渐进重构计划](docs/refactoring/README.md)分轮实施，第一轮提示词已整理。

**Formal Kernel baseline (2026-08-16, schema v22).** Formal task semantics and governance are defined in [`docs/vnext/05`](docs/vnext/05-Task-Copilot-vNext-产品与治理宪章.md), [`06`](docs/vnext/06-Task-Copilot-vNext-领域模型与Agent架构规范.md), and [`07`](docs/vnext/07-Task-Copilot-vNext-实现路线图与阶段验收.md); the older `01–04` set is historical/superseded. The integrated plugin scope and module boundaries are defined in [the integration guide](docs/integration/README.md) and [requirements map](docs/integration/requirements.html).

- **Formal Commit is independent of Graph availability.** A legal Kernel commit is applied atomically to SQLite Current State + Commit Ledger and then creates a durable `ProjectionObligation`; Graph application is asynchronous, retryable, restart-safe, and can never overwrite a user-edited projection (`POST /v1/commits/commit`, `GET /v1/projection-obligations`, `GET /v1/projection-health`).
- **Background semantic maintenance is bounded and persistent.** The Plugin mechanically observes Primary Anchor and structural subtree changes, suppresses its own projection writes, waits for a quiet period, and reports source changes into a persistent reconcile queue (`source_coverage` + `reconcile_jobs`, schema v12). A built-in maintenance loop reconciles only Formal WorkObjects with bounded Context Packs and typed semantic judgments; it may update `current_focus` and `ACTIONABLE ↔ WAITING`, never CREATE/PARK/COMPLETE/WorkIntent/ownership.
- **Context, Cognition and Evidence are separated.** `ContextAssociation` records explain why natural material belongs to a WorkObject without Graph writes; a bounded Context Pack is handed to a cognition executor (Fake by default, `DeepSeekV4FlashExecutor` behind an explicit remote profile); only model-selected handles are frozen as Evidence.
- **Governance Issues are durable uncertainty, not an Inbox.** UNKNOWN/CONFLICT/BOUNDARY_CANDIDATE reconciliations clear coverage but persist a dimension-scoped `GovernanceIssue` (`OPEN → RESOLVED/SUPERSEDED`). Unrelated dimensions keep working.
- **Natural-language USER authorization is compiled through a trusted Plugin origin.** A `DecisionPackage` + a trusted `PLUGIN_USER_CHANNEL` event whose short acknowledgment exactly matches the normalized whitelist becomes an immutable `UserDecision`, then a precise `USER`-actor Formal Commit with projection obligation. External Agents cannot create trusted user events; replay and stale `presentationRevision` fail closed. Quoted, historical, conditional, ambiguous, or stale utterances never mutate Formal State.
- **Cognition output is strict, structured, and syntax-only.** DeepSeek responses are balanced-JSON extracted, never semantically repaired, and every `ExecutionProfile` field (`allowedDataScope`, `maxContextItems`, `maxInputChars`, `timeoutMs`, `retryBudget`, `remoteEnabled`, `modelAlias`, `credentialRef`, `executor`) is enforced.
- **Governance Issues resolve causally.** Issue identity is a stable hash of object, judgment kind, dimension, and selected evidence handles — not LLM wording — and an issue can only be resolved by a judgment on the same dimension.
- **Discovery is bounded and Existing-Object-First.** `整理今天` / explicit bounded runs reconcile today's natural material against existing WorkObjects first; ordinary one-off, reference, historical, and ambiguous notes stay in the natural workspace. Only material with an independent, persistent outcome boundary becomes a durable `FormalizationCandidate`, and only a mature candidate becomes a `DecisionPackage`.
- **Four cognitive entries.** `现在` restores the few contexts worth returning to, `待我确认` holds only mature USER decisions, `项目` is the Kernel Formal Work Map, and `更多` is low-frequency system health. A thin Logseq panel uses user language, not internal enums.
- **Now is attention, not a task list.** A persistent `UserReadBaseline` only advances when the user actually opens an object from the Plugin; “since last seen” is computed against that baseline. Quiet WAITING, bare `current_focus`, and package-only objects do not occupy Now. Confirmation cards are bound directly to one DecisionPackage with one-click 确认/暂不 and operation-specific impact.
- **USER authority is capability-bound.** Ownership has no direct mutation route (`ASSIGN_PARENT` is a trusted USER Decision), WorkIntent is USER-owned (Agent recommendations become Decision Packages), and USER-actor formal commit routes require the Plugin USER-channel token; an External Agent with a bare bearer token cannot impersonate USER.
- **ProjectIntent is a sparse USER-owned Project commitment.** Objective, 1–5 Key Results, optional scope and currentPhase are stored separately (schema v18); `UPDATE_PROJECT_INTENT` only executes through a trusted USER Decision. ProjectIntent feeds Object Surface, Now reality, WorkMap secondary line and the Agent context without becoming project metadata or progress tracking.
- **Unattended maintenance is bounded.** The Kernel Service runs a persistent reconcile worker for existing Formal WorkObjects (current_focus, ACTIONABLE↔WAITING, WaitingCondition sync) with durable queue, burst coalescing, per-run/hour remote budget, pause/resume, composite semantic freshness and four health states (HEALTHY / CATCHING_UP / PAUSED / DEGRADED). A single Kernel instance per runtime scope is enforced by a SQLite lease; RUNNING reconcile jobs are superseded, not killed, by newer source generations; remote budget is spent only on actual model attempts; health recovers only on real success. Natural Discovery stays explicit; the worker never gains USER authority.
- **Closure readiness is derived cognition, not a lifecycle.** `ClosureAssessment` (READY / NOT_READY / UNKNOWN / CONFLICT) is deterministically derived from frozen evidence, intent, conflicts, and open descendants — no percentage, Objective-achieved flag, or generic score. Complete / Cancel / Reopen / Amend extend to MiniProject and Project under the same USER-only authority; a parent cannot close while any formal descendant is OPEN, and External Agents hand off closure intent only through a `COMPLETE_WORK_OBJECT` Decision Package.
- **Discovery is honest about what it has not finished.** Bounded runs expose `scopeTotal/remaining/continuationToken`; capped runs are `PARTIAL` and resume later instead of silently pretending completion.
- **Formalization still requires trusted USER authorization.** `Candidate → Decision Package → Plugin Trusted USER Channel → “纳入” → CREATE_WORK_OBJECT → Formal Commit → Projection`; External Agents can discover and recommend but never create; `object context <id>` gives them bounded re-entry reality and explicit allowed/user-only action boundaries.
- **Failure principle:** Natural Work Fail Open, Formal Governance Fail Closed. Kernel/Agent/DeepSeek outage never blocks ordinary Logseq work; unclear authorization never fabricates a Formal mutation.

**Kernel baseline**: Phase 20 Reliability / Release Candidate — RC gate complete: backup/restore, service lifecycle, doctor, migration v16–v22, 12-day 103-object long soak, security defaults, and final DeepSeek closure eval (false READY=0) all landed (see [`RC_RELEASE_GATE.md`](RC_RELEASE_GATE.md), [`RC_INPUT_CHECKLIST.md`](RC_INPUT_CHECKLIST.md), [`docs/rc/USER_OPERATIONS_GUIDE.md`](docs/rc/USER_OPERATIONS_GUIDE.md)).
**Completed**: Phase 12/12.5/12.6 Discovery, Phase 13/13.5 unattended runtime + hardening, Phase 14 closure readiness + governed parent closure, Phase 15 evidence-grounded semantic closure assessment, Phase 16A/16B/16C/17 UX and conversation, Phase 20 RC preflight.
**Current development**: 工作视图、外部材料与任务界面的首版整合。原文排列同步明确不进入本版；旧 Feature Freeze 记录保留为历史决策，新的插件产品范围以整合说明和需求树为准。

Phase 5 adds user-only Task Closure. A user can explicitly complete or cancel a Task, reopen it with a reason, amend the current Closure without overwriting its original record, inspect durable Closure history, and safely undo the most recent Closure Commit. Online `TODO → DONE` is interpreted as another user command and enters the same Kernel transaction. Agents cannot complete, cancel, reopen, or amend Closure. Phase 13.5/14 extends the same USER-only closure to MiniProject and Project: derived readiness is shown without an Objective-achieved percentage, a parent cannot close while a formal descendant is OPEN, Reopen never cascades, and an External Agent can only hand closure intent to the user through a Decision Package.

Phase 5.5 gives those formal semantics a sparse Logseq-native Writing Language. An ordinary `OPEN + ACTIONABLE` Task renders no managed children. Only information-bearing `**[当前推进]**`, `**[等待]**`, `**[复查]**`, `**[完成]**`, or `**[取消]**` children appear. Stable source/field UUIDs in the PrimaryAnchor registry identify semantics; visible labels are renderer-owned presentation and never the semantic ID. The command `Task Copilot vNext：重新渲染当前正式事项` safely refreshes presentation without a business Commit or WorkObject version change and fails closed on value/topology conflict.

In Logseq, select the relevant fact block and run `Task Copilot vNext：让 Agent 对账可行动状态`. Entering WAITING adds a readable managed Waiting field and removes the object from the actionable query; leaving WAITING removes that field and returns it. Use `Task Copilot vNext：完成当前 Task` for one-action completion, or the separate Cancel/Reopen/Amend/Show Closure commands. `Cmd+Shift+U` invokes the unambiguous recent-Commit Undo path.

## 普通使用（macOS / Node 20.20.x）

```sh
npm install
npm run build
npm run task-copilot -- service start
npm run task-copilot -- service status
npm run task-copilot -- doctor
```

完整步骤、备份/恢复/升级和故障排查见 [`docs/rc/USER_OPERATIONS_GUIDE.md`](docs/rc/USER_OPERATIONS_GUIDE.md)。所有 `npm run task-copilot -- ...` 命令都在仓库根目录执行；若想使用更短的 `task-copilot ...`，可执行一次 `npm link`。

## 开发调试（workspace 级）

本地已有生产 Logseq 时，使用[独立 Desktop 测试环境](docs/rc/LOGSEQ_SANDBOX.md)。它复制应用并隔离 home、profile、Graph 和 Kernel；启动/停止仅操作测试进程。

```sh
npm run check
TASK_COPILOT_STATE_DIR=/path/to/private/state npm start --workspace @task-copilot/kernel-service
TASK_COPILOT_DESCRIPTOR=/path/to/private/state/kernel.json npm run start --workspace @task-copilot/cli -- status --json
```

Architecture, ADRs, and acceptance evidence live in [`docs/architecture`](docs/architecture), [`docs/adr`](docs/adr), and [`docs/golden-paths`](docs/golden-paths). The current authority index is [`docs/vnext/README.md`](docs/vnext/README.md). Object Lens and CDP lessons remain non-authoritative reference material in [`docs/experience`](docs/experience).

An external Agent should start with [`docs/agent/external-cli-agent-guide.md`](docs/agent/external-cli-agent-guide.md) and `npm run task-copilot -- agent bootstrap --json`.
For a MiniProject Grill, it should then read [`docs/agent/miniproject-governance-guide.md`](docs/agent/miniproject-governance-guide.md), `npm run task-copilot -- skill show miniproject-governance`, and `npm run task-copilot -- taste show miniproject-governance-taste`.
