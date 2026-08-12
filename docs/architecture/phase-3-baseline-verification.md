# Phase 3 Baseline Verification

Verified on 2026-08-13 before beginning Phase 4.

## Current state

- Branch: `vnext`
- HEAD: `0f759a53adc662fa42585133bb75fcc3d83c10e2`
- Remote parity at verification: `origin/vnext` resolves to the same OID.
- Worktree: clean.
- Runtime: Node 20.20.2.
- Full gate: `npm run check` passes typecheck, lint, 43 tests, all builds, and dependency-boundary verification.

## Phase 3 implementation evidence

- `packages/domain`: nullable, trimmed, max-200 `currentFocus` with monotonic WorkObject versions.
- `packages/contracts`: closed `SET_CURRENT_FOCUS`, strong Evidence identity, Graph Adapter proof, AgentRun, Proposal Revision, and Feedback contracts.
- `packages/kernel`: trusted Evidence freeze, exact approved Skill enforcement, Proposal validation, narrow LOW Agent autonomy, Semantic Commit, staleness, Recovery, and compensation Undo.
- `packages/sqlite`: schema v2 current state, frozen Evidence, Skill registry, complete AgentRun receipts, Proposal revisions, Feedback, and append-only Commit governance links.
- `packages/agent` and `skills/current-focus-maintenance/0.1.0`: versioned deterministic Fake Agent execution and semantic eval cases.
- `apps/logseq-plugin`: explicit target plus selected Evidence command, proof-bound Graph reads, deterministic managed focus field, receipt, and Undo.
- `packages/test-support/tests/phase3-current-focus.test.ts`: positive auto-apply, `NO_PROPOSAL`, proof rejection, wrong Skill, invalid output, contract-version mismatch, stale target/Evidence, Graph failure/race, and later-edit-safe Undo.

The real Desktop evidence in `docs/golden-paths/current-focus-agent-golden-path.md` records an isolated Logseq 0.10.15 Fake Agent run through Evidence, AgentRun, Proposal, Commit, visible field, compensation Undo, Feedback, and an empty Recovery queue.

## Deferred boundary at entry to Phase 4

Phase 3 correctly leaves Engagement reconciliation, WaitingCondition, PARKED governance, Completion, Cancellation, External Agent/MCP, broad context, schedulers, full Now, review inboxes, and generic mutation deferred. No Phase 3 documentation/code drift was found.

## Qualification

Phase 3 code, tests, documentation, runtime evidence, and published Git state are aligned at one HEAD. The repository is qualified to begin the narrow Phase 4 `ACTIONABLE ↔ WAITING` vertical slice.
