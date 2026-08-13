import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { KernelClient, readKernelDescriptor } from "@task-copilot/client";
import { startKernelServer } from "../src/server.ts";

test("service binds to loopback, writes a private descriptor, and rejects missing tokens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "task-copilot-kernel-"));
  const stateDirectory = join(directory, "first-run-state");
  const descriptorPath = join(stateDirectory, "kernel.json");
  const server = await startKernelServer({ databasePath: join(stateDirectory, "kernel.sqlite"), descriptorPath, token: "test-token" });
  try {
    assert.match(server.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/u);
    assert.equal((await stat(descriptorPath)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(descriptorPath, "utf8")).token, "test-token");
    assert.equal(JSON.parse(await readFile(descriptorPath, "utf8")).graphSnapshotKey, undefined);
    assert.equal((await stat(server.graphDescriptorPath)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(server.graphDescriptorPath, "utf8")).graphBridgeToken, server.graphBridgeToken);
    const client = new KernelClient(await readKernelDescriptor(descriptorPath));
    assert.equal((await client.status()).status, "ok");
    const bootstrap = await client.agentBootstrap(); const publicJson = JSON.stringify(bootstrap);
    assert.equal(publicJson.includes("test-token"), false); assert.equal(publicJson.includes(server.graphSnapshotKey), false); assert.equal(publicJson.includes(server.graphBridgeToken), false); assert.equal(publicJson.includes("kernel.sqlite"), false);
    assert.equal((await fetch(`${server.baseUrl}/v1/graph-adapter/poll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ graphId: "graph" }) })).status, 401);
    assert.equal((await fetch(`${server.baseUrl}/v1/status`)).status, 401);
  } finally { await server.close(); }
  await assert.rejects(readFile(descriptorPath, "utf8"), /ENOENT/u);
  await assert.rejects(readFile(server.graphDescriptorPath, "utf8"), /ENOENT/u);
});
