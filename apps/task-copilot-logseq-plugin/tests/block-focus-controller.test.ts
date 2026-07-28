import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";
import type { ServiceNowWork, ServicePrimaryAnchorPage } from "@task-copilot/service-client";

import { BlockFocusController, type BlockFocusClient } from "../src/block-focus-controller.ts";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  return {
    objectId: "task-1",
    objectType: "TASK",
    version: 3,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "准备周会",
    createdAt: "2026-07-23T01:00:00.000Z",
    updatedAt: "2026-07-23T01:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
}

function anchor(overrides: Partial<V2Anchor> = {}): V2Anchor {
  return {
    anchorId: "anchor-1",
    objectId: "task-1",
    graphId: "graph-a",
    externalId: "block-1",
    role: "primary_text",
    status: "active",
    contentHash: "hash-1",
    lastSeenAt: "2026-07-23T01:00:00.000Z",
    ...overrides,
  };
}

function nowWork(overrides: Partial<ServiceNowWork> = {}): ServiceNowWork {
  return {
    generatedAt: "2026-07-23T01:00:00.000Z",
    focus: [],
    next: [],
    waitingReview: [],
    conditionOptions: [],
    ...overrides,
  };
}

test("Block context Focus resolves the active Primary Anchor and adds the object at the end", async () => {
  const calls: Array<{ objectId: string; expectedVersion: number; rank: number }> = [];
  const client: BlockFocusClient = {
    async listObjects() { return [object()]; },
    async listPrimaryAnchors(): Promise<ServicePrimaryAnchorPage> { return { anchors: [anchor()] }; },
    async nowWork() {
      return nowWork({
        focus: [{
          objectId: "task-existing",
          objectType: "TASK",
          version: 1,
          text: "已有关注",
          condition: { kind: "ACTIONABLE" },
          updatedAt: "2026-07-23T00:00:00.000Z",
          reason: "FOCUS",
        }],
      });
    },
    async selectFocus(objectId, expectedVersion, rank) {
      calls.push({ objectId, expectedVersion, rank });
      return { status: "SELECTED", selection: { objectId, rank, selectedAt: "2026-07-23T01:01:00.000Z" } };
    },
    async removeFocus() {
      throw new Error("unexpected remove");
    },
  };

  const result = await new BlockFocusController(() => client).toggle("block-1");

  assert.deepEqual(calls, [{ objectId: "task-1", expectedVersion: 3, rank: 1 }]);
  assert.deepEqual(result, {
    status: "SELECTED",
    blockUuid: "block-1",
    objectId: "task-1",
    objectText: "准备周会",
    message: "已加入当前关注：准备周会。可用“撤销上一次关注变化”恢复。",
  });
});

test("undo restores a removed Focus item to its previous rank", async () => {
  let focused = true;
  const calls: string[] = [];
  const client: BlockFocusClient = {
    async listObjects() { return [object()]; },
    async listPrimaryAnchors() { return { anchors: [anchor()] }; },
    async nowWork() {
      return nowWork({
        focus: [
          {
            objectId: "task-before",
            objectType: "TASK",
            version: 1,
            text: "上一项",
            condition: { kind: "ACTIONABLE" },
            updatedAt: "2026-07-23T00:00:00.000Z",
            reason: "FOCUS",
          },
          ...(focused ? [{
            objectId: "task-1",
            objectType: "TASK",
            version: 3,
            text: "准备周会",
            condition: { kind: "ACTIONABLE" },
            updatedAt: "2026-07-23T01:00:00.000Z",
            reason: "FOCUS",
          } satisfies ServiceNowWork["focus"][number]] : []),
        ],
      });
    },
    async selectFocus(objectId, expectedVersion, rank) {
      calls.push(`select:${objectId}:${expectedVersion}:${rank}`);
      focused = true;
      return { status: "SELECTED", selection: { objectId, rank, selectedAt: "2026-07-23T01:02:00.000Z" } };
    },
    async removeFocus(objectId, expectedVersion) {
      calls.push(`remove:${objectId}:${expectedVersion}`);
      focused = false;
      return { status: "REMOVED", objectId };
    },
  };
  const controller = new BlockFocusController(() => client);

  assert.equal((await controller.toggle("block-1")).status, "REMOVED");
  const result = await controller.undoLast();

  assert.deepEqual(calls, ["remove:task-1:3", "select:task-1:3:1"]);
  assert.deepEqual(result, {
    status: "UNDONE",
    blockUuid: "block-1",
    objectId: "task-1",
    objectText: "准备周会",
    message: "已撤销：准备周会已恢复到当前关注。",
  });
  assert.equal(controller.hasUndo(), false);
});

test("a pending Block Focus mutation rejects duplicate submission without a second write", async () => {
  let release: (() => void) | undefined;
  let selectCalls = 0;
  const client: BlockFocusClient = {
    async listObjects() { return [object()]; },
    async listPrimaryAnchors() { return { anchors: [anchor()] }; },
    async nowWork() { return nowWork(); },
    async selectFocus(objectId, _expectedVersion, rank) {
      selectCalls += 1;
      await new Promise<void>((resolve) => { release = resolve; });
      return { status: "SELECTED", selection: { objectId, rank, selectedAt: "2026-07-23T01:03:00.000Z" } };
    },
    async removeFocus() {
      throw new Error("unexpected remove");
    },
  };
  const controller = new BlockFocusController(() => client);

  const first = controller.toggle("block-1");
  await new Promise<void>((resolve) => setImmediate(resolve));
  await assert.rejects(() => controller.toggle("block-1"), /正在处理/);
  release?.();
  await first;

  assert.equal(selectCalls, 1);
});

test("an unmanaged or stale Block fails closed before any Focus write", async () => {
  let writes = 0;
  const client: BlockFocusClient = {
    async listObjects() { return [object()]; },
    async listPrimaryAnchors() {
      return { anchors: [anchor({ status: "missing" })] };
    },
    async nowWork() { return nowWork(); },
    async selectFocus(objectId, _expectedVersion, rank) {
      writes += 1;
      return { status: "SELECTED", selection: { objectId, rank, selectedAt: "2026-07-23T01:03:00.000Z" } };
    },
    async removeFocus(objectId) {
      writes += 1;
      return { status: "REMOVED", objectId };
    },
  };

  await assert.rejects(
    () => new BlockFocusController(() => client).toggle("block-1"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /尚未由 Task Copilot 管理/);
      assert.doesNotMatch(error.message, /Block|Anchor|active|Primary|Local Service|V2/u);
      return true;
    },
  );
  assert.equal(writes, 0);
});
