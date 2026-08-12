# Commit State Machine

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
