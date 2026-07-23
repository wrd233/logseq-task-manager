import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";

import { projectRecentChanges } from "../src/recent-changes.ts";

function proposal(
  proposalId: string,
  operation: ServiceStoredProposal["proposal"]["groups"][number]["semanticOperations"][number],
): ServiceStoredProposal {
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
      scope: { read: [], modify: [operation.target] },
      preconditions: [],
      groups: [{
        groupId: "group-1",
        explanation: "一次独立修改。",
        risk: operation.kind === "CHANGE_OWNERSHIP" ? "HIGH" : "LOW",
        independentlyAcceptable: true,
        dependencies: [],
        textPatches: [],
        semanticOperations: [operation],
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
  assert.deepEqual(changes[0], {
    commitIdentity: "proposal-commit:opaque-1",
    proposalIdentity: "proposal-1",
    intent: "整理设备托管材料",
    summary: "设备托管材料将整理为 MiniProject。",
    status: "APPLIED",
    statusLabel: "已应用",
    occurredAt: "2026-07-24T06:32:00.000Z",
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
  assert.equal(changes[0]!.primaryAction, undefined);
  assert.equal(changes[0]!.availability, "已完成的步骤被安全记录；请继续原操作，不要重复提交。");
  assert.equal(changes[1]!.primaryAction, undefined);
  assert.equal(changes[1]!.availability, "上一次修改尚未完成；请按同一恢复记录继续，不要新建重复操作。");
  assert.equal(changes[2]!.availability, "Logseq 正文已有变化；系统没有覆盖当前内容。");
  assert.equal(changes[3]!.availability, "这次修改已经通过逆向修改撤销，历史证据仍保留。");
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
