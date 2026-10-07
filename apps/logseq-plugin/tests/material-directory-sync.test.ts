import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, readdir, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {MaterialDirectories} from "../src/workspace/material-context.ts";
import type {FileIO, DirectorySnapshot} from "../src/host/file-io.ts";
import {MaterialDirectoryBrowser, MaterialDirectorySync, directoryEntryLimit} from "../src/features/materials/directory.ts";
import {directoryGrantFromDrop} from "../src/host/directory-handles.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "material-directory-")), graph = join(root, "graph"), a = join(root, "A"), b = join(root, "B");
  await Promise.all([mkdir(graph), mkdir(a), mkdir(b)]);
  const values = new Map<string, string>(), storage = {get length() {return values.size;}, key: (n: number) => [...values.keys()][n] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}, removeItem: (key: string) => {values.delete(key);}};
  const directories = new MaterialDirectories(storage);
  directories.addFolder(graph, "work", {directory: a, organization: "flat"}); directories.addFolder(graph, "work", {directory: b, organization: "flat"});
  let listing: ((path: string) => Promise<DirectorySnapshot>) | null = null;
  const calls: string[] = [];
  const io: FileIO = {read: async () => {throw Error("No file body should be read");}, write: async () => {throw Error("No writes");}, mkdir: async () => {throw Error("No directory creation");}, rename: async () => {throw Error("No renames");}, list: async () => {throw Error("Recursive legacy enumeration must not be used");}, listDirectory: async (path, options) => {
    calls.push(path); options.signal?.throwIfAborted();
    if (listing) return listing(path);
    const entries = await readdir(path, {withFileTypes: true}); return {entries: entries.slice(0, options.limit).map(entry => ({name: entry.name, type: entry.isDirectory() ? "directory" : "file"})), complete: entries.length <= options.limit};
  }};
  return {root, graph, a, b, io, calls, directories, context: {graph, ownerUuid: "work", sourceUuid: "work", directory: null, organization: "flat" as const}, browser: new MaterialDirectoryBrowser(io, directories, graph, null), setListing: (value: typeof listing) => {listing = value;}, cleanup: () => rm(root, {recursive: true, force: true})};
}

test("true single-level reads show folders including empty ones, distinct same names and entered subdirectories without body reads or registration", async () => {
  const f = await fixture(); try {
    await mkdir(join(f.a, "空目录")); await mkdir(join(f.a, "nested/deeper"), {recursive: true}); await writeFile(join(f.a, "nested/deeper/内部.md"), "**[注]** 保留原件。");
    await writeFile(join(f.a, "路线.md"), "A"); await writeFile(join(f.b, "路线.md"), "B");
    const top = await f.browser.read(f.context, {root: f.a, relative: ""});
    assert.equal(top.complete, true); assert.deepEqual(top.entries.map(v => v.name).sort(), ["nested", "空目录", "路线.md"].sort()); assert.equal(top.entries.find(v => v.name === "空目录")?.type, "directory");
    const second = await f.browser.read(f.context, {root: f.b, relative: ""}); assert.notEqual(top.entries.find(v => v.name === "路线.md")?.path, second.entries[0]?.path);
    const nested = await f.browser.read(f.context, {root: f.a, relative: "nested"}); assert.deepEqual(nested.entries.map(v => v.name), ["deeper"]);
    assert.deepEqual(f.calls, [f.a, f.b, join(f.a, "nested")]); assert.deepEqual(await readdir(f.a), ["nested", "空目录", "路线.md"].sort());
  } finally {await f.cleanup();}
});

test("partial, paged, malformed and unavailable observations retain prior entries as last-known; full absence only changes the current listing", async () => {
  const f = await fixture(); try {
    await writeFile(join(f.a, "old.md"), "旧记录"); const before = await f.browser.read(f.context, {root: f.a, relative: ""});
    f.setListing(async () => ({entries: [{name: "new.pdf", type: "file"}], complete: false, nextCursor: "next"}));
    const partial = await f.browser.read(f.context, before.location, undefined, before); assert.equal(partial.availability, "partial"); assert.equal(partial.entries.find(v => v.name === "old.md")?.current, false); assert.equal(partial.nextCursor, "next");
    f.setListing(async () => ({entries: [{name: "page2.xlsx", type: "file"}], complete: true}));
    const paged = await f.browser.read(f.context, before.location, undefined, partial, "next"); assert.equal(paged.complete, false); assert.equal(paged.entries.length, 3);
    f.setListing(async () => ({entries: [{name: "../escape.md", type: "file"}], complete: true})); const invalid = await f.browser.read(f.context, before.location, undefined, before); assert.equal(invalid.complete, false); assert.equal(invalid.entries[0]?.name, "old.md");
    f.setListing(async () => {throw Error("offline");}); const offline = await f.browser.read(f.context, before.location, undefined, before); assert.equal(offline.availability, "unavailable"); assert.equal(offline.entries[0]?.current, false);
    f.setListing(async () => ({entries: [], complete: true})); const empty = await f.browser.read(f.context, before.location, undefined, before); assert.deepEqual(empty.entries, []); assert.equal(empty.complete, true); assert.equal((await readdir(f.a)).includes("old.md"), true);
  } finally {await f.cleanup();}
});

