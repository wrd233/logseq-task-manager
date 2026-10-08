import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, readFile, writeFile, readdir, rename, stat, rm, unlink, copyFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Window} from "happy-dom";
import {zipSync, strToU8} from "fflate";
import type {FileIO} from "../src/host/file-io.ts";
import {MaterialDirectories} from "../src/workspace/material-context.ts";
import {MaterialService} from "../src/features/materials/service.ts";
import {MaterialPreviewReader, decodePreviewText} from "../src/features/materials/preview/reader.ts";
import {parsePreviewLink} from "../src/features/materials/preview/paths.ts";
import {verifyPreviewArchive} from "../src/features/materials/preview/archive.ts";
import {originalImageBytes} from "../src/features/materials/preview/images.ts";
import {nativeClipboardDirectoryPath, directoryGrantFromPaste} from "../src/host/directory-handles.ts";
import {PreviewResources} from "../src/features/materials/preview/session.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "material-preview-")), graph = join(root, "graph"), a = join(root, "A"), b = join(root, "B");
  await Promise.all([mkdir(join(graph, "assets"), {recursive: true}), mkdir(a), mkdir(b)]);
  const values = new Map<string, string>(), directories = new MaterialDirectories({get length() {return values.size;}, key: n => [...values.keys()][n] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => {values.set(key, value);}, removeItem: key => {values.delete(key);}});
  directories.addFolder(graph, "work", {directory: a, organization: "flat"}); directories.addFolder(graph, "work", {directory: b, organization: "flat"});
  const io: FileIO = {read: path => readFile(path, "utf8"), readBytes: async (path, options) => {options?.signal?.throwIfAborted(); return (await readFile(path)).buffer.slice(0);}, write: (path, text) => writeFile(path, text), mkdir: async path => {await mkdir(path, {recursive: true});}, rename, list: readdir, stat: async path => {const s = await stat(path); return {type: s.isFile() ? "file" : "directory", size: s.size};}, identity: async path => {const s = await stat(path); return JSON.stringify([s.dev, s.ino, s.birthtimeMs]);}};
  // Node buffers may share a pool: the byte port must return only the file's view.
  io.readBytes = async (path, options) => {options?.signal?.throwIfAborted(); const bytes = await readFile(path); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);};
  const service = new MaterialService(io, directories, graph, null, text => text), context = {graph, sourceUuid: "work", ownerUuid: "work", directory: a, organization: "flat" as const};
  return {root, graph, a, b, io, directories, service, context, reader: new MaterialPreviewReader(service), scope: {graph, ownerUuid: "work"}, cleanup: () => rm(root, {recursive: true, force: true})};
}

