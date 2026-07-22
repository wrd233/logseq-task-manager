import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceGraphReadRequest, ServiceGraphReadResult } from "@task-copilot/service-client";

import { GraphReadBridgeController } from "../src/graph-read-bridge-controller.ts";

test("Graph read bridge controller answers one Service request and stops without Graph writes", async () => {
  const request: ServiceGraphReadRequest = {
    kind: "BLOCK",
    target: "block-controller",
    includeChildren: false,
    parents: 0,
    requestId: "graph_read_controller",
    requestedAt: "2026-07-22T09:00:00.000Z",
    expiresAt: "2026-07-22T09:00:08.000Z",
  };
  let result: ServiceGraphReadResult | undefined;
  let resolveCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { resolveCompleted = resolve; });
  const controller = new GraphReadBridgeController({
    getPage: async () => ({ id: 1, uuid: "page-controller", name: "page-controller", originalName: "Page Controller" }),
    getPageBlocksTree: async () => [],
    getBlock: async () => ({ id: 2, uuid: "block-controller", content: "read only", parent: 1, page: 1, children: [] }),
  });
  controller.start({
    claimGraphReadRequest: async () => request,
    completeGraphReadRequest: async (value) => {
      result = value;
      controller.stop();
      resolveCompleted();
    },
  });
  await completed;
  assert.equal(result?.status, "FOUND");
  assert.equal(controller.isActive(), false);
  if (result?.status === "FOUND") assert.equal(result.snapshot.blocks[0]?.content, "read only");
});
