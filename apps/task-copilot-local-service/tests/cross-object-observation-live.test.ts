import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSanitizedCrossObjectGoldenCases,
  runCrossObjectObservationLiveGate,
} from "../src/cross-object-observation-live.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

function provider(outputs: unknown[]): StructuredProposalProvider & { calls: number } {
  return {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    calls: 0,
    async completeStructured() {
      const value = outputs[this.calls];
      this.calls += 1;
      return {
        value,
        metadata: {
          model: "deepseek-v4-flash",
          durationMs: 50,
          attempts: 1,
          promptTokens: 80,
          completionTokens: 20,
          totalTokens: 100,
        },
      };
    },
  };
}

test("cross-object live gate is opt-in and resolves no Provider call by default", async () => {
  const mock = provider([]);

  await assert.rejects(
    () => runCrossObjectObservationLiveGate({}, mock),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "LLM_CROSS_OBJECT_LIVE_GATE_DISABLED",
  );
  assert.equal(mock.calls, 0);
});

test("cross-object golden contexts are fixed, bounded and carry no evaluator answers", () => {
  const cases = buildSanitizedCrossObjectGoldenCases();

  assert.equal(cases.length, 5);
  assert.deepEqual(cases.map(({ id }) => id), [
    "task-cluster",
    "legacy-handoff",
    "interface-stale",
    "unrelated-work",
    "ownership-conflict",
  ]);
  for (const item of cases) {
    assert.ok(item.context.objects.length >= 2 && item.context.objects.length <= 8);
    assert.ok(item.context.evidenceFacts.length >= 2 && item.context.evidenceFacts.length <= 16);
    const serializedContext = JSON.stringify(item.context);
    assert.doesNotMatch(serializedContext, /expected|golden|正确答案|应当输出/i);
  }
});

test("cross-object live evaluator accepts three grounded observations and two deliberate abstentions", async () => {
  const mock = provider([
    {
      decision: "OBSERVATIONS",
      observations: [{
        kind: "TASK_CLUSTER_CANDIDATE",
        subjectRefs: ["object:project-release@v3", "object:task-checklist@v2", "object:task-rollback@v4"],
        primarySubjectRef: "object:task-checklist@v2",
        evidenceKeys: ["cluster-shared-a", "cluster-shared-b"],
      }],
    },
    {
      decision: "OBSERVATIONS",
      observations: [{
        kind: "LEGACY_HANDOFF_CANDIDATE",
        subjectRefs: ["object:project-archive@v8", "object:task-followup@v2"],
        primarySubjectRef: "object:task-followup@v2",
        evidenceKeys: ["legacy-project-completed", "legacy-task-open"],
      }],
    },
    {
      decision: "OBSERVATIONS",
      observations: [{
        kind: "PROJECT_INTERFACE_STALE_CANDIDATE",
        subjectRefs: ["object:project-migration@v5", "object:output-cutover@v3"],
        primarySubjectRef: "object:project-migration@v5",
        evidenceKeys: ["interface-older", "interface-contradicted"],
      }],
    },
    { decision: "NO_OBSERVATION", observations: [] },
    { decision: "NO_OBSERVATION", observations: [] },
  ]);

  const report = await runCrossObjectObservationLiveGate(
    { RUN_LIVE_LLM_CROSS_OBJECT_TESTS: "1" },
    mock,
  );

  assert.equal(mock.calls, 5);
  assert.deepEqual(report.cases, [
    { id: "task-cluster", decision: "OBSERVATIONS", kind: "TASK_CLUSTER_CANDIDATE" },
    { id: "legacy-handoff", decision: "OBSERVATIONS", kind: "LEGACY_HANDOFF_CANDIDATE" },
    { id: "interface-stale", decision: "OBSERVATIONS", kind: "PROJECT_INTERFACE_STALE_CANDIDATE" },
    { id: "unrelated-work", decision: "NO_OBSERVATION" },
    { id: "ownership-conflict", decision: "NO_OBSERVATION" },
  ]);
  assert.equal(report.status, "PIPELINE_PASS");
  assert.equal(report.caseCount, 5);
  assert.equal(report.observationCount, 3);
  assert.equal(report.abstentionCount, 2);
  assert.equal(report.graphWrites, 0);
  assert.equal(report.formalStoreWrites, 0);
  assert.doesNotMatch(JSON.stringify(report), /summary|statement|object:|API_KEY|raw/i);
});

test("cross-object live evaluator rejects a noisy observation where abstention is required", async () => {
  const outputs = [
    {
      decision: "OBSERVATIONS",
      observations: [{
        kind: "TASK_CLUSTER_CANDIDATE",
        subjectRefs: ["object:project-release@v3", "object:task-checklist@v2", "object:task-rollback@v4"],
        evidenceKeys: ["cluster-shared-a", "cluster-shared-b"],
      }],
    },
    {
      decision: "OBSERVATIONS",
      observations: [{
        kind: "LEGACY_HANDOFF_CANDIDATE",
        subjectRefs: ["object:project-archive@v8", "object:task-followup@v2"],
        evidenceKeys: ["legacy-project-completed", "legacy-task-open"],
      }],
    },
    {
      decision: "OBSERVATIONS",
      observations: [{
        kind: "PROJECT_INTERFACE_STALE_CANDIDATE",
        subjectRefs: ["object:project-migration@v5", "object:output-cutover@v3"],
        evidenceKeys: ["interface-older", "interface-contradicted"],
      }],
    },
    {
      decision: "OBSERVATIONS",
      observations: [{
        kind: "ASSOCIATION_CANDIDATE",
        subjectRefs: ["object:project-a@v2", "object:task-a@v1", "object:task-b@v1"],
        evidenceKeys: ["unrelated-term-a", "unrelated-term-b"],
      }],
    },
  ];

  await assert.rejects(
    () => runCrossObjectObservationLiveGate(
      { RUN_LIVE_LLM_CROSS_OBJECT_TESTS: "1" },
      provider(outputs),
    ),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "LLM_CROSS_OBJECT_LIVE_UNRELATED_WORK_UNEXPECTED",
  );
});
