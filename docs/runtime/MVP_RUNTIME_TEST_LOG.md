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

`RT-MVP-001B` is therefore **PASS**. At this checkpoint it was a bounded V1/MVP Desktop regression, not V2 runtime evidence and not `MVP_SUCCESS`; RT-MVP-002..004 and the four-item Pilot were still pending, and the next section records their later execution.

## 2026-07-19/20 — Consolidated RT-MVP-002..004 Desktop acceptance

Environment: formal unpacked plugin at `apps/task-copilot-logseq-plugin`, plugin 0.1.0 / runtime build based on commit `e7a06b7bfd05`, Logseq Desktop 0.10.15, Graph `logseq`. The source changes that removed the remaining browser-modal dependencies were exercised from the locally rebuilt `dist/`; `dist/` and the test Graph remain ignored.

### RT-MVP-002 — Proposal, Commit, Undo, state, Now Work and Re-entry

| Evidence | Result |
|---|---|
| Demo partial acceptance | PASS: accepted `rewrite_content` / `create_object` / `resolve_capture`, rejected high-impact ownership / move independently, then committed |
| Undo durability | PASS after repair: first live attempt exposed an `undefined` field in inverse-Commit serialization; checksummed A/B previous-slot recovery restored the last valid generation without Graph loss; stable JSON normalization plus regression coverage fixed the cause; retry produced original Commit `UNDONE` and inverse Commit `COMPLETED` |
| Prompt-free action UI | PASS: edit, ownership, Waiting/Blocked/Paused, Proposal edit/defer/reject, high-impact accept, Project completion/reopen, rebind and Undo use in-plugin forms; no `window.prompt` / `window.confirm` remains in plugin source |
| Direct Phase transitions | PASS: Project `DEFINING -> PLANNED -> ACTIVE` through explicit reviewable buttons and SemanticCommits; stale-state checks remained active |
| Optional ownership | PASS: Project `obj_20260719143906912_e5dbc36ffe73436b9ad07985fdb83f7e` assigned to Area `obj_20260719155933910_f19c1a60b858407e89353a49f3649f7b` with a separate in-plugin high-impact confirmation and completed Commit |
| Three-axis state | PASS: Project rendered `ACTIVE + WAITING + REVIEW_DUE`; Waiting details persisted as `Runtime reviewer`, expected result `Confirm the consolidated Desktop evidence`, review time `2026-07-19T13:00:00+08:00` |
| Now Work | PASS: Project and next action visible; full history intentionally absent |
| Project Re-entry | PASS: purpose/current state/recent events/waiting context/restore action and one `primary_text` entry point visible |
| Reload persistence | PASS: Project, ownership, Waiting, Review Due and Re-entry survived a real plugin reload |
| No-Agent degradation | PASS: Logseq setting changed from `demo` to `none`, plugin reloaded, and header rendered `Agent disabled · 基础事务系统可用` while persisted objects remained accessible |

The inverse-serialization failure was not hidden as a UI-only issue: a deterministic failing readback test reproduced the exact persistence boundary before the serializer was repaired. The previous-slot recovery action itself requires two clicks within 30 seconds rather than a browser confirmation, preserving an explicit recoverability gate in Desktop.

### RT-MVP-003 — Anchor lifecycle

Task `obj_20260719162407545_da2a3c4c652f4600ab03d7182e8c4194` was formalized from Block UUID `6a5cd526-d65d-4e72-9c89-fcad499d0243`.

| Evidence | Result |
|---|---|
| External text edit | PASS: scan produced `anchor_conflict` with exact expected/current text and hashes; no overwrite occurred |
| Real built-in block move | PASS: `Cmd+Shift+Down` changed physical order; subsequent scan returned the same external Block UUID to active state |
| Real built-in delete | PASS: Task remained; `primary_text` became missing and `anchor_missing` was audited |
| Logseq Undo after delete | **RUNTIME LIMITATION**: `Cmd+Z` restored the text but Logseq 0.10.15 did not immediately restore a resolvable original Anchor identity; the plugin correctly remained missing instead of guessing |
| Explicit rebind | PASS: checkbox-confirmed in-plugin rebind marked old Anchor `anc_20260719162250012_70225f958a2a410cbc5ceb30d598511d` as `replaced`, created active Anchor `anc_20260719164814169_775f6c2f70604193925a534d5678597d`, updated object version to 5 and appended `anchor_rebound` |
| Post-rebind scan | PASS: banner improved from active 4 / missing 2 / conflict 2 to active 5 / missing 1 / conflict 2; the remaining missing Anchor belongs to earlier disposable runtime data, not the rebound Task |

The result is a bounded PASS for the implemented identity/conflict/rebind contract, with the exact Logseq Undo behavior retained as a known limitation. `move_content` remains intentionally disabled; physical location is not treated as ownership or identity.

### RT-MVP-004 — FileStorage, export and recovery

| Evidence | Result |
|---|---|
| Recovery bundle creation/download | PASS: `/Users/wangrundong/Downloads/task-copilot-recovery-2026-07-19T16-51-26.410Z.json`, valid JSON, bundle/schema version 1, 13 files, outer SHA-256 `4dac6061232b799729581a8955d71f4e29e29eaa05dba9ec95e875aef005461c` |
| Bundle secret scan | PASS: API-key/secret/password/token/authorization pattern scan returned no match |
| In-plugin checksum/readback validation | PASS: temporary Store restored objects 5, relations 1, events 40, Missing Anchor 1, differences 0 |
| Pending Commit recovery | PASS: safely recovered 0; manual recovery required 0 |
| Real reload | PASS: checksummed FileStorage state and No-Agent setting survived reload |
| Test Graph cleanup | PASS: all uniquely labelled RT-MVP-002/003 Blocks and their temporary children were removed; original business Block plus two pre-existing blank Blocks were preserved |

`RT-MVP-002`, `RT-MVP-003` and `RT-MVP-004` are therefore **PASS** for the V1/MVP consolidated Desktop contract. This is still not V2 evidence and not `MVP_SUCCESS`: the four-item copied-data Pilot, Pilot feedback fixes, and root clean success gate remain open; V2 structural work separately waits for OD-001..003 confirmation.
