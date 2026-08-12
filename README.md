# Task Copilot vNext

Task Copilot vNext is a local-first trusted work kernel. Logseq remains the natural work surface; the Local Kernel Service is the sole authority for formal state and Semantic Commits; the Plugin is a thin UI and Graph Adapter; the CLI is the reference HTTP client.

The current slice also supports one governed Agent capability: a deterministic Fake Agent may propose a LOW-risk, Evidence-backed `SET_CURRENT_FOCUS` update through the versioned `current-focus-maintenance/0.1.0` Skill. The Graph Adapter signs each fresh Evidence read with a separate local snapshot capability; the Kernel verifies that proof, target, projection, canonical Evidence SHA-256, exact approved Skill hash, operation-contract version, and recovery state before automatically preparing the Commit. The Agent never writes SQLite or Logseq directly, and Undo remains a compensation Commit.

Use Node 20.20.x:

```sh
npm run check
TASK_COPILOT_STATE_DIR=/path/to/private/state npm start --workspace @task-copilot/kernel-service
TASK_COPILOT_DESCRIPTOR=/path/to/private/state/kernel.json npm start --workspace @task-copilot/cli -- status --json
```

Architecture and acceptance evidence live in [`docs/architecture`](docs/architecture), [`docs/adr`](docs/adr), and [`docs/golden-paths`](docs/golden-paths).
