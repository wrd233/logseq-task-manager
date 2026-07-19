# MVP Status

> **2026-07-19 V2 候选 Goal 提醒**：用户提供了新的 V2 设计基线与 Codex Goal。结构性实现按新 Goal §30 暂停在总体方案确认点；先读取 `docs/implementation/current-status.md`、`repository-assessment.md`、`open-decisions.md` 和 `slices/slice-A-plan.md`。用户确认 OD-001..003 前，下方 V1/MVP Runtime Checkpoint 仍有效，不得静默改写为 V2，也不得遗漏 V2 确认事项。

```yaml
goal_state: CONSOLIDATED_RUNTIME_CHECKPOINT
current_slice: "V1/MVP RT-MVP-001B..004 PASS; copied-data Pilot and V2 OD-001..003 confirmation pending"
last_completed_commit: "366da6b fix: complete consolidated desktop runtime checkpoint"
last_successful_check: "2026-07-20 ./scripts/check.sh PASS on Node 20.20.2/npm 10.8.2; 91 tests; 145 rules; all builds, boundaries and acceptance rehearsal passed"
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
  - "Runtime Fix 3: numeric/Journals Source Resolver, Block-UUID legacy repair and source_reference_repaired audit"
  - "Runtime Fix 3: observable six-action Inbox controller, inline formalization/proposal/link/defer/dismiss UI and complete manual Task Commit"
  - "Runtime Fix 3: bounded structured logger, correlation IDs, global rejection capture, Diagnostics JSONL and read-only probes"
  - "Runtime Fix 3 review closure: atomic optional ownership with explicit high-impact confirmation, audited source refresh/conflict, refresh-failure diagnostics and real DOM Action Probe"
  - "Runtime Fix 4: all remaining browser prompt/confirm paths replaced by typed in-plugin dialogs; explicit direct Phase buttons and AREA manual formalization restored"
  - "Runtime Fix 4: stable inverse-Commit serialization/readback guard and two-step previous-slot recovery gate"
remaining_automatable_work: []
runtime_failures_automatically_fixed:
  - "RT-BUG-001: root cause confirmed in RuntimeShapeAdapter id-first String mapping; repair and 2026-07-19 Desktop regression PASS"
  - "RT-BUG-002: prompt-dependent and void Promise dispatch paths replaced by observable actions; 2026-07-19 Desktop regression PASS"
runtime_checks_completed:
  - "RT-MVP-001B PASS on Logseq 0.10.15 with plugin commit 8c2f8e98ba59; source, six actions, real reload, two probes and JSONL export verified"
  - "RT-MVP-002 PASS on Logseq 0.10.15: partial acceptance, Commit/Undo, Project/Area ownership, ACTIVE+WAITING+REVIEW_DUE, Now Work, Re-entry and reload verified"
  - "RT-MVP-003 PASS with documented runtime limitation: move preserved UUID, edit conflicted without overwrite, delete became missing, Cmd+Z restored text but required explicit rebind"
  - "RT-MVP-004 PASS: 13-file recovery bundle, checksum/readback differences 0, Pending Commit 0/0, No-Agent setting and FileStorage reload verified"
runtime_checks_pending: []
acceptance_progress:
  TST-MVP-001: "PASS"
  TST-MVP-002: "PASS"
  TST-MVP-003: "PASS_WITH_DOCUMENTED_LOGSEQ_UNDO_LIMITATION"
  TST-MVP-004: "PASS"
  TST-MVP-005: "PASS"
  TST-MVP-006: "PASS"
  TST-MVP-007: "PASS"
  TST-MVP-008: "PASS / COPIED_DATA_PILOT_PENDING"
  TST-MVP-009: "PASS"
  TST-MVP-010: "PASS"
active_risks:
  - "The four-item copied-data Pilot still requires user-selected representative items; framework Desktop PASS alone is not MVP_SUCCESS"
  - "Logseq 0.10.15 Cmd+Z restored deleted Block text but did not immediately restore a resolvable original Anchor identity; explicit rebind is the verified recovery path"
  - "move_content remains intentionally refused by the V1 Adapter even though built-in Logseq move preserved UUID; physical location is not ownership"
  - "@logseq/libs 0.0.17 retains upstream npm audit findings; forced breaking upgrade is not accepted without compatibility proof"
user_actions_required:
  - "Confirm OD-001..003 in docs/implementation/open-decisions.md before V2 structural implementation"
  - "Select or provide four representative copied-data items for Pilot; Pilot is the remaining V1/MVP runtime checkpoint"
resume_instruction: "Read AGENTS.md and Goal files. RT-MVP-001B..004 are PASS, with the exact Logseq Undo limitation documented. Preserve the V2 confirmation gate; after OD-001..003 are confirmed, freeze migration ADRs and enter Slice A test-first. Do not claim V2 runtime evidence or MVP_SUCCESS before the copied-data Pilot and root clean gate."
```

外层仓库分支为 `feature/task-copilot-mvp`，跟踪 `origin/feature/task-copilot-mvp`；本 Goal 未 push、未修改 remote。内层 Graph dirty 仍只作运行环境信息。
