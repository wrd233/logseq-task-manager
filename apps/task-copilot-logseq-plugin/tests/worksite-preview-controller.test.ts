import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceGraphBlockExcerpt } from "@task-copilot/service-client";

import type { GraphReadBridgeHost } from "../src/graph-read-bridge.ts";
import {
  projectWorksiteBlocks,
  WorksitePreviewController,
  type WorksitePreviewControllerOptions,
} from "../src/worksite-preview-controller.ts";

function block(uuid: string, content: string, children: unknown[] = [], parent?: unknown, page?: unknown): Record<string, unknown> {
  return {
    uuid,
    content,
    ...(parent !== undefined ? { parent } : {}),
    ...(page !== undefined ? { page } : {}),
    children,
  };
}

function fakeHost(blocksByUuid: Map<string, Record<string, unknown>>, options: { readDelayMs?: number } = {}): {
  host: GraphReadBridgeHost;
  getBlockCalls: string[];
  maxConcurrent: () => number;
} {
  let active = 0;
  let maxConcurrent = 0;
  const getBlockCalls: string[] = [];
  const host: GraphReadBridgeHost = {
    getPage: async () => undefined,
    getPageBlocksTree: async () => [],
    getBlock: async (target: unknown) => {
      const id = typeof target === "string" ? target : (target as { uuid?: string })?.uuid ?? String(target);
      getBlockCalls.push(id);
      if (options.readDelayMs) {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise((resolve) => setTimeout(resolve, options.readDelayMs));
        active -= 1;
      }
      return blocksByUuid.get(id);
    },
  };
  return { host, getBlockCalls, maxConcurrent: () => maxConcurrent };
}

function sampleTree(): Map<string, Record<string, unknown>> {
  const child3 = block("child-3", "第三层内容");
  const child2 = block("child-2", "第二层内容", [child3]);
  const child1 = block("child-1", "TODO 做第一步", [child2]);
  const root = block("root-1", "[任务] 示例标题", [child1]);
  return new Map([
    ["root-1", root],
    ["child-1", child1],
    ["child-2", child2],
    ["child-3", child3],
  ]);
}

test("worksite projection keeps child order, indentation depth and TODO markers", () => {
  const { blocks, totalVisibleCount, remainingCount, truncated } = projectWorksiteBlocks(
    [
      { uuid: "root-1", content: "[任务] 示例标题", contentHash: "h", relation: "ROOT", depth: 0 },
      { uuid: "child-1", content: "TODO 做第一步", contentHash: "h", relation: "CHILD", depth: 1 },
      { uuid: "child-2", content: "第二层内容", contentHash: "h", relation: "CHILD", depth: 2 },
    ],
    { blockLimit: 3, depthLimit: 2, characterLimit: 280, byteBased: false },
  );
  assert.equal(totalVisibleCount, 2);
  assert.equal(remainingCount, 0);
  assert.equal(truncated, false);
  assert.deepEqual(
    blocks.map((entry) => [entry.marker ?? null, entry.depth, entry.content]),
    [["TODO", 1, "做第一步"], [null, 2, "第二层内容"]],
  );
});

test("worksite projection hides empty blocks and id:: identity lines", () => {
  const { blocks, totalVisibleCount } = projectWorksiteBlocks(
    [
      { uuid: "root-1", content: "[任务] 示例", contentHash: "h", relation: "ROOT", depth: 0 },
      { uuid: "child-1", content: "   ", contentHash: "h", relation: "CHILD", depth: 1 },
      { uuid: "11111111-2222-4333-8444-555555555555", content: "id:: 11111111-2222-4333-8444-555555555555\n有效正文", contentHash: "h", relation: "CHILD", depth: 1 },
    ],
    { blockLimit: 3, depthLimit: 2, characterLimit: 280, byteBased: false },
  );
  assert.equal(totalVisibleCount, 1);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.content, "有效正文");
});

test("worksite short projection truncates large subtrees with a remaining count", () => {
  const excerpts: ServiceGraphBlockExcerpt[] = [
    { uuid: "root-1", content: "[任务] 大树", contentHash: "h", relation: "ROOT", depth: 0 },
    ...Array.from({ length: 20 }, (_, index) => ({
      uuid: `child-${index + 1}`,
      content: `子级 ${index + 1}`,
      contentHash: "h",
      relation: "CHILD" as const,
      depth: 1,
    })),
  ];
  const { blocks, remainingCount, truncated, totalVisibleCount } = projectWorksiteBlocks(
    excerpts,
    { blockLimit: 3, depthLimit: 2, characterLimit: 280, byteBased: false },
  );
  assert.equal(blocks.length, 3);
  assert.equal(totalVisibleCount, 20);
  assert.equal(remainingCount, 17);
  assert.equal(truncated, true);
});

