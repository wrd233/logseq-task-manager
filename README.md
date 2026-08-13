# Task Copilot vNext

Task Copilot vNext is a local-first trusted work kernel. Logseq remains the natural work surface; the Local Kernel Service is the sole authority for formal state and Semantic Commits; the Plugin is a thin UI and Graph Adapter; the CLI is the reference HTTP client.

Phase 7 adds light, evidence-bound governance for exactly one Formal MiniProject at a time. An External Agent reads the immutable `miniproject-governance@0.1.0` composite policy and provisional Taste, maintains its rich Working Model only in local reasoning, asks at most one recommendation-first bottleneck question, and stops when no question has enough governance value. Stable internal changes delegate to narrow `current-focus-maintenance` or `work-intent-maintenance` proposals; a confirmed resource can use typed `ADD_REFERENCE`. Split, merge, kind/owner changes, Project promotion, PARKED, Closure, and history moves remain review-only.

Formal MiniProject state grows by only nullable `desiredOutcome` and optional bounded `completionChecks`. Empty values are valid and render nothing. Natural `[当前状态]`, `[背景]`, `[资源]`, `[支撑交付物]`, and `[结果]` stay in Logseq; no generic Graph or WorkObject patch API exists. Every Formal change remains AGENT-attributed, reversible, Evidence/version/projection checked, readback verified, and recoverable—natural conversation is never fabricated as a trusted `USER` command.

Phase 6 lets external shell-capable agents use that CLI as a governed cognition surface. They may read Formal WorkObjects, explore Logseq through the bounded Graph Gateway, freeze formal Evidence, use the same approved Skills as Fake Agents, submit Agent Results, and auto-apply eligible LOW-risk current-focus or `ACTIONABLE <-> WAITING` Proposals. They may not write SQLite or raw Formal Graph state, impersonate `USER`, create or park work, or complete, cancel, and reopen Tasks. The Kernel still creates every Proposal and Semantic Commit; the loaded Plugin remains the background GraphEffect executor.

The production broker path is verified on Logseq Desktop 0.10.15: the built CLI completed current-focus, both Waiting directions, and `NO_PROPOSAL` on a protected local Graph with zero Plugin UI interactions during governance. A context-free Agent using only the short operating guide and CLI self-discovery also completed a bounded “整理今天” pass, applied one justified low-risk update, preserved an ambiguous background item, and left Recovery empty. Host-specific Graph content and runtime artifacts are not tracked.

The governed mutation capabilities are `SET_CURRENT_FOCUS`, `ACTIONABLE ↔ WAITING`, and MiniProject `UPDATE_WORK_INTENT`, each constrained by its own immutable narrow Skill. The Graph Adapter signs each fresh Evidence read with a separate local snapshot capability; the Kernel verifies that proof, target, projection, canonical Evidence SHA-256, exact approved composite/mutation Skill and Taste hashes where applicable, operation-contract version, and recovery state before preparing the Commit. Agents never write SQLite or raw Logseq state directly, PARKED remains user-controlled, and Undo remains a compensation Commit.

Phase 5 adds user-only Task Closure. A user can explicitly complete or cancel a Task, reopen it with a reason, amend the current Closure without overwriting its original record, inspect durable Closure history, and safely undo the most recent Closure Commit. Online `TODO → DONE` is interpreted as another user command and enters the same Kernel transaction. Agents cannot complete, cancel, reopen, or amend Closure; MiniProject and Project Closure remain unsupported.

Phase 5.5 gives those formal semantics a sparse Logseq-native Writing Language. An ordinary `OPEN + ACTIONABLE` Task renders no managed children. Only information-bearing `**[当前推进]**`, `**[等待]**`, `**[复查]**`, `**[完成]**`, or `**[取消]**` children appear. Stable source/field UUIDs in the PrimaryAnchor registry identify semantics; visible labels are renderer-owned presentation and never the semantic ID. The command `Task Copilot vNext：重新渲染当前正式事项` safely refreshes presentation without a business Commit or WorkObject version change and fails closed on value/topology conflict.

In Logseq, select the relevant fact block and run `Task Copilot vNext：让 Agent 对账可行动状态`. Entering WAITING adds a readable managed Waiting field and removes the object from the actionable query; leaving WAITING removes that field and returns it. Use `Task Copilot vNext：完成当前 Task` for one-action completion, or the separate Cancel/Reopen/Amend/Show Closure commands. `Cmd+Shift+U` invokes the unambiguous recent-Commit Undo path.

Use Node 20.20.x:

```sh
npm run check
TASK_COPILOT_STATE_DIR=/path/to/private/state npm start --workspace @task-copilot/kernel-service
TASK_COPILOT_DESCRIPTOR=/path/to/private/state/kernel.json npm start --workspace @task-copilot/cli -- status --json
```

Architecture and acceptance evidence live in [`docs/architecture`](docs/architecture), [`docs/adr`](docs/adr), and [`docs/golden-paths`](docs/golden-paths). The Phase 5.5 real-host acceptance is recorded in [`docs/golden-paths/logseq-writing-language-real-graph.md`](docs/golden-paths/logseq-writing-language-real-graph.md).

An external Agent should start with [`docs/agent/external-cli-agent-guide.md`](docs/agent/external-cli-agent-guide.md) and `task-copilot agent bootstrap --json`.
For a MiniProject Grill, it should then read [`docs/agent/miniproject-governance-guide.md`](docs/agent/miniproject-governance-guide.md), `skill show miniproject-governance`, and `taste show miniproject-governance-taste`.
