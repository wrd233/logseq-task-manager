# P2-E Project Closure — real Provider and Desktop main-chain gate

## Status

`MAIN_CHAIN_DESKTOP_DONE / FAILURE_RECOVERY_DESKTOP_OPEN / P2E_PARTIAL`

This record closes the normal Project Closure vertical chain. It does not claim that the complete
P2-E slice or the overall Task Copilot V2 UX productization Goal is complete.

## Current environment

- Branch: `feature/task-copilot-mvp`
- Forward UI build: `1ec63ac` (`feat: add Project Closure draft UI`)
- Current Undo/reload build: `06907f34b8d2dea0a88913544b7845e8f0338897`
- Current Plugin build time: `2026-07-26T10:37:02+08:00`
- Logseq Desktop: `0.10.15`
- Graph: dedicated synthetic test Graph `logseq`
- Theme / window: Dark, `994×700`
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

## Interaction assessment

- The user stays inside the Project work surface from evidence review through Provider, Review,
  Commit, Undo and re-entry.
- Deterministic evidence remains the baseline; the model only organizes user-confirmed judgments.
- The main decision is singular at each stage, and formal effects remain behind HIGH Review and
  final confirmation.
- The completed Review card remains information-dense because the whole Proposal history is
  visible. The dedicated Undo text now removes the previous contradiction about reversibility.
- The visible loading and successful path establish value, but a current Desktop run of Provider
  error/stale and an injected Commit failure into `RECOVERY_REQUIRED → resume` is still required
  before P2-E can be marked fully DONE.

## Automated evidence

The implementation commit `06907f3` passed:

- Domain `44/44`
- Local Service `144/144`
- Plugin `279/279`
- root `./scripts/check.sh`
- rule coverage `145`
- recovery rehearsal `PASS`

Automated tests cover stale version/checksum, invalid forward receipt, idempotent replay, no-later-
mutation protection, and exact forward/inverse Commit status transitions. These tests do not
replace the remaining current Desktop failure/recovery gate.
