# Development Workflow

```text
Modify outer plugin source
→ npm run check
→ Load unpacked / reload plugin
→ Run experiments in the inner Graph
→ Record Runtime Test Log evidence
→ Check outer Git only
→ Commit outer source
```

## Command sequence

From the outer root:

```bash
./scripts/check.sh
git status --short
git diff --check
git diff --stat
git diff
```

The unified check uses Node 20, performs a clean lockfile install, runs all plugin checks, validates repository boundaries, and checks patch whitespace. It may display `git -C logseq status --short`, always labeled informational.

For the manual runtime pass, build first and load `<dev-repo>/apps/logseq-plugin-capability-lab`. Only marked, plugin-owned assets in the fixed lab namespace may be created. Never move the source back under the Graph.

Do not push either repository. Do not treat an inner Graph change such as `pages/task-copilot-logseq-bridge.md` as a source failure.
