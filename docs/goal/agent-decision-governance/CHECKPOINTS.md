# Agent Decision Governance Checkpoints

## CP-0 — Baseline freeze

- 2026-08-02: base `7f235641`, 497 commits, branch/remote recorded.
- Running Logseq 0.10.15 and formal Plugin path identified.
- Node 20 CLI verified Service READY, schema v12, 59 objects and Doctor PASS.
- User-owned `apps/task-copilot-local-service/package.json` change excluded from Goal scope.
- Full user design read; current architecture reuse map recorded.

## Required checkpoint sequence

1. CP-1: schema/application/service foundation + explicit migration rehearsal.
2. CP-2: gate/source/context/Skill/router + zero-write Shadow automation.
3. CP-3: governance UI + feedback/export + full automated gate.
4. CP-4: one consolidated Desktop and real DeepSeek representative gate.
5. CP-5: Shadow daily-use handoff; wait for honest 14-day/200-Decision evidence.
6. CP-6: only after CP-5, explicitly authorized Guarded apply/reload/Undo/reload.

Each checkpoint requires updated STATUS and matrix, `./scripts/check.sh` with Node 20, a buildable local commit, and continuation to the next independent work item.

## CP-1 — data and service foundation complete (automated)

- schema v13 is an explicit backup-gated migration; v1 through v12 migration rehearsals remain green.
- Decision Thread identity is stable per Graph + Source Root; source-only refreshes update snapshots without spurious Revision events.
- Review Signal and Rule Authorization survive SQLite reopen with bounded list queries and idempotent optimistic writes.
- Rule promotion requires a USER actor; automatic transitions only move down one authority level, and EXPANDING Skill changes fail closed to Shadow.
- Runtime trust boundaries validate identities, enums, retention and effective authority on SQLite and HTTP reads.
- Authenticated Local Service and CLI expose bounded read-only governance projections; no public promotion or apply command was added.
- An isolated governance Decision snapshot passes backup, active reopen, offline restore and restored history verification.
- Live formal v12 migration remains intentionally deferred to the consolidated runtime checkpoint.

## CP-2 — deterministic zero-write Shadow runtime complete (automated)

- The gate suppresses format-only changes, selects a bounded structural Source Root and escalates strong, repeated weak, multi-target and event-storm signals deterministically.
- The Plugin-side latest-value queue is wired into the existing shared Graph fact stream with a 3-second debounce, cancellation, bounded failure isolation and a retained offline waterline; no second `DB.onChanged` listener exists.
- LOCAL/EXPANDED construction reuses the existing read-only Context Package Graph snapshot and SQLite projections, deduplicates exact content and records omitted required evidence.
- The internal governance Skill is packaged separately from external Agent Skills, hash-addressed, Doctor-validated and contains six stable Rule IDs with unique Chinese display names.
- Structured output cannot supply confidence or authority fields; the deterministic Router owns route selection.
- EXPERIMENT always returns Shadow with zero formal business writes; Guarded R1 is compiled behind a disabled runtime gate and cannot bypass pause, evidence, impact or version checks.
- An authenticated observation-only API drives the existing Graph read bridge, Context adapter, Skill, Structured Provider and deterministic Router; it exposes no apply or promotion authority.
- Explicit Task Shadow, Provider failure, stale-result cancellation, weak Review Signal and unchanged-source paths are green.
- Service E2E proves Object, Candidate, Proposal, Ownership and Association projections do not change while Decision/Rule governance rows persist.
- Commit revalidation classifies current facts as READY, STALE, BLOCKED or idempotent NO_OP without widening scope.
- The live Desktop/real-DeepSeek gate remains consolidated in CP-4; the automated CP-2 contract is complete.

## CP-3 — feedback/export/UI complete (automated)

- Feedback is a bounded `USER_FEEDBACK_ADDED` Decision Event and has no Undo field or transaction side effect.
- Single and bulk feedback are authenticated user commands with exact request shapes and idempotent persistence.
- Concrete bulk correction is split deterministically by Outcome, Rule ID, Risk Route and available action instead of being forced across incompatible Decisions.
- Explicit pause feedback atomically records the feedback and pauses only the referenced Rule; it does not alter the Rule's granted authority.
- Skill Feedback export now provides deterministic Markdown + JSON/JSONL, per-rule metrics, representative indexes, authority state, bounded redaction and a verified file manifest.
- Review Evidence export covers explicit 60/180-day ranges, stable source-identity Evidence IDs, captured/current drift, source-missing/error/truncation, weak clusters and a compact timeline through the existing live Graph read bridge.
- The existing Plugin shell now exposes Agent Governance under More; no standalone frontend or competing state store was added.
- Its compact exception-first stream provides 24h/7d counts, human/failure/sample indicators, Chinese Rule names, honest observation-only runtime state, weak signals and source/evidence/alternative/Context/Skill/Event detail.
- Single and compatibility-grouped bulk Feedback call the authenticated Service commands with visible pending/failure states and duplicate prevention; Feedback remains explicitly separate from existing Undo/recovery UI.
- Skill Feedback and Review Evidence controls download a human-readable README plus the integrity-validated machine package.
- Renderer tests cover exception order, runtime boundaries, detail, feedback, export, loading, failure and empty states; existing Plugin shell focus restoration and focus-visible styles apply, with dedicated normal/narrow responsive governance CSS.
- Light/Dark and 1000/760 Desktop screenshots remain consolidated in CP-4 and are not claimed from renderer tests.

