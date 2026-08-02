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

## Next checkpoint

CS-CP03 backend is automated: strict MiniProject/Project node trees, durable node
identity, sparse important revisions, source revalidation snapshots, explicit text/delete/
structure edits, adoption, failure/restart replay, and silent-overwrite conflict protection.
The remaining CP03 work is the real Logseq-style Preview renderer and Plugin interaction.
