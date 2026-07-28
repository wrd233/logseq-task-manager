import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject, V2Proposal } from "@task-copilot/domain";

import {
  narrateV2AnchorStatus,
  narrateV2CommitStatus,
  narrateV2ObjectStatus,
  narrateV2ProposalStatus,
  narrateV2SystemStatus,
} from "../src/status-narration.ts";

const observedAt = "2026-07-24T10:00:00.000Z";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  return {
    objectId: "task-1",
    objectType: "TASK",
    version: 3,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "处理采购报价",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
}

function proposal(overrides: Partial<V2Proposal> = {}): V2Proposal {
  return {
    proposalId: "proposal-1",
    schemaVersion: "v2",
    title: "整理采购记录",
    context: "当前记录需要整理。",
    understanding: "把记录整理为一个明确事项。",
    objective: "建立可推进事项。",
    logic: "只处理当前记录。",
    finalPreview: "整理为采购 Task。",
    unresolvedQuestions: [],
    source: { kind: "user" },
    scope: { read: [], modify: [{ kind: "OBJECT", id: "task-1", version: 3 }] },
    preconditions: [],
    groups: [{
      groupId: "group-1",
      explanation: "一项独立修改。",
      risk: "HIGH",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [],
      semanticOperations: [],
      disposition: "ACCEPTED",
    }],
    status: "ACCEPTED",
    createdAt: "2026-07-24T09:00:00.000Z",
    ...overrides,
  };
}

test("due WAITING narration separates formal facts and exposes one qualified review action", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "NOW",
    object: object({
      condition: {
        kind: "WAITING",
        waitingFor: "采购负责人",
        expectedResult: "最终报价",
        reviewAt: "2026-07-24T09:00:00.000Z",
      },
    }),
  });

  assert.equal(narration.conclusion, "该确认已到复查时间");
  assert.deepEqual(narration.keyEvidence, ["正在等待采购负责人提供最终报价", "原定复查时间已到"]);
  assert.equal(narration.facts.length, 2);
  assert.deepEqual(narration.inferences, []);
  assert.deepEqual(narration.unknowns, []);
  assert.equal(narration.nextActionEligible, true);
  assert.deepEqual(narration.nextAction, {
    intent: "REVIEW_WAITING",
    label: "确认是否已收到最终报价",
    targetObjectId: "task-1",
  });
  assert.deepEqual(narration.evidenceScope.refs, ["object:task-1@v3"]);
  assert.deepEqual(narration.source, {
    kind: "DETERMINISTIC_RULE",
    ruleId: "condition-waiting-review-due",
    version: "1.0.0",
  });
});

test("future WAITING stays quiet and does not manufacture a next action", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "NOW",
    object: object({
      condition: {
        kind: "WAITING",
        waitingFor: "供应商",
        expectedResult: "书面答复",
        reviewAt: "2026-07-30T09:00:00.000Z",
      },
    }),
  });

  assert.equal(narration.conclusion, "正在等待供应商");
  assert.deepEqual(narration.keyEvidence, ["等待结果是书面答复", "已设置后续复查时间"]);
  assert.equal(narration.nextActionEligible, false);
  assert.equal(narration.nextAction, undefined);
  assert.deepEqual(narration.unknowns, []);
});

test("a completed known blocker is a formal fact and qualifies only in a related scene", () => {
  const blocked = object({
    condition: {
      kind: "BLOCKED",
      reason: "等待依赖事项完成",
      blockerObjectId: "task-blocker",
    },
  });
  const blocker = object({
    objectId: "task-blocker",
    lifecycle: "COMPLETED",
    text: "准备采购清单",
  });
  const related = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: blocked,
    blocker,
  });
  const background = narrateV2ObjectStatus({
    observedAt,
    scene: "BACKGROUND",
    object: blocked,
    blocker,
  });

  assert.equal(related.conclusion, "关联阻塞项已结束，需要重新判断是否可以继续");
  assert.deepEqual(related.inferences, []);
  assert.equal(related.nextActionEligible, true);
  assert.equal(related.nextAction?.intent, "REVIEW_BLOCKER");
  assert.deepEqual(related.evidenceScope.refs, ["object:task-1@v3", "object:task-blocker@v3"]);
  assert.equal(background.nextActionEligible, false);
  assert.equal(background.nextAction, undefined);
});

