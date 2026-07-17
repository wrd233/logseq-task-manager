import assert from "node:assert/strict";
import test from "node:test";

import { checksum, createId, stableJson } from "../src/index.ts";

test("stable identifiers do not depend on note paths or content", () => {
  const time = new Date("2026-07-17T12:00:00.000Z");
  assert.equal(createId("obj", time, "0123456789abcdef"), "obj_20260717120000000_0123456789abcdef");
});

test("stable JSON and checksum detect changed persisted content", () => {
  assert.equal(stableJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.notEqual(checksum({ a: 1 }), checksum({ a: 2 }));
});
