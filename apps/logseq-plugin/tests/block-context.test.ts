import assert from "node:assert/strict";
import test from "node:test";

import {
  BlockIdentityCache, buildBlockIdentityIndex, contextActionsFor, CONTEXT_ACTION_LABELS,
  DEFAULT_BLOCK_CONTEXT_STALENESS_MS,
} from "../src/block-context.ts";

test("anchor index classifies primary anchors and ignores incomplete entries", () => {
  const index = buildBlockIdentityIndex([
    { object: { id: "task-1", kind: "TASK" }, anchor: { externalId: "block-a" } },
    { object: { id: "mini-1", kind: "MINI_PROJECT" }, anchor: { externalId: "block-b" } },
    { object: { id: "project-1", kind: "PROJECT" }, anchor: { externalId: "block-c" } },
    { object: { id: "task-2", kind: "TASK" }, anchor: null },
    { object: { id: "", kind: "TASK" }, anchor: { externalId: "block-d" } },
  ]);
  assert.deepEqual(index.get("block-a"), { kind: "FORMAL", workObjectId: "task-1", objectKind: "TASK" });
  assert.deepEqual(index.get("block-b"), { kind: "FORMAL", workObjectId: "mini-1", objectKind: "MINI_PROJECT" });
  assert.deepEqual(index.get("block-c"), { kind: "FORMAL", workObjectId: "project-1", objectKind: "PROJECT" });
  assert.equal(index.has("block-d"), false);
});

test("cache lookup defaults unknown blocks to ordinary", () => {
  const cache = new BlockIdentityCache();
  assert.deepEqual(cache.lookup("missing"), { kind: "ORDINARY" });
  assert.equal(cache.lookupFormal("missing"), null);
  assert.equal(cache.size(), 0);
});

test("cache refresh, invalidation, and revision work as a presentation cache", () => {
  const cache = new BlockIdentityCache();
  const revision0 = cache.revision;
  cache.replace([{ object: { id: "task-1", kind: "TASK" }, anchor: { externalId: "block-a" } }], 1_000);
  assert.deepEqual(cache.lookup("block-a"), { kind: "FORMAL", workObjectId: "task-1", objectKind: "TASK" });
  assert.ok(cache.revision > revision0);
  cache.invalidate("block-a");
  assert.deepEqual(cache.lookup("block-a"), { kind: "ORDINARY" });
  assert.equal(cache.size(), 0);
});

test("cache staleness is time based and misses are stale", () => {
  const cache = new BlockIdentityCache();
  assert.equal(cache.isStale("missing", 10), true);
  cache.setFormal("block-a", { kind: "FORMAL", workObjectId: "task-1", objectKind: "TASK" }, 1_000);
  assert.equal(cache.isStale("block-a", 1_000 + DEFAULT_BLOCK_CONTEXT_STALENESS_MS - 1), false);
  assert.equal(cache.isStale("block-a", 1_000 + DEFAULT_BLOCK_CONTEXT_STALENESS_MS + 1), true);
});

test("ordinary blocks only get two formalize actions", () => {
  assert.deepEqual(contextActionsFor({ kind: "ORDINARY" }), ["FORMALIZE_TASK", "FORMALIZE_MINI_PROJECT"]);
});

test("Task and MiniProject blocks share three core actions", () => {
  const expected = ["OPEN_OBJECT", "DISCUSS_OBJECT", "RECONCILE_OBJECT"];
  assert.deepEqual(contextActionsFor({ kind: "FORMAL", workObjectId: "task-1", objectKind: "TASK" }), expected);
  assert.deepEqual(contextActionsFor({ kind: "FORMAL", workObjectId: "mini-1", objectKind: "MINI_PROJECT" }), expected);
});

test("Project blocks keep open and discuss only", () => {
  assert.deepEqual(contextActionsFor({ kind: "FORMAL", workObjectId: "project-1", objectKind: "PROJECT" }), ["OPEN_OBJECT", "DISCUSS_OBJECT"]);
});

test("menu labels are user-facing and contain no internal terms", () => {
  for (const label of Object.values(CONTEXT_ACTION_LABELS)) {
    assert.equal(/Formalize|Reconcile|ObjectContext|Anchor/iu.test(label), false, label);
    assert.ok(label.startsWith("Task Copilot："), label);
  }
});
