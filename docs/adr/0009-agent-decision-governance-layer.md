# ADR-0009: Internal Agent Decision Governance Layer

- Status: accepted for implementation
- Date: 2026-08-02
- Goal: `docs/goal/agent-decision-governance/GOAL.md`

## Decision

Task Copilot adds an internal, fail-closed governance layer between bounded Logseq observation and the existing formal write kernel. The LLM may produce only a validated structured Decision recommendation. A versioned internal Skill constrains legal outcomes and maximum authority. A deterministic Risk Router computes effective authority from Skill maximum, local authorization, runtime mode, evidence, counter-signals, impact, reversibility and current versions.

The governance layer is not a second formal-state system. Formal Task Copilot changes continue exclusively through existing Application Commands, Proposal/Review where required, Semantic Commit, Audit, Undo and Recovery. External Agents retain the existing review-only contract and receive no apply/force route.

## Persistence

SQLite schema v13 adds four bounded governance tables: Decision aggregate, append-only important Decision events, Review Signals, and Rule Authorizations. Schema v14 adds one singleton governance-settings row for the user-controlled global write pause; it does not add a state machine or new authority. User Feedback is an important typed Decision event rather than a separate workflow table. Source text remains authoritative in Logseq; captured text is bounded evidence with retention, never a second live Graph projection.

Existing v12 databases require the accepted explicit snapshot/validation/ledger migration. Startup never silently upgrades. Governance data is Graph-scoped in the same database authority and is included in backup/Doctor/schema checks.

## Runtime

The observer consumes the existing `DB.onChanged` fact stream through an independently bounded latest-value queue. It reuses normalized Graph bridge reads and current Context Package ingredients. Failures, Provider outages, invalid Skill/output, pause or DEGRADED mode cannot block Logseq editing, Explicit Sync, Candidate/Proposal manual flows or existing UI.

EXPERIMENT is default and allows zero formal business writes. Guarded automation is compiled but disabled until explicit local authority and the real Shadow evidence gate exist. R3/high-impact changes never auto-apply.

## Consequences

- One additional schema migration and governance query surface are required.
- Decision evidence, token/context metrics, authorization and feedback become queryable without polluting Graph properties.
- UI can show a high-density supervision surface using current design tokens and progressive disclosure.
- The system can safely stop at `CONSOLIDATED_SHADOW_RUNTIME_CHECKPOINT` when real time/sample evidence is the only missing gate.

## Rejected alternatives

- Provider direct writes or an external Agent apply API.
- A second Candidate/Proposal/Commit or recovery implementation.
- Full-Graph scanning, persistent Graph cache, generic vector platform or Agent metadata in Block properties.
- Automatic local authority elevation from LLM output, Skill update or metrics.
- One table per conceptual noun without a demonstrated query/transaction need.
