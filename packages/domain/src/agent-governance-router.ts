import { StructuredError } from "@task-copilot/shared";

import {
  effectiveAgentRuleAuthority,
  type AgentDecisionOutcome,
  type AgentRiskRoute,
  type AgentRuleAuthorization,
  type AgentRuleAuthority,
} from "./agent-governance.ts";

export type AgentGovernanceRiskLevel = "R0" | "R1" | "R2" | "R3";
export type AgentGovernanceRuntimeMode = "EXPERIMENT" | "GUARDED";

export interface AgentGovernanceRule {
  id: string;
  displayName: string;
  shortReason: string;
  scope: string[];
  requiredEvidence: string[];
  counterSignals: string[];
  recommendedOutcome: AgentDecisionOutcome;
  maxAuthority: AgentRuleAuthority;
  riskLevel: AgentGovernanceRiskLevel;
  positiveExamples: string[];
  boundaryExamples: string[];
  negativeExamples: string[];
}

export interface AgentGovernanceSkillManifest {
  schemaVersion: "agent-governance-skill-v1";
  outputSchemaVersion: "agent-decision-output-v1";
  rules: AgentGovernanceRule[];
}

export interface AgentStructuredDecisionOutput {
  schemaVersion: "agent-decision-output-v1";
  outcome: AgentDecisionOutcome;
  targetObjectIds: string[];
  ruleId: string;
  evidenceSummary: string;
  evidenceRefs: string[];
  counterSignals: string[];
  closestAlternative: { outcome?: AgentDecisionOutcome; reason?: string };
  needsMoreContext: boolean;
  needsHuman: boolean;
}

export interface RouteAgentDecisionInput {
  riskLevel: AgentGovernanceRiskLevel;
  authorization: AgentRuleAuthorization;
  runtimeMode: AgentGovernanceRuntimeMode;
  guardedAutomationEnabled: boolean;
  globalWritesPaused: boolean;
  degraded: boolean;
  skillValid: boolean;
  skillVersionMatches: boolean;
  requiredEvidence: string[];
  presentEvidence: string[];
  requiredEvidenceOmitted: string[];
  counterSignals: string[];
  targetObjectIds: string[];
  affectedObjectCount: number;
  modifiesSourceText: boolean;
  changesLifecycle: boolean;
  changesPrimaryOwnership: boolean;
  structuralChange: boolean;
  reversible: boolean;
}

export interface AgentRiskRoutingResult {
  route: AgentRiskRoute;
  effectiveAuthority: AgentRuleAuthority;
  formalBusinessWriteAllowed: boolean;
  reasons: string[];
}

const outcomes = new Set<AgentDecisionOutcome>([
  "CREATE_CANDIDATE", "KEEP_ORDINARY", "DEFER", "UPDATE_EXISTING", "CREATE_OBJECT", "REVIEW_SIGNAL", "NO_ACTION", "NEEDS_HUMAN", "NEEDS_MORE_CONTEXT",
]);
const authorities = new Set<AgentRuleAuthority>(["SHADOW", "BATCH_REVIEW", "DELAYED_APPLY", "AUTO_APPLY"]);
const riskLevels = new Set<AgentGovernanceRiskLevel>(["R0", "R1", "R2", "R3"]);

function routerError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["ADG-SKILL-01", "ADG-ROUTER-01"] });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", `${label} 必须是对象。`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw routerError("AGENT_GOVERNANCE_UNKNOWN_FIELD", `${label} contains unknown field: ${unknown.join(", ")}`);
}

function stringValue(value: unknown, label: string, maximum = 2_048): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", `${label} 必须是受控非空文本。`);
  return value.trim();
}

function stringArray(value: unknown, label: string, minimum = 0, maximum = 32): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", `${label} 数量超出边界。`);
  const result = value.map((item, index) => stringValue(item, `${label}[${index}]`, 512));
  if (new Set(result).size !== result.length) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", `${label} 不得包含重复项。`);
  return result;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", `${label} 必须是 boolean。`);
  return value;
}

