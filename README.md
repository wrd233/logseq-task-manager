# Task Copilot vNext

Task Copilot vNext is a local-first trusted work kernel. Logseq remains the natural work surface; the Local Kernel Service is the sole authority for formal state and Semantic Commits; the Plugin is a thin UI and Graph Adapter; the CLI is the reference HTTP client.

The current slice supports two governed Agent capabilities: deterministic Fake Agents may propose an Evidence-backed `SET_CURRENT_FOCUS` update or reconcile one explicit WorkObject between `ACTIONABLE` and `WAITING`. They are constrained by the versioned `current-focus-maintenance/0.1.0` and `engagement-reconciliation/0.1.0` Skills. The Graph Adapter signs each fresh Evidence read with a separate local snapshot capability; the Kernel verifies that proof, target, projection, canonical Evidence SHA-256, target Evidence watermark, exact approved Skill hash, operation-contract version, and recovery state before preparing the Commit. Agents never write SQLite or Logseq directly, PARKED remains user-controlled, and Undo remains a compensation Commit.

In Logseq, select the relevant fact block and run `Task Copilot vNext：让 Agent 对账可行动状态`. Entering WAITING adds a readable managed Waiting field and removes the object from the actionable query; leaving WAITING removes that field and returns it. `Cmd+Shift+U` invokes the unambiguous recent-Commit Undo path.

Use Node 20.20.x:

```sh
npm run check
TASK_COPILOT_STATE_DIR=/path/to/private/state npm start --workspace @task-copilot/kernel-service
TASK_COPILOT_DESCRIPTOR=/path/to/private/state/kernel.json npm start --workspace @task-copilot/cli -- status --json
```

Architecture and acceptance evidence live in [`docs/architecture`](docs/architecture), [`docs/adr`](docs/adr), and [`docs/golden-paths`](docs/golden-paths).
