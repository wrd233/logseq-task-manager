# P2-E Project Closure — real Provider and Desktop main-chain gate

## Status

`MAIN_CHAIN_DESKTOP_DONE / COMMIT_INTERRUPTION_RESUME_DESKTOP_DONE / PROVIDER_FAILURE_DESKTOP_OPEN / P2E_PARTIAL`

This record closes the normal Project Closure vertical chain and one representative
post-domain Commit interruption → same-Commit resume → reload → Undo chain. It does not claim
that the complete P2-E slice or the overall Task Copilot V2 UX productization Goal is complete.

## Current environment

- Branch: `feature/task-copilot-mvp`
- Forward UI build: `1ec63ac` (`feat: add Project Closure draft UI`)
- Current Undo/reload build: `06907f34b8d2dea0a88913544b7845e8f0338897`
- Current failure/resume UI build: `6f7f9a857be9` (`docs: close p0 launcher graph switch gate`)
- Current Plugin build time: `2026-07-27T00:14:13+08:00`
- Logseq Desktop: `0.10.15`
- Graph: dedicated synthetic test Graph `logseq`
- Theme / window: Dark, about `1001×720`
- Service ownership: installed Launcher + LaunchAgent-owned Local Service
- Provider: configured `deepseek-v4-flash` through the existing Keychain reference
- Privacy: no API key, descriptor token, raw Prompt, raw model response or personal Graph content
  is stored in this report or its screenshots.

## Real operation chain

1. Opened the formal Project and entered `Project → 调整 Project → 整理 Closure 证据`.
2. Reviewed the deterministic evidence baseline and filled the session-only user judgments. The
   UI collected one actual result, per-Objective disposition, legacy handling, key Decision and
   future re-entry summary; it did not expose machine IDs.
3. Started the real Provider request. The existing deterministic evidence stayed visible while
   loading.
4. The real DeepSeek result passed the production grounding and UX validators and entered one
   `HIGH` Proposal with exactly `UPDATE_PROJECT_INTERFACE + TRANSITION_LIFECYCLE(COMPLETED)`.
5. Review acceptance still performed no formal write. Final confirmation created one Semantic
   Commit and changed the Project to `COMPLETED`; the Logseq Page/body was unchanged.
6. The first completed-state Desktop run exposed a product defect: Review said the Closure was
   complete but provided no dedicated Undo. Screenshot `p2-e-09` preserves this real failure and
   is `SUPERSEDED`, not current evidence.
7. Added a dedicated version/checksum-bound Closure inverse transaction. The latest build showed
   one `撤销 Project Closure` action and explained that it restores `OPEN`, removes only this
   Closure and does not modify the Logseq Page.
8. After explicit confirmation, the inverse Commit completed, the result card said `已撤销`, and
   routing returned directly to the Project re-entry workspace.
9. Reloaded Task Copilot from Logseq Plugin Manager. Runtime/Store returned `READY`, and the same
   Project was again visible in `现在` as active work.

## Representative Commit interruption and recovery chain

1. Started from the same active Project and produced a new real DeepSeek Closure Proposal. It
   passed the production grounding and UX validators in one attempt with no retry.
2. Accepted the single HIGH group without applying it. The Project remained `OPEN v19`; the
   Proposal was `ACCEPTED`, and no SemanticCommit existed yet.
3. In the dedicated synthetic test database only, installed a one-shot SQLite trigger scoped to
   the exact future SemanticCommit and exact `PREPARED → APPLIED` step transition. This forced the
   Local Service request to return HTTP 500 after the receipt-backed Domain command had completed.
4. The Desktop showed one user conclusion: the modification had not finished, completed steps
   were saved in the original Commit, and the user must not submit a duplicate modification.
5. Removed the test trigger immediately. Read-only SQLite evidence showed Project
   `COMPLETED v20`, Proposal `ACCEPTED`, the same Commit `PENDING`, step 0
   `DOMAIN_WRITE/PREPARED`, and the original command receipt present.
6. Reloaded Task Copilot. It routed to `最近修改与恢复`, showed the same unfinished change, and
   offered only `查看`; no parallel recovery page or new Commit was created.
7. Opened the original Review and confirmed completion again. Receipt replay did not increment
   the Project version; the same Commit became `COMPLETED`, its step became `VERIFIED`, and the
   Proposal became `APPLIED`.
8. Reloaded again. Recent changes showed the completed Closure and its dedicated Undo.
9. Executed `撤销 Project Closure`. The original Commit became `UNDONE`, the existing
   `project-closure-undo:*` inverse Commit became `COMPLETED`, and the Project returned to
   `OPEN v21` with no Closure.
