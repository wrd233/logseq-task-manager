import assert from "node:assert/strict";
import test from "node:test";

import { ContractError, parseSemanticOperation, stableHash } from "../src/index.ts";

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
