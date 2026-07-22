import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceGraphReadRequest, ServiceGraphReadResult } from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

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

test("Graph read bridge controller stops after the first transport failure instead of retrying a dead Service", async () => {
  let attempts = 0;
  const issues: string[] = [];
  const controller = new GraphReadBridgeController({
    getPage: async () => undefined,
    getPageBlocksTree: async () => [],
    getBlock: async () => undefined,
  }, {
    onIssue: (code) => issues.push(code),
  });
  controller.start({
    claimGraphReadRequest: async () => {
      attempts += 1;
      throw new Error("service stopped");
    },
    completeGraphReadRequest: async () => undefined,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(controller.isActive(), false);
  assert.equal(attempts, 1);
  assert.deepEqual(issues, ["GRAPH_READ_BRIDGE_TRANSPORT_FAILED"]);
});

test("Graph read bridge controller waits out one stale renderer claim without restricting the healthy Service", async () => {
  const request: ServiceGraphReadRequest = {
    kind: "BLOCK", target: "after-reload", includeChildren: false, parents: 0,
    requestId: "graph_read_after_reload", requestedAt: "2026-07-22T09:00:00.000Z", expiresAt: "2026-07-22T09:00:08.000Z",
  };
  let attempts = 0;
  let delays = 0;
  const issues: string[] = [];
  let resolveCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { resolveCompleted = resolve; });
  const controller = new GraphReadBridgeController({
    getPage: async () => undefined,
    getPageBlocksTree: async () => [],
    getBlock: async () => ({ uuid: "after-reload", content: "read only", children: [] }),
  }, {
    onIssue: (code) => issues.push(code),
    staleBridgeRetryDelayMs: 1,
    maximumStaleBridgeRetries: 2,
    delay: async () => { delays += 1; },
  });
  controller.start({
    claimGraphReadRequest: async () => {
      attempts += 1;
      if (attempts === 1) throw new StructuredError({ code: "SERVICE_HTTP_ERROR", message: "stale bridge", ruleRefs: [], details: { remoteCode: "GRAPH_READ_BRIDGE_ALREADY_CONNECTED" } });
      return request;
    },
    completeGraphReadRequest: async () => {
      controller.stop();
      resolveCompleted();
    },
  });
  await completed;
  assert.equal(attempts, 2);
  assert.equal(delays, 1);
  assert.deepEqual(issues, []);
});

test("Graph read bridge controller bounds stale renderer retries before entering restricted mode", async () => {
  let attempts = 0;
  const issues: string[] = [];
  const controller = new GraphReadBridgeController({
    getPage: async () => undefined,
    getPageBlocksTree: async () => [],
    getBlock: async () => undefined,
  }, {
    onIssue: (code) => issues.push(code),
    maximumStaleBridgeRetries: 2,
    delay: async () => undefined,
  });
  controller.start({
    claimGraphReadRequest: async () => {
      attempts += 1;
      throw new StructuredError({ code: "SERVICE_HTTP_ERROR", message: "duplicate bridge", ruleRefs: [], details: { remoteCode: "GRAPH_READ_BRIDGE_ALREADY_CONNECTED" } });
    },
    completeGraphReadRequest: async () => undefined,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(attempts, 3);
  assert.equal(controller.isActive(), false);
  assert.deepEqual(issues, ["GRAPH_READ_BRIDGE_TRANSPORT_FAILED"]);
});
