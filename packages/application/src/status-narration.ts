import type { V2Anchor, V2ManagedObject, V2Proposal } from "@task-copilot/domain";

export type StatusNarrationScene = "NOW" | "OBJECT" | "PROJECT" | "REVIEW" | "BACKGROUND";

export interface StatusNarrationFact {
  text: string;
  sourceRefs: string[];
}

export type StatusNarrationNextAction =
  | {
      intent: "REVIEW_WAITING" | "REVIEW_BLOCKER" | "REVIEW_PAUSE";
      label: string;
      targetObjectId: string;
    }
  | {
      intent: "OPEN_PROPOSAL_REVIEW";
      label: string;
      targetProposalId: string;
    }
  | {
      intent: "OPEN_RECOVERY_DETAILS";
      label: string;
      targetCommitId: string;
    }
  | {
      intent: "OPEN_ANCHOR_REPAIR";
      label: string;
      targetObjectId: string;
      targetAnchorId: string;
    };

export interface StatusNarration {
  conclusion: string;
  keyEvidence: string[];
  facts: StatusNarrationFact[];
  inferences: string[];
  unknowns: string[];
  nextActionEligible: boolean;
  nextAction?: StatusNarrationNextAction;
  evidenceScope: {
    refs: string[];
    observedAt: string;
  };
  source: {
    kind: "DETERMINISTIC_RULE";
    ruleId: string;
    version: "1.0.0";
  };
}

export interface V2ObjectStatusNarrationInput {
  observedAt: string;
  scene: StatusNarrationScene;
  object: V2ManagedObject;
  blocker?: V2ManagedObject;
}

export interface V2CommitStatusFact {
  semanticCommitId: string;
  proposalId?: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED" | "UNDONE";
  updatedAt: string;
  errorCode?: string;
}

export interface V2CommitStatusNarrationInput {
  observedAt: string;
  scene: StatusNarrationScene;
  commit: V2CommitStatusFact;
}

export interface V2ProposalStatusNarrationInput {
  observedAt: string;
  scene: StatusNarrationScene;
  proposal: V2Proposal;
  commits: readonly V2CommitStatusFact[];
}

export interface V2AnchorStatusNarrationInput {
  observedAt: string;
  scene: StatusNarrationScene;
  anchor: V2Anchor;
  object?: V2ManagedObject;
}

export interface V2SystemStatusNarrationInput {
  observedAt: string;
  scene: StatusNarrationScene;
  service: {
    status: "READY" | "RESTRICTED";
    formalWritesAvailable: boolean;
    storeStatus: "NOT_STARTED" | "READY" | "READ_ONLY_SAFE_MODE";
    reasonCode?: string;
    providerAvailable?: boolean;
  };
  pendingCommitCount: number;
  recoveryRequiredCommitCount: number;
  anchorIssueCount: number;
  explicitSyncPendingCount: number;
  explicitSyncReconciliationRequired: boolean;
}

function objectRef(object: V2ManagedObject): string {
  return `object:${object.objectId}@v${object.version}`;
}

function commitRef(commit: V2CommitStatusFact): string {
  return `commit:${commit.semanticCommitId}`;
}

function proposalRef(proposal: V2Proposal): string {
  return `proposal:${proposal.proposalId}`;
}

function anchorRef(anchor: V2Anchor): string {
  return `anchor:${anchor.anchorId}`;
}

function fact(text: string, ...sourceRefs: string[]): StatusNarrationFact {
  return { text, sourceRefs };
}

