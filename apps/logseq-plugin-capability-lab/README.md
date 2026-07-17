# Logseq Plugin Capability Lab

A deliberately small, safety-bounded plugin used to test Logseq File Graph plugin capabilities. It is not the task-management MVP.

The plugin may write only below the fixed `Task Copilot Lab/` namespace (default: `Task Copilot Lab/Capability Lab`). Existing pages must also carry this plugin's page-owner properties. A versioned private registry records page UUIDs, block UUIDs, runs, and probe keys so historical pages remain cleanable after a setting change. Cleanup requires registry membership, both block markers, creation-time page UUID, and current page ownership.

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm ci
npm run check
```

In Logseq, **Load unpacked plugin** must select this directory, not `dist/`. See [docs/DEV_SETUP.md](docs/DEV_SETUP.md) and [docs/MANUAL_TEST_GUIDE.md](docs/MANUAL_TEST_GUIDE.md).
