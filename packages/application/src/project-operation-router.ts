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
export type ProjectOperationFriction = "LIGHT" | "MEDIUM" | "HEAVY";
export type ProjectOperationFlow =
  | "DIRECT_WITH_UNDO"
  | "REVIEW_THEN_APPLY"
  | "DISCUSS_PREVIEW_COMMIT_UNDO";
export type ProjectOperationNextRoute =
  | "PROJECT_ATTENTION"
  | "PROJECT_ASSOCIATION"
  | "PROJECT_NARRATION_REVIEW"
  | "PROJECT_STRUCTURE_REVIEW";

export interface ProjectOperationRoute {
  intent: ProjectOperationIntent;
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
  "DUE_AT",
]);
const mediumNarration = new Set<ProjectOperationIntent>([
  "CURRENT_SUMMARY",
  "CURRENT_FOCUSES",
]);

export function routeProjectOperation(intent: ProjectOperationIntent): ProjectOperationRoute {
  if (intent === "ASSOCIATION") {
    return {
      intent,
      friction: "LIGHT",
      flow: "DIRECT_WITH_UNDO",
      userOutcome: "补充普通关联，不改变主归属。",
      safetyBoundary: "只创建普通 Association；位置、Ownership、Lifecycle 与 Focus 不变。",
      nextRoute: "PROJECT_ASSOCIATION",
    };
  }
  if (lightAttention.has(intent)) {
    return {
      intent,
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
      friction: "MEDIUM",
      flow: "REVIEW_THEN_APPLY",
      userOutcome: "压缩 Project 的当前理解与进入点。",
      safetyBoundary: "只审阅叙述层变化；不得改变 Ownership、Lifecycle、Objectives、Deliverables、Work Stages 或正文。",
      nextRoute: "PROJECT_NARRATION_REVIEW",
    };
  }
  return {
    intent,
    friction: "HEAVY",
    flow: "DISCUSS_PREVIEW_COMMIT_UNDO",
    userOutcome: "讨论并审阅 Project 的正式结构变化。",
    safetyBoundary: "必须经过 Proposal、最终阅读 Preview、显式 Commit，并保留 Undo 或 Recovery；LLM 无正式写入权。",
    nextRoute: "PROJECT_STRUCTURE_REVIEW",
  };
}
