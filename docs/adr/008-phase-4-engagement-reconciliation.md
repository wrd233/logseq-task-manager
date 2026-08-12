# ADR 008: Phase 4 Engagement Reconciliation

Status: Accepted

## Context

An open WorkObject must distinguish work that can be acted on now from work blocked by an external prerequisite. This is formal state, not a label inferred from note text. The transition must remain evidence-bound, reversible, visible in Logseq, and subject to the same cross-medium commit rules as every other mutation.

## Decision

- Add the closed semantic operation `CHANGE_ENGAGEMENT`, limited to `ACTIONABLE ↔ WAITING`.
- Store one current `WaitingCondition` on the WorkObject. It includes `workObjectId`, a bounded description, Kernel-issued `since`, optional `reviewAt`, and one or more frozen Evidence IDs.
- Approve the immutable versioned `engagement-reconciliation/0.1.1` Skill and its exact content hash. `0.1.0` remains historical; the deterministic Fake Agent may emit only a LOW-risk Proposal for this operation or durable `NO_PROPOSAL`.
- Treat PARKED as a user investment decision. Agent output involving PARKED is invalid, not an Engagement proposal.
- Apply Engagement and the human-readable WaitingCondition atomically as one update to the stable managed state block through one `CHANGE_ENGAGEMENT_FIELDS` Graph effect; exact resulting-hash detection makes replay idempotent after response loss.
- Invalidate a proposal if target version, managed projection, Evidence digest, approved Skill, recovery state, or the target's Evidence watermark changed.
- Undo restores the exact prior WaitingCondition while advancing WorkObject version; history is never rewound.

## Consequences

The actionable query is precise: `OPEN + ACTIONABLE`. WAITING objects disappear immediately and return only after a committed reverse transition. A visible Logseq notification identifies the transition, reason, Evidence, and Undo route. Scheduling, reminders, review queues, PARKED transitions, and external model execution remain separate work.
