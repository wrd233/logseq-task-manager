# P2-F cross-object observation — real Provider shadow quality gate

## Status

`REAL_PROVIDER_REPEAT_QUALITY_GATE_PASS / SHADOW_ONLY / FRONTSTAGE_CLOSED / SKILL_CANDIDATE`

This gate validates a bounded model seam and five sanitized golden scenarios. It does not claim
that P2-F is complete, that the observations are ready for daily display, or that a formal Skill,
Candidate, Proposal or feedback flow exists.

## Environment and privacy

- Branch: `feature/task-copilot-mvp`
- Provider: configured `deepseek-v4-flash`
- Credential: existing macOS Keychain reference only
- Evidence source: five sanitized synthetic Context Packages
- Authority: read-only Provider generation into session Attention shadow
- Stored output: structural report only; no Prompt, raw model response, object summary, API key,
  descriptor token or personal Graph content
- Formal impact: Graph writes `0`, formal Store writes `0`

## Machine-owned seam

The Service constructs and validates:

- 2–8 versioned formal Object refs;
- one explicit Object or Project scope;
- 2–16 structured evidence facts with opaque selectable keys;
- Context Package timestamp and exact schema;
- Skill-candidate, Prompt and actual Provider provenance.

The model can only return:

- `OBSERVATIONS` or `NO_OBSERVATION`;
- one fixed observation kind;
- known subject refs including the machine scope root;
- known evidence keys;
- an optional primary subject.

It cannot return prose, reasoning, scope, provenance, confidence, actions or writes. Confidence was
initially model-selected during the exploratory run, but a real invalid value exposed that this
would let the model influence later visibility. The contract was tightened: Association and
Ownership candidates are machine-fixed to `LOW`; the other current kinds are machine-fixed to
`MEDIUM`; the Provider cannot produce `HIGH`.

## Golden scenarios

The evaluator's expected result is not included in the Prompt.

| Case | Required result | Real result |
|---|---|---|
| `task-cluster` | grounded Task cluster observation | `TASK_CLUSTER_CANDIDATE` |
| `legacy-handoff` | unfinished work after Project completion | `LEGACY_HANDOFF_CANDIDATE` |
| `interface-stale` | formal evidence contradicts current interface | `PROJECT_INTERFACE_STALE_CANDIDATE` |
| `unrelated-work` | surface term match is insufficient | `NO_OBSERVATION` |
| `ownership-conflict` | conflicting owner evidence must not choose | `NO_OBSERVATION` |

Final structural report:

```json
{
  "status": "PIPELINE_PASS",
  "gate": "SHADOW_MODEL_QUALITY",
  "provider": "deepseek",
  "actualModels": ["deepseek-v4-flash"],
  "caseCount": 5,
  "observationCount": 3,
  "abstentionCount": 2,
  "attempts": 5,
  "durationMs": 28635,
  "promptTokens": 3181,
  "completionTokens": 2297,
  "totalTokens": 5478,
  "graphWrites": 0,
  "formalStoreWrites": 0
}
```

Two complete reruns used the same answer-free contexts and production Validator:

| Run | Cases | Observations | Abstentions | Duration | Tokens | Result |
|---|---:|---:|---:|---:|---:|---|
| A | 5 | 3 | 2 | 28,635 ms | 5,478 | PASS |
| B | 5 | 3 | 2 | 36,678 ms | 6,743 | PASS |
| C | 5 | 3 | 2 | 17,831 ms | 4,521 | PASS |

Aggregate: `15/15` case-runs, 9 grounded observations, 6 deliberate abstentions, 83,144 ms
Provider time and 16,742 tokens. Decision kind, required subjects/evidence and abstention behavior
were identical in all three passing runs; output token usage varied but did not change the bounded
result.

## Exploratory failures and improvement

The real sequence intentionally kept the production Validator active:

1. an early output failed the exact JSON shape;
2. a later legacy-handoff output used an invalid confidence value;
3. another task-cluster output failed evidence selection validation;
4. after diagnostics were split into structural codes and confidence authority moved to the
   machine, the complete 5-case run passed.

Every failed run stopped before Attention materialization and before any write. Only case IDs and
structural error codes were printed. Raw failed outputs were not logged or committed.

Automated verification after the live run:

- Provider seam and live evaluator focused tests: `8/8` PASS;
- Local Service full suite: `152/152` PASS;
- Local Service typecheck: PASS;
- root `./scripts/check.sh`: PASS;
- rule coverage: `145`;
- recovery rehearsal: `PASS`, differences `[]`.

## Current conclusion

This is enough to promote P2-F from “automated contract only” to “real Provider repeat quality gate
pass for the first bounded sample”. It is not enough to make a formal Skill or show observations
to the user. The current Prompt/provenance remains
`cross-object-observation-candidate@0.1.0-experimental`.

Before frontstage opening, the next evidence should add repeated runs, changed/stale context,
Provider invalid/timeout, reload/recompute, disposition/cooldown and user feedback. A later formal
Skill should preserve the machine-owned confidence decision and must not become a fixed
questionnaire.
