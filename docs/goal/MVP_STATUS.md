# MVP Status

```yaml
goal_state: CONSOLIDATED_RUNTIME_CHECKPOINT
current_slice: "Runtime Fix - observable formal-plugin bootstrap"
last_completed_commit: "5e7e9be fix: harden Task Copilot bootstrap and first-run storage"
last_successful_check: "2026-07-18 ./scripts/check.sh PASS; 73 tests; 145 rules; recovery rehearsal PASS; standalone formal-plugin build PASS"
implemented:
  - "Slice 0: Goal/spec baseline, 145-rule coverage, ADRs, workspace and formal plugin shell"
  - "Slice 1: object contracts, Phase/Condition/Signal, ownership matrix, dependency cycles, rule-referenced errors"
  - "Slice 2: checksummed dual-slot JSON, manifest-last filesystem writes, audit, pending-first Commit/Undo, reverse compensation and startup recovery"
  - "Slice 3: current-block Capture, Inbox, manual formalization Proposal and Graph-qualified Block Anchor"
  - "Slice 4: object drawer, Proposal-backed edits/Phase/Condition/ownership, signals, Anchor observation and rebind"
  - "Slice 5: No Agent/Demo providers, readable diff/impact preview, partial acceptance, deterministic risk, operation DAG, Commit and Undo"
  - "Slice 6: restrained Now Work and Project Re-entry with project selection and unresolved questions"
  - "Slice 7: JSON/JSONL/Markdown recovery bundle, checksums, temporary Store restore, automated acceptance report"
  - "Runtime Fix: independent Bootstrap Shell, namespaced Toolbar/five Commands/Slash, diagnostics fallback and safe Feature Initialization"
  - "Runtime Fix checks: behavioral failure fallback, UI mount fallback, duplicate registration, reload cleanup, package/dist integrity and identifier isolation"
  - "Runtime Fix 2: CSS-safe Logseq registration/DOM keys, root-scoped CSS and host-safe outer async catch"
  - "Runtime Fix 2: centralized storage error classification, flat physical FileStorage names, first-run schema-v1 initialization and Capability Lab missing-file handling"
remaining_automatable_work: []
runtime_checks_pending:
  - RT-MVP-001A
  - RT-MVP-002
  - RT-MVP-003
  - RT-MVP-004
acceptance_progress:
  TST-MVP-001: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-002: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-003: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-004: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-005: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-006: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-007: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-008: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-009: "AUTOMATED_PASS / DESKTOP_PENDING"
  TST-MVP-010: "AUTOMATED_PASS / DESKTOP_PENDING"
active_risks:
  - "The invalid-selector and first-run NOT_FOUND defects have automated fixes but require the 5-10 minute RT-MVP-001A Desktop regression"
  - "Logseq Desktop runtime shapes, UUID move/delete/undo and FileStorage reload are not claimed without RT evidence"
  - "move_content is intentionally refused by the Adapter until UUID move semantics are observed"
  - "@logseq/libs 0.0.17 retains upstream npm audit findings; forced breaking upgrade is not accepted without compatibility proof"
user_actions_required:
  - "Run the single 5-10 minute, no-Graph-write RT-MVP-001A checkpoint in PENDING_RUNTIME_TESTS.md"
resume_instruction: "Read AGENTS.md and Goal files, ingest RT-MVP-001A logs/screenshots, update the matrix, fix any Desktop regression, rerun ./scripts/check.sh, then restore the remaining functional checkpoint. Do not claim MVP_SUCCESS."
```

外层仓库分支为 `feature/task-copilot-mvp`，remote/upstream 均未配置，未 push。内层 Graph dirty 仍只作运行环境信息。
