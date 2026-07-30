import assert from "node:assert/strict";
import test from "node:test";

import type {
  FocusSelection,
  V2Anchor,
  V2Association,
  V2ManagedObject,
  V2PrimaryOwnership,
} from "@task-copilot/domain";

import {
  projectV2ProjectReentry,
  projectV2TaskReentry,
  type V2ReentryCommitFact,
} from "../src/reentry-projection.ts";

const observedAt = "2026-07-24T12:00:00.000Z";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  const value: V2ManagedObject = {
    objectId: "project-1",
    objectType: "PROJECT",
    version: 4,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "设备托管",
    projectStructure: {
      objectives: [{
        objectiveId: "objective-1",
        text: "完成设备托管方案",
        priority: "PRIMARY",
        successEvidence: ["方案通过评审"],
      }],
      deliverables: [],
      workStages: [{
        stageId: "stage-1",
        name: "资源测算",
        statusDescription: "等待功耗参数",
      }],
      currentSummary: "表格结构与业务字段已经完成。",
      currentFocuses: ["等待厂家补充功耗参数", "参数到齐后继续资源测算"],
      stageMappings: [],
    },
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
  if (value.objectType === "PROJECT") return value;
  const nonProject = { ...value };
  delete nonProject.projectStructure;
  return nonProject;
}

function anchor(objectId: string, overrides: Partial<V2Anchor> = {}): V2Anchor {
  return {
    anchorId: `anchor-${objectId}`,
    objectId,
    graphId: "graph-1",
    externalId: `block-${objectId}`,
    role: "primary_text",
    status: "active",
    contentHash: "hash",
    lastSeenAt: observedAt,
    ...overrides,
  };
}

test("Project reentry compresses formal current interface and Condition into one sufficient entry", () => {
  const projection = projectV2ProjectReentry({
    observedAt,
    project: object({
      condition: {
        kind: "WAITING",
        waitingFor: "厂家",
        expectedResult: "功耗参数",
        reviewAt: "2026-07-26T09:00:00.000Z",
      },
    }),
    objects: [],
    ownerships: [],
    associations: [],
    focus: [],
    anchors: [anchor("project-1")],
    commits: [],
  });

  assert.equal(projection.sufficiency, "SUFFICIENT");
  assert.equal(projection.headline, "设备托管｜等待厂家提供功耗参数");
  assert.equal(projection.summary, "表格结构与业务字段已经完成。");
  assert.deepEqual(projection.inferences, []);
  assert.equal(projection.keyEvidence.length, 2);
  assert.deepEqual(projection.primaryAction, {
    intent: "OPEN_PRIMARY_ANCHOR",
    label: "打开当前项目",
    targetObjectId: "project-1",
    targetAnchorId: "anchor-project-1",
  });
  assert.equal(projection.entryPoints.length <= 3, true);
  assert.equal(JSON.stringify(projection).includes("block-project-1"), false);
});

test("Project reentry collapses recent apply and Undo commits into bounded user facts", () => {
  const projection = projectV2ProjectReentry({
    observedAt,
    project: object(),
    objects: [],
    ownerships: [],
    associations: [],
    focus: [],
    anchors: [anchor("project-1")],
    commits: [{
      semanticCommitId: "closure-original",
      status: "UNDONE",
      objectIds: ["project-1"],
      updatedAt: "2026-07-24T10:00:00.000Z",
      title: "项目关闭：验证安全链",
    }, {
      semanticCommitId: "closure-undo",
      status: "COMPLETED",
      objectIds: ["project-1"],
      updatedAt: "2026-07-24T10:00:00.000Z",
      title: "项目关闭：验证安全链",
    }, {
      semanticCommitId: "interface-update",
      status: "COMPLETED",
      objectIds: ["project-1"],
      updatedAt: "2026-07-24T09:00:00.000Z",
      title: "更新当前接口",
    }],
  });

  assert.deepEqual(projection.facts.slice(-2).map(({ text }) => text), [
    "最近正式修改“项目关闭：验证安全链”已经撤销，历史证据仍保留",
    "最近正式修改“更新当前接口”已经应用",
  ]);
  assert.equal(projection.facts.filter(({ text }) => text.includes("项目关闭：验证安全链")).length, 1);
});

