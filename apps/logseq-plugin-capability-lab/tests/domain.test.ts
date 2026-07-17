import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITY_MARKER,
  DEFAULT_EXPERIMENT_PAGE,
  OWNER_MARKER,
  canDeleteBlock,
  formatError,
  isCapabilityLabContent,
  makeExperimentContent,
  normalizeSettings,
  summarizeText,
} from "../src/domain.ts";

test("normalizeSettings applies safe defaults and trims the dedicated page", () => {
  assert.deepEqual(normalizeSettings(undefined), {
    verboseLogging: false,
    experimentPageName: DEFAULT_EXPERIMENT_PAGE,
    confirmWrites: true,
  });
  assert.equal(normalizeSettings({ experimentPageName: "  Lab Page  " }).experimentPageName, "Lab Page");
});

test("experiment content always includes both deletion safety markers", () => {
  const content = makeExperimentContent("Block CRUD", "run-1");
  assert.match(content, /Block CRUD/);
  assert.ok(content.includes(CAPABILITY_MARKER));
  assert.ok(content.includes(OWNER_MARKER));
  assert.equal(isCapabilityLabContent(content), true);
});

test("deletion requires registry membership, markers, and exact experiment page", () => {
  const content = makeExperimentContent("Delete", "run-2");
  const created = new Set(["safe-uuid"]);
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content, pageName: DEFAULT_EXPERIMENT_PAGE }, created, DEFAULT_EXPERIMENT_PAGE).allowed, true);
  assert.equal(canDeleteBlock({ uuid: "other", content, pageName: DEFAULT_EXPERIMENT_PAGE }, created, DEFAULT_EXPERIMENT_PAGE).allowed, false);
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content: "ordinary note", pageName: DEFAULT_EXPERIMENT_PAGE }, created, DEFAULT_EXPERIMENT_PAGE).allowed, false);
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content, pageName: "Project/Real" }, created, DEFAULT_EXPERIMENT_PAGE).allowed, false);
});

test("errors and unavailable text have deterministic display forms", () => {
  assert.equal(formatError(new Error("boom")), "Error: boom");
  assert.equal(formatError("plain"), "plain");
  assert.equal(summarizeText(null), "当前不可用");
  assert.equal(summarizeText("abcd", 4), "abcd");
  assert.equal(summarizeText("abcde", 4), "abc…");
});
