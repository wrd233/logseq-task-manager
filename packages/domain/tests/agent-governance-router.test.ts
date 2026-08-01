import assert from "node:assert/strict";
import test from "node:test";

import {
  routeAgentDecision,
  validateAgentGovernanceSkillManifest,
  validateAgentStructuredDecisionOutput,
} from "../src/agent-governance-router.ts";

const authorization = {
  ruleId: "EXPLICIT-TASK-01",
  displayName: "明确任务标记",
  skillName: "agent-decision-governance",
  skillVersion: "1.0.0",
  skillHash: "a".repeat(64),
  skillMaxAuthority: "AUTO_APPLY" as const,
  localCurrentAuthority: "AUTO_APPLY" as const,
  effectiveAuthority: "AUTO_APPLY" as const,
  changeLevel: "PATCH" as const,
  paused: false,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const safeInput = {
  riskLevel: "R1" as const,
  authorization,
  runtimeMode: "GUARDED" as const,
  guardedAutomationEnabled: true,
  globalWritesPaused: false,
  degraded: false,
  skillValid: true,
  skillVersionMatches: true,
  requiredEvidence: ["SOURCE_ROOT_EXPLICIT_TASK_MARKER", "NO_DUPLICATE"],
  presentEvidence: ["SOURCE_ROOT_EXPLICIT_TASK_MARKER", "NO_DUPLICATE"],
  requiredEvidenceOmitted: [],
  counterSignals: [],
  targetObjectIds: [],
  affectedObjectCount: 1,
  modifiesSourceText: false,
  changesLifecycle: false,
  changesPrimaryOwnership: false,
  structuralChange: false,
  reversible: true,
};

test("EXPERIMENT always remains Shadow with zero formal business writes", () => {
  const result = routeAgentDecision({ ...safeInput, runtimeMode: "EXPERIMENT" });
  assert.equal(result.route, "SHADOW");
  assert.equal(result.formalBusinessWriteAllowed, false);
  assert.match(result.reasons.join(" "), /EXPERIMENT_MODE/);
});

test("the deterministic router allows only a fully evidenced guarded R1 path", () => {
  const result = routeAgentDecision(safeInput);
  assert.equal(result.route, "AUTO_APPLY");
  assert.equal(result.formalBusinessWriteAllowed, true);

  for (const unsafe of [
    { ...safeInput, counterSignals: ["possible duplicate"] },
    { ...safeInput, requiredEvidenceOmitted: ["NO_DUPLICATE"] },
    { ...safeInput, targetObjectIds: ["a", "b"], affectedObjectCount: 2 },
    { ...safeInput, authorization: { ...authorization, paused: true } },
    { ...safeInput, globalWritesPaused: true },
    { ...safeInput, skillVersionMatches: false },
  ]) {
    const blocked = routeAgentDecision(unsafe);
    assert.equal(blocked.formalBusinessWriteAllowed, false);
    assert.notEqual(blocked.route, "AUTO_APPLY");
  }
});

test("high-impact and R3 decisions never auto-apply", () => {
  for (const unsafe of [
    { ...safeInput, riskLevel: "R3" as const },
    { ...safeInput, changesLifecycle: true },
    { ...safeInput, changesPrimaryOwnership: true },
    { ...safeInput, structuralChange: true },
    { ...safeInput, modifiesSourceText: true },
  ]) {
    const result = routeAgentDecision(unsafe);
    assert.equal(result.route, "HUMAN_REVIEW");
    assert.equal(result.formalBusinessWriteAllowed, false);
  }
});

test("structured Decision output rejects unknown or forged authority fields", () => {
  const valid = validateAgentStructuredDecisionOutput({
    schemaVersion: "agent-decision-output-v1",
    outcome: "CREATE_OBJECT",
    targetObjectIds: [],
    ruleId: "EXPLICIT-TASK-01",
    evidenceSummary: "Explicit marker and no duplicate.",
    evidenceRefs: ["source:root"],
    counterSignals: [],
    closestAlternative: { outcome: "CREATE_CANDIDATE", reason: "If duplication cannot be excluded." },
    needsMoreContext: false,
    needsHuman: false,
  });
  assert.equal(valid.ruleId, "EXPLICIT-TASK-01");
  assert.throws(() => validateAgentStructuredDecisionOutput({ ...valid, authority: "AUTO_APPLY" }), /unknown field/i);
  assert.throws(() => validateAgentStructuredDecisionOutput({ ...valid, confidence: 1 }), /unknown field/i);
});

test("structured Decision output normalizes the design contract's nullable closest alternative", () => {
  const value = validateAgentStructuredDecisionOutput({
    schemaVersion: "agent-decision-output-v1",
    outcome: "CREATE_OBJECT",
    targetObjectIds: [],
    ruleId: "EXPLICIT-TASK-01",
    evidenceSummary: "Explicit marker and no duplicate.",
    evidenceRefs: ["source:root", "rule:EXPLICIT-TASK-01"],
    counterSignals: [],
    closestAlternative: { outcome: null, reason: null },
    needsMoreContext: false,
    needsHuman: false,
  });
  assert.deepEqual(value.closestAlternative, {});
});

test("Skill manifest requires stable unique Rule IDs, Chinese names, examples, and a bounded output schema", () => {
  const manifest = validateAgentGovernanceSkillManifest({
    schemaVersion: "agent-governance-skill-v1",
    outputSchemaVersion: "agent-decision-output-v1",
    rules: [{
      id: "EXPLICIT-TASK-01",
      displayName: "明确任务标记",
      shortReason: "来源包含明确任务标记。",
      scope: ["EXPLICIT_TASK"],
      requiredEvidence: ["SOURCE_ROOT_EXPLICIT_TASK_MARKER", "NO_DUPLICATE"],
      counterSignals: ["MULTIPLE_TARGETS"],
      recommendedOutcome: "CREATE_OBJECT",
      maxAuthority: "AUTO_APPLY",
      riskLevel: "R1",
      positiveExamples: ["[Task] 整理 RHCSA 资料"],
      boundaryExamples: ["整理 RHCSA 资料"],
      negativeExamples: ["这是关于 RHCSA 的说明"],
    }],
  });
  assert.equal(manifest.rules[0]?.displayName, "明确任务标记");
  assert.throws(() => validateAgentGovernanceSkillManifest({ ...manifest, rules: [...manifest.rules, manifest.rules[0]] }), /duplicate Rule ID/i);
});
