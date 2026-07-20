import assert from "node:assert/strict";
import test from "node:test";

import { parseServiceRunnerArgs } from "../src/runner.ts";

test("Service runner requires explicit database, Graph identity, and descriptor paths", () => {
  assert.deepEqual(parseServiceRunnerArgs([
    "--database", "/graph/.task-copilot/task-copilot.db",
    "--graph-id", "graph-1",
    "--descriptor", "/runtime/task-copilot/graph-1.json",
  ]), {
    databasePath: "/graph/.task-copilot/task-copilot.db",
    graphId: "graph-1",
    descriptorPath: "/runtime/task-copilot/graph-1.json",
  });
  assert.throws(() => parseServiceRunnerArgs(["--database", "/tmp/db"]), /Usage/);
  assert.throws(() => parseServiceRunnerArgs(["--unknown", "value", "--database", "/tmp/db", "--graph-id", "g", "--descriptor", "d"]), /Usage/);
});
