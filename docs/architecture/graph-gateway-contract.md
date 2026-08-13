# Graph Gateway Contract

The Graph Gateway is a typed local bridge between the Kernel and the loaded Logseq Plugin. It is not a filesystem API and not a second Graph store.

Supported requests are bounded `SEARCH`, `READ_BLOCK`, `READ_PAGE`, `READ_EVIDENCE`, `READ_TARGET_SNAPSHOT`, and `APPLY_EFFECT`. Every request is bound to the connected Graph ID. The Plugin may execute only a Kernel-produced typed GraphEffect and must return a fresh verification snapshot.

The Plugin polls authenticated `/v1/graph-adapter/*` routes with a dedicated bridge capability. The ordinary CLI descriptor contains only the Kernel bearer token; `graphSnapshotKey` and bridge token live in a separate mode-`0600` Plugin descriptor. Public JSON responses expose none of them.

Heartbeat expiry reports `GRAPH_ADAPTER_OFFLINE`. Requests have a bounded timeout. An unacknowledged delivery is redelivered with the same request ID after a short lease, so idempotent Adapter effects converge after response loss. The broker itself is in-memory; durable recovery begins only after the Kernel prepares a Commit.

Search returns bounded snippets and content hashes. It does not dump a graph or establish Evidence. Evidence freeze always performs a fresh Plugin read, proof verification, Kernel SHA-256, and durable FrozenEvidence write.