## Guarded representative foundation complete (disabled)

- `agent-guarded-explicit-task.ts` is a compiled coordinator, not a new write authority. It delegates exclusively to the existing LOW-risk Proposal acceptance/revalidation/Semantic Commit path and its inverse Undo path.
- EXPERIMENT mode, disabled automation, an unmet 14-day/200-Decision gate, or missing explicit user authorization each stop before Proposal acceptance. Production currently satisfies all four stop conditions needed to remain zero-write.
- A Decision-linked Proposal must be deterministic, LOW risk, one explicit Task on the same Source Root, preserve source text byte-for-byte, carry the same internal Skill version and have no truncation or counter-signal.
- Agent execution revalidation stops stale sources, pause/revocation, degraded state, impact expansion and equivalent user actions before the existing formal chain.
- No-Agent Service regression creates ordinary formal objects both before and after an isolated Provider-disabled governance failure; no Candidate or Proposal is materialized by the failure.
- Real activation/apply/reload/Undo/reload remains CP-6 after honest CP-5 runtime evidence and explicit user authorization. Automated tests do not substitute for that gate.

## CP-4 — initial consolidated live Shadow checkpoint (historical)

- The formal live database was explicitly migrated from v12 to v13 only after a 0600 prebackup. Objects remained 59; SQLite reload, integrity, foreign-key checks and Doctor passed.
- A schema v13 backup containing governance rows was validated by the live Service and independently restored into a temporary path. The restored database retained 59 Objects, 2 Decisions, 1 Review Signal and the then-current Feedback Event, with recovery validation PASS.
- The dedicated Logseq page `Task Copilot Lab/Agent Governance CP4 20260802` produced two real governance threads through the shared Desktop observation path.
- The explicit `[Task]` source first produced a bounded failed r1 after real Provider output was rejected. After prompt/schema hardening, real DeepSeek produced meaningful r2 `CREATE_OBJECT / SHADOW / NOT_EXECUTED` under `EXPLICIT-TASK-01`; formal Object/Candidate/Proposal/Commit counts did not change.
- The weak source produced deterministic `REVIEW_SIGNAL / SHADOW / NOT_EXECUTED`, one ACTIVE/NORMAL 60-day Review Signal and no Candidate or Object.
- Desktop detail exposed bounded evidence, counter-signals, closest alternative, Context tier/token/truncation metrics, Chinese rule + Skill version and ordered Event history.
- One single feedback and one two-Decision bulk submission were persisted. The bulk action automatically split incompatible Outcome/Rule/Risk groups into two groups and added two Events; total Feedback Events became 3. Undo remained a separate existing capability.
- A fresh 30-day Skill Feedback package contains 2 Decisions, 5 exported Events and all 3 feedback events. The live 60-day Review package contains the weak-signal Evidence. Every package file matched its 64-character SHA-256 and byte count; credential scan hits were 0.
- Light, Dark, bulk-success and detail screenshots were captured from Logseq Desktop. At this initial checkpoint, narrow empty/failure/pause states remained pending; CP-4.1 below closes their representative Desktop evidence while independent visual approval remains external.
- Service restart/Plugin reload, Provider-output rejection and recovery, backup/restore, real DeepSeek structured output and Shadow zero-write were observed. Multi-target EXPANDED, full same-thread ordinary→action→explicit, live pause/degrade, timeout/cancel/auth and source-missing/truncation export remain automated-only.
- The initial checkpoint runtime was READY at schema v13 with Graph bridge connected, Doctor 11 PASS / 1 known WARN / 0 FAIL / 2 INFO, six governance rules unpaused SHADOW, Pending/Recovery Commit 0 and SQLite integrity `ok`; CP-4.1 records the later schema v14 final state.

## CP-4.1 — representative Desktop matrix complete

- Commit `9458670` broadened bounded retrieval and deterministic routing to Candidate defer/duplicate, ordinary, Worksite, exact multi-target EXPANDED and Provider invented-target rejection paths.
- schema v14 added only one durable global Agent write-pause setting. The formal v13 database was stopped, explicitly backed up, migrated and reopened with 59 Objects, 4 Decisions and 2 Review Signals intact; current schema v14 backup validation passed.
- The existing governance workspace now exposes minimum filter/search, source opening, direct per-rule pause/resume, global pause/resume, and both 60/180-day Review Evidence controls.
- Live Desktop proved multi-target EXPANDED fail-closed behavior and same-Source weak→explicit r1→r2 revision with zero formal Object change.
- Global pause survived Plugin reload. During the pause, editing a real Logseq weak signal refreshed the same Shadow Decision and increased the Review Signal occurrence count from 3 to 4 while Objects stayed 59; resume restored the default unpaused state.
- A real rule was paused and resumed through the UI without changing its granted authority. `打开来源` navigated to the exact Block anchor.
- A no-match search produced the bounded empty-result state. Stopping Launcher/Service produced the safe system failure surface while Logseq正文 remained readable/editable; reinstall and Plugin reload restored READY.
- All six live rules finish unpaused at `SHADOW`; global pause finishes false; automatic applies remain 0.
- Root Node 20 `./scripts/check.sh` passed after the implementation and schema changes.

The honest terminal state is `CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT`: representative Desktop and all current automatable work are complete. CP-5 still requires 14 natural days and at least 200 real Decisions; CP-6 remains barred until that evidence exists and the user explicitly authorizes Guarded execution.
