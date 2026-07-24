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
