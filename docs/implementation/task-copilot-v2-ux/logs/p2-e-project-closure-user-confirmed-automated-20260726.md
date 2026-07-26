# P2-E Project Closure user-confirmed Proposal — automated public route

## Status

`PUBLIC_USER_CONFIRMED_PROPOSAL_AUTOMATED / PLUGIN_AND_FORMAL_CHAIN_OPEN`

This increment closes the impossible Decision-ownership fixture in the public Proposal route. It
does not claim Plugin UI, Desktop, Review acceptance, Commit, Recovery or Undo.

## Implemented boundary

- The existing `POST /objects/:id/project-closure/proposal` accepts the expected Project version
  and an optional bounded set of session-only user judgments.
- The Service always rebuilds Closure evidence from SQLite and validates the judgments against the
  current Objective identities and unresolved formal work.
- The user confirms actual result, every Objective disposition, legacy handling, key Decisions and
  future re-entry summary. Missing/duplicate/unknown Objective identities, changed unresolved work,
  extra fields and oversized text fail closed.
- The Provider receives `USER_CONFIRMED_FOR_REVIEW`; its output must copy every confirmed field
  exactly. It may compress frontstage explanation, but it cannot reinterpret those judgments.
- The generated shape remains one PENDING/HIGH group, zero text patches and exactly
  `UPDATE_PROJECT_INTERFACE` plus `TRANSITION_LIFECYCLE(COMPLETED)`.
- No independent judgment record, Object mutation, Graph write or SemanticCommit occurs before the
  existing Review and dedicated Closure Commit.

## Automated evidence

- Provider contract test proves a legal evidence draft with no directly owned Decision can produce
  a validated review draft only after user confirmation.
- Mutation test proves a model rewrite of the confirmed actual result is rejected.
- Public Service integration uses a real Project interface plus a legally Project-owned Task:
  formal-only generation fails before Provider invocation; user-confirmed generation calls the
  Provider once and persists only one PENDING/HIGH Proposal.
- After the public request, the Project remains byte-for-byte unchanged and `OPEN`; the
  SemanticCommit list is unchanged.
- Focused Provider/live tests: `6/6` PASS.
- Focused public Service tests: `2/2` PASS.
- Local Service: `144/144` PASS.
- Service Client: `12/12` PASS.
- root `./scripts/check.sh`: PASS.
- rule coverage: `145`.
- recovery rehearsal: `differences: []`.

## Remaining

1. Plugin interaction for evidence reading and the minimum real judgments;
2. loading, Provider error, validator rejection, stale and retry;
3. compact final reading and navigation to the existing HIGH Review;
4. dedicated Commit, reload, injected failure, Recovery and Undo;
5. current Logseq Desktop evidence and screenshots from the visible-flow commit.
