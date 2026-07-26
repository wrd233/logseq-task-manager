import assert from "node:assert/strict";
import test from "node:test";

import type { StructuredProposalProvider } from "../src/llm-proposal.ts";
import {
  LocalLlmCrossObjectObservationGenerator,
  assembleCrossObjectObservationPrompt,
  assertCrossObjectObservationContextCurrent,
  type CrossObjectObservationContextPackage,
} from "../src/cross-object-observation-provider.ts";

const observedAt = "2026-07-26T12:00:00.000Z";

function context(): CrossObjectObservationContextPackage {
  return {
    schemaVersion: "task-copilot-cross-object-context-v1",
    observedAt,
    scope: { kind: "PROJECT", rootRef: "object:project-release@v3" },
    objects: [{
      ref: "object:project-release@v3",
      objectType: "PROJECT",
      lifecycle: "OPEN",
      condition: "ACTIONABLE",
      summary: "发布准备项目，当前需要归拢相同交付物下的执行任务。",
    }, {
      ref: "object:task-checklist@v2",
      objectType: "TASK",
      lifecycle: "OPEN",
      condition: "ACTIONABLE",
      summary: "整理上线核对清单。",
    }, {
      ref: "object:task-rollback@v4",
      objectType: "TASK",
      lifecycle: "OPEN",
      condition: "ACTIONABLE",
      summary: "验证回退核对清单。",
    }],
    evidenceFacts: [{
      key: "fact-shared-deliverable-a",
      factCode: "SHARED_DELIVERABLE",
      sourceRef: "object:task-checklist@v2",
      observedAt,
      fingerprint: "aaaaaaaa",
      statement: "任务指向同一份发布核对清单。",
    }, {
      key: "fact-shared-deliverable-b",
      factCode: "SHARED_DELIVERABLE",
      sourceRef: "object:task-rollback@v4",
      observedAt,
      fingerprint: "bbbbbbbb",
      statement: "任务指向同一份发布核对清单。",
    }, {
      key: "fact-owner-missing-a",
      factCode: "PRIMARY_OWNER_MISSING",
      sourceRef: "object:task-checklist@v2",
      observedAt,
      fingerprint: "cccccccc",
      statement: "当前没有正式 Primary Owner。",
    }],
  };
}

function provider(value: unknown): StructuredProposalProvider & { requests: Array<{ system: string; user: string }> } {
  return {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    requests: [],
    async completeStructured(request) {
      this.requests.push({ system: request.system, user: request.user });
      return {
        value,
        metadata: {
          requestId: "req-cross-object",
          model: "deepseek-v4-flash",
          durationMs: 123,
          attempts: 1,
          promptTokens: 100,
          completionTokens: 40,
          totalTokens: 140,
        },
      };
    },
  };
}

test("cross-object Provider maps only machine-known refs and evidence into a shadow draft", async () => {
  const mock = provider({
    decision: "OBSERVATIONS",
    observations: [{
      kind: "TASK_CLUSTER_CANDIDATE",
      subjectRefs: ["object:project-release@v3", "object:task-checklist@v2", "object:task-rollback@v4"],
      primarySubjectRef: "object:task-checklist@v2",
      evidenceKeys: ["fact-shared-deliverable-a", "fact-shared-deliverable-b"],
    }],
  });

  const result = await new LocalLlmCrossObjectObservationGenerator(mock).generate(context());

  assert.equal(result.decision, "OBSERVATIONS");
  assert.equal(result.drafts.length, 1);
  assert.deepEqual(result.drafts[0], {
    kind: "TASK_CLUSTER_CANDIDATE",
    subjectRefs: ["object:project-release@v3", "object:task-checklist@v2", "object:task-rollback@v4"],
    scope: { kind: "PROJECT", rootRef: "object:project-release@v3" },
    primaryObjectId: "task-checklist",
    evidenceFacts: [{
      factCode: "SHARED_DELIVERABLE",
      sourceRef: "object:task-checklist@v2",
      observedAt,
      fingerprint: "aaaaaaaa",
    }, {
      factCode: "SHARED_DELIVERABLE",
      sourceRef: "object:task-rollback@v4",
      observedAt,
      fingerprint: "bbbbbbbb",
    }],
    confidence: "MEDIUM",
    provenance: {
      skill: { id: "cross-object-observation-candidate", version: "0.1.0-experimental" },
      prompt: { id: "cross-object-observation-shadow", version: "0.1.0" },
      model: { provider: "deepseek", id: "deepseek-v4-flash", version: "chat-completions-v1" },
    },
  });
  assert.equal(result.provider.requestId, "req-cross-object");
});

