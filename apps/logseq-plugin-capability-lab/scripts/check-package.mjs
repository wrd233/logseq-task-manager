import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

assert.equal(pkg.private, true, "The lab package must remain private.");
assert.equal(pkg.logseq.id, "wrd233-logseq-plugin-capability-lab");
assert.equal(pkg.logseq.main, "dist/index.html");
assert.equal(pkg.dependencies["@logseq/libs"], "0.0.17");
assert.deepEqual(Object.keys(pkg.scripts).sort(), [
  "build", "check", "check:dist", "check:package", "dev", "lint", "test", "typecheck",
].sort());
console.log("Package metadata check passed.");
