import assert from "node:assert/strict";
import test from "node:test";

import { FORMAL_MARKER_GLYPH, FORMAL_MARKER_MAX_ACTIVE, FORMAL_MARKER_WARNING_GLYPH, formalMarkerTooltip, isFormalIdentity, isStableProjectionAnomaly, markerGlyphFor, markerSemanticKey } from "../src/formal-marker.ts";

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

test("warning consistency uses ◇! and user-facing projection warning tooltip", () => {
  const identity = { kind: "FORMAL" as const, workObjectId: "t-1", objectKind: "TASK" as const, consistency: "WARNING" as const };
  assert.equal(markerGlyphFor(identity), FORMAL_MARKER_WARNING_GLYPH);
  assert.equal(FORMAL_MARKER_WARNING_GLYPH, "◇!");
  const tooltip = formalMarkerTooltip(identity);
  assert.equal(tooltip, "Task Copilot · Task\n正式事项的 Logseq 显示可能未同步\n点击查看");
  assert.equal(tooltip.includes("t-1"), false);
  assert.equal(tooltip.includes("FAILED"), false);
});

test("normal consistency keeps the plain formal glyph", () => {
  assert.equal(markerGlyphFor({ kind: "FORMAL", workObjectId: "t-2", objectKind: "TASK" as const }), FORMAL_MARKER_GLYPH);
});

test("stable projection anomaly excludes transient retries and business states", () => {
  assert.equal(isStableProjectionAnomaly({ status: "PENDING", retryExhausted: false, nextAttemptAt: "later", lastError: null }), false);
  assert.equal(isStableProjectionAnomaly({ status: "APPLIED", retryExhausted: false, nextAttemptAt: null, lastError: null }), false);
  assert.equal(isStableProjectionAnomaly({ status: "VERIFIED", retryExhausted: false, nextAttemptAt: null, lastError: null }), false);
  assert.equal(isStableProjectionAnomaly({ status: "FAILED", retryExhausted: false, nextAttemptAt: "later", lastError: "GRAPH_ADAPTER_OFFLINE" }), false);
  assert.equal(isStableProjectionAnomaly({ status: "FAILED", retryExhausted: true, nextAttemptAt: null, lastError: "GRAPH_ADAPTER_OFFLINE" }), true);
  assert.equal(isStableProjectionAnomaly({ status: "FAILED", retryExhausted: false, nextAttemptAt: null, lastError: "PROJECTION_VERIFY_MISMATCH" }), true);
});
