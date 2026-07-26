import assert from "node:assert/strict";
import test from "node:test";

import {
  changeV2Condition,
  changeV2DueAt,
  V2_OBJECT_TYPES,
  assignV2PrimaryOwner,
  bindV2PrimaryAnchor,
  createV2ManagedObject,
  editV2Area,
  completeV2Project,
  completeV2MiniProjectFromReviewedMarker,
  lifecycleForV2ExecutionMarker,
  observeV2PrimaryAnchor,
  rebindV2PrimaryAnchor,
  selectFocus,
  synchronizeV2ExplicitObject,
  transitionV2Lifecycle,
  cancelV2Lifecycle,
  reopenV2Lifecycle,
  restoreV2LifecycleFromUndo,
  validateV2Condition,
  updateV2ProjectStructure,
} from "../src/v2.ts";

test("V2 exposes exactly six user-visible object types without Phase or Signal", () => {
  assert.deepEqual(V2_OBJECT_TYPES, ["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"]);
  const object = createV2ManagedObject({ objectType: "TASK", text: " [任务] 验证外部推送 " }, new Date("2026-07-20T00:00:00Z"));
  assert.equal(object.lifecycle, "OPEN");
  assert.deepEqual(object.condition, { kind: "ACTIONABLE" });
  assert.equal(object.text, "[任务] 验证外部推送");
  assert.equal("phase" in object, false);
  assert.equal("signals" in object, false);
});

test("Area responsibility text is edited in place with optimistic version protection", () => {
  const area = createV2ManagedObject({ objectId: "area-health", objectType: "AREA", text: "健康管理" }, new Date("2026-07-22T01:00:00Z"));
  const edited = editV2Area(area, "  维持稳定作息与健康检查  ", 1, new Date("2026-07-22T02:00:00Z"));
  assert.equal(edited.objectId, area.objectId);
  assert.equal(edited.objectType, "AREA");
  assert.equal(edited.text, "维持稳定作息与健康检查");
  assert.equal(edited.version, 2);
  assert.equal(edited.updatedAt, "2026-07-22T02:00:00.000Z");
  assert.throws(() => editV2Area(area, "新责任", 2), /版本/);
  assert.throws(() => editV2Area(area, "   ", 1), /责任描述/);
  assert.throws(() => editV2Area({ ...area, objectType: "TASK" }, "新责任", 1), /Area/);
  assert.throws(() => editV2Area({ ...area, lifecycle: "ARCHIVED" }, "新责任", 1), /关闭/);
});

test("Project structure is one versioned aggregate with bounded current interface and stage mappings", () => {
  const project = createV2ManagedObject({ objectId: "project-structure", objectType: "PROJECT", text: "发布 V2" }, new Date("2026-07-22T01:00:00Z"));
  assert.equal(project.projectStructure?.currentFocuses.length, 1);
  const updated = updateV2ProjectStructure(project, {
    objectives: [
      { objectiveId: "objective-main", text: "形成可日常使用的闭环", priority: "PRIMARY", successEvidence: ["真实 Desktop 验收通过"] },
      { objectiveId: "objective-docs", text: "保留可追溯证据", priority: "SECONDARY", successEvidence: [] },
    ],
    deliverables: [{ deliverableId: "deliverable-release", text: "V2 发布包", acceptance: "Doctor 和 Release Gate 通过", status: "AVAILABLE" }],
    workStages: [
      { stageId: "stage-verify", name: "验收", statusDescription: "正在进行 Release 审计" },
      { stageId: "stage-release", name: "发布", statusDescription: "等待审计完成" },
    ],
    currentSummary: "需求 Gate 完成，正在收口发布。",
    currentFocuses: ["完成 Release 审计", "确认可恢复性"],
    stageMappings: [{ objectId: "task-release-audit", stageId: "stage-verify" }],
  }, 1, new Date("2026-07-22T02:00:00Z"));
  assert.equal(updated.version, 2);
  assert.equal(updated.projectStructure?.objectives.length, 2);
  assert.equal(updated.projectStructure?.currentFocuses.length, 2);
  assert.throws(() => updateV2ProjectStructure(project, { ...updated.projectStructure!, currentFocuses: [] }, 1), /当前推进/);
  assert.throws(() => updateV2ProjectStructure(project, { ...updated.projectStructure!, currentFocuses: ["1", "2", "3", "4"] }, 1), /当前推进/);
  assert.throws(() => updateV2ProjectStructure(project, { ...updated.projectStructure!, stageMappings: [{ objectId: "task", stageId: "missing" }] }, 1), /Stage/);
  assert.throws(() => updateV2ProjectStructure({ ...project, objectType: "TASK" }, updated.projectStructure!, 1), /Project/);
  assert.throws(() => updateV2ProjectStructure(project, updated.projectStructure!, 2), /版本/);
});

