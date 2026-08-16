import assert from "node:assert/strict";
import test from "node:test";

import { FORMAL_MARKER_GLYPH, FORMAL_MARKER_MAX_ACTIVE, formalMarkerTooltip, isFormalIdentity, markerSemanticKey } from "../src/formal-marker.ts";

test("ordinary blocks are not marker eligible", () => {
  assert.equal(isFormalIdentity({ kind: "ORDINARY" }), false);
  assert.equal(markerSemanticKey({ kind: "ORDINARY" }), "ORDINARY");
});

test("Task, MiniProject, and Project share one formal marker identity", () => {
  for (const objectKind of ["TASK", "MINI_PROJECT", "PROJECT"] as const) {
    const identity = { kind: "FORMAL" as const, workObjectId: `${objectKind}-1`, objectKind };
    assert.equal(isFormalIdentity(identity), true);
    assert.equal(markerSemanticKey(identity), "FORMAL");
    assert.ok(formalMarkerTooltip(identity).includes("Task Copilot"));
  }
});

test("marker glyph is one stable glyph for every kind", () => {
  assert.equal(FORMAL_MARKER_GLYPH, "◇");
  assert.ok(FORMAL_MARKER_MAX_ACTIVE > 100, "bounded but useful active marker budget");
});

test("tooltip exposes kind and user-facing state only, never internal ids", () => {
  const tooltip = formalMarkerTooltip({ kind: "FORMAL", workObjectId: "w-1", objectKind: "TASK", engagement: "WAITING" });
  assert.equal(tooltip, "Task Copilot · Task\n正在等待\n点击打开事项");
  assert.equal(tooltip.includes("w-1"), false);
  assert.equal(tooltip.includes("engagement"), false);
});

test("tooltip falls back to lifecycle copy when engagement is absent", () => {
  assert.equal(formalMarkerTooltip({ kind: "FORMAL", workObjectId: "m-1", objectKind: "MINI_PROJECT", lifecycle: "COMPLETED" }), "Task Copilot · MiniProject\n已完成\n点击打开事项");
  assert.equal(formalMarkerTooltip({ kind: "FORMAL", workObjectId: "p-1", objectKind: "PROJECT" }), "Task Copilot · Project\n点击打开事项");
});
