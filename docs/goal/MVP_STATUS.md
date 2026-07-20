# MVP Status

```yaml
goal_state: V1_FROZEN_FOR_MIGRATION
current_slice: "V1 frozen; V2 Slice A0 complete; A1-A4 foundation in progress"
last_successful_check: "2026-07-20 ./scripts/check.sh PASS on Node 20.20.2/npm 10.8.2; 115 tests; 145 rules; 0 skipped; all builds, boundaries and recovery rehearsal passed; Service/CLI process smoke PASS"
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
  - "Executable read-only tc status/doctor/object CLI with JSON envelope and exit codes"
  - "SQLite locked writes fail with zero formal writes; backups reject overwrite and validate schema, Graph identity, integrity and foreign keys read-only"
pilot_results:
  capture: PASS
  task: PASS_WITH_DOCUMENTED_REBIND_LIMITATION
  mini_project: PARTIAL_OPEN_ACCEPTED_PROPOSALS
  project: PARTIAL_NO_NEW_AGGREGATION_OR_CLOSURE_LOOP
runtime_checks_completed:
  - "RT-MVP-001B..004 PASS on Logseq Desktop 0.10.15"
  - "Pilot reload, Task complete/inverse Commit and explicit rebind verified"
  - "Pilot pre/post recovery bundles replay with differences []"
runtime_checks_pending:
  - "V2 first-run, Service restricted mode, SQLite recovery and migration Preview/Undo Desktop Gate"
active_risks:
  - "Proposal accept and commit remain visually separate in V1; OPEN+ACCEPTED is safe but confusing"
  - "Logseq Undo restores block text but not resolvable original Anchor identity; explicit rebind remains required"
  - "DeepSeek live Gate lacks complete secure Provider/Base URL/Model/Key reference configuration"
  - "@logseq/libs 0.0.17 retains upstream npm audit findings; no forced incompatible upgrade"
user_actions_required:
  - "For later Slice D live Gate only: provide complete secure Provider/Base URL/Model/Key reference configuration"
resume_instruction: "Read AGENTS.md, this file, current-status, Pilot report and migration docs. Keep V1 frozen, never dual-write, continue Slice A test-first. Do not claim V1_MVP_PILOT_SUCCESS, Slice D, or V2 completion without their real gates."
```

外层仓库分支为 `feature/task-copilot-mvp`。`logseq/` 是 ignored 本地测试 Graph；inner dirty 仅作运行证据，不进入提交。
