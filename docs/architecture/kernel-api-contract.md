# Kernel API Contract

The service binds an ephemeral port on `127.0.0.1`. It atomically writes a mode-`0600` descriptor containing schema version, loopback base URL, a random 256-bit bearer token, a distinct random 256-bit Graph-snapshot capability, PID, and start time. Network authentication is separate from domain authorization: generic semantic preparation accepts only the configured `USER/local-user`; possession of the bearer token alone cannot claim `SYSTEM`, `AGENT`, another user ID, or fabricate trusted Evidence. The Logseq Graph Adapter uses the second capability only to authenticate its fresh block read; the Kernel verifies the proof before freezing or rechecking Evidence. The separate current-focus Proposal endpoint supplies persisted governance proof and does not trust an actor supplied by the caller.

## Read API

| Method | Path | Result |
| --- | --- | --- |
| GET | `/v1/status` | Kernel/schema/PID status |
| GET | `/v1/objects` | Formal WorkObjects |
| GET | `/v1/objects/:id` | WorkObject and separate PrimaryAnchor |
| GET | `/v1/commits/:id` | Structured Ledger entry |
| GET | `/v1/recovery` | Non-terminal commits and deterministic recovery action |
| GET | `/v1/evidence/:id` | Frozen Evidence and strong digest |
| GET | `/v1/agent-runs/:id` | Minimal AgentRun receipt without hidden reasoning |
| GET | `/v1/proposals/:id` | Proposal plus immutable latest revision |
| GET | `/v1/feedback` | Accepted/modified/rejected/undone feedback events |

## Write API

| Method | Path | Meaning |
| --- | --- | --- |
| POST | `/v1/commits/prepare` | Revalidate a registered semantic operation and exact Graph snapshot; durably reach `KERNEL_APPLIED` and return a typed Graph effect with HTTP 202 |
| POST | `/v1/commits/:id/complete` | Record Graph result, verify a fresh snapshot, and only then return `COMMITTED` |
| POST | `/v1/commits/:id/undo/prepare` | Re-read the current projection precondition and create a new compensation Commit |
| POST | `/v1/recovery/:id/abort` | Abort a durable `PREPARED` commit that made no current-state change |
| POST | `/v1/recovery/:id/verify` | Finish a recovered `GRAPH_APPLIED` commit from fresh Graph state |
| POST | `/v1/evidence/freeze` | Verify a proof-bound fresh canonical block read from the Graph Adapter, freeze it, and compute SHA-256 in the Kernel |
| POST | `/v1/agent-runs/current-focus` | Run the configured Fake Agent against one target and frozen Evidence |
| POST | `/v1/proposals/:id/apply` | Revalidate and auto-prepare one LOW `SET_CURRENT_FOCUS` Proposal |
| POST | `/v1/proposals/:id/revisions` | User replaces an open suggestion with a new immutable revision and `MODIFIED` feedback |
| POST | `/v1/proposals/:id/dismiss` | User dismisses an open Proposal and records `REJECTED` feedback |
| POST | `/v1/commits/:id/graph-failed` | Persist a reported Adapter failure; transient errors remain resumable, conflicts become `RECOVERY_REQUIRED` |

There is no generic update, JSON Patch, SQL, table, database-path, or raw Graph-write API. `CREATE_WORK_OBJECT`, `RENAME_WORK_OBJECT`, `SET_CURRENT_FOCUS`, and the dedicated compensation entry point are the only registered write contracts. `SET_CURRENT_FOCUS` is accepted for an Agent only through the Proposal endpoint. Caller-supplied preconditions are accepted only when they exactly equal the derived semantic preconditions.

Every Graph effect and apply result carries the originating `commitId` and deterministic `effectId`. Update effects carry both the expected current projection hash and resulting projection hash, so a Graph edit between prepare and apply fails closed.

The prepare response is explicitly pending Graph work. `KERNEL_APPLIED` is never returned as business success. Create, Rename, and Current Focus support Undo through a new compensation Commit; field compensation restores the prior value with a new, monotonic WorkObject version rather than rewinding history.