test("Primary Anchor and Ownership are versioned domain changes independent of location", () => {
  const task = createV2ManagedObject({ objectId: "task-1", objectType: "TASK", text: "任务" });
  const project = createV2ManagedObject({ objectId: "project-1", objectType: "PROJECT", text: "项目" });
  const bound = bindV2PrimaryAnchor(task, {
    anchorId: "anchor-1",
    graphId: "graph-1",
    externalId: "block-uuid-1",
    contentHash: "hash-1",
  }, 1, new Date("2026-07-20T07:00:00Z"));
  assert.equal(bound.object.version, 2);
  assert.deepEqual(bound.anchor, {
    anchorId: "anchor-1",
    objectId: "task-1",
    graphId: "graph-1",
    externalId: "block-uuid-1",
    role: "primary_text",
    status: "active",
    contentHash: "hash-1",
    lastSeenAt: "2026-07-20T07:00:00.000Z",
  });
  const assigned = assignV2PrimaryOwner(bound.object, project, 2, new Date("2026-07-20T07:01:00Z"));
  assert.equal(assigned.object.version, 3);
  assert.deepEqual(assigned.ownership, {
    childObjectId: "task-1",
    ownerObjectId: "project-1",
    assignedAt: "2026-07-20T07:01:00.000Z",
  });
  assert.throws(() => assignV2PrimaryOwner(project, task, 1), /不能/);
});

test("Primary Anchor observation preserves the object and can recover the same UUID", () => {
  const initial = createV2ManagedObject({ objectId: "task-observed", objectType: "TASK", text: "核对告警" }, new Date("2026-07-20T08:00:00Z"));
  const bound = bindV2PrimaryAnchor(initial, {
    anchorId: "anchor-observed",
    graphId: "graph-1",
    externalId: "block-observed",
    contentHash: "11111111",
  }, initial.version, new Date("2026-07-20T08:01:00Z"));

  const missing = observeV2PrimaryAnchor(bound.object, bound.anchor, "missing", bound.object.version, new Date("2026-07-20T08:02:00Z"));
  assert.equal(missing.object.objectId, initial.objectId);
  assert.equal(missing.object.version, 3);
  assert.equal(missing.anchor.status, "missing");
  assert.equal(missing.anchor.contentHash, "11111111");
  assert.equal(missing.anchor.lastSeenAt, bound.anchor.lastSeenAt, "missing observation must preserve the last confirmed sighting");

  const recovered = observeV2PrimaryAnchor(missing.object, missing.anchor, "active", missing.object.version, new Date("2026-07-20T08:03:00Z"));
  assert.equal(recovered.object.version, 4);
  assert.equal(recovered.anchor.status, "active");
  assert.equal(recovered.anchor.lastSeenAt, "2026-07-20T08:03:00.000Z");

  assert.throws(() => observeV2PrimaryAnchor(recovered.object, { ...recovered.anchor, status: "replaced" }, "active", recovered.object.version), /replaced/);
});

