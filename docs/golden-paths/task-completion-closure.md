# Task Completion and Closure Golden Paths

## Explicit completion

1. User runs `Task Copilot vNext：完成当前 Task` on the current formal open Task.
2. Plugin supplies the Task title as the minimal outcome summary; no form or Evidence is required.
3. Kernel authorizes USER, validates version/projection/recovery, creates CompletionRecord, advances current state, and returns a pending Graph effect.
4. Graph Adapter changes `TODO → DONE`, projects `COMPLETED` and `完成：…`, and removes Waiting/focus fields.
5. Fresh readback matches marker and projection; only then is the Commit `COMMITTED` and a success receipt shown.

`Cmd+Shift+U` prepares a compensation Commit. If no later write occurred it restores the exact open state and `DONE → TODO`, while the old CompletionRecord remains durable and non-current.

## Online marker completion

An online user edit `TODO → DONE` is coalesced by block UUID and enters the same operation at step 3. The already-DONE marker is a legitimate observed command state, not permission to skip Kernel authorization or verification.

## WAITING completion

A WAITING Task with a current focus can be completed directly. Terminal state clears both fields and leaves the actionable query. Undo restores the original `WAITING`, the exact WaitingCondition including its original `since`/Evidence, and the exact current focus; it does not regenerate them.

## Cancel, amend, reopen

- Cancel prompts for a non-empty reason, stores an immutable CancellationRecord, clears open-only fields, and shows a managed cancellation summary without inventing a marker.
- Amend prompts for a reason and replacement summary/reason, appends ClosureAmendment, keeps the original record and lifecycle, and changes only effective Closure.
- Reopen prompts for a reason, appends ReopenRecord, preserves Closure history, returns the Task to `OPEN + ACTIONABLE`, and converts `DONE → TODO` when appropriate.

The API endpoint `GET /v1/objects/:id/closure` and CLI `closure show <id> [--json]` expose current and historical Closure facts.

## Real Logseq Desktop evidence — 2026-08-13

Logseq Desktop 0.10.15 loaded the rebuilt vNext plugin against the ignored isolated Graph `e2e-runtime/logseq-graph` and fresh Kernel state `e2e-runtime/kernel-phase5`.

- A real formal Task was explicitly completed: its natural marker became `DONE`, the managed state visibly became `COMPLETED · null`, and `完成：…` appeared. CLI read the committed immutable CompletionRecord.
- `Cmd+Shift+U` created the compensation Commit and visibly restored `TODO` plus `OPEN · ACTIONABLE`; CLI confirmed version advancement and current Closure became null while history retained one CompletionRecord.
- The first formalization attempt exposed a real host race: Logseq added its identity property between snapshot and prepare. Kernel failed closed with `SOURCE_CONTENT_HASH_MISMATCH` and left a recovery-visible row rather than claiming success. A fresh invocation succeeded. This failure evidence is retained in the isolated database.
- Desktop also exposed that the plugin formerly copied the natural `TODO` label into the formal title. The final plugin strips workflow markers before `CREATE_WORK_OBJECT`; an automated regression covers the marker-free title.

Cancellation, reopen, WAITING completion/Undo, and online marker command are fully covered through the real adapter plus cross-medium integration suite. Their final independent Desktop interaction pass remains a release-gate item; no visual acceptance is claimed from automated tests.
