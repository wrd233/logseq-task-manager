import { StructuredError } from "@task-copilot/shared";

export interface AgentGateBlock {
  externalId: string;
  content: string;
  parentExternalId?: string;
  pageName?: string;
}

export type AgentGateAction = "IGNORE_THIS_CHANGE" | "UPDATE_REVIEW_SIGNAL" | "RUN_LOCAL" | "RUN_EXPANDED" | "DEFER_TO_BATCH";
export type AgentGateReason = "FORMAT_ONLY" | "ORDINARY_CONTENT" | "WEAK_SIGNAL" | "REPEATED_WEAK_SIGNAL" | "STRONG_SIGNAL" | "FORMAL_OBJECT_UPDATE" | "EXISTING_THREAD_CHANGED" | "MULTIPLE_TARGETS" | "EVENT_STORM";

export interface AgentGateInput {
  changed: AgentGateBlock;
  previousContent?: string;
  /** Ordered changed block -> parent -> grandparent, bounded to eight parents. */
  lineage: AgentGateBlock[];
  changedBlockCount: number;
  weakSignalOccurrences30d: number;
  candidateTargetCount: number;
  hasExistingDecisionThread: boolean;
  insideFormalObject: boolean;
}

export interface AgentGateResult {
  action: AgentGateAction;
  reason: AgentGateReason;
  sourceRoot: AgentGateBlock;
}

const explicitMarker = /^(?:TODO|NOW|DOING)\b|^\[(?:Task|任务|MiniProject|决定|Decision|成果|Output)\]/iu;
const strongSignal = /^(?:TODO|NOW|DOING)\b|\[(?:Task|任务|MiniProject|决定|Decision|成果|Output)\]|\b(?:blocked|waiting|deliver(?:ed|y)?)\b|等待|阻塞|已完成|已交付|决定为/iu;
const weakSignal = /以后考虑|以后可能|可能需要|似乎有问题|也许需要|有空可以|\b(?:maybe|someday|possibly)\b/iu;

function gateError(message: string): StructuredError {
  return new StructuredError({ code: "AGENT_GATE_INPUT_INVALID", message, ruleRefs: ["ADG-GATE-01"] });
}

function validateBlock(value: AgentGateBlock, field: string): AgentGateBlock {
  const externalId = value.externalId.trim();
  if (!externalId || externalId.length > 512 || typeof value.content !== "string" || value.content.length > 32_768) {
    throw gateError(`${field} 缺少受控 Block 身份或正文。`);
  }
  return { ...value, externalId };
}

function semanticText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^\s*(?:id|collapsed)::.*$/gimu, "")
    .replace(/(?:\*\*|__|~~|`)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function isExplicit(value: AgentGateBlock): boolean {
  return explicitMarker.test(semanticText(value.content));
}

export function selectAgentSourceRoot(lineage: readonly AgentGateBlock[]): AgentGateBlock {
  if (lineage.length < 1 || lineage.length > 9) throw gateError("Source Root lineage 必须包含 changed Block 且最多八层父链。");
  const validated = lineage.map((value, index) => validateBlock(value, `lineage[${index}]`));
  if (validated.some((value, index) => index > 0 && validated[index - 1]!.parentExternalId !== value.externalId)) {
    throw gateError("Source Root lineage 不是连续父链。");
  }
  return validated.find(isExplicit) ?? validated[0]!;
}

function boundedCount(value: number, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw gateError(`${field} 必须是受控非负整数。`);
  return value;
}

export function classifyAgentGovernanceChange(input: AgentGateInput): AgentGateResult {
  const changed = validateBlock(input.changed, "changed");
  if (input.lineage[0]?.externalId !== changed.externalId) throw gateError("lineage 必须从 changed Block 开始。");
  const sourceRoot = selectAgentSourceRoot(input.lineage);
  const changedBlockCount = boundedCount(input.changedBlockCount, "changedBlockCount", 1_024);
  const weakOccurrences = boundedCount(input.weakSignalOccurrences30d, "weakSignalOccurrences30d", 10_000);
  const candidateTargetCount = boundedCount(input.candidateTargetCount, "candidateTargetCount", 256);
  if (changedBlockCount > 32) return { action: "DEFER_TO_BATCH", reason: "EVENT_STORM", sourceRoot };
  if (input.previousContent !== undefined && semanticText(input.previousContent) === semanticText(changed.content)) {
    return { action: "IGNORE_THIS_CHANGE", reason: "FORMAT_ONLY", sourceRoot };
  }
  if (candidateTargetCount > 1) return { action: "RUN_EXPANDED", reason: "MULTIPLE_TARGETS", sourceRoot };
  const content = semanticText(changed.content);
  if (strongSignal.test(content) || isExplicit(sourceRoot)) return { action: "RUN_LOCAL", reason: "STRONG_SIGNAL", sourceRoot };
  if (input.insideFormalObject) return { action: "RUN_LOCAL", reason: "FORMAL_OBJECT_UPDATE", sourceRoot };
  if (weakSignal.test(content)) {
    return weakOccurrences >= 3
      ? { action: "RUN_EXPANDED", reason: "REPEATED_WEAK_SIGNAL", sourceRoot }
      : { action: "UPDATE_REVIEW_SIGNAL", reason: "WEAK_SIGNAL", sourceRoot };
  }
  if (input.hasExistingDecisionThread) return { action: "RUN_LOCAL", reason: "EXISTING_THREAD_CHANGED", sourceRoot };
  return { action: "IGNORE_THIS_CHANGE", reason: "ORDINARY_CONTENT", sourceRoot };
}
