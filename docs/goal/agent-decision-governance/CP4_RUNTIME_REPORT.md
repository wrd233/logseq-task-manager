# Agent Decision Governance CP-4 Runtime Report

Date: 2026-08-02 (Asia/Shanghai)

Implementation commit: `9458670` (includes and supersedes the initial `2df6597` checkpoint)

Terminal state: `CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT`

Visual state: `VISUAL_GATE_READY`

## Scope and authority

This checkpoint used the formal local runtime, not a fixture:

- Logseq Desktop 0.10.15;
- Plugin build at `tmp/runtime/global-object-directory/plugin-dist/task-copilot-plugin`;
- SQLite authority `tmp/runtime/manual-v2/task-copilot.sqlite`;
- authenticated descriptor under `~/Library/Application Support/Task Copilot/runtime/`;
- dedicated page `Task Copilot Lab/Agent Governance CP4 20260802`;
- configured real DeepSeek Provider with the key resolved out of band.

The runtime remained `EXPERIMENT`; every rule's local and effective authority remained `SHADOW`, and Agent formal writes remained disabled. One rule and the global write gate were temporarily paused only for the explicit Desktop exercise, then restored to unpaused. No credential value was read into this report, a screenshot, Git, Graph or an export.

## Live database and service

| Check | Final value |
|---|---|
| Service | `READY`; protocol 1; formal write, migration, Provider, backup and Graph bridge capabilities present |
| Schema | 14 |
| SQLite | integrity `ok`; foreign-key violations 0 |
| Doctor | PASS: 11 pass / 1 warn / 0 fail / 2 info |
| Known warning | `STALE_PROPOSAL_PRESENT`, count 1; existed before this Goal |
| Objects | 59 |
| Candidates | 3 |
| Proposals | 49 |
| Semantic Commits | 75: 42 COMPLETED / 4 FAILED / 29 UNDONE |
| Pending or Recovery Required Commit | 0 |
| Decisions | 4 |
| Review Signals | 2 |
| Agent write settings | global pause false; 6 Rules all unpaused SHADOW; automatic apply 0 |

Objects, Candidates, Proposals and Semantic Commits were unchanged across the representative Shadow observations and feedback actions. The only intended writes were governance Decisions, Review Signals and Feedback Events.

## Explicit migration, backup and restore

1. The formal v12 database was backed up to `tmp/runtime/manual-v2/backups/before-v13-agent-governance-bb81564.sqlite` before the explicit v12→v13 migration.
2. Migration completed at schema v13 with 59 Objects retained and integrity/foreign-key checks passing.
3. A current Service-created backup, `backup_20260801202645781_289a717ce531411a8635f3941e37bef5`, validated PASS and contained schema 13, integrity `ok`, 59 Objects, 2 Decisions, 1 Review Signal and the feedback state present at backup time.
4. The same backup was restored independently over an older v13 database in a temporary path. Offline reopen reported schema 13, integrity `ok`, 59 Objects, 2 Decisions, 1 Review Signal, 1 then-current Feedback Event and recovery validation PASS.

The two later bulk Feedback Events occurred after this backup. They are present in the live database and in the final Skill Feedback export; the restore proof intentionally reports the backup's own earlier point in time.

5. Commit `9458670` introduced schema v14 with only one singleton global Agent write-pause setting. After stopping the exact Launcher/Service processes, `migrate-schema` created `before-schema14-20260801T212408Z.sqlite` and explicitly migrated v13→v14. The prebackup retained schema 13, integrity `ok`, 59 Objects, 4 Decisions and 2 Review Signals; the active database reopened as schema 14 with the same counts, integrity `ok`, zero foreign-key violations and default global pause false.
6. The live Service then created and validated `backup_20260801212512716_e6944a43beb147718ca109558dd97c60`: PASS, schema 14, integrity `ok`, foreign-key violations 0 and 59 Objects. Doctor returned to `BACKUP_LATEST_VALID`.

## Real Desktop and Provider evidence

### Explicit Task

Source block UUID: `6a6e4d56-da84-4925-8241-df14bbdd7536`

Current thread/Decision: `agent-thread-25690d2d` / `agent-thread-25690d2d:r2`

- The first real Provider response failed strict output validation and produced a bounded safe failure rather than a Candidate, Proposal or formal Object.
- Prompt/schema hardening then supplied an exact legal template and normalized nullable optional alternatives without accepting unknown fields.
- A later real DeepSeek response became meaningful revision r2: `CREATE_OBJECT / SHADOW / NOT_EXECUTED`, rule `明确任务标记 / EXPLICIT-TASK-01`, Skill `agent-decision-governance@1.0.0`, LOCAL Context and explicit truncation metadata.
- Desktop detail exposed source identity, evidence references, no counter-signals, closest alternative, Context token estimate, Skill/Rule identity and ordered Event history.
- No formal action was scheduled or executed.

### Weak signal

Source block UUID: `6a6e5370-8de8-4042-8aff-695e37d193e5`

Thread/Decision: `agent-thread-8eebb3ca` / `agent-thread-8eebb3ca:r1`

- Result: `REVIEW_SIGNAL / SHADOW / NOT_EXECUTED`, rule `复盘弱信号 / REVIEW-SIGNAL-01`.
- One Review Signal was created and later related to persisted feedback. During the global-pause Desktop exercise, the source was edited to `maybe revisit the governance review signal after global pause live CP4`; the same Decision was safely re-observed without a spurious Revision because Outcome/Rule/Route did not change. Its captured hash/text and `lastSeenAt` advanced, occurrence count became 4 and retention became the bounded RELATED policy.
- The source did not enter Candidate review and did not become a formal Object.
- The live 60-day Review Evidence export included this signal.

