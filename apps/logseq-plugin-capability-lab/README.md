# Logseq Plugin Capability Lab

A deliberately small, safety-bounded plugin used to test Logseq File Graph plugin capabilities. It is not the task-management MVP.

The plugin may write only to the configured experiment page (default: `Logseq Plugin Capability Lab`). Every created block carries visible ownership markers and is recorded in plugin-private storage. Cleanup requires registry membership, both markers, and an exact owning-page match.

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm ci
npm run check
```

In Logseq, **Load unpacked plugin** must select this directory, not `dist/`. See [docs/DEV_SETUP.md](docs/DEV_SETUP.md) and [docs/MANUAL_TEST_GUIDE.md](docs/MANUAL_TEST_GUIDE.md).
