export const PROJECT_OPERATION_INTENTS = [
  "FOCUS_VISIBILITY",
  "CONDITION",
  "REVIEW_AT",
  "DUE_AT",
  "ASSOCIATION",
  "CURRENT_SUMMARY",
  "CURRENT_FOCUSES",
  "CURRENT_INTERFACE",
  "STAGE_MAPPING",
  "OWNERSHIP",
  "BULK_CHILDREN",
  "MOVE_CONTENT",
  "OBJECTIVES_DELIVERABLES",
  "SPLIT_MERGE",
  "CLOSURE",
  "EXTERNAL_AGENT",
] as const;

export type ProjectOperationIntent = typeof PROJECT_OPERATION_INTENTS[number];
export type ProjectOperationReleaseClass =
  | "BUILT_IN_DIRECT"
  | "BUILT_IN_REVIEW"
  | "EXTERNAL_AGENT"
  | "NOT_AVAILABLE";
export type ProjectOperationFriction = "NONE" | "LIGHT" | "MEDIUM" | "HEAVY";
export type ProjectOperationFlow =
  | "DIRECT_WITH_UNDO"
  | "REVIEW_THEN_APPLY"
  | "DISCUSS_PREVIEW_COMMIT_UNDO"
  | "EXTERNAL_AGENT_PREVIEW_COMMIT"
  | "NOT_AVAILABLE";
export type ProjectOperationNextRoute =
  | "PROJECT_ATTENTION"
  | "PROJECT_NARRATION_REVIEW"
  | "PROJECT_STRUCTURE_REVIEW"
  | "EXTERNAL_AGENT_HANDOFF"
  | "NONE";

export interface ProjectOperationRoute {
  intent: ProjectOperationIntent;
  releaseClass: ProjectOperationReleaseClass;
  friction: ProjectOperationFriction;
  flow: ProjectOperationFlow;
  userOutcome: string;
  safetyBoundary: string;
  nextRoute: ProjectOperationNextRoute;
}

const lightAttention = new Set<ProjectOperationIntent>([
  "FOCUS_VISIBILITY",
  "CONDITION",
  "REVIEW_AT",
]);
const mediumNarration = new Set<ProjectOperationIntent>([
  "CURRENT_SUMMARY",
  "CURRENT_FOCUSES",
]);
const unavailable = new Set<ProjectOperationIntent>(["DUE_AT", "ASSOCIATION"]);
const externalAgent = new Set<ProjectOperationIntent>([
  "BULK_CHILDREN",
  "MOVE_CONTENT",
  "SPLIT_MERGE",
  "EXTERNAL_AGENT",
]);

export function routeProjectOperation(intent: ProjectOperationIntent): ProjectOperationRoute {
  if (unavailable.has(intent)) {
    return {
      intent,
      releaseClass: "NOT_AVAILABLE",
      friction: "NONE",
      flow: "NOT_AVAILABLE",
      userOutcome: intent === "ASSOCIATION"
        ? "先讨论对象关系，不在当前版本直接修改关联。"
        : "先在项目状态中记录时间判断，不创建独立 Project 期限。",
      safetyBoundary: intent === "ASSOCIATION"
        ? "普通 Association 尚无可靠 inverse，当前发布不开放正式写入。"
        : "Project due 语义和跨 reload inverse 尚未统一，当前发布不开放正式写入。",
      nextRoute: "NONE",
    };
  }
  if (lightAttention.has(intent)) {
    return {
      intent,
      releaseClass: "BUILT_IN_DIRECT",
      friction: "LIGHT",
      flow: "DIRECT_WITH_UNDO",
      userOutcome: "调整当前注意力或时间状态。",
      safetyBoundary: "只调用既有版本化命令；不改正文、Ownership 或 Project 结构。",
      nextRoute: "PROJECT_ATTENTION",
    };
  }
  if (mediumNarration.has(intent)) {
    return {
      intent,
      releaseClass: "BUILT_IN_REVIEW",
      friction: "MEDIUM",
      flow: "REVIEW_THEN_APPLY",
      userOutcome: "压缩 Project 的当前理解与进入点。",
      safetyBoundary: "只审阅叙述层变化；不得改变 Ownership、Lifecycle、Objectives、Deliverables、Work Stages 或正文。",
      nextRoute: "PROJECT_NARRATION_REVIEW",
    };
  }
  if (externalAgent.has(intent)) {
    return {
      intent,
      releaseClass: "EXTERNAL_AGENT",
      friction: "HEAVY",
      flow: "EXTERNAL_AGENT_PREVIEW_COMMIT",
      userOutcome: "由外部 Agent 在有界上下文中讨论并准备结构方案。",
      safetyBoundary: "外部 Agent 只能准备 Context 与 Proposal；Preview、正式 Commit、Undo 或 Recovery 仍由 Task Copilot 掌权。",
      nextRoute: "EXTERNAL_AGENT_HANDOFF",
    };
  }
  return {
    intent,
    releaseClass: "BUILT_IN_REVIEW",
    friction: "HEAVY",
    flow: "DISCUSS_PREVIEW_COMMIT_UNDO",
    userOutcome: "讨论并审阅 Project 的正式结构变化。",
    safetyBoundary: "必须经过 Proposal、最终阅读 Preview、显式 Commit，并保留 Undo 或 Recovery；LLM 无正式写入权。",
    nextRoute: "PROJECT_STRUCTURE_REVIEW",
  };
}
