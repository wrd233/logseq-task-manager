# ADR 0010: Persistent Creation Session authority

Status: Accepted (2026-08-02)

## Context

Project Creation and MiniProject Grill already prove that Provider output can be
validated, previewed, routed through Proposal, and applied by the existing Semantic
Commit / Undo kernel. Their discussion state is transient, so reload loses work and
users cannot safely advance several creations in parallel.

## Decision

- A `CreationSession` is a lightweight SQLite-authoritative draft object, not a V2
  managed object and not Logseq content.
- SQLite schema 16 adds one strict `creation_sessions` table. Its bounded aggregate
  has no formal Object, Anchor, Audit, Proposal, or Commit side effects.
- Durable business states are `DISCUSSING`, `PREVIEW_READY`, `CREATED`, and
  `ABANDONED`; Provider request and failure states remain inside rounds.
- One primary source and at most three user-selected references are immutable captures
  with current-source comparison hashes.
- Draft revisions carry provenance and an operation plan. User edits cannot be
  silently replaced by later generation.
- Final creation must prepare the existing Proposal/change plan, re-read state, and
  enter the existing Semantic Commit, recovery, Audit, and Undo machinery. Only a
  completed formal commit may mark the Session `CREATED`.

## Compatibility and failure policy

Existing Project Creation and MiniProject Grill remain available during vertical
migration. Schema migration uses the existing preflight backup and migration ledger.
Graph identity, optimistic version, and command receipts constrain all writes. Unsafe
source or placement changes fail closed or route to the existing high-risk surface.
Provider output never becomes formal truth or Agent Governance authority.
