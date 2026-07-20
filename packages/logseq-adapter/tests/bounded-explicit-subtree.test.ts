import assert from "node:assert/strict";
import test from "node:test";

import { normalizeExplicitObjectBlock, readBoundedExplicitSubtrees } from "../src/index.ts";

const entities: Record<string, unknown> = {
  root: { uuid: "root", content: "[任务] 完成验证", "updated-at": 1, children: [["uuid", "step"]] },
  step: { uuid: "step", content: "TODO 收集真实事件", "updated-at": 2, children: [["uuid", "decision"]] },
  decision: { uuid: "decision", content: "[决策] 先验证现状", "updated-at": 3, children: [] },
};

test("bounded subtree reads only changed roots and descendants while bare TODO remains non-object", async () => {
  const reads: string[] = [];
  const result = await readBoundedExplicitSubtrees(
    [{ uuid: "root", content: "event snapshot" }],
    async (externalId) => {
      reads.push(externalId);
      return entities[externalId];
    },
    { maximumRoots: 4, maximumBlocks: 8 },
  );
  assert.deepEqual(reads, ["root", "step", "decision"]);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.blocks.map((block) => normalizeExplicitObjectBlock(block)?.parsed.kind), ["OBJECT", "NONE", "OBJECT"]);
});

test("bounded subtree reports truncation and rejects malformed or mismatched UUID references", async () => {
  const bounded = await readBoundedExplicitSubtrees(
    [{ uuid: "root", content: "event snapshot" }],
    async (externalId) => entities[externalId],
    { maximumRoots: 4, maximumBlocks: 2 },
  );
  assert.equal(bounded.truncated, true);
  assert.deepEqual(bounded.blocks.map((block) => (block as { uuid: string }).uuid), ["root", "step"]);

  let cancelled = false;
  const cancelledResult = await readBoundedExplicitSubtrees(
    [{ uuid: "root", content: "event snapshot" }],
    async (externalId) => {
      cancelled = true;
      return entities[externalId];
    },
    { maximumRoots: 4, maximumBlocks: 8 },
    () => cancelled,
  );
  assert.equal(cancelledResult.cancelled, true);
  assert.deepEqual(cancelledResult.blocks.map((block) => (block as { uuid: string }).uuid), ["root"]);

  const highFanOut = await readBoundedExplicitSubtrees(
    [{ uuid: "fanout", content: "event snapshot" }],
    async (externalId) => externalId === "fanout"
      ? { uuid: "fanout", content: "[任务] 根", children: [["uuid", "only-child"], ["uuid", "overflow-child"], ["malformed", 42], ...Array.from({ length: 10_000 }, (_, index) => ["uuid", `ignored-${index}`])] }
      : { uuid: externalId, content: "TODO 子项", children: [] },
    { maximumRoots: 4, maximumBlocks: 2 },
  );
  assert.equal(highFanOut.truncated, true);
  assert.deepEqual(highFanOut.blocks.map((block) => (block as { uuid: string }).uuid), ["fanout", "only-child"]);

  const mismatched = await readBoundedExplicitSubtrees(
    [{ uuid: "root", content: "event snapshot" }],
    async () => ({ ...entities.root as object, uuid: "wrong" }),
    { maximumRoots: 4, maximumBlocks: 8 },
  );
  assert.match(String(mismatched.failure), /不匹配/);
  assert.deepEqual(mismatched.blocks, []);
  const malformed = await readBoundedExplicitSubtrees(
    [{ uuid: "root", content: "event snapshot" }],
    async () => ({ uuid: "root", content: "bad", children: [["uuid", 42]] }),
    { maximumRoots: 4, maximumBlocks: 8 },
  );
  assert.match(String(malformed.failure), /引用形态/);
  assert.deepEqual(malformed.blocks.map((block) => (block as { uuid: string }).uuid), ["root"]);
});

test("a cycle that exactly consumes the block budget is complete rather than truncated", async () => {
  const cyclic: Record<string, unknown> = {
    root: { uuid: "root", content: "[任务] 根", children: [["uuid", "child"]] },
    child: { uuid: "child", content: "[决策] 子节点", children: [["uuid", "root"]] },
  };
  const result = await readBoundedExplicitSubtrees(
    [{ uuid: "root" }],
    async (externalId) => cyclic[externalId],
    { maximumRoots: 1, maximumBlocks: 2 },
  );
  assert.deepEqual(result.blocks.map((block) => (block as { uuid: string }).uuid), ["root", "child"]);
  assert.equal(result.truncated, false);
  assert.equal(result.failure, undefined);
});
