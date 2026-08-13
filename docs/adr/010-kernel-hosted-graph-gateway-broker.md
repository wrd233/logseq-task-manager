# ADR 010: Kernel-hosted Graph Gateway broker

Status: Accepted

## Decision

Use a loopback, Kernel-hosted, in-memory request broker. The Logseq Plugin actively heartbeats and polls it, executes bounded reads or Kernel-generated GraphEffects through the Logseq SDK, and returns typed results.

Use separate capabilities: the CLI descriptor carries the ordinary Kernel bearer; a distinct private Plugin descriptor carries the Graph proof key and bridge token.

## Consequences

- External Agents require no Plugin UI action during governance.
- The CLI never parses or writes Logseq Markdown and never receives Graph proof capability.
- The Plugin remains the production Graph Adapter; the Kernel remains the only Formal writer.
- Broker queues are intentionally non-durable. Before Commit preparation, offline work fails with no Ledger mutation. After preparation, existing Commit recovery is authoritative.
- Polling and delivery leases add small local latency but make response-loss retries bounded and idempotent.

Rejected: Agent filesystem writes, a second Plugin HTTP server, a durable Graph mirror, MCP as the Phase 6 foundation, and exposing raw GraphEffect execution to the CLI.
