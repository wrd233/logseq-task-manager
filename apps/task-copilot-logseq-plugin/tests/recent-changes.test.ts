import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";

import { projectRecentChanges } from "../src/recent-changes.ts";

function proposal(
  proposalId: string,
  operation: ServiceStoredProposal["proposal"]["groups"][number]["semanticOperations"][number],
  ...additionalOperations: ServiceStoredProposal["proposal"]["groups"][number]["semanticOperations"]
): ServiceStoredProposal {
  const operations = [operation, ...additionalOperations];
  return {
    updatedAt: "2026-07-24T06:32:00.000Z",
    files: { proposalMd: "# proposal", proposalJson: "{}" },
    proposal: {
      proposalId,
      schemaVersion: "v2",
      title: "整理设备托管材料",
      context: "当前材料仍是一条普通记录。",
      understanding: "把材料整理为可推进事项。",
      objective: "建立清晰的正式事项。",
      logic: "只应用已审阅的一项修改。",
      finalPreview: "设备托管材料将整理为 MiniProject。",
      unresolvedQuestions: [],
      source: { kind: "user" },
      scope: { read: [], modify: operations.map((candidate) => candidate.target) },
      preconditions: [],
      groups: [{
        groupId: "group-1",
        explanation: "一次独立修改。",
        risk: operations.some((candidate) => candidate.kind === "CHANGE_OWNERSHIP" || candidate.kind === "TRANSITION_LIFECYCLE") ? "HIGH" : "LOW",
        independentlyAcceptable: true,
        dependencies: [],
        textPatches: [],
        semanticOperations: operations,
        disposition: "ACCEPTED",
      }],
      status: "APPLIED",
      createdAt: "2026-07-24T06:30:00.000Z",
    },
  };
}

function commit(
  semanticCommitId: string,
  status: ServiceSemanticCommit["status"],
  overrides: Partial<ServiceSemanticCommit> = {},
): ServiceSemanticCommit {
  return {
    semanticCommitId,
    proposalId: "proposal-1",
    status,
    beforeStateChecksum: "before-secret-checksum",
    afterStateChecksum: "after-secret-checksum",
    createdAt: "2026-07-24T06:31:00.000Z",
    updatedAt: "2026-07-24T06:32:00.000Z",
    ...overrides,
  };
}

const rewrite = {
  operationId: "rewrite-1",
  kind: "REWRITE_BLOCK" as const,
  target: { kind: "BLOCK" as const, id: "block-1", version: 3 },
  summary: "整理正文",
  payload: { text: "整理后的正文" },
  preconditions: [],
};

test("recent changes shows user intent and safe action while keeping technical identity in details", () => {
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", rewrite)],
    commits: [commit("proposal-commit:opaque-1", "COMPLETED")],
  });

  assert.equal(changes.length, 1);
  const { narration, ...change } = changes[0]!;
  assert.equal(narration.conclusion, "这次修改已经应用");
  assert.deepEqual(narration.keyEvidence, ["所有步骤都已完成"]);
  assert.deepEqual(narration.unknowns, []);
  assert.equal(narration.source.ruleId, "commit-completed");
  assert.deepEqual(change, {
    commitIdentity: "proposal-commit:opaque-1",
    proposalIdentity: "proposal-1",
    intent: "整理设备托管材料",
    summary: "设备托管材料将整理为 MiniProject。",
    status: "APPLIED",
    statusLabel: "已应用",
    occurredAt: "2026-07-24T06:32:00.000Z",
    availability: "可以发起撤销；执行时会重新检查当前内容，若之后发生变化则不会覆盖。",
    primaryAction: {
      action: "v2-proposal-undo",
      label: "撤销",
      value: "proposal-commit:opaque-1",
      tone: "danger",
    },
    secondaryAction: { action: "recent-change-review", label: "查看", value: "review", tone: "quiet" },
    technical: {
      semanticCommitId: "proposal-commit:opaque-1",
      proposalId: "proposal-1",
      status: "COMPLETED",
      beforeStateChecksum: "before-secret-checksum",
      afterStateChecksum: "after-secret-checksum",
    },
  });
});