test("new Project without a structural boundary admits that the current entry is unclear", () => {
  const projection = projectV2ProjectReentry({
    observedAt,
    project: object({
      version: 1,
      projectStructure: {
        objectives: [],
        deliverables: [],
        workStages: [],
        currentSummary: "已创建设备托管，待明确目标与当前推进。",
        currentFocuses: ["明确目标与下一步"],
        stageMappings: [],
      },
    }),
    objects: [],
    ownerships: [],
    associations: [],
    focus: [],
    anchors: [anchor("project-1")],
    commits: [],
  });

  assert.equal(projection.sufficiency, "INSUFFICIENT");
  assert.equal(projection.headline, "当前进入点不明确");
  assert.match(projection.summary, /最近一次正式变化/);
  assert.deepEqual(projection.unknowns, ["尚未形成有证据支撑的 Project 当前边界或进入点"]);
  assert.equal(projection.primaryAction?.intent, "OPEN_PRIMARY_ANCHOR");
  assert.equal(projection.nextActionEligible, true);
});

test("recovery-required Commit overrides ordinary Project context and routes to the existing recovery surface", () => {
  const commit: V2ReentryCommitFact = {
    semanticCommitId: "commit-recovery",
    status: "RECOVERY_REQUIRED",
    objectIds: ["project-1"],
    updatedAt: observedAt,
  };
  const projection = projectV2ProjectReentry({
    observedAt,
    project: object(),
    objects: [],
    ownerships: [],
    associations: [],
    focus: [],
    anchors: [anchor("project-1")],
    commits: [commit],
  });

  assert.equal(projection.headline, "设备托管｜上一次修改需要恢复");
  assert.equal(projection.safetyState, "RECOVERY_REQUIRED");
  assert.deepEqual(projection.primaryAction, {
    intent: "OPEN_RECOVERY_DETAILS",
    label: "查看差异与恢复记录",
    targetCommitId: "commit-recovery",
  });
  assert.equal(projection.entryPoints.length, 0);
});

