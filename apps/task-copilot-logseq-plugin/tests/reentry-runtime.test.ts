import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";

import {
  projectPluginV2ProjectReentry,
  projectPluginV2TaskReentry,
} from "../src/reentry-runtime.ts";

const now = "2026-07-24T12:00:00.000Z";

function project(): V2ManagedObject {
  return {
    objectId: "project-1",
    objectType: "PROJECT",
    version: 2,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "发布治理",
    projectStructure: {
      objectives: [{
        objectiveId: "objective-1",
        text: "稳定发布",
        priority: "PRIMARY",
        successEvidence: ["恢复演练通过"],
      }],
      deliverables: [],
      workStages: [],
      currentSummary: "核心链路已完成。",
      currentFocuses: ["完成恢复演练"],
      stageMappings: [],
    },
    createdAt: now,
    updatedAt: now,
    sourceOrCreationEvent: "test",
  };
}

function anchor(): V2Anchor {
  return {
    anchorId: "anchor-project-1",
    objectId: "project-1",
    graphId: "graph-1",
    externalId: "block-project-1",
    role: "primary_text",
    status: "active",
    contentHash: "hash",
    lastSeenAt: now,
  };
}

test("Plugin reentry adapter maps one bounded projection to existing routes", () => {
  const cards = projectPluginV2ProjectReentry({
    observedAt: now,
    objects: [project()],
    ownerships: [],
    associations: [],
    anchors: [anchor()],
    proposals: [],
    commits: [],
    nowWork: {
      generatedAt: now,
      focus: [],
      next: [],
      waitingReview: [],
      conditionOptions: [],
    },
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.projection.headline, "发布治理｜完成恢复演练");
  assert.deepEqual(cards[0]?.primaryRoute, {
    action: "v2-open-primary-anchor",
    value: "block-project-1",
    label: "打开当前项目",
  });
});

test("recovery route opens existing Audit and never exposes a second recovery action", () => {
  const proposal = {
    updatedAt: now,
    files: { proposalMd: "# proposal", proposalJson: "{}" },
    proposal: {
      proposalId: "proposal-1",
      schemaVersion: "v2" as const,
      title: "更新当前接口",
      context: "context",
      understanding: "understanding",
      objective: "objective",
      logic: "logic",
      finalPreview: "preview",
      unresolvedQuestions: [],
      source: { kind: "user" as const },
      scope: { read: [], modify: [{ kind: "OBJECT" as const, id: "project-1", version: 2 }] },
      preconditions: [],
      groups: [],
      status: "ACCEPTED" as const,
      createdAt: now,
    },
  };
  const cards = projectPluginV2ProjectReentry({
    observedAt: now,
    objects: [project()],
    ownerships: [],
    associations: [],
    anchors: [anchor()],
    proposals: [proposal],
    commits: [{
      semanticCommitId: "commit-recovery",
      proposalId: "proposal-1",
      status: "RECOVERY_REQUIRED",
      beforeStateChecksum: "before",
      createdAt: now,
      updatedAt: now,
    }],
    nowWork: {
      generatedAt: now,
      focus: [],
      next: [],
      waitingReview: [],
      conditionOptions: [],
    },
  });

  assert.equal(cards[0]?.projection.safetyState, "RECOVERY_REQUIRED");
  assert.deepEqual(cards[0]?.primaryRoute, {
    action: "view",
    value: "audit",
    label: "查看差异与恢复记录",
  });
  assert.equal(JSON.stringify(cards[0]).includes("submit"), false);
});

test("Task reentry reuses exact Condition, owner, Anchor, and existing routes", () => {
  const task: V2ManagedObject = {
    objectId: "task-1",
    objectType: "TASK",
    version: 4,
    lifecycle: "OPEN",
    condition: {
      kind: "WAITING",
      waitingFor: "网络组",
      expectedResult: "端口放行",
      reviewAt: "2026-07-25T08:00:00.000Z",
    },
    text: "部署听云探针",
    createdAt: now,
    updatedAt: now,
    sourceOrCreationEvent: "test",
  };
  const cards = projectPluginV2TaskReentry({
    observedAt: now,
    objects: [project(), task],
    ownerships: [{
      ownerObjectId: "project-1",
      childObjectId: "task-1",
      assignedAt: now,
    }],
    anchors: [{
      anchorId: "anchor-task-1",
      objectId: "task-1",
      graphId: "graph-1",
      externalId: "block-task-1",
      role: "primary_text",
      status: "active",
      contentHash: "hash-task",
      lastSeenAt: now,
    }],
    proposals: [],
    commits: [],
  });

  assert.deepEqual(Object.keys(cards), ["task-1"]);
  assert.equal(cards["task-1"]?.objectVersion, 4);
  assert.equal(cards["task-1"]?.projection.kind, "TASK");
  assert.equal(cards["task-1"]?.projection.summary, "Task 当前等待网络组提供端口放行");
  assert.deepEqual(cards["task-1"]?.projection.keyEvidence, [
    "等待网络组提供端口放行",
    "所属 Project：发布治理",
  ]);
  assert.deepEqual(cards["task-1"]?.primaryRoute, {
    action: "v2-open-primary-anchor",
    value: "block-task-1",
    label: "打开原文",
  });
});

test("Task reentry binds an interrupted CREATE_OBJECT Commit through its active Block Anchor", () => {
  const task: V2ManagedObject = {
    objectId: "task-created",
    objectType: "TASK",
    version: 1,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "整理发布材料",
    createdAt: now,
    updatedAt: now,
    sourceOrCreationEvent: "explicit_block_materialization",
  };
  const cards = projectPluginV2TaskReentry({
    observedAt: now,
    objects: [task],
    ownerships: [],
    anchors: [{
      anchorId: "anchor-created",
      objectId: task.objectId,
      graphId: "graph-1",
      externalId: "block-created",
      role: "primary_text",
      status: "active",
      contentHash: "hash-created",
      lastSeenAt: now,
    }],
    proposals: [{
      updatedAt: now,
      files: { proposalMd: "# create", proposalJson: "{}" },
      proposal: {
        proposalId: "proposal-create-task",
        schemaVersion: "v2",
        title: "创建任务",
        context: "context",
        understanding: "understanding",
        objective: "objective",
        logic: "logic",
        finalPreview: "preview",
        unresolvedQuestions: [],
        source: { kind: "user" },
        scope: { read: [], modify: [{ kind: "BLOCK", id: "block-created", version: 1 }] },
        preconditions: [],
        groups: [{
          groupId: "create",
          explanation: "create",
          risk: "LOW",
          independentlyAcceptable: true,
          dependencies: [],
          textPatches: [],
          semanticOperations: [{
            operationId: "create-task",
            kind: "CREATE_OBJECT",
            target: { kind: "BLOCK", id: "block-created", version: 1 },
            summary: "创建任务",
            payload: { objectType: "TASK", text: task.text },
            preconditions: [],
          }],
          disposition: "ACCEPTED",
        }],
        status: "ACCEPTED",
        createdAt: now,
      },
    }],
    commits: [{
      semanticCommitId: "commit-create-task",
      proposalId: "proposal-create-task",
      status: "PENDING",
      beforeStateChecksum: "before",
      createdAt: now,
      updatedAt: now,
    }],
  });

  assert.equal(cards[task.objectId]?.projection.safetyState, "PENDING");
  assert.deepEqual(cards[task.objectId]?.primaryRoute, {
    action: "view",
    value: "audit",
    label: "查看并继续原修改",
  });
});

test("Task reentry keeps MiniProject and Area Primary Owners as bounded direct context", () => {
  const task: V2ManagedObject = {
    objectId: "task-owned-bounded",
    objectType: "TASK",
    version: 1,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "核对直属上下文",
    createdAt: now,
    updatedAt: now,
    sourceOrCreationEvent: "test",
  };
  for (const [objectType, evidence] of [
    ["MINI_PROJECT", "所属 MiniProject：直属上下文"],
    ["AREA", "所属 Area：直属上下文"],
  ] as const) {
    const owner: V2ManagedObject = {
      objectId: `owner-${objectType}`,
      objectType,
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "直属上下文",
      createdAt: now,
      updatedAt: now,
      sourceOrCreationEvent: "test",
    };
    const cards = projectPluginV2TaskReentry({
      observedAt: now,
      objects: [task, owner],
      ownerships: [{ ownerObjectId: owner.objectId, childObjectId: task.objectId, assignedAt: now }],
      anchors: [],
      proposals: [],
      commits: [],
    });
    assert.match(cards[task.objectId]!.projection.keyEvidence.join("；"), new RegExp(evidence));
  }
});

test("Task reentry fails closed on duplicate object or Primary Ownership identity", () => {
  const task: V2ManagedObject = {
    objectId: "task-duplicate",
    objectType: "TASK",
    version: 1,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "核对重复身份",
    createdAt: now,
    updatedAt: now,
    sourceOrCreationEvent: "test",
  };
  assert.throws(() => projectPluginV2TaskReentry({
    observedAt: now,
    objects: [task, { ...task }],
    ownerships: [],
    anchors: [],
    proposals: [],
    commits: [],
  }), /duplicate Object identity/);
  assert.throws(() => projectPluginV2TaskReentry({
    observedAt: now,
    objects: [task, project(), { ...project(), objectId: "project-2", text: "第二项目" }],
    ownerships: [
      { ownerObjectId: "project-1", childObjectId: task.objectId, assignedAt: now },
      { ownerObjectId: "project-2", childObjectId: task.objectId, assignedAt: now },
    ],
    anchors: [],
    proposals: [],
    commits: [],
  }), /duplicate Primary Ownership/);
});
