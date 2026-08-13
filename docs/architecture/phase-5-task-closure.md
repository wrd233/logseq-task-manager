# Phase 5 User-only Task Closure

Status: Implemented and fully proved on real Logseq Desktop

Phase 5 adds four closed semantic operations and no generic lifecycle setter:

- `COMPLETE_WORK_OBJECT`: `OPEN → COMPLETED` plus one immutable CompletionRecord.
- `CANCEL_WORK_OBJECT`: `OPEN → CANCELLED` plus one immutable CancellationRecord and required reason.
- `REOPEN_WORK_OBJECT`: terminal → `OPEN + ACTIONABLE` plus one immutable ReopenRecord and required reason.
- `AMEND_CLOSURE`: append an amendment to the current Closure; lifecycle does not change.

Only the configured `USER/local-user` may prepare any of them. Generic Agent preparation still fails authorization and the governed Proposal dispatcher has no Closure operation. No Closure action creates AgentRun, Proposal, or FeedbackEvent.

## Transaction boundary

The Kernel remains the single formal writer. A user command is parsed, authorized, checked against WorkObject version and managed projection hash, and recorded as a durable Commit. In one SQLite transaction the Kernel writes the next current state, the immutable Closure record, and `KERNEL_APPLIED`. The Plugin then applies one `CHANGE_CLOSURE_FIELDS` effect that converges the source marker where applicable, lifecycle/engagement, Waiting removal, focus removal, and the Writing Language v1 presentation. A matching Graph result and fresh snapshot are required before `COMMITTED`.

`KERNEL_APPLIED` is pending recovery, never success. Marker or projection races fail closed. Replay recognizes before, safe partial, and final states so response loss can resume without duplicating records.

Logseq Desktop can acknowledge `updateBlock` before the changed block is visible through a fresh DB read. Post-write verification therefore retries for at most 500 ms only while it still sees the exact expected pre-write projection hash. A different hash is a concurrent edit and fails immediately; the settle loop never overwrites Graph content. Online marker listeners are also unregistered in `beforeunload`, and duplicate DONE notifications are suppressed while one completion transaction is in flight.

## State rules

Completion and cancellation accept only `TASK + OPEN`. Both clear the open-only `engagement`, `waitingCondition`, and `currentFocus` fields. Completed and cancelled Tasks therefore leave the actionable query. Reopen accepts only a currently completed/cancelled Task and returns it to `OPEN + ACTIONABLE`; its former Closure remains historical.

The Phase 5 task-only guard exists in Domain and Kernel behavior. Project and MiniProject settlement needs child-disposition and KR rules that this slice deliberately does not guess.

## Undo and Reopen

Undo is compensation for a particular recent Commit. It requires that no later semantic write changed the target, restores the exact captured before-state (including a prior WaitingCondition and focus), and marks the original Commit compensated. The original Closure record is retained but no longer current.

Reopen is a new user decision. It requires a reason, creates a ReopenRecord, and advances state/history. It is not a history rewind and does not compensate the old Commit.

## Graph policy

Completion maps `TODO` to `DONE`; an already-observed online `DONE` is accepted as the command source. Reopen maps `DONE` back to `TODO`. Markerless Tasks remain markerless. Cancellation does not invent a host cancellation marker: it preserves the natural source marker/text and renders only a sparse `**[取消]**` reason child. Full Closure detail stays in SQLite and the API/CLI. A completed outcome equal to the Task title is omitted because `DONE + title` is sufficient; only an informative different outcome renders `**[完成]**`.
