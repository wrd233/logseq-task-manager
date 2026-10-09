import test from "node:test";
import assert from "node:assert/strict";
import {Window} from "happy-dom";
import * as XLSX from "xlsx";
import {renderSheet} from "../src/features/materials/preview/sheet-renderer.ts";
import type {MaterialPreviewSnapshot, PreviewRenderContext} from "../src/features/materials/preview/types.ts";

test("spreadsheet preview distinguishes a missing formula cache from saved zero, preserves merges and literal text, and pages at actual row coordinates without mutating bytes", async () => {
  const browser = new Window(), previous = {document: globalThis.document, DOMParser: globalThis.DOMParser};
  globalThis.document = browser.document as unknown as Document; globalThis.DOMParser = browser.DOMParser as unknown as typeof DOMParser;
  try {
    const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([["**[目标]** 核验保存值", "结果", "原件"], ["保存的零", 0], ["没有缓存"], ["合并保存值"]]);
    sheet.B2 = {t: "n", f: "1-1", v: 0}; sheet.B3 = {t: "n", f: "1+2"}; sheet["!merges"] = [{s: {r:3,c:0}, e: {r:3,c:2}}];
    XLSX.utils.book_append_sheet(book, sheet, "计划");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(Array.from({length:151}, (_, index) => [index + 1, `<img onerror=unsafe>${index + 1}`])), "较长表");
    const bytes = XLSX.write(book, {bookType: "xlsx", type: "array"}) as ArrayBuffer, original = new Uint8Array(bytes).slice();
    const snapshot = {bytes, target: {path: "/materials/中文.xlsx"}} as MaterialPreviewSnapshot;
    const context = {signal: new AbortController().signal} as PreviewRenderContext, rendered = await renderSheet(snapshot, context); document.body.append(rendered.element);
    assert.equal(rendered.element.querySelector('[data-cell="B2"]')!.textContent, "0");
    assert.equal(rendered.element.querySelector('[data-cell="B3"]')!.textContent, "未保存公式结果"); assert.equal(rendered.complete, false);
    assert.equal((rendered.element.querySelector('[data-cell="A4"]') as HTMLTableCellElement).colSpan, 3);
    const selector = rendered.element.querySelector("select")!; selector.value = "较长表"; selector.dispatchEvent(new browser.Event("change") as unknown as Event);
    assert.equal(rendered.element.querySelectorAll("tbody tr").length, 100); assert.equal(rendered.element.querySelector("img"), null);
    Array.from(rendered.element.querySelectorAll("button")).find(button => button.textContent === "下一页")!.click();
    assert.equal(rendered.element.querySelectorAll("tbody tr").length, 51); assert.equal(rendered.element.querySelector('[data-cell="A101"]')!.textContent, "101");
    assert.match(rendered.element.textContent!, /101–151 \/ 151 行/u); assert.deepEqual(new Uint8Array(bytes), original); rendered.dispose();
    assert.equal(document.body.children.length, 0);
  } finally {await browser.happyDOM.abort(); globalThis.document = previous.document; globalThis.DOMParser = previous.DOMParser;}
});
