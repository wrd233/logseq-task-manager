import assert from "node:assert/strict";
import test from "node:test";

import {
  deferOperation,
  effectiveOperationRisk,
  resolveOperations,
  reviewOperation,
  type SemanticOperation,
} from "../src/index.ts";

function operation(
  operationId: string,
  operationType: SemanticOperation["operationType"],
  dependencies: string[] = [],
): SemanticOperation {
  return {
    operationId,
    operationType,
    target: { kind: "CAPTURE", id: "cap_1" },
    payload: {},
    preconditions: [],
    dependencies,
    riskLevel: operationType === "move_content" || operationType === "set_primary_ownership" ? "HIGH" : "MEDIUM",
    ruleRefs: ["PRI-006"],
    rationale: "确定性测试建议",
    confidence: 1,
    status: "PROPOSED",
  };
}

test("accepted independent operations remain executable when move and ownership are rejected", () => {
  const operations = [
    reviewOperation(operation("rewrite", "rewrite_content"), "ACCEPTED"),
    reviewOperation(operation("create", "create_object"), "ACCEPTED"),
    reviewOperation(operation("move", "move_content"), "REJECTED"),
    reviewOperation(operation("owner", "set_primary_ownership"), "REJECTED"),
  ];
  const result = resolveOperations(operations);
  assert.deepEqual(result.executable.map((item) => item.operationId), ["rewrite", "create"]);
  assert.deepEqual(result.rejected.map((item) => item.operationId), ["move", "owner"]);
  assert.deepEqual(result.blocked, []);
});

test("an accepted operation is blocked when a required dependency is rejected", () => {
  const operations = [
    reviewOperation(operation("parent", "create_object"), "REJECTED"),
    reviewOperation(operation("child", "create_object", ["parent"]), "ACCEPTED"),
  ];
  const result = resolveOperations(operations);
  assert.equal(result.executable.length, 0);
  assert.equal(result.blocked[0]?.operationId, "child");
  assert.match(result.blocked[0]?.blockedReason ?? "", /parent/);
});

test("edited acceptance keeps both agent payload and user-confirmed payload", () => {
  const source = { ...operation("rewrite", "rewrite_content"), payload: { text: "Agent 版本" } };
  const reviewed = reviewOperation(source, "EDITED", { text: "用户确认版本" });
  assert.deepEqual(reviewed.agentPayload, { text: "Agent 版本" });
  assert.deepEqual(reviewed.payload, { text: "用户确认版本" });
});

test("deferral remains pending and deterministic risk cannot be downgraded by a provider", () => {
  const deferred = deferOperation(operation("rewrite", "rewrite_content"), "2026-07-20T09:00:00+08:00", "等待上下文");
  assert.equal(resolveOperations([deferred]).pending[0]?.status, "DEFERRED");
  assert.equal(deferred.deferReason, "等待上下文");
  assert.throws(() => deferOperation(operation("bad", "rewrite_content"), "bad-date", "原因"), /合法复查时间/);
  assert.equal(effectiveOperationRisk({ ...operation("move", "move_content"), riskLevel: "LOW" }), "HIGH");
});

test("128 partial-acceptance combinations never execute rejected operations or broken dependencies", () => {
  const base = [
    operation("rewrite", "rewrite_content"),
    operation("create", "create_object"),
    operation("owner", "set_primary_ownership", ["create"]),
    operation("move", "move_content"),
    operation("child-a", "create_object", ["create"]),
    operation("child-b", "create_object", ["create"]),
    operation("resolve", "resolve_capture", ["rewrite", "create"]),
  ];
  for (let mask = 0; mask < 128; mask += 1) {
    const reviewed = base.map((item, index) => reviewOperation(item, mask & (1 << index) ? "ACCEPTED" : "REJECTED"));
    const result = resolveOperations(reviewed);
    const executable = new Set(result.executable.map((item) => item.operationId));
    const rejected = new Set(result.rejected.map((item) => item.operationId));
    for (const id of executable) assert.equal(rejected.has(id), false, `mask ${mask}: rejected ${id} executed`);
    for (const item of result.executable) {
      for (const dependency of item.dependencies) assert.equal(executable.has(dependency), true, `mask ${mask}: missing ${dependency}`);
    }
  }
});
