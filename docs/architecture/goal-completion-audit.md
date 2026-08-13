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
| Strongly typed operations only | Closed parser in `packages/contracts`; current operations include CREATE, RENAME, SET_CURRENT_FOCUS, CHANGE_ENGAGEMENT, typed Task Closure, UPDATE_WORK_INTENT, and compensation; unknown fields, generic writes, and unauthorized boundary changes fail | PROVED |
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
| Full automated verification | Node 20.20.2 `npm run check`: typecheck, lint, 127/127 tests, post-build CLI smoke, all builds including local SDK packaging, dependency boundaries, and Taste candidate evaluation | PROVED |
| Real Logseq vertical slice before Goal completion | Isolated Logseq 0.10.15 + deterministic Fake Agent produced Evidence, AgentRun, Proposal, Commit, managed focus, compensation Undo, Feedback, and empty recovery; CLI audited every durable record | PROVED |
| Independent standards and spec review | Initial findings were fixed; final independent standards and strict Goal-spec re-reviews both returned PASS with no blocking finding | PROVED |
| Publish `vnext` to origin | Phase 4 implementation and final trust-gap closure reached `origin/vnext` at `229ace4d3ce272cd10b30673c67bf4120f7085be`; the audit-closure commit is verified by the release handoff's final exact local/remote OID check | PROVED |
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
| Phase 5 closed Task operations | COMPLETE, CANCEL, REOPEN, and AMEND exist as closed contracts; no generic lifecycle setter | PROVED |
| Phase 5 user authority and task-only scope | Kernel tests reject AGENT/SYSTEM for all four operations and reject MiniProject/Project Closure | PROVED |
| Phase 5 immutable Closure history | SQLite schema v4, committed-only effective history, amendment/reopen/compensation semantics, API and CLI query | PROVED |
| Phase 5 Graph and recovery | Marker/projection race, throw, response-loss replay, Logseq property normalization, no half-state COMMITTED | PROVED |
| Online TODO to DONE ingestion | DB.onChanged coalescing, in-flight suppression, unload cleanup, bounded exact-hash read-after-write settle, and same Kernel completion transaction | PROVED automatically and on real Desktop |
| Phase 5 real Desktop explicit completion and Undo | Logseq 0.10.15 visibly completed and restored a real Task; CLI and Graph file confirmed durable state/history | PROVED |
| Phase 5 real Desktop WAITING completion, cancellation, reopen, and direct marker | Real user-Graph synthetic acceptance Tasks visibly proved exact WAITING/focus restoration, typed cancellation and reopen, direct marker completion, and an empty final Recovery queue | PROVED |
| Publish Phase 5 partial checkpoint to origin | Implementation commit `e0c9f14b51005fb6a3ac1ab29195669906403241`; two independent reviews passed; final audit commit and remote parity are verified in the handoff | PROVED |
| Phase 5.5 real-Graph writing study | Protected Graph reconnaissance covered pages, journals, Tasks, nested Tasks, MiniProject/Project shapes, labels, quotes, properties, and density; only aggregate counts, sanitized patterns, and synthetic examples are tracked | PROVED |
| Phase 5.5 stable presentation identity | PrimaryAnchor UUID registry plus persisted native source `id::`; current Reader resolves registered UUIDs and does not use visible labels as field identity | PROVED |
| Phase 5.5 reader/renderer/IO separation | Pure presentation model and renderer, UUID-addressed Reader, bounded legacy ownership reader, and Graph Adapter IO have distinct tested responsibilities | PROVED |
| Phase 5.5 zero-noise and sparse states | Pure and adapter tests plus real Desktop show zero managed children for the ordinary state and only information-bearing focus/wait/review/closure children | PROVED |
| Phase 5.5 presentation-only re-render | Full Desktop reload plus maintenance re-render preserved source file hash, WorkObject version, Commit count, formal state, and Proposal/Agent boundaries; conflicts fail closed | PROVED |
| Phase 5.5 Phase 1/3/4/5 regression | Real Desktop reran Formalize/Undo, Agent focus/Feedback/Undo, bidirectional Engagement/Undo, all Task Closure paths, direct marker ingestion, and empty final Recovery; automated failure suites remain green | PROVED |
| Phase 5.5 restart recovery identity | CREATE compensation recovery verifies every registered projection UUID from the durable effect after Adapter restart, proves bounded absence, and fails closed on missing identity or residual blocks | PROVED |
| Phase 5.5 real visual matrix | Actual host screenshots were inspected for ordinary/focus/wait+review/completed/cancelled/Journal/nested/multi-Task views and a representative existing Project/MiniProject layout; raw screenshots remain local | PROVED by Codex host inspection; independent human review pending |
| Phase 5.5 privacy boundary | Git audit contains no protected Graph path, Graph copy/symlink, real-data fixture, screenshot, raw scan, backup, Kernel state, or local database | PROVED |
| Phase 6 External executor and Skill reuse | `EXTERNAL_CLI` receipts use the same approved current-focus and Engagement Skill identities/hashes; Fake Agents remain green | PROVED automatically |
| Phase 6 Graph Gateway and trusted Evidence | Kernel broker, separate Plugin capability, typed worker, bounded reads, fresh proof-bound freeze, and no raw filesystem/write RPC | PROVED automatically |
| Phase 6 CLI governance surface | Bootstrap, Skills, filtered objects, Graph reads, Evidence freeze, run start/finish/reads, and proposal apply are JSON-first and non-interactive | PROVED automatically |
| Phase 6 authorization | Current focus and bidirectional Waiting commit; PARKED, missing Evidence, generic Agent writes, and Closure remain rejected | PROVED automatically |
| Phase 6 failure and restart gates | Offline, stale Evidence/target, invalid result, apply failure/retry, response redelivery, Kernel restart, and worker reload tests | PROVED automatically |
| Phase 6 fresh Agent usability | A context-free Agent used only the short Guide, direct built CLI, bootstrap, approved Skills, and Kernel result contract; it committed focus and Waiting once each, returned one NO_PROPOSAL, and ended with empty recovery | PROVED on synthetic runtime |
| Phase 6 real Desktop and fresh Agent acceptance | Logseq 0.10.15 real Graph completed current focus, both Waiting directions, and NO_PROPOSAL through the CLI with zero governance UI clicks; a context-free Agent then used only the short Guide and CLI discovery to commit one focus, preserve one background-only item with NO_PROPOSAL, and finish with empty Recovery | PROVED locally |
| Phase 6 privacy and remote publish | No Graph/DB/descriptor/screenshot/backup in Git; the release handoff performs the final exact local/remote OID and clean-worktree check after publishing this audit | PROVED by final release handoff |
| Phase 7 composite/narrow Skill architecture | Read-only `miniproject-governance` supplies cognition provenance; only `current-focus-maintenance`, `work-intent-maintenance`, and typed `ADD_REFERENCE` can mutate | PROVED |
| Phase 7 Formal MiniProject core | Schema v6 adds only nullable `desiredOutcome` and optional `completionChecks`; projection, Undo, restart recovery, and exact registered-UUID absence verification are covered | PROVED |
| Phase 7 natural curation | Active-run-only typed `ADD_REFERENCE` uses root content/topology preconditions, fresh apply/readback verification, and a separate CurationReceipt; no generic Graph write exists | PROVED |
| Phase 7 Grill and continuous apply | Real Graph acceptance asked one bottleneck, accepted free-form Evidence, committed WorkIntent, then a fresh-context Agent committed current focus and stopped at minimum commitment | PROVED locally |
| Phase 7 structural boundary | Real synthetic acceptance returned `BOUNDARY_REVIEW / SPLIT`; no Proposal or boundary mutation was created | PROVED locally |
| Phase 7 real existing MiniProject trial | One existing natural MiniProject was bounded-read and diagnosed as already sufficient; it was not bulk-Formalized or modified | PROVED locally |
| Phase 7 Taste baseline and feedback | Immutable active 0.1.0 hash, weak-acceptance Feedback, non-active 0.1.1 candidate, 6 pairwise + 4 regression evals, and explicit KEEP_0.1.0 decision | PROVED |
| Phase 7 fresh Agent usability | A context-free Agent read only public Guides and CLI discovery, froze Evidence, used the composite Skill/Taste, committed one focus change, and found empty recovery | PROVED locally |
| Phase 7 privacy and publish | No Graph/DB/descriptor/screenshot/backup enters Git; final remote parity is checked after publishing this audit | PROVED by final release handoff |

## Current conclusion

Phase 3 through Phase 6 remain intact. Phase 7 is complete pending only this release handoff's final commit/push parity check: a fresh external Agent can govern one Formal MiniProject through bounded Evidence, a read-only composite Skill, provisional Taste, narrow Formal Proposals, and verified natural curation. Real Desktop acceptance covered multi-round WorkIntent, continuous focus, typed reference curation, a non-executed split candidate, an already-healthy existing natural MiniProject, light final review, Feedback, and empty Recovery. Project Domain, generic Graph mutation, workflow engines, MCP/providers, conversational USER authority, automatic Skill modification, and automatic Taste activation remain deliberately deferred.
