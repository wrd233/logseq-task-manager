import type { ServiceNowWork, ServiceSemanticCommit, ServiceStoredProposal } from "@task-copilot/service-client";

export type ToolbarInterventionTarget = "now" | "review" | "audit" | "diagnostics";

export interface ToolbarInterventionCounts {
  dueReview: number;
  pendingConfirmation: number;
  acceptedNotApplied: number;
  pendingCommit: number;
  formalConnectionRisk: number;
}

export interface ToolbarIntervention {
  mode: "quiet" | "attention" | "recovery";
  count: number;
  target: ToolbarInterventionTarget;
  title: string;
  counts: ToolbarInterventionCounts;
}

export interface ToolbarInterventionInput {
  nowWork?: ServiceNowWork;
  proposals: readonly ServiceStoredProposal[];
  semanticCommits: readonly ServiceSemanticCommit[];
  formalConnectionRisk: boolean;
}

function reviewTime(item: ServiceNowWork["waitingReview"][number]): string | undefined {
  if (item.condition.kind === "WAITING" || item.condition.kind === "PAUSED") {
    return item.condition.reviewAt;
  }
  return undefined;
}

function isDue(value: string | undefined, at: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= at;
}

function pendingConfirmation(record: ServiceStoredProposal): boolean {
  if (!["READY", "IN_REVIEW", "PARTIALLY_ACCEPTED"].includes(record.proposal.status)) return false;
  return record.proposal.groups.some((group) => group.disposition === "PENDING");
}

function acceptedHighImpactNotApplied(record: ServiceStoredProposal): boolean {
  if (!["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(record.proposal.status)) return false;
  return record.proposal.groups.some((group) => group.risk === "HIGH" && group.disposition === "ACCEPTED");
}

function detailText(counts: ToolbarInterventionCounts): string {
  return [
    counts.dueReview ? `${counts.dueReview} 项到期复查` : "",
    counts.pendingConfirmation ? `${counts.pendingConfirmation} 项待确认` : "",
    counts.acceptedNotApplied ? `${counts.acceptedNotApplied} 项高影响修改尚未应用` : "",
    counts.pendingCommit ? `${counts.pendingCommit} 项修改尚未完成` : "",
    counts.formalConnectionRisk ? "正式连接需要检查" : "",
  ].filter(Boolean).join("；");
}

export function deriveToolbarIntervention(input: ToolbarInterventionInput): ToolbarIntervention {
  const generatedAt = input.nowWork ? Date.parse(input.nowWork.generatedAt) : Number.NaN;
  const now = Number.isFinite(generatedAt) ? generatedAt : Date.now();
  const dueObjectIds = new Set(
    input.nowWork?.waitingReview
      .filter((item) => isDue(reviewTime(item), now))
      .map((item) => item.objectId) ?? [],
  );
  const dueDeferredProposalIds = new Set(
    input.proposals
      .filter((record) => record.proposal.groups.some((group) => (
        group.disposition === "DEFERRED" && isDue(group.deferredUntil, now)
      )))
      .map((record) => record.proposal.proposalId),
  );
  const counts: ToolbarInterventionCounts = {
    dueReview: dueObjectIds.size + dueDeferredProposalIds.size,
    pendingConfirmation: input.proposals.filter(pendingConfirmation).length,
    acceptedNotApplied: input.proposals.filter(acceptedHighImpactNotApplied).length,
    pendingCommit: input.semanticCommits.filter((commit) => commit.status === "PENDING").length,
    formalConnectionRisk: input.formalConnectionRisk ? 1 : 0,
  };
  const count = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (input.semanticCommits.some((commit) => commit.status === "RECOVERY_REQUIRED")) {
    return {
      mode: "recovery",
      count,
      target: "audit",
      title: "Task Copilot：上一次修改尚未完成，点击进入恢复",
      counts,
    };
  }
  if (count === 0) {
    return {
      mode: "quiet",
      count: 0,
      target: "now",
      title: "Task Copilot",
      counts,
    };
  }
  const target: ToolbarInterventionTarget = counts.formalConnectionRisk
    ? "diagnostics"
    : counts.pendingCommit
      ? "audit"
      : counts.acceptedNotApplied || counts.pendingConfirmation
        ? "review"
        : "now";
  return {
    mode: "attention",
    count,
    target,
    title: `Task Copilot：${count} 项需要介入；${detailText(counts)}`,
    counts,
  };
}

function circledCount(count: number): string {
  const circled = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  return circled[count] ?? (count > 99 ? "99+" : String(count));
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderToolbarIntervention(summary: ToolbarIntervention): string {
  const badge = summary.mode === "recovery"
    ? '<span class="task-copilot-toolbar-badge recovery" aria-hidden="true">↻</span>'
    : summary.mode === "attention"
      ? `<span class="task-copilot-toolbar-badge" aria-hidden="true">${circledCount(summary.count)}</span>`
      : "";
  return `<span class="task-copilot-toolbar-state" data-toolbar-mode="${summary.mode}" title="${escapeAttribute(summary.title)}" aria-label="${escapeAttribute(summary.title)}"><span aria-hidden="true">TC</span>${badge}</span>`;
}