test("pending, recovery, failure, and undone are translated without inventing a second recovery command", () => {
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", rewrite)],
    commits: [
      commit("commit-pending", "PENDING", { updatedAt: "2026-07-24T06:35:00.000Z" }),
      commit("commit-recovery", "RECOVERY_REQUIRED", { updatedAt: "2026-07-24T06:34:00.000Z", errorCode: "DOMAIN_WRITE_FAILED" }),
      commit("commit-failed", "FAILED", { updatedAt: "2026-07-24T06:33:00.000Z", errorCode: "GRAPH_CONTENT_CHANGED" }),
      commit("commit-undone", "UNDONE", { updatedAt: "2026-07-24T06:32:00.000Z" }),
    ],
  });

  assert.deepEqual(changes.map(({ statusLabel }) => statusLabel), ["尚未完成", "需要恢复", "未能应用", "已撤销"]);
  assert.deepEqual(changes.map(({ narration }) => narration.conclusion), [
    "这次修改尚未完成",
    "这次修改需要恢复",
    "这次修改没有应用",
    "这次修改已经撤销",
  ]);
  assert.equal(changes[0]!.primaryAction, undefined);
  assert.deepEqual(changes[0]!.secondaryAction, {
    action: "recent-change-review",
    label: "继续",
    value: "review",
    tone: "quiet",
  });
  assert.equal(changes[0]!.availability, "已完成的步骤被安全记录；请继续原操作，不要重复提交。");
  assert.equal(changes[1]!.primaryAction, undefined);
  assert.deepEqual(changes[1]!.secondaryAction, {
    action: "recent-change-review",
    label: "恢复",
    value: "review",
    tone: "danger",
  });
  assert.equal(changes[1]!.availability, "上一次修改尚未完成；请按同一恢复记录继续，不要新建重复操作。");
  assert.equal(changes[2]!.availability, "Logseq 正文已有变化；系统没有覆盖当前内容。");
  assert.equal(changes[3]!.availability, "这次修改已经通过逆向修改撤销，历史证据仍保留。");
});

test("a compensated MiniProject structure failure says the original content is restored", () => {
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", rewrite)],
    commits: [commit("proposal-commit:structure", "FAILED", {
      errorCode: "V2_MINI_PROJECT_RESTRUCTURE_EXECUTION_FAILED",
    })],
  });

  assert.equal(changes[0]!.status, "FAILED");
  assert.equal(
    changes[0]!.availability,
    "这次整理没有完成；已执行步骤已经恢复，正文和正式状态保持原样。",
  );
});

test("a failed inverse commit disables another Undo and explains which later state changed", () => {
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", rewrite)],
    commits: [
      commit("proposal-commit:opaque-1", "COMPLETED"),
      commit("undo:proposal-commit:opaque-1", "FAILED", {
        errorCode: "V2_OBJECT_VERSION_CONFLICT",
        updatedAt: "2026-07-24T06:36:00.000Z",
      }),
    ],
  });

  assert.equal(changes.length, 1, "inverse ledger is folded into the original user change");
  assert.equal(changes[0]!.primaryAction, undefined);
  assert.equal(changes[0]!.availability, "正式事项已在本次修改后变化；为避免覆盖新状态，不能直接撤销。");
});

test("completed MiniProject structure inverse is folded into the undone original instead of appearing as a new applied change", () => {
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", rewrite)],
    commits: [
      commit("proposal-commit:structure", "UNDONE"),
      commit("mini-project-restructure-undo:proposal-commit:structure", "COMPLETED", {
        updatedAt: "2026-07-24T06:36:00.000Z",
      }),
    ],
  });

  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.commitIdentity, "proposal-commit:structure");
  assert.equal(changes[0]!.status, "UNDONE");
  assert.equal(changes[0]!.primaryAction, undefined);
  assert.equal(changes[0]!.availability, "撤销已经生效，历史证据仍保留。");
});

