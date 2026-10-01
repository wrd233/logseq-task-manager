import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rename, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MaterialStore, ConflictError, makeLink, normalizeRoot, restoreCapture, type FileIO } from "../src/features/materials/store.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "workbench-material-"));
  const io: FileIO = { read: path => readFile(path, "utf8"), write: (path, text) => writeFile(path, text), mkdir: async path => { await mkdir(path, {recursive: true}); }, rename, list: readdir };
  return { root, io, store: new MaterialStore(io, root), cleanup: () => rm(root, {recursive: true, force: true}) };
}

test("independent material instances retain every capture without a shared catalog", async () => {
  const f = await fixture();
  try {
    const other = new MaterialStore(f.io, f.root);
    const docs = await Promise.all(Array.from({length: 16}, (_, i) => (i % 2 ? f.store : other).create(`文档 ${i}\n自动同步`, {graph: "/g"})));
    assert.equal((await f.store.catalog()).length, 16);
    assert.equal((await other.search("同步", "/g")).length, 16);
    assert.equal((await other.search("同步", "/other")).length, 0);
    for (const doc of docs) assert.equal((await f.store.record(doc.id)).id, doc.id);
  } finally { await f.cleanup(); }
});
test("capture keeps exact original and restoring rejects duplicate or changed references", async () => {
  const f = await fixture();
  try {
    const original = "# 示例\r\n\r\n```js\r\n中\r\n```\r\n", doc = await f.store.create(original, {sourceUuid: "source"});
    await f.store.save(doc.id, original, "later edit");
    assert.equal(restoreCapture(`前 ${makeLink(doc)} 后`, await f.store.record(doc.id)), `前 ${original} 后`);
    assert.throws(() => restoreCapture(makeLink(doc) + makeLink(doc), doc));
    assert.throws(() => restoreCapture("changed", doc));
  } finally { await f.cleanup(); }
});
test("associated Markdown remains at its original path and saves preserve history", async () => {
  const f = await fixture();
  try {
    const path = join(f.root, "existing.md"); await writeFile(path, "# Existing\nbase");
    const doc = await f.store.reference(path, {graph: "/g"});
    assert.equal(doc.kind, "reference"); assert.equal(await f.store.path(doc.id), path);
    assert.equal(await f.store.read(doc.id), "# Existing\nbase");
    await f.store.save(doc.id, "# Existing\nbase", "# Existing\nnext");
    assert.equal(await readFile(path, "utf8"), "# Existing\nnext");
    const history = await readdir(join(f.root, ".longdoc/history"));
    assert.equal(await readFile(join(f.root, ".longdoc/history", history[0]!), "utf8"), "# Existing\nbase");
    assert.throws(() => restoreCapture(makeLink(doc), doc));
  } finally { await f.cleanup(); }
});
test("external edits and backup failures never overwrite a stale source", async () => {
  const f = await fixture();
  try {
    const doc = await f.store.create("base"); await writeFile(f.store.file(doc.id), "external");
    await assert.rejects(f.store.save(doc.id, "base", "local"), ConflictError);
    const write = f.io.write;
    f.io.write = (path, text) => path.includes("/history/") ? Promise.reject(new Error("disk full")) : write(path, text);
    await assert.rejects(f.store.save(doc.id, "external", "local"), /disk full/);
    assert.equal(await f.store.read(doc.id), "external");
  } finally { await f.cleanup(); }
});
test("external write during backup is detected, and silent IO failure is not a save", async () => {
  const f = await fixture();
  try {
    const doc = await f.store.create("base"), write = f.io.write;
    f.io.write = async (path, text) => { await write(path, text); if (path.includes("/history/")) await write(f.store.file(doc.id), "external"); };
    await assert.rejects(f.store.save(doc.id, "base", "local"), ConflictError);
    f.io.write = async () => undefined;
    await assert.rejects(f.store.save(doc.id, "external", "local"));
    assert.equal(await f.store.read(doc.id), "external");
  } finally { await f.cleanup(); }
});
test("record commit failures retain the body and invalid roots are refused", async () => {
  const f = await fixture();
  try {
    const write = f.io.write;
    f.io.write = (path, text) => path.endsWith(".json") ? Promise.reject(new Error("record failed")) : write(path, text);
    await assert.rejects(f.store.create("original"), /record failed/);
    const bodies = (await readdir(f.root)).filter(path => path.endsWith(".md"));
    assert.equal(await readFile(join(f.root, bodies[0]!), "utf8"), "original");
    for (const root of ["relative", "/", "/graph", "/graph/docs", "/x/../graph"]) assert.throws(() => normalizeRoot(root, "/graph"));
  } finally { await f.cleanup(); }
});
