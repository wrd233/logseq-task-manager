import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../dist/", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const script = await readFile(new URL("index.js", root), "utf8");
const css = await readFile(new URL("index.css", root), "utf8");
assert.match(html, /index\.js/);
assert.match(html, /index\.css/);
assert.ok(script.length > 10_000, "bundled application is unexpectedly small");
assert.ok(css.length > 1_000, "stylesheet is unexpectedly small");
assert.ok((await stat(new URL("index.js", root))).size < 1_000_000, "bundle exceeds restrained MVP budget");
console.log("Task Copilot dist integrity passed.");
