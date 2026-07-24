import assert from "node:assert/strict";
import { chmod, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadLauncherConfig } from "../src/config-loader.ts";

function config(root: string) {
  return {
    schemaVersion: 1,
    listenPort: 19673,
    token: "d".repeat(48),
    serviceEntryPath: join(root, "service.js"),
    runtimeRoot: join(root, "runtime"),
    descriptorPath: join(root, "launcher.json"),
    leaseTtlMs: 15_000,
    graphs: [{ graphKey: "graph-key", graphId: "graph-id", databasePath: join(root, "graph.sqlite") }],
  };
}

test("launcher config loader accepts only a private non-link file", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-launcher-config-"));
  const path = join(root, "config.json");
  await writeFile(path, JSON.stringify(config(root)), { mode: 0o600 });
  assert.deepEqual(await loadLauncherConfig(path), config(root));

  await chmod(path, 0o644);
  await assert.rejects(() => loadLauncherConfig(path), /LAUNCHER_CONFIG_INSECURE/);

  const target = join(root, "target.json");
  const link = join(root, "link.json");
  await writeFile(target, JSON.stringify(config(root)), { mode: 0o600 });
  await symlink(target, link);
  await assert.rejects(() => loadLauncherConfig(link), /LAUNCHER_CONFIG_INSECURE/);
});
