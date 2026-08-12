# Phase 4 Engagement Governance

Phase 4 adds exactly one new autonomous operation: `CHANGE_ENGAGEMENT`. It reconciles an explicit current WorkObject between `ACTIONABLE` and `WAITING`; it does not rename, close, cancel, park, retarget, or patch arbitrary fields.

## State and invariants

`WaitingCondition` is current-state data on the WorkObject:

```text
workObjectId, description, since, reviewAt, evidenceIds
```

`WAITING` requires a condition and frozen Evidence. `ACTIONABLE` requires `waitingCondition = null`. The Kernel owns `since`; descriptions are trimmed and capped at 200 characters; `reviewAt` must be an ISO timestamp when present. SQLite schema v3 adds only `waiting_condition_json` and the deterministic Waiting projection UUID. No duplicate waiting-history table exists because Commit, Proposal, AgentRun, and Feedback records already preserve the transition history.

The actionable read is `lifecycle = OPEN AND engagement = ACTIONABLE`. Entering WAITING removes the object in the same committed transition; leaving WAITING returns it.

## Governed path

1. The Plugin uses the explicit current formal object and selected Logseq block.
2. The Graph Adapter signs a fresh canonical read; the Kernel freezes it as Evidence.
3. `engagement-reconciliation/0.1.0` constrains the Fake Agent to direct external prerequisites and explicit resolution facts.
4. The Kernel persists the complete AgentRun and either `NO_PROPOSAL` or one LOW Proposal revision.
5. Apply revalidates target version, projection hash, Evidence digest, target Evidence watermark, exact Skill tuple, configured Agent, contract version, and empty recovery queue.
6. One `CHANGE_ENGAGEMENT_FIELDS` effect updates the state field and creates/removes the stable managed Waiting field. Only a fresh readback can commit.
7. `ACCEPTED` is written after commit; compensation Undo writes `UNDONE_AFTER_APPLY` and restores the exact previous condition with a new version.

The Fake Agent is a deterministic fixture executor for this release. Ordinary plans, user-side prerequisites, ambiguous statements, unresolved WAITING text, and parking language produce `NO_PROPOSAL`. There is no keyword-driven production classifier.

## Graph projection

WAITING is deliberately visible:

```text
状态：OPEN · WAITING
等待：等待网络组分配 VLAN 和网关信息
task-copilot-waiting-subject:: <work-object-id>
task-copilot-waiting-since:: <kernel-time>
task-copilot-waiting-evidence:: ["<evidence-id>"]
```

`reviewAt`, when supplied by an authorized semantic operation, adds `复查：...`. Phase 4 does not invent review dates or run a scheduler. Returning to ACTIONABLE removes only this owned Waiting field; the natural record and unrelated blocks are untouched.

## Failure boundary

Malformed/PARKED Agent output creates a durable FAILED AgentRun and no proposal. Stale target, projection, Evidence, or Evidence watermark invalidates the proposal before mutation. A transient Graph throw leaves `KERNEL_APPLIED` resumable; an ownership/hash conflict becomes `RECOVERY_REQUIRED`. No later semantic write or unsafe Undo may pass while the durable state and Graph disagree.
