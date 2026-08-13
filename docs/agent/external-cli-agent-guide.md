# Task Copilot External CLI Agent Guide

Set `TASK_COPILOT_DESCRIPTOR` to the private `kernel.json`, then begin with:

```sh
task-copilot agent bootstrap --json
task-copilot skill list --json
task-copilot object list --lifecycle OPEN --json
task-copilot graph status --json
```

For one formal object:

1. Read it with `object show`. `skill show` returns both the immutable approved Skill and the Kernel-owned closed `resultContract`; use that exact shape instead of guessing fields.
2. Explore narrowly with `graph search`, `graph block show`, or `graph page show`.
3. Freeze only the finite blocks that justify a formal conclusion with `evidence freeze`.
4. Start a run for `CURRENT_FOCUS_MAINTENANCE` or `ENGAGEMENT_RECONCILIATION`.
5. Submit one closed JSON result from a file or stdin with `agent-run finish`.
6. If a Proposal exists, use `proposal apply <id> --wait --json`, then inspect the Commit and object.

Use `NO_PROPOSAL` or `NEEDS_MORE_CONTEXT` when evidence is insufficient. Search and ReadReceipts are context, not Evidence.

Never claim to be `USER`; never complete, cancel, reopen, park, create, edit SQLite, edit the descriptor, or directly modify Task Copilot managed projection. Do not invent Evidence content or caller-selected risk/Skill/actor fields.

For one Formal MiniProject, switch to [`miniproject-governance-guide.md`](miniproject-governance-guide.md). Read `skill show miniproject-governance`, `skill show work-intent-maintenance`, and `taste show miniproject-governance-taste`. A MiniProject run may diagnose/ask/stop and may delegate only `SET_CURRENT_FOCUS` or `UPDATE_WORK_INTENT`; a confirmed source may use typed `curation add-reference`. The Kernel selects the narrow mutation Skill. Never submit a generic patch or execute split, merge, kind/owner, Project, PARKED, Closure, or history movement.

Bootstrap prompt:

> 使用本机 Task Copilot CLI 帮我整理今天的 Logseq。先读取 external CLI agent guide 和 `agent bootstrap`。已有正式事项中，能明确更新 current focus 或 ACTIONABLE 与 WAITING 的直接处理；不确定的不要强行改。不要冒充 USER，不要完成、取消、Reopen、PARKED，也不要直接修改 SQLite 或 Formal Projection。
