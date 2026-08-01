import assert from "node:assert/strict";
import test from "node:test";

import { WorksiteChangeRouter, type WorksiteChangeRouterHost } from "../src/worksite-change-router.ts";

function block(uuid: string, content: string, parent?: unknown, children: unknown[] = []): Record<string, unknown> {
  return { uuid, content, ...(parent !== undefined ? { parent } : {}), children };
}

function targetKey(target: unknown): string {
  if (typeof target === "string") return target;
  if (typeof target === "number") return `db:${target}`;
  return JSON.stringify(target);
}

function fakeHost(blocks: Map<string, unknown>, reads: unknown[] = []): { host: WorksiteChangeRouterHost; reads: unknown[] } {
  return {
    host: {
      async getBlock(target) {
        reads.push(target);
        return blocks.get(targetKey(target));
      },
    },
    reads,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function affectedCollector(): { affected: string[][]; onAffected: (objectIds: readonly string[]) => void } {
  const affected: string[][] = [];
  return { affected, onAffected: (objectIds) => affected.push([...objectIds]) };
}

test("router invalidates the object when the primary anchor itself changes", async () => {
  const { affected, onAffected } = affectedCollector();
  const router = new WorksiteChangeRouter({ getBlock: async () => undefined }, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "anchor-1", content: "[任务] 标题变化" }]);
  await delay(25);
  assert.deepEqual(affected, [["object-1"]]);
  router.dispose();
});

test("router walks a bounded parent chain from a direct child to its anchor", async () => {
  const anchor = block("anchor-1", "[任务] 根", undefined, [["uuid", "child-1"]]);
  const child = block("child-1", "工作记录", { id: 1 });
  const reads: unknown[] = [];
  const { host } = fakeHost(new Map<string, unknown>([["anchor-1", anchor], ["child-1", child], ["db:1", anchor]]), reads);
  const { affected, onAffected } = affectedCollector();
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "child-1", content: "工作记录" }]);
  await delay(25);
  assert.deepEqual(affected, [["object-1"]]);
  assert.deepEqual(reads, ["child-1", 1], "the changed block and its entity-id parent are read");
  assert.equal(router.metrics().maxParentDepthUsed, 1);
  router.dispose();
});

test("router reaches a grandchild through two parent hops", async () => {
  const anchor = block("anchor-1", "[任务] 根", undefined, [["uuid", "parent-1"]]);
  const parent = block("parent-1", "第一层", { id: 1 }, [["uuid", "child-1"]]);
  const child = block("child-1", "第二层", { id: 2 });
  const { affected, onAffected } = affectedCollector();
  const { host } = fakeHost(new Map<string, unknown>([
    ["anchor-1", anchor],
    ["parent-1", parent],
    ["child-1", child],
    ["db:1", anchor],
    ["db:2", parent],
  ]));
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "child-1", content: "第二层" }]);
  await delay(25);
  assert.deepEqual(affected, [["object-1"]]);
  router.dispose();
});

test("router maps the first child added under an empty loaded anchor", async () => {
  const anchor = block("anchor-1", "[任务] 空", undefined, [["uuid", "child-1"]]);
  const child = block("child-1", "新增记录", { id: 1 });
  const { affected, onAffected } = affectedCollector();
  const { host } = fakeHost(new Map<string, unknown>([
    ["anchor-1", anchor],
    ["child-1", child],
    ["db:1", anchor],
  ]));
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "child-1", content: "新增记录" }]);
  await delay(25);
  assert.deepEqual(affected, [["object-1"]]);
  router.dispose();
});

test("router resolves a known loaded descendant without a read (deletion-safe)", async () => {
  const reads: unknown[] = [];
  const { host } = fakeHost(new Map(), reads);
  const { affected, onAffected } = affectedCollector();
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.observeLoaded("object-1", "anchor-1", {
    status: "loaded",
    blocks: [{ externalId: "child-1", content: "旧记录", depth: 1 }],
    totalVisibleCount: 1,
    truncated: false,
    remainingCount: 0,
    readAt: "2026-08-01T00:00:00.000Z",
  });
  router.handleChangedBlocks([{ uuid: "child-1" }]);
  await delay(25);
  assert.deepEqual(affected, [["object-1"]]);
  assert.deepEqual(reads, [], "the reverse index avoids reading a deleted block");
  router.dispose();
});

