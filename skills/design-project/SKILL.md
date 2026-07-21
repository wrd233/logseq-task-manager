---
name: design-project
description: Design, reenter, review, or close one Task Copilot V2 Project from an explicitly exported Context Package. Use for Project blueprint work, multi-page synthesis, objective and work-stage clarification, decision or output extraction, and Project Closure Proposals.
---

# Design Task Copilot Project

Version: `1.0.0`

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

Never directly edit the formal Graph, manufacture missing ownership, or create a second Project state document.
