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

Each Ledger row records actor, operation, target, preconditions, before/after, inverse, Graph effect/result, failure reason, timestamps, and compensation links. Rows are never deleted. Current-state mutations and their stage transition share one SQLite transaction.

Undo is not a rewind. It inserts a new `UNDO_COMMIT`, validates the current managed projection hash, applies the inverse current-state change, removes only the owned projection, verifies absence, commits the compensation, and links the original row through `compensated_by`. Natural source content is outside the managed container and is never removed.

Recovery actions are computed from durable state:

- `PREPARED` -> `ABORT_PREPARED`
- `KERNEL_APPLIED` -> `RESUME_GRAPH_APPLY`
- `GRAPH_APPLIED` -> `VERIFY_GRAPH`
- `RECOVERY_REQUIRED` -> `MANUAL_RECONCILIATION`