test("directory/UI/import/Agent resolution is idempotent and filename references preserve Unicode and Markdown punctuation; copies keep distinct identities", async () => {
  const f = await fixture(); try {
    const path = join(f.a, "中文 [副本] #_*.md"); await writeFile(path, "**[注]** 条件不能删。");
    const results = await Promise.all(Array.from({length: 4}, () => f.service.resolveDirectoryFile(path, f.context)));
    assert.equal(new Set(results.map(value => value.materialId)).size, 1); assert.ok(results.every(value => value.status === "success" && value.identity === "verified")); assert.equal(results[0]!.fileName, "中文 [副本] #_*.md"); assert.match(results[0]!.reference, /\\\[副本\\\].*\\#\\_\\\*\\\.md/u);
    const imported = await f.service.importFile({name: results[0]!.fileName, path}, f.context, "same-actual-file"); assert.equal(imported.material.id, results[0]!.materialId);
    const copy = join(f.b, results[0]!.fileName); await copyFile(path, copy); const independent = await f.service.resolveDirectoryFile(copy, f.context); assert.notEqual(independent.materialId, results[0]!.materialId);
    assert.equal(await readFile(path, "utf8"), "**[注]** 条件不能删。"); assert.deepEqual((await f.service.read(results[0]!.materialId)).capabilities.edit, {user: false, agent: false});
  } finally {await f.cleanup();}
});

test("byte snapshots remain exact and readonly, detect actual version changes, and refuse replacement, stale Graph and missing byte capability", async () => {
  const f = await fixture(); try {
    const path = join(f.a, "原始.pdf"), original = Uint8Array.from([0,255,128,13,10,195,40,254]); await writeFile(path, original);
    const resolved = await f.service.resolveDirectoryFile(path, f.context), target = await f.reader.material(resolved.materialId, f.scope), before = await f.reader.read(target, new AbortController().signal);
    assert.deepEqual(new Uint8Array(before.bytes), original); assert.equal(before.version.length, 64);
    await writeFile(path, Uint8Array.from([0,255,128,7])); const changed = await f.reader.read(target, new AbortController().signal); assert.notEqual(changed.version, before.version); assert.equal(changed.target.materialId, before.target.materialId);
    const saved = await f.service.locate(resolved.materialId); const metadataBefore = await readFile(join(saved.store.root, ".longdoc", `${resolved.materialId}.json`), "utf8");
    await unlink(path); await writeFile(path, "same-path replacement");
    assert.equal((await f.service.resolveDirectoryFile(path, f.context)).identity, "changed"); await assert.rejects(f.reader.read(target, new AbortController().signal), /身份/u);
    assert.equal(await readFile(join(saved.store.root, ".longdoc", `${resolved.materialId}.json`), "utf8"), metadataBefore);
    await assert.rejects(f.reader.material(resolved.materialId, {...f.scope, graph: "/different"}), /Graph/u);
    const asset = f.reader.asset(join(f.graph, "assets", "raw.png"), f.scope); await writeFile(asset.path, original); const unavailableIO = {...f.io}; delete unavailableIO.readBytes; const noBytes = new MaterialPreviewReader(f.service, unavailableIO); await assert.rejects(noBytes.read(asset, new AbortController().signal), /原始字节/u);
    await assert.rejects(f.service.resolveDirectoryFile(join(f.root, "outside.md"), f.context), /关联材料目录/u);
  } finally {await f.cleanup();}
});

test("missing physical identity returns explicit uncertainty and does not silently add a new work association or merge a copied file", async () => {
  const f = await fixture(); try {
    delete f.io.identity; const path = join(f.a, "未知身份.md"); await writeFile(path, "**[注]** 保留事实。");
    const first = await f.service.resolveDirectoryFile(path, f.context), again = await f.service.resolveDirectoryFile(path, f.context);
    assert.equal(first.materialId, again.materialId); assert.equal(first.status, "needs-verification"); assert.equal(first.identity, "unverified"); assert.equal(again.status, "needs-verification");
    await f.service.associateFile(path, {...f.context, sourceUuid: "other", ownerUuid: "other"}); const record = await f.service.locate(first.materialId); assert.deepEqual(record.record.associations, [{graph: f.graph, sourceUuid: "work"}]);
    const copy = join(f.b, "未知身份.md"); await copyFile(path, copy); assert.notEqual((await f.service.resolveDirectoryFile(copy, f.context)).materialId, first.materialId);
  } finally {await f.cleanup();}
});

test("local-file parsing preserves web/wiki semantics and Graph asset boundaries, encoded filenames and current root limits", () => {
  assert.deepEqual(parsePreviewLink("../assets/图%20像.png", "/graph", []), {kind: "local-file", path: "/graph/assets/图 像.png", origin: "graph-asset"});
  assert.equal(parsePreviewLink("https://example.org/doc.pdf", "/graph", []).kind, "other"); assert.equal(parsePreviewLink("[[页面]]", "/graph", []).kind, "other");
  assert.equal(parsePreviewLink("../secret.png", "/graph", [], "/graph/assets/dir/a.md").kind, "local-file");
  assert.equal(parsePreviewLink("../../secret.png", "/graph", [], "/graph/assets/a.md").kind, "unresolved");
  assert.equal(parsePreviewLink("assets:///graph/assets/%2e%2e/secret.png", "/graph", []).kind, "unresolved");
  assert.equal(parsePreviewLink("file://other-host/graph/assets/a.pdf", "/graph", []).kind, "unresolved");
  assert.equal(parsePreviewLink("file:///known/%23_%5B文档%5D.pdf", "/graph", ["/known"]).kind, "local-file");
  assert.throws(() => decodePreviewText(Uint8Array.from([255,128]).buffer), /编码/u);
});

test("Office archive validation rejects corruption, encryption and inflated sizes before a document parser can consume them", async () => {
  const bytes = zipSync({"word/document.xml": strToU8("<w:document>中文</w:document>")}), signal = new AbortController().signal;
  const original = bytes.slice().buffer, archive = await verifyPreviewArchive(original, signal); assert.match(archive.texts.get("word/document.xml")!, /中文/u);
  const encrypted = bytes.slice(), encryptedView = new DataView(encrypted.buffer); for (let i=0;i+46<encrypted.length;i++) if(encryptedView.getUint32(i,true)===0x02014b50){encryptedView.setUint16(i+8, encryptedView.getUint16(i+8,true)|1,true);break;} await assert.rejects(verifyPreviewArchive(encrypted.buffer, signal), /加密/u);
  const damaged = bytes.slice(); damaged[40] = damaged[40]! ^ 1; await assert.rejects(verifyPreviewArchive(damaged.buffer, signal));
  const huge = bytes.slice(), view = new DataView(huge.buffer); for (let i=0;i+46<huge.length;i++) if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24, 100*1024*1024,true);break;} await assert.rejects(verifyPreviewArchive(huge.buffer, signal), /边界|上限/u);
});

