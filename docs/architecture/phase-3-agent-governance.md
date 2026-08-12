# Phase 3 Agent Governance

Phase 3 adds one deliberately narrow autonomous path. `currentFocus` is a nullable, trimmed, maximum-200-character field on `WorkObject`; `SET_CURRENT_FOCUS` is the only Agent-authorized semantic operation and always changes that one field atomically.

The trusted chain is:

1. The Plugin identifies one existing WorkObject and one explicitly selected Logseq block.
2. The Plugin asks the Graph Adapter for one fresh block read. The Adapter binds Graph identity, block UUID, canonical content, and lightweight source hash to a separate local snapshot capability. The Kernel verifies that proof and target Graph identity, freezes the block as `LOGSEQ_BLOCK` Evidence, and computes its SHA-256. A bearer-token caller or Agent cannot assert the locator, content, or either digest.
3. The configured Agent reads only the target, frozen Evidence, and the registered `current-focus-maintenance/0.1.0` Skill.
4. The Kernel atomically persists an `AgentRunReceipt` and, for a positive result, one immutable Proposal revision with target version, projection hash, Evidence dependencies, Skill identity, operation-contract version, AgentRun link, and `LOW` risk. Execution failures retain a minimal `FAILED` receipt.
5. The Plugin immediately asks the Kernel to apply the Proposal. There is no approval inbox. The Kernel rechecks operation-contract version, target version, full managed projection hash, another proof-bound fresh Evidence identity/content read, the exact release-approved and registered Skill hash, and absence of pending recovery before writing any Commit row.
6. The Plugin executes the closed Graph effect and returns a fresh snapshot. Only exact verification atomically reaches `COMMITTED`, Proposal `APPLIED`, and `ACCEPTED` feedback. A transient adapter throw remains `KERNEL_APPLIED` and is resumable; a detected conflict is `RECOVERY_REQUIRED`.

The public generic Commit endpoint continues to reject `AGENT` actors. There is no generic Agent allow rule, prompt runtime, arbitrary patch, workflow engine, or Agent-owned storage/Graph adapter. The private governed prepare path is reachable only after a persisted Proposal passes all checks.

`AgentRunReceipt` records purpose, executor type/ID, operation-contract version, Skill identity/hash, subject, target-version and Evidence context snapshot, outcome, Proposal IDs, reason code, short rationale summary, and separate start/finish times. Both thrown execution errors and semantically invalid returned output retain a minimal `FAILED` receipt. It intentionally records no hidden reasoning or chain of thought.

A user may replace an open suggestion with immutable Revision 2 or dismiss it. Revision append and `MODIFIED` feedback share one SQLite transaction. Those paths record `MODIFIED` or `REJECTED`; successful apply and compensation Undo record `ACCEPTED` and `UNDONE_AFTER_APPLY`. Every event carries Proposal revision, Skill, operation, Commit when applicable, and before/after focus values.
