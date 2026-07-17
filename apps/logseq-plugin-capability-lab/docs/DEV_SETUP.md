# Development Setup

## Scope and safety boundary

This package is only a Logseq Plugin Capability Lab. It must not implement Inbox, Task, MiniProject, Agent review, workflow state machines, or a production task-management UI.

Graph writes are permitted only after an explicit UI action and only below `Task Copilot Lab/`, initially `Task Copilot Lab/Capability Lab`. Existing pages must pass plugin ownership-property checks. Cleanup checks the versioned registry, visible block markers, creation-time page UUID, and current page ownership before calling `removeBlock`. The plugin never deletes experiment pages.

## Requirements

- Logseq Desktop with File Graph plugin support. The tested Graph is a Markdown/EDN File Graph, not a DB Graph.
- Git 2.39 or newer.
- Node.js 20 LTS. This machine uses Homebrew's keg-only Node 20.20.2.
- npm; do not create pnpm or Yarn lockfiles.

Node 20 is not linked globally on this machine. For each shell:

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
node --version   # expected v20.20.2 on this machine
npm --version    # expected 10.8.2 on this machine
```

On another machine with nvm:

```bash
nvm install 20
nvm use
```

Without nvm, macOS/Homebrew users can install the isolated formula:

```bash
brew install node@20
export PATH="$(brew --prefix node@20)/bin:$PATH"
```

Do not use `sudo` to replace the system Node.

## Install and verify

From the plugin directory:

```bash
cd /Users/wangrundong/work/任务管理中心-logseq插件/apps/logseq-plugin-capability-lab
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm ci
npm run check
```

`npm run check` runs package metadata validation, TypeScript typecheck, ESLint, pure-function tests, production build, and build-artifact validation. Runtime-dependent capabilities are intentionally not mocked.

Known dependency warning: stable `@logseq/libs@0.0.17` brings audit findings through its pinned `dompurify` and `lodash-es`. `npm audit fix --force` would switch to SDK 0.3.4 and is prohibited here because that is a compatibility-changing SDK jump. Review [FINDINGS.md](FINDINGS.md) before any future upgrade.

## Development and production commands

```bash
npm run dev        # watch build; reload plugin in Logseq after a rebuild
npm run build      # clean, deterministic production build to dist/
npm run typecheck
npm run lint
npm test
npm run check
```

The build tool is esbuild. `dist/` is generated and ignored by Git. `package-lock.json` is the only lockfile.

## Enable Developer mode and load the plugin

These are manual Logseq Desktop steps and have not been automated:

1. Close any production Graph and open `/Users/wangrundong/work/任务管理中心-logseq插件/logseq` as the dedicated test Graph.
2. Confirm Logseq Sync is not sending this experiment to a production environment.
3. Open **Settings** and enable **Developer mode**.
4. Open **Plugins**.
5. Click **Load unpacked plugin**.
6. Select `<dev-repo>/apps/logseq-plugin-capability-lab`; on this machine that is `/Users/wangrundong/work/任务管理中心-logseq插件/apps/logseq-plugin-capability-lab`.

Do not select `dist/`; the plugin root contains `package.json`, whose `logseq.main` points to `dist/index.html`.

## Reload after code changes

1. Keep `npm run dev` running.
2. Wait for esbuild to report a successful rebuild.
3. In Logseq's Plugins screen, reload the Capability Lab plugin (or disable and re-enable it).
4. Open the flask toolbar button and check the ready banner.
5. Inspect the developer console for `[wrd233-logseq-plugin-capability-lab] ready`.

Watch mode rebuilds files; it does not hot-reload Logseq's plugin runtime.

## Troubleshooting

- **Wrong Node version:** re-export the Node 20 PATH and rerun `node --version`.
- **No `dist/index.html`:** run `npm run build` from the plugin root.
- **Plugin does not load:** verify that Load unpacked selected the plugin root, then inspect Logseq's developer console.
- **No toolbar flask:** confirm Developer mode, plugin enabled state, and the ready log; reload once.
- **Graph writes are refused:** confirm the configured page name matches the block's actual page and the block has both `capability-lab:: true` and `capability-lab-owner:: wrd233-logseq-plugin-capability-lab`.
- **Cleanup refuses a block:** do not bypass the guard. Copy the error and UUID into the manual test record and inspect the block/page manually.
- **DataScript query differs by Logseq version:** record the exact Logseq version and error. Do not replace it with DOM scraping.
- **npm audit warnings:** do not run a forced upgrade. The SDK compatibility decision is tracked in `FINDINGS.md`.

## Clean experiment data

1. Open the Capability Lab panel.
2. Click **清理已注册实验 Block** and confirm; verify deleted, missing, and refused lists.
3. Click **清理 FileStorage Probe** and confirm; verify the reread reports the key missing.
4. To clear both and rebuild the registry, use **重置 Capability Lab 状态**. A refusal prevents registry erasure so an owned block cannot become an orphan silently.
5. Open every historical `Task Copilot Lab/...` page listed in the runtime evidence and inspect remaining blocks.
6. Lab pages are deliberately retained. Delete one manually only after confirming it contains no wanted data.

## Uninstall

1. Run cleanup first.
2. Disable/remove the unpacked plugin from Logseq's Plugins screen.
3. Close Logseq before checking Git status, so Graph auto-save does not obscure repository review.
4. Do not delete plugin-private storage until its location and backup impact have been manually established.
