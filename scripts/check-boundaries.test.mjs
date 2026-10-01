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
