import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalServiceClient, type ServiceDescriptor, type ServiceGraphReadRequest } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";
import { startLocalService } from "../../task-copilot-local-service/src/service.ts";

import { runCli, type CliIo } from "../src/cli.ts";
import { writeContextPackage } from "../src/context-output.ts";

test("CLI graph and page Context use the live Logseq bridge and remain read-only", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-cli-graph-context-"));
  const service = await startLocalService({ databasePath: join(root, "task-copilot.db"), graphId: "graph-cli-context", token: "cli-graph-context-token-at-least-24-chars" });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const descriptor: ServiceDescriptor = { protocolVersion: 1, url: service.url, token: service.token, pid: process.pid, createdAt: "2026-07-22T10:00:00.000Z" };
  const client = new LocalServiceClient(descriptor);
  const intent = await client.prepareProject({ name: "CLI Graph Context", traceId: "cli-graph-context-prepare" });
  await client.finalizeProject({ semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "CLI Graph Context", pageExternalId: "page-cli-graph-context", pageContentHash: checksum(""), traceId: "cli-graph-context-finalize" });
  const before = { status: await client.status(), proposals: (await client.listProposals()).length, commits: (await client.listSemanticCommits()).length };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo = { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) };
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => client, writeContextPackage };

  const answer = async (expectedKind: ServiceGraphReadRequest["kind"]) => {
    const request = await client.claimGraphReadRequest();
    assert.equal(request?.kind, expectedKind);
    if (!request) throw new Error("expected Graph read request");
    const resolved = expectedKind === "PAGE"
      ? { kind: "PAGE" as const, id: "page-cli-graph-context", name: "Project/CLI Graph Context", version: 9, evidenceHash: checksum("page-cli-graph-context-evidence") }
      : { kind: "BLOCK" as const, id: "block-cli-graph-context" };
    const blocks = [{ uuid: "block-cli-graph-context", content: "[任务] CLI Graph read", contentHash: checksum("[任务] CLI Graph read"), relation: "ROOT" as const, depth: 0, pageUuid: "page-cli-graph-context", pageName: "Project/CLI Graph Context" }];
    const kind = expectedKind === "PAGE" ? "PAGE" as const : "BLOCK" as const;
    const snapshot = { kind, requestedTarget: request.target, resolved, blocks, truncated: false, readAt: "2026-07-22T10:01:00.000Z", scopeHash: checksum({ kind, resolved, blocks, truncated: false }) };
    await client.completeGraphReadRequest({ requestId: request.requestId, status: "FOUND", snapshot });
  };

  const output = join(root, "agent-context");
  const pageBridge = answer("PAGE");
  assert.equal(await runCli(["--json", "context", "export", "--scope", "page", "--page", "Project/CLI Graph Context", "--out", output], dependencies, io), 0);
  await pageBridge;
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { graphExcerptStatus: string; includedObjectCount: number };
  assert.equal(manifest.graphExcerptStatus, "AVAILABLE_FROM_LOGSEQ_BRIDGE");
  assert.equal(manifest.includedObjectCount, 1);
  assert.equal((await stat(output)).mode & 0o777, 0o700);
  assert.equal((await stat(join(output, "graph", "page.json"))).mode & 0o777, 0o600);

  const blockBridge = answer("BLOCK");
  assert.equal(await runCli(["--json", "graph", "block", "block-cli-graph-context", "--children", "--parents", "2"], dependencies, io), 0);
  await blockBridge;
  const graphOutput = JSON.parse(stdout.at(-1) ?? "") as { data: { snapshot: { resolved: { id: string } } } };
  assert.equal(graphOutput.data.snapshot.resolved.id, "block-cli-graph-context");
  assert.deepEqual({ status: await client.status(), proposals: (await client.listProposals()).length, commits: (await client.listSemanticCommits()).length }, before);
  assert.deepEqual(stderr, []);
});
