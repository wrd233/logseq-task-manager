import test from "node:test";
import assert from "node:assert/strict";
import {Window} from "happy-dom";
import {readFile} from "node:fs/promises";
import {rejectEncryptedOffice} from "../src/features/materials/preview/archive.ts";

test("encrypted OOXML compound streams are identified from real encrypted bytes, rather than reported as a damaged ZIP", async () => {
  const data = await readFile(new URL("./fixtures/material-preview/encrypted.xlsx", import.meta.url)), bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  assert.throws(() => rejectEncryptedOffice(bytes, new AbortController().signal), /Office 文件已加密/u);
  assert.throws(() => rejectEncryptedOffice(Uint8Array.from(data.subarray(0, 16)).buffer, new AbortController().signal), /损坏/u);
});

test("sanitizer retains private image source tokens, restores only owned images, blocks remote requests, strips scripts and reports absent sources", async () => {
  const browser = new Window(), previous = {window: globalThis.window, document: globalThis.document};
  globalThis.window = browser as unknown as typeof globalThis.window; globalThis.document = browser.document as unknown as Document;
  const assigned: string[] = [], descriptor = Object.getOwnPropertyDescriptor(browser.HTMLImageElement.prototype, "src")!;
  // This test verifies the sanitization/transport boundary. It does not claim an
  // actual image decode; that is independently verified in stock Desktop.
  Object.defineProperty(browser.HTMLImageElement.prototype, "src", {configurable: true, get() {return this.getAttribute("src") ?? "";}, set(value: string) {assigned.push(value); this.setAttribute("src", value); queueMicrotask(() => this.onload?.(new browser.Event("load")));}});
  try {
    const {previewHTML} = await import("../src/features/materials/preview/html.ts");
    const context = {signal: new AbortController().signal, resourceBase: "file:///plugin/index.html", objectURL: () => "blob:owned", ownsURL: (url: string) => url === "blob:owned", localImage: async () => {throw Error("local image was not authorized");}};
    const result = await previewHTML('<h1>**[目标]** 保留内容</h1><img src="blob:owned"><img src="https://remote.invalid/private"><img><script>throw Error("unsafe")</script><a href="javascript:alert(1)">无危险动作</a>', context);
    assert.deepEqual(assigned, ["blob:owned"]); assert.equal(result.article.querySelector("img")!.getAttribute("src"), "blob:owned"); assert.equal(result.article.querySelector("script"), null); assert.equal(result.article.querySelector("a")!.hasAttribute("href"), false, result.article.outerHTML);
    assert.equal(result.notices.some(text => text.includes("远程图片")), true); assert.equal(result.notices.some(text => text.includes("来源")), true); assert.equal(result.article.querySelector('[data-wb-image]'), null);
  } finally {Object.defineProperty(browser.HTMLImageElement.prototype, "src", descriptor); await browser.happyDOM.abort(); globalThis.window = previous.window; globalThis.document = previous.document;}
});
