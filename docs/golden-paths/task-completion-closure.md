# Task Completion and Closure Golden Paths

## Explicit completion

1. User runs `Task Copilot vNext：完成当前 Task` on the current formal open Task.
2. Plugin supplies the Task title as the minimal outcome summary; no form or Evidence is required.
3. Kernel authorizes USER, validates version/projection/recovery, creates CompletionRecord, advances current state, and returns a pending Graph effect.
4. Graph Adapter changes `TODO → DONE`, removes Waiting/focus fields, and renders a `**[完成]**` child only when the outcome adds information beyond the title.
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

- Before the Phase 5.5 presentation refactor, a real formal Task was explicitly completed: its natural marker became `DONE`, the engineering projection visibly became `COMPLETED · null`, and `完成：…` appeared. CLI read the committed immutable CompletionRecord. This is retained as historical Phase 5 evidence, not the current Writing Language.
- `Cmd+Shift+U` created the compensation Commit and visibly restored `TODO`; the zero-noise default omits `OPEN · ACTIONABLE`. CLI confirmed version advancement and current Closure became null while history retained one CompletionRecord.
- The first formalization attempt exposed a real host race: Logseq added its identity property between snapshot and prepare. Kernel failed closed with `SOURCE_CONTENT_HASH_MISMATCH` and left a recovery-visible row rather than claiming success. A fresh invocation succeeded. This failure evidence is retained in the isolated database.
- Desktop also exposed that the plugin formerly copied the natural `TODO` label into the formal title. The final plugin strips workflow markers before `CREATE_WORK_OBJECT`; an automated regression covers the marker-free title.

## Real user-Graph Desktop closeout — 2026-08-13

The remaining interaction matrix was rerun in Logseq Desktop 0.10.15 against the user's real Graph using synthetic, clearly named acceptance pages. A full APFS-clone backup was created first at `/tmp/task-copilot-vnext-real-graph-backup-20260813-133204`; no existing natural note content was copied into the repository or used as a write target.

- A WAITING Task with a current focus was completed and then undone. The Graph visibly returned to `OPEN · WAITING`, and the exact waiting description, original `since`, Evidence ID, and current focus were restored.
- A separate Task was cancelled with a typed reason and reopened with a second typed reason. The final state was `OPEN · ACTIONABLE`, while the immutable cancellation/reopen history remained in the Kernel.
- The host did not support the earlier `window.prompt` flow. Cancellation/reopen/amendment now use a Plugin Main UI form with bounded, trimmed input; the real Desktop cancellation and reopen pass succeeded through that form.
- A direct checkbox `TODO → DONE` reached the same committed completion transaction and showed the dedicated success receipt. Desktop diagnosis found that `updateBlock` may resolve before an immediate DB read exposes the new state; the Adapter now performs a bounded read-after-write settle only while the exact pre-write hash remains visible. Any other hash still fails closed.

- Plugin reload diagnosis also found that the online marker listener needed explicit lifecycle cleanup. `beforeunload` now unregisters the listener, and a regression covers duplicate DONE events while one completion is in flight.
- The final clean Kernel run reported `没有需要恢复的 Commit。`; the CLI recovery list was empty. Earlier deliberately retained `/tmp` diagnostic databases contain the fail-closed attempts that exposed the host timing issue.

Phase 5.5 reran this path with Writing Language v1 on the protected real Graph. Default completion showed only the native `DONE` marker/title, cancellation showed one sparse bold-label reason, Reopen and every compensation preserved the stable UUID registry, and the final Recovery queue was empty. Presentation changes did not create a business Commit or WorkObject version.

This closes the Phase 5 real Desktop interaction matrix. It is behavioral Desktop evidence, not independent pixel-level visual acceptance.
