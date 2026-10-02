import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileIO } from "../src/host/file-io.ts";
import { MaterialDirectories, type MaterialWorkContext } from "../src/workspace/material-context.ts";
import { MaterialService } from "../src/features/materials/service.ts";
import { MaterialStore, makeLink, restoreCapture, versionOf } from "../src/features/materials/store.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "materials-module-"));
  const globalRoot = join(root, "global"), a = join(root, "A"), b = join(root, "B");
  for (const path of [globalRoot, a, b]) await mkdir(path);
  const io: FileIO = {read: path => readFile(path, "utf8"), write: (path, text) => writeFile(path, text), mkdir: async path => { await mkdir(path, {recursive: true}); }, list: readdir, rename, stat: async path => { const value = await stat(path); return {type: value.isDirectory() ? "directory" : "file", size: value.size}; }};
  const values = new Map<string, string>();
  const storage = {get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}, removeItem: (key: string) => {values.delete(key);} };
  const directories = new MaterialDirectories(storage), graph = join(root, "graph");
  const context = (directory: string | null, sourceUuid = "task-A", organization: "flat" | "project" = "flat"): MaterialWorkContext => ({graph, sourceUuid, directory, organization});
  const service = new MaterialService(io, directories, graph, globalRoot, text => text);
  return {root, globalRoot, a, b, graph, context, service, io, directories, storage, cleanup: () => rm(root, {recursive: true, force: true})};
}

