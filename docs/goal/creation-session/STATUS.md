# Creation Session status

Updated: 2026-08-02

Overall: `IN_PROGRESS`

| Phase | State | Current evidence |
|---|---|---|
| 0 Baseline and ADR | DONE | Existing paths inspected; ADR 0010 records authority and ADR 0011 freezes the formal Proposal/commit/Undo bridge. |
| 1 Session foundation | AUTOMATED_DONE | Domain, Application, schema 16, SQLite repository, Local Service CRUD, client, restart/idempotency/no-formal-write, Graph-owned source capture, drift/deletion check, explicit refresh, durable 2–5-question rounds, answer-first Provider transactions, retry/cancel/failure retention and replay are implemented. Desktop remains consolidated into Phase 5. |
| 2 Draft Tree | AUTOMATED_DONE | Strict stable node/revision model, sparse important-history retention, source revalidation capture, MiniProject/Project Provider validator, Local Service/client generation, edit/adopt, idempotency, restart/failure retention and user-edit conflict protection are automated. Plugin now renders a responsive Logseq-style tree with Markdown/Page references, provenance, operation plan, conflicts, inline text/parent editing, safe Agent-leaf deletion and revision adoption. |
| 3 MiniProject vertical | IN_PROGRESS | Fresh PRE_COMMIT evidence, full in-place source retention, deterministic Block identities, one HIGH Proposal/accepted plan, and atomic Object+Anchor+Audit+Session materialization/Undo are automated. Graph step planning, Service/Plugin execution, recovery and Desktop remain. |
| 4 Project vertical | IN_PROGRESS | Proposal boundary enforces independent NEW_PROJECT_PAGE, all-new Draft nodes, read-only source evidence, deterministic identities, and the shared atomic final domain step. Project Page Graph execution, source references, Service/Plugin integration, recovery and Desktop remain. |
| 5 Unified entry/runtime | IN_PROGRESS | Plugin has one persistent Creation Session controller and action surface with active-session list, MiniProject/Project blank entry, Page-to-Project route, grouped 2–5 question forms, answer-first submission, stable reload/resume, Draft/Summary/History tabs, loading/success/error states and runtime-generation stale-response protection. Legacy Grill paths remain reachable for compatibility. Real Provider, formal creation integration, Desktop and independent visual gates remain. |

Phase 1 preserves the key authority boundary: Provider output is a validated proposal
for questions, consensus and draft hints. It cannot create a formal Object, write Audit,
or bypass the existing Application Command and Commit kernels.

The pre-existing `apps/task-copilot-local-service/package.json` modification is outside
this Goal and is not modified, staged, or committed.

Checkpoint `CS-CP03`: Node 20 root `./scripts/check.sh` passes after Plugin integration;
the new controller/renderer suite adds six focused tests and the existing Plugin UI
compatibility suite remains green.

Checkpoint `CS-CP04`: ADR 0011 and the `CREATION_SESSION_V1` Proposal/accepted-plan
validator are implemented. SQLite now has one atomic final domain step that couples
Object, Primary Anchor, Audit, Receipt, and Session `CREATED`; exact Undo deletes only
an unchanged formal projection and retains the Session with `undoneAt`. Focused
Proposal and persistence rollback/idempotency tests pass. Graph-step execution is not
yet connected, so neither formal vertical is marked automated complete.
