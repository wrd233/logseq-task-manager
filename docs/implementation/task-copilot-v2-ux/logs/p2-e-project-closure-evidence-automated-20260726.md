# P2-E Project Closure evidence draft — automated foundation

## Status

`IN_PROGRESS_AUTOMATED_READ_ONLY_PREVIEW`

This increment does not claim a Provider result, formal Closure flow or Desktop acceptance. It
closes the first user-facing prerequisite in automated evidence: Closure starts from a bounded,
deterministic projection and can be reviewed as a read-only preview instead of an empty form or
model-authored facts.

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

## Service and Plugin preview

- Local Service exposes `POST /objects/:id/project-closure/evidence`.
- The request accepts exactly `expectedVersion`; the client cannot inject a result, disposition,
  legacy plan or narrative.
- The route re-reads current SQLite authority and returns the Application-owned draft.
- The Project impact router exposes `整理 Closure 证据`.
- The preview separates source-backed candidates, unresolved work, per-Objective judgment,
  explicit unknowns and the remaining user decisions.
- The preview has no Proposal, accept, Commit or lifecycle-completion action. Cancellation clears
  the session-only package; Graph switch and restricted Service state also clear it.

## Automated evidence

- focused evidence tests: `3/3`
- Application full suite: `164/164`
- Application typecheck: PASS
- Local Service full suite: `136/136`
- Plugin full suite: `275/275`
- Plugin typecheck: PASS
- Service Client full suite: `12/12`

Cases include:

1. a Project with two Objectives, accepted/planned Deliverables, owned Output/Decision/completed
   MiniProject and WAITING Task;
2. an empty Project interface that must preserve unknowns;
3. stale, cross-type, completed, duplicate and missing-object fail-closed paths.

## Next vertical steps

1. install the current build and record the Project impact route plus read-only evidence preview in
   current Logseq Desktop;
2. reuse and version `design-project` rather than create a parallel prompt system;
3. call the real Provider only after the evidence preview is visible, then validate one exact HIGH
   Project Closure Proposal;
4. continue through Review, Commit, reload, Recovery and the existing lifecycle Undo boundary before
   P2-E can be DONE.
