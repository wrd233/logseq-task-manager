# Canonical Format + Formal Consistency Marker — RC Dogfood / Experience Record

Status: RC evidence  
Date: 2026-08-17  
Scope: canonical Formal Object writing language and `◇!` consistency marker  
Target: Logseq Desktop 0.10.15 / branch `vnext`

## Verified host behavior

Logseq Desktop 0.10.15 only recognises TODO/DONE workflow markers when the
marker is the first non-whitespace token of a block. We verified this by
creating real blocks in the running Desktop and querying `:block/marker` through
the local datascript API:

| Block text | Logseq marker |
| --- | --- |
| `TODO 普通任务` | `TODO` |
| `TODO **[任务]** 后缀任务` | `TODO` |
| `DONE **[任务]** 后缀完成` | `DONE` |
| `**[任务]** TODO 前缀任务` | none |
| `**[任务]** DONE 前缀完成` | none |
| `**[MiniProject]** 样例 #MiniProject` | none |

This is the blocker anticipated by the goal. We therefore keep the user's bold
`[任务]` decoration but place it after the workflow marker:

```text
TODO **[任务]** <title>
DONE **[任务]** <title>
```

MiniProject has no TODO workflow marker, so the exact requested form is safe:

```text
**[MiniProject]** <title> #MiniProject
```

## Canonical format decisions

- New Task formalization writes `TODO **[任务]** <title>` (OPEN) or
  `DONE **[任务]** <title>` (COMPLETED) to the Primary Anchor line.
- New MiniProject formalization writes
  `**[MiniProject]** <title> #MiniProject`.
- Project remains an independent Logseq page; it does not use the block
  anchor formatter.
- Kernel title remains pure semantic title; decoration stripping is centralized
  in `canonical-writing.ts`.
- Old natural anchors are not rewritten at startup or on ordinary projection.
  The Graph Adapter only normalizes a source that is already canonical (e.g.
  legacy `**[任务]** TODO ...` → `TODO **[任务]** ...`), and the explicit
  "重新渲染当前正式事项" command can migrate a natural anchor only when its
  extracted title still matches the Kernel canonical title.
- Formatting is idempotent and deterministic.

## Formal consistency marker (`◇!`)

- `◇` = Formal Primary Anchor, projection consistency normal.
- `◇!` = Formal Primary Anchor, but a stable projection/anchor consistency
  anomaly exists.
- First RC signal set is narrow and Kernel-derived:
  - stable FAILED projection obligations (`retryExhausted`, no next attempt,
    or permanent verify/precondition mismatch);
  - recovery items that require manual reconciliation.
- Explicit exclusions: WAITING / PARKED / closure NOT_READY / Agent
  uncertainty / pending decisions / transient retries / graph-switch
  eventual-consistency windows.
- Marker click still performs Kernel revalidate and opens the Object Surface.
- After the obligation/recovery clears, the periodic identity refresh flips
  `◇!` back to `◇` without user refresh.

## Screenshots

Local evidence captured under `/tmp/tc-canonical-format/`:

- `ordinary-vs-formal.png` / `ordinary-vs-formal-annotated.png`
- `project-page.png` / `project-page-annotated.png`
- `parser-evidence.json` (datascript marker rows)

Full `◇!` / recovery screenshots require a dogfood graph with a deliberately
failed projection obligation and a connected Plugin/Kernel; this RC record
contains the automated semantics and parser evidence, and lists the remaining
manual screenshots as `RC_UI_KNOWN_ISSUE` if not captured in the final gate.

## Test coverage added

- `canonical-writing.test.ts` — formatter, extraction, idempotency, legacy
  normalization, Project block-formatter exclusion.
- `formal-marker.test.ts` — `◇!` glyph/tooltip and stable-anomaly eligibility.
- `graph-adapter.test.ts` — canonical source normalization on upsert, rename,
  completion, MiniProject idempotency, and natural-source preservation.
