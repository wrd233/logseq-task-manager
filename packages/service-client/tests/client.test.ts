import assert from "node:assert/strict";
import { createServer, type RequestListener, type Server } from "node:http";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalServiceClient, probeService, validateServiceDescriptor, type ServiceDescriptor } from "../src/index.ts";
import { readServiceDescriptor, writeServiceDescriptor } from "../src/node.ts";

async function listen(handler: RequestListener): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test address");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

function descriptor(url: string, token = "client-test-token-at-least-24-chars"): ServiceDescriptor {
  return { protocolVersion: 1, url, token, pid: 123, createdAt: "2026-07-20T06:00:00.000Z" };
}

test("descriptor is loopback-only, versioned, atomically written, and 0600", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-descriptor-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  assert.throws(() => validateServiceDescriptor(descriptor("https://example.com/")), /127\.0\.0\.1/);
  assert.throws(() => validateServiceDescriptor({ ...descriptor("http://127.0.0.1:1234/"), protocolVersion: 2 }), /协议版本/);
  const path = join(root, "runtime", "service.json");
  await writeServiceDescriptor(path, descriptor("http://127.0.0.1:1234/"));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(await readServiceDescriptor(path), descriptor("http://127.0.0.1:1234/"));
  await chmod(path, 0o644);
  await assert.rejects(() => readServiceDescriptor(path), /0600/);
});

test("client authenticates and rejects a runtime protocol mismatch", async (t) => {
  const token = "client-auth-token-at-least-24-characters";
  const { server, url } = await listen((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: "READY",
      protocolVersion: 2,
      capabilities: { formalWrites: false, migration: false, provider: false, backup: true },
    }));
  });
  t.after(() => server.close());
  const client = new LocalServiceClient(descriptor(url, token));
  await assert.rejects(() => client.health(), /协议版本/);
  assert.deepEqual(await probeService(client), {
    status: "RESTRICTED",
    reasonCode: "SERVICE_PROTOCOL_MISMATCH",
    message: "Local Service 协议版本不兼容。",
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  });
});

test("unavailable and timeout both preserve Graph editing but restrict formal writes", async (t) => {
  const unavailable = new LocalServiceClient(descriptor("http://127.0.0.1:1/"), 100);
  const unavailableState = await probeService(unavailable);
  assert.equal(unavailableState.status, "RESTRICTED");
  assert.equal(unavailableState.formalWritesAvailable, false);
  assert.equal(unavailableState.graphEditingAvailable, true);

  const { server, url } = await listen(() => undefined);
  t.after(() => server.close());
  const timeout = new LocalServiceClient(descriptor(url), 20);
  const timeoutState = await probeService(timeout);
  assert.equal(timeoutState.status, "RESTRICTED");
  if (timeoutState.status === "RESTRICTED") assert.equal(timeoutState.reasonCode, "SERVICE_TIMEOUT");
});

test("Provider generation uses its bounded long-running window without relaxing ordinary client timeouts", async (t) => {
  const { server, url } = await listen((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ generated: { kind: "NO_PROPOSAL", reason: "测试", provider: { model: "test", durationMs: 40, attempts: 1 }, promptBundleVersion: "v1" }, replayed: false }));
    }, 40);
  });
  t.after(() => server.close());
  const client = new LocalServiceClient(descriptor(url), 10);
  const result = await client.generateProposal({
    core: { version: "1", content: "core" }, domain: { version: "1", content: "domain" }, skill: { version: "1", content: "skill" },
    userSemantics: { version: "1", content: "user" }, runtimeContext: { version: "1", content: "runtime" },
  });
  assert.equal(result.generated.kind, "NO_PROPOSAL");
});

test("client preserves bounded Local Service conflict messages for reviewable UI errors", async (t) => {
  const { server, url } = await listen((_request, response) => {
    response.writeHead(409, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "V2_PROPOSAL_UNDO_STATE_CHANGED", message: "对象或 Anchor 已有后续变化；Undo 没有写入。" } }));
  });
  t.after(() => server.close());
  const client = new LocalServiceClient(descriptor(url));
  await assert.rejects(() => client.prepareProposalUndo("proposal-commit:changed", "trace"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "对象或 Anchor 已有后续变化；Undo 没有写入。");
    assert.equal("details" in error && (error.details as { remoteCode?: string }).remoteCode, "V2_PROPOSAL_UNDO_STATE_CHANGED");
    return true;
  });
});

