# ADR 011: Composite MiniProject Governance Skill

Status: Accepted (Phase 7)

## Decision

`miniproject-governance@0.1.0` is a versioned `READ_ONLY_COMPOSITE` cognition package. It defines Material Scope, seven health dimensions, ephemeral Working Model, Grill policy, stop policy, continuous-apply policy, structural boundaries, and Taste priority. It has no generic mutation authority.

The composite run may diagnose and return exactly one narrow Formal change request, but it is not the mutation Skill recorded by that Proposal. `SET_CURRENT_FOCUS` delegates to approved `current-focus-maintenance@0.1.0`; `UPDATE_WORK_INTENT` delegates to approved `work-intent-maintenance@0.1.0`. The AgentRun retains the composite Skill and Taste identity, while the Proposal/Semantic Commit retains the delegated operation Skill. Natural curation uses separately typed `ADD_REFERENCE`. Split, merge, kind, ownership, PARKED, Closure, and history moves return `BOUNDARY_REVIEW` only.

## Why

The existing registry binds a Skill to a closed result contract. Turning it into a workflow engine or generic patch surface would erase the Phase 3–6 trust boundary. Separating the composite cognition identity from the two narrow mutation identities makes the authority boundary machine-verifiable without creating a Super Skill.

The Working Model remains Agent-local and ephemeral. Only AgentRun, Proposal/Commit, CurationReceipt, Feedback, and a lightweight `governanceCorrelationId` persist.
