import assert from "node:assert/strict";
import test from "node:test";

import { ContractError, parseAgentCurrentFocusResult, parseSemanticOperation, stableHash } from "../src/index.ts";

test("CREATE_WORK_OBJECT is a closed semantic command with an exact Graph precondition", () => {
  const operation = parseSemanticOperation({
    operationId: "operation-01",
    type: "CREATE_WORK_OBJECT",
    actor: { type: "USER", id: "local-user" },
    input: {
      kind: "TASK",
      title: "  确认交换机管理口地址  ",
      anchor: {
        graphId: "graph-01",
        blockUuid: "source-block-01",
        sourceContentHash: "a1b2c3d4",
      },
    },
  });

  assert.equal(operation.type, "CREATE_WORK_OBJECT");
  assert.equal(operation.input.title, "确认交换机管理口地址");
  assert.deepEqual(operation.preconditions, [
    { kind: "SOURCE_CONTENT_HASH", expected: "a1b2c3d4" },
    { kind: "MANAGED_PROJECTION_ABSENT", expected: true },
  ]);
});

test("the operation registry rejects generic writes and caller-selected database details", () => {
  for (const type of ["UPDATE_OBJECT", "PATCH_JSON", "SET_FIELD"]) {
    assert.throws(
      () => parseSemanticOperation({ operationId: "operation-01", type, actor: { type: "USER", id: "local-user" }, input: {} }),
      (error) => error instanceof ContractError && error.code === "OPERATION_TYPE_UNSUPPORTED",
    );
  }
  assert.throws(
    () => parseSemanticOperation({
      operationId: "operation-01",
      type: "CREATE_WORK_OBJECT",
      actor: { type: "USER", id: "local-user" },
      input: {
        kind: "TASK",
        title: "Task",
        table: "work_objects",
        anchor: { graphId: "graph-01", blockUuid: "source-block-01", sourceContentHash: "a1b2c3d4" },
      },
    }),
    (error) => error instanceof ContractError && error.code === "OPERATION_INPUT_UNKNOWN_FIELD",
  );
});

test("stableHash is portable and order-independent for object keys", () => {
  assert.equal(stableHash({ title: "Task", version: 1 }), stableHash({ version: 1, title: "Task" }));
  assert.match(stableHash({ title: "Task" }), /^[0-9a-f]{8}$/u);
});

test("SET_CURRENT_FOCUS is closed, atomic, and separates strong Evidence from projection hashes", () => {
  const evidenceHash = "a".repeat(64);
  const operation = parseSemanticOperation({
    operationId: "focus-01", type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: "fake-current-focus-agent" },
    target: { workObjectId: "work-01", expectedVersion: 2, expectedProjectionHash: "a1b2c3d4" },
    input: { currentFocus: "  准备服务器上架并完成管理口网络配置  " },
    evidenceDependencies: [{ evidenceId: "evidence-01", contentHash: evidenceHash }],
  });
  assert.equal(operation.type, "SET_CURRENT_FOCUS");
  assert.equal(operation.input.currentFocus, "准备服务器上架并完成管理口网络配置");
  assert.deepEqual(operation.preconditions, [
    { kind: "WORK_OBJECT_VERSION", expected: 2 },
    { kind: "MANAGED_PROJECTION_HASH", expected: "a1b2c3d4" },
    { kind: "EVIDENCE_DEPENDENCIES", expected: [{ evidenceId: "evidence-01", contentHash: evidenceHash }] },
  ]);
  assert.throws(() => parseSemanticOperation({
    operationId: "focus-bad", type: "SET_CURRENT_FOCUS", actor: { type: "AGENT", id: "agent" },
    target: { workObjectId: "work-01", expectedVersion: 2, expectedProjectionHash: evidenceHash },
    input: { currentFocus: "下一步" }, evidenceDependencies: [{ evidenceId: "evidence-01", contentHash: "a1b2c3d4" }],
  }), /PROJECTION_HASH_INVALID|EVIDENCE_CONTENT_HASH_INVALID/u);
});

test("Agent current-focus results are a closed runtime contract", () => {
  assert.deepEqual(parseAgentCurrentFocusResult({ outcome: "PROPOSAL", currentFocus: "准备上架", reasonCode: "NEXT", rationaleSummary: "Bounded by Evidence." }), {
    outcome: "PROPOSAL", currentFocus: "准备上架", reasonCode: "NEXT", rationaleSummary: "Bounded by Evidence.",
  });
  assert.throws(() => parseAgentCurrentFocusResult({ outcome: "UNKNOWN", reasonCode: "X", rationaleSummary: "X" }), /AGENT_RESULT_OUTCOME_INVALID/u);
  assert.throws(() => parseAgentCurrentFocusResult({ outcome: "NO_PROPOSAL", reasonCode: "X" }), /AGENT_RESULT_EXPLANATION_INVALID/u);
  assert.throws(() => parseAgentCurrentFocusResult({ outcome: "NO_PROPOSAL", reasonCode: "X", rationaleSummary: "X", confidence: 1 }), /AGENT_RESULT_UNKNOWN_FIELD/u);
  assert.throws(() => parseAgentCurrentFocusResult({ outcome: "PROPOSAL", reasonCode: "X", rationaleSummary: "X" }), /AGENT_RESULT_FOCUS_REQUIRED/u);
});
