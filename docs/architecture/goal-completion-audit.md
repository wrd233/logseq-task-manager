# vNext Goal Completion Audit

Audited: 2026-08-13

Branch: `vnext`

V1 baseline: `v1-final^{}` = `8c01eef5fc6c31d345c44bb3a1411c200109411e`

This matrix checks the implementation against the complete Codex Goal rather than treating a green test command as sufficient proof. `PROVED` means current repository or runtime evidence directly covers the requirement. `PENDING` means the requested end state is not yet true.

| Goal requirement | Authoritative evidence | Status |
| --- | --- | --- |
| Read and freeze the supplied vNext design | Exact imported documents under `docs/vnext/`; first vNext commit `a30d517` | PROVED |
| Investigate before structural deletion | `implementation-reconnaissance.md` records build, Domain, Graph, Service/IPC, and DELETE/REWRITE/POSSIBLE TRANSPLANT classifications | PROVED |
| Preserve one V1 Git freeze point | Local annotated tag `v1-final` resolves to baseline commit `8c01eef`; no history rewrite | PROVED locally |
| Develop destructively on `vnext` in a separate worktree | Branch `vnext`; worktree `/Users/wangrundong/work/logseq-task-manager-vnext`; original V1 checkout retained | PROVED locally |
| Do not retain long-lived old/new runtime tracks | `7221332` removes V1 runtime; tracked-tree search finds no `legacy/`, `old-v1/`, or equivalent archive | PROVED |
| Delete obsolete V1 concepts and runtime | `repository-cleanup-record.md`; deletion commit `7221332` | PROVED |
| Preserve user-owned original checkout and nested Graph | Original checkout remains separate; vNext changes and commits contain no nested `logseq/` Graph path | PROVED |
| Enforce dependency boundaries | `target-package-map.md`; `npm run check:boundaries`; independent standards re-review PASS | PROVED |
| Minimal unified WorkObject model | `packages/domain`; Domain tests cover kind, lifecycle, engagement, ID/Anchor separation, and versioned rename | PROVED |
| PrimaryAnchor, EvidenceReference, PrimaryOwnership | Domain contracts plus SQLite tables; Ownership tests cover endpoint existence, one owner, permitted shallow kinds, cycles, and depth | PROVED |
| Strongly typed CREATE, RENAME, SET_CURRENT_FOCUS, and CHANGE_ENGAGEMENT only | Closed parser in `packages/contracts`; unknown fields/generic writes/PARKED Agent output fail; contract tests | PROVED |
| New SQLite Current State without V1 migration | Schema v3 adds current WaitingCondition and deterministically backfills vNext focus/Waiting projection UUIDs; store migration test | PROVED |
| Structured append-only Commit Ledger | Commit schema and typed `StoredCommit`; stage/inverse/effect/result/failure/compensation tests | PROVED |
| All required Commit states | Kernel and SQLite cover `PREPARED`, `KERNEL_APPLIED`, `GRAPH_APPLIED`, `COMMITTED`, `RECOVERY_REQUIRED`, and `ABORTED` | PROVED |
| Loopback-only authenticated Local Kernel Service | Ephemeral `127.0.0.1`, random token, atomic mode-`0600` descriptor; service test | PROVED |
| Separate network authentication and domain authorization | Bearer authentication at Service; configured local USER authorization at Kernel; SYSTEM/AGENT/wrong-user tests | PROVED |
| CLI is an API-only reference client | Required five commands and `--json`; no SQLite dependency/import; CLI tests | PROVED |
| Kernel-independent Graph Adapter contract | Contract exposes snapshot/effect/result; Kernel imports no Logseq SDK; Fake and real adapters | PROVED |
| Effects are identifiable and update-safe | Deterministic `commitId`/`effectId`; expected/resulting projection hashes; Kernel verifies result identity; race test | PROVED |
| Deterministic managed projection | Stable container/title/state UUIDs, field update, fresh readback, and exact ownership hash | PROVED |
| Preserve natural source content | Fake integration and real Desktop create/Undo leave natural block unchanged | PROVED |
| Cross-medium success only after verify | `KERNEL_APPLIED` returns pending HTTP 202; only fresh matching Graph snapshot reaches `COMMITTED` | PROVED |
| Failure A: Graph Adapter throws | Integration leaves `KERNEL_APPLIED`; restart reports `RESUME_GRAPH_APPLY` | PROVED |
| Failure B: expected hash mismatch | Kernel records `RECOVERY_REQUIRED` and performs no current-state write | PROVED |
| Failure C: Undo after user edit | Compensation aborts and preserves current state/projection | PROVED |
| Failure D: crash at three stages | Tests cover PREPARED, KERNEL_APPLIED, and GRAPH_APPLIED restart actions | PROVED |
| Undo is a compensation Commit | Create and Rename compensation retain original Ledger rows and link `compensationFor`/`compensatedBy` | PROVED |
| Keep Agent scope narrow | One deterministic Agent/Skill slice exists; no MCP, generic repository hierarchy, workflow DSL, provider platform, or arbitrary mutation API | PROVED |
| Required architecture/ADR/golden-path documentation | All seven requested documents plus six narrow ADRs exist and match implemented behavior | PROVED |
| Full automated verification | Node 20.20.2 `npm run check`: typecheck, lint, 65/65 tests, all builds including local SDK packaging, and dependency boundaries; production audit has zero findings | PROVED |
| Real Logseq vertical slice before Goal completion | Isolated Logseq 0.10.15 + deterministic Fake Agent produced Evidence, AgentRun, Proposal, Commit, managed focus, compensation Undo, Feedback, and empty recovery; CLI audited every durable record | PROVED |
| Independent standards and spec review | Initial findings were fixed; final independent standards and strict Goal-spec re-reviews both returned PASS with no blocking finding | PROVED |
| Publish `vnext` to origin | Publication is verified separately at release handoff by exact local/remote `vnext` OID parity | PENDING |
| Phase 3 current-focus domain and Graph field | Nullable/trimmed/max-200 `currentFocus`, monotonic versions, stable focus UUID, field add/update/remove, and source preservation tests | PROVED |
| Strong frozen Evidence | Durable `LOGSEQ_BLOCK` record with canonical frozen content, locator, proof-bound trusted Graph read, Kernel-computed SHA-256, and canonical apply recheck; forged/stale tests prove zero mutation | PROVED |
| Versioned Skill and deterministic Fake Agent | `skills/current-focus-maintenance/0.1.0`; exact release-approved content hash plus registered hash; positive/no-op/ambiguous/scope/waiting eval behavior | PROVED |
| Proposal, AgentRun, Feedback governance records | SQLite schema v3 and HTTP/CLI read APIs; full minimal receipt; Proposal revisions carry contract/target/projection/Evidence/Skill/run/risk links; revision+Feedback is atomic | PROVED |
| Narrow Agent authorization | Generic `AGENT` preparation rejects; governed path requires configured Agent, exact operation, `LOW`, fresh Proposal/Evidence/target/projection/Skill, and no recovery | PROVED |
| Agent auto-apply and compensation | Integration proves Proposal to Commit, Graph verify, `ACCEPTED`, Undo restoration, and `UNDONE_AFTER_APPLY` | PROVED |
| Phase 3 failure gates | Stale target/Evidence invalidation, resumable Graph throw, post-prepare race to `RECOVERY_REQUIRED`, and old Undo after later edit | PROVED |
| Phase 4 Engagement domain | `WaitingCondition`, `ACTIONABLE ↔ WAITING`, current-only schema, monotonic versioning, exact restoration, and actionable SQL query | PROVED |
| Phase 4 Skill and Agent boundary | Immutable `engagement-reconciliation/0.1.1`, exact approved hash, executable Evals, deterministic fixtures, bounded `NO_PROPOSAL`, and durable FAILED malformed/wrong-operation receipts | PROVED |
| Phase 4 governed mutation | Frozen Evidence, Evidence watermark, typed Proposal revision, operation-specific authorization, atomic state/Graph effect, and Feedback | PROVED |
| Phase 4 real Desktop path | Isolated Logseq Desktop visibly entered WAITING, left WAITING, restored the exact condition with `Cmd+Shift+U`, and returned to ACTIONABLE; durable audit found zero Recovery rows | PROVED |
| Phase 4 failure gates | Target/projection/Evidence/watermark staleness, Graph throw/resume, Graph conflict/recovery, wrong Skill, malformed output, and old Undo | PROVED |

## Current conclusion

Phase 3 remains intact and the complete Phase 4 Engagement vertical slice is implemented and verified. Both final independent re-reviews passed; exact remote publication parity is the remaining release check before this audit is closed.
