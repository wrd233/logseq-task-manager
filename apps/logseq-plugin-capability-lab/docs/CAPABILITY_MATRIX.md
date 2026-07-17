# Capability Matrix

Status vocabulary: **automated pass** means only static/pure/build checks ran; **manual pending** means Logseq Desktop has not verified it; **unsupported/uncertain** is not a hidden pass.

| Capability | Goal | Logseq API | Automated verification | Manual verification | Limits | Future MVP relevance |
|---|---|---|---|---|---|---|
| Lifecycle | Initialize once and unload safely | `logseq.ready`, `beforeunload` | Typecheck/build pass | Manual pending | Desktop load/reload required | Basic plugin reliability |
| Toolbar | Open a restrained lab panel | `App.registerUIItem('toolbar')` | Typecheck/build pass | Manual pending | Host rendering/version dependent | Possible future entrypoint |
| Command | Open from command palette | `App.registerCommandPalette` | Typecheck/build pass | Manual pending | Registration only proven statically | Keyboard-first access |
| Slash command | Equivalent editor entry | `Editor.registerSlashCommand` | Typecheck/build pass | Manual pending | Editing behavior requires Desktop | Optional quick action |
| Current context | Read Graph, page, editing block and relationships | `App.getCurrentGraph`, `Editor.getCurrentPage`, `getCurrentBlock` | Typecheck/build pass | Manual pending | Values may legitimately be null | Context-aware operations |
| Page namespace | Reject business/Journal names; allow only `Task Copilot Lab/` | Pure validator + Editor APIs | Namespace rejection tests pass | Manual pending | Host name normalization requires observation | Hard write boundary |
| Page ownership | Refuse existing unowned namespaced pages | Page properties + `Editor.getPage/createPage` | Ownership-property tests pass | Manual pending | File Graph serialization of page properties unknown | Prevent accidental business writes |
| Page reference adapter | Resolve number/string/`id`/`uuid`/`name` shapes | `Editor.getPage` | Shape parser tests pass | Manual pending | Other runtime shapes are refused and summarized | SDK compatibility seam |
| Block CRUD | Create/read/update/child/delete marked blocks | Editor block APIs | UUID/page safety predicates pass | Manual pending | Runtime transaction semantics unknown | Core data manipulation |
| UUID | Reread after update and deletion | `Editor.getBlock(uuid)` | UUID safety logic tested | Manual pending | Move/delete/undo stability unknown | Durable anchors |
| Query | Find property-bearing lab blocks | `DB.datascriptQuery` | Query code typechecked | Manual pending | DataScript property representation may vary | Index/list derivation |
| UI | Render current context, status, actions, errors | Main UI iframe APIs | Bundle/artifact pass | Manual pending | Styling varies by Logseq theme/version | Prototype interaction shell only |
| Settings | Persist three small settings | `useSettingsSchema`, `onSettingsChanged` | Schema typechecked | Manual pending | Persistence across reload unproven | User-controlled safe defaults |
| Versioned registry | Track multiple pages, blocks, runs, and probe keys | `FileStorage` + schema-v1 parser | Migration/corruption/multi-page tests pass | Manual pending | Unresolved legacy assets are retained and refused; no implicit page upgrade | Safe historical cleanup |
| FileStorage | Round-trip and separately remove non-sensitive JSON | `FileStorage.setItem/getItem/removeItem` | Key registration/removal tests pass | Manual pending | Physical location, Graph mobility, backup and sync uncertain | Plugin registry/cache only |
| Reset | Clean blocks/probe and rebuild Lab registry while retaining pages | Editor remove + FileStorage | Scope composition typechecked | Manual pending | Refused blocks deliberately prevent registry erasure | Recoverable experiments |
| Event | Observe route, Graph and DB transactions | `App.onRouteChanged`, `onCurrentGraphChanged`, `DB.onChanged` | Hook signatures typechecked | Manual pending | No dedicated stable editing-state hook claimed | Refresh/invalidation signals |
| Hidden metadata / body separation | Compare structured properties with body markers | Block `properties`, `BlockEntity.properties` | Marker/property flow typechecked | Manual pending | File serialization and UI display require inspection | Separating IDs/state from prose |
| Anchor stability | Edit/move/delete/undo lab blocks | UUID + manual Logseq actions | Safety guard tested only | Manual pending | Cannot be honestly automated without Desktop | Fundamental identity decision |
| Error handling | Surface latest failure and refuse unsafe delete | Guard wrapper, formatted errors | Pure error/safety tests pass | Manual pending | Host errors depend on Desktop | Safe failure behavior |
| Editing-state event | Reliably react to edit focus changes | No dedicated hook identified in SDK 0.0.17 | SDK declarations inspected | Unsupported/uncertain | Polling/DOM observer intentionally excluded | Do not make it an MVP assumption |

## Manual result record

After Desktop testing, append entries in this format without deleting the automated status:

```text
YYYY-MM-DD | Logseq x.y.z | capability | PASS/FAIL/PARTIAL | UUIDs/log/screenshot reference | cleanup result
```
