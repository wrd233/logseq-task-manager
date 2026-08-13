import assert from "node:assert/strict";
import test from "node:test";

import {
  amendClosure,
  cancelWorkObject,
  changeEngagement,
  completeWorkObject,
  createPrimaryOwnership,
  createWorkObject,
  reopenWorkObject,
  renameWorkObject,
  restoreEngagement,
  restoreWorkObject,
  updateWorkIntent,
  setCurrentFocus,
  type WorkObject,
} from "../src/index.ts";

test("MiniProject WorkIntent stays sparse, bounded, and versioned", () => {
  const mini = createWorkObject({ id: "mini-01", kind: "MINI_PROJECT", title: "虚拟机模板与镜像规范", at: "2026-08-13T00:00:00.000Z" });
  const updated = updateWorkIntent(mini, { desiredOutcome: " 形成一份可评审规范 ", completionChecks: ["覆盖模板与镜像约束", "完成联合评审", "覆盖模板与镜像约束"], expectedVersion: 1, at: "2026-08-13T00:05:00.000Z" });
  assert.equal(updated.desiredOutcome, "形成一份可评审规范");
  assert.deepEqual(updated.completionChecks, ["覆盖模板与镜像约束", "完成联合评审"]);
  assert.equal(updated.version, 2);
  assert.throws(() => updateWorkIntent(createWorkObject({ id: "task", kind: "TASK", title: "Task", at: mini.createdAt }), { desiredOutcome: null, completionChecks: [], expectedVersion: 1, at: mini.createdAt }), /WORK_INTENT_KIND_UNSUPPORTED/u);
  assert.throws(() => updateWorkIntent(updated, { desiredOutcome: updated.desiredOutcome, completionChecks: updated.completionChecks, expectedVersion: 2, at: mini.createdAt }), /WORK_INTENT_UNCHANGED/u);
});

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
    waitingCondition: null,
    currentFocus: null,
    desiredOutcome: null,
    completionChecks: [],
    version: 1,
    createdAt: "2026-08-12T14:00:00.000Z",
    updatedAt: "2026-08-12T14:00:00.000Z",
  });
  assert.equal("anchor" in object, false);
});

test("SET_CURRENT_FOCUS is nullable, short, normalized, and versioned", () => {
  const object = createWorkObject({ id: "work-focus", kind: "TASK", title: "配置服务器管理口", at: "2026-08-12T14:00:00.000Z" });
  const focused = setCurrentFocus(object, {
    currentFocus: "  准备服务器上架并完成管理口网络配置  ", expectedVersion: 1, at: "2026-08-12T14:05:00.000Z",
  });
  assert.equal(focused.currentFocus, "准备服务器上架并完成管理口网络配置");
  assert.equal(focused.version, 2);
  const cleared = setCurrentFocus(focused, { currentFocus: "   ", expectedVersion: 2, at: "2026-08-12T14:10:00.000Z" });
  assert.equal(cleared.currentFocus, null);
  assert.equal(cleared.version, 3);
  assert.throws(() => setCurrentFocus(object, { currentFocus: "x".repeat(201), expectedVersion: 1, at: object.updatedAt }), /CURRENT_FOCUS_TOO_LONG/u);
  assert.throws(() => setCurrentFocus(object, { currentFocus: "下一步", expectedVersion: 2, at: object.updatedAt }), /WORK_OBJECT_VERSION_MISMATCH/u);
});

test("CHANGE_ENGAGEMENT atomically creates and clears the current WaitingCondition", () => {
  const actionable = createWorkObject({ id: "work-waiting", kind: "TASK", title: "配置生产服务器网络", at: "2026-08-13T01:00:00.000Z" });
  const waiting = changeEngagement(actionable, {
    from: "ACTIONABLE", to: "WAITING", expectedVersion: 1, at: "2026-08-13T02:00:00.000Z",
    waiting: { description: "  等待网络组分配 VLAN 和网关信息  ", reviewAt: null, evidenceIds: ["evidence-vlan"] },
  });
  assert.deepEqual(waiting, {
    ...actionable, engagement: "WAITING", version: 2, updatedAt: "2026-08-13T02:00:00.000Z",
    waitingCondition: { workObjectId: actionable.id, description: "等待网络组分配 VLAN 和网关信息", since: "2026-08-13T02:00:00.000Z", reviewAt: null, evidenceIds: ["evidence-vlan"] },
  });

  const restored = changeEngagement(waiting, { from: "WAITING", to: "ACTIONABLE", waiting: null, expectedVersion: 2, at: "2026-08-13T03:00:00.000Z" });
  assert.deepEqual(restored, { ...waiting, engagement: "ACTIONABLE", waitingCondition: null, version: 3, updatedAt: "2026-08-13T03:00:00.000Z" });
});

