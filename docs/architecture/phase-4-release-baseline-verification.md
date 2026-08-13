# Phase 4 Release Baseline Verification

Verified on 2026-08-13 before beginning Phase 5.

## Git and runtime baseline

- Branch: `vnext`.
- Local HEAD: `20bde5c56e0bc7c45a682aee5ad1fa53ce05de8a`.
- `origin/vnext`: `20bde5c56e0bc7c45a682aee5ad1fa53ce05de8a` after a fresh fetch.
- Worktree: clean.
- Runtime: Node 20.20.2.
- Full gate: `npm run check` passes typecheck, lint, 65/65 tests, every build, and dependency-boundary verification.

## Phase 4 capability proof

- `packages/domain` owns `currentFocus`, `WaitingCondition`, and the `ACTIONABLE ↔ WAITING` invariants.
- `packages/contracts` exposes only closed `SET_CURRENT_FOCUS` and `CHANGE_ENGAGEMENT` operations for the two Agent-governed slices.
- `packages/kernel` verifies frozen Evidence SHA-256, the Evidence watermark, exact approved Skill identities, target version, managed projection hash, and recovery state before Agent-governed mutation.
- `packages/sqlite` persists AgentRun, Proposal Revision, Feedback, current WorkObject state, and the append-only Commit Ledger.
- `current-focus-maintenance/0.1.0` and `engagement-reconciliation/0.1.1` remain immutable approved Skills.
- Phase 4 integration tests cover both Engagement directions, actionable-query membership, compensation Undo, staleness, Graph failure/race, malformed output, PARKED refusal, and recovery.
- The real Logseq 0.10.15 evidence in `docs/golden-paths/engagement-waiting-reconciliation.md` records visible Waiting projection, prominent notification, exact-condition Undo, immutable Evidence viewing, and an empty Recovery queue.

## Qualification for Phase 5

The Phase 4 code, tests, documents, published Git state, and real Desktop evidence are aligned. Closure, cancellation, reopen, closure amendment, Task marker command ingestion, and Closure records remain absent and are the deliberate Phase 5 scope. The repository is qualified to begin the user-only Task Closure vertical slice.