### Multi-target and same-Source revision

- Source `6a6e5eb1-6363-4058-b448-f1ccfe0d7af5` named `GOD 性能验证 31` and `GOD 性能验证 32` exactly. The runtime retrieved only those formal targets, escalated Context to EXPANDED and rejected invalid Provider output into `NEEDS_HUMAN / SHADOW / FAILED`; no target or evidence authority was invented and Objects stayed 59.
- Source `6a6e5f8e-c282-461b-b2cf-5257d46a2f77` retained one Thread while moving from weak review r1 to explicit TODO Task r2 `CREATE_OBJECT / SHADOW / NOT_EXECUTED`; Event history contains `SOURCE_OBSERVED` then `DECISION_REVISED`.

### Pause, source navigation and failure recovery

- Desktop paused and resumed `EXPLICIT-TASK-01`; granted/effective authority remained SHADOW and observation continued.
- Global pause survived Plugin reload. Editing the live weak source while paused refreshed the Decision/Review Signal, kept execution `NOT_EXECUTED` and Objects 59, proving pause blocks formal execution rather than observation. The global gate was then resumed.
- `打开来源` navigated to the exact Logseq URL anchor for Block `6a6e5370-8de8-4042-8aff-695e37d193e5` and hid the plugin overlay.
- Stopping the exact LaunchAgent/Service showed the bounded system status: formal changes paused, Logseq正文 still readable/editable, no empty-store fallback and no automatic mutation retry. Installer plus Plugin reload restored the toolbar, Graph bridge and READY runtime.

### Feedback

- A single `Correct / no correction / THIS_DECISION_ONLY` feedback submission persisted as `USER_FEEDBACK_ADDED` and did not invoke Undo.
- Selecting both Decisions and submitting bulk feedback produced the Desktop confirmation: “已按结果、规则和风险路由分成 2 组，记录 2 条反馈。”
- SQLite confirmed two new Events with the same timestamp on the two different threads. Total feedback Events became 3.
- The detail Event history showed source read, Agent revision and two user feedback events for the explicit-Task thread.

## Export evidence

### Final 30-day Skill Feedback package

`/Users/wangrundong/Downloads/agent-skill-feedback-2026-08-01T20-32-51-209Z.json`

- manifest kind `SKILL_FEEDBACK`;
- 2 included Decisions, not truncated, redaction count 0;
- `data/events.jsonl` contains 5 relevant exported Events, including all 3 Feedback Events;
- `README.md`, `data/decisions.jsonl`, `data/events.jsonl` and `data/summary.json` each matched the manifest byte count and 64-character SHA-256;
- credential-pattern hits: 0.

### Final 60-day Review Evidence package

`/Users/wangrundong/Downloads/agent-review-evidence-2026-08-01T20-14-49-307Z.json`

- contains 1 live weak-signal Evidence;
- all four embedded files matched manifest byte counts and SHA-256 values;
- credential-pattern hits: 0.

Three obsolete artifacts produced while diagnosing Electron's concurrent Save Panel behavior were moved to macOS Trash with `task-copilot-obsolete-` names. This was a recoverable exact-target cleanup; no other Downloads files were touched.

## Desktop screenshots

- `screenshots/agent-governance-light-live.jpeg`
- `screenshots/agent-governance-dark-live.jpeg`
- `screenshots/agent-governance-bulk-feedback-live.jpeg`
- `screenshots/agent-governance-detail-live.jpeg`
- `screenshots/agent-governance-empty-live.jpeg`
- `screenshots/agent-governance-failure-live.jpeg`

The Plugin's explicit appearance preference was temporarily changed to Dark only for the Dark capture, then restored exactly to `light` and reloaded. The empty-result and failure screenshots were captured from the physical 720×520 Logseq window, so the narrow responsive surface is real Desktop evidence. The committed screenshots establish `VISUAL_GATE_READY`, not `VISUAL_GATE_PASS`, because the implementing Agent is not an independent visual reviewer.

## Automated and safety gates

The Node 20.20.2 root gate passed again after commit `9458670`:

- typecheck and lint;
- all unit/integration/service tests, including Plugin 499 and Local Service 180;
- all builds and package/bootstrap checks;
- repository and architectural boundaries;
- 145 governance rule-coverage assertions;
- acceptance rehearsal with `differences=[]`;
- repository boundary check.

Additional final audits found:

- no skipped/only/todo tests;
- no executable TODO/FIXME/stub left in the Goal implementation;
- Pending/Recovery and silent-overwrite paths covered by automated tests;
- live Pending/Recovery count 0;
- user-owned `apps/task-copilot-local-service/package.json` remained unstaged and uncommitted;
- ignored `logseq/` Graph data remained outside Git.

The known npm audit baseline remains 2 high / 1 critical under existing OD-008; no force upgrade was performed in this Goal.

## Scenario verdicts and stop condition

Representative scenarios 1–8 passed live. Scenario 9 has live package integrity evidence and automated source-missing/truncation edge coverage. Scenario 10 is deliberately barred.

There are only 4 real Decisions and no natural 14-day observation period yet. Therefore:

- do not promote any rule;
- do not treat automated fixtures as accuracy history;
- do not run Guarded apply/Undo without both the long evidence gate and explicit user authorization;
- continue ordinary daily use in Shadow, then review per-rule evidence at CP-5.
