# Personal Operations System / Logseq Plugin

This is the authoritative development repository for the personal operations system's Logseq plugin. It is currently limited to the **Logseq Plugin Capability Lab**; it does not implement the task-management MVP.

## Repository layout

- `apps/logseq-plugin-capability-lab/` — plugin source, tests, build, and capability documentation.
- `docs/` — repository boundaries, workflow, and research status.
- `scripts/` — unified checks for source quality and repository isolation.
- `logseq/` — ignored local Logseq File Graph fixture with its own nested Git repository.

The test Graph is intentionally absent from the outer Git index. Logseq and local automation may freely make it dirty; those runtime changes are not an outer source commit gate.

## Install and check

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd apps/logseq-plugin-capability-lab
npm ci
npm run check
```

Run the complete repository workflow from the outer root:

```bash
./scripts/check.sh
```

## Load in Logseq

Build the plugin, open the local `logseq/` Graph in Logseq Desktop, enable Developer mode, and choose **Load unpacked plugin** with:

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/logseq-plugin-capability-lab
```

Do not select `dist/` or the old path under the Graph. Follow the plugin's `docs/MANUAL_TEST_GUIDE.md` and record evidence in `docs/RUNTIME_TEST_LOG.md`.

## Why the Graph is ignored

The Graph is mutable runtime data: Logseq may auto-save pages, plugin experiments create marked blocks, and other local processes may update pages. Tracking it from the outer repository would mix product source with test-fixture state. Its nested `.git` is preserved for local provenance, but neither repository may be pushed while the local pre-push guards are installed.
