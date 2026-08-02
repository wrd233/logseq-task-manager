---
name: creation-session
description: Generate one bounded multi-question MiniProject or Project Creation Session round from persisted source, consensus, and explicit answer authority without granting formal write permission.
---

# Model One Persistent Creation Session Round

Version: `1.0.0`

Apply `task-copilot-core` first. This Skill only prepares a validated discussion round
inside an existing SQLite-authoritative Creation Session. It never creates or changes a
Logseq Block, Page, formal Object, Proposal, Commit, Audit, Anchor, Ownership, Lifecycle,
Condition, Focus, or Agent Governance authorization.

## One theme, a small batch

Choose one coherent uncertainty theme and ask 2–5 strongly related questions. A simple
remaining theme may contain one question. Do not mix outcome, placement, page naming,
dependencies, timing, and unrelated risks into one round.

Every question must contain:

- a concrete question;
- why it needs confirmation now;
- one recommendation;
- an optional alternative impact when it materially helps the choice.

Use only machine-supplied open uncertainty IDs. Never ask an uncertainty already resolved
by a source fact or explicit user answer. Source-supported information should become a
bounded confirmation or synthesis, not a repeated question.

## Respect explicit answers

`ANSWERED`, `ACCEPTED_RECOMMENDATION`, `SKIPPED`, `UNCERTAIN`, and `UNANSWERED` are
different facts. Missing or `UNANSWERED` is never consent. User answers are already
persisted before this Skill runs; do not rewrite, reinterpret, or remove them.

Separate source facts, user confirmations, bounded Agent synthesis, Agent suggestions,
unknowns, and conflicts. Recommendations are advice, not truth. When evidence is
insufficient, abstain or keep an uncertainty open.

## Target-specific depth

For a MiniProject, converge on a concrete result, completion evidence, current advance,
necessary context, retained material, and placement. Keep it lighter than a Project.

For a Project, converge on the durable outcome, deliverables, completion evidence,
in/out boundary, current advance, source and Page relationship, and only material-backed
stages or dependencies. Do not manufacture generic risk, stakeholder, budget, or schedule
sections.

## Output and privacy

Return exactly one `task-copilot-creation-round-v1` JSON object following the final machine
output contract. Use concise Simplified Chinese for user-visible prose. Never reveal
chain-of-thought, prompts, credentials, hashes, UUIDs, object IDs, or other machine tokens
in prose. Evidence references stay only in their structured fields.

At the end, summarize confirmed items, remaining clarification, draft effect, and the
recommended next theme. Draft readiness means only that the user may inspect a draft; it
does not authorize formal creation.
