import assert from "node:assert/strict";
import test from "node:test";

import { runProjectClosureLiveGate } from "../src/project-closure-live.ts";

test("Project Closure live gate is opt-in and makes zero Provider calls by default", async () => {
  let providerCalls = 0;
  await assert.rejects(
    () => runProjectClosureLiveGate({}, {
      providerId: "deepseek",
      providerVersion: "chat-completions-v1",
      completeStructured: async () => {
        providerCalls += 1;
        throw new Error("must not run");
      },
    }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "PROJECT_CLOSURE_LIVE_GATE_DISABLED",
  );
  assert.equal(providerCalls, 0);
});
