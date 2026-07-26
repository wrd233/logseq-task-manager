# P2-E Project Closure Provider — real model contract gate

## Status

`REAL_PROVIDER_USER_CONFIRMED_MODEL_CONTRACT_PASS / PUBLIC_SERVICE_PROPOSAL_AUTOMATED`

This is a sanitized, real-Provider quality gate. The public Service user-confirmed Proposal path is
covered separately by automated integration evidence. This file is not Desktop evidence and does
not claim Plugin UI, Review, Commit, Recovery or Undo.

## Input and privacy boundary

- Provider: configured `deepseek-v4-flash` through the existing Keychain reference.
- Evidence: dedicated synthetic Project Closure evidence; no personal Graph content.
- The runner stores or prints no API key, raw Prompt, raw model response, Object text dump or hidden
  reasoning.
- Output is limited to model/version, duration/token counts, structural counts and quality booleans.
- The runner is opt-in; its default automated test proves Provider calls remain `0`.

## Real iterations

1. The first real response passed JSON and Proposal shape but was rejected by the new evidence
   Validator. The original combined rejection code was split into safe structural reason codes;
   no model text was logged.
2. The second real response passed exact scope, operations, goal, deliverable, Decision and
   Objective grounding, but dropped the exact unresolved-work identity. It was rejected before
   Review persistence with Graph and formal Store writes both `0`.
3. `design-project` was upgraded to `1.3.0`, and the runtime Prompt added a machine-readable
   `groundingContract`: exact original goal, allowed deliverables/Decisions, required incomplete
   Objectives and each exact legacy item. The third real response passed.
4. The synthetic fixture was then corrected to match the frozen V2 ownership matrix: it contains
   no directly Project-owned Decision. A bounded user-confirmation contract supplies the actual
   result, Objective disposition, legacy handling, key Decision and future summary. The fourth real
   response passed the same production Validator without changing any confirmed field.

## Passing result

- Provider/model: `deepseek` / `deepseek-v4-flash`
- Attempts: `1`
- Provider duration: about `22.6 s`
- Tokens: prompt `3500`, completion `2148`, total `5648`
- Proposal: one HIGH group, zero text patches, three read targets, one Project modify target
- Operations: exactly `UPDATE_PROJECT_INTERFACE` + `TRANSITION_LIFECYCLE(COMPLETED)`
- Objective completion not inferred: PASS
- exact evidence grounding: PASS
- unresolved work retained: PASS
- frontstage machine identity absent: PASS
- Review remains required: PASS
- Graph writes: `0`
- formal Store writes: `0`

## Public-chain conclusion

The frozen V2 type matrix deliberately allows Primary Ownership only for work hierarchy objects:
Decision and Output have no allowed Primary Owner. Ownership was not widened. The formal-only route
therefore still fails before the Provider when key Decision evidence is missing.

The public route now supports a bounded, version-bound, session-only user confirmation. Formal
evidence remains candidate material; the user confirms actual result, Objective disposition,
legacy handling, key Decisions and future summary; the Provider must copy those judgments exactly;
only the resulting HIGH Proposal may enter Review. Automated integration proves this route creates
no Commit or formal Object mutation.

## Subsequent closure

The visible normal chain was subsequently completed in real Logseq Desktop: user judgments, real
Provider loading, HIGH Review, final Commit, dedicated Closure Undo and Plugin reload. The current
Undo/reload evidence and exact commit authority are recorded separately in
`p2-e-project-closure-desktop-live-20260726.md`.

Remaining for the full P2-E slice:

- current-build Provider error/stale/NO_PROPOSAL Desktop evidence;
- injected Commit failure into `RECOVERY_REQUIRED`, resume of the original Commit, and reload;
- remaining Light/narrow visual gate.