test("Domain rejects half waiting state, unsupported transitions, and stale from/version", () => {
  const actionable = createWorkObject({ id: "work-guard", kind: "TASK", title: "配置网络", at: "2026-08-13T01:00:00.000Z" });
  assert.throws(() => changeEngagement(actionable, { from: "ACTIONABLE", to: "WAITING", waiting: null, expectedVersion: 1, at: actionable.updatedAt }), /WAITING_CONDITION_REQUIRED/u);
  assert.throws(() => changeEngagement(actionable, { from: "ACTIONABLE", to: "PARKED" as "WAITING", waiting: null, expectedVersion: 1, at: actionable.updatedAt }), /ENGAGEMENT_TRANSITION_UNSUPPORTED/u);
  assert.throws(() => changeEngagement(actionable, { from: "WAITING", to: "ACTIONABLE", waiting: null, expectedVersion: 1, at: actionable.updatedAt }), /ENGAGEMENT_FROM_MISMATCH/u);
  assert.throws(() => changeEngagement(actionable, { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待一下", reviewAt: null, evidenceIds: [] }, expectedVersion: 2, at: actionable.updatedAt }), /WORK_OBJECT_VERSION_MISMATCH/u);
});

test("compensation restores the exact prior WaitingCondition instead of regenerating since", () => {
  const actionable = createWorkObject({ id: "work-restore", kind: "TASK", title: "配置网络", at: "2026-08-13T01:00:00.000Z" });
  const waiting = changeEngagement(actionable, { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待 VLAN", reviewAt: null, evidenceIds: ["evidence-1"] }, expectedVersion: 1, at: "2026-08-13T02:00:00.000Z" });
  const left = changeEngagement(waiting, { from: "WAITING", to: "ACTIONABLE", waiting: null, expectedVersion: 2, at: "2026-08-13T03:00:00.000Z" });
  const restored = restoreEngagement(left, { engagement: "WAITING", waitingCondition: waiting.waitingCondition, expectedVersion: 3, at: "2026-08-13T04:00:00.000Z" });
  assert.deepEqual(restored.waitingCondition, waiting.waitingCondition);
  assert.equal(restored.updatedAt, "2026-08-13T04:00:00.000Z");
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
    waitingCondition: null,
    currentFocus: null,
    desiredOutcome: null,
    completionChecks: [],
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

test("user completion closes one Task with a minimal immutable record and clears open-only state", () => {
  const open = setCurrentFocus(createWorkObject({ id: "task-complete", kind: "TASK", title: "确认防火墙开放 443", at: "2026-08-13T01:00:00.000Z" }), { currentFocus: "执行生产验证", expectedVersion: 1, at: "2026-08-13T01:10:00.000Z" });
  const completed = completeWorkObject(open, { recordId: "completion-01", actor: { type: "USER", id: "local-user" }, outcomeSummary: "  确认防火墙开放 443  ", evidenceIds: [], expectedVersion: 2, at: "2026-08-13T02:00:00.000Z" });
  assert.deepEqual(completed.object, { ...open, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, version: 3, updatedAt: "2026-08-13T02:00:00.000Z" });
  assert.deepEqual(completed.record, { id: "completion-01", workObjectId: open.id, completedAt: "2026-08-13T02:00:00.000Z", outcomeSummary: "确认防火墙开放 443", evidenceIds: [], createdBy: { type: "USER", id: "local-user" } });
  assert.throws(() => completeWorkObject(completed.object, { recordId: "completion-02", actor: { type: "USER", id: "local-user" }, outcomeSummary: "重复", evidenceIds: [], expectedVersion: 3, at: "2026-08-13T03:00:00.000Z" }), /CLOSURE_LIFECYCLE_INVALID/u);
  assert.throws(() => completeWorkObject(createWorkObject({ id: "mini-close", kind: "MINI_PROJECT", title: "不得关闭", at: open.createdAt }), { recordId: "completion-mini", actor: { type: "USER", id: "local-user" }, outcomeSummary: "完成", evidenceIds: [], expectedVersion: 1, at: open.updatedAt }), /TASK_CLOSURE_KIND_UNSUPPORTED/u);
});

test("cancellation, reopen, and amendment preserve closure history", () => {
  const open = createWorkObject({ id: "task-cancel", kind: "TASK", title: "提交旧方案", at: "2026-08-13T01:00:00.000Z" });
  const cancelled = cancelWorkObject(open, { recordId: "cancel-01", actor: { type: "USER", id: "local-user" }, reason: "  业务方取消需求  ", replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [], expectedVersion: 1, at: "2026-08-13T02:00:00.000Z" });
  assert.equal(cancelled.object.lifecycle, "CANCELLED");
  assert.equal(cancelled.record.reason, "业务方取消需求");
  assert.throws(() => cancelWorkObject(createWorkObject({ id: "project-close", kind: "PROJECT", title: "不得关闭", at: open.createdAt }), { recordId: "cancel-project", actor: { type: "USER", id: "local-user" }, reason: "不得关闭", replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [], expectedVersion: 1, at: open.updatedAt }), /TASK_CLOSURE_KIND_UNSUPPORTED/u);
  const amendment = amendClosure(cancelled.record, { amendmentId: "amend-01", workObjectId: open.id, actor: { type: "USER", id: "local-user" }, reason: "原原因不准确", replacementCancellationReason: "业务方向发生变化", addEvidenceIds: ["evidence-01"], at: "2026-08-13T03:00:00.000Z" });
  assert.equal(cancelled.record.reason, "业务方取消需求");
  assert.equal(amendment.replacementCancellationReason, "业务方向发生变化");
  assert.throws(() => amendClosure(cancelled.record, { amendmentId: "bad-amend", workObjectId: "other", actor: { type: "USER", id: "local-user" }, reason: "错误对象", replacementCancellationReason: "错误", addEvidenceIds: [], at: "2026-08-13T03:00:00.000Z" }), /CLOSURE_SUBJECT_MISMATCH/u);
  const reopened = reopenWorkObject(cancelled.object, { recordId: "reopen-01", previousClosureRecordId: cancelled.record.id, actor: { type: "USER", id: "local-user" }, reason: "业务需求恢复", expectedVersion: 2, at: "2026-08-13T04:00:00.000Z" });
  assert.deepEqual(reopened.object, { ...cancelled.object, lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, version: 3, updatedAt: "2026-08-13T04:00:00.000Z" });
  assert.equal(reopened.record.previousClosureType, "CANCELLED");
  assert.throws(() => reopenWorkObject(reopened.object, { recordId: "reopen-02", previousClosureRecordId: cancelled.record.id, actor: { type: "USER", id: "local-user" }, reason: "重复", expectedVersion: 3, at: "2026-08-13T05:00:00.000Z" }), /REOPEN_LIFECYCLE_INVALID/u);
});

test("completion of a WAITING Task clears open state and compensation restores it exactly", () => {
  const open = setCurrentFocus(createWorkObject({ id: "task-waiting-close", kind: "TASK", title: "等待验收", at: "2026-08-13T01:00:00.000Z" }), { currentFocus: "跟进验收", expectedVersion: 1, at: "2026-08-13T01:10:00.000Z" });
  const waiting = changeEngagement(open, { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待业务验收", reviewAt: null, evidenceIds: ["evidence-wait"] }, expectedVersion: 2, at: "2026-08-13T01:20:00.000Z" });
  const completed = completeWorkObject(waiting, { recordId: "completion-wait", actor: { type: "USER", id: "local-user" }, outcomeSummary: "验收完成", evidenceIds: [], expectedVersion: 3, at: "2026-08-13T02:00:00.000Z" });
  const restored = restoreWorkObject(completed.object, { previous: waiting, expectedVersion: 4, at: "2026-08-13T03:00:00.000Z" });
  assert.equal(restored.lifecycle, "OPEN");
  assert.equal(restored.engagement, "WAITING");
  assert.deepEqual(restored.waitingCondition, waiting.waitingCondition);
  assert.equal(restored.currentFocus, "跟进验收");
});
