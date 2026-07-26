import assert from "node:assert/strict";
import test from "node:test";

import type { ExplicitSyncTransport } from "../src/explicit-sync-controller.ts";
import { V2RebindCaptureController } from "../src/v2-rebind-capture.ts";

function harness() {
  let callback: (() => void) | undefined;
  let pauses = 0;
  let resumes = 0;
  let cleared = 0;
  const transport = {} as ExplicitSyncTransport;
  const sync = {
    pause: () => { pauses += 1; },
    resume: async (received: ExplicitSyncTransport) => {
      assert.equal(received, transport);
      resumes += 1;
    },
  };
  const clock = {
    setTimeout: (next: () => void) => {
      callback = next;
      return "timer";
    },
    clearTimeout: (handle: unknown) => {
      assert.equal(handle, "timer");
      cleared += 1;
      callback = undefined;
    },
  };
  return {
    sync,
    transport,
    clock,
    fire: () => callback?.(),
    counts: () => ({ pauses, resumes, cleared }),
  };
}

test("Rebind capture pauses once, refreshes its bounded timer, and resumes once on finish", async () => {
  const host = harness();
  const controller = new V2RebindCaptureController(async () => undefined, host.clock, 1000);
  controller.begin(host.sync);
  controller.begin(host.sync);
  assert.equal(controller.active, true);
  assert.deepEqual(host.counts(), { pauses: 1, resumes: 0, cleared: 1 });
  await controller.finish(host.sync, host.transport);
  assert.equal(controller.active, false);
  assert.deepEqual(host.counts(), { pauses: 1, resumes: 1, cleared: 2 });
  await controller.finish(host.sync, host.transport);
  assert.equal(host.counts().resumes, 1);
});

test("Rebind capture expiry delegates recovery while abandon never resumes stale transport", async () => {
  const host = harness();
  let expired = 0;
  const controller = new V2RebindCaptureController(async () => {
    expired += 1;
    await controller.finish(host.sync, host.transport);
  }, host.clock, 1000);
  controller.begin(host.sync);
  host.fire();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  assert.equal(expired, 1);
  assert.equal(controller.active, false);
  assert.equal(host.counts().resumes, 1);

  controller.begin(host.sync);
  controller.abandon();
  assert.equal(controller.active, false);
  assert.equal(host.counts().resumes, 1);
});