test("an applied MiniProject structure change routes to its dedicated subtree-safe Undo", () => {
  const createBlock = {
    operationId: "create-section",
    kind: "CREATE_BLOCK" as const,
    target: { kind: "BLOCK" as const, id: "root-block", hash: "root-hash" },
    summary: "创建结构区块",
    payload: { newBlockUuid: "11111111-1111-4111-8111-111111111111" },
    preconditions: [],
  };
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", createBlock)],
    commits: [commit("proposal-commit:structure", "COMPLETED")],
  });

  assert.deepEqual(changes[0]!.primaryAction, {
    action: "v2-mini-project-restructure-undo",
    label: "撤销",
    value: "proposal-commit:structure",
    tone: "danger",
  });
});

test("high-impact Ownership uses its existing dedicated Undo handler", () => {
  const ownership = {
    operationId: "owner-1",
    kind: "CHANGE_OWNERSHIP" as const,
    target: { kind: "OBJECT" as const, id: "task-1", version: 4 },
    summary: "改变主归属",
    payload: { ownerObjectId: "project-1" },
    preconditions: [],
  };
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", ownership)],
    commits: [commit("proposal-commit:owner", "COMPLETED")],
  });

  assert.deepEqual(changes[0]!.primaryAction, {
    action: "v2-ownership-undo",
    label: "撤销",
    value: "proposal-commit:owner",
    tone: "danger",
  });
});

test("reviewed Project creation uses its Page-aware Undo and folds the inverse ledger", () => {
  const createProject = {
    operationId: "create-project",
    kind: "CREATE_OBJECT" as const,
    target: { kind: "PAGE" as const, id: "Project/Desktop Gate", expectedExistence: "ABSENT" as const },
    summary: "建立 Project",
    payload: {
      objectType: "PROJECT" as const,
      text: "Desktop Gate",
      pageName: "Project/Desktop Gate",
      sourceKind: "BLANK" as const,
      relationshipMode: "CREATE_DEDICATED_PROJECT_PAGE" as const,
      targetExpectation: "ABSENT" as const,
      sourceFingerprint: "source-fingerprint",
      previewScopeHash: "preview-scope-hash",
      projectStructure: {
        outcome: "完成 Desktop Gate",
        boundary: { included: ["测试 Graph"], excluded: ["真实 Graph"] },
        completionEvidence: ["reload 与 Undo"],
        internalClosure: "记录验收证据",
        currentInterface: "显示当前 Gate",
        supportingEvidenceRefs: ["answer:outcome"],
      },
    },
    preconditions: [],
  };
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", createProject)],
    commits: [commit("proposal-commit:project", "COMPLETED")],
  });

  assert.deepEqual(changes[0]!.primaryAction, {
    action: "v2-project-creation-undo",
    label: "撤销",
    value: "proposal-commit:project",
    tone: "danger",
  });

  const undone = projectRecentChanges({
    proposals: [proposal("proposal-1", createProject)],
    commits: [
      commit("proposal-commit:project", "UNDONE"),
      commit("project-creation-undo:proposal-commit:project", "COMPLETED", {
        updatedAt: "2026-07-24T06:36:00.000Z",
      }),
    ],
  });
  assert.equal(undone.length, 1);
  assert.equal(undone[0]!.status, "UNDONE");
  assert.equal(undone[0]!.primaryAction, undefined);
  assert.equal(undone[0]!.availability, "撤销已经生效，历史证据仍保留。");
});

