# Task Copilot vNext

Task Copilot vNext is a local-first trusted work kernel. Logseq remains the natural work surface; the Local Kernel Service is the sole authority for formal state and Semantic Commits; the Plugin is a thin UI and Graph Adapter; the CLI is the reference HTTP client.

Phase 6 lets external shell-capable agents use that CLI as a governed cognition surface. They may read Formal WorkObjects, explore Logseq through the bounded Graph Gateway, freeze formal Evidence, use the same approved Skills as Fake Agents, submit Agent Results, and auto-apply eligible LOW-risk current-focus or `ACTIONABLE <-> WAITING` Proposals. They may not write SQLite or raw Formal Graph state, impersonate `USER`, create or park work, or complete, cancel, and reopen Tasks. The Kernel still creates every Proposal and Semantic Commit; the loaded Plugin remains the background GraphEffect executor.

The current slice supports two governed Agent capabilities: deterministic Fake Agents may propose an Evidence-backed `SET_CURRENT_FOCUS` update or reconcile one explicit WorkObject between `ACTIONABLE` and `WAITING`. They are constrained by the versioned `current-focus-maintenance/0.1.0` and `engagement-reconciliation/0.1.1` Skills. The Graph Adapter signs each fresh Evidence read with a separate local snapshot capability; the Kernel verifies that proof, target, projection, canonical Evidence SHA-256, target Evidence watermark, exact approved Skill hash, operation-contract version, and recovery state before preparing the Commit. Agents never write SQLite or Logseq directly, PARKED remains user-controlled, and Undo remains a compensation Commit.

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
