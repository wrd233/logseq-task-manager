# P2-A Grill Turn Contract — Automated Evidence — 2026-07-24

## Scope

This gate covers only the pure Application contract for one bounded MiniProject or Project Grill turn.
It is not evidence for a Local Service route, real Provider quality, a multi-turn user session, a
Structure Preview, Proposal/Commit/Undo, or Logseq Desktop UX.

## Authority boundary

- Source facts retain bounded references and a machine source fingerprint.
- Uncertainties are material-specific and classified as outcome, boundary, completion evidence, or
  unclassified material; they are not a fixed form field sequence.
- Machine logic selects the largest open uncertainty and owns the stop condition.
- Model output is materialized as `SESSION_DRAFT_ONLY`; it cannot emit Proposal operations, formal
  writes, object identity prose, Focus changes, or Ownership changes.
- Unknown fact IDs, closed/unknown uncertainties, invented evidence, unsupported fields, premature
  readiness, and a continuation without an evidence-backed recommendation and tradeoff fail closed.

## Commands and results

Using the repository-supported Node 20 runtime:

```text
npx tsx --test packages/application/tests/grill-session.test.ts
4 tests, 4 passed, 0 failed, 0 skipped

npm run typecheck --workspace @task-copilot/application
PASS
```

The Application workspace has no standalone `lint` script. The root `./scripts/check.sh` remains the
authoritative repository gate and is recorded separately after the full change set.

## Remaining gates

1. Build the bounded source-tree Context Package and uncertainty authority from formal facts.
2. Add versioned Service/Provider prompt and strict route validation without persisting prompt or raw
   response.
3. Prove answer-to-authority evolution across multiple turns and stale/reload behavior.
4. Produce a final reading preview, then hand off only through existing Proposal Review and one
   recoverable Commit/Undo path.
5. Validate real DeepSeek content quality and Logseq Desktop loading/error/stale/return-to-work flow.
