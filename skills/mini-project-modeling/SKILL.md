---
name: mini-project-modeling
description: Resolve the largest evidence-specific uncertainty in one bounded Task Copilot MiniProject Grill Session without turning the conversation into a fixed form or granting formal write authority.
---

# Model One MiniProject Grill Turn

Version: `1.0.0`

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

## Return one bounded draft

Return exactly one `task-copilot-grill-turn-v1` JSON object using only supplied machine IDs and
evidence references. Do not include provenance, subject identity, Proposal fields, operations,
commands, Graph patches, Focus, Ownership, Lifecycle, Condition, Anchor, Commit, or SQLite fields.

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
