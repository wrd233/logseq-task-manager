# P2-E Project Closure Provider — real model contract gate

## Status

`REAL_PROVIDER_MODEL_CONTRACT_PASS / PUBLIC_SERVICE_HAPPY_PATH_OPEN`

This is a sanitized, real-Provider quality gate. It is not Desktop evidence and does not claim a
public Service happy-path, Proposal persistence, Review, Commit, Recovery or Undo.

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

## Passing result

- Provider/model: `deepseek` / `deepseek-v4-flash`
- Attempts: `1`
- Provider duration: about `24.1 s`
- Tokens: prompt `3278`, completion `2583`, total `5861`
- Proposal: one HIGH group, zero text patches, four read targets, one Project modify target
- Operations: exactly `UPDATE_PROJECT_INTERFACE` + `TRANSITION_LIFECYCLE(COMPLETED)`
- Objective completion not inferred: PASS
- exact evidence grounding: PASS
- unresolved work retained: PASS
- frontstage machine identity absent: PASS
- Review remains required: PASS
- Graph writes: `0`
- formal Store writes: `0`

## Public-chain gap discovered

The current deterministic evidence draft expects directly owned Decision/Output candidates, but
the frozen V2 type matrix deliberately allows Primary Ownership only for work hierarchy objects:
Decision and Output have no allowed Primary Owner. A legal public command chain therefore cannot
produce the current Provider precondition.

The implementation must not widen Ownership merely to make this Gate pass. The next safe vertical
slice is a session-only user-confirmed Closure draft. Formal evidence remains candidate material;
the user confirms actual result, Objective disposition, legacy handling, key Decisions and future
summary; the Provider compresses those bounded inputs; only the resulting HIGH Proposal may enter
Review.

## Remaining

- public Service/session contract for user-confirmed judgments;
- Plugin loading/error/stale/NO_PROPOSAL and final reading;
- HIGH Review, accepted-not-applied, final Commit;
- injected failure, Recovery, reload and dedicated Undo;
- current Desktop screenshots on the commit that contains the visible Provider flow.