test("capture chooses flat Task, existing Project purpose directories and global fallback without moving old files", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.b, "materials")); await mkdir(join(f.b, "notes"));
    const flat = await f.service.capture({requestKey: "flat", text: "# 工作材料"}, f.context(f.a));
    const project = await f.service.capture({requestKey: "project", text: "资料"}, f.context(f.b, "project", "project"));
    const draft = await f.service.capture({requestKey: "draft", text: "工作稿", role: "draft"}, f.context(f.b, "project", "project"));
    const global = await f.service.capture({requestKey: "global", text: "全局"}, f.context(null));
    assert.equal(flat.material.path, join(f.a, "工作材料.md"));
    assert.equal(project.material.recordRoot, join(f.b, "materials"));
    assert.equal(draft.material.recordRoot, join(f.b, "notes"));
    assert.equal(global.material.recordRoot, f.globalRoot);
    assert.equal((await f.service.read(flat.material.id)).path, flat.material.path);
    assert.deepEqual((await readdir(f.a)).sort(), [".longdoc", "工作材料.md"]);
  } finally {await f.cleanup();}
});
test("unavailable explicit work directory retains input and never falls back to global", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.service.capture({requestKey: "missing", text: "keep"}, f.context(join(f.root, "missing"))), /工作目录暂不可用/);
    assert.deepEqual(await readdir(f.globalRoot), []);
  } finally {await f.cleanup();}
});
test("stable ID survives title changes, directory switches and multiple task associations without body copies", async () => {
  const f = await fixture();
  try {
    const a = await f.service.capture({requestKey: "a", text: "# 一个标题"}, f.context(f.a));
    const {store, record} = await f.service.locate(a.material.id);
    const oldLink = makeLink(record); await store.update(record.id, value => ({...value, title: "新标题"}));
    await f.service.capture({requestKey: "b", text: "# 一个标题"}, f.context(f.b, "task-B"));
    const related = await f.service.associate(record.id, f.context(f.b, "task-B"));
    assert.equal(related.material.path, a.material.path); assert.equal(related.material.associations.length, 2);
    assert.equal((await f.service.list("", "task-B")).length, 2);
    assert.equal(restoreCapture(oldLink, await store.record(record.id)), "# 一个标题");
    assert.equal((await readdir(f.b)).filter(path => path.endsWith(".md")).length, 1);
    const restarted = new MaterialService(f.io, new MaterialDirectories(f.storage), f.graph, f.globalRoot, text => text);
    assert.equal((await restarted.read(record.id)).title, "新标题");
  } finally {await f.cleanup();}
});
test("same-title concurrent captures get readable distinct names and duplicate requests return the original versioned identity", async () => {
  const f = await fixture();
  try {
    const docs = await Promise.all(["1", "2"].map(requestKey => f.service.capture({requestKey, text: "# Same"}, f.context(f.a))));
    assert.notEqual(docs[0]!.material.id, docs[1]!.material.id); assert.notEqual(docs[0]!.material.path, docs[1]!.material.path);
    assert.ok(docs.some(doc => doc.material.path.endsWith("/Same.md"))); assert.ok(docs.some(doc => /Same-[0-9a-f]{8}\.md$/.test(doc.material.path)));
    const request = {requestKey: "replay", text: "repeat"};
    const results = await Promise.all(Array.from({length: 4}, () => f.service.capture(request, f.context(f.a))));
    assert.equal(new Set(results.map(result => result.material.id)).size, 1);
    const restarted = new MaterialService(f.io, f.directories, f.graph, f.globalRoot, text => text);
    assert.equal((await restarted.capture(request, f.context(f.a))).material.id, results[0]!.material.id);
    await assert.rejects(restarted.capture({...request, text: "changed"}, f.context(f.a)), /重复请求/);
  } finally {await f.cleanup();}
});
test("reference/input defaults deny writes; explicit user editing and whole-file agent grants are independent", async () => {
  const f = await fixture();
  try {
    const path = join(f.a, "original.md"); await writeFile(path, "TODO is content");
    const reference = await f.service.associateFile(path, f.context(f.a));
    const {store} = await f.service.locate(reference.material.id);
    await assert.rejects(store.save(reference.material.id, "TODO is content", "modified"), /未授权/);
    await assert.rejects(f.service.save(reference.material.id, reference.material.version!, reference.material.content!, "agent edit", "agent"), /未授权/);
    await store.grantEditing(reference.material.id);
    await store.save(reference.material.id, "TODO is content", "user edit");
    await assert.rejects(f.service.save(reference.material.id, await versionOf("user edit"), "user edit", "agent edit", "agent"), /未授权/);
    await store.grantEditing(reference.material.id, true);
    const saved = await f.service.save(reference.material.id, await versionOf("user edit"), "user edit", "agent edit", "agent");
    assert.equal(saved.status, "success"); assert.equal(await readFile(path, "utf8"), "agent edit");
    const input = await f.service.capture({requestKey: "input", text: "input"}, f.context(f.a));
    assert.deepEqual(input.material.capabilities.edit, {user: false, agent: false});
    const output = await f.service.capture({requestKey: "output", text: "output"}, f.context(f.a), "agent");
    assert.deepEqual(output.material.capabilities.edit, {user: true, agent: true});
    await writeFile(output.material.path, "human later");
    const conflict = await f.service.save(output.material.id, output.material.version!, "output", "stale agent", "agent");
    assert.equal(conflict.status, "conflict"); assert.equal(await readFile(output.material.path, "utf8"), "human later");
  } finally {await f.cleanup();}
});
test("missing material preserves associations and explicit relocation preserves identity, originals and history", async () => {
  const f = await fixture();
  try {
    const result = await f.service.capture({requestKey: "move", text: "original", role: "draft"}, f.context(f.a));
    const {store} = await f.service.locate(result.material.id); await store.save(result.material.id, "original", "current");
    const moved = join(f.b, "moved.md"); await rename(result.material.path, moved);
    const missing = await f.service.read(result.material.id); assert.equal(missing.availability, "unavailable"); assert.equal(missing.associations.length, 1);
    await store.relocate(result.material.id, moved);
    const found = await f.service.read(result.material.id); assert.equal(found.content, "current"); assert.equal(found.id, result.material.id);
    assert.equal(restoreCapture(found.reference, await store.record(found.id)), "original");
    assert.equal((await readdir(join(f.a, ".longdoc/history"))).length, 1);
  } finally {await f.cleanup();}
});
test("PDF association declares external-only capability and preserves binary bytes", async () => {
  const f = await fixture();
  try {
    const path = join(f.a, "参考.pdf"), bytes = Buffer.from([0, 255, 3, 4]); await writeFile(path, bytes);
    const result = await f.service.associateFile(path, f.context(f.a));
    assert.equal(result.material.content, null); assert.equal(result.material.version, null); assert.equal(result.material.capabilities.read, "external");
    await assert.rejects(f.service.save(result.material.id, "fake", "", "bad", "agent"), /未授权/);
    assert.deepEqual(await readFile(path), bytes);
  } finally {await f.cleanup();}
});
test("legacy UUID records and longdoc references remain readable without metadata migration", async () => {
  const f = await fixture();
  try {
    const id = crypto.randomUUID(), store = new MaterialStore(f.io, f.globalRoot); await store.init();
    const record = {id, title: "Old", kind: "capture", createdAt: "2025-01-01", original: "before", graph: f.graph, sourceUuid: "old"};
    await writeFile(join(f.globalRoot, ".longdoc", `${id}.json`), JSON.stringify(record)); await writeFile(store.file(id), "after");
    const view = await f.service.read(id); assert.equal(view.content, "after"); assert.equal(view.path, store.file(id));
    assert.deepEqual(view.capabilities.edit, {user: true, agent: false});
    assert.equal(await readFile(join(f.globalRoot, ".longdoc", `${id}.json`), "utf8"), JSON.stringify(record));
  } finally {await f.cleanup();}
});
test("partial capture can resume with the same request after failure and never duplicates or overwrites an external edit", async () => {
  const f = await fixture();
  try {
    const write = f.io.write; let fail = true;
    f.io.write = (path, text) => fail && path.endsWith(".md") ? Promise.reject(new Error("disk full")) : write(path, text);
    const request = {requestKey: "partial", text: "original"};
    const partial = await f.service.capture(request, f.context(f.a)); assert.equal(partial.status, "partial");
    assert.equal(partial.material.availability, "unavailable");
    fail = false;
    const resumed = await f.service.capture(request, f.context(f.a)); assert.equal(resumed.status, "success"); assert.equal(resumed.material.id, partial.material.id);
    assert.equal((await readdir(f.a)).filter(path => path.endsWith(".md")).length, 1);
  } finally {await f.cleanup();}
});
test("directory bindings persist by Graph and source, and location hints rebuild solely from exact records", async () => {
  const f = await fixture();
  try {
    f.directories.bind(f.context(f.a));
    assert.equal(new MaterialDirectories(f.storage).binding(f.graph, "task-A")?.directory, f.a);
    assert.equal(f.directories.binding("other", "task-A"), null);
    const result = await f.service.capture({requestKey: "hint", text: "record"}, f.context(f.a));
    for (let i = f.storage.length - 1; i >= 0; i--) { const key = f.storage.key(i)!; if (key.includes("material-locator")) f.storage.removeItem(key); }
    const service = new MaterialService(f.io, f.directories, f.graph, f.globalRoot, text => text);
    assert.equal((await service.read(result.material.id)).path, result.material.path);
  } finally {await f.cleanup();}
});

