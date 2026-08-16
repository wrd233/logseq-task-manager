import assert from "node:assert/strict";
import test from "node:test";

import {
  clampSidebarWidth, DOCKED_MAIN_MIN_WIDTH, layoutModeFor, parseSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, sidebarLayoutSpec,
} from "../src/sidebar-layout.ts";

test("sidebar width clamps to the supported 300-520 range", () => {
  assert.equal(clampSidebarWidth(240), SIDEBAR_MIN_WIDTH);
  assert.equal(clampSidebarWidth(640), SIDEBAR_MAX_WIDTH);
  assert.equal(clampSidebarWidth(384), 384);
  assert.equal(clampSidebarWidth(384.6), 385);
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_DEFAULT_WIDTH);
});

test("persisted width parsing rejects malformed values and clamps outliers", () => {
  assert.equal(parseSidebarWidth("420"), 420);
  assert.equal(parseSidebarWidth(360), 360);
  assert.equal(parseSidebarWidth(""), SIDEBAR_DEFAULT_WIDTH);
  assert.equal(parseSidebarWidth(null), SIDEBAR_DEFAULT_WIDTH);
  assert.equal(parseSidebarWidth("900"), SIDEBAR_MAX_WIDTH);
  assert.equal(parseSidebarWidth("200"), SIDEBAR_MIN_WIDTH);
});

test("layout mode docks only when main content keeps a comfortable width", () => {
  // 1024 viewport, 420 sidebar leaves 604 for main content (>= 560).
  assert.equal(layoutModeFor({ viewportWidth: 1024, sidebarWidth: 420 }), "DOCKED");
  // 900 viewport, 420 sidebar leaves 480 (< 560) so compact single-panel wins.
  assert.equal(layoutModeFor({ viewportWidth: 900, sidebarWidth: 420 }), "COMPACT");
  // Minimum sidebar still docks at 860.
  assert.equal(layoutModeFor({ viewportWidth: 860, sidebarWidth: 300 }), "DOCKED");
  assert.equal(layoutModeFor({ viewportWidth: 859, sidebarWidth: 300 }), "COMPACT");
});

test("reserved Logseq sidebars reduce the available main width", () => {
  assert.equal(layoutModeFor({ viewportWidth: 1024, sidebarWidth: 420, rightReserved: 410 }), "COMPACT");
  assert.equal(layoutModeFor({ viewportWidth: 1440, sidebarWidth: 420, rightReserved: 410 }), "DOCKED");
  assert.equal(layoutModeFor({ viewportWidth: 1440, sidebarWidth: 420, leftReserved: 246, rightReserved: 410 }), "COMPACT");
});

test("docked geometry puts the panel against the reserved right edge without covering content", () => {
  const spec = sidebarLayoutSpec({ viewportWidth: 1024, sidebarWidth: 420 });
  assert.deepEqual(spec, {
    mode: "DOCKED", sidebarWidth: 420, leftReserved: 0, rightReserved: 0,
    availableMain: 1024, panelLeft: 604, panelRight: 0, panelWidth: 420,
  });
  const withLeft = sidebarLayoutSpec({ viewportWidth: 1440, sidebarWidth: 384, leftReserved: 246 });
  assert.equal(withLeft.mode, "DOCKED");
  assert.equal(withLeft.panelLeft, 1440 - 384);
  assert.equal(withLeft.availableMain, 1440 - 246);
});

test("compact geometry fills exactly the main area between reserved sidebars", () => {
  const spec = sidebarLayoutSpec({ viewportWidth: 1024, sidebarWidth: 420, leftReserved: 246, rightReserved: 410 });
  assert.deepEqual(spec, {
    mode: "COMPACT", sidebarWidth: 420, leftReserved: 246, rightReserved: 410,
    availableMain: 368, panelLeft: 246, panelRight: 410, panelWidth: 368,
  });
});

test("geometry survives degenerate inputs without negative rectangles", () => {
  const spec = sidebarLayoutSpec({ viewportWidth: 240, sidebarWidth: Number.NaN, leftReserved: 999, rightReserved: 999 });
  assert.equal(spec.mode, "COMPACT");
  assert.equal(spec.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
  assert.equal(spec.panelWidth, 0);
  assert.equal(spec.panelLeft, 999);
  assert.equal(spec.panelRight, 999);
});

test("main minimum width constant is explicit and non-zero", () => {
  assert.equal(DOCKED_MAIN_MIN_WIDTH, 560);
});
