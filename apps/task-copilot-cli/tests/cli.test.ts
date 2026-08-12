import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/cli.ts";

const client = {
  status: async () => ({ status: "ok" as const, schemaVersion: 1, pid: 42 }),
  listObjects: async () => ({ objects: [{ id: "work-01", kind: "TASK" as const, title: "Task", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, version: 1, createdAt: "now", updatedAt: "now" }] }),
  showObject: async (id: string) => ({ object: { id, kind: "TASK" as const, title: "Task", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, version: 1, createdAt: "now", updatedAt: "now" }, anchor: null }),
  showCommit: async (id: string) => ({ commit: { id } as never }),
  listRecovery: async () => ({ recovery: [] }),
};

test("all reference commands support machine-readable output", async () => {
  for (const args of [["status"], ["object", "list"], ["object", "show", "work-01"], ["commit", "show", "commit-01"], ["recovery", "list"]]) {
    const output: string[] = [];
    assert.equal(await runCli([...args, "--json"], client, { out: (line) => output.push(line), err: () => undefined }), 0);
    assert.doesNotThrow(() => JSON.parse(output[0]!));
  }
});

test("unknown commands fail without touching a fallback database", async () => {
  const errors: string[] = [];
  assert.equal(await runCli(["db", "patch"], client, { out: () => undefined, err: (line) => errors.push(line) }), 2);
  assert.match(errors[0]!, /Usage/u);
});
