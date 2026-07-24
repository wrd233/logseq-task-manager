import assert from "node:assert/strict";
import test from "node:test";

import { readSelectedBlockForAnalysis, SelectedBlockAnalysisTarget } from "../src/selected-block-analysis.ts";

test("selected Block target is single-use and can be cleared across general entry or Graph switch", () => {
  const target = new SelectedBlockAnalysisTarget();
  target.bind("query-result-uuid");
  assert.equal(target.consume(), "query-result-uuid");
  assert.equal(target.consume(), undefined);

  target.bind("sidebar-reference-uuid");
  target.clear();
  assert.equal(target.consume(), undefined);
});

test("selected Block analysis re-reads the exact context-menu UUID and strips only its identity property", async () => {
  const selectedUuid = "00000000-0000-4000-8000-000000000011";
  const reads: Array<{ uuid: string; includeChildren: boolean }> = [];
  const selected = await readSelectedBlockForAnalysis({
    getBlock: async (uuid, options) => {
      reads.push({ uuid, includeChildren: options.includeChildren });
      return {
        uuid: selectedUuid,
        content: `整理这条 Query 结果\nid:: ${selectedUuid}`,
      };
    },
  }, selectedUuid);

  assert.deepEqual(reads, [{ uuid: selectedUuid, includeChildren: false }]);
  assert.deepEqual(selected, {
    blockUuid: selectedUuid,
    text: "整理这条 Query 结果",
  });
});

test("selected Block analysis rejects a missing or mismatched re-read without falling back to current selection", async () => {
  await assert.rejects(
    readSelectedBlockForAnalysis({ getBlock: async () => null }, "reference-uuid"),
    /已不存在或当前宿主无法读取/,
  );
  await assert.rejects(
    readSelectedBlockForAnalysis({
      getBlock: async () => ({ uuid: "different-current-block", content: "不应被分析" }),
    }, "reference-uuid"),
    /返回了另一个 Block/,
  );
});

test("selected Block analysis rejects an empty body after removing the identity property", async () => {
  const emptyUuid = "00000000-0000-4000-8000-000000000012";
  await assert.rejects(
    readSelectedBlockForAnalysis({
      getBlock: async () => ({ uuid: emptyUuid, content: `id:: ${emptyUuid}` }),
    }, emptyUuid),
    /没有可分析的正文/,
  );
});
