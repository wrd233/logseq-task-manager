import assert from "node:assert/strict";
import test from "node:test";

import { materializeUnifiedUxOutput, type UnifiedUxOutputAuthority } from "../src/unified-ux-output.ts";

const authority: UnifiedUxOutputAuthority = {
  observedAt: "2026-07-24T05:00:00.000Z",
  contractVersion: "1.0.0",
  promptVersion: "context-recovery-prompt@1.0.0",
  skill: { name: "recover-context", version: "1.0.0" },
  provider: {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    model: "actual-model",
  },
  minimumRiskLevel: "NONE",
  requiresDiscussion: false,
  requiresReview: false,
  facts: [{
    factId: "project-condition",
    text: "正在等待厂家补充功耗参数",
    sourceRefs: ["object:project-1@v4"],
  }],
  allowedNextActions: [{
    actionId: "open-project",
    intent: "OPEN_SOURCE",
    label: "打开项目原文",
    targetRef: "anchor:project-page",
    evidenceRefs: ["object:project-1@v4", "anchor:project-page"],
  }],
};

test("unified UX output resolves machine facts and actions while replacing model provenance", () => {
  const output = materializeUnifiedUxOutput({
    schemaVersion: "task-copilot-ux-output-v1",
    factRefs: ["project-condition"],
    inferences: [],
    unknowns: ["参数到达时间尚不明确"],
    summary: "项目正在等待关键参数，当前可先回到原文查看已有测算。",
    suggestedChanges: [],
    nextActionEligible: true,
    nextActionId: "open-project",
    riskLevel: "NONE",
    requiresDiscussion: false,
    requiresReview: false,
    provenance: {
      model: "spoofed-model",
      skillVersion: "spoofed-skill",
    },
  }, authority);

  assert.deepEqual(output.facts, [{
    text: "正在等待厂家补充功耗参数",
    sourceRefs: ["object:project-1@v4"],
  }]);
  assert.deepEqual(output.nextAction, {
    intent: "OPEN_SOURCE",
    label: "打开项目原文",
    targetRef: "anchor:project-page",
  });
  assert.deepEqual(output.provenance, {
    kind: "LLM_DRAFT",
    contractVersion: "1.0.0",
    promptVersion: "context-recovery-prompt@1.0.0",
    skillName: "recover-context",
    skillVersion: "1.0.0",
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    model: "actual-model",
    generatedAt: "2026-07-24T05:00:00.000Z",
  });
  assert.match(output.evidenceScope.scopeHash, /^[0-9a-f]{8}$/);
});

test("unified UX output rejects inference evidence outside the machine-owned scope", () => {
  assert.throws(
    () => materializeUnifiedUxOutput({
      schemaVersion: "task-copilot-ux-output-v1",
      factRefs: ["project-condition"],
      inferences: [{
        text: "可能需要重新测算",
        evidenceRefs: ["object:outside-scope@v1"],
      }],
      unknowns: [],
      summary: "项目可能需要重新测算。",
      suggestedChanges: [],
      nextActionEligible: false,
      riskLevel: "NONE",
      requiresDiscussion: false,
      requiresReview: false,
    }, authority),
    /outside the machine-owned evidence scope/,
  );
});

test("unified UX output cannot lower machine-owned risk or review requirements", () => {
  const output = materializeUnifiedUxOutput({
    schemaVersion: "task-copilot-ux-output-v1",
    factRefs: ["project-condition"],
    inferences: [],
    unknowns: [],
    summary: "这是一个需要讨论和审阅的高影响变化。",
    suggestedChanges: [],
    nextActionEligible: false,
    riskLevel: "NONE",
    requiresDiscussion: false,
    requiresReview: false,
  }, {
    ...authority,
    minimumRiskLevel: "HIGH",
    requiresDiscussion: true,
    requiresReview: true,
  });

  assert.equal(output.riskLevel, "HIGH");
  assert.equal(output.requiresDiscussion, true);
  assert.equal(output.requiresReview, true);
});

test("unified UX output rejects unbounded model text before materialization", () => {
  assert.throws(
    () => materializeUnifiedUxOutput({
      schemaVersion: "task-copilot-ux-output-v1",
      factRefs: ["project-condition"],
      inferences: [],
      unknowns: [],
      summary: "x".repeat(401),
      suggestedChanges: [],
      nextActionEligible: false,
      riskLevel: "NONE",
      requiresDiscussion: false,
      requiresReview: false,
    }, authority),
    /summary.*400 characters/,
  );
});