test("cross-object Provider accepts an exact NO_OBSERVATION and keeps it zero-write", async () => {
  const mock = provider({ decision: "NO_OBSERVATION", observations: [] });

  const result = await new LocalLlmCrossObjectObservationGenerator(mock).generate(context());

  assert.equal(result.decision, "NO_OBSERVATION");
  assert.deepEqual(result.drafts, []);
  assert.equal(result.graphWrites, 0);
  assert.equal(result.formalStoreWrites, 0);
});

test("cross-object Provider rejects invented refs, evidence and prose before shadow materialization", async () => {
  const inventedRef = provider({
    decision: "OBSERVATIONS",
    observations: [{
      kind: "ASSOCIATION_CANDIDATE",
      subjectRefs: ["object:project-release@v3", "object:task-checklist@v2", "object:invented@v1"],
      evidenceKeys: ["fact-shared-deliverable-a", "fact-shared-deliverable-b"],
    }],
  });
  await assert.rejects(
    () => new LocalLlmCrossObjectObservationGenerator(inventedRef).generate(context()),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "LLM_CROSS_OBJECT_SCOPE_INVALID",
  );

  const inventedEvidence = provider({
    decision: "OBSERVATIONS",
    observations: [{
      kind: "ASSOCIATION_CANDIDATE",
      subjectRefs: ["object:project-release@v3", "object:task-checklist@v2", "object:task-rollback@v4"],
      evidenceKeys: ["fact-shared-deliverable-a", "fact-invented"],
    }],
  });
  await assert.rejects(
    () => new LocalLlmCrossObjectObservationGenerator(inventedEvidence).generate(context()),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "LLM_CROSS_OBJECT_EVIDENCE_KEY_INVALID",
  );

  const prose = provider({
    decision: "NO_OBSERVATION",
    observations: [],
    reasoning: "模型自由推理不得进入受控结果。",
  });
  await assert.rejects(
    () => new LocalLlmCrossObjectObservationGenerator(prose).generate(context()),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "LLM_CROSS_OBJECT_TOP_LEVEL_FIELDS_INVALID",
  );
});

test("cross-object prompt exposes a bounded no-write contract without leaking evaluator expectations", () => {
  const prompt = assembleCrossObjectObservationPrompt(context());
  const serialized = JSON.stringify(prompt);

  assert.match(prompt.system, /NO_OBSERVATION/);
  assert.match(prompt.system, /不得.*Ownership|Ownership.*不得/);
  assert.match(prompt.system, /不得.*Focus|Focus.*不得/);
  assert.match(prompt.system, /禁止输出解释|不得输出解释/);
  assert.match(prompt.user, /fact-shared-deliverable-a/);
  assert.doesNotMatch(serialized, /expected|正确答案|应当输出|golden/i);
  assert.ok(prompt.promptVersion.length >= 8);
});

test("cross-object context fingerprint survives timestamp refresh but rejects semantic or evidence changes", async () => {
  const result = await new LocalLlmCrossObjectObservationGenerator(
    provider({ decision: "NO_OBSERVATION", observations: [] }),
  ).generate(context());
  const refreshedAt = "2026-07-26T12:05:00.000Z";
  const refreshed: CrossObjectObservationContextPackage = {
    ...context(),
    observedAt: refreshedAt,
    evidenceFacts: context().evidenceFacts.map((fact) => ({ ...fact, observedAt: refreshedAt })),
  };

  assert.equal(
    assertCrossObjectObservationContextCurrent(result.contextFingerprint, refreshed),
    result.contextFingerprint,
  );

  const changedSummary: CrossObjectObservationContextPackage = {
    ...refreshed,
    objects: refreshed.objects.map((object, index) => index === 1
      ? { ...object, summary: "整理已经改为另一份上线核对材料。" }
      : object),
  };
  assert.throws(
    () => assertCrossObjectObservationContextCurrent(result.contextFingerprint, changedSummary),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "LLM_CROSS_OBJECT_CONTEXT_STALE",
  );

  const changedEvidence: CrossObjectObservationContextPackage = {
    ...refreshed,
    evidenceFacts: refreshed.evidenceFacts.map((fact, index) => index === 0
      ? { ...fact, fingerprint: "ffffffff" }
      : fact),
  };
  assert.throws(
    () => assertCrossObjectObservationContextCurrent(result.contextFingerprint, changedEvidence),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "LLM_CROSS_OBJECT_CONTEXT_STALE",
  );
});
