# ADR 0012: Creation Session tree canonicalization and bounded settle

Status: Accepted (2026-08-02)

## Context

The real Logseq Desktop MiniProject creation transaction prepared a deterministic
`CREATION_SESSION_V1` tree, wrote it, and then failed the exact after-tree
verification even though every fixture passed. Structured evidence from the
original accepted plan showed:

```text
expected afterHash (Draft sibling orders 1..8) = 8b6970e5
actual read-back hash (array indexes 0..7)     = 9f2abdfa
canonical rank hash                            = 9f2abdfa
```

The Provider Draft may assign sibling `order` values with any base (0..255,
unique per parent), while the Logseq runtime read-back assigns array indexes
starting at zero. Both carry the same relative sibling order, but the tree hash
included the raw `order` values, so the expected and actual sides disagreed by
construction on every real run.

## Decision

1. **Versioned canonical sibling order.** A canonicalizer
   (`task-copilot-creation-tree-canonical-v1`) re-ranks siblings per parent by
   `(order, blockUuid)` to zero-based ranks. `creationSessionMiniTreeHash`
   hashes canonical ranks. Relative sibling order, parent relations, content
   hashes and deterministic Block identities remain exact.
2. **Frozen legacy hash.** `creationSessionMiniTreeHashLegacyOrder` preserves
   the pre-canonicalization raw-order hash only for recognizing ledger rows
   prepared before this ADR. `planCreationSessionMiniGraph` can be called with
   `{ canonicalSiblingOrder: false }` for that recognition; the graph plan
   returned to clients is always canonical.
3. **Legacy ledger tolerance.** MiniProject prepare/finalize accept stored step
   hashes that match either the canonical plan or the frozen legacy plan, so an
   interrupted pre-ADR transaction can still be resumed/compensated through the
   same Proposal and SemanticCommit authority. No data is cleared or replayed
   under a different identity.
4. **Bounded settle.** After a Graph write, the exact after-tree read uses at
   most five attempts with 100/200/400/800 ms backoff (total < 2 s), recording
   per-attempt structure hash, attempt count and settle duration. Timeout
   remains fail-closed with the structural mismatch diagnostic.
5. **Project Page settle.** The independent Project Page exact tree read uses
   the same bounded settle before Domain finalization and before deletion on
   Undo.
6. **Sanitized mismatch diagnostics.** Verification failures emit
   `mismatchRule`, expected/actual node counts, short stable hashes for
   missing/unexpected/parent/order/UUID/content mismatches, preorder short
   hashes, expected/actual tree hash, normalization version, read attempt and
   settle duration. User content is never included.

## Compatibility and failure policy

Existing completed/undone MiniProject transactions remain readable through the
shared ledger; undo plans are rebuilt canonically on both sides. The old
PENDING creation transaction observed in the real environment was resumed
successfully with the same Proposal and completed; afterwards it was undone and
re-verified. No second write kernel, relaxed verification, or silent
order-insensitive comparison was introduced.
