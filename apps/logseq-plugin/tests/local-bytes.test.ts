import test from "node:test";
import assert from "node:assert/strict";
import {localAssetURL, readLocalBytes} from "../src/host/local-bytes.ts";

class Request {
  status = 0; response: unknown = null; responseType = ""; timeout = 0; url = ""; aborted = false;
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null; ontimeout: (() => void) | null = null;
  onprogress: ((event: {loaded: number; total: number; lengthComputable: boolean}) => void) | null = null;
  open(_method: string, url: string) {this.url = url;}
  send() {}
  abort() {this.aborted = true; this.onabort?.();}
}
test("stock assets byte reader preserves non-UTF8 bytes, encodes filenames and releases completion handlers", async () => {
  const request = new Request(), bytes = Uint8Array.from([0, 255, 128, 195, 40]);
  const reading = readLocalBytes("/材料/路线 [初稿] #1.pdf", {}, () => request as unknown as XMLHttpRequest);
  assert.equal(request.responseType, "arraybuffer"); assert.match(request.url, /%23/); assert.match(request.url, /%5B/);
  request.response = bytes.buffer; request.onload?.(); const actual = await reading; assert.deepEqual([...new Uint8Array(actual)], [...bytes]); assert.equal(request.onload, null); assert.equal(request.onprogress, null);
  assert.throws(() => localAssetURL("/材料/../Graph/pages/原文.md"), /路径无效/); assert.throws(() => localAssetURL("/材料/坏\u0000名字"), /路径无效/);
});
test("aborts, errors and oversized binary reads reject and release listeners rather than returning text or partial bytes", async () => {
  const request = new Request(), abort = new AbortController(); const reading = readLocalBytes("/材料/file.bin", {signal: abort.signal}, () => request as unknown as XMLHttpRequest);
  abort.abort(); await assert.rejects(reading, {name: "AbortError"}); assert.equal(request.aborted, true); assert.equal(request.onload, null);
  const large = new Request(), oversized = readLocalBytes("/材料/file.pdf", {maxBytes: 4}, () => large as unknown as XMLHttpRequest); large.onprogress?.({loaded: 5, total: 5, lengthComputable: true}); await assert.rejects(oversized, /上限/); assert.equal(large.aborted, true);
  const text = new Request(), invalid = readLocalBytes("/材料/file.docx", {}, () => text as unknown as XMLHttpRequest); text.response = "replacement text"; text.onload?.(); await assert.rejects(invalid, /字节/);
});
