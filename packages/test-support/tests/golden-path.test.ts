import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "@task-copilot/cli";
import { KernelClient } from "@task-copilot/client";
import { parseSemanticOperation } from "@task-copilot/contracts";
import { startKernelServer } from "@task-copilot/kernel-service";
import { FakeGraphAdapter } from "../src/index.ts";

const at = "2026-08-12T00:00:00.000Z";

test("natural Logseq record -> explicit formalize -> audit -> safe compensation Undo", async () => {
  const directory = await mkdtemp(join(tmpdir(), "task-copilot-golden-"));
  const service = await startKernelServer({ databasePath: join(directory, "kernel.sqlite"), descriptorPath: join(directory, "kernel.json"), token: "token", now: () => at });
  try {
    const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
    const graph = new FakeGraphAdapter(() => at);
    const naturalContent = "确认交换机管理口地址";
    const source = graph.seedNaturalRecord("graph-01", "source-01", naturalContent);
    const operation = parseSemanticOperation({ operationId: "formalize-01", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: naturalContent, anchor: { graphId: source.graphId, blockUuid: source.sourceBlockUuid, sourceContentHash: source.sourceContentHash } } });

    const pending = await client.prepare(operation, source);
    assert.equal(pending.commit.status, "KERNEL_APPLIED");
    const result = await graph.applyGraphEffect(pending.graphEffect as never);
    const committed = await client.complete(pending.commit.id, result, await graph.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" }));
    assert.equal(committed.commit.status, "COMMITTED");
    assert.equal((await client.listObjects()).objects[0]?.title, naturalContent);

    const cliOutput: string[] = [];
    assert.equal(await runCli(["commit", "show", pending.commit.id, "--json"], client, { out: (line) => cliOutput.push(line), err: () => undefined }), 0);
    assert.equal(JSON.parse(cliOutput[0]!).commit.status, "COMMITTED");

    const beforeUndo = await graph.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" });
    const undo = await client.prepareUndo(pending.commit.id, { operationId: "undo-01", actor: { type: "USER", id: "local-user" }, snapshot: beforeUndo });
    const undoResult = await graph.applyGraphEffect(undo.graphEffect as never);
    const undone = await client.complete(undo.commit.id, undoResult, await graph.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" }));
    assert.equal(undone.commit.status, "COMMITTED");
    assert.equal((await client.listObjects()).objects.length, 0);
    assert.equal(graph.naturalContent("graph-01", "source-01"), naturalContent);
    assert.equal((await client.showCommit(pending.commit.id)).commit.compensatedBy, undo.commit.id);
  } finally { await service.close(); }
});

test("Graph adapter throw never becomes client-visible success and remains recoverable after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "task-copilot-failure-"));
  const databasePath = join(directory, "kernel.sqlite");
  const descriptorPath = join(directory, "kernel.json");
  const graph = new FakeGraphAdapter(() => at);
  const source = graph.seedNaturalRecord("graph-02", "source-02", "故障演练");
  let service = await startKernelServer({ databasePath, descriptorPath, token: "token-1", now: () => at });
  const client = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
  const pending = await client.prepare(parseSemanticOperation({ operationId: "failure-01", type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: "故障演练", anchor: { graphId: source.graphId, blockUuid: source.sourceBlockUuid, sourceContentHash: source.sourceContentHash } } }), source);
  graph.failNextApply();
  await assert.rejects(graph.applyGraphEffect(pending.graphEffect as never), /FAKE_GRAPH_APPLY_FAILURE/u);
  assert.equal((await client.listRecovery()).recovery[0]?.commit.status, "KERNEL_APPLIED");
  await service.close();

  service = await startKernelServer({ databasePath, descriptorPath, token: "token-2", now: () => at });
  try {
    const restarted = new KernelClient({ schemaVersion: 1, baseUrl: service.baseUrl, token: service.token, pid: process.pid, startedAt: at });
    assert.equal((await restarted.listRecovery()).recovery[0]?.action, "RESUME_GRAPH_APPLY");
  } finally { await service.close(); }
});
