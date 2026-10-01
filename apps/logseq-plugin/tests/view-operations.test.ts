import test from "node:test";
import assert from "node:assert/strict";
import { applyPresentation, type ViewPresentation } from "../src/features/work-view/operations.ts";

const state: ViewPresentation = {items: [{uuid: "r", depth: 0}, {uuid: "a", depth: 1}, {uuid: "b", depth: 1}], collapsed: [], overrides: {}, expanded: [], selected: ""};
const scope = {graph: "g", root: "r", seq: 2};
const operation = {graph: "g", root: "r", expectedSeq: 2};
test("view operations reject stale scopes, source sync and research writers", () => {
  assert.deepEqual(applyPresentation(state, {...operation, type: "collapse", uuid: "a", graph: "other"}, scope), {ok: false, reason: "scope-mismatch"});
  assert.deepEqual(applyPresentation(state, {...operation, type: "collapse", uuid: "a", expectedSeq: 1}, scope), {ok: false, reason: "stale-view"});
  for (const type of ["sync-source", "sync-preview", "insert-object", "delete-object", "git-commit", "history", "host-css"]) assert.deepEqual(applyPresentation(state, {...operation, type}, scope), {ok: false, reason: "unsupported-presentation-operation"});
});
test("view layout cannot change membership, root or introduce invalid topology", () => {
  for (const items of [[{uuid: "a", depth: 0}, {uuid: "r", depth: 1}, {uuid: "b", depth: 1}], [{uuid: "r", depth: 0}, {uuid: "a", depth: 3}, {uuid: "b", depth: 1}], [{uuid: "r", depth: 0}, {uuid: "a", depth: 1}, {uuid: "a", depth: 1}]]) assert.equal(applyPresentation(state, {...operation, type: "layout", items}, scope).ok, false);
  assert.equal(applyPresentation(state, {...operation, type: "reorder", uuid: "r", target: "a"}, scope).ok, false);
});
test("accepted view operations preserve original input and adjust only presentation", () => {
  const before = JSON.stringify(state);
  const moved = applyPresentation(state, {...operation, type: "reorder", uuid: "b", target: "a", mode: "child"}, scope);
  assert.equal(moved.ok, true); if (moved.ok) assert.equal(moved.state.items[2]?.depth, 2);
  const display = applyPresentation(state, {...operation, type: "display", uuid: "a", level: "quiet"}, scope);
  assert.equal(display.ok, true); if (display.ok) assert.equal(display.state.overrides.a, "quiet");
  assert.equal(JSON.stringify(state), before);
});
