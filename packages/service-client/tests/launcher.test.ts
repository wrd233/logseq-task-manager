import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import test from "node:test";

import type { ServiceDescriptor } from "../src/index.ts";
import {
  LAUNCHER_PROTOCOL_VERSION,
  LauncherClient,
  validateLauncherDescriptor,
  type LauncherDescriptor,
} from "../src/launcher.ts";

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing launcher test address");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

function launcherDescriptor(url: string, token = "launcher-client-token-at-least-32-characters"): LauncherDescriptor {
  return { kind: "task-copilot-launcher", protocolVersion: LAUNCHER_PROTOCOL_VERSION, url, token };
}

const serviceDescriptor: ServiceDescriptor = {
  protocolVersion: 1,
  url: "http://127.0.0.1:45678/",
  token: "service-token-at-least-24-characters",
  pid: 1234,
  createdAt: "2026-07-24T00:00:00.000Z",
};

test("launcher descriptor is distinct, versioned, and exact-loopback", () => {
  assert.deepEqual(validateLauncherDescriptor(launcherDescriptor("http://127.0.0.1:19673/")), launcherDescriptor("http://127.0.0.1:19673/"));
  assert.throws(() => validateLauncherDescriptor({ ...launcherDescriptor("http://localhost:19673/") }), /127\.0\.0\.1/);
  assert.throws(() => validateLauncherDescriptor({ ...launcherDescriptor("http://127.0.0.1:19673/"), protocolVersion: 2 }), /协议版本/);
  assert.throws(() => validateLauncherDescriptor(serviceDescriptor), /Launcher/);
});

test("launcher client ensures, heartbeats, and releases one Graph-bound Service lease", async (t) => {
  const token = "launcher-auth-token-at-least-32-characters";
  const requests: Array<{ method?: string; url?: string; body?: unknown }> = [];
  const { server, url } = await listen((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
      requests.push({
        ...(request.method ? { method: request.method } : {}),
        ...(request.url ? { url: request.url } : {}),
        body: parsed,
      });
      if (request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          status: "READY",
          protocolVersion: 1,
          capabilities: { graphServiceLifecycle: true, leaseHeartbeat: true, ownedShutdown: true },
          configuredGraphs: 1,
        }));
      } else if (request.url === "/sessions/ensure") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ leaseId: "lease_123", serviceDescriptor }));
      } else {
        response.writeHead(204);
        response.end();
      }
    });
  });
  t.after(() => server.close());
  const client = new LauncherClient(launcherDescriptor(url, token));
  assert.equal((await client.health()).status, "READY");
  assert.deepEqual(await client.ensure("graph-key", "plugin-instance"), { leaseId: "lease_123", serviceDescriptor });
  await client.heartbeat("lease_123");
  await client.release("lease_123");
  assert.deepEqual(requests, [
    { method: "GET", url: "/health", body: undefined },
    { method: "POST", url: "/sessions/ensure", body: { graphKey: "graph-key", clientInstanceId: "plugin-instance" } },
    { method: "POST", url: "/sessions/heartbeat", body: { leaseId: "lease_123" } },
    { method: "POST", url: "/sessions/release", body: { leaseId: "lease_123" } },
  ]);
});

test("launcher client maps unavailable and unauthorized management endpoints without exposing response bodies", async (t) => {
  const unavailable = new LauncherClient(launcherDescriptor("http://127.0.0.1:1/"), 50);
  await assert.rejects(() => unavailable.health(), (error: unknown) => error instanceof Error && "code" in error && error.code === "LAUNCHER_UNAVAILABLE");

  const { server, url } = await listen((_request, response) => {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "LEAK", message: "must not escape" } }));
  });
  t.after(() => server.close());
  const unauthorized = new LauncherClient(launcherDescriptor(url));
  await assert.rejects(() => unauthorized.health(), (error: unknown) => {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, "LAUNCHER_UNAUTHORIZED");
    assert.doesNotMatch(error.message, /must not escape|LEAK/);
    return true;
  });
});
