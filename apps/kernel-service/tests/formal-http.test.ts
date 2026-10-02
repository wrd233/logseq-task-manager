import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ClientError, FormalOutcomeUnknownError, KernelClient, type PluginKernelDescriptor } from "@task-copilot/client";
import { parseSemanticOperation } from "@task-copilot/contracts";
import { FakeGraphAdapter } from "../../../packages/test-support/src/index.ts";
import { startKernelServer } from "../src/server.ts";

test("formal HTTP receipts survive lost responses and uncertain transport without duplicate commits; Undo keeps USER permission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "round04-http-")), graph = new FakeGraphAdapter();
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json") });
  const descriptor = { schemaVersion: 1 as const, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: "now" };
  const user = new KernelClient({ ...descriptor, userChannelToken: service.userChannelToken } as PluginKernelDescriptor), external = new KernelClient(descriptor);
  const source = graph.seedNaturalRecord("graph", "source", "TODO HTTP");
  const operation = parseSemanticOperation({ operationId: "lost-create", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "HTTP", anchor: { graphId: "graph", blockUuid: "source", sourceContentHash: source.sourceContentHash } } });
  const original = globalThis.fetch;
  try {
    await assert.rejects(external.commitFormal(operation, source), (error: unknown) => error instanceof ClientError && error.code === "TRUSTED_USER_CHANNEL_REQUIRED");
    let lost = true;
    globalThis.fetch = async (input, init) => {
      const result = await original(input, init);
      if (lost && String(input).endsWith("/v1/commits/commit")) { lost = false; await result.json(); throw Error("response lost after accepted transaction"); }
      return result;
    };
    const formal = await user.commitFormal(operation, source);
    assert.equal(formal.commit.status, "COMMITTED");
    assert.equal(service.store.listCommits().length, 1); assert.equal(service.store.listProjectionObligations().length, 1);
    assert.equal((await user.formalReceipt(operation.operationId)).receipt?.commit.id, formal.commit.id);
    const duplicates = await Promise.all([user.commitFormal(operation, source), user.commitFormal(operation, source)]);
    assert.ok(duplicates.every(x => x.commit.id === formal.commit.id)); assert.equal(service.store.listCommits().length, 1);
    await user.verifyFormalProjection(formal.commit.id, await graph.applyGraphEffect(formal.graphEffect), graph.snapshot("graph", "source"));
    const undoInput = { operationId: "lost-undo", actor: { type: "USER", id: "local-user" } as const, snapshot: graph.snapshot("graph", "source") };
    await assert.rejects(external.undoFormal(formal.commit.id, undoInput), (error: unknown) => error instanceof ClientError && error.code === "TRUSTED_USER_CHANNEL_REQUIRED");
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/undo/commit")) { const result = await original(input, init); await result.json(); throw Error("lost Undo response"); }
      throw Error("receipt temporarily unreachable");
    };
    await assert.rejects(user.undoFormal(formal.commit.id, undoInput), (error: unknown) => error instanceof FormalOutcomeUnknownError && error.operationId === undoInput.operationId);
    globalThis.fetch = original;
    const undone = await user.undoFormal(formal.commit.id, undoInput);
    assert.equal(undone.commit.status, "COMMITTED"); assert.equal(service.store.getWorkObject(formal.commit.targetId!), null);
    assert.equal(service.store.listCommits().length, 2); assert.equal(service.store.listProjectionObligations().length, 2);
    const offline = await user.deliverFormalProjection(undone.commit.id);
    assert.notEqual(offline.obligation.status, "VERIFIED"); assert.equal(offline.obligation.attempt, 0);
    assert.equal((await user.showCommit(undone.commit.id)).commit.status, "COMMITTED");
    const result = await graph.applyGraphEffect(undone.graphEffect);
    assert.equal((await user.verifyFormalProjection(undone.commit.id, result, graph.snapshot("graph", "source"))).obligation.status, "VERIFIED");
  } finally { globalThis.fetch = original; await service.close(); await rm(directory, { recursive: true, force: true }); }
});
