# Repository Boundaries

## 1. Source boundary

The outer Git top-level is `/Users/wangrundong/work/任务管理中心-logseq插件`. The only authoritative Capability Lab source is `apps/logseq-plugin-capability-lab/`. Source, tests, package lock, scripts, and research documents belong to the outer index.

The former `logseq/tools/logseq-plugin-capability-lab/` path is invalid and must not reappear.

## 2. Graph runtime boundary

`logseq/` is a local Logseq File Graph fixture and a separate nested Git repository. The outer `.gitignore` excludes the entire directory; the outer repository must never track a Graph page, Journal, asset, configuration file, nested `.git`, or runtime-generated test data.

> Inner Graph dirty is a normal runtime state, not an outer development blocker.

The inner repository may be inspected for diagnostics, but its status is informational only. It is not a submodule, and the outer index must not contain a gitlink.

## 3. Build-artifact boundary

Dependencies, `dist/`, coverage, caches, logs, and OS metadata are generated locally and ignored at every depth. `package-lock.json`, TypeScript configuration, ESLint configuration, source, tests, and docs are committed. `dist/index.html`, `dist/index.js`, and `dist/index.css` must exist after checks but remain untracked.

## 4. Remote and push boundary

No remote push is authorized. Local `pre-push` hooks in both `.git/hooks/pre-push` files reject every push. Hooks are local safety facilities and are not committed. The inner origin fetch URL is preserved; no outer remote is configured by this bootstrap.

Destructive cross-boundary commands such as `git reset --hard` and `git clean -fdx` are prohibited. Any future remote or push workflow requires explicit user authorization.
