# P2-F cross-object observation — automated shadow contract

## Status

`SHADOW_CONTRACT_AUTOMATED / REAL_PROVIDER_QUALITY_GATE_OPEN / FRONTSTAGE_CLOSED`

This record establishes only the safety-bounded P2-F foundation. It does not claim that cross-
object observation is useful enough to show, that a Provider has produced a qualified observation,
or that P2-F or the overall UX productization Goal is complete.

## Implemented boundary

Application now accepts an optional, machine-validated batch of cross-object observation drafts
when computing the existing Attention shadow projection. A draft must contain:

- one of five fixed observation kinds;
- exactly 2–8 unique, versioned formal Object references;
- one explicit Object or Project read scope rooted in the subject set;
- 2–16 unique structured evidence facts;
- bounded confidence and exact Skill, Prompt and model provenance.

Unknown keys and frontstage prose fields are rejected. A draft cannot carry a summary, raw content,
reasoning, operation, Focus instruction or Ownership instruction. At most eight observations enter
one computation cycle.

Accepted drafts become only `LLM_CROSS_OBJECT` Attention signals with:

- `certainty=INFERENCE`;
- `visibility=SHADOW`;
- `interruption=NONE`;
- the existing cooldown and invalidation semantics;
- no Candidate, Proposal, Commit, Focus or Ownership write authority.

Existing deterministic due, Proposal and recovery signals retain priority over the LLM inference.
If any item makes the optional Provider-derived batch invalid, that batch fails closed while the
deterministic Attention baseline continues to compute.

## Plugin runtime and privacy

The Plugin session runtime can pass a defensively cloned observation batch into the detector. Its
telemetry remains count-only. The serialized shadow summary does not contain Object IDs, source
references, evidence fact codes, raw prose or Graph content.

There is no UI, persistence, Provider route or feedback control for this slice yet. Therefore no
new cross-object signal is visible to the user and no screenshot is current evidence for P2-F.

## Automated evidence

Focused and full checks on 2026-07-26:

- Application focused contract tests: `4/4` PASS;
- Application full suite: `168/168` PASS;
- Plugin full suite: `280/280` PASS;
- Application and Plugin typecheck: PASS;
- root `./scripts/check.sh`: PASS;
- rule coverage: `145`;
- recovery rehearsal: `PASS`, differences `[]`.

The tests prove exact-key and bounded-identity validation, duplicate rejection, prose/write-slot
rejection, invalid-batch isolation, deterministic-signal precedence and count-only Plugin
telemetry.

## Skill and next quality gate

`cross-object-observation` is a Skill candidate, not a formal Skill. The user requirement is to
derive a maintainable Skill from real golden-scenario experience rather than encode an untested
questionnaire or Prompt system.

The next gate must use sanitized, bounded Context Packages and the configured real Provider to
compare useful, uncertain, contradictory, no-observation and invalid-output cases. Only after the
model demonstrates low-noise evidence selection should the contract be promoted into a versioned
Skill and connected to a user-confirmed Candidate/Proposal path. Frontstage visibility remains
closed until that evidence exists.
