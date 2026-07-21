import assert from "node:assert/strict";
import test from "node:test";

import { parseServiceRunnerArgs } from "../src/runner.ts";

test("Service runner requires explicit database, Graph identity, and descriptor paths", () => {
  assert.deepEqual(parseServiceRunnerArgs([
    "--database", "/graph/.task-copilot/task-copilot.db",
    "--graph-id", "graph-1",
    "--descriptor", "/runtime/task-copilot/graph-1.json",
  ]), {
    mode: "serve",
    databasePath: "/graph/.task-copilot/task-copilot.db",
    graphId: "graph-1",
    descriptorPath: "/runtime/task-copilot/graph-1.json",
  });
  assert.throws(() => parseServiceRunnerArgs(["--database", "/tmp/db"]), /Usage/);
  assert.throws(() => parseServiceRunnerArgs(["--unknown", "value", "--database", "/tmp/db", "--graph-id", "g", "--descriptor", "d"]), /Usage/);
});

test("Schema migration runner is explicit and requires a new backup path", () => {
  assert.deepEqual(parseServiceRunnerArgs([
    "migrate-schema", "--database", "/tmp/task.db", "--graph-id", "graph-a", "--backup", "/tmp/pre-v7.db",
  ]), { mode: "migrate-schema", databasePath: "/tmp/task.db", graphId: "graph-a", backupPath: "/tmp/pre-v7.db" });
  assert.throws(() => parseServiceRunnerArgs(["migrate-schema", "--database", "/tmp/task.db", "--graph-id", "graph-a"]), /--backup/);
  assert.throws(() => parseServiceRunnerArgs(["migrate-schema", "--database", "/tmp/task.db", "--graph-id", "graph-a", "--backup", "/tmp/pre-v7.db", "--descriptor", "/tmp/service.json"]), /Usage/);
});
