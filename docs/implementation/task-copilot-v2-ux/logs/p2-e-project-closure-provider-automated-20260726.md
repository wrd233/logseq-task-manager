# P2-E Project Closure Provider gate — automated

> HISTORICAL FOUNDATION: this records the initial `design-project@1.2.0` shape gate. The current
> grounding contract and real-Provider conclusion use `design-project@1.3.0`; see
> `p2-e-project-closure-provider-live-20260726.md`.

## Status

`IN_PROGRESS_PROVIDER_GATE_AUTOMATED`

This increment does not claim a real DeepSeek result, Plugin Provider UI, Review, Commit, Recovery,
Undo or Desktop Provider flow.

## Implemented

- Reused the existing five-layer `LocalLlmProposalGenerator`; no parallel Provider or Proposal
  system was created.
- Upgraded `design-project` to `1.2.0` with evidence-candidate, NO_PROPOSAL, exact scope/operation
  and frontstage identity rules.
- Added `POST /objects/:id/project-closure/proposal` and a bounded Service Client method.
- The request accepts only `expectedVersion`; the Service rebuilds all evidence from SQLite.
- Missing original-goal, major-deliverable or key-decision evidence fails before any network call.
- A generated Proposal must retain the exact formal Object read scope, one Project modify target,
  one HIGH group, zero text patches and exactly Closure + COMPLETED on the same Object version.
- Project version and evidence-scope hash are rechecked after Provider completion and before Review
  persistence.

## Automated evidence

- prompt/scope/shape focused tests: `3/3`
- insufficient evidence route: Provider calls `0`, Proposal queue unchanged, Project OPEN
- Local Service: `140/140`
- Service Client: `12/12`
- root `./scripts/check.sh`: PASS
- rule coverage: `145`
- recovery rehearsal: `differences: []`

## Next gate

1. Prepare a rich, sanitized Project fixture with formal Objective, accepted/available Deliverable,
   directly owned Decision, completed work and unresolved work.
2. Run real `deepseek-v4-flash` through this exact route and assess evidence use, unknown handling,
   frontstage length and rejection reasons.
3. Add Plugin loading/error/stale/NO_PROPOSAL/Review navigation only after the real output contract
   proves useful.
4. Continue through HIGH Review, final Commit, injected failure/Recovery, reload and safe Undo before
   P2-E can be DONE.