test("case-insensitive readable names preserve an existing file, pending resume refuses later external content, and whole-block recovery protects added text/properties", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.a, "TITLE.md"), "existing");
    const result = await f.service.capture({requestKey: "case", text: "# title"}, f.context(f.a));
    assert.notEqual(result.material.path.toLowerCase(), join(f.a, "TITLE.md").toLowerCase()); assert.equal(await readFile(join(f.a, "TITLE.md"), "utf8"), "existing");
    const write = f.io.write;
    f.io.write = (path, text) => path.endsWith(".md") ? Promise.reject(new Error("disk full")) : write(path, text);
    const request = {requestKey: "pending-conflict", text: "pending original"};
    const partial = await f.service.capture(request, f.context(f.a));
    f.io.write = write; await writeFile(partial.material.path, "external later");
    const retry = await f.service.capture(request, f.context(f.a)); assert.equal(retry.status, "partial"); assert.equal(await readFile(partial.material.path, "utf8"), "external later");
    const {store, record} = await f.service.locate(result.material.id);
    const block = await store.update(record.id, value => ({...value, original: "full block\nproperty:: original", restoreMode: "block"}));
    const link = makeLink(block);
    assert.equal(restoreCapture(`${link}\nproperty:: original\nid:: task-A`, block), "full block\nproperty:: original\nid:: task-A");
    assert.throws(() => restoreCapture(`${link}\nnew text`, block), /添加其他内容/);
    assert.throws(() => restoreCapture(`${link}\nproperty:: changed`, block), /属性已变化/);
  } finally {await f.cleanup();}
});
