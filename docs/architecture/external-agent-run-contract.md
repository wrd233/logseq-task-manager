# External AgentRun Contract

An External run reuses `AgentRunReceipt` with executor `{ type: "EXTERNAL_CLI", id }` and a two-state lifecycle: `STARTED` then `FINISHED`. The Kernel never invokes a model.

The immutable Skill carries governance policy and examples. `skill show` separately exposes the Kernel-owned closed result wire contract, so improving External Agent discoverability does not mutate a previously approved Skill or its hash.

Start requires one open target, its exact version and projection, at least one trusted Evidence item bound to that target, an approved purpose, and no incomplete recovery. The Kernel selects the approved Skill; the caller cannot supply Skill, risk, actor, operation, or target preconditions.

Finish accepts only the closed result shape for the run purpose:

- `PROPOSAL`: the existing current-focus or engagement result;
- `NO_PROPOSAL`: durable receipt, no Proposal or Commit;
- `NEEDS_MORE_CONTEXT`: durable receipt, no Proposal or Commit.

Invalid output is durably `FAILED`. A changed target invalidates finish. Exact retries return the same finished run and Proposal; a different submission for the same run is rejected.

The Kernel converts a valid `PROPOSAL` result into the existing immutable ProposalRevision. Apply rechecks target, projection, Evidence content, Evidence watermark, Skill identity/hash, operation-contract version, autonomy, and recovery before preparing a Semantic Commit.

Only a small receipt and structured result are stored. Prompts, transcripts, chain-of-thought, and arbitrary Graph dumps are not persisted.
