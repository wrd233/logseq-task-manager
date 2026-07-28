import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2Condition, V2ManagedObject } from "@task-copilot/domain";

import {
  BlockConditionController,
  buildBlockCondition,
  type BlockConditionClient,
} from "../src/block-condition-controller.ts";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  return {
    objectId: "task-1",
    objectType: "TASK",
    version: 3,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "等待评审",
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

function client(overrides: Partial<BlockConditionClient> = {}): BlockConditionClient {
  return {
    async listObjects() { return [object()]; },
    async listPrimaryAnchors() { return { anchors: [anchor()] }; },
    async changeCondition(objectId, expectedVersion, condition) {
      return { object: object({ objectId, version: expectedVersion + 1, condition }) };
    },
    ...overrides,
  };
}

test("condition intent builder exposes only the minimum user fields", () => {
  assert.deepEqual(buildBlockCondition({ intent: "ACTIONABLE" }), {
    kind: "ACTIONABLE",
  });
  assert.deepEqual(buildBlockCondition({
    intent: "WAITING",
    summary: " 等评审人确认恢复结果 ",
    reviewAt: "2026-07-24T09:30",
  }), {
    kind: "WAITING",
    waitingFor: "等评审人确认恢复结果",
    expectedResult: "等评审人确认恢复结果",
    reviewAt: "2026-07-24T01:30:00.000Z",
  });
  assert.deepEqual(buildBlockCondition({
    intent: "BLOCKED",
    reason: " 缺少测试环境 ",
    blockerObjectId: " project-2 ",
  }), {
    kind: "BLOCKED",
    reason: "缺少测试环境",
    blockerObjectId: "project-2",
  });
  assert.deepEqual(buildBlockCondition({
    intent: "PAUSED",
    reason: " 先完成发布 ",
    reviewAt: "2026-07-25T10:00+08:00",
  }), {
    kind: "PAUSED",
    reason: "先完成发布",
    reviewAt: "2026-07-25T02:00:00.000Z",
  });
  assert.throws(() => buildBlockCondition({ intent: "WAITING", summary: "", reviewAt: "" }), /等谁或什么结果.*复查时间/);
  assert.throws(() => buildBlockCondition({ intent: "PAUSED", reason: "稍后", reviewAt: "not-a-date" }), /合法的重新判断时间/);
});

test("prepare accepts only one open object bound through an active Primary Anchor", async () => {
  const controller = new BlockConditionController(() => client());
  assert.deepEqual(await controller.prepare("block-1"), {
    blockUuid: "block-1",
    objectId: "task-1",
    objectText: "等待评审",
    objectVersion: 3,
    condition: { kind: "ACTIONABLE" },
  });

  await assert.rejects(
    () => new BlockConditionController(() => client({
      async listPrimaryAnchors() { return { anchors: [] }; },
    })).prepare("block-1"),
    /尚未由 Task Copilot 管理.*原状态未改变/,
  );
  await assert.rejects(
    () => new BlockConditionController(() => client({
      async listObjects() { return [object({ lifecycle: "COMPLETED" })]; },
    })).prepare("block-1"),
    /事项已经结束.*原状态未改变/,
  );
});

test("apply changes only Condition and session Undo restores the exact prior Condition", async () => {
  let current = object();
  const changes: V2Condition[] = [];
  const api = client({
    async listObjects() { return [current]; },
    async changeCondition(objectId, expectedVersion, condition) {
      assert.equal(objectId, current.objectId);
      assert.equal(expectedVersion, current.version);
      changes.push(condition);
      current = { ...current, version: current.version + 1, condition };
      return { object: current };
    },
  });
  const controller = new BlockConditionController(() => api);

  const result = await controller.apply({
    blockUuid: "block-1",
    objectId: "task-1",
    expectedVersion: 3,
    draft: { intent: "BLOCKED", reason: "缺少测试环境", blockerObjectId: "project-2" },
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.objectVersion, 4);
  assert.match(result.message, /当前关注保持不变.*可以撤销刚才的状态变化/);
  assert.doesNotMatch(result.message, /\bFocus\b|Local Service|Condition/);
  assert.deepEqual(current.condition, { kind: "BLOCKED", reason: "缺少测试环境", blockerObjectId: "project-2" });
  assert.equal(controller.hasUndo(), true);

  current = {
    ...current,
    condition: { blockerObjectId: "project-2", kind: "BLOCKED", reason: "缺少测试环境" },
  };
  const undone = await controller.undoLast();
  assert.equal(undone.status, "UNDONE");
  assert.match(undone.message, /恢复为“可以行动”.*当前关注保持不变/);
  assert.doesNotMatch(undone.message, /\bACTIONABLE\b|\bFocus\b|Local Service|Condition/);
  assert.deepEqual(current.condition, { kind: "ACTIONABLE" });
  assert.deepEqual(changes, [
    { kind: "BLOCKED", reason: "缺少测试环境", blockerObjectId: "project-2" },
    { kind: "ACTIONABLE" },
  ]);
  assert.equal(controller.hasUndo(), false);
});

test("a later reply restores Waiting to actionable through the same controller", async () => {
  let current = object({
    condition: {
      kind: "WAITING",
      waitingFor: "网络组回复",
      expectedResult: "确认端口权限",
      reviewAt: "2026-07-29T02:00:00.000Z",
    },
  });
  const controller = new BlockConditionController(() => client({
    async listObjects() { return [current]; },
    async changeCondition(objectId, expectedVersion, condition) {
      assert.equal(objectId, current.objectId);
      assert.equal(expectedVersion, current.version);
      current = { ...current, version: current.version + 1, condition };
      return { object: current };
    },
  }));

  const result = await controller.apply({
    blockUuid: "block-1",
    objectId: "task-1",
    expectedVersion: 3,
    draft: { intent: "ACTIONABLE" },
  });

  assert.equal(result.status, "ACTIONABLE");
  assert.deepEqual(current.condition, { kind: "ACTIONABLE" });
  assert.match(result.message, /已恢复为“可以行动”.*当前关注保持不变/);
  assert.doesNotMatch(result.message, /\bACTIONABLE\b|\bFocus\b|Local Service|Condition/);
});

test("duplicate submission is rejected while the first Condition command is in flight", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const controller = new BlockConditionController(() => client({
    async changeCondition(objectId, expectedVersion, condition) {
      await blocked;
      return { object: object({ objectId, version: expectedVersion + 1, condition }) };
    },
  }));
  const input = {
    blockUuid: "block-1",
    objectId: "task-1",
    expectedVersion: 3,
    draft: { intent: "PAUSED" as const, reason: "先完成发布", reviewAt: "2026-07-25T10:00+08:00" },
  };
  const first = controller.apply(input);
  await assert.rejects(() => controller.apply(input), /正在处理.*没有重复提交/);
  release();
  await first;
});

test("Undo refuses stale object or Condition instead of covering later changes", async () => {
  let current = object();
  let writes = 0;
  const controller = new BlockConditionController(() => client({
    async listObjects() { return [current]; },
    async changeCondition(_objectId, _expectedVersion, condition) {
      writes += 1;
      current = { ...current, version: current.version + 1, condition };
      return { object: current };
    },
  }));
  await controller.apply({
    blockUuid: "block-1",
    objectId: "task-1",
    expectedVersion: 3,
    draft: { intent: "BLOCKED", reason: "缺少测试环境" },
  });
  current = { ...current, version: 5, condition: { kind: "PAUSED", reason: "用户后续修改" } };
  await assert.rejects(() => controller.undoLast(), /对象或状态已在上次操作后变化.*没有执行撤销/);
  assert.equal(writes, 1);
});