test("router ignores a deletion that was never loaded and has no readable parent chain", async () => {
  const { affected, onAffected } = affectedCollector();
  const { host } = fakeHost(new Map());
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "never-loaded-child" }]);
  await delay(25);
  assert.deepEqual(affected, []);
  assert.equal(router.metrics().changedBlocksIgnored, 1);
  router.dispose();
});

test("router treats a child moved into the subtree as affected", async () => {
  const anchor = block("anchor-1", "[任务] 根", undefined, [["uuid", "moved-child"]]);
  const moved = block("moved-child", "移入记录", { id: 1 });
  const { affected, onAffected } = affectedCollector();
  const { host } = fakeHost(new Map<string, unknown>([
    ["anchor-1", anchor],
    ["moved-child", moved],
    ["db:1", anchor],
  ]));
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "moved-child", content: "移入记录" }]);
  await delay(25);
  assert.deepEqual(affected, [["object-1"]]);
  router.dispose();
});

test("router treats a known child moved out as affected through the reverse index", async () => {
  const { affected, onAffected } = affectedCollector();
  const { host } = fakeHost(new Map());
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.observeLoaded("object-1", "anchor-1", {
    status: "loaded",
    blocks: [{ externalId: "moved-child", content: "旧位置", depth: 1 }],
    totalVisibleCount: 1,
    truncated: false,
    remainingCount: 0,
    readAt: "2026-08-01T00:00:00.000Z",
  });
  router.handleChangedBlocks([{ uuid: "moved-child", content: "移出" }]);
  await delay(25);
  assert.deepEqual(affected, [["object-1"]], "the source subtree changed even though the child left it");
  router.dispose();
});

test("router ignores changes in an unrelated tree", async () => {
  const root = block("other-root", "普通页面根", undefined, [["uuid", "other-child"]]);
  const child = block("other-child", "无关内容", { id: 99 });
  const { affected, onAffected } = affectedCollector();
  const { host } = fakeHost(new Map<string, unknown>([
    ["other-root", root],
    ["other-child", child],
    ["db:99", root],
  ]));
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "other-child", content: "无关" }]);
  await delay(25);
  assert.deepEqual(affected, []);
  assert.equal(router.metrics().changedBlocksIgnored, 1);
  router.dispose();
});

test("router stops the parent chain at the configured depth limit", async () => {
  const { affected, onAffected } = affectedCollector();
  const reads: unknown[] = [];
  const blocks = new Map<string, unknown>();
  for (let level = 1; level <= 6; level += 1) {
    const uuid = `level-${level}`;
    const parentRef = level < 6 ? { id: level + 1 } : undefined;
    blocks.set(uuid, block(uuid, `层级 ${level}`, parentRef));
    blocks.set(`db:${level}`, blocks.get(uuid));
  }
  const { host } = fakeHost(blocks, reads);
  const router = new WorksiteChangeRouter(host, { debounceMs: 10, maximumParentDepth: 3, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "level-1", content: "深层" }]);
  await delay(25);
  assert.deepEqual(affected, []);
  assert.equal(router.metrics().maxParentDepthUsed, 3);
  assert.equal(router.metrics().parentChainReads, 3);
  router.dispose();
});

test("router debounces and merges rapid changes per object but keeps objects independent", async () => {
  const anchorA = block("anchor-a", "[任务] A", undefined, [["uuid", "child-a"]]);
  const anchorB = block("anchor-b", "[任务] B", undefined, [["uuid", "child-b"]]);
  const childA = block("child-a", "A1", { id: 1 });
  const childB = block("child-b", "B1", { id: 2 });
  const reads: unknown[] = [];
  const { host } = fakeHost(new Map<string, unknown>([
    ["anchor-a", anchorA],
    ["anchor-b", anchorB],
    ["child-a", childA],
    ["child-b", childB],
    ["db:1", anchorA],
    ["db:2", anchorB],
  ]), reads);
  const { affected, onAffected } = affectedCollector();
  const router = new WorksiteChangeRouter(host, { debounceMs: 20, onAffected });
  router.setTrackedAnchors([
    { objectId: "object-a", anchor: "anchor-a" },
    { objectId: "object-b", anchor: "anchor-b" },
  ]);
  router.handleChangedBlocks([{ uuid: "child-a", content: "A1" }]);
  await delay(5);
  router.handleChangedBlocks([{ uuid: "child-a", content: "A2" }]);
  router.handleChangedBlocks([{ uuid: "child-b", content: "B1" }]);
  await delay(40);
  assert.deepEqual(affected.sort(), [["object-a"], ["object-b"]]);
  assert.equal(router.metrics().debouncedInvalidations, 2);
  router.dispose();
});