test("unified UX output rejects machine identities in frontstage prose", () => {
  assert.throws(
    () => materializeUnifiedUxOutput({
      schemaVersion: "task-copilot-ux-output-v1",
      factRefs: ["project-condition"],
      inferences: [],
      unknowns: [],
      summary: "请回到 object:project-1@v4 继续处理。",
      suggestedChanges: [],
      nextActionEligible: false,
      riskLevel: "NONE",
      requiresDiscussion: false,
      requiresReview: false,
    }, authority),
    /machine identity.*user-visible prose/i,
  );
});

test("unified UX output rejects ambiguous machine fact and action identities", () => {
  const duplicateFacts = {
    ...authority,
    facts: [...authority.facts, { ...authority.facts[0]!, text: "冲突事实" }],
  };
  assert.throws(
    () => materializeUnifiedUxOutput({
      schemaVersion: "task-copilot-ux-output-v1",
      factRefs: ["project-condition"],
      inferences: [],
      unknowns: [],
      summary: "不能从歧义事实生成叙述。",
      suggestedChanges: [],
      nextActionEligible: false,
      riskLevel: "NONE",
      requiresDiscussion: false,
      requiresReview: false,
    }, duplicateFacts),
    /duplicate machine fact identity/,
  );

  const duplicateActions = {
    ...authority,
    allowedNextActions: [...authority.allowedNextActions, { ...authority.allowedNextActions[0]!, label: "冲突动作" }],
  };
  assert.throws(
    () => materializeUnifiedUxOutput({
      schemaVersion: "task-copilot-ux-output-v1",
      factRefs: [],
      inferences: [],
      unknowns: [],
      summary: "不能从歧义动作生成入口。",
      suggestedChanges: [],
      nextActionEligible: true,
      nextActionId: "open-project",
      riskLevel: "NONE",
      requiresDiscussion: false,
      requiresReview: false,
    }, duplicateActions),
    /duplicate machine action identity/,
  );
});

test("unified UX output rejects invalid machine provenance instead of emitting an unverifiable draft", () => {
  assert.throws(
    () => materializeUnifiedUxOutput({
      schemaVersion: "task-copilot-ux-output-v1",
      factRefs: [],
      inferences: [],
      unknowns: ["当前证据不足"],
      summary: "当前证据不足以形成重入摘要。",
      suggestedChanges: [],
      nextActionEligible: false,
      riskLevel: "NONE",
      requiresDiscussion: false,
      requiresReview: false,
    }, {
      ...authority,
      observedAt: "not-a-time",
      provider: { ...authority.provider, model: "" },
    }),
    /machine provenance is invalid/,
  );
});

test("unified UX output rejects an unknown action even when the model marks it ineligible", () => {
  assert.throws(
    () => materializeUnifiedUxOutput({
      schemaVersion: "task-copilot-ux-output-v1",
      factRefs: [],
      inferences: [],
      unknowns: [],
      summary: "没有可执行动作。",
      suggestedChanges: [],
      nextActionEligible: false,
      nextActionId: "commit-without-review",
      riskLevel: "NONE",
      requiresDiscussion: false,
      requiresReview: false,
    }, authority),
    /unknown next action/,
  );
});

test("a suggested change remains a review-only Proposal draft and raises the effective risk", () => {
  const output = materializeUnifiedUxOutput({
    schemaVersion: "task-copilot-ux-output-v1",
    factRefs: ["project-condition"],
    inferences: [],
    unknowns: [],
    summary: "当前接口可能需要在参数到达后更新。",
    suggestedChanges: [{
      kind: "DRAFT_PROPOSAL",
      summary: "参数到达后重新起草当前接口",
      evidenceRefs: ["object:project-1@v4"],
      riskLevel: "MEDIUM",
    }],
    nextActionEligible: false,
    riskLevel: "NONE",
    requiresDiscussion: false,
    requiresReview: false,
  }, authority);

  assert.equal(output.riskLevel, "MEDIUM");
  assert.equal(output.requiresReview, true);
  assert.deepEqual(output.suggestedChanges, [{
    kind: "DRAFT_PROPOSAL",
    summary: "参数到达后重新起草当前接口",
    evidenceRefs: ["object:project-1@v4"],
    riskLevel: "MEDIUM",
  }]);
  assert.equal("semanticOperations" in output.suggestedChanges[0]!, false);
});
