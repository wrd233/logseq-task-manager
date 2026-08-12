# Kernel API Contract

The service binds an ephemeral port on `127.0.0.1`. It atomically writes a mode-`0600` descriptor containing schema version, loopback base URL, random 256-bit bearer token, PID, and start time. Network authentication is separate from the actor carried by a semantic operation.

## Read API

| Method | Path | Result |
| --- | --- | --- |
| GET | `/v1/status` | Kernel/schema/PID status |
| GET | `/v1/objects` | Formal WorkObjects |
| GET | `/v1/objects/:id` | WorkObject and separate PrimaryAnchor |
| GET | `/v1/commits/:id` | Structured Ledger entry |
| GET | `/v1/recovery` | Non-terminal commits and deterministic recovery action |

## Write API

| Method | Path | Meaning |
| --- | --- | --- |
| POST | `/v1/commits/prepare` | Revalidate a registered semantic operation and exact Graph snapshot; durably reach `KERNEL_APPLIED` and return a typed Graph effect with HTTP 202 |
| POST | `/v1/commits/:id/complete` | Record Graph result, verify a fresh snapshot, and only then return `COMMITTED` |
| POST | `/v1/commits/:id/undo/prepare` | Re-read the current projection precondition and create a new compensation Commit |
| POST | `/v1/recovery/:id/abort` | Abort a durable `PREPARED` commit that made no current-state change |
| POST | `/v1/recovery/:id/verify` | Finish a recovered `GRAPH_APPLIED` commit from fresh Graph state |

There is no generic update, JSON Patch, SQL, table, database-path, or raw Graph-write API. `CREATE_WORK_OBJECT`, `RENAME_WORK_OBJECT`, and the dedicated compensation entry point are the only registered first-slice write contracts. Caller-supplied preconditions are accepted only when they exactly equal the derived semantic preconditions.

The prepare response is explicitly pending Graph work. `KERNEL_APPLIED` is never returned as business success.