test("worksite projection truncates a single very long Chinese block", () => {
  const long = "很长的工作记录。".repeat(60);
  const { blocks, truncated, remainingCount } = projectWorksiteBlocks(
    [
      { uuid: "root-1", content: "[任务] 长文", contentHash: "h", relation: "ROOT", depth: 0 },
      { uuid: "child-1", content: long, contentHash: "h", relation: "CHILD", depth: 1 },
    ],
    { blockLimit: 3, depthLimit: 2, characterLimit: 100, byteBased: false },
  );
  assert.equal(truncated, true);
  assert.equal(blocks[0]!.content.endsWith("…"), true);
  assert.ok([...blocks[0]!.content].length <= 101, "kept content stays near the character budget");
  assert.equal(remainingCount, 0);
});

test("worksite controller loads children once and serves the cache for the same source version", async () => {
  const { host, getBlockCalls } = fakeHost(sampleTree());
  const controller = new WorksitePreviewController(host);
  const first = await controller.load("object-1", "root-1", 1, "short");
  assert.equal(first.status, "loaded");
  assert.equal(first.status === "loaded" ? first.blocks.length : 0, 2);
  const second = await controller.load("object-1", "root-1", 1, "short");
  assert.equal(second.status, "loaded");
  assert.equal(getBlockCalls.filter((id) => id === "root-1").length, 1);
});

test("worksite controller treats a missing source as unavailable", async () => {
  const { host } = fakeHost(new Map());
  const controller = new WorksitePreviewController(host);
  const state = await controller.load("object-1", "missing-block", 1, "short");
  assert.deepEqual(state, { status: "unavailable", reason: "来源位置不可用" });
});

test("worksite controller returns a card-local error when the bridge fails", async () => {
  const host: GraphReadBridgeHost = {
    getPage: async () => undefined,
    getPageBlocksTree: async () => [],
    getBlock: async () => {
      throw new Error("GRAPH_READ_BLOCK_TOO_LARGE");
    },
  };
  const controller = new WorksitePreviewController(host);
  const state = await controller.load("object-1", "root-1", 1, "short");
  assert.equal(state.status, "error");
  assert.equal(state.status === "error" ? state.safeMessage : "", "暂时无法读取工作记录");
  assert.ok(state.status === "error" && typeof state.diagnosticId === "string");
});

test("worksite controller re-reads when the source version changes and never serves the old key", async () => {
  const { host, getBlockCalls } = fakeHost(sampleTree());
  const controller = new WorksitePreviewController(host);
  await controller.load("object-1", "root-1", 1, "short");
  assert.equal(controller.state("object-1", "root-1", 2, "short").status, "idle");
  controller.refreshFrom([{ objectId: "object-1", version: 2, anchor: "root-1" }]);
  const state = await controller.load("object-1", "root-1", 2, "short");
  assert.equal(state.status, "loaded");
  assert.equal(getBlockCalls.filter((id) => id === "root-1").length, 2);
});

test("worksite controller caps concurrent Graph reads", async () => {
  const { host, maxConcurrent } = fakeHost(sampleTree(), { readDelayMs: 40 });
  const controller = new WorksitePreviewController(host, { maximumConcurrency: 2 } satisfies WorksitePreviewControllerOptions);
  await Promise.all([
    controller.load("object-1", "root-1", 1, "short"),
    controller.load("object-2", "root-1", 1, "short"),
    controller.load("object-3", "root-1", 1, "short"),
  ]);
  assert.ok(maxConcurrent() <= 2, `expected max 2 concurrent reads, saw ${maxConcurrent()}`);
});

test("worksite controller notifies the runtime when a read finishes", async () => {
  const { host } = fakeHost(sampleTree());
  const notified: Array<{ objectId: string; mode: string; status: string }> = [];
  const controller = new WorksitePreviewController(host, {
    onStateChange: (objectId, mode) => {
      const state = controller.state(objectId, "root-1", 1, mode);
      notified.push({ objectId, mode, status: state.status });
    },
  });
  await controller.load("object-1", "root-1", 1, "short");
  assert.equal(notified.length, 1);
  assert.equal(notified[0]!.objectId, "object-1");
  assert.equal(notified[0]!.mode, "short");
  assert.equal(notified[0]!.status, "loaded");
});

test("worksite controller keeps the expanded set session-only and detached from formal state", () => {
  const { host } = fakeHost(sampleTree());
  const controller = new WorksitePreviewController(host);
  controller.setExpanded("object-1", true);
  assert.deepEqual(controller.expandedObjectIds(), ["object-1"]);
  controller.setExpanded("object-1", false);
  assert.deepEqual(controller.expandedObjectIds(), []);
});

test("worksite controller tracks overflow open state session-only", () => {
  const { host } = fakeHost(sampleTree());
  const controller = new WorksitePreviewController(host);
  assert.equal(controller.isOverflowOpen(), false);
  controller.setOverflowOpen(true);
  assert.equal(controller.isOverflowOpen(), true);
  controller.setOverflowOpen(false);
  assert.equal(controller.isOverflowOpen(), false);
});
