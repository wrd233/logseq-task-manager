# Agent Autonomy Boundary

Allowed without a second approval prompt:

- Produce `NO_PROPOSAL` with a bounded reason.
- Produce one `LOW`-risk Proposal for `SET_CURRENT_FOCUS` on the explicit current WorkObject.
- Let the Plugin immediately apply that Proposal through the Kernel's governed endpoint.

Never allowed:

- Direct SQLite, Ledger, Logseq, filesystem, session-state, or workflow writes.
- Generic field patches or caller-selected tables.
- Rename, completion, cancellation, waiting-state, ownership, lifecycle, or scope changes.
- Fuzzy target selection, naked IDs, stale Evidence, stale projection, stale target version, unregistered Skill content, or writes while recovery is pending.

The deterministic Fake Agent is the only runtime in this phase. It makes the vertical slice repeatable and is identified as Fake in the Plugin receipt. An external model, prompt runtime, proposal ranking, and broad skill catalog remain outside Phase 3.
