# Kernel API Contract

Current implementation: round 04, schema v23 (2026-10-02). This document owns the current HTTP submission and receipt semantics; the [state-machine guide](commit-state-machine.md) owns durable transitions. Historical ADRs and earlier acceptance records keep their original scope.

The service binds an ephemeral port on `127.0.0.1`. CLI and Plugin descriptors are atomically written with mode `0600`. The Plugin descriptor adds separate Graph snapshot, bridge and trusted USER-channel capabilities. Bearer authentication does not authorize a caller to impersonate USER, SYSTEM or AGENT, or manufacture trusted Evidence. Registered USER writes require the configured `USER/local-user` and the Plugin USER-channel capability; Agent writes must pass operation-specific Proposal/approved-Skill policy.

## Normal formal submissions

| Method | Path | Meaning / response |
| --- | --- | --- |
| POST | `/v1/commits/commit` | `commitFormal(operation, snapshot?)`; atomically establish formal current state, Commit/Ledger and a durable projection obligation; HTTP 200 formal receipt |
| POST | `/v1/proposals/:id/commit` | Apply Focus or Engagement through its exact operation policy; WorkIntent application rejects with `WORK_INTENT_USER_DECISION_REQUIRED`; same formal receipt; Proposal `APPLIED`, `appliedCommitId` and `ACCEPTED` Feedback are part of that transaction |
| POST | `/v1/commits/:id/undo/commit` | USER compensation with a stable new `operationId` and fresh snapshot; commit, compensation link, applicable Undo feedback and obligation are atomic |
| GET | `/v1/operations/:operationId/receipt` | `{receipt}` (accepted formal result or null); locate an accepted deterministic Commit after response loss |
| POST | `/v1/external/proposals/:id/commit` | Allowed external Focus/Engagement auto-apply; return committed business receipt and current `projectionObligation`, including pending/failed delivery |
| POST | `/v1/user-decisions/:id/execute` | Execute a previously compiled trusted USER decision; durable decision/package audit and business Commit share one transaction; repeat execution returns the same accepted result |

`FormalCommitResult` contains `commit`, `graphEffect`, and `projectionObligation`. `COMMITTED` means formal truth is accepted even if Graph delivery is `PENDING` or `FAILED`. Decision operations without a Graph effect can have a null obligation. It does not mean the Plugin has already displayed the new truth.

Generic USER operations include CREATE, Rename, WorkIntent and Closure under their exact policy. AGENT Focus/Engagement require Proposal-bound governance; direct AGENT WorkIntent is rejected. Complete/Cancel/Reopen/Amend reject AGENT and SYSTEM before business mutation. Parent closure rejects OPEN descendants. WorkIntent, ProjectIntent and Ownership remain USER-owned: external WorkIntent recommendations hand off a DecisionPackage and never gain automatic authority. The trusted event → compile → execute flow checks the exact normalized acknowledgment, immutable package revision, target versions and operation policy. The special reality-correction route remains a trusted USER operation.

A stable `operationId` identifies the original exact request. Repeating it returns the accepted receipt; different semantic input with that identity is rejected as `OPERATION_ID_REUSED`. Browser clients query the receipt after a transport/5xx failure. If both submission and receipt lookup are uncertain, `FormalOutcomeUnknownError` carries that operation ID: the Plugin retains the original request per Graph and retries it before reading a new business target. It does not roll back accepted facts or generate a fresh operation ID. Explicit 4xx rejection is reported as rejection. Executed USER decisions likewise resolve uncertainty by their durable decision ID.

Task commands capture Graph scope/generation and target before prompts, SDK/storage work and subsequent awaits. A → B → A invalidates an old generation. Accepted late results keep their Commit and obligation, report acceptance honestly, and cannot replace the new Graph's recent state. SDK state writes are serialized per scoped key. CREATE source restoration is allowed only before acceptance or after a definite rejection, while the original Graph and exact system-written source still match.

## Persistent Graph delivery

| Method | Path | Meaning |
| --- | --- | --- |
| POST | `/v1/commits/:id/projection/deliver` | Request the Service's shared persistent delivery drain, then return the current obligation; normal Plugin commands do not apply the effect themselves |
| GET | `/v1/projection-obligations` | Obligations, optionally filtered by status; history remains queryable after current-object deletion |
| GET | `/v1/projection-health` | Backlog, retry/degraded counts, oldest pending time and last error |
| POST | `/v1/commits/:id/projection/verify` | Trusted fresh result/snapshot; Kernel owns verification and transition |
| POST | `/v1/commits/:id/projection/failed` | Trusted failure report; unfinished obligations retain recoverable failure information |

