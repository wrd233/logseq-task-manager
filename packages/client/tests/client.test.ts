import assert from "node:assert/strict";
import test from "node:test";

import { KernelClient, parseKernelDescriptor, parsePluginKernelDescriptor } from "../src/index.ts";

test("client sends the capability token but has no database path or database API", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({ status: "ok", schemaVersion: 1, pid: 42 }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new KernelClient({ schemaVersion: 1, baseUrl: "http://127.0.0.1:1234", token: "secret", pid: 42, startedAt: "now" });
    assert.equal((await client.status()).status, "ok");
    assert.equal(authorization, "Bearer secret");
    assert.equal("database" in client, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("the CLI descriptor parser drops Graph capabilities while the Plugin parser requires them", () => {
  const raw = { schemaVersion: 1, baseUrl: "http://127.0.0.1:1234", token: "secret", pid: 42, startedAt: "now", graphSnapshotKey: "a".repeat(64), graphBridgeToken: "b".repeat(64) };
  const cli = parseKernelDescriptor(raw);
  assert.equal("graphSnapshotKey" in cli, false);
  assert.equal("graphBridgeToken" in cli, false);
  assert.equal(parsePluginKernelDescriptor(raw).graphBridgeToken, "b".repeat(64));
  assert.throws(() => parsePluginKernelDescriptor(cli), /PLUGIN_DESCRIPTOR_INVALID/u);
});
