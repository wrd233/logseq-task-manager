# Managed Projection Presentation Contract

Status: Phase 5.5 contract  
Date: 2026-08-13

## Boundary

```text
Kernel semantic ManagedProjection
  -> presentation model (Writing Language v1)
  -> pure renderer
  -> ordered block intents
  -> Graph Adapter IO
```

The read path is separate:

```text
Kernel expected projection + PrimaryAnchor UUID identity
  -> UUID-addressed Graph blocks
  -> identity-based presentation observation
  -> semantic-equivalence result + projection hash
```

The Kernel contains no Chinese labels or omission/layout rules. The pure
renderer contains no Logseq SDK calls. Graph IO does not determine business
state from presentation labels.

## Presentation model and block intent

The presentation model contains only non-empty human-visible fields:

```ts
type ProjectionFieldKind = "CURRENT_FOCUS" | "WAITING" | "REVIEW" | "COMPLETION" | "CANCELLATION";

interface ProjectionField {
  kind: ProjectionFieldKind;
  uuid: string;
  value: string;
}

interface ProjectionBlockIntent extends ProjectionField {
  content: string;
  order: number;
}
```

UUID selection is defined by ADR 009. `content` is renderer output; semantic
field identity is `kind + uuid`, never a substring of `content`.

## Reader contract

The Reader requires a known expected projection for an existing formal object.
That projection contains the stable identities persisted in `PrimaryAnchor`.
The Reader:

1. reads the source marker/content;
2. fetches known managed UUIDs;
3. verifies that a present managed block is a direct child of the source (or is
   the exactly owned bounded engineering container during one-time refresh);
4. extracts a field value according to field identity, ignoring label wording;
5. compares observed field presence/value with pure renderer expectations;
6. returns the Kernel projection hash when equivalent, or a deterministic
   conflict hash when different.

The Reader must not scan for `[当前推进]`, `[等待]`, or other labels to decide a
field's meaning. The old engineering reader may recognize its exact legacy
shape only to validate ownership before deterministic replacement.

## Hash and conflict contract

For an equivalent projection:

```text
projectionHash = stableHash(semantic projection + registered identity)
```

This is the hash already produced by the Kernel. Renderer-owned label wording
does not affect it.

For a mismatch, the observed identity topology, field presence, and extracted
values are included in a deterministic conflict hash. Therefore:

- label-only change, same value -> equivalent;
- value change -> conflict;
- required managed block missing -> conflict;
- omitted default block absent -> equivalent;
- managed UUID moved elsewhere -> conflict;
- unknown text inside an owned legacy container -> conflict;
- unrelated natural child added/edited/reordered -> irrelevant.

## Graph IO contract

Graph IO may insert, update, move only when explicitly supported, or remove
blocks with registered managed UUIDs. It must never remove or reorder unknown
natural children. Each physical update/remove is preceded by a fresh read of
the exact managed UUID, and each effect is followed by bounded fresh readback.

Normal effects converge the whole current presentation from the resulting
semantic projection. This makes an old engineering presentation become Writing
Language v1 without a separate migration framework.

## Safe re-render

The maintenance command `Task Copilot vNext：重新渲染当前正式事项` performs:

```text
read current Kernel object/closure/anchor
  -> build expected semantic projection
  -> UUID-based semantic-equivalence check
  -> fail closed on value/topology conflict
  -> reconcile registered managed blocks to current renderer intents
  -> verified readback
  -> local presentation receipt/message
```

It creates no SemanticOperation, business Commit, WorkObject version, AgentRun,
or Proposal. A presentation-only label refresh is allowed. A user value edit,
missing required value, unknown owned legacy child, or simultaneous managed
change prevents overwrite.

## Failure and recovery

- Graph apply throw leaves the durable business Commit recoverable under the
  existing state machine.
- Partial presentation is detected by fresh readback and cannot be marked
  committed.
- A restarted Plugin reconstructs expected semantics and identity from the
  Kernel/Store, then resumes or verifies the durable Graph effect.
- Existing pending Commit recovery runs before explicit presentation refresh.
- The bounded legacy reader exists only for Phase 1–5 engineering projections;
  it does not become a general presentation-version framework.

## Natural source contract

The source block and all unknown descendants are user-owned. The only allowed
source mutation remains an existing governed marker transition such as
`TODO -> DONE` or `DONE -> TODO`. Presentation refresh never edits source text,
bulk-formats pages, or promotes natural blocks into formal objects.

Formalization itself may persist Logseq's native `id::` property on a file-graph
source before the Primary Anchor is created. Canonicalization removes that host
identity line, so the natural title/body and its semantic source hash are
unchanged. This is the sole machine-identity addition to the source.
