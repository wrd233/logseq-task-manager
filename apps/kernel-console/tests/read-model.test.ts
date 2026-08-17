import assert from "node:assert/strict";
import test from "node:test";

import type { ConsoleWorldSnapshot, ProjectionObligation, UserReadBaseline, WorkObject } from "@task-copilot/contracts";
import { attentionItems, frontierForProject, independentMiniProjects, independentTasks, meaningfulChanges, projectCards } from "../src/read-model.ts";

function object(id: string, overrides: Partial<WorkObject> = {}): WorkObject {
  return {
    id,
    kind: "TASK",
    title: id,
    lifecycle: "OPEN",
    engagement: "ACTIONABLE",
    waitingCondition: null,
    currentFocus: null,
    desiredOutcome: null,
    completionChecks: [],
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseline(workObjectId: string, version = 0, at = "2026-08-01T00:00:00.000Z"): UserReadBaseline {
  return { workObjectId, lastViewedFormalVersion: version, lastViewedAt: at, lastSeenCommitId: null };
}

function obligation(overrides: Partial<ProjectionObligation> = {}): ProjectionObligation {
  return {
    id: "ob-1", commitId: "c-1", workObjectId: "task-1", formalVersion: 1, targetAnchorId: "a-1", desiredProjectionHash: "h", status: "PENDING", attempt: 0, lastAttemptAt: null, nextAttemptAt: null, retryExhausted: false, lastError: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function world(overrides: Partial<ConsoleWorldSnapshot> = {}): ConsoleWorldSnapshot {
  const project = object("project-1", { kind: "PROJECT", title: "海丝独立建设" });
  const mini = object("mini-1", { kind: "MINI_PROJECT", title: "完成采购技术规格书", desiredOutcome: "形成可采购的规格书", completionChecks: ["范围", "参数"] });
  const task1 = object("task-1", { title: "确认设备参数", currentFocus: "核对交换机参数" });
  const task2 = object("task-2", { title: "最终校对" });
  const waitingMini = object("mini-2", { kind: "MINI_PROJECT", title: "推进方案审批", engagement: "WAITING", waitingCondition: { workObjectId: "mini-2", description: "等待审批会议", since: "2026-08-01T00:00:00.000Z", reviewAt: null, evidenceIds: [] } });
  const independentMini = object("mini-3", { kind: "MINI_PROJECT", title: "数据库高可用实践整理", desiredOutcome: "沉淀演练过程" });
  const independentTask = object("task-3", { title: "联系厂商确认版本", engagement: "WAITING", waitingCondition: { workObjectId: "task-3", description: "等待厂商回复", since: "2026-08-01T00:00:00.000Z", reviewAt: null, evidenceIds: [] } });
  const completedProject = object("project-2", { kind: "PROJECT", title: "旧项目", lifecycle: "COMPLETED", engagement: null, updatedAt: new Date().toISOString() });
  const base: ConsoleWorldSnapshot = {
    generatedAt: "2026-08-17T00:00:00.000Z",
    environment: { profile: "production", expectedGraphId: "graph-1", graphStatus: { available: true, reason: "READY", graphId: "graph-1", capabilities: [], lastSeenAt: "2026-08-17T00:00:00.000Z" } },
    objects: [
      { object: project, anchor: { id: "a-p", workObjectId: project.id, graphId: "graph-1", externalId: "block-p", sourceContentHash: "h", projectionContainerUuid: "c", projectionTitleUuid: "t", projectionStateUuid: "s", projectionFocusUuid: "f", projectionWaitingUuid: "w", projectionOutcomeUuid: "o", projectionCompletionUuid: "k", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }, baseline: baseline(project.id, 0) },
      { object: mini, anchor: null, baseline: null },
      { object: task1, anchor: null, baseline: null },
      { object: task2, anchor: null, baseline: null },
      { object: waitingMini, anchor: null, baseline: null },
      { object: independentMini, anchor: null, baseline: null },
      { object: independentTask, anchor: null, baseline: null },
      { object: completedProject, anchor: null, baseline: null },
    ],
    projectIntents: [],
    ownerships: [
      { childId: mini.id, ownerId: project.id, createdAt: "2026-08-01T00:00:00.000Z" },
      { childId: task1.id, ownerId: mini.id, createdAt: "2026-08-01T00:00:00.000Z" },
      { childId: task2.id, ownerId: mini.id, createdAt: "2026-08-01T00:00:00.000Z" },
      { childId: waitingMini.id, ownerId: project.id, createdAt: "2026-08-01T00:00:00.000Z" },
    ],
    obligations: [],
    recovery: [],
    contextAssociations: [],
    evidence: [],
    system: { status: "ok", graphAvailable: true, maintenancePaused: false, projectionBacklog: 0, projectionDegraded: 0, lastDiscovery: null, recoveryCount: 0, executorId: "fake", runtimeStatus: "HEALTHY", runtimeSummary: "ok", runtimeQueuedJobs: 0, runtimeFailedJobs: 0, runtimeClosureQueuedJobs: 0, runtimeClosureFailedJobs: 0, runtimeClosureDegraded: false, generatedAt: "2026-08-17T00:00:00.000Z" },
    projectionHealth: { backlog: 0, oldestPendingAt: null, retrying: 0, degraded: 0, lastError: null },
    ...overrides,
  };
  return base;
}

test("project cards include open and recently completed projects", () => {
  const cards = projectCards(world());
  assert.equal(cards.length, 2);
  assert.ok(cards.some((card) => card.object.id === "project-1"));
  assert.ok(cards.some((card) => card.object.id === "project-2" && card.recentlyCompleted));
});

test("frontier prefers cohesive MiniProject over its tasks and includes WAITING", () => {
  const w = world();
  const frontier = frontierForProject("project-1", w);
  const ids = frontier.map((item) => item.workObjectId);
  assert.ok(ids.includes("mini-1"));
  assert.ok(ids.includes("mini-2"));
  assert.equal(ids.includes("task-1"), false);
  assert.ok(frontier.find((item) => item.workObjectId === "mini-2")?.engagement === "WAITING");
});

test("meaningful changes use object-level baseline version", () => {
  const w = world();
  const project = w.objects.find((entry) => entry.object.id === "project-1")!.object;
  assert.deepEqual(meaningfulChanges(project, baseline(project.id, 1)), []);
  assert.deepEqual(meaningfulChanges({ ...project, version: 3 }, baseline(project.id, 2)), ["正式状态有更新"]);
  assert.deepEqual(meaningfulChanges({ ...project, version: 3, lifecycle: "COMPLETED", engagement: null }, baseline(project.id, 2)), ["已完成"]);
});

test("independent MiniProject and Task are first-class and unowned is not an anomaly", () => {
  const w = world();
  const minis = independentMiniProjects(w);
  const tasks = independentTasks(w);
  assert.equal(minis.some((item) => item.object.id === "mini-3"), true);
  assert.equal(tasks.some((item) => item.object.id === "task-3"), true);
  assert.equal(minis[0]?.anomalies.some((a) => a.kind === "ANCHOR_MISSING"), true); // no anchor is a real anomaly in V0 attention
});

test("attention excludes transient retry and workspace offline but includes stable failures", () => {
  const w = world({
    obligations: [
      obligation({ id: "ob-transient", status: "FAILED", retryExhausted: false, nextAttemptAt: "later", lastError: "GRAPH_ADAPTER_OFFLINE" }),
      obligation({ id: "ob-stable", status: "FAILED", retryExhausted: true, lastError: "GRAPH_ADAPTER_OFFLINE" }),
    ],
  });
  const items = attentionItems(w);
  assert.equal(items.some((item) => item.id === "obligation-ob-transient"), false);
  assert.equal(items.some((item) => item.kind === "PROJECTION_FAILED"), true);

  const offline = world({ environment: { profile: "production", expectedGraphId: "graph-1", graphStatus: { available: false, reason: "GRAPH_ADAPTER_OFFLINE", graphId: null, capabilities: [], lastSeenAt: null } } });
  const offlineItems = attentionItems(offline);
  assert.equal(offlineItems.some((item) => item.kind === "GRAPH_MISMATCH"), false);
  assert.equal(offlineItems.some((item) => item.kind === "ANCHOR_MISSING"), false);
});

test("attention includes graph mismatch and manual recovery", () => {
  const w = world({
    environment: { profile: "production", expectedGraphId: "graph-1", graphStatus: { available: true, reason: "READY", graphId: "graph-2", capabilities: [], lastSeenAt: "2026-08-17T00:00:00.000Z" } },
    recovery: [{ commit: { id: "commit-1", status: "RECOVERY_REQUIRED", actor: { type: "USER", id: "u" }, operationType: "CREATE_WORK_OBJECT", targetId: "task-1", operation: {}, preconditions: [], before: null, after: null, inverse: null, graphEffect: null, graphResult: null, failureReason: null, compensationFor: null, compensatedBy: null, governance: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }, action: "MANUAL_RECONCILIATION" }],
  });
  const items = attentionItems(w);
  assert.ok(items.some((item) => item.kind === "GRAPH_MISMATCH"));
  assert.ok(items.some((item) => item.kind === "RECOVERY_REQUIRED"));
});
