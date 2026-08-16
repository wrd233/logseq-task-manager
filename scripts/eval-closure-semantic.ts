import { writeFile } from "node:fs/promises";
import { DeepSeekClosureAssessor, FakeClosureAssessor, loadMiniProjectClosureAssessmentSkill, loadProjectClosureAssessmentSkill } from "@task-copilot/agent";
import { CLOSURE_ASSESSMENT_PROFILE, FAKE_CLOSURE_ASSESSMENT_PROFILE, type ClosureAssessment, type ClosureItemStatus, type ClosureReadiness, type ProjectIntent, type WorkObject } from "@task-copilot/contracts";
import { CLOSURE_GOLD_SET } from "../packages/test-support/src/closure-gold-set.ts";
import { aggregateClosureSemanticJudgment } from "../apps/kernel-service/src/closure-gate.ts";

const fake = process.argv.includes("--fake");
const assessor = fake ? new FakeClosureAssessor() : new DeepSeekClosureAssessor();
const profile = fake ? FAKE_CLOSURE_ASSESSMENT_PROFILE : CLOSURE_ASSESSMENT_PROFILE;
const skills = { miniProject: await loadMiniProjectClosureAssessmentSkill(), project: await loadProjectClosureAssessmentSkill() };

function workObject(id: string, input: (typeof CLOSURE_GOLD_SET)[number]): WorkObject {
  return {
    id, kind: input.kind, title: input.title, lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null,
    currentFocus: null, desiredOutcome: input.desiredOutcome ?? null, completionChecks: input.completionChecks ?? [],
    version: 1, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z",
  };
}

function projectIntent(input: (typeof CLOSURE_GOLD_SET)[number]): ProjectIntent | null {
  if (input.kind !== "PROJECT") return null;
  return {
    workObjectId: `case-${input.id}`, objective: input.objective ?? null,
    keyResults: input.keyResults ?? [], scope: null, currentPhase: null, revision: 1,
    createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z",
  };
}

const started = Date.now();
const results: Array<Record<string, unknown>> = [];
let falseReady = 0; let falseNotReady = 0; let readinessCorrect = 0;
let unknownRestraint = 0; let conflictDetected = 0; let conflictMissed = 0;
let itemStatusTotal = 0; let itemStatusCorrect = 0; let attributionTotal = 0; let attributionCorrect = 0;
let invalidRefs = 0; let parseFailures = 0;

for (const item of CLOSURE_GOLD_SET) {
  const latencyStart = Date.now();
  let outcome: ClosureAssessment | null = null;
  let error: string | null = null;
  try {
    const judgment = await assessor.assess({
      object: workObject(`case-${item.id}`, item), projectIntent: projectIntent(item),
      evidence: item.evidence.map((evidence) => ({ id: evidence.id, workObjectId: `case-${item.id}`, sourceType: "LOGSEQ_BLOCK" as const, graphId: "gold", externalId: evidence.id, frozenContent: evidence.content, contentHash: "hash", frozenAt: evidence.frozenAt, locator: { graphId: "gold", blockUuid: evidence.id } })),
      profile,
      skill: item.kind === "PROJECT" ? skills.project : skills.miniProject,
    });
    outcome = aggregateClosureSemanticJudgment({
      object: workObject(`case-${item.id}`, item), projectIntent: projectIntent(item), judgment,
      allowedEvidenceIds: new Set(item.evidence.map((evidence) => evidence.id)),
      semanticRevision: item.kind === "PROJECT" ? "1:1" : "1", evidenceWatermark: item.evidence.length, at: new Date().toISOString(),
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    if (/EVIDENCE_REF_INVALID|ITEM_MISSING|KIND_MISMATCH|DUPLICATE/u.test(error)) invalidRefs += 1;
    else parseFailures += 1;
  }
  const actual: ClosureReadiness | null = outcome?.readiness ?? null;
  const expected = item.expected.readiness;
  if (actual === expected) readinessCorrect += 1;
  if (actual === "READY" && expected !== "READY") falseReady += 1;
  if (actual !== "READY" && expected === "READY") falseNotReady += 1;
  if (expected === "UNKNOWN" && actual === "UNKNOWN") unknownRestraint += 1;
  if (expected === "CONFLICT" && actual === "CONFLICT") conflictDetected += 1;
  if (expected === "CONFLICT" && actual !== "CONFLICT") conflictMissed += 1;
  for (const [key, status] of Object.entries(item.expected.items ?? {})) {
    itemStatusTotal += 1;
    const check = outcome?.checks.find((entry) => (item.kind === "PROJECT" ? entry.text === item.keyResults?.find((kr, index) => (kr.id ?? `K${index}`) === key)?.text : entry.text === item.completionChecks?.[Number(key.slice(1))]));
    const actualStatus: ClosureItemStatus | null = check?.status ?? null;
    if (actualStatus === status) itemStatusCorrect += 1;
    if (item.expected.supports?.[key] && check) {
      attributionTotal += 1;
      const expectedIds = [...item.expected.supports[key]!].sort();
      const actualIds = [...check.evidenceIds].sort();
      if (JSON.stringify(expectedIds) === JSON.stringify(actualIds)) attributionCorrect += 1;
    }
  }
  results.push({ id: item.id, kind: item.kind, expected: item.expected.readiness, actual, error, checks: outcome?.checks.map((check) => ({ text: check.text, status: check.status, evidenceIds: check.evidenceIds })) ?? null, objectiveStatus: error ? null : null, latencyMs: Date.now() - latencyStart });
}

const summary = {
  at: new Date().toISOString(), fake, scenarios: CLOSURE_GOLD_SET.length, elapsedMs: Date.now() - started,
  falseReady, falseNotReady, readinessCorrect, unknownRestraint, conflictDetected, conflictMissed,
  itemStatusTotal, itemStatusCorrect, attributionTotal, attributionCorrect, invalidRefs, parseFailures,
  tokenUsage: assessor.tokenUsage ?? null,
};
const output = { summary, results };
await writeFile("/tmp/tc-closure-semantic-eval.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify(summary, null, 2));
