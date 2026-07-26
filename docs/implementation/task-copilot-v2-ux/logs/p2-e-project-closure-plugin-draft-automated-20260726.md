# P2-E Project Closure Plugin user-confirmed draft — automated

## Status

`PLUGIN_DRAFT_AUTOMATED / CURRENT_DESKTOP_AND_FORMAL_CHAIN_OPEN`

This increment makes the public user-confirmed Proposal route visible in the Plugin. It does not
claim current Desktop evidence, accepted Review, Commit, Recovery or Undo.

## User flow

1. Open an `OPEN` Project and choose `整理 Closure 证据`.
2. Read deterministic goal, deliverable, completed-work, unresolved-work and unknown sections.
3. Confirm only evidence-dependent judgments: actual result, each current Objective disposition,
   legacy handling, key Decisions and the future re-entry summary.
4. Use the one primary action `整理为待确认的关闭建议`.
5. The Provider may compress the explanation but must preserve every confirmed judgment exactly.
6. A validated result routes directly to the existing `待我确认` HIGH Review; Project and Graph
   remain unchanged.

## Interaction boundary

- Objective inputs are generated from current formal Objective count and show text/evidence, not
  internal IDs.
- `INCOMPLETE` is the conservative default; completion is never inferred from success-evidence
  wording.
- Unresolved work is prefilled into legacy handling and cannot be silently removed.
- Provider unavailable, duplicate submission, `NO_PROPOSAL`, stale evidence and Validator rejection
  have bounded user messages in the same dialog.
- User input remains session-only and is preserved across validation/Provider failures; cancel,
  Graph switch and Service restriction clear it.
- Provider responses, error codes, Object IDs, scope hashes and API credentials are not shown in
  frontstage text.
- The Plugin performs one preflight Object read. After submission it trusts the Service's
  post-Provider evidence/version revalidation and atomic Proposal result; it does not add an
  ambiguous post-persistence read.

## Automated evidence

- Closure input and error projection: `3/3` PASS.
- Full Plugin suite: `278/278` PASS.
- Plugin typecheck and build: PASS.
- root `./scripts/check.sh`: PASS.
- rule coverage: `145`.
- recovery rehearsal: `differences: []`.

## Remaining

1. current Logseq build and screenshot chain;
2. real Plugin → public Service → DeepSeek → HIGH Review;
3. Review accept, dedicated Project Closure Commit and reload;
4. injected Commit interruption, Recovery and reload;
5. dedicated safe Undo conclusion and return to the correct business origin.
