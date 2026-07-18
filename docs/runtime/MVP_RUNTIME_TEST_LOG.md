# MVP Runtime Test Log

## 2026-07-18 — Formal plugin entry failure

| Evidence | Result |
|---|---|
| Plugins page recognizes Task Copilot 0.1.0 | PASS |
| Enabled / Unpacked | PASS |
| Capability Lab Toolbar/Menu | PASS |
| Bridge Toolbar/Menu | PASS |
| Formal Task Copilot Toolbar | FAIL before runtime fix |
| Formal Command Palette | UNKNOWN before runtime fix |
| Formal Main UI | NOT REACHED before runtime fix |

Diagnosis at this point: source inspection proved the Toolbar existed but was registered only after Store/Application initialization.

## 2026-07-18 — First repaired Desktop run

| Evidence | Result |
|---|---|
| Bootstrap reached `main UI registered` | PASS |
| Injected Toolbar selector | FAIL: slash-containing key caused invalid `querySelector` and host error page |
| Persistence first run | FAIL: SDK `file not existed` was treated as fatal |
| Capability Lab first-run storage | FAIL: same missing-file assumption |
| Additional host message | `BUG: should not join with empty dir` |

The second Runtime Fix separates domain/storage namespaces from CSS-safe UI keys, flattens physical FileStorage filenames, classifies SDK storage errors centrally, persists a new empty schema-v1 Store on `NOT_FOUND`, and preserves corrupt/unknown data in read-only safe mode.

## Runtime fix automatic evidence

| Check | Result |
|---|---|
| Package main and Logseq main resolve to built `dist/index.html` | PASS |
| Relative HTML/CSS/JS; no dev server or absolute asset path | PASS |
| Bootstrap Shell precedes feature initialization | PASS |
| Exactly one namespaced Toolbar registration | PASS |
| Five required palette commands and one read-only Slash open command | PASS |
| Initialization failure diagnostic renderer | PASS |
| Pure HTML UI mount fallback | PASS |
| CSS-safe and unique Toolbar/UI/model/command/DOM/portal identifiers; slash rejection | PASS |
| First-run missing storage, SDK Error/object shapes, mixed missing collections, empty/corrupt JSON, unknown schema and invalid/flat paths | PASS |
| CSS selectors scoped to the formal-plugin root | PASS |
| Settings listener and UI click handler cleanup on unload | PASS |
| Targeted plugin typecheck/test/build/package/dist checks | PASS; 10 formal-plugin tests plus storage suites |

Desktop result after the fix is pending the consolidated user checkpoint. This document does not claim runtime PASS or `MVP_SUCCESS`.

## 2026-07-18 — RT-BUG-001 / RT-BUG-002 real Inbox failure

Observed Store evidence in the active checksummed slot confirmed the affected Capture and source Anchor both persisted `"19"`; the Anchor still retained Graph identity and Block UUID `6a5ad6d5-71aa-491c-bc0b-e2376c923a12`. Source inspection proved `RuntimeShapeAdapter.pageRef()` selected `id` before human page fields and stringified numbers. The Inbox renderer displayed that persisted value directly.

The same Store contained a successful `capture_dismissed` event followed by a fresh Capture of the same Block. This proves click delegation reached at least one Application command, while the UI supplied no observable action state. Other paths depended on `window.prompt`, and the delegated handler invoked `void handleAction(...)` without a terminal rejection handler; errors before the narrow `run()` wrapper were silent.

Automated fix evidence:

- Resolver queries numeric ID/UUID through `Editor.getPage`, prioritizes `originalName`, `name`, then valid `journalDay`, and never exposes numeric IDs as display names.
- Startup repairs legacy numeric references by Block UUID, preserves Capture ID and technical page ID, and appends `source_reference_repaired`; unverifiable data becomes an explicit conflict.
- Open Source re-reads the Block by UUID, resolves its current page and navigates to that Block.
- Six Inbox actions use real `button type=button`, delegated dispatch, inline forms/confirmation, loading/success/error states, duplicate suppression and diagnostic IDs.
- Manual formalization creates, reviews and commits the object/Capture SemanticCommit as one observable flow.
- Structured ring-buffer logs, global rejection/error capture, copy/export/clear/debug controls, read-only Source Resolver and Inbox Action probes are present.
- Root `./scripts/check.sh` passes with 81 tests, 145-rule coverage, plugin package/bootstrap/dist checks and recovery rehearsal.

Desktop proof remains `RT-MVP-001B PENDING`; Pilot remains blocked until it passes.
