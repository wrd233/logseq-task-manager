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

## CP-3 — feedback/export/UI (in progress)

- Feedback is a bounded `USER_FEEDBACK_ADDED` Decision Event and has no Undo field or transaction side effect.
- Single and bulk feedback are authenticated user commands with exact request shapes and idempotent persistence.
- Concrete bulk correction is split deterministically by Outcome, Rule ID, Risk Route and available action instead of being forced across incompatible Decisions.
- Explicit pause feedback atomically records the feedback and pauses only the referenced Rule; it does not alter the Rule's granted authority.
- Skill Feedback export now provides deterministic Markdown + JSON/JSONL, per-rule metrics, representative indexes, authority state, bounded redaction and a verified file manifest.
- Review Evidence export covers explicit 60/180-day ranges, stable source-identity Evidence IDs, captured/current drift, source-missing/error/truncation, weak clusters and a compact timeline through the existing live Graph read bridge.
- The governance UI remains open.
