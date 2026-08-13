# Logseq Writing Language v1 — Real Graph Golden Path

Status: accepted on real Logseq Desktop 0.10.15
Date: 2026-08-13

This acceptance used the protected user Graph through the real Desktop host and
the locally packaged plugin. All created material used clearly synthetic page
and Task names. The Graph backup, raw scan notes, Kernel state, and before/after
screenshots remain outside Git; visual evidence is local under
`/tmp/task-copilot-vnext-phase55/screenshots/`.

## Preconditions and protection

- The real Graph was resolved from Logseq's active graph metadata rather than
  assumed from the goal's display path.
- A full local APFS clone was created at
  `/tmp/task-copilot-vnext-real-graph-backup-20260813-133204` before writes.
- The writing study inspected 3,285 Markdown files and 3,088 task-marker lines;
  only aggregate patterns and synthetic examples entered the repository.
- A fresh private Kernel state directory was used for the Phase 5.5 matrix.

## Human-facing matrix

| Case | Real Desktop result |
| --- | --- |
| ordinary formal Task | source `TODO` only; no visible managed block |
| current focus | one direct `**[当前推进]**` child before natural Evidence |
| WAITING | one direct `**[等待]**` child; no enum/property table |
| WAITING plus review | ordered waiting/review children; midnight UTC date shown as `YYYY-MM-DD` |
| completed default | `DONE` only when outcome repeats the title |
| cancelled | source remains natural; one `**[取消]**` reason child |
| rich context | bold natural background/goal children remain untouched |
| Journal | a formal Task retains normal journal rhythm and zero-noise default |
| nested Task | nested natural Task stays readable and is not claimed by its formal ancestor |
| multiple Tasks | only the formal source owns its sparse children; siblings stay independent |

Actual screenshots were inspected in the host and retained only locally. The
ordinary, focus, waiting/review, completed, cancelled, Journal, nested, and
multi-Task views contained no visible title/state enum table. No independent
human visual sign-off was performed, so this is `VISUAL_GATE_READY`, not an
independent `VISUAL_GATE_PASS`.

## Semantic regression

The following paths were rerun after the Writing Language refactor:

1. Phase 1: Formalize, verified zero-noise Graph result, compensation Undo.
2. Phase 3: freeze direct Evidence, deterministic current-focus Proposal,
   auto-apply, accepted Feedback, compensation Undo, removed focus child.
3. Phase 4: `ACTIONABLE -> WAITING`, `WAITING -> ACTIONABLE`, accepted
   Feedback, Undo restoring the exact WaitingCondition.
4. Phase 5: Complete, Cancel, Reopen, Amend, compensation Undo, direct online
   `TODO -> DONE` ingestion, and marker restoration.
5. Recovery: the final real-host command reported no incomplete Commit.

Synthetic restart regressions additionally prove that CREATE compensation
cannot be marked committed while any registered managed UUID remains. Recovery
uses the durable effect identity rather than an in-memory Adapter cache and
fails closed when that identity is unavailable.

Presentation-only re-render was also exercised after a full Desktop reload. It
found the source through the persisted native Logseq `id::`, kept WorkObject
version and Semantic Commit count unchanged, and left the page file hash
unchanged for the zero-noise case.

## Real-host defects found and reduced to synthetic tests

Three host observations produced repository fixes without copying real data:

- Logseq 0.10.15 exposes an RPC proxy for the newer
  `checkCurrentIsDbGraph` method but reports that the host method does not
  exist. File-graph detection now falls back only on an absolute public graph
  path and otherwise fails closed.
- A file-graph block UUID without native `id::` did not survive a full Desktop
  reload. Formalization now persists and verifies the native source identity
  before creating its PrimaryAnchor; DB graphs remain mutation-free.
- A date-only review becomes a normalized midnight UTC timestamp in Domain.
  The renderer now presents that value as a natural date, and a tightly bounded
  presentation-equivalence rule safely converges the former timestamp text.

## Visual findings

- Direct child blocks scan faster and occupy less vertical space than quotes;
  quotes remain appropriate for natural quoted material, not operational state.
- The waiting/review pair is prominent without overpowering the Task or its
  natural context.
- Default omission is essential in Journals and pages with multiple Tasks.
- Existing high-density Project/MiniProject pages already use selective bold
  line-start labels. Future managed state should remain attached to the
  specific formal child, not add another Project-level card or template.
- CSS is unnecessary for correctness or readability and is not part of v1.

## Safety result

- protected Graph: modified only through real Logseq synthetic acceptance work;
- repository: no Graph copy, symlink, screenshot, raw scan, Kernel state,
  backup, local database, or real-data fixture;
- committed evidence: code, synthetic tests, aggregate counts, sanitized
  patterns, and this golden path only.