export function validateAgentStructuredDecisionOutput(value: unknown): AgentStructuredDecisionOutput {
  const source = record(value, "Decision output");
  exactKeys(source, ["schemaVersion", "outcome", "targetObjectIds", "ruleId", "evidenceSummary", "evidenceRefs", "counterSignals", "closestAlternative", "needsMoreContext", "needsHuman"], "Decision output");
  if (source.schemaVersion !== "agent-decision-output-v1") throw routerError("AGENT_DECISION_OUTPUT_VERSION_INVALID", "Decision output schema version 不受支持。");
  if (!outcomes.has(source.outcome as AgentDecisionOutcome)) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", "Decision outcome 不受支持。");
  const alternative = record(source.closestAlternative, "closestAlternative");
  exactKeys(alternative, ["outcome", "reason"], "closestAlternative");
  if (alternative.outcome !== undefined && alternative.outcome !== null && !outcomes.has(alternative.outcome as AgentDecisionOutcome)) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", "closestAlternative outcome 不受支持。");
  const alternativeReason = alternative.reason === undefined || alternative.reason === null ? undefined : stringValue(alternative.reason, "closestAlternative.reason");
  return {
    schemaVersion: "agent-decision-output-v1",
    outcome: source.outcome as AgentDecisionOutcome,
    targetObjectIds: stringArray(source.targetObjectIds, "targetObjectIds", 0, 8),
    ruleId: stringValue(source.ruleId, "ruleId", 128),
    evidenceSummary: stringValue(source.evidenceSummary, "evidenceSummary", 8_192),
    evidenceRefs: stringArray(source.evidenceRefs, "evidenceRefs", 1, 64),
    counterSignals: stringArray(source.counterSignals, "counterSignals", 0, 32),
    closestAlternative: {
      ...(alternative.outcome === undefined || alternative.outcome === null ? {} : { outcome: alternative.outcome as AgentDecisionOutcome }),
      ...(alternativeReason === undefined ? {} : { reason: alternativeReason }),
    },
    needsMoreContext: booleanValue(source.needsMoreContext, "needsMoreContext"),
    needsHuman: booleanValue(source.needsHuman, "needsHuman"),
  };
}

function validateRule(value: unknown, index: number): AgentGovernanceRule {
  const source = record(value, `rules[${index}]`);
  exactKeys(source, ["id", "displayName", "shortReason", "scope", "requiredEvidence", "counterSignals", "recommendedOutcome", "maxAuthority", "riskLevel", "positiveExamples", "boundaryExamples", "negativeExamples"], `rules[${index}]`);
  const id = stringValue(source.id, `rules[${index}].id`, 128);
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{2}$/u.test(id)) throw routerError("AGENT_SKILL_RULE_ID_INVALID", "Rule ID 必须是稳定的大写机器标识。");
  const displayName = stringValue(source.displayName, `rules[${index}].displayName`, 64);
  if (!/\p{Script=Han}/u.test(displayName)) throw routerError("AGENT_SKILL_DISPLAY_NAME_INVALID", "Rule display name 必须提供中文名称。");
  if (!outcomes.has(source.recommendedOutcome as AgentDecisionOutcome)) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", "Rule recommended outcome 不受支持。");
  if (!authorities.has(source.maxAuthority as AgentRuleAuthority)) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", "Rule max authority 不受支持。");
  if (!riskLevels.has(source.riskLevel as AgentGovernanceRiskLevel)) throw routerError("AGENT_GOVERNANCE_SCHEMA_INVALID", "Rule risk level 不受支持。");
  return {
    id,
    displayName,
    shortReason: stringValue(source.shortReason, `rules[${index}].shortReason`, 512),
    scope: stringArray(source.scope, `rules[${index}].scope`, 1, 16),
    requiredEvidence: stringArray(source.requiredEvidence, `rules[${index}].requiredEvidence`, 1, 16),
    counterSignals: stringArray(source.counterSignals, `rules[${index}].counterSignals`, 1, 16),
    recommendedOutcome: source.recommendedOutcome as AgentDecisionOutcome,
    maxAuthority: source.maxAuthority as AgentRuleAuthority,
    riskLevel: source.riskLevel as AgentGovernanceRiskLevel,
    positiveExamples: stringArray(source.positiveExamples, `rules[${index}].positiveExamples`, 1, 8),
    boundaryExamples: stringArray(source.boundaryExamples, `rules[${index}].boundaryExamples`, 1, 8),
    negativeExamples: stringArray(source.negativeExamples, `rules[${index}].negativeExamples`, 1, 8),
  };
}

export function validateAgentGovernanceSkillManifest(value: unknown): AgentGovernanceSkillManifest {
  const source = record(value, "Agent governance Skill manifest");
  exactKeys(source, ["schemaVersion", "outputSchemaVersion", "rules"], "Agent governance Skill manifest");
  if (source.schemaVersion !== "agent-governance-skill-v1" || source.outputSchemaVersion !== "agent-decision-output-v1") {
    throw routerError("AGENT_SKILL_VERSION_INVALID", "Agent governance Skill manifest 或 output schema version 不受支持。");
  }
  if (!Array.isArray(source.rules) || source.rules.length < 1 || source.rules.length > 64) throw routerError("AGENT_SKILL_RULES_INVALID", "Skill 必须包含 1..64 条受控规则。");
  const rules = source.rules.map(validateRule);
  const ids = rules.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw routerError("AGENT_SKILL_RULE_ID_DUPLICATE", "Skill contains duplicate Rule ID.");
  const displayNames = rules.map(({ displayName }) => displayName);
  if (new Set(displayNames).size !== displayNames.length) throw routerError("AGENT_SKILL_DISPLAY_NAME_DUPLICATE", "Skill 中文名称不得重名。");
  return { schemaVersion: "agent-governance-skill-v1", outputSchemaVersion: "agent-decision-output-v1", rules };
}

