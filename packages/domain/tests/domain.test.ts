import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrimaryOwnership,
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

test("PrimaryOwnership permits only one shallow Project -> MiniProject -> Task tree", () => {
  const make = (id: string, kind: WorkObject["kind"]) => createWorkObject({ id, kind, title: id, at: "2026-08-12T14:00:00.000Z" });
  const project = make("project-01", "PROJECT");
  const project2 = make("project-02", "PROJECT");
  const mini = make("mini-01", "MINI_PROJECT");
  const task = make("task-01", "TASK");
  const objects = [project, project2, mini, task];
  const projectOwnsMini = createPrimaryOwnership({ childId: mini.id, ownerId: project.id, at: "2026-08-12T14:00:00.000Z", objects, existing: [] });
  assert.deepEqual(createPrimaryOwnership({ childId: task.id, ownerId: mini.id, at: "2026-08-12T14:00:00.000Z", objects, existing: [projectOwnsMini] }), {
    childId: "task-01", ownerId: "mini-01", createdAt: "2026-08-12T14:00:00.000Z",
  });
});

test("PrimaryOwnership rejects self, Project nesting, a second owner, cycles, and excess depth", () => {
  const make = (id: string, kind: WorkObject["kind"]) => createWorkObject({ id, kind, title: id, at: "2026-08-12T14:00:00.000Z" });
  const project = make("project", "PROJECT"); const project2 = make("project2", "PROJECT");
  const mini = make("mini", "MINI_PROJECT"); const task = make("task", "TASK");
  const objects = [project, project2, mini, task];
  assert.throws(
    () => createPrimaryOwnership({ childId: project.id, ownerId: project.id, at: project.createdAt, objects, existing: [] }),
    /OWNERSHIP_SELF_REFERENCE/u,
  );
  assert.throws(
    () => createPrimaryOwnership({ childId: project2.id, ownerId: project.id, at: project.createdAt, objects, existing: [] }),
    /OWNERSHIP_KIND_INVALID/u,
  );
  assert.throws(
    () => createPrimaryOwnership({ childId: task.id, ownerId: project2.id, at: project.createdAt, objects, existing: [{ childId: task.id, ownerId: project.id, createdAt: project.createdAt }] }),
    /OWNERSHIP_ALREADY_ASSIGNED/u,
  );
  assert.throws(
    () => createPrimaryOwnership({ childId: task.id, ownerId: mini.id, at: project.createdAt, objects, existing: [{ childId: mini.id, ownerId: task.id, createdAt: project.createdAt }] }),
    /OWNERSHIP_CYCLE/u,
  );
  assert.throws(
    () => createPrimaryOwnership({ childId: task.id, ownerId: mini.id, at: project.createdAt, objects, existing: [{ childId: mini.id, ownerId: project.id, createdAt: project.createdAt }, { childId: project.id, ownerId: "scope", createdAt: project.createdAt }] }),
    /OWNERSHIP_DEPTH_EXCEEDED/u,
  );
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
