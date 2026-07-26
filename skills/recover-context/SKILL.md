---
name: recover-context
description: Recover a bounded Task Copilot V2 Task, MiniProject, or Project context from an explicitly exported Context Package. Use for reentry summaries, current-interface drafts, honest insufficient-context results, and one qualified next action without widening read or write authority.
---

# Recover Task Copilot Context

Version: `1.3.0`

Apply `task-copilot-core` first. Never write formal Graph or SQLite state directly.

## Expand context only as needed

Read in this order and stop as soon as the current situation is clear:

1. formal facts;
2. current object source;
3. Project current interface;
4. direct relations;
5. broad retrieval.

Use broad retrieval only when the user explicitly requested deeper reentry or the supplied evidence
marks it as high value. Keep it bounded, asynchronous, and listed in the evidence scope. Never scan
the whole Graph by default.

## Form one honest conclusion

- Lead with one compact summary grounded in the supplied formal facts.
- Put interpretations in `inferences`, never in `factRefs`.
- Put missing information in `unknowns`; say that the entry point is unclear when it is unclear.
- The current recovery draft and its user disposition are evaluation artifacts, not business-context
  unknowns. Do not report whether this draft or the current Provider/quality Gate is successful as an
  unknown. If user evaluation is still needed, omit that reflexive claim and let the product collect
  disposition separately.
- Do not force a next action. Set `nextActionEligible` to `false` unless the runtime supplied one exact
  allowlisted action that reduces the user's decision cost without guessing.
- Do not restate every status field, expand a full object tree, or manufacture a second Project summary.
- Do not claim a write, Commit, Focus, Ownership, Lifecycle, Condition, Anchor, or recovery result.
- Machine identities belong only in `factRefs`, `evidenceRefs`, and `nextActionId`. Never copy an
  Object/Block/Page UUID, source reference, hash, Proposal/Commit/Anchor ID, or similar token into
  `summary`, inference text, unknowns, or suggested-change prose.
- For a machine-declared current-summary optimization, write only the candidate summary. Do not turn
  Objectives, Deliverables, Work Stages, current focuses, Ownership, or正文 into suggested changes.

## Return the unified UX draft

Return exactly one JSON object with this shape. Use only machine-supplied fact and action IDs.
Those exact IDs are listed under `uxAuthority.facts` and `uxAuthority.allowedNextActions` in the
runtime context; do not derive IDs from prose, object IDs, or evidence references.
Machine code resolves fact text and action targets, computes scope hash, raises minimum risk/review,
and replaces all provenance.

```json
{
  "schemaVersion": "task-copilot-ux-output-v1",
  "factRefs": ["machine_fact_id"],
  "inferences": [
    {
      "text": "Bounded Copilot judgment",
      "evidenceRefs": ["machine_evidence_ref"]
    }
  ],
  "unknowns": ["What the evidence cannot establish"],
  "summary": "One user-readable conclusion",
  "suggestedChanges": [],
  "nextActionEligible": false,
  "riskLevel": "NONE",
  "requiresDiscussion": false,
  "requiresReview": false
}
```

If an allowlisted next action is genuinely qualified, set `nextActionEligible` to `true` and add only
`"nextActionId": "machine_action_id"`. Never invent an action ID or return an operation payload.

If a change is worth discussing, add at most one bounded item to `suggestedChanges`:

```json
{
  "kind": "DRAFT_PROPOSAL",
  "summary": "What may need to change",
  "evidenceRefs": ["machine_evidence_ref"],
  "riskLevel": "LOW"
}
```

A suggested change is not a command. Set `requiresReview` to `true`; any formal change must be rebuilt
as a validated Proposal and pass the existing Review, revalidation, Commit, Audit, Undo, and Recovery
chain.

## Stop safely

- If evidence identities, versions, or scope conflict, return no draft and request a fresh Context
  Package.
- If no reliable summary is possible, use `unknowns` and an honest insufficient-context summary.
- If the requested result requires reading outside the exported scope, report the missing scope instead
  of inferring it.