test("root scope, unbinding, Graph changes and entry limits cannot escape or claim complete deletion", async () => {
  const f = await fixture(); try {
    await assert.rejects(f.browser.read(f.context, {root: f.a, relative: "../B"}), /位置无效/);
    await assert.rejects(f.browser.read({...f.context, graph: "/other"}, {root: f.a, relative: ""}), /Graph/);
    f.directories.removeFolder(f.graph, "work", f.a); await assert.rejects(f.browser.read(f.context, {root: f.a, relative: ""}), /范围/);
    f.setListing(async () => ({entries: Array.from({length: directoryEntryLimit + 1}, (_, i) => ({name: `${i}.png`, type: "file" as const})), complete: true})); const page = await f.browser.read(f.context, {root: f.b, relative: ""}); assert.equal(page.complete, false); assert.equal(page.entries.length, directoryEntryLimit);
    delete f.io.listDirectory; const absent = await f.browser.read(f.context, {root: f.b, relative: ""}); assert.equal(absent.availability, "unavailable"); assert.match(absent.problem!, /一级目录/);
    assert.equal(f.directories.roots(f.graph).includes(f.a), true, "history registration survives unbinding");
  } finally {await f.cleanup();}
});

test("directory sync cancels previous work and unload, ignores late replies and debounces overlapping focus refreshes", async () => {
  const sync = new MaterialDirectorySync<number>(25), focus = new EventTarget(), published: number[] = [], signals: AbortSignal[] = [];
  let finish!: (value: number) => void;
  sync.start(signal => {signals.push(signal); return new Promise(resolve => {finish = resolve;});}, value => published.push(value), error => {throw error;}, focus);
  focus.dispatchEvent(new Event("focus")); focus.dispatchEvent(new Event("focus")); assert.equal(signals.length, 1);
  sync.start(async signal => {signals.push(signal); return 2;}, value => published.push(value), error => {throw error;}, focus);
  assert.equal(signals[0]?.aborted, true); finish(1); await delay(5); assert.deepEqual(published, [2]);
  sync.stop(); const count = published.length; focus.dispatchEvent(new Event("focus")); await delay(120); assert.equal(published.length, count);
  sync.stop();
});

test("read grants require path and directory handle from the same native drop item, never just a matching picker name", async () => {
  const makeItem = (path: string | null, kind = "directory") => ({getAsFile: () => path ? {path} : {}, getAsFileSystemHandle: async () => ({kind, name: "materials"})}) as unknown as DataTransferItem;
  await assert.rejects(directoryGrantFromDrop(makeItem(null), "/graph"), /可靠/);
  await assert.rejects(directoryGrantFromDrop(makeItem("/graph/assets"), "/graph"), /Graph 外/);
  await assert.rejects(directoryGrantFromDrop(makeItem("/elsewhere/materials"), "/graph", "/expected/materials"), /不同/);
  await assert.rejects(directoryGrantFromDrop(makeItem("/expected/file.md", "file"), "/graph"), /目录本身/);
  const grant = await directoryGrantFromDrop(makeItem("/expected/materials"), "/graph", "/expected/materials"); assert.equal(grant.path, "/expected/materials"); assert.equal(grant.graph, "/graph");
});

test("native directory batches preserve special names and empty folders without reading children; truncation and aborted callbacks remain incomplete", async () => {
  const {readNativeDirectoryEntry} = await import("../src/host/directory-handles.ts");
  let batchReads = 0, descendants = 0;
  const directory = {createReader: () => ({readEntries: (done: (entries: FileSystemEntry[]) => void) => {batchReads++; done((batchReads === 1 ? [{name: "文件 #_*.md", isFile: true, isDirectory: false}, {name: "空文件夹", isFile: false, isDirectory: true}] : []) as FileSystemEntry[]);}}), getDirectory: () => {descendants++; throw Error("No subtree scan");}} as unknown as FileSystemDirectoryEntry;
  const complete = await readNativeDirectoryEntry(directory, [], {limit: 512}); assert.equal(complete.complete, true); assert.deepEqual(complete.entries.map(entry => entry.name), ["文件 #_*.md", "空文件夹"]); assert.equal(descendants, 0); assert.equal(batchReads, 2);
  batchReads = 0; const partial = await readNativeDirectoryEntry(directory, [], {limit: 1}); assert.equal(partial.complete, false); assert.equal(partial.entries.length, 1); assert.equal(batchReads, 1);
  let finish!: (entries: FileSystemEntry[]) => void;
  const slow = {createReader: () => ({readEntries: (done: (entries: FileSystemEntry[]) => void) => {finish = done;}})} as unknown as FileSystemDirectoryEntry;
  const request = new AbortController(), pending = readNativeDirectoryEntry(slow, [], {limit: 512, signal: request.signal}); request.abort(); await assert.rejects(pending, /取消/u); finish([]); await assert.rejects(readNativeDirectoryEntry(slow, [".."], {limit: 512}), /位置/u);
});
