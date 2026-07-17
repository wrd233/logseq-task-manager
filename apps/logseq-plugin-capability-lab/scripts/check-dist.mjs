import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = ["dist/index.html", "dist/index.js", "dist/index.css"];
for (const relative of required) {
  const path = resolve(root, relative);
  await access(path);
  assert.ok((await stat(path)).size > 0, `${relative} must not be empty.`);
}

const html = await readFile(resolve(root, "dist/index.html"), "utf8");
assert.match(html, /\.\/index\.js/);
assert.match(html, /\.\/index\.css/);
console.log("Build artifact check passed.");
