# Closure Record Contract

Status: Accepted

Closure facts are normalized records, not fields embedded in WorkObject and not aliases for Commit JSON.

| Record | Required facts | Meaning |
| --- | --- | --- |
| CompletionRecord | id, Task id, completedAt, outcomeSummary, Evidence ids, USER creator | User judged the Task completed |
| CancellationRecord | id, Task id, cancelledAt, reason, optional replacement/remnant, Evidence ids, USER creator | User judged the Task cancelled |
| ClosureAmendment | id, target Closure id, reason, optional replacement summary/reason, additive Evidence ids, USER creator | Later clarification without overwriting the original |
| ReopenRecord | id, previous Closure type/id, reason, reopenedAt, USER creator | New decision to return a closed Task to open work |

Every table is insert-only through its Store method; a duplicate ID is rejected as `CLOSURE_RECORD_IMMUTABLE`. Records become visible in formal Closure history only when their owning Commit is `COMMITTED`. Compensated Closure and Amendment commits remain in history but do not contribute to the current effective Closure.

The current effective Closure is derived from the current terminal WorkObject, its most recent uncompensated committed Completion/Cancellation record, and uncompensated committed amendments for that record. Amendments are reduced in order; the latest replacement summary/reason wins and Evidence IDs are unioned. Reopen or compensation makes current Closure null without deleting history.

The Commit Ledger answers how a cross-medium mutation progressed, failed, recovered, or was compensated. Closure records answer what the user decided. This separation keeps both audit stories explicit.
