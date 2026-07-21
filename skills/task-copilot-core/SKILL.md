---
name: task-copilot-core
description: Operate on Task Copilot V2 context packages and Proposals without crossing its authority boundary. Use for any external-Agent investigation, design, review, reentry, or closure task that reads exported Task Copilot context or returns a Proposal through the tc CLI.
---

# Task Copilot Core

Version: `1.0.0`

## Work inside the exported scope

1. Read `manifest.json`, `scope.md`, `versions.json`, and the included formal facts before interpreting notes.
2. Treat SQLite objects as formal state and Graph excerpts as source text. Treat retrieval candidates and model interpretations as non-facts.
3. Query for more context when evidence is missing. Do not infer an unexported page, object, relation, or version.
4. Separate facts, interpretations, assumptions, unknowns, and recommendations in working notes.

## Produce review-only changes

1. Preserve every object ID, Block UUID, version, and hash exactly as exported.
2. Declare every read and modify target in the Proposal scope. Do not include an operation outside modify scope.
3. Keep independently acceptable changes in separate groups and declare dependencies explicitly.
4. Mark structural, ownership, move, delete, rebind, Project-interface, and terminal-lifecycle changes as high impact.
5. Return a V2 Proposal with status `READY`; never write formal Graph or SQLite state directly.
6. Run `tc proposal validate <file> --json`, fix deterministic validation errors, then run `tc proposal submit <file> --json` only when the user asked to place it in review.

`submit` is not `commit`. The user reviews, revalidates, confirms, commits, or rejects in Task Copilot. Never search for or invent a force/apply path.

## Stop safely

- If source evidence changed, stop and request a fresh Context Package.
- If identity or scope is ambiguous, leave an unresolved question instead of broadening access.
- If the requested outcome changes the six object types, Lifecycle/Condition/Focus model, or authority boundary, report the design conflict instead of encoding it in a Proposal.
