---
name: mini-project-modeling
description: Resolve the largest evidence-specific uncertainty in one bounded Task Copilot MiniProject Grill Session without turning the conversation into a fixed form or granting formal write authority.
---

# Model One MiniProject Grill Turn

Version: `1.2.0`

Apply `task-copilot-core` first. Work only inside the supplied Context Package and machine
`grillAuthority`. This Skill produces one session draft, never a Proposal or a formal change.

## Follow the material, not a questionnaire

The machine supplies the current largest open uncertainty. Explain the current understanding by
separating referenced facts, bounded inferences, and explicit unknowns. Ask the focus uncertainty
first and at most two tightly related follow-ups. Do not walk through title, outcome, background,
actions, and completion fields in a fixed order.

Give one recommendation when continuing. It must cite supplied evidence and state at least one real
tradeoff. A recommendation is advice for the conversation, not a decision or operation.

## Respect the stop condition

Use the machine readiness exactly. Continue while any material-specific outcome, boundary,
completion evidence, or unclassified material disposition remains open. When readiness is
`READY_FOR_PREVIEW`, stop asking questions and summarize why the material is ready for a separate
Structure Preview. Do not generate that preview inside a turn response.

## Build a separate zero-loss reading preview

Only when the machine invokes the separate `task-copilot-grill-preview-v1` contract after readiness,
produce the requested final reading and structure draft. This remains a session-only preview, not a
Proposal. Preserve every supplied source material exactly once: place its machine material ID in one
section, or keep it in `unclassified`. A material excluded from the current outcome is not deleted;
it stays unchanged in `unclassified` with an evidence-backed reason. Keep the root material in the
`root` section.

Use only supplied evidence references for the title, outcome, boundary, completion evidence,
derived blocks, and unclassified reasons. Never repeat or rewrite source text in model-authored
fields. The machine injects exact text and hashes and computes move, add, delete, and unclassified
counts. Never emit Proposal fields, operations, Commit commands, Graph patches, or formal state.

## Return one bounded draft

Return exactly one `task-copilot-grill-turn-v1` JSON object using only supplied machine IDs and
evidence references. Do not include provenance, subject identity, Proposal fields, operations,
commands, Graph patches, Focus, Ownership, Lifecycle, Condition, Anchor, Commit, or SQLite fields.

Treat the final machine `outputContract` as the response authority. Copy its `machineReadiness`
and non-null `requiredFocusUncertaintyId` exactly. Use only `allowedFactIds`,
`allowedOpenUncertaintyIds`, and `allowedEvidenceRefs`; IDs in `resolvedUncertaintyIds` are forbidden
in `unknowns` and `questions`. The first question must use the required focus ID.

For a continuing turn:

```json
{
  "schemaVersion": "task-copilot-grill-turn-v1",
  "understanding": "Evidence-bounded current understanding",
  "factRefs": ["machine_fact_id"],
  "inferences": [{ "text": "Bounded interpretation", "evidenceRefs": ["machine_ref"] }],
  "unknowns": [{ "uncertaintyId": "machine_focus_id", "text": "What remains unknown" }],
  "readiness": "CONTINUE",
  "focusUncertaintyId": "machine_focus_id",
  "questions": [{ "uncertaintyId": "machine_focus_id", "text": "One material-specific question" }],
  "recommendation": {
    "text": "One evidence-backed recommendation",
    "evidenceRefs": ["machine_ref"],
    "tradeoffs": ["One real tradeoff"]
  }
}
```

For `READY_FOR_PREVIEW`, return empty `unknowns` and `questions`, and omit
`focusUncertaintyId` and `recommendation`.

If evidence conflicts or the requested answer needs material outside the exported scope, keep the
uncertainty open. Never invent evidence to make the session appear ready.
