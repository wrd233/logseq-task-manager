import assert from "node:assert/strict";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LOCAL_SERVICE_PROTOCOL_VERSION, startLocalService } from "../src/service.ts";

test("Local Service is loopback-only, authenticated, and reports one SQLite authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-"));
  let closed = false;
  const service = await startLocalService({
    databasePath: join(root, ".task-copilot", "task-copilot.db"),
    graphId: "graph-service-test",
    token: "test-session-token-at-least-24-characters",
    descriptorPath: join(root, "runtime", "service.json"),
  });
  t.after(async () => {
    if (!closed) await service.close();
    await rm(root, { recursive: true, force: true });
  });
  assert.match(service.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal((await stat(join(root, "runtime", "service.json"))).mode & 0o777, 0o600);
  const unauthorized = await fetch(new URL("health", service.url));
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(await unauthorized.text(), /test-session-token/);

  const headers = { authorization: `Bearer ${service.token}` };
  const health = await fetch(new URL("health", service.url), { headers });
  assert.deepEqual(await health.json(), {
    status: "READY",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    capabilities: { formalWrites: false, migration: false, provider: false },
  });
  const status = await fetch(new URL("status", service.url), { headers });
  assert.deepEqual(await status.json(), {
    status: "READY",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    capabilities: { formalWrites: false, migration: false, provider: false },
    databaseSchemaVersion: 1,
    objectCount: 0,
  });
  const doctor = await fetch(new URL("doctor", service.url), { method: "POST", headers });
  assert.equal((await doctor.json() as { status: string }).status, "PASS");
  await service.close();
  closed = true;
  await assert.rejects(access(join(root, "runtime", "service.json")));
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
  const list = await fetch(new URL("objects", service.url), { headers });
  assert.deepEqual(await list.json(), { objects: [] });
  assert.equal((await fetch(new URL("objects/missing", service.url), { headers })).status, 404);
  const write = await fetch(new URL("objects", service.url), { method: "POST", headers });
  assert.equal(write.status, 404);
});