test("an unresolved blocker is stated without guessing and missing blocker context is explicit", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "BLOCKED",
        reason: "等待依赖事项完成",
        blockerObjectId: "task-blocker",
      },
    }),
  });

  assert.equal(narration.conclusion, "当前仍被阻塞");
  assert.deepEqual(narration.keyEvidence, ["等待依赖事项完成"]);
  assert.deepEqual(narration.inferences, []);
  assert.deepEqual(narration.unknowns, ["尚未读取关联阻塞项的当前状态"]);
  assert.equal(narration.nextActionEligible, false);
});

test("due PAUSED qualifies for reassessment while a future pause does not", () => {
  const due = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "PAUSED",
        reason: "等待下个采购周期",
        reviewAt: "2026-07-24T09:00:00.000Z",
      },
    }),
  });
  const future = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "PAUSED",
        reason: "等待下个采购周期",
        reviewAt: "2026-08-24T09:00:00.000Z",
      },
    }),
  });

  assert.equal(due.conclusion, "该事项已到重新判断时间");
  assert.equal(due.nextAction?.intent, "REVIEW_PAUSE");
  assert.equal(future.conclusion, "该事项已暂停");
  assert.equal(future.nextActionEligible, false);
});

test("Project current interface remains formal evidence but is not promoted into a guessed action", () => {
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "PROJECT",
    object: object({
      objectId: "project-1",
      objectType: "PROJECT",
      text: "供应商切换",
      projectStructure: {
        objectives: [],
        deliverables: [],
        workStages: [],
        currentSummary: "正在验证新供应商的报价与交付窗口。",
        currentFocuses: ["确认最终报价", "核对交付周期"],
        stageMappings: [],
      },
    }),
  });

  assert.equal(narration.conclusion, "正在验证新供应商的报价与交付窗口。");
  assert.deepEqual(narration.keyEvidence, ["当前推进：确认最终报价", "当前推进：核对交付周期"]);
  assert.equal(narration.nextActionEligible, false);
  assert.equal(narration.nextAction, undefined);
  assert.deepEqual(narration.unknowns, []);
});

test("dense presentation is bounded while full formal Project evidence remains available", () => {
  const longSummary = `当前摘要${"很长的正式内容".repeat(80)}`;
  const longFocus = `当前推进${"仍需保留的正式内容".repeat(40)}`;
  const narration = narrateV2ObjectStatus({
    observedAt,
    scene: "PROJECT",
    object: object({
      objectId: "project-long",
      objectType: "PROJECT",
      projectStructure: {
        objectives: [],
        deliverables: [],
        workStages: [],
        currentSummary: longSummary,
        currentFocuses: [longFocus],
        stageMappings: [],
      },
    }),
  });

  assert.ok(narration.conclusion.length <= 160);
  assert.ok((narration.keyEvidence[0]?.length ?? 0) <= 160);
  assert.equal(narration.conclusion.endsWith("…"), true);
  assert.equal(narration.facts.some((item) => item.text.includes(longSummary)), true);
  assert.equal(narration.facts.some((item) => item.text.includes(longFocus)), true);
});

test("generic actionable and closed states never invent a next action", () => {
  const actionable = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object(),
  });
  const completed = narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({ lifecycle: "COMPLETED" }),
  });

  assert.equal(actionable.conclusion, "当前可以继续推进");
  assert.deepEqual(actionable.keyEvidence, []);
  assert.deepEqual(actionable.facts.map((item) => item.text), ["正式状态允许继续推进"]);
  assert.deepEqual(actionable.unknowns, ["正式状态没有提供足够信息来判断具体下一步"]);
  assert.equal(actionable.nextActionEligible, false);
  assert.equal(completed.conclusion, "该事项已完成");
  assert.deepEqual(completed.unknowns, []);
  assert.equal(completed.nextActionEligible, false);
});

