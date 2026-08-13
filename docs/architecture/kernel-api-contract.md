# Kernel API Contract

The service binds an ephemeral port on `127.0.0.1`. It atomically writes a mode-`0600` CLI descriptor containing schema version, loopback base URL, a random 256-bit bearer token, PID, and start time. A separate mode-`0600` Plugin descriptor carries the distinct Graph-snapshot and Graph-bridge capabilities. Network authentication is separate from domain authorization: generic semantic preparation accepts only the configured `USER/local-user`; possession of the bearer token alone cannot claim `SYSTEM`, `AGENT`, another user ID, or fabricate trusted Evidence.

## Read API

| Method | Path | Result |
| --- | --- | --- |
| GET | `/v1/status` | Kernel/schema/PID status |
| GET | `/v1/objects` | Formal WorkObjects |
| GET | `/v1/objects/actionable` | `OPEN + ACTIONABLE` WorkObjects only |
| GET | `/v1/objects/:id` | WorkObject and separate PrimaryAnchor |
| GET | `/v1/objects/:id/closure` | Current effective Closure plus immutable completion, cancellation, amendment, and reopen history |
| GET | `/v1/commits/:id` | Structured Ledger entry |
| GET | `/v1/recovery` | Non-terminal commits and deterministic recovery action |
| GET | `/v1/evidence/:id` | Frozen Evidence and strong digest |
| GET | `/v1/agent-runs/:id` | Minimal AgentRun receipt without hidden reasoning |
| GET | `/v1/proposals/:id` | Proposal plus immutable latest revision |
| GET | `/v1/feedback` | Accepted/modified/rejected/undone feedback events |
| GET | `/v1/agent/bootstrap` and `/v1/skills/:id` | Secret-free External Agent capabilities and approved Skill |
| GET | `/v1/taste` and `/v1/taste/:id` | Active/provisional immutable Taste identity and content hash |
| GET | `/v1/graph/status` | Background Graph Adapter availability |
| GET | `/v1/agent-runs/:id/reads` | Exploratory ReadReceipts, separate from Evidence |
| GET | `/v1/curation-receipts` | Compact typed natural-curation receipts, optionally filtered by object |

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
| POST | `/v1/agent-runs/engagement` | Run the configured Engagement Fake Agent against one target and frozen Evidence |
| POST | `/v1/proposals/:id/apply` | Dispatch by closed revision type and revalidate one LOW `SET_CURRENT_FOCUS`, `CHANGE_ENGAGEMENT`, or `UPDATE_WORK_INTENT` Proposal |
| POST | `/v1/proposals/:id/revisions` | User replaces an open suggestion with a new immutable revision and `MODIFIED` feedback |
| POST | `/v1/proposals/:id/dismiss` | User dismisses an open Proposal and records `REJECTED` feedback |
| POST | `/v1/commits/:id/graph-failed` | Persist a reported Adapter failure; transient errors remain resumable, conflicts become `RECOVERY_REQUIRED` |
| POST | `/v1/graph/search`, plus bounded block/page reads | Broker typed Graph reads through the Plugin |
| POST | `/v1/external/evidence/freeze` | Fresh Plugin read, proof verification, and Kernel Evidence freeze |
| POST | `/v1/external/agent-runs/start` and `/:id/finish` | Start/finish cognition performed by an `EXTERNAL_CLI` executor |
| POST | `/v1/external/proposals/:id/apply` | Revalidate and synchronously wait for background Plugin apply/verify |
| POST | `/v1/external/curation/add-reference` | Add one verified block reference under an anchored MiniProject resource/deliverable section |
| POST | `/v1/feedback/strong-positive` | Explicit local USER signal for an already committed governed change; optional bounded comment |

There is no generic update, lifecycle setter, JSON Patch, SQL, table, database-path, or raw Graph-write API. The registered writes are `CREATE_WORK_OBJECT`, `RENAME_WORK_OBJECT`, the governed Agent operations `SET_CURRENT_FOCUS`, `CHANGE_ENGAGEMENT`, and `UPDATE_WORK_INTENT`, and the user-only Task operations `COMPLETE_WORK_OBJECT`, `CANCEL_WORK_OBJECT`, `REOPEN_WORK_OBJECT`, and `AMEND_CLOSURE`, plus the dedicated compensation entry point. Agent operations are accepted only through Proposal-bound governance. `UPDATE_WORK_INTENT` additionally requires one Formal MiniProject, the read-only composite run, narrow mutation Skill, active Taste, correlation, and Evidence. Closure operations reject every AGENT and SYSTEM actor before Ledger or Closure mutation. Caller-supplied preconditions are accepted only when they exactly equal the derived semantic preconditions.

Every Graph effect and apply result carries the originating `commitId` and deterministic `effectId`. Update effects carry both the expected current projection hash and resulting projection hash, so a Graph edit between prepare and apply fails closed.

The prepare response is explicitly pending Graph work. `KERNEL_APPLIED` is never returned as business success. Create, Rename, Current Focus, WorkIntent, Engagement, and Task Closure support Undo through a new compensation Commit. WorkIntent compensation restores the exact nullable outcome and complete checks list. Closure compensation restores the exact prior lifecycle, Engagement, WaitingCondition, current focus, source marker, and effective managed Closure while preserving the original immutable Closure record as compensated history.
