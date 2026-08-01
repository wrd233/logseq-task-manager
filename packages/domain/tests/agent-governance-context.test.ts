import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentDecisionContext } from "../src/agent-governance-context.ts";

test("LOCAL context preserves required evidence and records deterministic optional truncation", () => {
  const result = buildAgentDecisionContext({
    tier: "LOCAL",
    tokenBudget: 120,
    sections: [
      { id: "source", kind: "SOURCE_ROOT", content: "[Task] ship", estimatedTokens: 30, required: true, relevance: 100 },
      { id: "rule", kind: "SKILL_RULE", content: "explicit task rule", estimatedTokens: 30, required: true, relevance: 100 },
      { id: "facts", kind: "FORMAL_FACTS", content: "no matching object", estimatedTokens: 30, required: true, relevance: 90 },
      { id: "parent", kind: "PARENT_CHAIN", content: "parent", estimatedTokens: 20, required: false, relevance: 80 },
      { id: "old", kind: "RELATED_DECISIONS", content: "old decision", estimatedTokens: 20, required: false, relevance: 20 },
    ],
  });

  assert.deepEqual(result.sections.map(({ id }) => id), ["source", "rule", "facts", "parent"]);
  assert.equal(result.estimatedInputTokens, 110);
  assert.equal(result.contextTruncated, true);
  assert.deepEqual(result.omittedSections, ["old"]);
  assert.deepEqual(result.requiredEvidenceOmitted, []);
});

test("required evidence omitted by budget is explicit and exact duplicate content is removed", () => {
  const result = buildAgentDecisionContext({
    tier: "EXPANDED",
    tokenBudget: 80,
    sections: [
      { id: "source", kind: "SOURCE_ROOT", content: "source text", estimatedTokens: 30, required: true, relevance: 100 },
      { id: "source-copy", kind: "PAGE_CONTEXT", content: "source text", estimatedTokens: 30, required: false, relevance: 50 },
      { id: "rule", kind: "SKILL_RULE", content: "rule", estimatedTokens: 30, required: true, relevance: 100 },
      { id: "counter", kind: "COUNTER_SIGNALS", content: "possible duplicate", estimatedTokens: 30, required: true, relevance: 100 },
    ],
  });

  assert.deepEqual(result.sections.map(({ id }) => id), ["source", "rule"]);
  assert.deepEqual(result.omittedSections, ["counter", "source-copy"]);
  assert.deepEqual(result.requiredEvidenceOmitted, ["counter"]);
  assert.equal(result.contextTruncated, true);
  assert.equal(result.deduplicatedSectionCount, 1);
});

test("context budgets and Source Root presence are bounded", () => {
  assert.throws(() => buildAgentDecisionContext({ tier: "LOCAL", tokenBudget: 20, sections: [] }), /Source Root/);
  assert.throws(() => buildAgentDecisionContext({
    tier: "LOCAL",
    tokenBudget: 20,
    sections: [{ id: "source", kind: "SOURCE_ROOT", content: "source", estimatedTokens: 30, required: true, relevance: 1 }],
  }), /Source Root.*budget/);
});