test("invalid observation or mismatched blocker evidence fails closed", () => {
  assert.throws(() => narrateV2ObjectStatus({
    observedAt: "not-a-time",
    scene: "NOW",
    object: object(),
  }), /observedAt/);
  assert.throws(() => narrateV2ObjectStatus({
    observedAt,
    scene: "OBJECT",
    object: object({
      condition: {
        kind: "BLOCKED",
        reason: "等待依赖",
        blockerObjectId: "task-blocker",
      },
    }),
    blocker: object({ objectId: "different-object" }),
  }), /blocker/i);
});

test("accepted Proposal without a completed Commit stays visible and only routes to existing review", () => {
  const narration = narrateV2ProposalStatus({
    observedAt,
    scene: "REVIEW",
    proposal: proposal(),
    commits: [],
  });

  assert.equal(narration.conclusion, "修改内容已经确认，尚未正式应用");
  assert.deepEqual(narration.inferences, []);
  assert.deepEqual(narration.unknowns, []);
  assert.deepEqual(narration.nextAction, {
    intent: "OPEN_PROPOSAL_REVIEW",
    label: "返回检查并正式应用",
    targetProposalId: "proposal-1",
  });
  assert.deepEqual(narration.evidenceScope.refs, ["proposal:proposal-1"]);

  const applied = narrateV2ProposalStatus({
    observedAt,
    scene: "REVIEW",
    proposal: proposal(),
    commits: [{
      semanticCommitId: "commit-1",
      proposalId: "proposal-1",
      status: "COMPLETED",
      updatedAt: observedAt,
    }],
  });
  assert.equal(applied.conclusion, "这次修改已经应用");
  assert.equal(applied.nextActionEligible, false);
  assert.deepEqual(applied.evidenceScope.refs, ["commit:commit-1", "proposal:proposal-1"]);

  const undone = narrateV2ProposalStatus({
    observedAt,
    scene: "REVIEW",
    proposal: proposal(),
    commits: [
      {
        semanticCommitId: "commit-original",
        proposalId: "proposal-1",
        status: "UNDONE",
        updatedAt: observedAt,
      },
      {
        semanticCommitId: "undo:commit-original",
        proposalId: "proposal-1",
        status: "COMPLETED",
        updatedAt: observedAt,
      },
    ],
  });
  assert.equal(undone.conclusion, "这次修改已经撤销");
});

test("unfinished Commit routes to recovery evidence without inventing a recovery command", () => {
  const pending = narrateV2CommitStatus({
    observedAt,
    scene: "REVIEW",
    commit: {
      semanticCommitId: "commit-pending",
      proposalId: "proposal-1",
      status: "PENDING",
      updatedAt: observedAt,
    },
  });
  const recovery = narrateV2CommitStatus({
    observedAt,
    scene: "REVIEW",
    commit: {
      semanticCommitId: "commit-recovery",
      proposalId: "proposal-1",
      status: "RECOVERY_REQUIRED",
      updatedAt: observedAt,
      errorCode: "DOMAIN_WRITE_FAILED",
    },
  });

  assert.equal(pending.conclusion, "这次修改尚未完成");
  assert.match(pending.facts[0]!.text, /原 Commit/);
  assert.deepEqual(pending.nextAction, {
    intent: "OPEN_RECOVERY_DETAILS",
    label: "查看并继续原修改",
    targetCommitId: "commit-pending",
  });
  assert.equal(recovery.conclusion, "这次修改需要恢复");
  assert.match(recovery.keyEvidence[0]!, /停止继续写入/);
  assert.deepEqual(recovery.nextAction, {
    intent: "OPEN_RECOVERY_DETAILS",
    label: "查看差异与恢复记录",
    targetCommitId: "commit-recovery",
  });
  assert.equal(JSON.stringify(recovery).includes("DOMAIN_WRITE_FAILED"), false);
});

