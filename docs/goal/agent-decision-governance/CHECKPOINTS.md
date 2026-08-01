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

## CP-1 progress — data foundation

- schema v13 is an explicit backup-gated migration; v1 through v12 migration rehearsals remain green.
- Decision Thread identity is stable per Graph + Source Root; source-only refreshes update snapshots without spurious Revision events.
- Review Signal and Rule Authorization survive SQLite reopen with bounded list queries and idempotent optimistic writes.
- Rule promotion requires a USER actor; automatic transitions only move down one authority level, and EXPANDING Skill changes fail closed to Shadow.
- Remaining before CP-1 closes: Local Service/CLI contracts, structured validators at the trust boundary, migration diagnostics, and isolated backup/restore rehearsal with governance rows.
