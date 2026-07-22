import assert from "node:assert/strict";
import test from "node:test";

import { checksum } from "@task-copilot/shared";

import { parseGraphReadQuery, parseGraphReadResult } from "../src/graph-read-contract.ts";

function foundResult() {
  const resolved = { kind: "BLOCK", id: "block-contract" };
  const blocks = [{ uuid: "block-contract", content: "contract", contentHash: checksum("contract"), relation: "ROOT", depth: 0 }];
  return {
    requestId: "graph_read_contract",
    status: "FOUND",
    snapshot: {
      kind: "BLOCK",
      requestedTarget: "block-contract",
      resolved,
      blocks,
      truncated: false,
      readAt: "2026-07-22T10:00:00.000Z",
      scopeHash: checksum({ kind: "BLOCK", resolved, blocks, truncated: false }),
    },
  };
}

test("Graph read contract accepts only the four bounded query dimensions", () => {
  assert.deepEqual(parseGraphReadQuery({ kind: "PAGE", target: "Project/中文", depth: 5 }), { kind: "PAGE", target: "Project/中文", depth: 5 });
  assert.deepEqual(parseGraphReadQuery({ kind: "BLOCK", target: "block-1", includeChildren: true, parents: 8 }), { kind: "BLOCK", target: "block-1", includeChildren: true, parents: 8 });
  assert.deepEqual(parseGraphReadQuery({ kind: "RESOLVE", target: "((block-1))" }), { kind: "RESOLVE", target: "((block-1))" });
  assert.throws(() => parseGraphReadQuery({ kind: "PAGE", target: "Project/Test", depth: 6 }), /仅支持有界/);
  assert.throws(() => parseGraphReadQuery({ kind: "BLOCK", target: "../../secret", includeChildren: false, parents: 0 }), /仅支持有界/);
  assert.throws(() => parseGraphReadQuery({ kind: "PAGE", target: "Project/Test", depth: 1, scanAll: true }), /仅支持有界/);
});

test("Graph read contract verifies exact shape, UTF-8 bounds, hashes, and request IDs", () => {
  assert.deepEqual(parseGraphReadResult(foundResult()), foundResult());
  assert.throws(() => parseGraphReadResult({ ...foundResult(), requestId: "../escape" }), /结果无效/);
  const badBlockHash = foundResult();
  badBlockHash.snapshot.blocks[0]!.contentHash = "00000000";
  assert.throws(() => parseGraphReadResult(badBlockHash), /哈希不匹配/);
  const badScopeHash = foundResult();
  badScopeHash.snapshot.scopeHash = "00000000";
  assert.throws(() => parseGraphReadResult(badScopeHash), /scope hash/);
  assert.throws(() => parseGraphReadResult({ requestId: "graph_read_contract", status: "NOT_FOUND", cached: true }), /形态无效/);
});
