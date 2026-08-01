import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentDecision,
  createAgentFeedbackEvent,
  createAgentRuleAuthorization,
  createOrRefreshAgentReviewSignal,
} from "../src/agent-governance.ts";
import { buildAgentReviewEvidencePackage, buildAgentSkillFeedbackPackage } from "../src/agent-governance-export.ts";

const generatedAt = new Date("2026-08-02T08:00:00.000Z");

function decision(externalId: string, evidenceSummary = "明确任务标记") {
  return createAgentDecision({
    graphId: "graph-export",
    sourceRoot: { kind: "BLOCK", externalId, pageName: "Journal", durableOrigin: { kind: "BLOCK_UUID", value: externalId } },
    sourceSnapshotHash: "a".repeat(8), outcome: "CREATE_CANDIDATE",
    rule: { id: "EXPLICIT-TASK-01", displayName: "明确任务标记", skillName: "agent-decision-governance", skillVersion: "1.0.0", skillHash: "b".repeat(64) },
    riskRoute: "SHADOW", executionStatus: "NOT_EXECUTED", evidenceSummary,
    evidenceRefs: [`block:${externalId}`], counterSignals: [], closestAlternative: { outcome: "KEEP_ORDINARY" },
    context: { tier: "LOCAL", truncated: false, omittedSections: [], estimatedInputTokens: 32 },
  }, new Date("2026-08-01T08:00:00.000Z"));
}

test("Skill Feedback Package is deterministic, aggregated, bounded, and redacts credential-shaped text", () => {
  const current = decision("block-feedback", "来源出现 token=sk-super-secret-credential-value");
  const feedback = createAgentFeedbackEvent(current, {
    rating: "WRONG", correctionType: "SHOULD_KEEP_ORDINARY", action: "RECORD_RULE_FEEDBACK",
    note: "authorization: Bearer private-token-value",
  }, "trace-export-feedback", new Date("2026-08-01T09:00:00.000Z"));
  const authorization = createAgentRuleAuthorization({
    ruleId: current.rule.id, displayName: current.rule.displayName, skillName: current.rule.skillName,
    skillVersion: current.rule.skillVersion, skillHash: current.rule.skillHash, skillMaxAuthority: "AUTO_APPLY",
  }, new Date("2026-08-01T07:00:00.000Z"));

  const first = buildAgentSkillFeedbackPackage({
    generatedAt, since: "2026-07-01T00:00:00.000Z", until: generatedAt.toISOString(),
    decisions: [current], events: [feedback], authorizations: [authorization], sourceTotal: 1, truncated: false,
  });
  const second = buildAgentSkillFeedbackPackage({
    generatedAt, since: "2026-07-01T00:00:00.000Z", until: generatedAt.toISOString(),
    decisions: [current], events: [feedback], authorizations: [authorization], sourceTotal: 1, truncated: false,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.files), ["data/decisions.jsonl", "data/events.jsonl", "data/summary.json", "README.md"]);
  assert.match(first.files["README.md"]!, /错误.*1/s);
  assert.match(first.files["data/summary.json"]!, /"correctionRate":1/);
  assert.ok(Object.values(first.files).every((content) => !content.includes("super-secret") && !content.includes("private-token")));
  assert.ok(first.manifest.redactionCount >= 2);
});

test("Review Evidence Package deduplicates by source identity, not equal text, and records drift, missing, and truncation", () => {
  const firstDecision = decision("block-a");
  const secondDecision = decision("block-b");
  const signalA = createOrRefreshAgentReviewSignal(undefined, {
    graphId: "graph-export", sourceRoot: firstDecision.sourceRoot, capturedSnapshotHash: "c".repeat(8),
    capturedText: "相同的一段弱信号", category: "MONITORING", relatedObjectIds: ["object-a"],
    revisitReason: "可能需要复盘", createdByDecisionId: firstDecision.decisionId,
  }, new Date("2026-07-10T08:00:00.000Z"));
  const refreshedA = createOrRefreshAgentReviewSignal(signalA, {
    graphId: "graph-export", sourceRoot: firstDecision.sourceRoot, capturedSnapshotHash: "d".repeat(8),
    capturedText: "相同的一段弱信号", category: "MONITORING", relatedObjectIds: ["object-a"],
    revisitReason: "再次出现", createdByDecisionId: firstDecision.decisionId,
  }, new Date("2026-07-11T08:00:00.000Z"));
  const signalB = createOrRefreshAgentReviewSignal(undefined, {
    graphId: "graph-export", sourceRoot: secondDecision.sourceRoot, capturedSnapshotHash: "e".repeat(8),
    capturedText: "相同的一段弱信号", category: "MONITORING", relatedObjectIds: [],
    revisitReason: "另一来源", createdByDecisionId: secondDecision.decisionId,
  }, new Date("2026-07-12T08:00:00.000Z"));

  const exported = buildAgentReviewEvidencePackage({
    generatedAt, days: 60, signals: [signalA, refreshedA, signalB], decisions: [firstDecision, secondDecision], events: [],
    currentSources: [
      { graphId: "graph-export", sourceRoot: firstDecision.sourceRoot, status: "FOUND", currentText: "当前内容已变化", currentSnapshotHash: "f".repeat(8), truncated: true },
      { graphId: "graph-export", sourceRoot: secondDecision.sourceRoot, status: "MISSING" },
    ], sourceTotal: 3, truncated: true,
  });

  const evidence = JSON.parse(exported.files["data/evidence.json"]!) as { evidence: Array<{ evidenceId: string; sourceStatus: string; changedSinceCapture: boolean; truncated: boolean }> };
  assert.equal(evidence.evidence.length, 2, "same source is deduplicated while equal text from another source remains distinct");
  assert.equal(new Set(evidence.evidence.map(({ evidenceId }) => evidenceId)).size, 2);
  assert.ok(evidence.evidence.some((item) => item.sourceStatus === "MISSING"));
  assert.ok(evidence.evidence.some((item) => item.changedSinceCapture && item.truncated));
  assert.match(exported.files["README.md"]!, /来源缺失：1/);
  assert.equal(exported.manifest.truncated, true);
});
