# Commit State Machine

## Current formal path

Following [ADR 014](../adr/014-formal-commit-projection-obligation.md), `Kernel.commitFormal()` commits SQLite Current State and the Ledger atomically and persists a `ProjectionObligation` in that transaction. `COMMITTED` means Formal Truth is established even while Graph is offline.

```text
VALIDATE -> PREPARE -> KERNEL APPLY -> FORMAL COMMIT
                                      -> durable ProjectionObligation
                                      -> asynchronous GRAPH APPLY -> VERIFY -> VERIFIED
```

An obligation is `PENDING`, `FAILED` or `VERIFIED`; retry/backoff and restart recovery do not roll back the formal commit. A fresh projection/hash mismatch rejects application rather than overwriting user edits. Operations such as ownership that have no Graph effect do not need an obligation. The portable projection constructor is `buildManagedProjection()` in `packages/contracts`; Kernel and Plugin share it, including omission of absent closure. Closure reads remain at the caller.

## Supported legacy path

`prepare() -> complete()` remains in Plugin Agent proposal, closure and compensation Undo flows and in recovery of persisted intermediate stages. It shares Kernel `#prepare` with the formal path; these callers and durable states must be migrated before removal. [ADR 003](../adr/003-cross-medium-commit.md) describes this path, not every current formal commit.

```text
VALIDATE
  -> PREPARED
  -> KERNEL_APPLIED
  -> GRAPH_APPLIED
  -> COMMITTED
```

Terminal and recovery branches:

```text
PREPARED ---------> ABORTED                 (no current-state write)
KERNEL_APPLIED ---> RESUME_GRAPH_APPLY      (effect is durable and idempotent)
GRAPH_APPLIED ----> VERIFY_GRAPH            (result is durable; fresh read required)
any mismatch -----> RECOVERY_REQUIRED       (never overwrite Graph)
```

Each Ledger row records actor, operation, target, preconditions, before/after, inverse, Graph effect/result, failure reason, timestamps, compensation links, and optional Proposal/AgentRun/Skill governance. Rows are never deleted. Current-state mutations and their stage transition share one SQLite transaction.

Undo is not a rewind. It inserts a new `UNDO_COMMIT`, validates that the target commit is still the latest semantic change and rechecks the current managed projection hash. Create compensation removes only the owned projection and current-state row; Rename and Current Focus compensation restore the previous field value with a new monotonic version. Both verify the resulting Graph state, commit the compensation, and link the original row through `compensated_by`. Undo of an Agent-applied focus also emits `UNDONE_AFTER_APPLY`. Natural source content is outside the managed container and is never removed.

Each Graph effect has a deterministic `effectId` scoped to its `commitId`. Apply results must return both identities, and Update effects contain expected and resulting projection hashes to close the prepare/apply race.

Recovery actions are computed from durable state:

- `PREPARED` -> `ABORT_PREPARED`
- `KERNEL_APPLIED` -> `RESUME_GRAPH_APPLY`
- `GRAPH_APPLIED` -> `VERIFY_GRAPH`
- `RECOVERY_REQUIRED` -> `MANUAL_RECONCILIATION`
