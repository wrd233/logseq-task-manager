# Creation Session checkpoints

## CS-CP01 — authority foundation

- schema 16 migration is preflight-snapshot protected;
- strict aggregate validation and graph binding;
- CRUD, optimistic version, command receipts and restart;
- multiple active sessions and filtered list;
- zero formal object/audit write before confirmation.

## CS-CP02 — source and round transaction

- source content is captured only through the bounded Desktop Graph bridge;
- important source snapshots are retained and source change/deletion is explicit;
- refresh retains the prior capture and turns dependent source facts into conflicts;
- one coherent Provider round contains 2–5 questions while multiple dimensions remain;
- every question carries rationale, recommendation and explicit answer state;
- answers commit before the Provider request and survive failure, cancellation, restart
  and retry;
- idempotent replay does not call the Provider again or duplicate consensus;
- Provider output remains proposal-only and produces zero formal Objects/Audit writes.

## CS-CP08 — automated interaction closure

- source scope is visibly confirmed before the first Provider call, Page material gets a
  bounded recognition summary, and up to three references can be added manually;
- resume/check displays added, modified and deleted counts; explicit refresh keeps the
  prior capture and invalidates Provider-style source evidence refs;
- users may answer each question or preserve one whole-round narrative without implicit
  consent for omitted questions;
- Draft supports text, safe deletion, simple parent choice, atomic sibling movement and
  bounded natural-language revision without overwriting direct user edits;
- formal preview states what will and will not happen;
- terminal History is read-only and links to the created object, primary source and the
  existing Review/Undo authority;
- Plugin 528/528, Local Service 201/201 and Node 20 root checks pass.

## Next checkpoint

One consolidated real Provider and Logseq Desktop campaign from `RUNTIME_PLAN.md`, then
the independent judgment required by `VISUAL_REVIEW.md`. Automation does not grant either
runtime or visual PASS.
