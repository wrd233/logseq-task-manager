# Task Copilot vNext

Task Copilot vNext is a local-first trusted work kernel. Logseq remains the natural work surface; the Local Kernel Service is the sole authority for formal state and Semantic Commits; the Plugin is a thin UI and Graph Adapter; the CLI is the reference HTTP client.

**Current capability baseline (2026-08-15).** Authoritative product/architecture truth lives in [`docs/vnext/05`](docs/vnext/05-Task-Copilot-vNext-产品与治理宪章.md), [`06`](docs/vnext/06-Task-Copilot-vNext-领域模型与Agent架构规范.md), and [`07`](docs/vnext/07-Task-Copilot-vNext-实现路线图与阶段验收.md); the older `01–04` set is historical/superseded.

- **Formal Commit is independent of Graph availability.** A legal Kernel commit is applied atomically to SQLite Current State + Commit Ledger and then creates a durable `ProjectionObligation`; Graph application is asynchronous, retryable, restart-safe, and can never overwrite a user-edited projection (`POST /v1/commits/commit`, `GET /v1/projection-obligations`, `GET /v1/projection-health`).
- **Background semantic maintenance is bounded and persistent.** The Plugin mechanically observes Primary Anchor and structural subtree changes, suppresses its own projection writes, waits for a quiet period, and reports source changes into a persistent reconcile queue (`source_coverage` + `reconcile_jobs`, schema v12). A built-in maintenance loop reconciles only Formal WorkObjects with bounded Context Packs and typed semantic judgments; it may update `current_focus` and `ACTIONABLE ↔ WAITING`, never CREATE/PARK/COMPLETE/WorkIntent/ownership.
- **Context, Cognition and Evidence are separated.** `ContextAssociation` records explain why natural material belongs to a WorkObject without Graph writes; a bounded Context Pack is handed to a cognition executor (Fake by default, `DeepSeekV4FlashExecutor` behind an explicit remote profile); only model-selected handles are frozen as Evidence.
- **Governance Issues are durable uncertainty, not an Inbox.** UNKNOWN/CONFLICT/BOUNDARY_CANDIDATE reconciliations clear coverage but persist a dimension-scoped `GovernanceIssue` (`OPEN → RESOLVED/SUPERSEDED`). Unrelated dimensions keep working.
- **Natural-language USER authorization is compiled through a trusted Plugin origin.** A `DecisionPackage` + a trusted `PLUGIN_USER_CHANNEL` event whose short acknowledgment exactly matches the normalized whitelist becomes an immutable `UserDecision`, then a precise `USER`-actor Formal Commit with projection obligation. External Agents cannot create trusted user events; replay and stale `presentationRevision` fail closed. Quoted, historical, conditional, ambiguous, or stale utterances never mutate Formal State.
- **Cognition output is strict, structured, and syntax-only.** DeepSeek responses are balanced-JSON extracted, never semantically repaired, and every `ExecutionProfile` field (`allowedDataScope`, `maxContextItems`, `maxInputChars`, `timeoutMs`, `retryBudget`, `remoteEnabled`, `modelAlias`, `credentialRef`, `executor`) is enforced.
- **Governance Issues resolve causally.** Issue identity is a stable hash of object, judgment kind, dimension, and selected evidence handles — not LLM wording — and an issue can only be resolved by a judgment on the same dimension.
- **Discovery is bounded and Existing-Object-First.** `整理今天` / explicit bounded runs reconcile today's natural material against existing WorkObjects first; ordinary one-off, reference, historical, and ambiguous notes stay in the natural workspace. Only material with an independent, persistent outcome boundary becomes a durable `FormalizationCandidate`, and only a mature candidate becomes a `DecisionPackage`.
- **Four cognitive entries.** `现在` restores the few contexts worth returning to, `待我确认` holds only mature USER decisions, `项目` is the Kernel Formal Work Map, and `更多` is low-frequency system health. A thin Logseq panel uses user language, not internal enums.
- **Discovery is honest about what it has not finished.** Bounded runs expose `scopeTotal/remaining/continuationToken`; capped runs are `PARTIAL` and resume later instead of silently pretending completion.
- **Formalization still requires trusted USER authorization.** `Candidate → Decision Package → Plugin Trusted USER Channel → “纳入” → CREATE_WORK_OBJECT → Formal Commit → Projection`; External Agents can discover and recommend but never create; `object context <id>` gives them bounded re-entry reality and explicit allowed/user-only action boundaries.
- **Failure principle:** Natural Work Fail Open, Formal Governance Fail Closed. Kernel/Agent/DeepSeek outage never blocks ordinary Logseq work; unclear authorization never fabricates a Formal mutation.

The next implementation phase is Discovery / Formalization / 整理今天 (`docs/vnext/07` Phase 12).

Phase 5 adds user-only Task Closure. A user can explicitly complete or cancel a Task, reopen it with a reason, amend the current Closure without overwriting its original record, inspect durable Closure history, and safely undo the most recent Closure Commit. Online `TODO → DONE` is interpreted as another user command and enters the same Kernel transaction. Agents cannot complete, cancel, reopen, or amend Closure; MiniProject and Project Closure remain unsupported.

Phase 5.5 gives those formal semantics a sparse Logseq-native Writing Language. An ordinary `OPEN + ACTIONABLE` Task renders no managed children. Only information-bearing `**[当前推进]**`, `**[等待]**`, `**[复查]**`, `**[完成]**`, or `**[取消]**` children appear. Stable source/field UUIDs in the PrimaryAnchor registry identify semantics; visible labels are renderer-owned presentation and never the semantic ID. The command `Task Copilot vNext：重新渲染当前正式事项` safely refreshes presentation without a business Commit or WorkObject version change and fails closed on value/topology conflict.

In Logseq, select the relevant fact block and run `Task Copilot vNext：让 Agent 对账可行动状态`. Entering WAITING adds a readable managed Waiting field and removes the object from the actionable query; leaving WAITING removes that field and returns it. Use `Task Copilot vNext：完成当前 Task` for one-action completion, or the separate Cancel/Reopen/Amend/Show Closure commands. `Cmd+Shift+U` invokes the unambiguous recent-Commit Undo path.

Use Node 20.20.x:

```sh
npm run check
TASK_COPILOT_STATE_DIR=/path/to/private/state npm start --workspace @task-copilot/kernel-service
TASK_COPILOT_DESCRIPTOR=/path/to/private/state/kernel.json npm start --workspace @task-copilot/cli -- status --json
```

Architecture, ADRs, and acceptance evidence live in [`docs/architecture`](docs/architecture), [`docs/adr`](docs/adr), and [`docs/golden-paths`](docs/golden-paths). The current authority index is [`docs/vnext/README.md`](docs/vnext/README.md). Object Lens and CDP lessons remain non-authoritative reference material in [`docs/experience`](docs/experience).

An external Agent should start with [`docs/agent/external-cli-agent-guide.md`](docs/agent/external-cli-agent-guide.md) and `task-copilot agent bootstrap --json`.
For a MiniProject Grill, it should then read [`docs/agent/miniproject-governance-guide.md`](docs/agent/miniproject-governance-guide.md), `skill show miniproject-governance`, and `taste show miniproject-governance-taste`.
