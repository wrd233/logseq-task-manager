import test from "node:test";
import assert from "node:assert/strict";
import { assertImportBoundaries } from "./check-boundaries.mjs";

for (const extension of ["ts", "mjs"]) {
  test(`work-view rejects task UI imports, re-exports and dynamic imports in .${extension}`, () => {
    const path = `apps/logseq-plugin/src/features/work-view/probe.${extension}`;
    for (const code of [
      'import { taskIdentity } from "../task-center/controller.ts";',
      'export * from "../task-center/controller.ts";',
      'const ui = import("../task-center/controller.ts");',
      'const ui = require("../task-center/controller.ts");',
    ]) assert.throws(() => assertImportBoundaries(path, code), /Work view must not depend on task UI/u);
    assert.doesNotThrow(() => assertImportBoundaries(path, 'import { lookupBlockIdentity } from "../../block-identity.ts";'));
    assert.doesNotThrow(() => assertImportBoundaries(path, '// import("../task-center/controller.ts") is forbidden'));
  });
}

test("shared contracts reject infrastructure imports while allowing domain types", () => {
  for (const name of ["node:crypto", "fs", "@logseq/libs", "@task-copilot/sqlite", "@task-copilot/client/browser"]) {
    assert.throws(() => assertImportBoundaries("packages/contracts/src/probe.ts", `import value from "${name}";`), /browser-safe/u);
  }
  assert.doesNotThrow(() => assertImportBoundaries("packages/contracts/src/probe.ts", 'import type { WorkObject } from "@task-copilot/domain";'));
  assert.throws(() => assertImportBoundaries("packages/kernel/src/probe.mjs", 'import "@logseq/libs";'), /Kernel must not depend/u);
});

test("runtime cannot import feature UI and task UI cannot own worker lifecycle", () => {
  assert.throws(() => assertImportBoundaries("apps/logseq-plugin/src/plugin-runtime.ts", 'import { startTaskCenter } from "./features/task-center/controller.ts";'), /Runtime must not depend/u);
  assert.throws(() => assertImportBoundaries("apps/logseq-plugin/src/features/task-center/controller.ts", 'import {startGraphGatewayWorker} from "../../graph-gateway-worker.ts";'), /must not own background/u);
});

test("formal and query capabilities depend on structural ports rather than SQLite implementation", () => {
  for (const path of ["packages/kernel/src/index.ts", "apps/kernel-service/src/projection-coordinator.ts", "apps/kernel-service/src/maintenance-coordinator.ts", "apps/kernel-service/src/projection-delivery.ts"]) {
    assert.throws(() => assertImportBoundaries(path, 'import type {SqliteStore} from "@task-copilot/sqlite";'), /storage port/u);
  }
  assert.doesNotThrow(() => assertImportBoundaries("apps/kernel-service/src/server.ts", 'import {SqliteStore} from "@task-copilot/sqlite";'));
});

for (const extension of ["ts", "mjs"]) {
  test(`host file capability rejects feature imports in .${extension}`, () => {
    const path = `apps/logseq-plugin/src/host/desktop-files.${extension}`;
    for (const code of [
      'import type { FileIO } from "../features/materials/store.ts";',
      'export * from "../features/materials/store.ts";',
      'const store = import("../features/materials/store.ts");',
    ]) assert.throws(() => assertImportBoundaries(path, code), /host must not depend/u);
    assert.doesNotThrow(() => assertImportBoundaries(path, 'import type {FileIO} from "./file-io.ts";'));
  });
}
