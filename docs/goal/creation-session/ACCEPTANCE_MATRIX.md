# Creation Session acceptance matrix

| ID | Contract | Automated | Desktop/visual | State |
|---|---|---|---|---|
| CS-01 | Four statuses, target types and bounded sources | Domain tests | pending | IN_PROGRESS |
| CS-02 | SQLite authority, migration, restart and parallel sessions | Persistence/Service tests | pending | IN_PROGRESS |
| CS-03 | Source capture, drift/deletion and explicit refresh | Domain/Service tests; prior snapshot retained | pending | AUTOMATED_DONE |
| CS-04 | 2–5 related questions, reasons, recommendations and explicit answers | Domain + strict Provider validator tests | pending | AUTOMATED_DONE |
| CS-05 | Answer-first Provider transaction, retry/cancel/failure stability | Domain/Service restart, replay, failure and retry tests | pending | AUTOMATED_DONE |
| CS-06 | Consensus, unknown/conflict and resumable summary | Domain + Provider validator + persisted Service round tests | pending | AUTOMATED_DONE |
| CS-07 | Stable Logseq-style Draft Tree and user-edit protection | Domain/Provider/Service stable-ID, sparse revision, edit/adopt, conflict, restart and source-capture tests; Plugin renderer/controller tests | Desktop visual pending | AUTOMATED_DONE |
| CS-08 | Blank/Block MiniProject through existing Commit/Undo | Explicit placement + PRE_COMMIT reread + deterministic HIGH Proposal/replay tests; atomic final Domain step/Undo tests | Commit/Undo pending | IN_PROGRESS |
| CS-09 | Blank/Page Project through existing Commit/Undo | Independent Page placement + PRE_COMMIT reread + deterministic HIGH Proposal/replay tests; atomic final Domain step/Undo tests | Commit/Undo pending | IN_PROGRESS |
| CS-10 | Light/Dark, 720x520, keyboard, overflow, real Provider/Desktop | responsive semantic-token CSS, focus-visible and reduced-motion contracts; pure renderer tests | real viewport/IME/Provider/independent visual pending | IN_PROGRESS |
| CS-11 | Existing flow and governance regressions | Node 20 root `./scripts/check.sh` passes at CS-CP04; legacy Grill compatibility entries and Plugin UI suite pass (512/512 at CS-CP05) | pending | IN_PROGRESS |
