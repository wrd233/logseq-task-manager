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
- **Action:** open with the flask; close it; run `Open Logseq Plugin Capability Lab` from the command palette; while editing a throwaway block on the experiment page, type `/Open Capability Lab` and invoke it.
- **Expected:** each entry opens the same panel; the slash invocation does not insert arbitrary text.
- **Pass:** all three work and panel close restores normal interaction.
- **Errors:** capture console and panel latest error.
- **Graph write:** slash testing may alter only the throwaway experiment block through normal user editing.
- **Rollback:** undo the typed slash text or clean the marked test block.

## 3. Current context

- **Precondition:** panel open on a normal page, then on the experiment page with a block actively edited.
- **Action:** click **读取当前上下文** in both situations.
- **Expected:** Graph and page fields appear; when editing, block UUID/content/parent/page/children fields appear; unavailable fields literally say `当前不可用`.
- **Pass:** values match visible Logseq context and no invented values appear.
- **Errors:** save context JSON and console stack.
- **Graph write:** none.
- **Rollback:** none.

## 4. Page find/create/open and panel return

- **Precondition:** confirm the configured experiment page name in plugin Settings.
- **Action:** click **查找/创建/打开实验页**, approve confirmation, navigate to another page, then reopen the panel from toolbar or command palette.
- **Expected:** only the configured page is found or created and opened; panel remains accessible elsewhere.
- **Pass:** no other page or Journal changes.
- **Errors:** capture requested page name, actual page, console, and latest error.
- **Graph write:** may create exactly one dedicated experiment page.
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
- **Rollback:** restore page name to `Logseq Plugin Capability Lab`, confirmation on, verbose logging off.

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

## 10. Guarded cleanup

- **Precondition:** created UUIDs are shown; manually confirm marked blocks are on the experiment page.
- **Action:** click **清理本插件创建的块** and approve.
- **Expected:** only registered blocks with both markers and exact page match are deleted; experiment page remains.
- **Pass:** UUID reread returns nothing for deleted blocks; unrelated/unregistered blocks remain.
- **Errors:** do not manually force cleanup; record every refused UUID and reason.
- **Graph write:** deletes qualifying experiment blocks only.
- **Rollback:** Logseq undo may restore blocks; record UUID behavior in step 11.

## 11. Anchor stability sequence

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

## 12. Final repository check

- **Precondition:** Logseq closed after tests and experiment data cleaned.
- **Action:** run `git status --short` and inspect every changed `pages/`, `journals/`, `logseq/`, or `whiteboards/` file.
- **Expected:** only explicitly accepted experiment-page changes appear; no business note changed.
- **Pass:** any Graph data change is intentional and separately reviewed.
- **Errors:** stop; do not commit suspicious note changes.
- **Graph write:** none from this command.
- **Rollback:** use Logseq/manual review, not destructive Git commands.