function compact(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function isDue(value: string | undefined, observedAt: number): boolean {
  return value !== undefined && Number.isFinite(Date.parse(value)) && Date.parse(value) <= observedAt;
}

function isRelatedScene(scene: StatusNarrationScene): boolean {
  return scene !== "BACKGROUND";
}

function requireObservedAt(value: string): number {
  const observedAt = Date.parse(value);
  if (!Number.isFinite(observedAt)) throw new Error("Status narration observedAt must be a valid timestamp.");
  return observedAt;
}

function result(input: {
  conclusion: string;
  keyEvidence?: string[];
  facts: StatusNarrationFact[];
  unknowns?: string[];
  nextAction?: StatusNarrationNextAction;
  evidenceRefs: string[];
  observedAt: string;
  ruleId: string;
}): StatusNarration {
  return {
    conclusion: compact(input.conclusion),
    keyEvidence: (input.keyEvidence ?? []).slice(0, 2).map((value) => compact(value)),
    facts: input.facts,
    inferences: [],
    unknowns: input.unknowns ?? [],
    nextActionEligible: input.nextAction !== undefined,
    ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    evidenceScope: {
      refs: [...new Set(input.evidenceRefs)].sort(),
      observedAt: input.observedAt,
    },
    source: {
      kind: "DETERMINISTIC_RULE",
      ruleId: input.ruleId,
      version: "1.0.0",
    },
  };
}

export function narrateV2ObjectStatus(input: V2ObjectStatusNarrationInput): StatusNarration {
  const observedAt = requireObservedAt(input.observedAt);
  const objectSource = objectRef(input.object);
  if (
    input.blocker
    && (
      input.object.condition.kind !== "BLOCKED"
      || input.object.condition.blockerObjectId !== input.blocker.objectId
    )
  ) {
    throw new Error("Status narration blocker evidence does not match the blocked object.");
  }

  if (input.object.lifecycle !== "OPEN") {
    const conclusion = input.object.lifecycle === "COMPLETED"
      ? "该事项已完成"
      : input.object.lifecycle === "CANCELLED"
        ? "该事项已取消"
        : "该事项已归档";
    return result({
      conclusion,
      facts: [fact(`正式状态记录为${conclusion.replace("该事项已", "")}`, objectSource)],
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: `lifecycle-${input.object.lifecycle.toLowerCase()}`,
    });
  }

  if (input.object.condition.kind === "WAITING") {
    const waiting = `正在等待${input.object.condition.waitingFor}提供${input.object.condition.expectedResult}`;
    const reviewDue = isDue(input.object.condition.reviewAt, observedAt);
    const reviewEvidence = reviewDue ? "原定复查时间已到" : "已设置后续复查时间";
    const nextAction = reviewDue && isRelatedScene(input.scene)
      ? {
          intent: "REVIEW_WAITING" as const,
          label: compact(`确认是否已收到${input.object.condition.expectedResult}`, 80),
          targetObjectId: input.object.objectId,
        }
      : undefined;
    return result({
      conclusion: reviewDue ? "该确认已到复查时间" : `正在等待${input.object.condition.waitingFor}`,
      keyEvidence: [
        reviewDue ? waiting : `等待结果是${input.object.condition.expectedResult}`,
        reviewEvidence,
      ],
      facts: [
        fact(waiting, objectSource),
        fact(reviewEvidence, objectSource),
      ],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: reviewDue ? "condition-waiting-review-due" : "condition-waiting",
    });
  }

  if (input.object.condition.kind === "BLOCKED") {
    const blockerSource = input.blocker ? objectRef(input.blocker) : undefined;
    if (input.blocker?.lifecycle === "COMPLETED") {
      const nextAction = isRelatedScene(input.scene)
        ? {
            intent: "REVIEW_BLOCKER" as const,
            label: "确认阻塞是否已解除",
            targetObjectId: input.object.objectId,
          }
        : undefined;
      return result({
        conclusion: "关联阻塞项已结束，需要重新判断是否可以继续",
        keyEvidence: [input.object.condition.reason, "关联阻塞项已完成"],
        facts: [
          fact(`当前阻塞原因：${input.object.condition.reason}`, objectSource),
          fact("关联阻塞项已完成", blockerSource!),
        ],
        ...(nextAction ? { nextAction } : {}),
        evidenceRefs: [objectSource, blockerSource!],
        observedAt: input.observedAt,
        ruleId: "condition-blocker-completed",
      });
    }
    return result({
      conclusion: "当前仍被阻塞",
      keyEvidence: [input.object.condition.reason],
      facts: [fact(`当前阻塞原因：${input.object.condition.reason}`, objectSource)],
      unknowns: input.object.condition.blockerObjectId && !input.blocker
        ? ["尚未读取关联阻塞项的当前状态"]
        : [],
      evidenceRefs: [objectSource, ...(blockerSource ? [blockerSource] : [])],
      observedAt: input.observedAt,
      ruleId: "condition-blocked",
    });
  }

  if (input.object.condition.kind === "PAUSED") {
    const reviewDue = isDue(input.object.condition.reviewAt, observedAt);
    const nextAction = reviewDue && isRelatedScene(input.scene)
      ? {
          intent: "REVIEW_PAUSE" as const,
          label: "重新判断是否继续推进",
          targetObjectId: input.object.objectId,
        }
      : undefined;
    return result({
      conclusion: reviewDue ? "该事项已到重新判断时间" : "该事项已暂停",
      keyEvidence: [
        input.object.condition.reason,
        ...(input.object.condition.reviewAt
          ? [reviewDue ? "原定重新判断时间已到" : "已设置后续重新判断时间"]
          : []),
      ],
      facts: [
        fact(`暂停原因：${input.object.condition.reason}`, objectSource),
        ...(input.object.condition.reviewAt
          ? [fact(reviewDue ? "原定重新判断时间已到" : "已设置后续重新判断时间", objectSource)]
          : []),
      ],
      unknowns: input.object.condition.reviewAt ? [] : ["尚未设置重新判断时间"],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: reviewDue ? "condition-paused-review-due" : "condition-paused",
    });
  }

  if (isDue(input.object.dueAt, observedAt)) {
    return result({
      conclusion: "明确期限已到",
      keyEvidence: ["正式期限已到", "当前状态仍可推进"],
      facts: [
        fact("正式期限已经到达", objectSource),
        fact("正式状态允许继续推进", objectSource),
      ],
      unknowns: ["正式状态没有提供足够信息来判断具体下一步"],
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: "condition-actionable-due",
    });
  }

  if (input.object.objectType === "PROJECT" && input.object.projectStructure) {
    const focuses = input.object.projectStructure.currentFocuses.slice(0, 2);
    return result({
      conclusion: input.object.projectStructure.currentSummary,
      keyEvidence: focuses.map((focus) => `当前推进：${focus}`),
      facts: [
        fact(`Project 当前摘要：${input.object.projectStructure.currentSummary}`, objectSource),
        ...focuses.map((focus) => fact(`Project 当前推进：${focus}`, objectSource)),
      ],
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: "project-current-interface",
    });
  }

  return result({
    conclusion: "可继续",
    keyEvidence: [],
    facts: [fact("正式状态允许继续推进", objectSource)],
    unknowns: ["正式状态没有提供足够信息来判断具体下一步"],
    evidenceRefs: [objectSource],
    observedAt: input.observedAt,
    ruleId: "condition-actionable",
  });
}

function failedCommitSafety(errorCode: string | undefined): string {
  const normalized = errorCode?.toUpperCase() ?? "";
  if (
    normalized.includes("GRAPH")
    || normalized.includes("CONTENT")
    || normalized.includes("HASH")
    || normalized.includes("ANCHOR")
    || normalized.includes("OBJECT")
    || normalized.includes("VERSION")
    || normalized.includes("OWNERSHIP")
    || normalized.includes("PROJECT_STRUCTURE")
    || normalized.includes("PROJECT_INTERFACE")
  ) {
    return "安全前置已经变化，系统没有覆盖后续变化";
  }
  return "写入链已安全终止，系统没有把失败报告为成功";
}

export function narrateV2CommitStatus(input: V2CommitStatusNarrationInput): StatusNarration {
  requireObservedAt(input.observedAt);
  if (!Number.isFinite(Date.parse(input.commit.updatedAt))) {
    throw new Error("Commit status narration updatedAt must be a valid timestamp.");
  }
  const sourceRef = commitRef(input.commit);
  if (input.commit.status === "PENDING") {
    const nextAction = isRelatedScene(input.scene)
      ? {
          intent: "OPEN_RECOVERY_DETAILS" as const,
          label: "查看并继续原修改",
          targetCommitId: input.commit.semanticCommitId,
        }
      : undefined;
    return result({
      conclusion: "这次修改尚未完成",
      keyEvidence: ["已完成的步骤已经安全保存", "不要重复提交相同修改"],
      facts: [
        fact("已完成的步骤已经安全保存", sourceRef),
        fact("正式应用尚未得到完整完成确认", sourceRef),
      ],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "commit-pending",
    });
  }
  if (input.commit.status === "RECOVERY_REQUIRED") {
    const nextAction = isRelatedScene(input.scene)
      ? {
          intent: "OPEN_RECOVERY_DETAILS" as const,
          label: "查看差异与恢复记录",
          targetCommitId: input.commit.semanticCommitId,
        }
      : undefined;
    return result({
      conclusion: "这次修改需要恢复",
      keyEvidence: ["相关正式写入已停止继续写入", "必须沿用同一恢复记录"],
      facts: [
        fact("相关正式写入已停止继续写入", sourceRef),
        fact("已完成步骤与恢复状态已经安全保存", sourceRef),
      ],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "commit-recovery-required",
    });
  }
  if (input.commit.status === "FAILED") {
    return result({
      conclusion: "这次修改没有应用",
      keyEvidence: ["写入链已经安全终止"],
      facts: [
        fact("这次正式修改已记录为未能应用", sourceRef),
        fact(failedCommitSafety(input.commit.errorCode), sourceRef),
      ],
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "commit-failed",
    });
  }
  if (input.commit.status === "UNDONE") {
    return result({
      conclusion: "这次修改已经撤销",
      keyEvidence: ["逆向修改已经完成", "历史证据仍保留"],
      facts: [
        fact("这次正式修改已记录为撤销", sourceRef),
        fact("原修改与逆向修改的历史证据仍保留", sourceRef),
      ],
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "commit-undone",
    });
  }
  return result({
    conclusion: "这次修改已经应用",
    keyEvidence: ["所有步骤都已完成"],
    facts: [fact("这次正式修改已完整完成", sourceRef)],
    unknowns: ["当前证据不足以确认是否仍满足安全撤销条件"],
    evidenceRefs: [sourceRef],
    observedAt: input.observedAt,
    ruleId: "commit-completed",
  });
}

function commitPriority(status: V2CommitStatusFact["status"]): number {
  return {
    RECOVERY_REQUIRED: 5,
    PENDING: 4,
    UNDONE: 3,
    COMPLETED: 2,
    FAILED: 1,
  }[status];
}

export function narrateV2ProposalStatus(input: V2ProposalStatusNarrationInput): StatusNarration {
  requireObservedAt(input.observedAt);
  const proposalSource = proposalRef(input.proposal);
  for (const commit of input.commits) {
    if (commit.proposalId !== input.proposal.proposalId) {
      throw new Error("Commit evidence does not match the Proposal.");
    }
  }
  const primaryCommit = [...input.commits].sort((left, right) =>
    commitPriority(right.status) - commitPriority(left.status)
    || right.updatedAt.localeCompare(left.updatedAt)
  )[0];
  if (primaryCommit) {
    const commitNarration = narrateV2CommitStatus({
      observedAt: input.observedAt,
      scene: input.scene,
      commit: primaryCommit,
    });
    return {
      ...commitNarration,
      facts: [
        fact(`修改建议：${input.proposal.title}`, proposalSource),
        ...commitNarration.facts,
      ],
      evidenceScope: {
        refs: [...new Set([proposalSource, ...commitNarration.evidenceScope.refs])].sort(),
        observedAt: input.observedAt,
      },
    };
  }

  const acceptedGroups = input.proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (
    ["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(input.proposal.status)
    && acceptedGroups.length > 0
  ) {
    const nextAction = isRelatedScene(input.scene)
      ? {
          intent: "OPEN_PROPOSAL_REVIEW" as const,
          label: "返回检查并正式应用",
          targetProposalId: input.proposal.proposalId,
        }
      : undefined;
    return result({
      conclusion: "修改内容已经确认，尚未正式应用",
      keyEvidence: [
        `已确认 ${acceptedGroups.length} 组修改`,
        "正式正文与对象尚未由完成 Commit 证明生效",
      ],
      facts: [
        fact(`已确认 ${acceptedGroups.length} 组修改内容`, proposalSource),
        fact("没有找到已完成的正式 Commit", proposalSource),
      ],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [proposalSource],
      observedAt: input.observedAt,
      ruleId: "proposal-accepted-not-applied",
    });
  }

  if (input.proposal.status === "STALE") {
    const nextAction = isRelatedScene(input.scene)
      ? {
          intent: "OPEN_PROPOSAL_REVIEW" as const,
          label: "基于最新内容重新检查",
          targetProposalId: input.proposal.proposalId,
        }
      : undefined;
    return result({
      conclusion: "原内容已经变化，需要重新检查",
      facts: [fact("修改建议已记录为过期，未证明正式应用", proposalSource)],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [proposalSource],
      observedAt: input.observedAt,
      ruleId: "proposal-stale",
    });
  }

  const conclusions: Record<V2Proposal["status"], string> = {
    DRAFT: "修改建议仍在起草",
    READY: "修改建议等待确认",
    IN_REVIEW: "修改建议正在确认",
    PARTIALLY_ACCEPTED: "修改建议已有部分决定",
    ACCEPTED: "修改内容已经确认",
    REJECTED: "修改建议已拒绝",
    STALE: "原内容已经变化，需要重新检查",
    APPLIED: "这次修改已经应用",
    FAILED: "修改建议未能进入正式应用",
    SUPERSEDED: "修改建议已被后续版本替代",
  };
  const reviewable = ["READY", "IN_REVIEW", "PARTIALLY_ACCEPTED"].includes(input.proposal.status);
  const nextAction = reviewable && isRelatedScene(input.scene)
    ? {
        intent: "OPEN_PROPOSAL_REVIEW" as const,
        label: "查看修改建议",
        targetProposalId: input.proposal.proposalId,
      }
    : undefined;
  return result({
    conclusion: conclusions[input.proposal.status],
    facts: [fact(`修改建议当前状态：${conclusions[input.proposal.status]}`, proposalSource)],
    ...(input.proposal.status === "APPLIED"
      ? { unknowns: ["当前没有读取到对应完成 Commit，不能据此确认 Undo 是否可用"] }
      : {}),
    ...(nextAction ? { nextAction } : {}),
    evidenceRefs: [proposalSource],
    observedAt: input.observedAt,
    ruleId: `proposal-${input.proposal.status.toLowerCase().replaceAll("_", "-")}`,
  });
}

export function narrateV2AnchorStatus(input: V2AnchorStatusNarrationInput): StatusNarration {
  requireObservedAt(input.observedAt);
  if (!Number.isFinite(Date.parse(input.anchor.lastSeenAt))) {
    throw new Error("Anchor status narration lastSeenAt must be a valid timestamp.");
  }
  if (input.anchor.role !== "primary_text") {
    throw new Error("Anchor status narration requires a Primary Anchor.");
  }
  if (input.object && input.object.objectId !== input.anchor.objectId) {
    throw new Error("Anchor evidence does not match the object.");
  }
  const sourceRef = anchorRef(input.anchor);
  const objectSource = input.object ? objectRef(input.object) : undefined;
  if (input.anchor.status === "active") {
    return result({
      conclusion: "正式事项与正文连接正常",
      facts: [fact("Primary Anchor 最近一次观察为正常连接", sourceRef)],
      evidenceRefs: [sourceRef, ...(objectSource ? [objectSource] : [])],
      observedAt: input.observedAt,
      ruleId: "anchor-active",
    });
  }
  if (input.anchor.status === "replaced") {
    return result({
      conclusion: "旧正文连接已被替换",
      facts: [fact("该 Anchor 只作为历史连接证据保留", sourceRef)],
      evidenceRefs: [sourceRef, ...(objectSource ? [objectSource] : [])],
      observedAt: input.observedAt,
      ruleId: "anchor-replaced",
    });
  }
  const conflict = input.anchor.status === "conflict";
  const nextAction = isRelatedScene(input.scene)
    ? {
        intent: "OPEN_ANCHOR_REPAIR" as const,
        label: "检查正文连接",
        targetObjectId: input.anchor.objectId,
        targetAnchorId: input.anchor.anchorId,
      }
    : undefined;
  return result({
    conclusion: conflict ? "正式事项与正文连接存在冲突" : "正式事项与正文失去连接",
    keyEvidence: [
      conflict ? "当前连接不能安全确定唯一正文位置" : "原正文位置当前不可用",
      ...(input.object ? ["正式事项仍保留"] : []),
    ],
    facts: [
      fact(conflict ? "Primary Anchor 当前记录为连接冲突" : "Primary Anchor 当前记录为缺失", sourceRef),
      ...(objectSource ? [fact("正式事项仍保留在正式状态中", objectSource)] : []),
    ],
    unknowns: input.object ? [] : ["尚未读取正式事项的当前状态"],
    ...(nextAction ? { nextAction } : {}),
    evidenceRefs: [sourceRef, ...(objectSource ? [objectSource] : [])],
    observedAt: input.observedAt,
    ruleId: conflict ? "anchor-conflict" : "anchor-missing",
  });
}

function requireSystemCounts(input: V2SystemStatusNarrationInput): void {
  for (const [name, value] of Object.entries({
    pendingCommitCount: input.pendingCommitCount,
    recoveryRequiredCommitCount: input.recoveryRequiredCommitCount,
    anchorIssueCount: input.anchorIssueCount,
    explicitSyncPendingCount: input.explicitSyncPendingCount,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`System status narration ${name} count must be a non-negative safe integer.`);
    }
  }
}

export function narrateV2SystemStatus(input: V2SystemStatusNarrationInput): StatusNarration {
  requireObservedAt(input.observedAt);
  requireSystemCounts(input);
  const sourceRef = "system:runtime";
  if (input.recoveryRequiredCommitCount > 0) {
    return result({
      conclusion: `有 ${input.recoveryRequiredCommitCount} 项修改需要恢复`,
      keyEvidence: ["相关写入已暂停", "原 Commit 与恢复证据仍保留"],
      facts: [
        fact(`检测到 ${input.recoveryRequiredCommitCount} 项需要恢复的正式修改`, sourceRef),
        fact("系统不会为同一修改建立重复写入链", sourceRef),
      ],
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "system-commit-recovery-required",
    });
  }
  if (input.pendingCommitCount > 0) {
    return result({
      conclusion: `有 ${input.pendingCommitCount} 项修改尚未完成`,
      keyEvidence: ["相关修改不能重复提交"],
      facts: [
        fact(`检测到 ${input.pendingCommitCount} 项尚未完成的正式修改`, sourceRef),
        fact("已完成步骤保存在原操作记录中", sourceRef),
      ],
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "system-commit-pending",
    });
  }
  if (
    input.service.status !== "READY"
    || !input.service.formalWritesAvailable
    || input.service.storeStatus !== "READY"
  ) {
    const reason = input.service.reasonCode ?? "SERVICE_RESTRICTED";
    const restoreRecoveryArmed = reason === "LAUNCHER_RESTORE_RECOVERY_ARMED";
    const restoreRecoveryStateInvalid = reason === "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID";
    const restoreRecoveryRequired = reason === "V2_RESTORE_ROLLBACK_FAILED"
      || reason === "LAUNCHER_RESTORE_RECOVERY_REQUIRED";
    const endedByUser = reason === "SERVICE_ENDED_BY_USER";
    const graphMismatch = reason.includes("GRAPH");
    const protocolMismatch = reason.includes("PROTOCOL");
    const notConfigured = reason.includes("DESCRIPTOR")
      || reason.includes("NOT_CONFIGURED")
      || reason.includes("PATH_REQUIRED");
    return result({
      conclusion: endedByUser
        ? "本次 Task Copilot 已结束"
        : restoreRecoveryStateInvalid
        ? "恢复记录无法安全确认"
        : restoreRecoveryArmed
        ? "上次恢复中断，需要核验"
        : restoreRecoveryRequired
        ? "需要人工恢复"
        : graphMismatch
        ? "当前知识库与正式状态不匹配"
        : protocolMismatch
          ? "Task Copilot 版本不兼容"
          : notConfigured
            ? "Task Copilot 尚未连接当前知识库"
            : "正式能力暂时不可用",
      keyEvidence: endedByUser
        ? ["用户已明确结束本次使用", "Logseq 正文仍可编辑"]
        : restoreRecoveryStateInvalid
        ? ["应用正式修改已暂停", "恢复记录与完整性未知"]
        : restoreRecoveryArmed
        ? ["应用正式修改已暂停", "恢复前状态尚未确认"]
        : restoreRecoveryRequired
        ? ["应用正式修改已暂停", "切换前恢复点仍保留"]
        : ["应用正式修改已暂停", "Logseq 正文仍可编辑"],
      facts: [
        fact("应用正式修改、审阅提交、撤销、备份、恢复与迁移已暂停", sourceRef),
        fact(
          endedByUser
            ? "用户已明确结束本次使用；正式状态和历史没有被删除"
            : restoreRecoveryStateInvalid
            ? "系统没有猜测回滚结果，也没有声称恢复点完整"
            : restoreRecoveryArmed
            ? "系统没有把未验证文件描述成可用恢复点"
            : restoreRecoveryRequired
            ? "自动回滚未完成，系统没有继续启用未确认的正式状态"
            : "Logseq 正文仍可编辑，系统没有把连接失败当成空状态",
          sourceRef,
        ),
      ],
      ...(restoreRecoveryStateInvalid
        ? { unknowns: ["恢复记录、恢复点完整性和当前正式状态均需人工核验"] }
        : restoreRecoveryArmed
          ? { unknowns: ["恢复前快照是否完整仍需人工核验"] }
          : {}),
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: endedByUser
        ? "system-service-ended-by-user"
        : restoreRecoveryStateInvalid
        ? "system-restore-recovery-state-invalid"
        : restoreRecoveryArmed
        ? "system-restore-recovery-armed"
        : restoreRecoveryRequired
        ? "system-restore-recovery-required"
        : graphMismatch
        ? "system-graph-mismatch"
        : protocolMismatch
          ? "system-protocol-mismatch"
          : notConfigured
            ? "system-service-not-configured"
            : "system-service-restricted",
    });
  }
  if (input.anchorIssueCount > 0) {
    return result({
      conclusion: `有 ${input.anchorIssueCount} 项正式事项与正文失去连接`,
      keyEvidence: ["正式对象仍保留", "系统没有自动猜测新位置"],
      facts: [
        fact(`检测到 ${input.anchorIssueCount} 项正文连接缺失或冲突`, sourceRef),
        fact("其他连接正常的事项仍可使用", sourceRef),
      ],
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "system-anchor-issue",
    });
  }
  if (input.explicitSyncReconciliationRequired || input.explicitSyncPendingCount > 0) {
    const count = Math.max(1, input.explicitSyncPendingCount);
    return result({
      conclusion: `有 ${count} 项正文变化需要核对`,
      keyEvidence: ["正文仍由 Logseq 权威保存"],
      facts: [
        fact(`检测到 ${count} 项待核对正文变化`, sourceRef),
        fact("核对只重验现有事实，不建立第二个正式状态源", sourceRef),
      ],
      evidenceRefs: [sourceRef],
      observedAt: input.observedAt,
      ruleId: "system-explicit-sync-reconciliation",
    });
  }
  return result({
    conclusion: "Task Copilot 可以正常使用",
    keyEvidence: ["正式状态与当前知识库已连接"],
    facts: [
      fact("正式状态与当前知识库已连接", sourceRef),
      fact(
        input.service.providerAvailable
          ? "Agent 分析与确定性基础能力均可用"
          : "Agent 分析未启用，确定性基础事务能力不受影响",
        sourceRef,
      ),
    ],
    evidenceRefs: [sourceRef],
    observedAt: input.observedAt,
    ruleId: "system-ready",
  });
}
