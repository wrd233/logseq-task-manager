---
name: design-project
description: Design, reenter, review, or close one Task Copilot V2 Project from an explicitly exported Context Package. Use for Project blueprint work, multi-page synthesis, objective and work-stage clarification, decision or output extraction, and Project Closure Proposals.
---

# Design Task Copilot Project

Version: `1.1.0`

Apply `task-copilot-core` first and keep all work inside the exported Project scope.

## Establish the Project interface

Summarize only evidence-backed values for:

- purpose and desired outcome;
- current lifecycle and condition;
- objectives and completion evidence;
- current work stage and next restart point;
- active decisions, outputs, blockers, and waiting evidence;
- unresolved questions.

Do not turn every heading, note, or resource into an object. Prefer the existing Project and its owned objects; propose a new Decision or Output only when it has durable governance value.

## Resolve ambiguity

For a genuinely open design question, ask one compact round of related questions. Record the user-visible frozen decisions, remaining questions, next round, and intended Proposal groups. Do not preserve hidden reasoning or a long chat transcript as product state.

## Build the Proposal

1. Keep text changes and their coupled semantic operations in one group.
2. Split optional objectives, decisions, outputs, or ownership changes into independently reviewable groups where valid.
3. Preserve incomplete objectives during closure and explain why they remain incomplete; Project completion does not imply every objective completed.
4. Include a readable final preview before detailed patches.
5. Validate and, only on request, submit through the `tc proposal` commands defined by `task-copilot-core`.

## Project Closure machine shape

Use these exact field names and value shapes. Replace placeholders from exported facts and user-confirmed outcomes; do not add wrapper fields or rename keys.

```json
{
  "proposalId": "proposal_unique_id",
  "schemaVersion": "v2",
  "title": "Readable title",
  "context": "Evidence-backed context",
  "understanding": "What is complete and what remains",
  "objective": "Form Closure and complete the Project",
  "logic": "Closure and Lifecycle are reviewed together",
  "finalPreview": "Readable final outcome",
  "unresolvedQuestions": [],
  "source": { "kind": "external_agent", "skillVersion": "design-project@1.1.0" },
  "scope": {
    "read": [{ "kind": "OBJECT", "id": "exported_object_id", "version": 1 }],
    "modify": [{ "kind": "OBJECT", "id": "exported_object_id", "version": 1 }]
  },
  "preconditions": ["Project remains OPEN"],
  "groups": [{
    "groupId": "close-project",
    "explanation": "Closure and completion are indivisible",
    "risk": "HIGH",
    "independentlyAcceptable": true,
    "dependencies": [],
    "textPatches": [],
    "semanticOperations": [
      {
        "operationId": "record-closure",
        "kind": "UPDATE_PROJECT_INTERFACE",
        "target": { "kind": "OBJECT", "id": "exported_object_id", "version": 1 },
        "summary": "Record structured Project Closure",
        "payload": { "closure": {
          "originalGoal": "...",
          "actualResult": "...",
          "majorDeliverables": ["at least one"],
          "incompleteObjectives": [{ "objective": "...", "reason": "...", "nextStep": "..." }],
          "legacyDisposition": "...",
          "keyDecisions": ["at least one"],
          "futureSummary": "..."
        } },
        "preconditions": []
      },
      {
        "operationId": "complete-project",
        "kind": "TRANSITION_LIFECYCLE",
        "target": { "kind": "OBJECT", "id": "exported_object_id", "version": 1 },
        "summary": "Complete Project",
        "payload": { "lifecycle": "COMPLETED" },
        "preconditions": []
      }
    ],
    "disposition": "PENDING"
  }],
  "status": "READY",
  "createdAt": "ISO-8601 timestamp"
}
```

Closure requires at least one `majorDeliverables` entry and one `keyDecisions` entry. `incompleteObjectives` may be empty; every included item must have non-empty `objective`, `reason`, and `nextStep`. Both operations must target the same exported Object version. Do not place the Context fingerprint in an unknown Proposal field; preserve it in external evidence or the Proposal narrative when needed.

List every formal Object, Page, or Block actually read in `scope.read` with its exported version and/or hash. The Project Object read from `objects.json` therefore belongs in both `read` and `modify` for Closure. Context-package files and Skill documents are evidence containers, not additional Proposal target kinds.

Never directly edit the formal Graph, manufacture missing ownership, or create a second Project state document.
