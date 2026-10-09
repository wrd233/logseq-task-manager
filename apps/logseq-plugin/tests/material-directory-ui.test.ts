import test from "node:test";
import assert from "node:assert/strict";
import {Window} from "happy-dom";
import {mkdtemp, mkdir, readFile, writeFile, readdir, rename, stat, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import type {FileIO} from "../src/host/file-io.ts";
import {MaterialDirectories} from "../src/workspace/material-context.ts";
import {MaterialService} from "../src/features/materials/service.ts";

async function until(test: () => boolean): Promise<void> {const end = Date.now() + 2500; while (!test()) {if (Date.now() > end) assert.fail("directory update did not arrive within the bounded interval"); await delay(20);}}

test("active directory UI discovers files shallowly and retains unchanged buttons and filename focus across periodic and explicit refresh; disposal stops reads", async () => {
  const browser = new Window({url: "file:///test-plugin/index.html"}), previous = {window: globalThis.window, document: globalThis.document, storage: globalThis.localStorage};
  globalThis.window = browser as unknown as typeof globalThis.window; globalThis.document = browser.document as unknown as Document; globalThis.localStorage = browser.localStorage;
  const root = await mkdtemp(join(tmpdir(), "material-dir-ui-")), a = join(root, "A"), b = join(root, "B"), graph = join(root, "graph");
  await Promise.all([mkdir(a), mkdir(b), mkdir(graph)]); await mkdir(join(a, "一级/二级"), {recursive: true}); await writeFile(join(a, "一级/二级/内文.md"), "**[注]** 保留原始层级。");
  await writeFile(join(a, "同名.md"), "**[注]** A 原件。"); await writeFile(join(b, "同名.md"), "**[注]** B 原件。");
  const directories = new MaterialDirectories(browser.localStorage); directories.addFolder(graph, "work", {directory: a, organization: "flat"}); directories.addFolder(graph, "work", {directory: b, organization: "flat"});
  let reads = 0, decorated = 0;
  const io: FileIO = {read: path => readFile(path, "utf8"), write: (path, text) => writeFile(path, text), mkdir: async path => {await mkdir(path, {recursive: true});}, rename, list: readdir, stat: async path => {const value = await stat(path); return {type: value.isFile() ? "file" : "directory", size: value.size};}, identity: async path => {const value = await stat(path); return JSON.stringify([value.dev, value.ino, value.birthtimeMs]);}, listDirectory: async (path, options) => {reads++; options.signal?.throwIfAborted(); const entries = await readdir(path, {withFileTypes: true}); return {entries: entries.map(entry => ({name: entry.name, type: entry.isDirectory() ? "directory" : "file"})), complete: true};}};
  const service = new MaterialService(io, directories, graph, null, text => text), context = {graph, sourceUuid: "work", ownerUuid: "work", directory: a, organization: "flat" as const};
  await service.resolveDirectoryFile(join(a, "同名.md"), context);
  const {renderMaterialDirectory} = await import("../src/features/materials/directory-ui.ts"), parent = document.createElement("section"); document.body.append(parent);
  const open: string[] = [], moved: string[] = [];
  const ui = await renderMaterialDirectory(parent, service, context, {valid: () => {}, open: async path => {open.push(path);}, grant: async () => {}, resume: async () => {}, decorate: entry => {decorated++; const row = document.createElement("div"); row.append(entry); return row;}, history: async () => {}, moved: position => {moved.push(position.relative);}});
  try {
    await until(() => !!parent.querySelector('[data-directory-path]'));
    assert.equal(parent.textContent!.includes("内文.md"), false);
    const first = parent.querySelector<HTMLButtonElement>(`button[data-material-id]`)!; assert.equal(first.textContent, "同名.md");
    const input = document.createElement("input"); input.value = "正在输入的新文件名"; first.parentElement!.append(input); input.focus(); input.setSelectionRange(3,5);
    await delay(1150); await ui.refresh(); await delay(60);
    assert.equal(parent.querySelector('button[data-material-id]'), first); assert.equal(decorated, 1); assert.equal(document.activeElement, input); assert.equal(input.value, "正在输入的新文件名"); assert.equal(input.selectionStart,3);
    await writeFile(join(a, "新增 中文.pdf"), "%PDF-1.4\nreadonly fixture"); await until(() => parent.textContent!.includes("新增 中文.pdf"));
    const folder = Array.from(parent.querySelectorAll("button")).find(button => button.textContent === "▸ 一级")!; folder.click(); await until(() => parent.textContent!.includes("▸ 二级")); assert.equal(parent.textContent!.includes("内文.md"), false);
    assert.equal(parent.querySelector('button[data-material-id]'), null, "focused filename draft must not leak into a different directory layer");
    Array.from(parent.querySelectorAll("button")).find(button => button.textContent === "返回上层")!.click(); await until(() => parent.textContent!.includes("新增 中文.pdf")); assert.deepEqual(moved, ["一级", ""]);
    const selector = parent.querySelector<HTMLSelectElement>('select[aria-label="当前材料根目录"]')!; selector.value = b; selector.dispatchEvent(new browser.Event("change") as unknown as Event); await until(() => !!parent.querySelector(`[data-directory-path="${b}/同名.md"]`));
    Array.from(parent.querySelectorAll("button")).find(button => button.textContent === "同名.md")!.click(); assert.deepEqual(open, [join(b,"同名.md")]);
    ui.dispose(); const finished = reads; window.dispatchEvent(new browser.Event("focus") as unknown as Event); await delay(1100); assert.equal(reads, finished);
    assert.equal(await readFile(join(a,"同名.md"),"utf8"), "**[注]** A 原件。"); assert.equal(await readFile(join(b,"同名.md"),"utf8"), "**[注]** B 原件。");
  } finally {ui.dispose(); await browser.happyDOM.abort(); globalThis.window = previous.window; globalThis.document = previous.document; globalThis.localStorage = previous.storage; await rm(root,{recursive:true,force:true});}
});
