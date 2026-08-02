# Creation Session acceptance matrix

| ID | Contract | Automated | Desktop/visual | State |
|---|---|---|---|---|
| CS-01 | Four statuses, target types and bounded sources | Domain tests; one primary plus at most three references; terminal read-only controller test | pending | AUTOMATED_DONE |
| CS-02 | SQLite authority, migration, restart and parallel sessions | Persistence/Service restart, optimistic-version and idempotency tests | pending | AUTOMATED_DONE |
| CS-03 | Source capture, drift/deletion and explicit refresh | Domain/Service tests; added/modified/deleted summary; real Provider evidence-ref invalidation; prior snapshot retained | pending | AUTOMATED_DONE |
| CS-04 | 2–5 related questions, reasons, recommendations and explicit answers | Domain + strict Provider validator tests; per-question and preserved whole-round narrative paths | pending | AUTOMATED_DONE |
| CS-05 | Answer-first Provider transaction, retry/cancel/failure stability | Domain/Service restart, replay, failure and retry tests | pending | AUTOMATED_DONE |
| CS-06 | Consensus, unknown/conflict and resumable summary | Domain + Provider validator + persisted Service round tests | pending | AUTOMATED_DONE |
| CS-07 | Stable Logseq-style Draft Tree and user-edit protection | Domain/Provider/Service stable-ID, sparse revision, text/parent/delete/atomic sibling move, bounded natural-language revision, adopt, conflict, restart and source-capture tests; Plugin renderer/controller tests | Desktop visual pending | AUTOMATED_DONE |
| CS-08 | Blank/Block MiniProject through existing Commit/Undo | Explicit placement + PRE_COMMIT reread + deterministic HIGH Proposal; full before/after tree plan; Service SemanticCommit prepare/finalize/replay/compensation; Plugin Page-end and in-place execution, exact interrupted-write/Domain-conflict recovery, changed-tree protection and inverse Domain/Graph Undo | Desktop pending | AUTOMATED_DONE |
| CS-09 | Blank/Page Project through existing Commit/Undo | Independent Page placement + PRE_COMMIT reread + deterministic HIGH Proposal; Service SemanticCommit prepare/finalize/replay/compensation; Plugin exact deterministic Page tree, partial-write cleanup, changed-page protection and inverse Domain/Page Undo | Desktop pending | AUTOMATED_DONE |
| CS-10 | Light/Dark, 720x520, keyboard, overflow, real Provider/Desktop | responsive semantic-token CSS, focus-visible and reduced-motion contracts; source/round/Draft/impact/result renderer tests | real viewport/IME/Provider/independent visual pending | IN_PROGRESS |
| CS-11 | Existing flow and governance regressions | Node 20 root `./scripts/check.sh` passes at CS-CP08; legacy compatibility group and Plugin UI suite pass (528/528); Local Service 201/201; 145 stable rules and export/restore rehearsal pass | Desktop pending | AUTOMATED_DONE |
