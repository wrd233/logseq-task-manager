import assert from "node:assert/strict";
import test from "node:test";

import { ContractError, parseAgentCurrentFocusResult, parseAgentEngagementResult, parseSemanticOperation, stableHash } from "../src/index.ts";

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

test("CHANGE_ENGAGEMENT is one closed atomic Waiting transition", () => {
  const dependencies = [{ evidenceId: "evidence-vlan", contentHash: "a".repeat(64) }];
  const operation = parseSemanticOperation({
    operationId: "waiting-01", type: "CHANGE_ENGAGEMENT", actor: { type: "AGENT", id: "fake-engagement-agent" },
    target: { workObjectId: "work-01", expectedVersion: 3, expectedProjectionHash: "1234abcd" },
    input: { from: "ACTIONABLE", to: "WAITING", waiting: { description: " 等待网络组分配 VLAN ", reviewAt: null, evidenceIds: ["evidence-vlan"] } },
    evidenceDependencies: dependencies,
  });
  assert.equal(operation.type, "CHANGE_ENGAGEMENT");
  if (operation.type !== "CHANGE_ENGAGEMENT") assert.fail();
  assert.equal(operation.input.waiting?.description, "等待网络组分配 VLAN");
  assert.deepEqual(operation.preconditions[2].expected, dependencies);
  assert.throws(() => parseSemanticOperation({ ...operation, input: { from: "ACTIONABLE", to: "PARKED", waiting: null } }), /ENGAGEMENT_TO_INVALID/u);
  assert.throws(() => parseSemanticOperation({ ...operation, input: { from: "ACTIONABLE", to: "WAITING", waiting: null } }), /WAITING_CONDITION_REQUIRED/u);
  assert.throws(() => parseSemanticOperation({ ...operation, input: { ...operation.input, waiting: { ...operation.input.waiting, evidenceIds: ["other"] } } }), /WAITING_EVIDENCE_MISMATCH/u);
});

test("Agent Engagement results reject PARKED and half transitions", () => {
  assert.deepEqual(parseAgentEngagementResult({ outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待 VLAN", reviewAt: null } }, reasonCode: "EXTERNAL_BLOCKER", rationaleSummary: "Direct prerequisite." }), {
    outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "WAITING", waiting: { description: "等待 VLAN", reviewAt: null } }, reasonCode: "EXTERNAL_BLOCKER", rationaleSummary: "Direct prerequisite.",
  });
  assert.throws(() => parseAgentEngagementResult({ outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "PARKED", waiting: null }, reasonCode: "X", rationaleSummary: "X" }), /ENGAGEMENT_TO_INVALID/u);
  assert.throws(() => parseAgentEngagementResult({ outcome: "PROPOSAL", reasonCode: "X", rationaleSummary: "X" }), /AGENT_ENGAGEMENT_TRANSITION_REQUIRED/u);
  assert.throws(() => parseAgentEngagementResult({ outcome: "NO_PROPOSAL", transition: { from: "WAITING", to: "ACTIONABLE", waiting: null }, reasonCode: "X", rationaleSummary: "X" }), /AGENT_ENGAGEMENT_TRANSITION_FORBIDDEN/u);
});

test("Task Closure operations are closed semantic commands without generic lifecycle setters", () => {
  const target = { workObjectId: "task-01", expectedVersion: 4, expectedProjectionHash: "1234abcd" };
  const complete = parseSemanticOperation({ operationId: "complete-01", type: "COMPLETE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target, input: { outcomeSummary: "完成防火墙验证", evidenceIds: [] } });
  assert.equal(complete.type, "COMPLETE_WORK_OBJECT");
  assert.deepEqual(complete.preconditions, [{ kind: "WORK_OBJECT_VERSION", expected: 4 }, { kind: "MANAGED_PROJECTION_HASH", expected: "1234abcd" }]);
  assert.throws(() => parseSemanticOperation({ ...complete, input: { ...complete.input, lifecycle: "COMPLETED" } }), /OPERATION_INPUT_UNKNOWN_FIELD/u);
  assert.throws(() => parseSemanticOperation({ operationId: "generic", type: "SET_LIFECYCLE", actor: { type: "USER", id: "local-user" }, target, input: { lifecycle: "COMPLETED" } }), /OPERATION_TYPE_UNSUPPORTED/u);

  const cancel = parseSemanticOperation({ operationId: "cancel-01", type: "CANCEL_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target, input: { reason: "业务方取消需求", replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [] } });
  assert.equal(cancel.type, "CANCEL_WORK_OBJECT");
  assert.throws(() => parseSemanticOperation({ ...cancel, input: { ...cancel.input, reason: " " } }), /CANCELLATION_REASON_REQUIRED/u);

  const reopen = parseSemanticOperation({ operationId: "reopen-01", type: "REOPEN_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target, input: { reason: "生产验证仍未完成" } });
  assert.equal(reopen.type, "REOPEN_WORK_OBJECT");
  assert.throws(() => parseSemanticOperation({ ...reopen, input: { reason: "" } }), /REOPEN_REASON_REQUIRED/u);

  const amend = parseSemanticOperation({ operationId: "amend-01", type: "AMEND_CLOSURE", actor: { type: "USER", id: "local-user" }, target, input: { targetClosureRecordId: "completion-01", reason: "原表述范围过大", replacementOutcomeSummary: "已完成测试环境验证", replacementCancellationReason: null, addEvidenceIds: [] } });
  assert.equal(amend.type, "AMEND_CLOSURE");
  assert.throws(() => parseSemanticOperation({ ...amend, input: { ...amend.input, patch: [{ op: "replace", path: "/outcome" }] } }), /OPERATION_INPUT_UNKNOWN_FIELD/u);
});
