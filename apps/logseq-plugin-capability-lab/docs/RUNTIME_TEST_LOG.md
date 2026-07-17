# Runtime Test Log

This file records Logseq Desktop evidence. Static compilation or automated pure-function tests must never be entered as a runtime pass.

## Run template

### Run ID: YYYY-MM-DD-logseq-version-short-label

| Field | Value |
|---|---|
| Date/time | |
| Logseq Desktop version | |
| Plugin commit | |
| Graph path | `/Users/wangrundong/work/任务管理中心-logseq插件/logseq` |
| Plugin load path | `/Users/wangrundong/work/任务管理中心-logseq插件/apps/logseq-plugin-capability-lab` |
| Sync confirmed safe/off | |
| Tester | |

| Step | Expected | Actual | UUID/page identity | Error/console | Screenshot path | Result |
|---|---|---|---|---|---|---|
| Toolbar registered once | One flask after load/reloads | | | | | PENDING |
| Command palette | Opens same panel | | | | | PENDING |
| Slash command | Opens panel only | | | | | PENDING |
| Owned page creation | Three ownership properties persist | | | | | PENDING |
| `Editor.getPage` shape | Record exact returned shape | | | | | PENDING |
| Block `page` shape | Record number/object/string shape | | | | | PENDING |
| UUID edit/move/delete/undo | Record each lookup result | | | | | PENDING |
| Settings reload | Values persist | | | | | PENDING |
| FileStorage reload | Probe and registry persist | | | | | PENDING |
| FileStorage location | Record read-only filesystem evidence | | | | | PENDING |
| FileStorage Graph sync traits | Record whether Graph switching/sync includes or excludes plugin storage; do not infer | | | | | PENDING |
| DB event count | No unexplained duplicates | | | | | PENDING |
| Reload unload | Listeners do not multiply | | | | | PENDING |
| Historical pages cleanup | Setting change does not orphan assets | | | | | PENDING |
| Hidden machine metadata | Record actual File Graph rendering/storage | | | | | PENDING |
| Block cleanup | Deleted/missing/refused accurate | | | | | PENDING |
| Probe cleanup/reset | Only Lab keys/state removed | | | | | PENDING |

### Run conclusion

- Confirmed:
- Partial:
- Failed:
- Still unknown:
- Cleanup performed:
- Inner Graph runtime changes (informational only):
- Capability Matrix rows updated:
