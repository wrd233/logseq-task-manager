# Agent Autonomy Boundary

Allowed without a second approval prompt:

- Produce `NO_PROPOSAL` with a bounded reason.
- Produce one `LOW`-risk Proposal for `SET_CURRENT_FOCUS` on the explicit current WorkObject.
- Produce one `LOW`-risk Proposal for `CHANGE_ENGAGEMENT`, limited to `ACTIONABLE ↔ WAITING`, on the explicit current WorkObject.
- Let the Plugin immediately apply either governed Proposal through the Kernel's operation-specific policy.

Never allowed:

- Direct SQLite, Ledger, Logseq, filesystem, session-state, or workflow writes.
- Generic field patches or caller-selected tables.
- Rename, completion, cancellation, PARKED transitions, ownership, lifecycle, or scope changes.
- Fuzzy target selection, naked IDs, stale Evidence, stale projection, stale target version, unregistered Skill content, or writes while recovery is pending.

Engagement reconciliation additionally requires a direct external prerequisite or explicit evidence that the current Waiting condition is satisfied. Plans, ambiguity, user-side prerequisites, unresolved waiting, and parking language produce `NO_PROPOSAL`; malformed/PARKED output is a durable FAILED run.

The deterministic Fake Agents are the only executors in this phase. They make the two vertical slices repeatable and are identified as Fake in receipts and documentation. External models, prompt runtimes, proposal ranking, broad skills, generic Agent preparation, and direct writes remain outside Phase 4.
