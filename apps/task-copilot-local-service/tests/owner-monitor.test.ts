import assert from "node:assert/strict";
import test from "node:test";

import { startOwnerMonitor } from "../src/owner-monitor.ts";

test("owner monitor closes once when the exact Launcher pid disappears", async () => {
  let alive = true;
  let closes = 0;
  const monitor = startOwnerMonitor(1234, async () => { closes += 1; }, {
    intervalMs: 2,
    isAlive: () => alive,
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(closes, 0);
  alive = false;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(closes, 1);
  monitor.stop();
});

test("owner monitor validates pid and explicit stop prevents a later close", async () => {
  assert.throws(() => startOwnerMonitor(0, async () => undefined), /SERVICE_OWNER_PID_INVALID/);
  let closes = 0;
  const monitor = startOwnerMonitor(1234, async () => { closes += 1; }, {
    intervalMs: 2,
    isAlive: () => false,
  });
  monitor.stop();
  await new Promise((resolve) => setTimeout(resolve, 8));
  assert.equal(closes, 0);
});
