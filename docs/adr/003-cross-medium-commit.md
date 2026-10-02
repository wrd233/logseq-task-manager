# ADR 003: Explicit cross-medium Commit protocol

Status: Accepted — 2026-08-12; partially superseded by [ADR 014](014-formal-commit-projection-obligation.md) for the current formal path.

Scope note (2026-10-01): the decision below is retained as written. It still describes the supported `prepare -> complete` and persisted intermediate-stage recovery paths. It does not apply to `commitFormal`, where SQLite commits first and Graph converges through a durable projection obligation. See the [current/legacy state-machine guide](../architecture/commit-state-machine.md).

Implementation note (2026-10-02): normal Plugin Task/Online DONE, Focus/Engagement, Undo, external auto-apply and maintenance now use formal receipts and persistent delivery. The protocol below remains for supported old APIs and recovery of actual durable intermediate states; formal preparation may also leave PREPARED after a later failed transaction. Current authority: [API contract](../architecture/kernel-api-contract.md) and [state machine](../architecture/commit-state-machine.md).

SQLite and Logseq cannot share one database transaction. Every formal change therefore follows validate, prepare, Kernel apply, Graph apply, verify, commit. `KERNEL_APPLIED` is pending, not success. Durable intermediate stages and deterministic Graph effects make restart recovery explicit.
