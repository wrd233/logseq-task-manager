import assert from "node:assert/strict";
import test from "node:test";

import { recoverServiceRuntime } from "../src/service-runtime-recovery.ts";

test("runtime recovery retries restricted discovery until the Launcher can issue a new lease", async () => {
  let attempts = 0;
  const waits: number[] = [];

  const recovered = await recoverServiceRuntime({
    refresh: async () => { attempts += 1; },
    ready: () => attempts >= 3,
    wait: async (milliseconds) => { waits.push(milliseconds); },
    maximumAttempts: 5,
  });

  assert.equal(recovered, true);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [250, 500]);
});

test("runtime recovery is bounded and does not wait after its final failed attempt", async () => {
  let attempts = 0;
  const waits: number[] = [];

  const recovered = await recoverServiceRuntime({
    refresh: async () => { attempts += 1; },
    ready: () => false,
    wait: async (milliseconds) => { waits.push(milliseconds); },
    maximumAttempts: 4,
  });

  assert.equal(recovered, false);
  assert.equal(attempts, 4);
  assert.deepEqual(waits, [250, 500, 750]);
});

test("runtime recovery keeps retrying when one discovery attempt throws", async () => {
  let attempts = 0;
  const recovered = await recoverServiceRuntime({
    refresh: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("launcher is restarting");
    },
    ready: () => attempts >= 2,
    wait: async () => undefined,
    maximumAttempts: 3,
  });

  assert.equal(recovered, true);
  assert.equal(attempts, 2);
});
