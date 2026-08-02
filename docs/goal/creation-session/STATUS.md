# Creation Session status

Updated: 2026-08-02

Overall: `IN_PROGRESS`

| Phase | State | Current evidence |
|---|---|---|
| 0 Baseline and ADR | DONE | Existing paths inspected; ADR 0010 records authority and ADR 0011 freezes the formal Proposal/commit/Undo bridge. |
| 1 Session foundation | AUTOMATED_DONE | Domain, Application, schema 16, SQLite repository, Local Service CRUD, client, restart/idempotency/no-formal-write, Graph-owned source capture, bounded add-reference, visible drift/deletion counts, explicit refresh, durable 2–5-question rounds, per-question or whole-round answer-first Provider transactions, retry/cancel/failure retention and replay are implemented. Desktop remains consolidated into Phase 5. |
| 2 Draft Tree | AUTOMATED_DONE | Strict stable node/revision model, sparse important-history retention, source revalidation capture, MiniProject/Project Provider validator, Local Service/client generation, inline text/parent edits, atomic non-drag sibling movement, safe Agent-leaf deletion, natural-language revision, adoption, idempotency, restart/failure retention and user-edit conflict protection are automated. Plugin renders a responsive Logseq-style tree with Markdown/Page references, provenance, operation plan and conflicts. |
| 3 MiniProject vertical | AUTOMATED_DONE | Fresh PRE_COMMIT evidence, full in-place source retention, deterministic Block identities, one HIGH Proposal/accepted plan, shared SemanticCommit prepare/finalize, and Plugin exact Graph execution are automated for blank Page-end and Block in-place placement. Atomic Object+Anchor+Audit+Session materialization, exact compensation/replay/Undo, changed-tree protection and staging/partial-write cleanup are covered. Desktop remains consolidated into Phase 5. |
| 4 Project vertical | AUTOMATED_DONE | Independent NEW_PROJECT_PAGE Proposal, deterministic Page/Block identities, Service SemanticCommit, Plugin Graph execution, atomic Object/Anchor/Audit/Session finalization, exact compensation/replay/Undo, changed-page protection and interrupted-tree cleanup are automated. Desktop remains consolidated into Phase 5. |
| 5 Unified entry/runtime | AUTOMATED_DONE | Plugin has one persistent Creation Session controller and action surface with active-session list, MiniProject/Project blank entry, Page-to-Project route, pre-Grill Page material recognition, bounded source/reference management, grouped 2–5 question forms, whole-round natural answers, stable reload/resume, Draft/Summary/History tabs, explicit will/will-not impact, created-result object/source/Review+Undo affordances, loading/success/error states and runtime-generation stale-response protection. Terminal history is read-only and does not re-observe Graph sources. Both formal verticals dispatch through the same reviewed Creation Session action; legacy paths remain in one collapsed compatibility group. Real Provider, Desktop and independent visual gates remain. |

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

Checkpoint `CS-CP06`: the Project path now reuses the existing Proposal review and
SemanticCommit ledger end to end. The Plugin creates only an independently owned Page
with deterministic Draft UUIDs, verifies the exact tree before Domain finalization,
compensates a Domain conflict, replays interrupted finalization, and performs inverse
Domain removal plus exact Page deletion for Undo. A mid-tree failure removes the Page
only when the remaining tree is a strict transaction-owned prefix; changed/unknown
content is preserved. Plugin 517/517 and Local Service 198/198 pass before the root gate.

Checkpoint `CS-CP07`: the MiniProject path now freezes one complete reviewed Block tree
for both new-tree and source-in-place placement, and reuses the same Proposal,
SemanticCommit, Domain and inverse-commit authorities. The Plugin applies deterministic
UUIDs and order, verifies the exact after-tree before Domain finalization, restores the
exact before-tree on interruption or Domain conflict, and refuses Undo after later user
changes. Page-end staging is removed only while it remains transaction-owned and exact.
Plugin 523/523 and Local Service 200/200 pass before the root gate.

Checkpoint `CS-CP08`: the remaining interaction contract is automated end to end. The
first Provider call now waits for explicit source-scope confirmation; Page sources get
a bounded recognition summary, up to three manual references and visible added/modified/
deleted drift counts. Whole-round natural answers remain one preserved user statement
without turning unanswered questions into consent. Draft edits support inline text,
simple parent changes, atomic sibling movement, safe deletion and bounded natural-language
revision while preserving user-edited nodes. Preview shows explicit will/will-not impact,
and terminal History exposes the created object, primary source and the existing Review/
Undo authority without mutating a terminal Session. Plugin 528/528, Local Service 201/201
and the Node 20 root `./scripts/check.sh` pass; 145 stable rules and the export/restore
rehearsal remain green. Only the consolidated real Provider/Desktop/visual campaign remains.
