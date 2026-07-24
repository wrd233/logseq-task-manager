import assert from "node:assert/strict";
import test from "node:test";

import type { V2ManagedObject } from "@task-copilot/domain";

import { narrateV2ObjectStatus } from "../src/status-narration.ts";

const observedAt = "2026-07-24T10:00:00.000Z";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  return {
    objectId: "task-1",
    objectType: "TASK",
    version: 3,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "处理采购报价",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
}

test("due WAITING narration separates formal facts and exposes one qualified review action", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "NOW",
    object: object({
      condition: {
        kind: "WAITING",
        waitingFor: "采购负责人",
        expectedResult: "最终报价",
        reviewAt: "2026-07-24T09:00:00.000Z",
      },
    }),
  });

  assert.equal(narration.conclusion, "该确认已到复查时间");
  assert.deepEqual(narration.keyEvidence, ["正在等待采购负责人提供最终报价", "原定复查时间已到"]);
  assert.equal(narration.facts.length, 2);
  assert.deepEqual(narration.inferences, []);
  assert.deepEqual(narration.unknowns, []);
  assert.equal(narration.nextActionEligible, true);
  assert.deepEqual(narration.nextAction, {
    intent: "REVIEW_WAITING",
    label: "确认是否已收到最终报价",
    targetObjectId: "task-1",
  });
  assert.deepEqual(narration.evidenceScope.refs, ["object:task-1@v3"]);
  assert.deepEqual(narration.source, {
    kind: "DETERMINISTIC_RULE",
    ruleId: "condition-waiting-review-due",
    version: "1.0.0",
  });
});

test("future WAITING stays quiet and does not manufacture a next action", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "NOW",
    object: object({
      condition: {
        kind: "WAITING",
        waitingFor: "供应商",
        expectedResult: "书面答复",
        reviewAt: "2026-07-30T09:00:00.000Z",
      },
    }),
  });

  assert.equal(narration.conclusion, "正在等待供应商");
  assert.deepEqual(narration.keyEvidence, ["等待结果是书面答复", "已设置后续复查时间"]);
  assert.equal(narration.nextActionEligible, false);
  assert.equal(narration.nextAction, undefined);
  assert.deepEqual(narration.unknowns, []);
});

test("a completed known blocker is a formal fact and qualifies only in a related scene", () => {
  const blocked = object({
    condition: {
      kind: "BLOCKED",
      reason: "等待依赖事项完成",
      blockerObjectId: "task-blocker",
    },
  });
  const blocker = object({
    objectId: "task-blocker",
    lifecycle: "COMPLETED",
    text: "准备采购清单",
  });
  const related = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: blocked,
    blocker,
  });
  const background = narrateV2ObjectStatus({
    observedAt,
    scene: "BACKGROUND",
    object: blocked,
    blocker,
  });

  assert.equal(related.conclusion, "关联阻塞项已结束，需要重新判断是否可以继续");
  assert.deepEqual(related.inferences, []);
  assert.equal(related.nextActionEligible, true);
  assert.equal(related.nextAction?.intent, "REVIEW_BLOCKER");
  assert.deepEqual(related.evidenceScope.refs, ["object:task-1@v3", "object:task-blocker@v3"]);
  assert.equal(background.nextActionEligible, false);
  assert.equal(background.nextAction, undefined);
});

test("an unresolved blocker is stated without guessing and missing blocker context is explicit", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "BLOCKED",
        reason: "等待依赖事项完成",
        blockerObjectId: "task-blocker",
      },
    }),
  });

  assert.equal(narration.conclusion, "当前仍被阻塞");
  assert.deepEqual(narration.keyEvidence, ["等待依赖事项完成"]);
  assert.deepEqual(narration.inferences, []);
  assert.deepEqual(narration.unknowns, ["尚未读取关联阻塞项的当前状态"]);
  assert.equal(narration.nextActionEligible, false);
});

test("due PAUSED qualifies for reassessment while a future pause does not", () => {
  const due = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "PAUSED",
        reason: "等待下个采购周期",
        reviewAt: "2026-07-24T09:00:00.000Z",
      },
    }),
  });
  const future = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "PAUSED",
        reason: "等待下个采购周期",
        reviewAt: "2026-08-24T09:00:00.000Z",
      },
    }),
  });

  assert.equal(due.conclusion, "该事项已到重新判断时间");
  assert.equal(due.nextAction?.intent, "REVIEW_PAUSE");
  assert.equal(future.conclusion, "该事项已暂停");
  assert.equal(future.nextActionEligible, false);
});

test("Project current interface remains formal evidence but is not promoted into a guessed action", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "PROJECT",
    object: object({
      objectId: "project-1",
      objectType: "PROJECT",
      text: "供应商切换",
      projectStructure: {
        objectives: [],
        deliverables: [],
        workStages: [],
        currentSummary: "正在验证新供应商的报价与交付窗口。",
        currentFocuses: ["确认最终报价", "核对交付周期"],
        stageMappings: [],
      },
    }),
  });

  assert.equal(narration.conclusion, "正在验证新供应商的报价与交付窗口。");
  assert.deepEqual(narration.keyEvidence, ["当前推进：确认最终报价", "当前推进：核对交付周期"]);
  assert.equal(narration.nextActionEligible, false);
  assert.equal(narration.nextAction, undefined);
  assert.deepEqual(narration.unknowns, []);
});

test("dense presentation is bounded while full formal Project evidence remains available", () => {
  const longSummary = `当前摘要${"很长的正式内容".repeat(80)}`;
  const longFocus = `当前推进${"仍需保留的正式内容".repeat(40)}`;
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "PROJECT",
    object: object({
      objectId: "project-long",
      objectType: "PROJECT",
      projectStructure: {
        objectives: [],
        deliverables: [],
        workStages: [],
        currentSummary: longSummary,
        currentFocuses: [longFocus],
        stageMappings: [],
      },
    }),
  });

  assert.ok(narration.conclusion.length <= 160);
  assert.ok((narration.keyEvidence[0]?.length ?? 0) <= 160);
  assert.equal(narration.conclusion.endsWith("…"), true);
  assert.equal(narration.facts.some((item) => item.text.includes(longSummary)), true);
  assert.equal(narration.facts.some((item) => item.text.includes(longFocus)), true);
});

test("generic actionable and closed states never invent a next action", () => {
  const actionable = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object(),
  });
  const completed = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({ lifecycle: "COMPLETED" }),
  });

  assert.equal(actionable.conclusion, "当前可以继续推进");
  assert.deepEqual(actionable.unknowns, ["正式状态没有提供足够信息来判断具体下一步"]);
  assert.equal(actionable.nextActionEligible, false);
  assert.equal(completed.conclusion, "该事项已完成");
  assert.deepEqual(completed.unknowns, []);
  assert.equal(completed.nextActionEligible, false);
});

test("invalid observation or mismatched blocker evidence fails closed", () => {
  assert.throws(() => narrateV2ObjectStatus({
    observedAt: "not-a-time",
    scene: "NOW",
    object: object(),
  }), /observedAt/);
  assert.throws(() => narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "BLOCKED",
        reason: "等待依赖",
        blockerObjectId: "task-blocker",
      },
    }),
    blocker: object({ objectId: "different-object" }),
  }), /blocker/i);
});
