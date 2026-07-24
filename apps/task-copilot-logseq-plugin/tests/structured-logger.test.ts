import assert from "node:assert/strict";
import test from "node:test";

import { StructuredLogger, createCorrelationId, privateContentEvidence } from "../src/structured-logger.ts";

test("structured logger correlates actions, keeps only structural error evidence, redacts content and bounds JSONL", () => {
  const logger = new StructuredLogger(2, { pluginVersion: "0.1.0", pluginCommit: "test" });
  const correlationId = createCorrelationId(new Date("2026-07-18T00:00:00Z"));
  const privateError = Object.assign(
    new Error("outer secret body", { cause: new Error("inner secret key") }),
    { code: "APPLICATION_COMMAND_FAILED" },
  );
  logger.log("info", "ui-action", "ui_action_clicked", { correlationId, actionId: "formalize", ...privateContentEvidence("secret body") });
  logger.log("error", "application-command", "application_command_failed", { correlationId }, privateError);
  logger.log("info", "query-refresh", "query_invalidated", { correlationId });
  const entries = logger.snapshot();
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.correlationId, correlationId);
  assert.equal(entries[0]?.errorName, "Error");
  assert.equal(entries[0]?.errorCode, "APPLICATION_COMMAND_FAILED");
  for (const privateValue of ["secret body", "inner secret key", "errorMessage", "stack", "cause"]) {
    assert.doesNotMatch(JSON.stringify(entries), new RegExp(privateValue));
  }
  assert.equal(logger.exportJsonl().split("\n").every((line) => Boolean(JSON.parse(line))), true);
});

test("structured logger ignores unsupported runtime fields and rejects free-text-shaped error codes", () => {
  const logger = new StructuredLogger();
  logger.log("error", "plugin-lifecycle", "unsafe_runtime_fields", {
    result: "error",
    errorCode: "private response body",
    ...({
      errorMessage: "private response body",
      stack: "private stack",
      cause: "private cause",
      content: "private content",
    } as object),
  });

  const exported = logger.exportJsonl();
  for (const privateValue of ["private response body", "private stack", "private cause", "private content"]) {
    assert.doesNotMatch(exported, new RegExp(privateValue));
  }
});

test("structured logger bounds capacity and normalizes runtime-invalid envelope values", (context) => {
  assert.throws(() => new StructuredLogger(0), /capacity/);
  assert.throws(() => new StructuredLogger(4097), /capacity/);
  const logger = new StructuredLogger();
  const warnings: string[] = [];
  context.mock.method(console, "warn", (...values: unknown[]) => warnings.push(JSON.stringify(values)));
  const unsafeLog = logger.log.bind(logger) as unknown as (
    level: string,
    category: string,
    event: string,
    fields?: object,
  ) => unknown;
  unsafeLog("private level", "private category", "private event body", {
    timestamp: "private timestamp",
    level: "private override",
    category: "private override",
    event: "private override",
  });

  const [entry] = logger.snapshot();
  assert.equal(entry?.level, "warn");
  assert.equal(entry?.category, "plugin-lifecycle");
  assert.equal(entry?.event, "invalid_event");
  assert.doesNotMatch(logger.exportJsonl(), /private/);
  assert.doesNotMatch(warnings.join("\n"), /private/);
});
