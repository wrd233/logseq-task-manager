# Capability Matrix

Status vocabulary: **automated pass** means only static/pure/build checks ran; **manual pending** means Logseq Desktop has not verified it; **unsupported/uncertain** is not a hidden pass.

| Capability | Goal | Logseq API | Automated verification | Manual verification | Limits | Future MVP relevance |
|---|---|---|---|---|---|---|
| Lifecycle | Initialize once and unload safely | `logseq.ready`, `beforeunload` | Typecheck/build pass | Manual pending | Desktop load/reload required | Basic plugin reliability |
| Toolbar | Open a restrained lab panel | `App.registerUIItem('toolbar')` | Typecheck/build pass | Manual pending | Host rendering/version dependent | Possible future entrypoint |
| Command | Open from command palette | `App.registerCommandPalette` | Typecheck/build pass | Manual pending | Registration only proven statically | Keyboard-first access |
| Slash command | Equivalent editor entry | `Editor.registerSlashCommand` | Typecheck/build pass | Manual pending | Editing behavior requires Desktop | Optional quick action |
| Current context | Read Graph, page, editing block and relationships | `App.getCurrentGraph`, `Editor.getCurrentPage`, `getCurrentBlock` | Typecheck/build pass | Manual pending | Values may legitimately be null | Context-aware operations |
| Page | Find/create/open only dedicated test page | `Editor.getPage`, `createPage`, `App.pushState` | Safety flow typechecked | Manual pending | Page creation writes Graph | Controlled workspace boundary |
| Block CRUD | Create/read/update/child/delete marked blocks | Editor block APIs | Safety predicates 4/4 tests pass | Manual pending | Runtime transaction semantics unknown | Core data manipulation |
| UUID | Reread after update and deletion | `Editor.getBlock(uuid)` | UUID safety logic tested | Manual pending | Move/delete/undo stability unknown | Durable anchors |
| Query | Find property-bearing lab blocks | `DB.datascriptQuery` | Query code typechecked | Manual pending | DataScript property representation may vary | Index/list derivation |
| UI | Render current context, status, actions, errors | Main UI iframe APIs | Bundle/artifact pass | Manual pending | Styling varies by Logseq theme/version | Prototype interaction shell only |
| Settings | Persist three small settings | `useSettingsSchema`, `onSettingsChanged` | Schema typechecked | Manual pending | Persistence across reload unproven | User-controlled safe defaults |
| FileStorage | Round-trip non-sensitive JSON | `FileStorage.setItem/getItem` | API/type/build pass | Manual pending | Physical location, Graph mobility, backup and sync uncertain | Plugin registry/cache only |
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