test("applied Project narration routes to the Project interface inverse instead of generic Block Undo", () => {
  const previousProjectStructure = {
    objectives: [],
    deliverables: [],
    workStages: [],
    currentSummary: "待明确目标。",
    currentFocuses: ["明确目标与下一步"],
    stageMappings: [],
  };
  const narration = {
    operationId: "update-project-narration",
    kind: "UPDATE_PROJECT_NARRATION" as const,
    target: { kind: "OBJECT" as const, id: "project-1", version: 2 },
    summary: "更新 Project 当前摘要",
    payload: {
      previousProjectStructure,
      projectStructure: { ...previousProjectStructure, currentSummary: "目标仍待明确，当前先梳理下一步。" },
    },
    preconditions: [],
  };
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-1", narration)],
    commits: [commit("proposal-commit:narration", "COMPLETED")],
  });

  assert.deepEqual(changes[0]!.primaryAction, {
    action: "v2-project-structure-undo",
    label: "撤销",
    value: "proposal-commit:narration",
    tone: "danger",
  });
});

test("applied Project Closure routes to its lifecycle inverse", () => {
  const closure = {
    originalGoal: "完成治理",
    actualResult: "已交付",
    majorDeliverables: ["报告"],
    incompleteObjectives: [],
    legacyDisposition: "无",
    keyDecisions: ["保留回退"],
    futureSummary: "按需重入",
  };
  const changes = projectRecentChanges({
    proposals: [proposal("proposal-closure", {
      operationId: "record-closure",
      kind: "UPDATE_PROJECT_INTERFACE",
      target: { kind: "OBJECT", id: "project-1", version: 4 },
      summary: "记录 Closure",
      payload: { closure },
      preconditions: [],
    }, {
      operationId: "complete-project",
      kind: "TRANSITION_LIFECYCLE",
      target: { kind: "OBJECT", id: "project-1", version: 4 },
      summary: "完成 Project",
      payload: { lifecycle: "COMPLETED" },
      preconditions: [],
    })],
    commits: [commit("proposal-commit:closure", "COMPLETED", { proposalId: "proposal-closure" })],
  });

  assert.deepEqual(changes[0]!.primaryAction, {
    action: "v2-project-closure-undo",
    label: "撤销",
    value: "proposal-commit:closure",
    tone: "danger",
  });
  assert.equal(
    changes[0]!.summary,
    "项目已结束；结果、遗留和后续说明已经保存，项目页面与正文保持不变。",
  );
  assert.doesNotMatch(changes[0]!.summary, /Lifecycle|COMPLETED|Commit|Proposal/);
});

test("undone Project Closure says the Project is open again instead of repeating the applied result", () => {
  const closure = {
    originalGoal: "完成治理",
    actualResult: "已交付",
    majorDeliverables: ["报告"],
    incompleteObjectives: [],
    legacyDisposition: "无",
    keyDecisions: ["保留回退"],
    futureSummary: "按需重入",
  };
  const records = [proposal("proposal-closure", {
    operationId: "record-closure",
    kind: "UPDATE_PROJECT_INTERFACE",
    target: { kind: "OBJECT", id: "project-1", version: 4 },
    summary: "记录 Closure",
    payload: { closure },
    preconditions: [],
  }, {
    operationId: "complete-project",
    kind: "TRANSITION_LIFECYCLE",
    target: { kind: "OBJECT", id: "project-1", version: 4 },
    summary: "完成 Project",
    payload: { lifecycle: "COMPLETED" },
    preconditions: [],
  })];
  const changes = projectRecentChanges({
    proposals: records,
    commits: [
      commit("proposal-commit:closure", "UNDONE", { proposalId: "proposal-closure" }),
      commit("project-closure-undo:proposal-commit:closure", "COMPLETED", {
        proposalId: "proposal-closure",
        updatedAt: "2026-07-24T06:36:00.000Z",
      }),
    ],
  });

  assert.equal(
    changes[0]!.summary,
    "项目已恢复为进行中；本次完成回顾已移除，项目页面与正文保持不变。",
  );
  assert.doesNotMatch(changes[0]!.summary, /已结束|Lifecycle|COMPLETED|Commit|Proposal/);
});
