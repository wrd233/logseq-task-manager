# ADR 012: Sparse Formal WorkIntent

Status: Accepted (Phase 7)

## Decision

Formal `MINI_PROJECT` adds only `desiredOutcome: string | null` and `completionChecks: string[]`. Null and empty are valid. Creation does not synthesize either field or render empty sections.

`UPDATE_WORK_INTENT` is a closed, Evidence-bound, LOW-risk Agent-governed operation. It requires the exact WorkObject version and managed projection hash, produces a deterministic `UPDATE_WORK_INTENT_FIELDS` GraphEffect, verifies readback, records the real `AGENT` actor, and supports compensation Undo and normal recovery.

Stable PrimaryAnchor UUIDs identify `[核心输出]` and `[完成标准]`; labels remain presentation. Completion checks use one sparse presentation block while the ordered list remains SQLite-authoritative.

## Rejected

No generic patch and no Formal background, currentState, resources, deliverables, result, risk, stakeholder, priority, or Project governance fields.
