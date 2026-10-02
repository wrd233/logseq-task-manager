# Commit State Machine

Current semantics (round 04, schema v23). The [API contract](kernel-api-contract.md) owns route and client behavior; this document owns accepted business state and its durable recovery relationship.

## Formal business transaction

Following [ADR 014](../adr/014-formal-commit-projection-obligation.md), validation and durable preparation precede one SQLite transaction on the same connection:

```text
VALIDATE -> PREPARED
                 -> current state + Commit/Ledger COMMITTED
                    + Proposal APPLIED / appliedCommitId / ACCEPTED feedback
                    + applicable compensation link / UNDONE_AFTER_APPLY feedback
                    + durable ProjectionObligation
                 -> return formal receipt
```

Only applicable governance/compensation records are written. USER decisions also finalize their execution and package/candidate audit in the same transaction. A transaction failure rolls these changes back together; a durable PREPARED row may remain for recovery. A repeat accepted operation returns its same receipt and creates no second feedback or compensation. Formal Undo uses the same validated planner as historical Undo, with its own atomic persistence; it never calls legacy prepare then relabels the result as COMMITTED.

`COMMITTED` establishes formal truth before Graph delivery. Closure history, Evidence, Commit, Feedback and obligations survive current-object removal. Schema v23 decouples historical object identifiers from current-object existence while retaining necessary Commit/Proposal/run foreign keys. Current anchors, ownership, coverage and reading baselines remain current-state constraints. Removing a target invalidates active associations and marks open/queued application work stale rather than erasing its audit history.

## Projection convergence

```text
COMMITTED + PENDING obligation
             -> shared Service drain -> Graph apply -> fresh verification -> VERIFIED
             -> genuine failure -> FAILED -> backoff/retry -> VERIFIED
             -> unavailable/paused -> remain pending; later drain / restart
```

The Kernel owns verification and failure accounting. A typed already-recorded verification failure consumes one attempt, not two. VERIFIED is terminal for ordinary duplicate/late reports. One serialized delivery owner serves normal Plugin commands, external auto-apply and maintenance. Within a target, earlier unfinished obligations block later effects, including backoff/exhaustion; unrelated targets may continue. Failed delivery never rolls back formal truth or resets Proposal to OPEN. `APPLIED` is retained in the storage/API enum for compatibility; current delivery writes PENDING/FAILED/VERIFIED.

Projection construction is the portable `buildManagedProjection()` in Contracts. Effects and results match commit/effect IDs; updates validate before/after hash and source topology. CREATE retry accepts only the registered owned, transition-safe partial/exact result with unchanged canonical natural source. REMOVE stores anchor, owned UUIDs and expected hash before current deletion and requires a fresh absence proof for all owned projection UUIDs, including derived review. Natural text and foreign blocks are preserved. Generic empty projection is not a formal removal proof.

UI feedback distinguishes rejected submission, uncertain submission, accepted/pending projection, failed recoverable projection and verified projection. A stale Graph generation can stop UI/SDK work after acceptance but cannot erase the receipt. Original requests survive response loss per Graph and reuse the same operation identity.

## Historical protocol and persisted recovery

[ADR 003](../adr/003-cross-medium-commit.md) is retained for supported old APIs and actual recovery consumers. Normal user and Agent entries use the formal transaction above.

```text
VALIDATE -> PREPARED -> KERNEL_APPLIED -> GRAPH_APPLIED -> COMMITTED
```

| Durable state | Action / meaning |
| --- | --- |
| PREPARED | `ABORT_PREPARED`: no accepted current-state change; formal or old preparation may produce it |
| KERNEL_APPLIED | `RESUME_GRAPH_APPLY`: resume its durable idempotent effect; not business success |
| GRAPH_APPLIED | `VERIFY_GRAPH`: fresh Graph proof/hash before complete |
| RECOVERY_REQUIRED | `MANUAL_RECONCILIATION`: expose the mismatch, never overwrite user changes |
| ABORTED / COMMITTED | Terminal historical Commit |

The Plugin recovery command filters the active Graph, captures its generation, and uses real removal readback after both resume and verify. Public prepare/complete/apply/undo-prepare responses remain supported. Neither a date nor `legacy` naming permits bulk completion, omission of proof/hash or deletion of an unfinished row.

Each retained Commit records actor, operation, target, preconditions, before/after, inverse, effect/result, errors, timestamps, compensation and governance identities. Undo creates a new `UNDO_COMMIT`, rechecks latest semantic ownership/version and fresh managed projection, and restores prior fields with a monotonic version. CREATE compensation deletes legitimate current state and only the owned Graph projection; historical object identity remains queryable. Later semantic writes or natural-source edits reject an unsafe Undo.
