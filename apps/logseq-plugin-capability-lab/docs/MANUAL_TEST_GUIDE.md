# Manual Test Guide

No step in this guide has been claimed as passed until it is performed in Logseq Desktop and recorded in `CAPABILITY_MATRIX.md`.

## Evidence collection

Before testing, record the Logseq Desktop version. Open Developer Tools and preserve console errors, the panel's latest error, involved UUIDs, and screenshots where useful. For each matrix row, replace **待人工验证** with the date, Logseq version, result, and brief evidence.

## 1. Load and lifecycle

- **Precondition:** `npm run check` passed; Logseq Sync is confirmed off for production destinations; Developer mode is enabled.
- **Action:** Load the unpacked plugin from `<dev-repo>/apps/logseq-plugin-capability-lab`; on this machine: `/Users/wangrundong/work/任务管理中心-logseq插件/apps/logseq-plugin-capability-lab`.
- **Expected:** console shows the ready log; toolbar shows a flask; panel shows `Ready: yes`.
- **Pass:** all three appear without an uncaught error. Reload once and confirm there is still only one functional toolbar entry.
- **Errors:** copy the entire console stack and plugin version.
- **Graph write:** none expected.
- **Rollback:** disable the plugin.

## 2. Toolbar, command palette, and slash command

- **Precondition:** plugin loaded.
- **Action:** open with the flask; close it; run `Open Logseq Plugin Capability Lab` from the command palette; in any temporary editing context, type `/Open Capability Lab` and invoke it. The temporary block does not need a Capability Lab marker because this command must not write Graph data.
- **Expected:** each entry opens the same panel. The slash command only opens the panel and does not create or update a block. If Logseq itself leaves command text in the current editor, record that host behavior; do not describe it as plugin-created test data.
- **Pass:** all three work and panel close restores normal interaction.
- **Errors:** capture console and panel latest error.
- **Graph write:** none by the plugin. User typing or Logseq's own slash-command editor behavior may affect only the chosen temporary editing context.
- **Rollback:** undo the typed slash text or clean the marked test block.

## 3. Current context

- **Precondition:** panel open on a normal page, then on the experiment page with a block actively edited.
- **Action:** click **读取当前上下文** in both situations.
- **Expected:** Graph and page fields appear; when editing, block UUID/content/parent/page/children fields appear; unavailable fields literally say `当前不可用`.
- **Pass:** values match visible Logseq context and no invented values appear.
- **Errors:** save context JSON and console stack.
- **Graph write:** none.
- **Rollback:** none.

## 4. Page namespace, ownership, create/open, and panel return

- **Precondition:** default setting is `Task Copilot Lab/Capability Lab`. Record Graph status informationally.
- **Action:** first set the page to `Project/Real`, `Area/Real`, a date page, and an ordinary page; click the page action each time. Then restore the default and approve creation. Finally, manually create an unowned `Task Copilot Lab/Unowned` page, target it, and retry. Navigate elsewhere and reopen the panel.
- **Expected:** every non-namespace name is refused before write; the unowned namespaced page is also refused with its missing owner reason; only the plugin-created default page is opened and has `capability-lab`, exact owner, and `capability-lab-page-id` properties.
- **Pass:** no Project, Area, Journal, ordinary, or unowned namespaced page receives plugin data; panel remains accessible elsewhere.
- **Errors:** capture requested page name, actual page, console, and latest error.
- **Graph write:** may create exactly one owned `Task Copilot Lab/...` page after explicit confirmation.
- **Rollback:** retain the page until all tests finish; delete manually only after inspection.

## 5. Block CRUD, parent/child, UUID, and properties

- **Precondition:** experiment page open; Git status recorded; no valuable content on the experiment page.
- **Action:** click **运行 Block CRUD** and approve.
- **Expected:** parent created, reread, updated, and given a child; panel logs both UUIDs, parent/children information, and structured properties. The parent UUID remains unchanged after update.
- **Pass:** all related runtime rows show pass; both blocks contain `capability-lab:: true` and the owner marker; no other page changes.
- **Errors:** copy UUIDs and error before attempting cleanup.
- **Graph write:** yes, only marked blocks on the experiment page.
- **Rollback:** use the guarded cleanup button in step 10.

## 6. DataScript query

- **Precondition:** at least one CRUD run exists.
- **Action:** click **查询实验块**.
- **Expected:** query count includes plugin-owned marked blocks; implementation is identified as `DB.datascriptQuery`, followed by JavaScript owner-marker filtering.
- **Pass:** sampled UUIDs match created blocks and no unrelated block is presented as plugin-owned.
- **Errors:** capture the query error and Logseq version; do not substitute DOM scraping.
- **Graph write:** none.
- **Rollback:** none.

## 7. Settings persistence

- **Precondition:** plugin loaded and no active CRUD operation.
- **Action:** change verbose logging, confirmation, and page name in plugin Settings; observe the settings event; reload Logseq/plugin and reopen Settings.
- **Expected:** values persist and panel uses the new page name. Restore the default before continuing unless intentionally testing a second dedicated page.
- **Pass:** settings survive reload and behavior matches values.
- **Errors:** capture before/after values and console.
- **Graph write:** changing a setting should not write note content; a subsequent page operation can create the configured test page.
- **Rollback:** restore page name to `Task Copilot Lab/Capability Lab`, confirmation on, verbose logging off.

## 8. FileStorage round trip

- **Precondition:** plugin loaded; no sensitive data is entered.
- **Action:** click **写入并读取私有存储**, reload plugin, and repeat. Inspect Logseq/plugin data directories only read-only if locating the file.
- **Expected:** the small JSON probe is reread exactly.
- **Pass:** round trip succeeds before and after reload.
- **Errors:** record key `capability-lab/storage-probe.json`, console, and returned value.
- **Graph write:** no page/block write; plugin-private file storage is written.
- **Rollback:** uninstall only after deciding whether private storage should be retained. The public SDK does not establish backup/sync guarantees.

