import assert from "node:assert/strict";
import test from "node:test";

import { settleRuntimeBridgeCall } from "../src/runtime-bridge-guard.ts";

test("runtime bridge guard preserves a timely result", async () => {
  assert.equal(await settleRuntimeBridgeCall(Promise.resolve("0.10.15"), 20), "0.10.15");
});

test("runtime bridge guard releases bootstrap when an early Logseq call never settles", async () => {
  const never = new Promise<string>(() => undefined);
  const startedAt = Date.now();
  assert.equal(await settleRuntimeBridgeCall(never, 10), undefined);
  assert.ok(Date.now() - startedAt < 200, "the bootstrap guard should remain bounded");
});

test("runtime bridge guard preserves explicit bridge failures", async () => {
  await assert.rejects(
    settleRuntimeBridgeCall(Promise.reject(new Error("bridge unavailable")), 20),
    /bridge unavailable/,
  );
});
