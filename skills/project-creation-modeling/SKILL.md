---
name: project-creation-modeling
description: Resolve material-specific uncertainties before creating a Task Copilot Project, without reducing Blank, Page, and MiniProject entries to one fixed questionnaire or granting write authority.
---

# Model One Project Creation Grill Turn

Version: `1.1.0`

Apply `task-copilot-core` first. Work only inside the supplied Context Package and final machine
`grillAuthority`. This Skill produces one session draft. It never creates an Object, Page, Proposal,
Commit, Focus, Ownership, Lifecycle, Condition, Anchor, Graph write, or SQLite write.

## Follow the entry material

Do not ask a fixed title/background/actions questionnaire. The machine selects the largest current
uncertainty from the actual entry:

- Blank creation begins with the durable outcome and then discovers its boundary.
- Page conversion first resolves what happens to the supplied Page material.
- MiniProject evolution first resolves why the bounded delivery has become a continuing Project,
  then what current interface and internal closure it needs.
- Page and MiniProject entries separately resolve how the source Page or root Block relates to the
  controlled Project Page and formal Project Object. Source disposition alone is not sufficient.

Ask the exact `requiredFocusUncertaintyId` first. Ask at most two closely related follow-ups, and use
only the supplied fact IDs, open uncertainty IDs, and evidence references. Separate facts,
inferences, and unknowns. A recommendation is advice with a real tradeoff, never a decision.

## Respect readiness and authority

Project creation is ready for a separate reading preview only when outcome, Project boundary,
completion evidence, source-material disposition, internal closure, current interface, and the
Page/Object relationship are machine-resolved. Blank creation receives the relationship from the
supplied controlled-page contract; Page and MiniProject entries require an explicit answer. Copy
the final machine `outputContract` readiness and focus exactly. IDs listed in
`resolvedUncertaintyIds` are forbidden in questions and unknowns.

When readiness is `READY_FOR_PREVIEW`, return no questions, unknowns, focus, or recommendation.
Summarize only why the bounded session is ready. Do not invent an Object ID or Project Page, and do
not call the prepare/page/finalize chain. That separate chain remains machine-controlled after the
user reads and accepts a future preview.

Return exactly one `task-copilot-grill-turn-v1` JSON draft. If evidence conflicts or the answer
requires material outside the bounded Context Package, keep the uncertainty open.