One Service delivery instance is shared by normal requests, maintenance and external Agent auto-apply. Its drain is serialized and orders obligations by formal version within each target. An earlier unfinished/backoff/exhausted obligation blocks newer delivery for that target; another target may continue. Offline brokers do not consume an attempt. A real failed verification records its attempt once and throws a typed `ProjectionVerificationError`; delivery does not record it again. Restart retains attempt/backoff/exhaustion, effects and obligations. Exhaustion requires explicit intervention; there is no hidden forced success or source overwrite.

Ordinary transitions are `PENDING → FAILED → VERIFIED` or `PENDING → VERIFIED`. `APPLIED` remains an accepted historical/reserved enum, not a new normal intermediate write. Repeated VERIFIED reports are idempotent. A late ordinary failure cannot downgrade VERIFIED, change its attempt count or overwrite a newer result. An explicit new check/change creates its own work rather than reusing a late report.

Effects and results carry the same `commitId` and deterministic `effectId`. Updates carry expected and resulting hashes; CREATE carries the canonical source hash and owned projection identities, allowing response-loss retry of exact/partially written owned blocks while rejecting changed natural content and foreign managed blocks. Removal captures anchor/UUID/hash/ownership before deleting current state and verifies actual absence of all owned UUIDs through a fresh `removedProjection` proof. A generic empty projection is insufficient for formal removal. Natural source text and foreign blocks remain outside removal authority.

## Reads and bounded application writes

| Method / path | Result / responsibility |
| --- | --- |
| GET `/v1/status`, `/v1/objects`, `/v1/objects/actionable`, `/v1/objects/:id` | Service/schema status, formal objects, `OPEN + ACTIONABLE` objects, object and separate anchor |
| GET `/v1/objects/:id/closure`, `/v1/commits/:id`, `/v1/recovery` | Effective Closure and immutable history, retained Commit, deterministic historical recovery actions |
| GET `/v1/evidence/:id`, `/v1/agent-runs/:id`, `/v1/proposals/:id`, `/v1/feedback` | Frozen Evidence/digest, minimal run receipt, immutable revision and governance audit |
| GET `/v1/agent/bootstrap`, `/v1/skills/:id`, `/v1/taste`, `/v1/taste/:id` | Secret-free external capabilities and approved immutable Skill/Taste identities |
| GET `/v1/graph/status`, `/v1/agent-runs/:id/reads`, `/v1/curation-receipts` | Bridge availability, exploratory receipts distinct from Evidence, typed curation history |
| POST `/v1/evidence/freeze`, `/v1/external/evidence/freeze` | Fresh proof-bound Graph material frozen by Kernel |
| POST `/v1/agent-runs/current-focus`, `/v1/agent-runs/engagement`, external run start/finish | Bounded cognition with closed result types and approved authority |
| POST `/v1/proposals/:id/revisions`, `/:id/dismiss`, `/v1/feedback/strong-positive` | Explicit USER revision/rejection/positive feedback; no raw formal setter |
| Context / reading / Discovery / maintenance APIs | `ContextAssociations`, `UserReading` and Service coordinators own application state; HTTP compatibility remains, removed Kernel forwarding methods do not |
| POST `/v1/graph/search`, bounded block/page reads, `/v1/external/curation/add-reference` | Typed Graph reads and narrow anchored MiniProject reference curation; no generic Graph write |

There is no generic JSON Patch, SQL, table/database-path or arbitrary lifecycle-write API. Internal IO/programming failures retain server diagnostics and return an error; they are not represented as an inactive run, empty success or stale source merely to hide failure.

## Supported historical protocol

| Client / route | Remaining consumer / durable responsibility |
| --- | --- |
| `prepare`; POST `/v1/commits/prepare` | Supported old USER client: `KERNEL_APPLIED` + durable effect, HTTP 202; pending, not formal success |
| `applyProposal`; POST `/v1/proposals/:id/apply` | Supported old Focus/Engagement client; WorkIntent continues to require USER decision, with its existing rejection preserved |
| `prepareUndo`; POST `/v1/commits/:id/undo/prepare` | Supported old compensation client; shared validated Undo planner, historical persistence adapter |
| `complete`; POST `/v1/commits/:id/complete` | Old client and Plugin historical recovery; fresh Graph result/proof precedes finalization |
| `failGraphApply`; POST `/v1/commits/:id/graph-failed` | Old client / historical recovery failure, distinct from formal obligation failure |
| POST `/v1/external/proposals/:id/apply` | Old external synchronous apply/verify response retained; current CLI `proposal apply --wait` uses `/commit` |
| GET `/v1/recovery`; POST `/v1/recovery/:id/abort`, `/:id/verify` | PREPARED abort, idempotent effect resume, fresh verification and explicit manual reconciliation |

Public old request/response shapes are retained. Normal Plugin Task, Online DONE, Focus/Engagement, Undo, external auto-apply and background maintenance no longer use this prepare/apply/complete sequence. Formal preparation can itself leave `PREPARED` after a later transaction failure, so recovery is selected from durable state, never from the age/name of a caller. No historical rows are deleted or bulk promoted to COMMITTED.
