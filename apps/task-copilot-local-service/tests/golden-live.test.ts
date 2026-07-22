import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checksum, type StructuredError } from "@task-copilot/shared";

import { buildGoldenPrompt, buildGoldenSchedule, evaluateGoldenResult, runDeepSeekGoldenSuite, summarizeGoldenFailureShape, type GoldenCase } from "../src/golden-live.ts";
import type { StructuredProposalProvider } from "../src/llm-proposal.ts";

const cases = JSON.parse(readFileSync(new URL("./fixtures/deepseek-golden-cases.json", import.meta.url), "utf8")) as GoldenCase[];

function validProposal(item: GoldenCase): Record<string, unknown> {
  if (item.expected === "NO_PROPOSAL") return { decision: "NO_PROPOSAL", reason: "没有足够证据形成正式建议。" };
  const target = { kind: "BLOCK", id: `golden-${item.id}`, version: 1 };
  const objectType = new Map([
    ["DS-01", "TASK"], ["DS-03", "MINI_PROJECT"], ["DS-05", "DECISION"], ["DS-06", "OUTPUT"], ["DS-08", "TASK"], ["DS-09", "TASK"], ["DS-10", "TASK"], ["DS-11", "TASK"], ["DS-12", "TASK"],
  ]).get(item.id) ?? "TASK";
  const prefix = new Map([["TASK", "[任务] "], ["MINI_PROJECT", "[MiniProject] "], ["DECISION", "[决策] "], ["OUTPUT", "[成果] "]]).get(objectType) ?? "";
  const afterText = item.id === "DS-08" ? "[任务] 周三前发给值班同事。" : `${prefix}${item.input}`;
  const readTargets = item.id === "DS-04" ? [target, { kind: "OBJECT", id: "project-alert-governance", version: 3 }] : [target];
  return {
    title: "有界正式化建议",
    context: item.input,
    understanding: "保留原事实。",
    objective: "形成一个可审阅对象。",
    logic: "只处理当前 Block。",
    finalPreview: afterText,
    unresolvedQuestions: item.id === "DS-06" ? ["由谁产出该成果？"] : [],
    scope: { read: readTargets, modify: [target] },
    preconditions: ["Block 未变化"],
    groups: [{
      groupId: "formalize", explanation: "正式化当前 Block", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [],
      textPatches: [{ blockUuid: target.id, beforeText: item.input, afterText, beforeHash: checksum(item.input), afterHash: checksum(afterText) }],
      semanticOperations: [{ operationId: "create-object", kind: "CREATE_OBJECT", target, summary: "创建对象", payload: { objectType, text: afterText }, preconditions: ["Block 未变化"] }],
      disposition: "PENDING",
    }],
  };
}

test("golden schedule fixes 12 first-pass cases and three repetitions for the five core cases", () => {
  const schedule = buildGoldenSchedule(cases);
  assert.equal(schedule.length, 22);
  assert.deepEqual(schedule.slice(0, 12).map((item) => item.caseId), cases.map((item) => item.id));
  for (const id of ["DS-01", "DS-03", "DS-04", "DS-07", "DS-12"]) {
    assert.deepEqual(schedule.filter((item) => item.caseId === id).map((item) => item.repetition), [1, 2, 3]);
  }
});

test("golden prompt has an exact modify target, no answer labels, and forbids authority and duplicate Project operations", () => {
  const prompt = buildGoldenPrompt({ ...cases[3]!, input: "已知 Project：告警治理。今天确认其中的外部推送清单还缺两个系统。" });
  assert.match(prompt.domain.content, /不得创建 AREA\/PROJECT/);
  assert.match(prompt.domain.content, /不得确认 Primary Ownership/);
  assert.match(prompt.domain.content, /绝不自动确认 Ownership/);
  assert.match(prompt.runtimeContext.content, /project-alert-governance/);
  assert.match(prompt.runtimeContext.content, /requiredSemanticOperationShape/);
  assert.match(prompt.runtimeContext.content, /operationId/);
  assert.match(prompt.runtimeContext.content, /blockUuid/);
  assert.doesNotMatch(`${prompt.skill.content}${prompt.runtimeContext.content}`, /期望 PROPOSAL|no_duplicate_project|update_existing_project/);
});

test("golden gate refuses before provider use", async () => {
  let calls = 0;
  const provider: StructuredProposalProvider = { providerId: "deepseek", providerVersion: "test", completeStructured: async () => { calls += 1; throw new Error("not reached"); } };
  await assert.rejects(
    () => runDeepSeekGoldenSuite({}, provider, cases),
    (error: unknown) => typeof error === "object" && error !== null && (error as StructuredError).code === "LLM_GOLDEN_GATE_DISABLED",
  );
  assert.equal(calls, 0);
});

test("failure diagnostics expose only structural keys, never model values", () => {
  const shape = summarizeGoldenFailureShape({ secretValue: "do-not-report", groups: [{ textPatches: [{ before_text: "private" }], semanticOperations: [{ kind: "CREATE_OBJECT" }] }] });
  assert.deepEqual(shape.topLevelKeys, ["groups", "secretValue"]);
  assert.deepEqual(shape.patchKeys, ["before_text"]);
  assert.deepEqual(shape.operationKeys, ["kind"]);
  assert.equal(shape.topLevelTypes.secretValue, "string");
  assert.doesNotMatch(JSON.stringify(shape), /do-not-report|private|CREATE_OBJECT/);
});

