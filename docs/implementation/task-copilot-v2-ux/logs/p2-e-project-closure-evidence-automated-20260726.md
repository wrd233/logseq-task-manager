# P2-E Project Closure evidence draft — automated foundation

## Status

`IN_PROGRESS_AUTOMATED_EVIDENCE_MODEL`

This increment does not claim a user-visible Closure flow, a Provider result or Desktop acceptance.
It closes the first safety prerequisite: Closure must start from a bounded, deterministic evidence
projection instead of an empty form or model-authored facts.

## Implemented

`buildProjectClosureEvidenceDraft` reads only:

- one version-matched OPEN Project and its versioned Project interface;
- current formal Objects;
- direct Primary Ownership edges from that Project.

It projects:

- Objective text as original-goal candidates;
- AVAILABLE/ACCEPTED Deliverables and directly owned Outputs as deliverable candidates;
- directly owned Decisions;
- directly owned completed Task/MiniProject work;
- directly owned OPEN Task/MiniProject work with current Condition;
- every Objective as `NEEDS_USER_JUDGMENT`, preserving its declared success-evidence text;
- explicit user judgments still required for actual result, Objective disposition, legacy
  disposition, future summary, and any missing goal/Decision evidence;
- explicit unknowns instead of invented outcomes.

## Safety boundaries

- Association is never treated as Primary Ownership.
- Nested grandchildren are not silently promoted into Project evidence.
- Objective success-evidence text is not interpreted as an Objective completion state.
- Missing owned Objects, duplicate identities, stale versions, non-Project and non-OPEN targets fail
  closed.
- The result is `READ_ONLY_EVIDENCE_DRAFT`; it is not a Proposal, Review decision, Commit or formal
  Closure.
- No Graph or SQLite write path was added.

## Automated evidence

- focused evidence tests: `3/3`
- Application full suite: `164/164`
- Application typecheck: PASS

Cases include:

1. a Project with two Objectives, accepted/planned Deliverables, owned Output/Decision/completed
   MiniProject and WAITING Task;
2. an empty Project interface that must preserve unknowns;
3. stale, cross-type, completed, duplicate and missing-object fail-closed paths.

## Next vertical steps

1. expose the read-only evidence package through Local Service using only `objectId + expectedVersion`;
2. render one compressed user-facing evidence preview from the Project impact route;
3. reuse and version `design-project` rather than create a parallel prompt system;
4. call the real Provider only after the evidence preview is visible, then validate one exact HIGH
   Project Closure Proposal;
5. continue through Review, Commit, reload, Recovery and the existing lifecycle Undo boundary before
   P2-E can be DONE.
