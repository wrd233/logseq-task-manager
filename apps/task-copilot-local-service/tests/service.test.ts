import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LOCAL_SERVICE_PROTOCOL_VERSION, startLocalService } from "../src/service.ts";

test("Local Service is loopback-only, authenticated, and reports one SQLite authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-"));
  const service = await startLocalService({
    databasePath: join(root, ".task-copilot", "task-copilot.db"),
    graphId: "graph-service-test",
    token: "test-session-token-at-least-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  assert.match(service.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const unauthorized = await fetch(`${service.url}/health`);
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(await unauthorized.text(), /test-session-token/);

  const headers = { authorization: `Bearer ${service.token}` };
  const health = await fetch(`${service.url}/health`, { headers });
  assert.deepEqual(await health.json(), { status: "READY", protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION });
  const status = await fetch(`${service.url}/status`, { headers });
  assert.deepEqual(await status.json(), {
    status: "READY",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    databaseSchemaVersion: 1,
    objectCount: 0,
  });
  const doctor = await fetch(`${service.url}/doctor`, { method: "POST", headers });
  assert.equal((await doctor.json() as { status: string }).status, "PASS");
});
test("Local Service exposes read-only object routes and no accidental write route", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-read-only",
    token: "another-test-session-token-24-chars",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const headers = { authorization: `Bearer ${service.token}` };
  const list = await fetch(`${service.url}/objects`, { headers });
  assert.deepEqual(await list.json(), { objects: [] });
  assert.equal((await fetch(`${service.url}/objects/missing`, { headers })).status, 404);
  const write = await fetch(`${service.url}/objects`, { method: "POST", headers });
  assert.equal(write.status, 404);
});
