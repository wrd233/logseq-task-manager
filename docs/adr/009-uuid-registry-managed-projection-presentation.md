# ADR 009: UUID-registry managed projection presentation

Status: accepted  
Date: 2026-08-13

## Context

The Phase 1–5 engineering projection uses a visible child container, visible
title and state blocks, and properties that declare other field UUIDs. Its
reader identifies semantics partly through Chinese prefixes such as `标题：`,
`状态：`, and `当前推进：`. That shape proved transaction, Undo, and Recovery,
but duplicates an ordinary Task's title/default state and couples field
identity to presentation text.

Phase 5.5 requires an ordinary `OPEN + ACTIONABLE` Task with no special value to
remain visually just its natural Logseq Task. It must do so without weakening
stable identity, conflict detection, restart recovery, or ownership safety.

## Options

### A. Keep the visible container and properties

This is the smallest code change and makes discovery possible by scanning a
source block's children. It permanently displays product metadata and makes
omitted default fields impossible. It also preserves the label/parser coupling
that Phase 5.5 is intended to remove.

### B. Use the existing UUID registry

`PrimaryAnchor` already persists the projection container, title, state, focus,
and waiting UUIDs in SQLite. The Kernel/Store can provide the expected semantic
projection and these identities after restart. The Reader can fetch known UUIDs
and validate their topology and values without discovering fields by label.

Default fields can be absent. Visible managed children exist only when the
Renderer emits an information-bearing intent. Missing required blocks, moved
blocks, changed values, and unexpected managed blocks produce a different
projection hash and fail closed.

### C. Keep a minimal visible metadata marker plus UUIDs

A single marker simplifies discovery without the full engineering table. It is
still a permanent extra bullet/property group below every ordinary Task, so it
does not meet the zero-noise target. It also duplicates identities already
stored in `PrimaryAnchor`.

## Decision

Choose B, using the registry that already exists; do not create a general
registry framework.

- `PrimaryAnchor` remains the authoritative managed-identity registry.
- The natural source block remains the presentation root and is never captured
  by managed ownership.
- `projectionFocusUuid` identifies the optional current-focus child.
- `projectionWaitingUuid` identifies the optional waiting child.
- A deterministic UUID derived from `projectionWaitingUuid` identifies the
  optional review child.
- `projectionStateUuid` identifies an optional information-bearing completion
  or cancellation child.
- `projectionContainerUuid` and `projectionTitleUuid` remain stable registered
  identities for transaction/history continuity but do not require visible
  Graph blocks in Writing Language v1.

The Reader receives the Kernel's expected semantic projection and known UUIDs.
This is intentional: omitted default fields have no Graph text from which to
reconstruct Kernel state. The Reader independently observes source marker,
managed block existence, topology, and visible values. If those observations
are presentation-equivalent to the expected semantics, the projection hash is
the Kernel semantic-and-identity hash. Otherwise it is a deterministic conflict
hash. A label-only change with the same value is presentation-equivalent; a
value change, missing required field, moved managed field, or unknown content is
not.

The bounded Phase 1–5 engineering-format reader remains only as an ownership
check that enables one safe deterministic re-render. It is not a permanent
multi-version migration framework.

## Restart, discovery, missing blocks, and repair

- Restart: `showObject` returns the persisted `PrimaryAnchor`; no child scan is
  needed to rediscover identity.
- New formalization: the prepared `UPSERT_MANAGED_PROJECTION` effect contains
  the full identity and expected semantic projection needed for verified
  readback.
- Recovery: the durable Graph effect plus current Kernel object/anchor rebuilds
  the same expected presentation after restart.
- Missing omitted block: valid when the Renderer also omits it.
- Missing required block or value mismatch: conflict hash; no overwrite.
- Repair/re-render: allowed only after semantic-equivalence validation; it
  updates/removes only registered managed UUIDs and leaves all natural children
  untouched.

## Projection hash

The success hash protects the semantic projection plus registered identities,
as produced by the Kernel. Presentation labels, whitespace owned by the
renderer, and presentation version do not change business preconditions. A
topology or value discrepancy produces a separate hash that cannot satisfy the
Kernel precondition. This preserves stale detection without turning a label
refresh into a WorkObject version, business Commit, AgentRun, or Proposal.

## Consequences

- Zero-noise default becomes possible.
- Presentation wording can change without changing field identity.
- Graph Adapter IO needs an explicit expected-projection/identity input for
  managed reads.
- Pure rendering, identity-based reading, and host mutation become separate
  responsibilities.
- The maintenance re-render command is local projection convergence, not a
  domain command.
- There is no Project-domain expansion, template DSL, settings platform, or
  natural-body migration in this decision.