10. Reloaded once more. `现在` again showed the same Project as active work; no
    `PENDING`, `RECOVERY_REQUIRED`, `FAILED`, or test trigger remained.

This Gate intentionally proves the product's existing rule: when a receipt makes safe replay
possible, an interrupted request remains “尚未完成，可以继续” on the original `PENDING` Commit.
It must not be promoted to `RECOVERY_REQUIRED` merely to create a second recovery workflow.

## Formal state readback

Service CLI readback after Undo:

- Object: `PROJECT`
- Lifecycle: `OPEN`
- Version: `13`
- Closure present: `false`
- The original Project interface keys remain present.

Read-only SQLite audit check:

- forward Closure Commit: `UNDONE`
- dedicated `project-closure-undo:*` inverse Commit: `COMPLETED`
- `PENDING`: `0`
- `RECOVERY_REQUIRED`: `0`
- `FAILED`: `0`

The direct SQLite query was diagnostic evidence only; product writes still flowed exclusively
through Plugin → Local Service → Application Command → SemanticCommit.

## Screenshots and authority

Historical real forward-chain evidence on `1ec63ac`:

- `p2-e-05-closure-user-confirmation-dark-994x701.jpg`
- `p2-e-06-closure-user-judgments-filled-dark-994x701.jpg`
- `p2-e-07-closure-real-provider-loading-dark-994x701.jpg`
- `p2-e-08-closure-real-provider-high-review-dark-994x701.jpg`
- `p2-e-09-closure-commit-completed-no-undo-dark-994x701.jpg` (`SUPERSEDED` defect)

Current evidence on `06907f3`:

- `p2-e-10-closure-undo-available-dark-994x701.jpg`
- `p2-e-11-closure-undo-completed-dark-994x701.jpg`
- `p2-e-12-closure-undo-reload-active-project-dark-994x701.jpg`

Current interruption/resume evidence on exact UI build `6f7f9a857be9`:

- `p2-e-13-closure-commit-interrupted-current-dark.jpeg`
- `p2-e-14-closure-pending-after-reload-current-dark.jpeg`
- `p2-e-15-closure-resumed-completed-current-dark.jpeg`
- `p2-e-16-closure-completed-after-reload-current-dark.jpeg`
- `p2-e-17-closure-undo-restored-project-current-dark.jpeg`
- `p2-e-18-closure-undo-after-reload-current-dark.jpeg`

The final readback for this recovered Commit is Project `OPEN v21`, Closure absent, forward
Commit `UNDONE`, inverse Commit `COMPLETED`, and abnormal Commit counts `0/0/0`.

## Interaction assessment

- The user stays inside the Project work surface from evidence review through Provider, Review,
  Commit, Undo and re-entry.
- Deterministic evidence remains the baseline; the model only organizes user-confirmed judgments.
- The main decision is singular at each stage, and formal effects remain behind HIGH Review and
  final confirmation.
- The completed Review card remains information-dense because the whole Proposal history is
  visible. The dedicated Undo text now removes the previous contradiction about reversibility.
- The injected interruption confirms that ordinary resumable uncertainty stays on the original
  Commit and returns the user to the existing business surface instead of creating a recovery
  product per Slice.
- Current Desktop Provider error and generation stale remain open. Those gates must preserve the
  deterministic Closure evidence and user judgments with zero formal write before P2-E can be
  marked fully DONE.

## Automated evidence

The implementation commit `06907f3` passed:

- Domain `44/44`
- Local Service `144/144`
- Plugin `279/279`
- root `./scripts/check.sh`
- rule coverage `145`
- recovery rehearsal `PASS`

Automated tests cover stale version/checksum, invalid forward receipt, idempotent replay,
post-domain receipt recovery, no-later-mutation protection, and exact forward/inverse Commit
status transitions. These tests do not replace the remaining current Desktop Provider
error/stale gates.

After the current Desktop Gate, the focused Node 20 test
`Project Closure resumes from its receipt after interruption before Commit step finalization`
passed `1/1`, and the root `./scripts/check.sh` passed typecheck, lint, all workspace tests,
all builds, Plugin/package/boundary/rule checks, recovery rehearsal and outer repository
boundary verification. The first ad-hoc focused invocation used the ambient Node 25 ABI and
could not load the Node-20-built `better-sqlite3`; rerunning with the repository's fixed Node
20.20.2 passed and is the authoritative result.