test("Primary Anchor rebind replaces historical evidence and keeps object identity", () => {
  const object = createV2ManagedObject({ objectId: "task-rebind", objectType: "TASK", text: "旧正文" }, new Date("2026-07-20T07:00:00Z"));
  const bound = bindV2PrimaryAnchor(object, {
    anchorId: "anchor-old", graphId: "graph-1", externalId: "block-old", contentHash: "11111111",
  }, 1, new Date("2026-07-20T07:01:00Z"));
  const rebound = rebindV2PrimaryAnchor(bound.object, bound.anchor, {
    anchorId: "anchor-new", graphId: "graph-1", externalId: "block-new", contentHash: "22222222", objectType: "TASK", text: "新正文",
  }, 2, new Date("2026-07-20T07:02:00Z"));
  assert.equal(rebound.object.objectId, "task-rebind");
  assert.equal(rebound.object.version, 3);
  assert.equal(rebound.object.text, "新正文");
  assert.equal(rebound.previousAnchor.status, "replaced");
  assert.equal(rebound.previousAnchor.externalId, "block-old");
  assert.equal(rebound.anchor.status, "active");
  assert.equal(rebound.anchor.externalId, "block-new");
  assert.throws(() => rebindV2PrimaryAnchor(rebound.object, rebound.anchor, {
    graphId: "graph-1", externalId: "block-other", contentHash: "33333333", objectType: "MINI_PROJECT", text: "不得静默迁移",
  }, 3), /Proposal/);
});
test("V2 lifecycle requires recorded reasons for cancellation and explicit reopen", () => {
  const open = createV2ManagedObject({ objectId: "obj_1", objectType: "TASK", text: "完成验证" });
  const completed = transitionV2Lifecycle(open, "COMPLETED", 1, new Date("2026-07-20T01:00:00Z"));
  assert.equal(completed.version, 2);
  assert.equal(completed.lifecycle, "COMPLETED");
  assert.throws(() => transitionV2Lifecycle(open, "CANCELLED", 1), /原因/);
  const cancelled = cancelV2Lifecycle(open, "外部需求已撤销", 1, new Date("2026-07-20T01:00:00Z"));
  assert.equal(cancelled.lifecycle, "CANCELLED");
  assert.throws(() => cancelV2Lifecycle(open, "  ", 1), /原因/);
  assert.equal(reopenV2Lifecycle(completed, "验收发现仍需修正", 2).lifecycle, "OPEN");
  assert.equal(reopenV2Lifecycle(cancelled, "外部需求重新生效", 2).lifecycle, "OPEN");
  assert.throws(() => reopenV2Lifecycle(completed, "", 2), /原因/);
  assert.equal(restoreV2LifecycleFromUndo(reopenV2Lifecycle(completed, "验收重开", 2), { lifecycle: "COMPLETED" }, 3).lifecycle, "COMPLETED");
  assert.throws(() => transitionV2Lifecycle(completed, "CANCELLED", 2), /不允许/);
  assert.throws(() => transitionV2Lifecycle(completed, "ARCHIVED", 1), /版本/);
  assert.equal(transitionV2Lifecycle(completed, "ARCHIVED", 2).lifecycle, "ARCHIVED");
});

test("reopening completed Project and MiniProject clears current Closure while Undo restores it", () => {
  const projectClosure = { originalGoal: "完成治理", actualResult: "已交付", majorDeliverables: ["报告"], incompleteObjectives: [], legacyDisposition: "无", keyDecisions: ["保留"], futureSummary: "按需重入" };
  const project = completeV2Project(createV2ManagedObject({ objectId: "project-reopen", objectType: "PROJECT", text: "治理" }), projectClosure, 1);
  const reopenedProject = reopenV2Lifecycle(project, "发现回归", 2);
  assert.equal(reopenedProject.closure, undefined);
  assert.deepEqual(restoreV2LifecycleFromUndo(reopenedProject, { lifecycle: "COMPLETED", closure: projectClosure }, 3).closure, projectClosure);
});

