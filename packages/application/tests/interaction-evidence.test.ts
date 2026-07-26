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

test("session handles bind reversible disposition without entering evidence exports", () => {
  const log = new InteractionEvidenceBuffer(1);
  const handle = "uxi_1234567890abcdef";
  log.recordWithHandle({
    timestamp: "2026-07-24T08:00:00.000Z",
    scene: "CONTEXT_RECOVERY",
    outcome: "GENERATED",
    skill: { name: "recover-context", version: "1.1.0" },
    promptVersion: "9537e029",
    model: "deepseek-v4-flash",
  }, handle);
  assert.equal(log.setDisposition(handle, "HELPFUL")?.userDisposition, "HELPFUL");
  assert.equal(log.summary().helpfulRate, 1);
  assert.equal(log.setDisposition(handle, "TOO_MUCH")?.userDisposition, "TOO_MUCH");
  assert.equal(log.summary().noiseRate, 1);
  assert.equal(log.isSuppressed({
    scene: "CONTEXT_RECOVERY",
    skill: { name: "recover-context", version: "1.1.0" },
  }), false);
  assert.equal(log.setDisposition(handle, "DO_NOT_REPEAT")?.userDisposition, "DO_NOT_REPEAT");
  assert.equal(log.isSuppressed({
    scene: "CONTEXT_RECOVERY",
    skill: { name: "recover-context", version: "1.1.0" },
  }), true);
  assert.equal(log.setDisposition(handle)?.userDisposition, undefined);
  assert.equal(log.summary().rated, 0);
  assert.equal(log.isSuppressed({
    scene: "CONTEXT_RECOVERY",
    skill: { name: "recover-context", version: "1.1.0" },
  }), false, "withdrawing the disposition immediately re-enables the same prompt");
  assert.equal(log.setOutcome(handle, "STALE", "V2_OBJECT_VERSION_CONFLICT")?.outcome, "STALE");
  assert.equal(log.summary().outcomes.GENERATED, 0);
  assert.equal(log.summary().outcomes.STALE, 1);
  assert.match(log.exportJsonl(), /V2_OBJECT_VERSION_CONFLICT/);
  assert.doesNotMatch(log.exportJsonl(), /uxi_|1234567890abcdef/);

  log.record({ timestamp: "2026-07-24T08:01:00.000Z", scene: "SYSTEM", outcome: "GENERATED" });
  assert.equal(log.setDisposition(handle, "HELPFUL"), undefined, "evicted handles cannot rate another entry");
  assert.throws(() => log.recordWithHandle({ timestamp: "2026-07-24T08:02:00.000Z", scene: "SYSTEM", outcome: "GENERATED" }, "bad"), /handle/);
});