test("materialization client sends no Graph, database path, or caller-selected object identity", async (t) => {
  const token = "client-materialize-token-24-characters";
  let received: unknown;
  const { server, url } = await listen((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/objects/materialize");
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({
        object: { objectId: "server-object", objectType: "TASK", version: 2, lifecycle: "COMPLETED", condition: { kind: "ACTIONABLE" }, text: "核对时间同步", createdAt: "2026-07-20T07:00:00.000Z", updatedAt: "2026-07-20T07:00:00.000Z", sourceOrCreationEvent: "explicit_block:graph:block" },
        anchor: { anchorId: "server-anchor", objectId: "server-object", graphId: "graph", externalId: "block", role: "primary_text", status: "active", contentHash: "a".repeat(64), lastSeenAt: "2026-07-20T07:00:00.000Z" },
        replayed: false,
      }));
    });
  });
  t.after(() => server.close());
  const client = new LocalServiceClient(descriptor(url, token));
  const result = await client.materializeExplicitObject({
    objectType: "TASK",
    text: "核对时间同步",
    marker: "DONE",
    externalId: "block",
    inputVersion: "1001",
    contentHash: "a".repeat(64),
    idempotencyKey: "graph:block:first-seen",
    traceId: "trace-materialize",
  });
  assert.equal(result.object.objectId, "server-object");
  assert.deepEqual(received, {
    objectType: "TASK",
    text: "核对时间同步",
    marker: "DONE",
    externalId: "block",
    inputVersion: "1001",
    contentHash: "a".repeat(64),
    idempotencyKey: "graph:block:first-seen",
    traceId: "trace-materialize",
  });
  assert.equal("graphId" in (received as Record<string, unknown>), false);
  assert.equal("objectId" in (received as Record<string, unknown>), false);
  assert.equal("databasePath" in (received as Record<string, unknown>), false);
});

test("focus selection client lists the read-only /focus projection", async (t) => {
  const token = "client-focus-token-at-least-24-chars";
  let receivedUrl = "";
  const { server, url } = await listen((request, response) => {
    receivedUrl = request.url ?? "";
    assert.equal(request.method, "GET");
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      selections: [
        { objectId: "obj-a", selectedAt: "2026-08-01T00:00:00.000Z", rank: 0 },
        { objectId: "obj-b", selectedAt: "2026-08-01T00:00:01.000Z", rank: 1 },
      ],
    }));
  });
  t.after(() => server.close());
  const client = new LocalServiceClient(descriptor(url, token));
  assert.deepEqual(await client.listFocusSelections(), [
    { objectId: "obj-a", selectedAt: "2026-08-01T00:00:00.000Z", rank: 0 },
    { objectId: "obj-b", selectedAt: "2026-08-01T00:00:01.000Z", rank: 1 },
  ]);
  assert.equal(receivedUrl, "/focus");
});

test("Anchor observation client sends only bounded evidence and no Graph authority", async (t) => {
  const token = "client-anchor-observation-token-24-chars";
  let received: unknown;
  const { server, url } = await listen((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/anchors/primary/observe");
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        object: { objectId: "server-object", objectType: "TASK", version: 3, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "保留对象", createdAt: "2026-07-20T07:00:00.000Z", updatedAt: "2026-07-20T07:01:00.000Z", sourceOrCreationEvent: "explicit" },
        anchor: { anchorId: "server-anchor", objectId: "server-object", graphId: "server-graph", externalId: "block", role: "primary_text", status: "missing", contentHash: "11111111", lastSeenAt: "2026-07-20T07:00:00.000Z" },
        replayed: false,
      }));
    });
  });
  t.after(() => server.close());
  const result = await new LocalServiceClient(descriptor(url, token)).observePrimaryAnchor({
    anchorId: "server-anchor",
    status: "missing",
    traceId: "trace-observe",
  });
  assert.equal(result.anchor.status, "missing");
  assert.deepEqual(received, { anchorId: "server-anchor", status: "missing", traceId: "trace-observe" });
  assert.equal("graphId" in (received as Record<string, unknown>), false);
  assert.equal("expectedVersion" in (received as Record<string, unknown>), false);
});

test("Anchor rebind client sends explicit confirmation and no object or Graph authority", async (t) => {
  const token = "client-anchor-rebind-token-24-chars";
  let received: unknown;
  const { server, url } = await listen((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/anchors/primary/rebind");
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        object: { objectId: "server-object", objectType: "TASK", version: 4, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "新正文", createdAt: "2026-07-20T07:00:00.000Z", updatedAt: "2026-07-20T07:02:00.000Z", sourceOrCreationEvent: "explicit" },
        previousAnchor: { anchorId: "anchor-old", objectId: "server-object", graphId: "server-graph", externalId: "block-old", role: "primary_text", status: "replaced", contentHash: "11111111", lastSeenAt: "2026-07-20T07:00:00.000Z" },
        anchor: { anchorId: "anchor-new", objectId: "server-object", graphId: "server-graph", externalId: "block-new", role: "primary_text", status: "active", contentHash: "22222222", lastSeenAt: "2026-07-20T07:02:00.000Z" },
        replayed: false,
      }));
    });
  });
  t.after(() => server.close());
  const input = { previousAnchorId: "anchor-old", previewObjectVersion: 3, previewAnchorStatus: "missing" as const, previewAnchorContentHash: "11111111", objectType: "TASK" as const, text: "新正文", externalId: "block-new", inputVersion: "1002", contentHash: "22222222", confirmation: "REBIND_PRIMARY_ANCHOR" as const, traceId: "trace-rebind" };
  const result = await new LocalServiceClient(descriptor(url, token)).rebindPrimaryAnchor(input);
  assert.equal(result.previousAnchor.status, "replaced");
  assert.deepEqual(received, input);
  assert.equal("graphId" in (received as Record<string, unknown>), false);
  assert.equal("objectId" in (received as Record<string, unknown>), false);
  assert.equal("expectedVersion" in (received as Record<string, unknown>), false);
});