test("golden suite stops charging after the first invalid decision", async () => {
  let calls = 0;
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "test",
    completeStructured: async () => {
      calls += 1;
      return { value: { decision: "NO_PROPOSAL", reason: "错误地拒绝明确事项。" }, metadata: { model: "test-model", durationMs: 1, attempts: 1 } };
    },
  };
  const report = await runDeepSeekGoldenSuite({ RUN_LIVE_LLM_GOLDEN_TESTS: "1" }, provider, cases);
  assert.equal(report.status, "FAIL");
  assert.equal(report.executedRequests, 1);
  assert.equal(report.stoppedEarly, true);
  assert.equal(calls, 1);
  assert.equal(report.graphWrites, 0);
  assert.equal(report.formalStoreWrites, 0);
});

test("golden semantic evaluator rejects duplicate Project creation and ownership authority", async () => {
  const item = { ...cases[3]!, input: "已知 Project：告警治理。今天确认其中的外部推送清单还缺两个系统。" };
  const raw = validProposal(item);
  const group = (raw.groups as Array<Record<string, unknown>>)[0]!;
  const operation = (group.semanticOperations as Array<Record<string, unknown>>)[0]!;
  operation.payload = { objectType: "PROJECT", text: item.input };
  const result = {
    kind: "PROPOSAL" as const,
    proposal: { ...raw, proposalId: "test", schemaVersion: "v2", source: { kind: "local_llm" }, status: "READY", createdAt: "2026-07-22T00:00:00.000Z" } as never,
    files: { proposalMd: "", proposalJson: "" },
    provider: { model: "test", durationMs: 1, attempts: 1 },
    promptBundleVersion: "test",
  };
  const evaluated = evaluateGoldenResult(item, result);
  assert(evaluated.failures.includes("no_duplicate_project_or_confirmed_ownership"));
});

test("golden evaluator rejects a schema-valid proposal whose patch, preview, and payload disagree", () => {
  const item = cases[0]!;
  const raw = validProposal(item);
  raw.finalPreview = "被模型静默改写的预览";
  const result = {
    kind: "PROPOSAL" as const,
    proposal: { ...raw, proposalId: "test", schemaVersion: "v2", source: { kind: "local_llm" }, status: "READY", createdAt: "2026-07-22T00:00:00.000Z" } as never,
    files: { proposalMd: "", proposalJson: "" }, provider: { model: "test", durationMs: 1, attempts: 1 }, promptBundleVersion: "test",
  };
  assert(evaluateGoldenResult(item, result).failures.includes("exact_patch_operation_preview_consistency"));
});

test("golden evaluator rejects an invented read target and a non-Task Project-gap proposal", () => {
  const item = cases.find((candidate) => candidate.id === "DS-04")!;
  const raw = validProposal(item);
  (raw.scope as { read: unknown[] }).read.push({ kind: "OBJECT", id: "invented-object", version: 1 });
  const operation = ((((raw.groups as Array<Record<string, unknown>>)[0]!).semanticOperations as Array<Record<string, unknown>>)[0]!);
  operation.payload = { objectType: "OUTPUT", text: operation.payload && (operation.payload as Record<string, unknown>).text };
  const result = {
    kind: "PROPOSAL" as const,
    proposal: { ...raw, proposalId: "test", schemaVersion: "v2", source: { kind: "local_llm" }, status: "READY", createdAt: "2026-07-22T00:00:00.000Z" } as never,
    files: { proposalMd: "", proposalJson: "" }, provider: { model: "test", durationMs: 1, attempts: 1 }, promptBundleVersion: "test",
  };
  const failures = evaluateGoldenResult(item, result).failures;
  assert(failures.includes("exact_read_scope"));
  assert(failures.includes("object_type_task"));
});

test("ownership candidate language can preserve uncertainty with a 是否 question", () => {
  const item = cases.find((candidate) => candidate.id === "DS-11")!;
  const raw = validProposal(item);
  raw.finalPreview = "确认这条任务是否属于告警治理 Project。";
  const result = {
    kind: "PROPOSAL" as const,
    proposal: { ...raw, proposalId: "test", schemaVersion: "v2", source: { kind: "local_llm" }, status: "READY", createdAt: "2026-07-22T00:00:00.000Z" } as never,
    files: { proposalMd: "", proposalJson: "" }, provider: { model: "test", durationMs: 1, attempts: 1 }, promptBundleVersion: "test",
  };
  assert.equal(evaluateGoldenResult(item, result).failures.includes("ownership_uncertainty_preserved"), false);
});

test("validated mock proposals can complete the fixed 22-request pipeline", async () => {
  let call = 0;
  const schedule = buildGoldenSchedule(cases);
  const provider: StructuredProposalProvider = {
    providerId: "deepseek",
    providerVersion: "test",
    completeStructured: async () => {
      const item = cases.find((candidate) => candidate.id === schedule[call]!.caseId)!;
      call += 1;
      return { value: validProposal(item), metadata: { model: "test-model", durationMs: 1, attempts: 1, totalTokens: 1 } };
    },
  };
  const report = await runDeepSeekGoldenSuite({ RUN_LIVE_LLM_GOLDEN_TESTS: "1" }, provider, cases);
  assert.equal(report.status, "PIPELINE_PASS");
  assert.equal(report.executedRequests, 22);
  assert.equal(report.failedRequests, 0);
  assert.equal(report.manualReviewRequired, true);
});
