import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(pkg.private, true);
assert.equal(pkg.main, "dist/index.html");
assert.equal(pkg.logseq.id, "task-copilot-personal-mvp");
assert.equal(pkg.logseq.main, "dist/index.html");
assert.equal(pkg.dependencies["@logseq/libs"], "0.0.17");
console.log("Task Copilot package metadata passed.");
