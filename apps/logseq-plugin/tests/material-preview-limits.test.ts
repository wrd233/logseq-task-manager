import test from "node:test";
import assert from "node:assert/strict";
import {zipSync, strToU8} from "fflate";
import {renderDocument, documentPreviewLimits} from "../src/features/materials/preview/document-renderer.ts";
import type {MaterialPreviewSnapshot, PreviewRenderContext} from "../src/features/materials/preview/types.ts";

test("oversized Markdown and Word XML stop before HTML rendering and preserve their original byte buffers", async () => {
  const context = {signal: new AbortController().signal} as PreviewRenderContext;
  const bytes = new ArrayBuffer(documentPreviewLimits.markdownBytes + 1);
  await assert.rejects(renderDocument({bytes, target: {format: "markdown"}} as MaterialPreviewSnapshot, context), /2 MiB/u);
  assert.equal(bytes.byteLength, documentPreviewLimits.markdownBytes + 1);
  const office = zipSync({"word/document.xml": strToU8(`<w:document>**[注]**${"a".repeat(documentPreviewLimits.mainXMLCharacters)}</w:document>`)}), original = office.slice();
  await assert.rejects(renderDocument({bytes: office.buffer, target: {format: "docx"}} as MaterialPreviewSnapshot, context), /Word 正文结构.*边界/u);
  assert.deepEqual(office, original);
});