## 9. Stable events

- **Precondition:** panel open.
- **Action:** navigate between pages; perform a marked CRUD update; if safe, switch away from and back to this test Graph.
- **Expected:** route change, marked DB transaction, and Graph change events appear when applicable.
- **Pass:** events correspond to actions without duplicate storms after a plugin reload.
- **Errors:** capture event log and console.
- **Graph write:** navigation none; CRUD only on the experiment page.
- **Rollback:** cleanup marked blocks. A dedicated editing-state event is not claimed by this SDK.

## 10. Multiple historical pages and guarded Block cleanup

- **Precondition:** create a CRUD run on `Task Copilot Lab/Capability Lab`, change the setting to `Task Copilot Lab/Second Page`, create that owned page and a second CRUD run, then change the setting back. Record all page/block UUIDs.
- **Action:** click **清理已注册实验 Block** and approve.
- **Expected:** registry page UUIDs, not the current setting name, allow both historical pages' registered blocks to be processed. The report separates deleted, already missing, and refused UUIDs. Pages remain. If an owned Lab page is renamed outside `Task Copilot Lab/`, cleanup must refuse its blocks until the page is manually returned to the Lab namespace.
- **Pass:** UUID reread returns nothing for deleted blocks on both pages; unrelated/unregistered blocks remain.
- **Errors:** do not manually force cleanup; record every refused UUID and reason.
- **Graph write:** deletes qualifying experiment blocks only.
- **Rollback:** Logseq undo may restore blocks; record UUID behavior in step 13.

## 11. FileStorage cleanup

- **Precondition:** step 8 has registered `capability-lab/storage-probe.json`.
- **Action:** click **清理 FileStorage Probe** and approve.
- **Expected:** only that probe key is removed and a follow-up read reports it missing; the registry key and other plugin data remain.
- **Pass:** `removed: true` and `verifiedMissing: true` appear.
- **Errors:** record the returned value if the key still exists.
- **Graph write:** none; plugin-private storage only.
- **Rollback:** rerun the FileStorage round trip to recreate the harmless probe.

## 12. Full Capability Lab reset

- **Precondition:** create registered blocks and a probe, and ensure no manually moved/refused block is unresolved.
- **Action:** click **重置 Capability Lab 状态** and approve once.
- **Expected:** safe Block cleanup runs, the probe is removed, and the schema-v1 registry is rebuilt empty. Owned Lab pages remain. Any refused block prevents silent registry erasure.
- **Pass:** reset report shows completion, empty registered block/storage counts, and retained pages.
- **Errors:** record refused items; do not force-remove registry evidence.
- **Graph write:** deletes only qualifying registered blocks; no page deletion.
- **Rollback:** no automatic rollback; retained pages and detailed report support inspection.

## 13. Anchor stability sequence

Use only a fresh Capability Lab parent/child pair and record the UUID before each action.

1. **Edit content:** manually change ordinary text but retain both safety markers. Expected: UUID remains. Pass by rereading context/query.
2. **Move within page:** drag the marked block to another position on the same experiment page. Expected hypothesis: UUID remains; record actual result.
3. **Move to another dedicated test page:** first create a uniquely named lab-only destination; move the marked block there. Expected hypothesis: UUID may remain, but cleanup must refuse it because page boundary no longer matches. Move it back manually.
4. **Delete:** delete the marked block normally. Expected: UUID lookup returns unavailable.
5. **Undo delete:** undo once and query/reread UUID. Record whether the original UUID returns or a new UUID appears.

For every substep:

- **Precondition:** UUID and content recorded; no real block selected.
- **Pass:** observed behavior is recorded accurately, not that it matches the hypothesis.
- **Errors:** capture UUID, page, action, console, and actual lookup result.
- **Graph write:** yes, only marked lab data.
- **Rollback:** move the block back, restore markers, then use guarded cleanup; manually inspect if the safety guard refuses it.

## 14. Event unload and duplicate-registration check

- **Precondition:** Developer console and event log visible.
- **Action:** reload the plugin three times, opening the panel after each reload; navigate once and perform one marked update.
- **Expected:** one toolbar entry, one panel action response, and no multiplied route/DB event entries. Console reports unload before the next ready where the host provides that lifecycle.
- **Pass:** no duplicate toolbar or listener behavior.
- **Errors:** record exact event multiplicity and reload sequence.
- **Graph write:** only the explicitly marked update.
- **Rollback:** disable the plugin.

## 15. Final repository check

- **Precondition:** experiments are complete; Logseq may remain the source of ongoing inner-Graph changes.
- **Action:** from the outer repository, run `git status --short`, `git ls-files 'logseq/**'`, and `git check-ignore -v logseq/pages/task-copilot-logseq-bridge.md`. Optionally display `git -C logseq status --short --branch` as informational evidence only; do not open, rewrite, delete, stage, or commit `pages/task-copilot-logseq-bridge.md`.
- **Expected:** outer `git status --short` contains only intended source/doc changes, the outer index has no `logseq/` path, and the ignore check identifies the root `/logseq/` rule. The inner Graph may remain dirty.
- **Pass:** no Graph path is present in the outer index; inner runtime changes do not block the outer commit.
- **Errors:** stop only if the outer index unexpectedly contains a `logseq/` path or another forbidden source-boundary violation. An inner-only page, Journal, configuration, archive, or metadata change is not an error and must not stop outer development.
- **Graph write:** none from this command.
- **Rollback:** remove an accidental outer index entry with a bounded non-destructive index operation; never use destructive cleanup against the inner Graph.
