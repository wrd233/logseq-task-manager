# Task Copilot External CLI Agent Guide

For natural-work collaboration, use the actual CLI path, directory and private channel supplied by Logseq's “带当前工作去协作”. Read `workspace collaboration read` and `workspace guidance read`; report the returned loaded versions and inspect freshness and independent grants before writing. These explicit reads do not automatically reload an existing conversation or edit global Agent configuration.

`workspace formatting preview --input-file <path>` accepts `{requestId, sourceIds, labels?}` from freshly read saved sources. It returns exact original/formatted lines and source/structure versions. The default labels are 目标、想法、注、说明、记录、问题; explicit extra natural labels are possible, formal/managed labels are forbidden. It does not write. The user selects this proposal in Logseq's “查看并整理行首格式”, reviews it, and explicitly applies the immutable prefix diff. There is no external apply or approved flag. Query `workspace formatting result <original-requestId>` or `recover` after local application; namespaces are chosen by the trusted connection. Conflicts, partial success and unknown attribution remain truthful Journal facts. Keep existing wording, properties, identity, structure, status, code, quotes and inline literals.

Natural body/file/TODO permissions remain independent. New semantic line starts use `**[目标]**`, `**[想法]**`, `**[注]**`, `**[记录]**`; ordinary TODO/DONE are plain. Record meaningful changes at the existing topic/task, keep uncertainty, and place detailed outputs in actual materials. Formal operations use the separate governed interface below.

A page connection returns the real `{kind:"page", pageName, graphId, rootUuid}` scope, a page descriptor and only real native blocks. `rootUuid` is the page identity, never a writable block target. `content read`, source refresh, reading plans, guidance, scenes and materials are available; directory file writing requires the independent local file grant. Body/TODO/formatting/focus/stage calls require a separately selected and connected real block scope. Empty pages remain readable without an invented root. Page/block switches revoke the old connection; reconnecting begins read-only. Do not infer a body grant from a file grant or manufacture a block scope from the page UUID.

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
