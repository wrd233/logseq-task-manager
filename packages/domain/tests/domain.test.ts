import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkObject,
  renameWorkObject,
  type WorkObject,
} from "../src/index.ts";

test("CREATE_WORK_OBJECT starts one stable open work object without coupling identity to its anchor", () => {
  const object = createWorkObject({
    id: "work-01",
    kind: "TASK",
    title: "确认交换机管理口地址",
    at: "2026-08-12T14:00:00.000Z",
  });

  assert.deepEqual(object, {
    id: "work-01",
    kind: "TASK",
    title: "确认交换机管理口地址",
    lifecycle: "OPEN",
    engagement: "ACTIONABLE",
    version: 1,
    createdAt: "2026-08-12T14:00:00.000Z",
    updatedAt: "2026-08-12T14:00:00.000Z",
  });
  assert.equal("anchor" in object, false);
});

test("RENAME_WORK_OBJECT requires the current version and preserves lifecycle identity", () => {
  const before: WorkObject = {
    id: "work-01",
    kind: "TASK",
    title: "确认地址",
    lifecycle: "OPEN",
    engagement: "ACTIONABLE",
    version: 3,
    createdAt: "2026-08-12T14:00:00.000Z",
    updatedAt: "2026-08-12T14:00:00.000Z",
  };

  const after = renameWorkObject(before, {
    title: "确认交换机管理口地址",
    expectedVersion: 3,
    at: "2026-08-12T14:05:00.000Z",
  });

  assert.deepEqual(after, {
    ...before,
    title: "确认交换机管理口地址",
    version: 4,
    updatedAt: "2026-08-12T14:05:00.000Z",
  });
  assert.throws(
    () => renameWorkObject(before, { title: "新标题", expectedVersion: 2, at: "2026-08-12T14:05:00.000Z" }),
    /WORK_OBJECT_VERSION_MISMATCH/,
  );
});

test("work object validation rejects unsupported kinds, empty titles, and ended engagement", () => {
  assert.throws(
    () => createWorkObject({ id: "work-01", kind: "AREA" as "TASK", title: "Area", at: "2026-08-12T14:00:00.000Z" }),
    /WORK_OBJECT_KIND_INVALID/,
  );
  assert.throws(
    () => createWorkObject({ id: "work-01", kind: "TASK", title: "  ", at: "2026-08-12T14:00:00.000Z" }),
    /WORK_OBJECT_TITLE_REQUIRED/,
  );
});
