import assert from "node:assert/strict";
import test from "node:test";

import { InteractionEvidenceBuffer } from "../src/interaction-evidence.ts";

test("interaction evidence is bounded, versioned, and structurally unable to store private text", () => {
  const log = new InteractionEvidenceBuffer(2);
  log.record({
    timestamp: "2026-07-24T07:00:00.000Z",
    scene: "CONTEXT_RECOVERY",
    outcome: "GENERATED",
    objectType: "PROJECT",
    skill: { name: "recover-context", version: "1.0.0" },
    promptVersion: "8d941d5b",
    model: "deepseek-chat",
    evidence: {
      scopeHash: "8d941d5b",
      factCount: 1,
      inferenceCount: 0,
      unknownCount: 1,
      suggestedChangeCount: 0,
      evidenceRefCount: 2,
      nextActionEligible: false,
    },
    elapsedMs: 40,
  });
  log.record({
    timestamp: "2026-07-24T07:01:00.000Z",
    scene: "PROPOSAL_REVIEW",
    outcome: "DISMISSED",
    userDisposition: "NOT_NEEDED",
  });
  log.record({
    timestamp: "2026-07-24T07:02:00.000Z",
    scene: "PROPOSAL_REVIEW",
    outcome: "STALE",
  });

  assert.equal(log.snapshot().length, 2);
  assert.equal(log.snapshot()[0]?.outcome, "DISMISSED");
  assert.doesNotMatch(log.exportJsonl(), /private body|summary|content|objectId|blockUuid/);
  assert.throws(
    () => log.record({
      timestamp: "2026-07-24T07:03:00.000Z",
      scene: "CONTEXT_RECOVERY",
      outcome: "ERROR",
      summary: "private body",
    }),
    /unsupported field summary/,
  );
});

test("interaction evidence summarizes versioned helpfulness and noise without object or text data", () => {
  const log = new InteractionEvidenceBuffer();
  const version = {
    skill: { name: "recover-context", version: "1.0.0" },
    promptVersion: "8d941d5b",
    model: "deepseek-chat",
  };
  log.record({
    timestamp: "2026-07-24T07:00:00.000Z",
    scene: "CONTEXT_RECOVERY",
    outcome: "GENERATED",
    ...version,
    userDisposition: "HELPFUL",
  });
  log.record({
    timestamp: "2026-07-24T07:01:00.000Z",
    scene: "CONTEXT_RECOVERY",
    outcome: "DISMISSED",
    ...version,
    userDisposition: "NOT_NEEDED",
  });
  log.record({
    timestamp: "2026-07-24T07:02:00.000Z",
    scene: "CONTEXT_RECOVERY",
    outcome: "ERROR",
    skill: { name: "recover-context", version: "1.1.0" },
    promptVersion: "91ac32e1",
  });

  const summary = log.summary();
  assert.equal(summary.total, 3);
  assert.equal(summary.outcomes.GENERATED, 1);
  assert.equal(summary.outcomes.DISMISSED, 1);
  assert.equal(summary.outcomes.ERROR, 1);
  assert.equal(summary.rated, 2);
  assert.equal(summary.helpfulRate, 0.5);
  assert.equal(summary.noiseRate, 0.5);
  assert.deepEqual(summary.versions, [{
    versionKey: "recover-context@1.0.0|prompt:8d941d5b|model:deepseek-chat",
    total: 2,
    generated: 1,
    rejected: 0,
    errors: 0,
    rated: 2,
    helpful: 1,
    noise: 1,
    doNotRepeat: 0,
    helpfulRate: 0.5,
    noiseRate: 0.5,
  }, {
    versionKey: "recover-context@1.1.0|prompt:91ac32e1|model:none",
    total: 1,
    generated: 0,
    rejected: 0,
    errors: 1,
    rated: 0,
    helpful: 0,
    noise: 0,
    doNotRepeat: 0,
    helpfulRate: null,
    noiseRate: null,
  }]);
  assert.doesNotMatch(JSON.stringify(summary), /objectId|blockUuid|summary|content/);
});
