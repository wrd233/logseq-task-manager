import assert from "node:assert/strict";
import test from "node:test";

import { StructuredLogger, createCorrelationId, privateContentEvidence } from "../src/structured-logger.ts";

test("structured logger correlates actions, preserves causes, redacts content and bounds JSONL", () => {
  const logger = new StructuredLogger(2, { pluginVersion: "0.1.0", pluginCommit: "test" });
  const correlationId = createCorrelationId(new Date("2026-07-18T00:00:00Z"));
  logger.log("info", "ui-action", "ui_action_clicked", { correlationId, actionId: "formalize", ...privateContentEvidence("secret body") });
  logger.log("error", "application-command", "application_command_failed", { correlationId }, new Error("outer", { cause: new Error("inner") }));
  logger.log("info", "query-refresh", "query_invalidated", { correlationId });
  const entries = logger.snapshot();
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.correlationId, correlationId);
  assert.match(entries[0]?.cause ?? "", /inner/);
  assert.equal(JSON.stringify(entries).includes("secret body"), false);
  assert.equal(logger.exportJsonl().split("\n").every((line) => Boolean(JSON.parse(line))), true);
});
