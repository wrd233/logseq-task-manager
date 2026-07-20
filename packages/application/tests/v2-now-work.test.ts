import assert from "node:assert/strict";
import test from "node:test";

import type { V2ManagedObject } from "@task-copilot/domain";
import { projectV2NowWork } from "../src/v2-now-work.ts";

function object(objectId: string, condition: V2ManagedObject["condition"], updatedAt: string, lifecycle: V2ManagedObject["lifecycle"] = "OPEN"): V2ManagedObject {
  return { objectId, objectType: "TASK", version: 1, lifecycle, condition, text: objectId, createdAt: updatedAt, updatedAt, sourceOrCreationEvent: "test" };
}

test("V2 Now Work has three explainable regions, hides ordinary Waiting, and never loads historical OPEN wholesale", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const projection = projectV2NowWork([
    object("focus", { kind: "ACTIONABLE" }, "2026-07-01T00:00:00.000Z"),
    object("next", { kind: "ACTIONABLE" }, "2026-07-19T00:00:00.000Z"),
    object("historical-open", { kind: "ACTIONABLE" }, "2026-01-01T00:00:00.000Z"),
    object("waiting-due", { kind: "WAITING", waitingFor: "平台负责人", expectedResult: "事件", reviewAt: "2026-07-20T00:00:00.000Z" }, "2026-07-10T00:00:00.000Z"),
    object("waiting-quiet", { kind: "WAITING", waitingFor: "供应商", expectedResult: "回复", reviewAt: "2026-08-20T00:00:00.000Z" }, "2026-07-10T00:00:00.000Z"),
    object("completed", { kind: "ACTIONABLE" }, "2026-07-20T00:00:00.000Z", "COMPLETED"),
  ], [{ objectId: "focus", selectedAt: "2026-07-20T01:00:00.000Z", rank: 0 }], now);
  assert.deepEqual(projection.focus.map((item) => item.objectId), ["focus"]);
  assert.deepEqual(projection.next.map((item) => item.objectId), ["next"]);
  assert.deepEqual(projection.waitingReview.map((item) => item.objectId), ["waiting-due"]);
  assert.equal(JSON.stringify(projection).includes("historical-open"), false);
  assert.equal(JSON.stringify(projection).includes("waiting-quiet"), false);
  assert.equal(JSON.stringify(projection).includes("score"), false);
});
