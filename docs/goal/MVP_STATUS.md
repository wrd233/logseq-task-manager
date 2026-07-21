# MVP Status

```yaml
goal_state: V1_FROZEN_FOR_MIGRATION
current_slice: "V1 frozen; V2 Slice A0 complete; A1-A4 foundation in progress; Slice B0-B4 foundation; Slice B5 Project Desktop pass; Slice C0-C5 Desktop partial pass; Slice E Now Work interactive foundation"
last_successful_check: "2026-07-21 ./scripts/check.sh PASS on Node 20.20.2/npm 10.8.2; 282 tests; 145 rules; 0 skipped; all builds, boundaries and recovery rehearsal passed; Slice D live/Desktop and E2E-13 Context Package/Desktop gates remain pending"
runtime_kernel: V1_RUNTIME_KERNEL_PASS
product_pilot: V1_MVP_PILOT_PARTIAL
v1_state: V1_FROZEN_FOR_MIGRATION
v2_migration_design: V2_MIGRATION_DESIGN_READY
implemented:
  - "V1 Slice 0-7 and RT-MVP-001B..004 with Desktop evidence"
  - "Plugin-native forms, explicit Phase actions and high-impact confirmation"
  - "Stable inverse Commit serialization and A/B previous-slot recovery"
  - "OD-001: V2 supersedes V1; no permanent dual model"
  - "OD-002: explicit read-only FileStorage export to SQLite; no dual write"
  - "OD-003: reviewable Phase/Signal migration to Lifecycle/Condition/Focus"
  - "Four-item copied-data Pilot on a dedicated local page"
  - "Migration design, Legacy mapping and bounded DeepSeek live-test plan"
  - "V2 six-object Domain and Lifecycle/Condition/Focus seam"
  - "Application command envelope with atomic SQLite object/audit/idempotency receipts"
  - "Primary Anchor and Primary Ownership Domain plus SQLite uniqueness"
  - "Authenticated loopback Service, 0600 descriptor, versioned Client and restricted-state model"
  - "Plugin descriptor discovery, explicit restricted diagnostics, and zero-Store three-entry first-run welcome"
  - "Offline SQLite restore primitive with pre-restore recovery point, atomic activation, Doctor, and injected-failure rollback"
  - "Executable read-only tc status/doctor/object CLI with JSON envelope and exit codes"
  - "tc Proposal list/show/validate/submit reuses Local Service review storage; validate is zero-write and submit cannot commit/apply formal state"
  - "SQLite locked writes fail with zero formal writes; backups reject overwrite and validate schema, Graph identity, integrity and foreign keys read-only"
  - "Authenticated Service Backup create/restore-validate contract with server-generated IDs, 0700/0600 permissions, bounded bodies and no restore activation"
  - "SQLite schema v6 migration ledger: SemanticCommit, Proposal/Group, immutable Audit/current-projection decoupling, and nullable Task due_at; v1..v5 upgrades require a validated preflight snapshot and roll back atomically"
  - "V2 Proposal Review now provides one continuous accept, final preview/Diff, explicit Commit, applied status, and inverse Commit/Undo flow with restart continuation and no overwrite of later edits"
  - "Slice D L1 now provides explicit DeepSeek runtime selection, env/Keychain secret references, bounded Structured Output with timeout/cancel/retry/error isolation, deterministic five-layer Prompt assembly, machine-owned Proposal metadata/hash, Domain validation, NO_PROPOSAL zero-write handling, and a capability-gated Review Center current-block entry"
  - "Slice D L2 has a default-off one-request smoke harness with sanitized zero-write metadata, and DS-01..12 fixed sanitized golden manifests are ready for real-model execution"
  - "V2 Now Work reads SQLite authority through Local Service and renders three explainable, empty-hiding regions; recent actionable work is bounded and ordinary Waiting stays quiet"
  - "V2 Now Work can add/remove/reorder Focus through Application and Local Service concurrency guards, and active Primary Anchors expose a safe open action without changing formal object state"
  - "V2 Now Work can set ACTIONABLE/WAITING/BLOCKED/PAUSED through one versioned Application command; Waiting review evidence is validated and immediately feeds the quiet review projection"
  - "V2 BLOCKED can reference one readable OPEN blocker; invalid links are zero-write, and actionable or quiet-Waiting blockers of Focus are surfaced with natural-language reasons"
  - "V2 Now Work supports session-only type filtering and grouping; partial views cannot accidentally reorder the full Focus list"
  - "V2 Task due_at is versioned through Local Service, is sorted by explicit time with natural-language reasons, and never becomes a score"
  - "Review Center now owns the bounded current-page explicit Candidate scan and one-at-a-time stale-protected synchronization; Diagnostics no longer serves as that daily entry"
  - "Review Center separates Candidate and Proposal queues with explicit counted session-level views, without adding another persisted state"
  - "Known Primary Anchor observations persist missing/conflict/recovery through Local Service and one SQLite transaction without deleting objects or reviving replaced Anchors"
  - "Same-UUID synchronization preserves object_id, anchor_id and Primary Ownership; a copied UUID materializes a distinct object and Anchor"
  - "Explicit V2 Primary Anchor rebind requires confirmation, atomically preserves the old replaced Anchor while activating one new Anchor, and has a bounded Plugin review panel with stale re-read protection"
  - "Manual current-page discovery recovers explicit objects created while the Plugin was offline with a 256-item processing budget, complete bounded Anchor coverage or zero-write refusal, one-at-a-time synchronization, stale reread protection, and no full-Graph scan"
  - "Changed Block UUIDs are debounced into a 32-root latest-value queue, reread authoritatively, and expanded within a 256-Block frontier budget; internal bare TODO stays non-object, explicit descendants synchronize independently, and overflow/truncation/malformed shapes require reconciliation"
  - "Project atomic creation passed Desktop success, unknown-name conflict, page rename, cold reload, and real finalize-process interruption/restart; V2 objects now render Lifecycle/Condition directly from Local Service without V1 Phase mapping"
  - "Proposal Review passed a real MEDIUM accept-not-applied, scope revalidation, final confirmation, Graph plus SQLite Commit, same-card inverse Commit/Undo and cold reload; exact plugin-write echo suppression preserves strict later-edit protection"
pilot_results:
  capture: PASS
  task: PASS_WITH_DOCUMENTED_REBIND_LIMITATION
  mini_project: PARTIAL_OPEN_ACCEPTED_PROPOSALS
  project: PARTIAL_NO_NEW_AGGREGATION_OR_CLOSURE_LOOP
runtime_checks_completed:
  - "RT-MVP-001B..004 PASS on Logseq Desktop 0.10.15"
  - "Pilot reload, Task complete/inverse Commit and explicit rebind verified"
  - "Pilot pre/post recovery bundles replay with differences []"
  - "V2 Desktop 0.10.15 E2E-11: current cached asset commit verified; V2-only workspace READY; two-item Focus ordering, WAITING/BLOCKED, Task deadline, blocker wake-up, Task filter/grouping, Primary Anchor open and cold-reload persistence verified against SQLite/CLI"
  - "V2 Desktop 0.10.15 E2E-19: Project create/conflict/rename/reload and finalize Service interruption recovery verified with zero half-object and one-object idempotent retry"
  - "V2 Desktop 0.10.15 Proposal partial Gate: accepted-not-applied, final Commit, same-card Undo and cold reload verified; corrected object text is explicit Proposal data and remains version 2 without DB-event echo"
runtime_checks_pending:
  - "V2 remaining Anchor move/copy/rebind, Proposal high-impact/reject/defer/stale/later-edit/process-fault, Candidate Review Center, SQLite recovery and migration Preview/Undo Desktop Gates"
active_risks:
  - "Proposal accept and commit remain visually separate in V1; OPEN+ACCEPTED is safe but confusing"
  - "Logseq Undo restores block text but not resolvable original Anchor identity; explicit rebind remains required"
  - "DeepSeek L1 automatic foundation is complete, but the live Gate still lacks a currently available Base URL/actual Model/Key secret-reference configuration and L2-L4 evidence"
  - "@logseq/libs 0.0.17 retains upstream npm audit findings; no forced incompatible upgrade"
user_actions_required:
  - "For later Slice D live Gate only: no product decision is pending; runtime must still establish a secure secret reference and discover/confirm Provider Base URL plus actual model ID before spending calls"
resume_instruction: "Read AGENTS.md, this file, current-status, Pilot report and migration docs. Keep V1 frozen, never dual-write, continue Slice A test-first. Do not claim V1_MVP_PILOT_SUCCESS, Slice D, or V2 completion without their real gates."
```

外层仓库分支为 `feature/task-copilot-mvp`。`logseq/` 是 ignored 本地测试 Graph；inner dirty 仅作运行证据，不进入提交。