export function routeAgentDecision(input: RouteAgentDecisionInput): AgentRiskRoutingResult {
  if (!riskLevels.has(input.riskLevel)) throw routerError("AGENT_ROUTER_INPUT_INVALID", "Risk level 不受支持。");
  if (!Number.isSafeInteger(input.affectedObjectCount) || input.affectedObjectCount < 0 || input.affectedObjectCount > 256) throw routerError("AGENT_ROUTER_INPUT_INVALID", "Affected object count 超出边界。");
  const requiredEvidence = stringArray(input.requiredEvidence, "requiredEvidence", 0, 32);
  const presentEvidence = new Set(stringArray(input.presentEvidence, "presentEvidence", 0, 64));
  const requiredEvidenceOmitted = stringArray(input.requiredEvidenceOmitted, "requiredEvidenceOmitted", 0, 32);
  const counterSignals = stringArray(input.counterSignals, "counterSignals", 0, 32);
  const targetObjectIds = stringArray(input.targetObjectIds, "targetObjectIds", 0, 8);
  const effectiveAuthority = effectiveAgentRuleAuthority(input.authorization.skillMaxAuthority, input.authorization.localCurrentAuthority);
  const reasons: string[] = [];
  const result = (route: AgentRiskRoute, formalBusinessWriteAllowed = false): AgentRiskRoutingResult => ({ route, effectiveAuthority, formalBusinessWriteAllowed, reasons });

  const highImpact = input.riskLevel === "R3" || input.modifiesSourceText || input.changesLifecycle || input.changesPrimaryOwnership || input.structuralChange;
  if (highImpact) {
    reasons.push("HIGH_IMPACT_REQUIRES_HUMAN");
    return result("HUMAN_REVIEW");
  }
  if (input.globalWritesPaused || input.authorization.paused || input.degraded || !input.skillValid || !input.skillVersionMatches) {
    if (input.globalWritesPaused) reasons.push("GLOBAL_WRITES_PAUSED");
    if (input.authorization.paused) reasons.push("RULE_PAUSED");
    if (input.degraded) reasons.push("RUNTIME_DEGRADED");
    if (!input.skillValid) reasons.push("SKILL_INVALID");
    if (!input.skillVersionMatches) reasons.push("SKILL_VERSION_MISMATCH");
    return result("SHADOW");
  }
  const missingEvidence = requiredEvidence.filter((evidence) => !presentEvidence.has(evidence));
  if (missingEvidence.length > 0 || requiredEvidenceOmitted.length > 0 || counterSignals.length > 0 || targetObjectIds.length > 1 || input.affectedObjectCount > 1 || !input.reversible) {
    if (missingEvidence.length > 0) reasons.push("REQUIRED_EVIDENCE_MISSING");
    if (requiredEvidenceOmitted.length > 0) reasons.push("REQUIRED_EVIDENCE_TRUNCATED");
    if (counterSignals.length > 0) reasons.push("COUNTER_SIGNAL_PRESENT");
    if (targetObjectIds.length > 1 || input.affectedObjectCount > 1) reasons.push("MULTIPLE_OBJECTS_AFFECTED");
    if (!input.reversible) reasons.push("ACTION_NOT_REVERSIBLE");
    return result("HUMAN_REVIEW");
  }
  if (input.runtimeMode === "EXPERIMENT") {
    reasons.push("EXPERIMENT_MODE");
    return result("SHADOW");
  }
  if (!input.guardedAutomationEnabled) {
    reasons.push("GUARDED_AUTOMATION_DISABLED");
    return result("SHADOW");
  }
  if (input.riskLevel === "R0") {
    reasons.push("R0_GOVERNANCE_RECORD_ONLY");
    return result("SHADOW");
  }
  if (effectiveAuthority === "SHADOW") return result("SHADOW");
  if (effectiveAuthority === "BATCH_REVIEW") return result("BATCH_REVIEW");
  if (effectiveAuthority === "DELAYED_APPLY") return result("DELAYED_APPLY");
  if (input.riskLevel === "R2") {
    reasons.push("R2_AUTO_APPLY_CAPPED");
    return result("DELAYED_APPLY");
  }
  reasons.push("GUARDED_R1_AUTHORIZED");
  return result("AUTO_APPLY", true);
}