test("completed, failed, and undone Commit states do not overclaim Undo or retry availability", () => {
  const states = (["COMPLETED", "FAILED", "UNDONE"] as const).map((status) => narrateV2CommitStatus({
    observedAt,
    scene: "REVIEW",
    commit: {
      semanticCommitId: `commit-${status.toLowerCase()}`,
      proposalId: "proposal-1",
      status,
      updatedAt: observedAt,
      ...(status === "FAILED" ? { errorCode: "GRAPH_CONTENT_CHANGED" } : {}),
    },
  }));

  assert.deepEqual(states.map((item) => item.conclusion), [
    "这次修改已经应用",
    "这次修改没有应用",
    "这次修改已经撤销",
  ]);
  assert.equal(states.every((item) => item.nextActionEligible === false), true);
  assert.match(states[1]!.facts[1]!.text, /没有覆盖后续变化/);
  assert.match(states[2]!.facts[1]!.text, /历史证据仍保留/);
});

test("missing and conflicting Anchor keep the object fact and route only to the bounded repair surface", () => {
  const baseAnchor: V2Anchor = {
    anchorId: "anchor-1",
    objectId: "task-1",
    graphId: "graph-1",
    externalId: "block-1",
    role: "primary_text",
    status: "missing",
    contentHash: "content-hash",
    lastSeenAt: observedAt,
  };
  const missing = narrateV2AnchorStatus({
    observedAt,
    scene: "OBJECT",
    anchor: baseAnchor,
    object: object(),
  });
  const conflict = narrateV2AnchorStatus({
    observedAt,
    scene: "OBJECT",
    anchor: { ...baseAnchor, status: "conflict" },
    object: object(),
  });

  assert.equal(missing.conclusion, "正式事项与正文失去连接");
  assert.match(missing.facts[1]!.text, /正式事项仍保留/);
  assert.equal(conflict.conclusion, "正式事项与正文连接存在冲突");
  assert.deepEqual(conflict.nextAction, {
    intent: "OPEN_ANCHOR_REPAIR",
    label: "检查正文连接",
    targetObjectId: "task-1",
    targetAnchorId: "anchor-1",
  });
  assert.equal(JSON.stringify(conflict).includes("block-1"), false);
});

