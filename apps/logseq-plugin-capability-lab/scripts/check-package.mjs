import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
for (const required of [
  "src/domain.ts",
  "src/registry.ts",
  "tests/domain.test.ts",
  "tests/registry.test.ts",
  "docs/MANUAL_TEST_GUIDE.md",
  "docs/CAPABILITY_MATRIX.md",
  "docs/RUNTIME_TEST_LOG.md",
]) {
  await access(resolve(root, required));
}
console.log("Package metadata check passed.");
