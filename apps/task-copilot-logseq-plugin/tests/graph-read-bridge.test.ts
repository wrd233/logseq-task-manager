import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceGraphReadQuery, ServiceGraphReadRequest } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { executeGraphReadRequest, type GraphReadBridgeHost } from "../src/graph-read-bridge.ts";

const at = new Date("2026-07-22T09:00:00.000Z");

function request(value: ServiceGraphReadQuery): ServiceGraphReadRequest {
  return { ...value, requestId: "graph_read_test", requestedAt: "2026-07-22T08:59:59.000Z", expiresAt: "2026-07-22T09:00:08.000Z" };
}

test("Logseq read bridge returns bounded page and block excerpts with hashes and parent context", async () => {
  const page = { id: 10, uuid: "page-uuid", name: "project/test", originalName: "Project/Test" };
  const rootUuid = "11111111-1111-4111-8111-111111111111";
  const child = { id: 3, uuid: "block-child", content: "child", parent: 2, page: 10, children: [] };
  const root = { id: 2, uuid: rootUuid, content: `root\nid:: ${rootUuid}`, parent: 10, page: 10, children: [child] };
  const outside = { id: 4, uuid: "block-outside", content: "outside", parent: 10, page: 10, children: [] };
  const byIdentity = new Map<unknown, unknown>([[2, root], [3, child], [rootUuid, root], ["block-child", child]]);
  const host: GraphReadBridgeHost = {
    getPage: async (target) => target === 10 || target === "Project/Test" || target === "page-uuid" ? page : undefined,
    getPageBlocksTree: async () => [root, outside],
    getBlock: async (target) => byIdentity.get(target),
  };

  const pageResult = await executeGraphReadRequest(request({ kind: "PAGE", target: "Project/Test", depth: 0 }), host, at);
  assert.equal(pageResult.status, "FOUND");
  if (pageResult.status !== "FOUND") return;
  assert.deepEqual(pageResult.snapshot.blocks.map(({ uuid, relation, depth }) => ({ uuid, relation, depth })), [
    { uuid: rootUuid, relation: "ROOT", depth: 0 },
    { uuid: "block-outside", relation: "ROOT", depth: 0 },
  ]);
  assert.equal(pageResult.snapshot.truncated, true, "depth boundary is explicit when descendants exist");
  assert.equal(pageResult.snapshot.blocks[0]?.contentHash, checksum("root"));
  assert.equal(pageResult.snapshot.resolved.name, "Project/Test");

  const blockResult = await executeGraphReadRequest(request({ kind: "BLOCK", target: "block-child", includeChildren: false, parents: 1 }), host, at);
  assert.equal(blockResult.status, "FOUND");
  if (blockResult.status !== "FOUND") return;
  assert.deepEqual(blockResult.snapshot.blocks.map(({ uuid, relation, depth }) => ({ uuid, relation, depth })), [
    { uuid: rootUuid, relation: "PARENT", depth: 1 },
    { uuid: "block-child", relation: "ROOT", depth: 0 },
  ]);
  assert.equal(blockResult.snapshot.scopeHash, checksum({ kind: "BLOCK", resolved: blockResult.snapshot.resolved, blocks: blockResult.snapshot.blocks, truncated: false }));
});

test("Logseq read bridge resolves block refs, reports absence, and fails closed on malformed SDK shapes", async () => {
  const block = { id: 2, uuid: "block-resolved", content: "resolved", parent: 10, page: 10, children: [] };
  const host: GraphReadBridgeHost = {
    getPage: async () => undefined,
    getPageBlocksTree: async () => [],
    getBlock: async (target) => target === "block-resolved" ? block : undefined,
  };
  const resolved = await executeGraphReadRequest(request({ kind: "RESOLVE", target: "((block-resolved))" }), host, at);
  assert.equal(resolved.status, "FOUND");
  if (resolved.status === "FOUND") assert.equal(resolved.snapshot.resolved.id, "block-resolved");
  assert.equal((await executeGraphReadRequest(request({ kind: "BLOCK", target: "missing", includeChildren: true, parents: 2 }), host, at)).status, "NOT_FOUND");

  const malformed: GraphReadBridgeHost = { ...host, getPage: async () => ({ uuid: "page-without-name" }), getPageBlocksTree: async () => "not-an-array" };
  const error = await executeGraphReadRequest(request({ kind: "PAGE", target: "broken", depth: 2 }), malformed, at);
  assert.equal(error.status, "NOT_FOUND", "a page without a canonical name is not invented");
});
