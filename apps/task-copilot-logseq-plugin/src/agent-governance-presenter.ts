import type {
  AgentDecision,
  AgentReviewSignal,
  AgentRuleAuthorization,
} from "@task-copilot/domain";
import { decisionPrimaryStatus } from "./agent-governance-copy.ts";

export type AgentGovernanceRange = "24h" | "7d";
export type AgentGovernanceView = "decisions" | "rules" | "review";

export interface AgentGovernanceSummaryMetrics {
  handled: number;
  humanNeeded: number;
  failed: number;
  automatic: number;
}

export interface AgentGovernanceDashboard {
  decisions: AgentDecision[];
  metrics: AgentGovernanceSummaryMetrics;
}

export function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : value;
}

function decisionSeverity(decision: AgentDecision): number {
  if (decision.executionStatus === "FAILED") return 90;
  if (decision.executionStatus === "BLOCKED" || decision.executionStatus === "STALE") return 80;
  if (decision.outcome === "NEEDS_HUMAN") return 70;
  if (decision.counterSignals.length > 0) return 60;
  if (decision.outcome === "NEEDS_MORE_CONTEXT") return 50;
  return 0;
}

export function projectAgentGovernanceDashboard(input: {
  decisions: readonly AgentDecision[];
  rules: readonly AgentRuleAuthorization[];
  signals: readonly AgentReviewSignal[];
  now: string;
  range: AgentGovernanceRange;
}): AgentGovernanceDashboard {
  const now = timestamp(input.now);
  const rangeMs = input.range === "24h" ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
  const recent = input.decisions.filter((decision) => {
    const elapsed = now - timestamp(decision.updatedAt);
    return elapsed >= 0 && elapsed <= rangeMs;
  });
  const decisions = [...input.decisions].sort((left, right) => {
    const severity = decisionSeverity(right) - decisionSeverity(left);
    return severity || timestamp(right.updatedAt) - timestamp(left.updatedAt) || left.decisionId.localeCompare(right.decisionId);
  });
  return {
    decisions,
    metrics: {
      handled: recent.length,
      humanNeeded: recent.filter((decision) => decision.outcome === "NEEDS_HUMAN" || decision.riskRoute === "HUMAN_REVIEW").length,
      failed: recent.filter((decision) => ["FAILED", "BLOCKED", "STALE"].includes(decision.executionStatus)).length,
      automatic: recent.filter((decision) => decision.riskRoute === "AUTO_APPLY" && decision.executionStatus === "APPLIED").length,
    },
  };
}

export function decisionTone(decision: AgentDecision): "normal" | "attention" | "danger" {
  return decisionPrimaryStatus(decision).tone;
}

export function allRulesShareAuthority(rules: readonly AgentRuleAuthorization[]): {
  uniform: boolean;
  authority: AgentRuleAuthorization["effectiveAuthority"] | undefined;
} {
  if (!rules.length) return { uniform: false, authority: undefined };
  const first = rules[0]?.effectiveAuthority;
  const uniform = rules.every((rule) => rule.effectiveAuthority === first);
  return { uniform, authority: uniform ? first : undefined };
}

export function sharedSkillVersion(rules: readonly AgentRuleAuthorization[]): string | undefined {
  if (!rules.length) return undefined;
  const first = rules[0]?.skillVersion;
  return rules.every((rule) => rule.skillVersion === first) ? first : undefined;
}
