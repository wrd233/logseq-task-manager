# ADR 0011: Creation Session formal commit plan

Status: Accepted (2026-08-02)

## Context

ADR 0010 makes Creation Session the SQLite authority for discussion, source
captures, answers, and draft revisions. It deliberately does not authorize Graph or
formal object writes. The last step still needs a deterministic bridge into the
existing Proposal, Semantic Commit, recovery, Audit, and Undo kernel.

The bridge must cover two materially different effects:

- MiniProject may rewrite and rearrange one explicitly selected Block subtree in
  place, but may not drop source material, cross a Page boundary, or silently absorb
  another formal object.
- Project always creates an independent Page in the first vertical slice. Page and
  Block sources remain unchanged and are retained as evidence references.

## Decision

- Formal creation is represented by exactly one accepted `HIGH` Proposal group and
  one `CREATE_OBJECT` semantic operation with a machine-validated
  `CREATION_SESSION_V1` payload.
- The payload freezes `sessionId`, expected Session version, adopted Draft revision,
  target type, object identity, Placement, ordered Draft nodes, deterministic Graph
  identities, and a fingerprint of all current source captures.
- Proposal preparation requires a fresh `PRE_COMMIT` capture for every Graph source.
  The captured hash must equal both the source's current capture and latest observed
  hash. Proposal scope repeats every source Block/Page and the placement target so
  the ordinary Proposal revalidation path can fail stale work closed.
- MiniProject `SOURCE_BLOCK_IN_PLACE` requires the Draft root to reuse the selected
  root UUID and every source `ROOT` or `CHILD` node to occur exactly once. No delete,
  cross-Page move, or implicit source omission is representable.
- Other MiniProject placements create a new tree. Project only accepts
  `NEW_PROJECT_PAGE`; every Project Draft node creates new Graph content and the
  source remains read-only.
- Accepting the Proposal records review only. A dedicated planner parses the accepted
  payload into deterministic Graph steps and one final domain step. The final domain
  step atomically creates Object + Primary Anchor + Audit and marks the Session
  `CREATED` in the existing SQLite transaction boundary.
- Graph-step failure or final-domain-step failure leaves the Session short of
  `CREATED` and uses the existing pending-commit recovery/compensation ledger.
- Undo reverses only unchanged Graph effects, removes the exact formal projection,
  and marks the retained Session result `undoneAt`; it never deletes the Session.

## Compatibility

Existing transient MiniProject and Project creation routes remain available until
the corresponding Creation Session vertical passes automated, Desktop, recovery,
and real-Provider gates. They do not become a second write kernel: both routes must
converge on the same Proposal review and Semantic Commit infrastructure.