test("system narration applies recovery, pending, connection, Anchor, sync, then ready priority", () => {
  const base = {
    observedAt,
    scene: "BACKGROUND" as const,
    service: {
      status: "READY" as const,
      formalWritesAvailable: true,
      storeStatus: "READY" as const,
      providerAvailable: false,
    },
    pendingCommitCount: 0,
    recoveryRequiredCommitCount: 0,
    anchorIssueCount: 0,
    explicitSyncPendingCount: 0,
    explicitSyncReconciliationRequired: false,
  };
  const recovery = narrateV2SystemStatus({
    ...base,
    recoveryRequiredCommitCount: 1,
    pendingCommitCount: 2,
  });
  const graphMismatch = narrateV2SystemStatus({
    ...base,
    service: {
      ...base.service,
      status: "RESTRICTED",
      formalWritesAvailable: false,
      storeStatus: "READ_ONLY_SAFE_MODE",
      reasonCode: "SERVICE_GRAPH_MISMATCH",
    },
  });
  const endedByUser = narrateV2SystemStatus({
    ...base,
    service: {
      ...base.service,
      status: "RESTRICTED",
      formalWritesAvailable: false,
      storeStatus: "READ_ONLY_SAFE_MODE",
      reasonCode: "SERVICE_ENDED_BY_USER",
    },
  });
  const ready = narrateV2SystemStatus(base);

  assert.equal(recovery.conclusion, "有 1 项修改需要恢复");
  assert.equal(recovery.source.ruleId, "system-commit-recovery-required");
  assert.equal(graphMismatch.conclusion, "当前知识库与正式状态不匹配");
  assert.match(graphMismatch.facts.map((item) => item.text).join(" "), /Logseq 正文仍可编辑/);
  assert.equal(endedByUser.conclusion, "本次 Task Copilot 已结束");
  assert.equal(endedByUser.source.ruleId, "system-service-ended-by-user");
  assert.match(endedByUser.keyEvidence.join(" "), /用户已明确结束本次使用/);
  for (const reasonCode of ["V2_RESTORE_ROLLBACK_FAILED", "LAUNCHER_RESTORE_RECOVERY_REQUIRED"]) {
    const restoreRecoveryRequired = narrateV2SystemStatus({
      ...base,
      service: {
        ...base.service,
        status: "RESTRICTED",
        formalWritesAvailable: false,
        storeStatus: "READ_ONLY_SAFE_MODE",
        reasonCode,
      },
    });
    assert.equal(restoreRecoveryRequired.conclusion, "需要人工恢复");
    assert.equal(restoreRecoveryRequired.source.ruleId, "system-restore-recovery-required");
    assert.match(restoreRecoveryRequired.keyEvidence.join(" "), /恢复点仍保留/);
    assert.doesNotMatch(
      restoreRecoveryRequired.facts.map((item) => item.text).join(" "),
      /SQLite|数据库路径|内部快照标识|Doctor/,
    );
  }
  const restoreRecoveryArmed = narrateV2SystemStatus({
    ...base,
    service: {
      ...base.service,
      status: "RESTRICTED",
      formalWritesAvailable: false,
      storeStatus: "READ_ONLY_SAFE_MODE",
      reasonCode: "LAUNCHER_RESTORE_RECOVERY_ARMED",
    },
  });
  assert.equal(restoreRecoveryArmed.conclusion, "上次恢复中断，需要核验");
  assert.equal(restoreRecoveryArmed.source.ruleId, "system-restore-recovery-armed");
  assert.match(restoreRecoveryArmed.unknowns.join(" "), /恢复前快照是否完整/);
  assert.doesNotMatch(restoreRecoveryArmed.keyEvidence.join(" "), /仍保留/);
  const restoreRecoveryStateInvalid = narrateV2SystemStatus({
    ...base,
    service: {
      ...base.service,
      status: "RESTRICTED",
      formalWritesAvailable: false,
      storeStatus: "READ_ONLY_SAFE_MODE",
      reasonCode: "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID",
    },
  });
  assert.equal(restoreRecoveryStateInvalid.conclusion, "恢复记录无法安全确认");
  assert.equal(restoreRecoveryStateInvalid.source.ruleId, "system-restore-recovery-state-invalid");
  assert.match(restoreRecoveryStateInvalid.unknowns.join(" "), /恢复记录/);
  assert.doesNotMatch(restoreRecoveryStateInvalid.keyEvidence.join(" "), /仍保留/);
  assert.equal(ready.conclusion, "Task Copilot 可以正常使用");
  assert.deepEqual(ready.keyEvidence, ["正式状态与当前知识库已连接"]);
  assert.deepEqual(ready.unknowns, []);
  assert.match(ready.facts.map((item) => item.text).join(" "), /Agent 分析未启用/);
});

test("operational narration rejects mismatched identities and invalid aggregate counts", () => {
  assert.throws(() => narrateV2AnchorStatus({
    observedAt,
    scene: "OBJECT",
    anchor: {
      anchorId: "anchor-1",
      objectId: "other-object",
      graphId: "graph-1",
      externalId: "block-1",
      role: "primary_text",
      status: "missing",
      contentHash: "hash",
      lastSeenAt: observedAt,
    },
    object: object(),
  }), /Anchor.*object/i);
  assert.throws(() => narrateV2ProposalStatus({
    observedAt,
    scene: "REVIEW",
    proposal: proposal(),
    commits: [{
      semanticCommitId: "commit-other",
      proposalId: "other-proposal",
      status: "COMPLETED",
      updatedAt: observedAt,
    }],
  }), /Commit.*Proposal/i);
  assert.throws(() => narrateV2SystemStatus({
    observedAt,
    scene: "BACKGROUND",
    service: {
      status: "READY",
      formalWritesAvailable: true,
      storeStatus: "READY",
    },
    pendingCommitCount: -1,
    recoveryRequiredCommitCount: 0,
    anchorIssueCount: 0,
    explicitSyncPendingCount: 0,
    explicitSyncReconciliationRequired: false,
  }), /count/i);
});