test("router caps the changed-block batch and counts truncation", async () => {
  const { affected, onAffected } = affectedCollector();
  const router = new WorksiteChangeRouter({ getBlock: async () => undefined }, {
    debounceMs: 10,
    maximumChangedBlocksPerBatch: 2,
    onAffected,
  });
  router.setTrackedAnchors([
    { objectId: "object-a", anchor: "anchor-a" },
    { objectId: "object-b", anchor: "anchor-b" },
    { objectId: "object-c", anchor: "anchor-c" },
  ]);
  router.handleChangedBlocks([
    { uuid: "anchor-a" },
    { uuid: "anchor-b" },
    { uuid: "anchor-c" },
  ]);
  await delay(25);
  assert.deepEqual(affected, [["object-a"], ["object-b"]]);
  assert.equal(router.metrics().changedBlocksSeen, 2);
  assert.equal(router.metrics().batchesTruncated, 1);
  router.dispose();
});

test("router clear and dispose cancel pending invalidations and stop accepting events", async () => {
  const { affected, onAffected } = affectedCollector();
  const router = new WorksiteChangeRouter({ getBlock: async () => undefined }, { debounceMs: 20, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.handleChangedBlocks([{ uuid: "anchor-1" }]);
  router.clear();
  await delay(40);
  assert.deepEqual(affected, []);
  router.handleChangedBlocks([{ uuid: "anchor-1" }]);
  router.dispose();
  router.handleChangedBlocks([{ uuid: "anchor-1" }]);
  await delay(40);
  assert.deepEqual(affected, []);
  assert.equal(router.metrics().changeEventsReceived, 2, "events after dispose are not accepted");
});

test("router prunes reverse index and timers for objects no longer tracked", async () => {
  const { affected, onAffected } = affectedCollector();
  const { host } = fakeHost(new Map());
  const router = new WorksiteChangeRouter(host, { debounceMs: 20, onAffected });
  router.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  router.observeLoaded("object-1", "anchor-1", {
    status: "loaded",
    blocks: [{ externalId: "child-1", content: "旧", depth: 1 }],
    totalVisibleCount: 1,
    truncated: false,
    remainingCount: 0,
    readAt: "2026-08-01T00:00:00.000Z",
  });
  router.handleChangedBlocks([{ uuid: "child-1" }]);
  router.setTrackedAnchors([{ objectId: "object-2", anchor: "anchor-2" }]);
  router.handleChangedBlocks([{ uuid: "child-1" }]);
  await delay(40);
  assert.deepEqual(affected, [], "the untracked object's reverse index and timer must be pruned");
  router.dispose();
});

test("router observeLoaded rebuilds the reverse index for the object", async () => {
  const { host } = fakeHost(new Map());
  const withCollector = affectedCollector();
  const second = new WorksiteChangeRouter(host, { debounceMs: 10, onAffected: withCollector.onAffected });
  second.setTrackedAnchors([{ objectId: "object-1", anchor: "anchor-1" }]);
  second.observeLoaded("object-1", "anchor-1", {
    status: "loaded",
    blocks: [{ externalId: "child-old", content: "旧", depth: 1 }],
    totalVisibleCount: 1,
    truncated: false,
    remainingCount: 0,
    readAt: "2026-08-01T00:00:00.000Z",
  });
  second.observeLoaded("object-1", "anchor-1", {
    status: "loaded",
    blocks: [{ externalId: "child-new", content: "新", depth: 1 }],
    totalVisibleCount: 1,
    truncated: false,
    remainingCount: 0,
    readAt: "2026-08-01T00:00:02.000Z",
  });
  second.handleChangedBlocks([{ uuid: "child-old" }]);
  second.handleChangedBlocks([{ uuid: "child-new" }]);
  await delay(25);
  assert.deepEqual(withCollector.affected, [["object-1"]]);
  second.dispose();
});