test("Project Closure Undo restores OPEN and removes the applied Closure snapshot", () => {
  const closure = { originalGoal: "完成治理", actualResult: "已交付", majorDeliverables: ["报告"], incompleteObjectives: [], legacyDisposition: "无", keyDecisions: ["保留"], futureSummary: "按需重入" };
  const completed = completeV2Project(createV2ManagedObject({ objectId: "project-closure-undo", objectType: "PROJECT", text: "治理" }), closure, 1);
  const restored = restoreV2LifecycleFromUndo(completed, { lifecycle: "OPEN" }, completed.version);
  assert.equal(restored.lifecycle, "OPEN");
  assert.equal(restored.version, completed.version + 1);
  assert.equal(restored.closure, undefined);
});

test("Project Closure records outcomes and explicit unfinished Objective dispositions before completion", () => {
  const project = createV2ManagedObject({ objectId: "project-closure", objectType: "PROJECT", text: "告警治理" });
  const closure = {
    originalGoal: "让告警外部推送可控。",
    actualResult: "完成新链路与回滚验证。",
    majorDeliverables: ["推送服务", "验收报告"],
    incompleteObjectives: [{ objective: "历史告警回放", reason: "源数据未齐", nextStep: "转入数据治理 Project" }],
    legacyDisposition: "剩余回放工作由新 Project 承接。",
    keyDecisions: ["保留人工回退开关"],
    futureSummary: "重入时先检查历史数据完整性。",
  };
  const completed = completeV2Project(project, closure, project.version, new Date("2026-07-21T12:00:00Z"));
  assert.equal(completed.lifecycle, "COMPLETED");
  assert.equal(completed.version, 2);
  assert.deepEqual(completed.closure, closure);
  assert.throws(() => transitionV2Lifecycle(project, "COMPLETED", 1), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_REQUIRED");
  assert.throws(() => completeV2Project(project, { ...closure, incompleteObjectives: [{ objective: "未完成", reason: "", nextStep: "稍后" }] }, 1), /原因/);
  assert.throws(() => completeV2Project(project, { ...closure, originalGoal: 42 } as unknown as typeof closure, 1), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_FIELD_REQUIRED");
  assert.throws(() => completeV2Project(project, { ...closure, majorDeliverables: [] }, 1), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_LIST_INVALID");
  assert.throws(() => completeV2Project(project, { ...closure, keyDecisions: [] }, 1), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_LIST_INVALID");
  assert.throws(() => completeV2Project(project, { ...closure, incompleteObjectives: [null] } as unknown as typeof closure, 1), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_PROJECT_CLOSURE_LIST_INVALID");
  assert.throws(() => completeV2Project({ ...project, objectType: "TASK" }, closure, 1), /Project/);
  assert.throws(() => completeV2Project(project, closure, 2), /版本/);
});

test("Condition requires its own evidence and Focus remains independent", () => {
  assert.throws(
    () => validateV2Condition({ kind: "WAITING", waitingFor: "", expectedResult: "答复", reviewAt: "2026-07-21" }),
    /等待谁或什么/,
  );
  const focus = selectFocus("obj_1", 0, new Date("2026-07-20T02:00:00Z"), "2026-07-21T02:00:00Z");
  assert.deepEqual(focus, {
    objectId: "obj_1",
    selectedAt: "2026-07-20T02:00:00.000Z",
    rank: 0,
    expiresAt: "2026-07-21T02:00:00Z",
  });
  const object = createV2ManagedObject({ objectId: "condition-object", objectType: "TASK", text: "等待答复" });
  const waiting = changeV2Condition(object, { kind: "WAITING", waitingFor: "负责人", expectedResult: "答复", reviewAt: "2026-07-21T02:00:00Z" }, 1, new Date("2026-07-20T03:00:00Z"));
  assert.equal(waiting.version, 2);
  assert.equal(waiting.condition.kind, "WAITING");
  assert.throws(() => changeV2Condition(waiting, { kind: "PAUSED", reason: "稍后", reviewAt: "not-a-date" }, 2), /合法时间/);
  assert.throws(() => changeV2Condition({ ...waiting, lifecycle: "COMPLETED" }, { kind: "ACTIONABLE" }, 2), /已关闭/);
});

test("Task deadline is optional, versioned, and never becomes a score", () => {
  const task = createV2ManagedObject({ objectId: "due-task", objectType: "TASK", text: "按期核对" });
  const due = changeV2DueAt(task, "2026-07-21T09:00:00+08:00", 1, new Date("2026-07-20T04:00:00Z"));
  assert.equal(due.dueAt, "2026-07-21T09:00:00+08:00");
  assert.equal(due.version, 2);
  assert.equal(changeV2DueAt(due, undefined, 2).dueAt, undefined);
  assert.throws(() => changeV2DueAt(task, "not-a-date", 1), /合法时间/);
  assert.throws(() => changeV2DueAt({ ...task, objectType: "PROJECT" }, "2026-07-21", 1), /只属于 Task/);
});

test("execution Marker changes only simple Task Lifecycle and never Condition or Focus", () => {
  assert.equal(lifecycleForV2ExecutionMarker("TASK", "OPEN", undefined), "OPEN");
  assert.equal(lifecycleForV2ExecutionMarker("TASK", "OPEN", "TODO"), "OPEN");
  assert.equal(lifecycleForV2ExecutionMarker("TASK", "OPEN", "NOW"), "OPEN");
  assert.equal(lifecycleForV2ExecutionMarker("TASK", "OPEN", "DOING"), "OPEN");
  assert.equal(lifecycleForV2ExecutionMarker("TASK", "OPEN", "WAITING"), "OPEN");
  assert.equal(lifecycleForV2ExecutionMarker("TASK", "OPEN", "DONE"), "COMPLETED");
  for (const marker of ["CANCELED", "CANCELLED"] as const) {
    assert.throws(
      () => lifecycleForV2ExecutionMarker("TASK", "OPEN", marker),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_TASK_CANCELLATION_REASON_REQUIRED",
    );
  }
  assert.throws(
    () => lifecycleForV2ExecutionMarker("MINI_PROJECT", "OPEN", "DONE"),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_COMPLEX_CLOSURE_REQUIRES_PROPOSAL",
  );
  assert.throws(() => lifecycleForV2ExecutionMarker("DECISION", "OPEN", "DONE"), /Lifecycle/);
  assert.throws(() => lifecycleForV2ExecutionMarker("TASK", "COMPLETED", "CANCELED"), /终态/);
});

test("reviewed MiniProject DONE transition preserves independent state and refreshes Anchor evidence", () => {
  const object = createV2ManagedObject({ objectId: "mini-reviewed", objectType: "MINI_PROJECT", text: "收尾" }, new Date("2026-07-22T00:00:00Z"));
  const anchor = bindV2PrimaryAnchor(object, { anchorId: "anchor-mini", graphId: "graph-1", externalId: "block-mini", contentHash: "after" }, object.version, new Date("2026-07-22T00:01:00Z"));
  const closure = { originalGoal: "完成发布前核对", actualResult: "全部检查通过", remainingWork: "无遗留" };
  const completed = completeV2MiniProjectFromReviewedMarker(anchor.object, anchor.anchor, { objectType: "MINI_PROJECT", text: "收尾", marker: "DONE", contentHash: "after", closure }, anchor.object.version, new Date("2026-07-22T00:02:00Z"));
  assert.equal(completed.object.lifecycle, "COMPLETED");
  assert.deepEqual(completed.object.condition, { kind: "ACTIONABLE" });
  assert.equal(completed.object.version, anchor.object.version + 1);
  assert.equal(completed.anchor.contentHash, "after");
  assert.equal(completed.anchor.status, "active");
  assert.deepEqual(completed.object.closure, closure);
  assert.throws(() => completeV2MiniProjectFromReviewedMarker(anchor.object, anchor.anchor, { objectType: "TASK", text: "收尾", marker: "DONE", contentHash: "after", closure }, anchor.object.version), /MiniProject/);
  assert.throws(() => completeV2MiniProjectFromReviewedMarker({ ...anchor.object, lifecycle: "COMPLETED" }, anchor.anchor, { objectType: "MINI_PROJECT", text: "收尾", marker: "DONE", contentHash: "after", closure }, anchor.object.version), /COMPLETED/);
  for (const status of ["missing", "conflict", "replaced"] as const) {
    assert.throws(() => completeV2MiniProjectFromReviewedMarker(anchor.object, { ...anchor.anchor, status }, { objectType: "MINI_PROJECT", text: "收尾", marker: "DONE", contentHash: "after", closure }, anchor.object.version), /active/);
  }
  assert.throws(() => completeV2MiniProjectFromReviewedMarker(anchor.object, anchor.anchor, { objectType: "MINI_PROJECT", text: "收尾", marker: "DONE", contentHash: "different", closure }, anchor.object.version), /hash/);
  assert.throws(() => completeV2MiniProjectFromReviewedMarker(anchor.object, anchor.anchor, { objectType: "MINI_PROJECT", text: "收尾", marker: "DONE", contentHash: "after", closure: { ...closure, actualResult: "" } }, anchor.object.version), /实际结果/);
  assert.throws(() => completeV2MiniProjectFromReviewedMarker(anchor.object, anchor.anchor, { objectType: "MINI_PROJECT", text: "收尾", marker: "DONE", contentHash: "after", closure: { ...closure, actualResult: "x".repeat(4001) } }, anchor.object.version), /有界/);
});

test("explicit synchronization updates title and Anchor evidence but refuses silent type migration", () => {
  const initial = createV2ManagedObject({ objectId: "task-sync", objectType: "TASK", text: "旧标题" });
  const bound = bindV2PrimaryAnchor(initial, {
    anchorId: "anchor-sync",
    graphId: "graph-1",
    externalId: "block-sync",
    contentHash: "11111111",
  }, 1, new Date("2026-07-20T07:00:00Z"));
  const synchronized = synchronizeV2ExplicitObject(bound.object, bound.anchor, {
    objectType: "TASK",
    text: "新标题",
    contentHash: "22222222",
  }, 2, new Date("2026-07-20T07:01:00Z"));
  assert.equal(synchronized.object.text, "新标题");
  assert.equal(synchronized.object.version, 3);
  assert.equal(synchronized.anchor.contentHash, "22222222");
  assert.equal(synchronized.anchor.lastSeenAt, "2026-07-20T07:01:00.000Z");
  const completed = synchronizeV2ExplicitObject(synchronized.object, synchronized.anchor, {
    objectType: "TASK", text: "新标题", contentHash: "33333333", marker: "DONE",
  }, 3, new Date("2026-07-20T07:02:00Z"));
  assert.equal(completed.object.lifecycle, "COMPLETED");
  assert.deepEqual(completed.object.condition, { kind: "ACTIONABLE" });
  assert.throws(() => synchronizeV2ExplicitObject(synchronized.object, synchronized.anchor, {
    objectType: "MINI_PROJECT",
    text: "不得静默迁移",
    contentHash: "33333333",
  }, 3), (error: unknown) => error instanceof Error && "code" in error && error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL");
  assert.throws(() => synchronizeV2ExplicitObject(synchronized.object, synchronized.anchor, {
    objectType: "TASK",
    text: "过期更新",
    contentHash: "44444444",
  }, 2), /版本/);
});
