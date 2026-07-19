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

Independent Standards/Spec review found and closed follow-up gaps before the Desktop checkpoint: optional ownership now belongs to the same SemanticCommit and requires its own checkbox confirmation; source conflicts/observations append Audit events; render refresh failures leave diagnostic error state instead of stuck loading; Application Logger Port carries the UI correlation ID through proposal persistence and SemanticCommit; the Inbox Probe dispatches an actual hidden DOM button through the bound root listener before a read-only Application query; numeric strings query numeric page IDs and Block-missing navigation has structured-error coverage.

## 2026-07-19 — RT-MVP-001B repaired Desktop regression

Environment: formal unpacked plugin at `apps/task-copilot-logseq-plugin`, plugin 0.1.0 / commit `8c2f8e98ba59`, Logseq Desktop 0.10.15, Graph `logseq`.

| Evidence | Result |
|---|---|
| Bootstrap and formal surface | PASS: Runtime READY, Store READY, TC Toolbar and five palette commands visible |
| Capture current Journal Block | PASS: Store generation 17 -> 18; Inbox source rendered `Jul 18th, 2026`, not numeric ID `19` |
| Legacy numeric source repair | PASS: two pre-existing Capture IDs remained unchanged, both now reference `Jul 18th, 2026`, with two persisted `source_reference_repaired` Audit events |
| Open Source | PASS: Main UI closed and selected the exact source Block; diagnostic `TC-20260719130703-9f98e31d` |
| Manual formalization | PASS: inline TASK form accepted completion criteria and next action, then created object `obj_20260719131111831_a208c4c6b0e646dbb4a5bef757a35554` |
| Capture resolution | PASS: `cap_20260719130559904_95757bb00c3c4382890083d91ff8c148` became `RESOLVED`, retained its Anchor and linked object |
| Object drawer | PASS: new TASK appeared with body-at-source and source retained |
| Real reload persistence | PASS: plugin was visibly disabled and re-enabled; Store generation 24 -> 25; transient UI state cleared while resolved Capture and TASK remained |
| Create manual Proposal | PASS: inline proposal-text form opened; no write was executed |
| Link existing object | PASS: searchable object-link form opened; no write was executed |
| Defer | PASS: review-time and reason form opened; no write was executed |
| No Action | PASS: explicit high-impact confirmation opened; confirmation succeeded and retained Capture/audit history; diagnostic `TC-20260719132749-6751cd29` |
| Source Resolver Probe | PASS: `status: read-only`; selected Block UUID and runtime shape were displayed; no write |
| Inbox Action Probe | PASS: `status: read-only-pass`, delegated handler and Application query true, `writesExecuted: false` |
| Diagnostics export | PASS: 16-line JSONL at `/Users/wangrundong/Downloads/task-copilot-diagnostics-1784467866631.jsonl`; SHA-256 `29a6d190283258ccaf9f7c6218d9e6d5fe01d643305ef98fdf6f63478afd4806`; secret-keyword scan returned no match |
| Test Graph cleanup | PASS: the two uniquely labelled temporary Blocks were removed; the original business Block was preserved |

The checksummed Store finished at generation 27, active `slot-a`, revision 27. The second test Capture is `DISMISSED` with resolution note `无需行动`; its exported structured log contains clicked, dispatch-started, Application-command-started/succeeded, query-invalidated and UI-succeeded events under one correlation ID. No console error or silent action was observed.

`RT-MVP-001B` is therefore **PASS**. This is a bounded V1/MVP Desktop regression, not V2 runtime evidence and not `MVP_SUCCESS`; RT-MVP-002..004 and the four-item Pilot remain pending.
