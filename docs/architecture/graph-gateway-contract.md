# Graph Gateway Contract

The Graph Gateway is a typed local bridge between the Kernel and the loaded Logseq Plugin. It is not a filesystem API and not a second Graph store.

Supported requests are bounded `SEARCH`, `READ_BLOCK`, `READ_PAGE`, `READ_EVIDENCE`, `READ_TARGET_SNAPSHOT`, `APPLY_EFFECT`, `READ_CURATION_SNAPSHOT`, and `APPLY_CURATION`. Every request is bound to the connected Graph ID. Formal writes remain Kernel-produced typed GraphEffects. Natural curation is limited to closed `ADD_REFERENCE`; no request accepts raw Markdown, arbitrary block update, SQL, file paths, or generic patches.

The Plugin polls authenticated `/v1/graph-adapter/*` routes with a dedicated bridge capability. The ordinary CLI descriptor contains only the Kernel bearer token; `graphSnapshotKey` and bridge token live in a separate mode-`0600` Plugin descriptor. Public JSON responses expose none of them.

Heartbeat expiry reports `GRAPH_ADAPTER_OFFLINE`. Requests have a bounded timeout. An unacknowledged delivery is redelivered with the same request ID after a short lease, so idempotent Adapter effects converge after response loss. The broker itself is in-memory; durable recovery begins only after the Kernel prepares a Commit.

Search returns bounded snippets and content hashes. It does not dump a graph or establish Evidence. Evidence freeze always performs a fresh Plugin read, proof verification, Kernel SHA-256, and durable FrozenEvidence write.

`ADD_REFERENCE` first reads the exact anchored root and direct-child topology, binds content/topology hashes, validates the reference and section identities, applies at most a section plus block-reference insertion, and returns a fresh snapshot. The coordinator persists a separate `CurationReceipt` only after source preservation and readback verification. Conflicts fail closed and never become Formal Semantic Commits.
