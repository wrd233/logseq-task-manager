import type { ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";
import type { StatusNarration } from "@task-copilot/application";

import { projectPluginCommitNarration } from "./status-narration-runtime.ts";

export type RecentChangeStatus = "APPLIED" | "PENDING" | "RECOVERY_REQUIRED" | "FAILED" | "UNDONE";

export interface RecentChangeAction {
  action: "recent-change-review" | "v2-proposal-undo" | "v2-ownership-undo" | "v2-lifecycle-undo" | "v2-project-creation-undo" | "v2-project-structure-undo" | "v2-project-closure-undo" | "v2-mini-project-restructure-undo";
  label: string;
  value: string;
  tone: "quiet" | "danger";
}

export interface RecentChange {
  commitIdentity: string;
  proposalIdentity?: string;
  intent: string;
  summary: string;
  status: RecentChangeStatus;
  statusLabel: string;
  narration: StatusNarration;
  occurredAt: string;
  availability?: string;
  primaryAction?: RecentChangeAction;
  secondaryAction?: RecentChangeAction;
  technical: {
    semanticCommitId: string;
    proposalId?: string;
    status: ServiceSemanticCommit["status"];
    errorCode?: string;
    beforeStateChecksum: string;
    afterStateChecksum?: string;
  };
}

export interface RecentChangesInput {
  proposals: readonly ServiceStoredProposal[];
  commits: readonly ServiceSemanticCommit[];
  limit?: number;
}

function originalIdentity(commitId: string): string | undefined {
  for (const prefix of ["mini-project-restructure-undo:", "project-creation-undo:", "project-structure-undo:", "project-closure-undo:", "ownership-undo:", "lifecycle-undo:", "undo:"]) {
    if (commitId.startsWith(prefix)) return commitId.slice(prefix.length);
  }
  return undefined;
}

function changedStateExplanation(code: string | undefined): string {
  const normalized = code?.toUpperCase() ?? "";
  if (normalized.includes("MINI_PROJECT_RESTRUCTURE_EXECUTION_FAILED")) {
    return "这次整理没有完成；已执行步骤已经恢复，正文和正式状态保持原样。";
  }
  if (normalized.includes("OWNERSHIP")) {
    return "Primary Ownership 已在本次修改后变化；为避免覆盖新归属，不能直接撤销。";
  }
  if (normalized.includes("PROJECT_STRUCTURE") || normalized.includes("PROJECT_INTERFACE")) {
    return "Project 当前接口已在本次修改后变化；为避免覆盖新事实，不能直接撤销。";
  }
  if (normalized.includes("ANCHOR")) {
    return "正式事项与正文的连接已变化；为避免修改错误位置，不能直接撤销。";
  }
  if (normalized.includes("GRAPH") || normalized.includes("CONTENT") || normalized.includes("HASH")) {
    return "Logseq 正文已有变化；系统没有覆盖当前内容。";
  }
  if (normalized.includes("OBJECT") || normalized.includes("VERSION")) {
    return "正式事项已在本次修改后变化；为避免覆盖新状态，不能直接撤销。";
  }
  return "撤销所需的安全前置已经变化；系统没有覆盖后续修改。";
}

function userState(commit: ServiceSemanticCommit): {
  status: RecentChangeStatus;
  label: string;
  availability?: string;
} {
  switch (commit.status) {
    case "COMPLETED":
      return { status: "APPLIED", label: "已应用" };
    case "PENDING":
      return {
        status: "PENDING",
        label: "尚未完成",
        availability: "已完成的步骤被安全记录；请继续原操作，不要重复提交。",
      };
    case "RECOVERY_REQUIRED":
      return {
        status: "RECOVERY_REQUIRED",
        label: "需要恢复",
        availability: "上一次修改尚未完成；请按同一恢复记录继续，不要新建重复操作。",
      };
    case "FAILED":
      return {
        status: "FAILED",
        label: "未能应用",
        availability: changedStateExplanation(commit.errorCode),
      };
    case "UNDONE":
      return {
        status: "UNDONE",
        label: "已撤销",
        availability: "这次修改已经通过逆向修改撤销，历史证据仍保留。",
      };
  }
}

function proposalUndoAction(
  record: ServiceStoredProposal | undefined,
  semanticCommitId: string,
): RecentChangeAction | undefined {
  if (!record || record.proposal.status !== "APPLIED") return undefined;
  const acceptedOperations = record.proposal.groups
    .filter((group) => group.disposition === "ACCEPTED")
    .flatMap((group) => group.semanticOperations);
  const isProjectClosure = acceptedOperations.some((operation) => (
    operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload
  )) && acceptedOperations.some((operation) => (
    operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.lifecycle === "COMPLETED"
  ));
  if (isProjectClosure) {
    return { action: "v2-project-closure-undo", label: "撤销", value: semanticCommitId, tone: "danger" };
  }
  if (acceptedOperations.some((operation) => operation.kind === "CHANGE_OWNERSHIP")) {
    return { action: "v2-ownership-undo", label: "撤销", value: semanticCommitId, tone: "danger" };
  }
  if (acceptedOperations.some((operation) => (
    operation.kind === "CREATE_OBJECT"
    && operation.payload.objectType === "PROJECT"
    && typeof operation.payload.pageName === "string"
    && typeof operation.payload.relationshipMode === "string"
  ))) {
    return { action: "v2-project-creation-undo", label: "撤销", value: semanticCommitId, tone: "danger" };
  }
  if (acceptedOperations.some((operation) => (
    (operation.kind === "UPDATE_PROJECT_INTERFACE" || operation.kind === "UPDATE_PROJECT_NARRATION")
    && "projectStructure" in operation.payload
  ))) {
    return { action: "v2-project-structure-undo", label: "撤销", value: semanticCommitId, tone: "danger" };
  }
  if (acceptedOperations.some((operation) => (
    operation.kind === "TRANSITION_LIFECYCLE"
    && (operation.payload.action === "CANCEL" || operation.payload.action === "REOPEN")
  ))) {
    return { action: "v2-lifecycle-undo", label: "撤销", value: semanticCommitId, tone: "danger" };
  }
  if (
    acceptedOperations.length > 0
    && acceptedOperations.every((operation) => operation.kind === "CREATE_BLOCK" || operation.kind === "MOVE_BLOCK")
  ) {
    return { action: "v2-mini-project-restructure-undo", label: "撤销", value: semanticCommitId, tone: "danger" };
  }
  const isNonGenericClosure = acceptedOperations.some((operation) => (
    operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.lifecycle === "COMPLETED"
  )) || acceptedOperations.some((operation) => (
    operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload
  ));
  if (isNonGenericClosure) return undefined;
  return { action: "v2-proposal-undo", label: "撤销", value: semanticCommitId, tone: "danger" };
}

function completedWithoutUndoExplanation(record: ServiceStoredProposal | undefined): string | undefined {
  if (!record || record.proposal.status !== "APPLIED") {
    return "当前投影不能确认安全撤销入口；请先查看原始审阅记录。";
  }
  const acceptedOperations = record.proposal.groups
    .filter((group) => group.disposition === "ACCEPTED")
    .flatMap((group) => group.semanticOperations);
  const closure = acceptedOperations.some((operation) => (
    operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.lifecycle === "COMPLETED"
  )) || acceptedOperations.some((operation) => (
    operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload
  ));
  return closure
    ? "这类高影响完成当前没有通用直接撤销入口；可查看原始审阅记录与保留的恢复证据。"
    : undefined;
}

function userSummary(record: ServiceStoredProposal | undefined, status: RecentChangeStatus): string {
  if (!record) return "这次正式修改的详细意图只在原始审阅记录中可用。";
  const acceptedOperations = record.proposal.groups
    .filter((group) => group.disposition === "ACCEPTED")
    .flatMap((group) => group.semanticOperations);
  const isProjectClosure = acceptedOperations.some((operation) => (
    operation.kind === "UPDATE_PROJECT_INTERFACE" && "closure" in operation.payload
  )) && acceptedOperations.some((operation) => (
    operation.kind === "TRANSITION_LIFECYCLE" && operation.payload.lifecycle === "COMPLETED"
  ));
  if (isProjectClosure) {
    return status === "UNDONE"
      ? "项目已恢复为进行中；本次完成回顾已移除，项目页面与正文保持不变。"
      : "项目已结束；结果、遗留和后续说明已经保存，项目页面与正文保持不变。";
  }
  return record.proposal.finalPreview;
}

function inverseAvailability(inverse: ServiceSemanticCommit): string {
  if (inverse.status === "FAILED") return changedStateExplanation(inverse.errorCode);
  if (inverse.status === "PENDING") return "撤销尚未完成；已完成的步骤被安全记录，请不要重复提交。";
  if (inverse.status === "RECOVERY_REQUIRED") return "撤销需要恢复；请继续同一恢复记录，不要新建重复操作。";
  if (inverse.status === "COMPLETED") return "撤销已经生效，历史证据仍保留。";
  return "这次修改已经撤销，历史证据仍保留。";
}

export function projectRecentChanges(input: RecentChangesInput): RecentChange[] {
  const proposals = new Map(input.proposals.map((record) => [record.proposal.proposalId, record]));
  const inverseByOriginal = new Map<string, ServiceSemanticCommit>();
  for (const commit of input.commits) {
    const original = originalIdentity(commit.semanticCommitId);
    if (original) inverseByOriginal.set(original, commit);
  }
  const result = input.commits
    .filter((commit) => !originalIdentity(commit.semanticCommitId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, input.limit ?? 20)
    .map((commit): RecentChange => {
      const narration = projectPluginCommitNarration(commit);
      const record = commit.proposalId ? proposals.get(commit.proposalId) : undefined;
      const state = userState(commit);
      const inverse = inverseByOriginal.get(commit.semanticCommitId);
      const primaryAction = commit.status === "COMPLETED" && !inverse
        ? proposalUndoAction(record, commit.semanticCommitId)
        : undefined;
      const projectedNarration = primaryAction
        ? {
            ...narration,
            unknowns: narration.unknowns.filter(
              (unknown) => unknown !== "当前证据不足以确认是否仍满足安全撤销条件",
            ),
          }
        : narration;
      const availability = inverse
        ? inverseAvailability(inverse)
        : state.availability ?? (commit.status === "COMPLETED"
          ? primaryAction
            ? "可以发起撤销；执行时会重新检查当前内容，若之后发生变化则不会覆盖。"
            : completedWithoutUndoExplanation(record)
          : undefined);
      const technical: RecentChange["technical"] = {
        semanticCommitId: commit.semanticCommitId,
        ...(commit.proposalId ? { proposalId: commit.proposalId } : {}),
        status: commit.status,
        ...(commit.errorCode ? { errorCode: commit.errorCode } : {}),
        beforeStateChecksum: commit.beforeStateChecksum,
        ...(commit.afterStateChecksum ? { afterStateChecksum: commit.afterStateChecksum } : {}),
      };
      return {
        commitIdentity: commit.semanticCommitId,
        ...(commit.proposalId ? { proposalIdentity: commit.proposalId } : {}),
        intent: record?.proposal.title ?? "正式修改",
        summary: userSummary(record, state.status),
        status: state.status,
        statusLabel: state.label,
        narration: projectedNarration,
        occurredAt: commit.updatedAt,
        ...(availability ? { availability } : {}),
        ...(primaryAction ? { primaryAction } : {}),
        ...(record ? {
          secondaryAction: {
            action: "recent-change-review" as const,
            label: state.status === "PENDING" ? "继续" : state.status === "RECOVERY_REQUIRED" ? "恢复" : "查看",
            value: "review",
            tone: state.status === "RECOVERY_REQUIRED" ? "danger" as const : "quiet" as const,
          },
        } : {}),
        technical,
      };
    });
  return result;
}
