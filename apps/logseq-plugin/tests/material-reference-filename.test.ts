import test from "node:test";
import assert from "node:assert/strict";
import {makeLink, markdownFile, restoreCapture, type MaterialRecord} from "../src/features/materials/store.ts";
import {marked} from "../src/features/work-view/vendor/marked.js";
const id = "1048f833-62ec-4fdb-b497-917c6e484cc6";
test("default stable references render the real filename including extension and literal Markdown punctuation", () => {
  const name = "资料 [初稿] **原件** `代码` | <内容> (一) #1.md", path = `/材料/${name}`;
  const reference = makeLink({id, title: "旧标题", path}), html = marked.parse(reference) as string;
  assert.match(html, /href="longdoc:\/\/1048f833/); assert.equal(html.includes("资料 [初稿] **原件** `代码` | &lt;内容&gt; (一) #1.md"), true);
  assert.equal(html.includes("<strong>"), false); assert.equal(html.includes("<code>"), false); assert.equal(html.includes("旧标题"), false);
  assert.match(makeLink({id, title: "历史标题"}), /历史标题/);
  assert.equal(markdownFile("/材料/说明.MARKDOWN"), true);
});
test("capture recovery still finds renamed filenames containing escaped brackets and preserves the neighboring note", () => {
  const record: MaterialRecord = {id, title: "旧标题", kind: "capture", path: "/材料/路线 [初稿].md", original: "**[想法]** 可能先看天气。", createdAt: "2026-10-07T00:00:00.000Z"};
  const content = `保留前文\n${makeLink(record)}\n保留后文`;
  assert.equal(restoreCapture(content, record), `保留前文\n${record.original}\n保留后文`);
});
