import assert from "node:assert/strict";
import test from "node:test";

import { checksum } from "@task-copilot/shared";

import {
  LogseqContentPort,
  LogseqFileStorageBlobStore,
  RuntimeShapeAdapter,
  type LogseqFacade,
} from "../src/index.ts";

function facade(content: string): LogseqFacade & { block: { uuid: string; content: string; page: unknown } } {
  const block = { uuid: "block-uuid", content, page: { name: "Journal" } };
  const values = new Map<string, string>();
  return {
    block,
    App: {
      async getCurrentGraph() {
        return { name: "Test Graph", url: "/graph" };
      },
    },
    Editor: {
      async getCurrentBlock() {
        return block;
      },
      async getBlock() {
        return block;
      },
      async updateBlock(_uuid, next) {
        block.content = next;
      },
      async scrollToBlockInPage() {},
    },
    FileStorage: {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        values.set(key, value);
      },
      async removeItem(key) {
        values.delete(key);
      },
    },
  };
}

test("runtime shape adapter accepts supported page references and refuses unknown shapes", () => {
  assert.equal(RuntimeShapeAdapter.pageRef("Journal"), "Journal");
  assert.equal(RuntimeShapeAdapter.pageRef(42), "42");
  assert.equal(RuntimeShapeAdapter.pageRef({ id: 7 }), "7");
  assert.equal(RuntimeShapeAdapter.pageRef({ uuid: "page-uuid" }), "page-uuid");
  assert.equal(RuntimeShapeAdapter.pageRef({ name: "Project/Test" }), "Project/Test");
  assert.throws(() => RuntimeShapeAdapter.pageRef({ nested: true }), /runtime shape/i);
});

test("content port prepares, applies, verifies and compensates Unicode long-text rewrites", async () => {
  const original = "告警链路".repeat(12_500);
  const api = facade(original);
  const port = new LogseqContentPort(api);
  const current = await port.getCurrentBlock();
  assert.equal(current?.text.length, original.length);
  const mutation = await port.prepare(
    {
      operationId: "op_1",
      operationType: "rewrite_content",
      target: { kind: "ANCHOR", id: "anc_1" },
      payload: { text: "正式正文" },
      preconditions: [],
      dependencies: [],
      riskLevel: "MEDIUM",
      ruleRefs: ["MAP-RWT-001"],
      rationale: "测试",
      confidence: 1,
      status: "ACCEPTED",
    },
    {
      anchorId: "anc_1",
      objectId: "obj_1",
      adapter: "logseq",
      graphId: "Test Graph:/graph",
      externalId: "block-uuid",
      role: "primary_text",
      contentHash: checksum(original),
      lastSeenAt: "2026-07-17T00:00:00.000Z",
      status: "active",
      cachedPageRef: "Journal",
    },
  );
  await port.apply(mutation);
  assert.equal(await port.verify(mutation, "after"), true);
  await port.compensate(mutation);
  assert.equal(await port.verify(mutation, "before"), true);
});

test("FileStorage adapter round trips only namespaced keys and maintains its registry", async () => {
  const api = facade("text");
  const blobs = new LogseqFileStorageBlobStore(api.FileStorage);
  await blobs.set("task-copilot/state/slot-a.json", "payload");
  assert.equal(await blobs.get("task-copilot/state/slot-a.json"), "payload");
  assert.deepEqual(await blobs.keys("task-copilot/state"), ["task-copilot/state/slot-a.json"]);
  await assert.rejects(blobs.set("other/key", "unsafe"), /namespace/i);
});
