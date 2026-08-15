import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation, type GraphEffect } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-15T13:00:00.000Z";

async function setup(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `task-copilot-phase11-${label}-`));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64), now: () => at });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const graph = new FakeGraphAdapter(() => at);
  const source = graph.seedNaturalRecord("graph-phase11", "source", "TODO 授权链目标");
  const prepared = await client.prepare(parseSemanticOperation({ operationId: `create-${label}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "授权链目标", anchor: { graphId: "graph-phase11", blockUuid: "source", sourceContentHash: source.sourceContentHash } } }), source);
  const result = await graph.applyGraphEffect(prepared.graphEffect as GraphEffect);
  await client.complete(prepared.commit.id, result, await graph.readGraphSnapshot({ graphId: "graph-phase11", sourceBlockUuid: "source" }));
  return { directory, service, client, workObjectId: prepared.commit.targetId!, initialProjectionHash: result.projectionHash! };
}

test("unique Decision Package + natural-language acceptance becomes an immutable USER decision and a formal USER commit", async () => {
  const value = await setup("accept");
  try {
    const created = await value.client.createDecisionPackage({
      workObjectId: value.workObjectId,
      summary: "修改标题为“授权链已改名”",
      rationale: "用户希望把当前 Task 标题改掉。",
      candidates: [{ operationType: "RENAME_WORK_OBJECT", parameters: { target: { workObjectId: value.workObjectId, expectedVersion: 1, expectedProjectionHash: value.initialProjectionHash }, input: { title: "授权链已改名" } } }],
    });
    assert.equal(created.pkg.status, "OPEN");
    const compiled = await value.client.compileUserDecision({ utterance: "同意", packageId: created.pkg.id });
    assert.equal(compiled.kind, "AUTHORIZED_DECISION");
    if (compiled.kind !== "AUTHORIZED_DECISION") throw new Error("unreachable");
    assert.equal(compiled.decision.operationType, "RENAME_WORK_OBJECT");
    assert.equal(compiled.decision.exactUserUtterance, "同意");
    const executed = await value.client.executeUserDecision(compiled.decision.id);
    assert.equal(executed.decision.status, "EXECUTED");
    assert.equal(executed.commit.actor.type, "USER");
    assert.equal(executed.commit.status, "COMMITTED");
    assert.equal(executed.projectionObligation.status, "PENDING");
    const object = (await value.client.showObject(value.workObjectId)).object;
    assert.equal(object.title, "授权链已改名");
    assert.equal(object.version, 2);
    assert.equal((await value.client.listUserDecisions(created.pkg.id)).decisions.length, 1);
  } finally { await value.service.close(); }
});

test("quoted speaker text is not USER authorization; ambiguity and staleness fail closed", async () => {
  const value = await setup("reject");
  try {
    const created = await value.client.createDecisionPackage({
      workObjectId: value.workObjectId, summary: "Rename", rationale: "r",
      candidates: [{ operationType: "RENAME_WORK_OBJECT", parameters: { target: { workObjectId: value.workObjectId, expectedVersion: 1, expectedProjectionHash: value.initialProjectionHash }, input: { title: "新标题" } } }],
    });
    const quoted = await value.client.compileUserDecision({ utterance: "领导说：“这个改掉”", packageId: created.pkg.id });
    assert.equal(quoted.kind, "NOT_AUTHORIZATION");
    const historical = await value.client.compileUserDecision({ utterance: "之前我说过同意", packageId: created.pkg.id });
    assert.equal(historical.kind, "NOT_AUTHORIZATION");
    // Make package stale by changing the formal object through a separate USER commit.
    const snapshot = await value.client.showObject(value.workObjectId);
    const object = snapshot.object;
    const rename = await value.client.commitFormal(parseSemanticOperation({ operationId: "stale-rename", type: "RENAME_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, target: { workObjectId: object.id, expectedVersion: object.version, expectedProjectionHash: value.initialProjectionHash }, input: { title: "用户后来自己改了" } }), null);
    assert.equal(rename.commit.status, "COMMITTED");
    const stale = await value.client.compileUserDecision({ utterance: "同意", packageId: created.pkg.id });
    assert.equal(stale.kind, "STALE");
    assert.equal((await value.client.showObject(value.workObjectId)).object.title, "用户后来自己改了");
  } finally { await value.service.close(); }
});