test("native clipboard path proofs reject multiple paths, browser-forged events, changed payloads and wrong roots; object URLs release exactly once", async () => {
  const browser = new Window(), previousParser = globalThis.DOMParser, previousLocation = globalThis.location, previousWindow = globalThis.window; globalThis.window = browser as unknown as typeof globalThis.window; globalThis.DOMParser = browser.DOMParser as unknown as typeof DOMParser; globalThis.location = browser.location as unknown as Location;
  try {
    const data = strToU8('<plist version="1.0"><array><string>/verified/材料 [A]</string></array></plist>'); assert.equal(nativeClipboardDirectoryPath(data), "/verified/材料 [A]");
    assert.throws(() => nativeClipboardDirectoryPath(strToU8('<plist><array><string>/one</string><string>/two</string></array></plist>')), /单个/u);
    assert.throws(() => nativeClipboardDirectoryPath(strToU8('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]><plist/>')), /XML/u);
    const event = (trusted = true) => ({isTrusted: trusted, clipboardData: {files: [{name: "材料 [A]"}], items: [{getAsFileSystemHandle: async () => ({kind: "directory", name: "材料 [A]"})}]}}) as unknown as ClipboardEvent;
    await assert.rejects(directoryGrantFromPaste(event(false), "/graph", () => data), /访达/u); await assert.rejects(directoryGrantFromPaste(event(), "/graph", () => data, "/different/材料 [A]"), /不同/u);
    const grant = await directoryGrantFromPaste(event(), "/graph", () => data, "/verified/材料 [A]"); assert.equal(grant.path, "/verified/材料 [A]");
    const raw = Uint8Array.from([90,0,255,128,91]); assert.deepEqual(new Uint8Array(originalImageBytes(raw.subarray(1,4))), Uint8Array.from([0,255,128]));
    const resources = new PreviewResources(), fakeReader = {service: {directories: {roots: () => []}}} as unknown as MaterialPreviewReader;
    const context = resources.context(fakeReader, {scope: {graph: "/graph", ownerUuid: null}} as never), url = context.objectURL(new Blob(["resource"])); assert.equal(context.ownsURL(url), true); assert.equal(resources.activeURLs, 1); resources.dispose(); resources.dispose(); assert.equal(resources.activeURLs, 0); assert.equal(context.signal.aborted, true); assert.throws(() => context.objectURL(new Blob(["late"])));
  } finally {globalThis.DOMParser = previousParser; globalThis.location = previousLocation; globalThis.window = previousWindow; await browser.happyDOM.abort();}
});

test("a second material root stays usable and newly resolved material history survives an offline root without an earlier list", async () => {
  const f = await fixture(); try {
    const path = join(f.b, "第二根.md"); await writeFile(path, "**[注]** 独立材料根。");
    const before = await f.service.resolveDirectoryFile(path, f.context); assert.equal((await f.service.locate(before.materialId)).store.root, f.b);
    const imported = await f.service.importFile({name: "第二根.md", path}, f.context, "root-B-import"); assert.equal(imported.material.id, before.materialId);
    const firstPath = join(f.a, "第一根.md"); await writeFile(firstPath, "**[注]** 保留失联前身份。"); const first = await f.service.resolveDirectoryFile(firstPath, f.context);
    await rename(f.a, `${f.a}-offline`);
    const target = await f.reader.material(before.materialId, f.scope), snapshot = await f.reader.read(target, new AbortController().signal); assert.equal(decodePreviewText(snapshot.bytes), "**[注]** 独立材料根。");
    assert.equal((await f.service.resolveDirectoryFile(path, f.context)).materialId, before.materialId); assert.equal((await f.service.locate(before.materialId)).store.root, f.b);
    const retained = (await f.service.list()).find(record => record.id === first.materialId); assert.equal(retained?.path, firstPath); assert.ok(f.service.listProblems.length > 0);
    const views = await f.service.listViews(); assert.equal(views.status, "partial");
    const unavailable = views.materials.find(view => view.id === first.materialId)!; assert.equal(unavailable.availability, "unavailable"); assert.equal(unavailable.reference, first.reference); assert.equal(unavailable.content, null); assert.equal(unavailable.version, null); assert.deepEqual(unavailable.capabilities.edit, {user: false, agent: false});
    assert.equal(views.materials.find(view => view.id === before.materialId)?.availability, "available");
  } finally {await f.cleanup();}
});
