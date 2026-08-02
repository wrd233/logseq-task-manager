import type {
  AgentDecision,
  AgentDecisionEvent,
  AgentReviewSignal,
  AgentRiskRoute,
  AgentRuleAuthority,
} from "@task-copilot/domain";

export const outcomeLabels: Record<AgentDecision["outcome"], string> = {
  CREATE_CANDIDATE: "建议创建候选",
  KEEP_ORDINARY: "保持普通内容",
  DEFER: "暂缓判断",
  UPDATE_EXISTING: "建议更新已有对象",
  CREATE_OBJECT: "建议创建正式对象",
  REVIEW_SIGNAL: "记入复盘线索",
  NO_ACTION: "无需处理",
  NEEDS_HUMAN: "需要查看",
  NEEDS_MORE_CONTEXT: "需要更多上下文",
};

export const executionLabels: Record<AgentDecision["executionStatus"], string> = {
  NOT_EXECUTED: "未执行",
  SCHEDULED: "已排队",
  APPLIED: "已应用",
  BLOCKED: "已阻断",
  FAILED: "执行失败",
  UNDONE: "已撤销",
  STALE: "来源已变化",
};

export const eventLabels: Record<AgentDecisionEvent["eventType"], string> = {
  SOURCE_OBSERVED: "读取来源",
  DECISION_REVISED: "修订决策",
  ROUTE_CHANGED: "调整风险路由",
  EXECUTION_SCHEDULED: "进入执行队列",
  APPLIED: "已应用",
  BLOCKED: "已阻断",
  FAILED: "执行失败",
  UNDONE: "已撤销",
  USER_FEEDBACK_ADDED: "用户反馈",
};

export const riskRouteLabels: Record<AgentRiskRoute, string> = {
  SHADOW: "观察模式",
  BATCH_REVIEW: "批量采样",
  DELAYED_APPLY: "观察后自动处理",
  AUTO_APPLY: "自动处理",
  HUMAN_REVIEW: "需要判断",
};

export const authorityLabels: Record<AgentRuleAuthority, string> = {
  SHADOW: "观察模式",
  BATCH_REVIEW: "批量采样",
  DELAYED_APPLY: "观察后自动处理",
  AUTO_APPLY: "自动处理",
};

const contextTierLabels: Record<AgentDecision["context"]["tier"], string> = {
  LOCAL: "本地来源",
  EXPANDED: "扩展上下文",
  REVIEW: "审阅上下文",
};

export function contextTierLabel(tier: AgentDecision["context"]["tier"]): string {
  return contextTierLabels[tier];
}

export function sourceTitle(decision: AgentDecision): string {
  const pageName = decision.sourceRoot.pageName?.trim();
  if (pageName) return pageName;
  return decision.sourceRoot.kind === "PAGE" ? "未命名页面" : "未命名来源";
}

export function decisionJudgmentLine(decision: AgentDecision): string {
  const outcome = outcomeLabels[decision.outcome];
  if (decision.outcome === "CREATE_OBJECT") return `Agent 建议：创建正式对象`;
  if (decision.outcome === "UPDATE_EXISTING") return `Agent 建议：更新已有对象`;
  if (decision.outcome === "CREATE_CANDIDATE") return `Agent 建议：创建候选`;
  if (decision.outcome === "REVIEW_SIGNAL") return `Agent 记入：复盘线索`;
  if (decision.outcome === "NEEDS_HUMAN") return `Agent 判断：需要查看`;
  if (decision.outcome === "NEEDS_MORE_CONTEXT") return `Agent 判断：需要更多上下文`;
  return `Agent 判断：${outcome}`;
}

export interface AgentPrimaryStatus {
  label: string;
  tone: "normal" | "attention" | "danger";
}

export function decisionPrimaryStatus(decision: AgentDecision): AgentPrimaryStatus {
  if (decision.executionStatus === "FAILED") return { label: "异常", tone: "danger" };
  if (decision.executionStatus === "BLOCKED") return { label: "异常", tone: "danger" };
  if (decision.executionStatus === "STALE") return { label: "来源已变化", tone: "attention" };
  if (decision.outcome === "NEEDS_HUMAN") return { label: "需要查看", tone: "attention" };
  if (decision.executionStatus === "APPLIED") return { label: "已自动处理", tone: "normal" };
  if (decision.executionStatus === "SCHEDULED") return { label: "已排队", tone: "normal" };
  if (decision.executionStatus === "UNDONE") return { label: "已撤销", tone: "normal" };
  if (decision.executionStatus === "NOT_EXECUTED" && decision.riskRoute === "DELAYED_APPLY") {
    return { label: "观察后处理", tone: "normal" };
  }
  if (decision.executionStatus === "NOT_EXECUTED" && decision.riskRoute === "SHADOW") {
    return { label: "观察中", tone: "normal" };
  }
  if (decision.executionStatus === "NOT_EXECUTED" && decision.riskRoute === "BATCH_REVIEW") {
    return { label: "抽样观察", tone: "normal" };
  }
  return { label: "已记录", tone: "normal" };
}

export function decisionJudgmentSentence(decision: AgentDecision): string {
  const judgment = decisionJudgmentLine(decision);
  if (decision.executionStatus === "APPLIED") return `${judgment}；已按系统安全链执行。`;
  if (decision.executionStatus === "SCHEDULED") return `${judgment}；已进入执行队列，正式内容尚未变化。`;
  if (decision.executionStatus === "UNDONE") return `${judgment}；已撤销，正式内容恢复原状。`;
  return `${judgment}；本次没有创建或修改任何正式对象。`;
}

export function decisionImpactStatement(decision: AgentDecision): string {
  if (decision.executionStatus === "APPLIED") return "已应用 Agent 判断；正式内容按系统安全链更新。";
  if (decision.executionStatus === "SCHEDULED") return "已进入执行队列；正式内容尚未变化。";
  if (decision.executionStatus === "UNDONE") return "已撤销；正式内容已恢复原状。";
  if (decision.executionStatus === "STALE") return "来源已变化；本次未执行，正式任务系统没有变化。";
  return "未执行；正式任务系统没有变化。";
}

export function signalUserTitle(): string {
  return "可能值得以后复盘";
}

const signalCategoryLabels: Record<string, string> = {
  "weak-intent": "意图尚不明确",
  "repeated-edit": "反复修改",
  "multiple-targets": "可能涉及多个对象",
};

export function signalCategoryLabel(category: string): string {
  return signalCategoryLabels[category] ?? "复查线索";
}

export function signalOccurrenceLabel(signal: AgentReviewSignal): string {
  const windowDays = signal.retentionClass === "NORMAL" ? 60 : 180;
  return `过去 ${windowDays} 天出现 ${signal.occurrenceCount} 次`;
}