test("focused owned child can be an entry point while an ordinary Association cannot", () => {
  const child = object({
    objectId: "task-1",
    objectType: "TASK",
    version: 2,
    text: "核对功耗参数",
  });
  const related = object({
    objectId: "output-1",
    objectType: "OUTPUT",
    lifecycle: "COMPLETED",
    text: "历史方案",
  });
  const ownership: V2PrimaryOwnership = {
    ownerObjectId: "project-1",
    childObjectId: "task-1",
    assignedAt: observedAt,
  };
  const association: V2Association = {
    associationId: "association-1",
    sourceObjectId: "project-1",
    targetObjectId: "output-1",
    associationKind: "RELATED",
    status: "ACTIVE",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  const focus: FocusSelection[] = [{
    objectId: "task-1",
    rank: 0,
    selectedAt: observedAt,
  }];
  const projection = projectV2ProjectReentry({
    observedAt,
    project: object(),
    objects: [child, related],
    ownerships: [ownership],
    associations: [association],
    focus,
    anchors: [anchor("project-1"), anchor("task-1"), anchor("output-1")],
    commits: [],
  });

  assert.equal(projection.entryPoints.some((entry) => entry.objectId === "task-1"), true);
  assert.equal(projection.entryPoints.some((entry) => entry.objectId === "output-1"), false);
  assert.equal(projection.relatedContextCount, 1);
});

test("closed Project stays review-oriented and never suggests Focus or interface mutation", () => {
  const projection = projectV2ProjectReentry({
    observedAt,
    project: object({
      lifecycle: "COMPLETED",
      closure: {
        originalGoal: "完成设备托管",
        actualResult: "方案已经交付",
        majorDeliverables: ["设备托管方案"],
        incompleteObjectives: [],
        legacyDisposition: "无遗留",
        keyDecisions: ["采用分阶段交付"],
        futureSummary: "未来重入先查看交付方案",
      },
    }),
    objects: [],
    ownerships: [],
    associations: [],
    focus: [{ objectId: "project-1", rank: 0, selectedAt: observedAt }],
    anchors: [anchor("project-1")],
    commits: [],
  });

  assert.equal(projection.headline, "设备托管｜已完成");
  assert.equal(projection.summary, "方案已经交付");
  assert.equal(projection.entryPoints.length, 0);
  assert.equal(JSON.stringify(projection).includes("UPDATE_PROJECT_INTERFACE"), false);
  assert.equal(JSON.stringify(projection).includes("ADD_TO_FOCUS"), false);
});

test("Task reentry uses exact Condition and owner facts but never manufactures a current interface", () => {
  const task = object({
    objectId: "task-1",
    objectType: "TASK",
    text: "确认最终报价",
    condition: {
      kind: "WAITING",
      waitingFor: "采购负责人",
      expectedResult: "最终报价",
      reviewAt: "2026-07-25T09:00:00.000Z",
    },
  });
  const projection = projectV2TaskReentry({
    observedAt,
    task,
    owner: object(),
    anchor: anchor("task-1"),
    parentContext: {
      text: "采购事项",
      sourceRef: "block:parent-1",
    },
    commits: [],
  });

  assert.equal(projection.sufficiency, "SUFFICIENT");
  assert.equal(projection.headline, "确认最终报价｜等待采购负责人提供最终报价");
  assert.deepEqual(projection.inferences, []);
  assert.match(projection.facts.map((item) => item.text).join(" "), /Primary Owner 是 设备托管/);
  assert.equal(projection.primaryAction?.intent, "OPEN_PRIMARY_ANCHOR");
});

test("Task reentry preserves every allowed direct Primary Owner type as bounded context", () => {
  const task = object({
    objectId: "task-1",
    objectType: "TASK",
    text: "确认最终报价",
  });
  for (const [objectType, label] of [
    ["MINI_PROJECT", "所属 MiniProject：报价确认"],
    ["PROJECT", "所属 Project：报价确认"],
    ["AREA", "所属 Area：报价确认"],
  ] as const) {
    const projection = projectV2TaskReentry({
      observedAt,
      task,
      owner: object({ objectId: `owner-${objectType}`, objectType, text: "报价确认" }),
      anchor: anchor("task-1"),
      commits: [],
    });
    assert.match(projection.keyEvidence.join("；"), new RegExp(label));
    assert.match(projection.facts.map((item) => item.text).join("；"), /Primary Owner 是 报价确认/);
  }
});

test("actionable Task with no current body context stays insufficient and opens only its source", () => {
  const task = object({
    objectId: "task-1",
    objectType: "TASK",
    text: "确认最终报价",
  });
  const projection = projectV2TaskReentry({
    observedAt,
    task,
    anchor: anchor("task-1"),
    commits: [],
  });

  assert.equal(projection.sufficiency, "INSUFFICIENT");
  assert.equal(projection.headline, "当前进入点不明确");
  assert.deepEqual(projection.unknowns, ["需要打开原文才能判断从哪里继续"]);
  assert.equal(projection.primaryAction?.label, "打开原文");
});

test("reentry projection fails closed on mismatched identities, duplicate objects, and invalid timestamps", () => {
  assert.throws(() => projectV2ProjectReentry({
    observedAt,
    project: object({ objectType: "TASK" }),
    objects: [],
    ownerships: [],
    associations: [],
    focus: [],
    anchors: [],
    commits: [],
  }), /Project/i);
  const duplicate = object({ objectId: "task-1", objectType: "TASK" });
  assert.throws(() => projectV2ProjectReentry({
    observedAt,
    project: object(),
    objects: [duplicate, duplicate],
    ownerships: [],
    associations: [],
    focus: [],
    anchors: [],
    commits: [],
  }), /duplicate/i);
  assert.throws(() => projectV2TaskReentry({
    observedAt: "invalid",
    task: duplicate,
    commits: [],
  }), /observedAt/i);
  assert.throws(() => projectV2TaskReentry({
    observedAt,
    task: duplicate,
    anchor: anchor("other-object"),
    commits: [],
  }), /Anchor.*Task/i);
});
