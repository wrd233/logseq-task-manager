# Creation Session status

Updated: 2026-08-02

Overall: `IN_PROGRESS`

| Phase | State | Current evidence |
|---|---|---|
| 0 Baseline and ADR | DONE | Existing paths inspected; ADR 0010 records authority and kernel reuse. |
| 1 Session foundation | AUTOMATED_DONE | Domain, Application, schema 16, SQLite repository, Local Service CRUD, client, restart/idempotency/no-formal-write, Graph-owned source capture, drift/deletion check, explicit refresh, durable 2–5-question rounds, answer-first Provider transactions, retry/cancel/failure retention and replay are implemented. Desktop remains consolidated into Phase 5. |
| 2 Draft Tree | IN_PROGRESS | Strict stable node/revision model, sparse important-history retention, source revalidation capture, MiniProject/Project Provider validator, Local Service/client generation, edit/adopt, idempotency, restart/failure retention and user-edit conflict protection are automated. Logseq-style renderer and Plugin Preview remain. |
| 3 MiniProject vertical | NOT_STARTED | Existing restructure kernel identified; Session integration is not implemented. |
| 4 Project vertical | NOT_STARTED | Existing creation kernel identified; Session integration is not implemented. |
| 5 Unified entry/runtime | NOT_STARTED | Plugin UI, compatibility, real Provider, Desktop and visual gates remain. |

Phase 1 preserves the key authority boundary: Provider output is a validated proposal
for questions, consensus and draft hints. It cannot create a formal Object, write Audit,
or bypass the existing Application Command and Commit kernels.

The pre-existing `apps/task-copilot-local-service/package.json` modification is outside
this Goal and is not modified, staged, or committed.
