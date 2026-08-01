import { StructuredError } from "@task-copilot/shared";

export interface AgentExecutionRevalidationInput {
  sourceExists: boolean;
  expectedSourceHash: string;
  currentSourceHash?: string;
  targetRequired: boolean;
  targetExists: boolean;
  expectedTargetVersion?: number;
  currentTargetVersion?: number;
  anchorStatus: "ACTIVE" | "MISSING" | "CONFLICT" | "NOT_REQUIRED";
  ruleAuthorizationExists: boolean;
  rulePaused: boolean;
  skillVersionValid: boolean;
  runtimeModeAllowsWrite: boolean;
  globalWritesPaused: boolean;
  degraded: boolean;
  expectedScope: string[];
  currentScope: string[];
  equivalentActionCompleted: boolean;
}

export interface AgentExecutionRevalidationResult {
  status: "READY" | "STALE" | "BLOCKED" | "NO_OP";
  reasons: string[];
}

function revalidationError(message: string): StructuredError {
  return new StructuredError({ code: "AGENT_REVALIDATION_INPUT_INVALID", message, ruleRefs: ["ADG-REVAL-01"] });
}

function validateHash(value: string | undefined, field: string, optional = false): string | undefined {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !/^[0-9a-f]{8,64}$/u.test(value)) throw revalidationError(`${field} 必须是受控 hash。`);
  return value;
}

function validateVersion(value: number | undefined, field: string, optional: boolean): number | undefined {
  if (optional && value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw revalidationError(`${field} 必须是受控版本。`);
  return value;
}

function validateScope(value: string[], field: string): string[] {
  if (!Array.isArray(value) || value.length > 256 || value.some((id) => typeof id !== "string" || !id.trim() || id.length > 128)) {
    throw revalidationError(`${field} 必须是受控身份集合。`);
  }
  const result = value.map((id) => id.trim()).sort();
  if (new Set(result).size !== result.length) throw revalidationError(`${field} 不得重复。`);
  return result;
}

export function revalidateAgentExecution(input: AgentExecutionRevalidationInput): AgentExecutionRevalidationResult {
  const expectedSourceHash = validateHash(input.expectedSourceHash, "expectedSourceHash")!;
  const currentSourceHash = validateHash(input.currentSourceHash, "currentSourceHash", !input.sourceExists);
  const expectedTargetVersion = validateVersion(input.expectedTargetVersion, "expectedTargetVersion", !input.targetRequired);
  const currentTargetVersion = validateVersion(input.currentTargetVersion, "currentTargetVersion", !input.targetRequired || !input.targetExists);
  const expectedScope = validateScope(input.expectedScope, "expectedScope");
  const currentScope = validateScope(input.currentScope, "currentScope");
  const stale: string[] = [];
  if (!input.sourceExists) stale.push("SOURCE_MISSING");
  else if (currentSourceHash !== expectedSourceHash) stale.push("SOURCE_HASH_CHANGED");
  if (input.targetRequired && input.targetExists && currentTargetVersion !== expectedTargetVersion) stale.push("TARGET_VERSION_CHANGED");
  if (stale.length > 0) return { status: "STALE", reasons: stale };

  if (input.equivalentActionCompleted) return { status: "NO_OP", reasons: ["EQUIVALENT_ACTION_COMPLETED"] };

  const blocked: string[] = [];
  if (input.targetRequired && !input.targetExists) blocked.push("TARGET_MISSING");
  if (input.anchorStatus === "MISSING") blocked.push("ANCHOR_MISSING");
  if (input.anchorStatus === "CONFLICT") blocked.push("ANCHOR_CONFLICT");
  if (!input.ruleAuthorizationExists) blocked.push("RULE_AUTHORIZATION_MISSING");
  if (input.rulePaused) blocked.push("RULE_PAUSED");
  if (!input.skillVersionValid) blocked.push("SKILL_VERSION_INVALID");
  if (!input.runtimeModeAllowsWrite) blocked.push("RUNTIME_MODE_BLOCKED");
  if (input.globalWritesPaused) blocked.push("GLOBAL_WRITES_PAUSED");
  if (input.degraded) blocked.push("RUNTIME_DEGRADED");
  if (expectedScope.length !== currentScope.length || expectedScope.some((id, index) => id !== currentScope[index])) blocked.push("IMPACT_SCOPE_CHANGED");
  return blocked.length > 0 ? { status: "BLOCKED", reasons: blocked } : { status: "READY", reasons: [] };
}
