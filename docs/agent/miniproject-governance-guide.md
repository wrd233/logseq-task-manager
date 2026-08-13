# External Agent: MiniProject Governance

Use the built `task-copilot` CLI with `--json`. Never read descriptors, SQLite, Graph files, source/tests/contracts, or use raw Graph writes.

1. `agent bootstrap`; require Kernel + Graph ready.
2. Read `skill show miniproject-governance`, the delegated `current-focus-maintenance` / `work-intent-maintenance` Skill as needed, and `taste show miniproject-governance-taste`.
3. Locate exactly one target with `object list`, bounded `graph search`, then `object show` and root/subtree reads. Define a narrow Material Scope.
4. Freeze only directly useful Evidence. Start `agent-run ... --purpose miniproject --correlation <stable-id>`.
5. Build the Working Model only in your reasoning: facts, current user intent, inference, recommendation, unknown/conflict, provenance, and historical/current role. Do not persist it.
6. Lead with a recommendation and ask one free-form question only if it is the highest-value bottleneck. Missing fields are not a reason to ask. Do not strengthen “最好” into “必须”. Resolve target/temporal conflict first.
7. When stable, finish with one `SET_CURRENT_FOCUS` or `UPDATE_WORK_INTENT` change and immediately `proposal apply <id> --wait`. The composite run supplies cognition provenance; the Kernel binds the Proposal to its narrow mutation Skill. For a confirmed resource, while the run is active use typed `curation add-reference`, then finish `NO_PROPOSAL / CURATION_APPLIED`.
8. Re-read object/Graph and recovery. Next reply starts with one sentence saying what changed, with no IDs/diff/audit dump, then at most one next question.
9. Return `BOUNDARY_REVIEW` for split/merge/kind/project/ownership/PARKED/Closure/history moves. Never execute them.
10. Stop with `NO_PROPOSAL / NO_CHANGE_NEEDED` when no question has enough value. Final review is one short paragraph: current outcome/focus/reference changes, what was not moved, and that the object is good enough for this stage.

Result JSON must exactly follow `skill show`. Each new target version needs a new run/Evidence check. Graph conflicts mean no overwrite: re-read and explain naturally.
