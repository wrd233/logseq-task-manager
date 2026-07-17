import assert from "node:assert/strict";
import test from "node:test";

import { checksum, createId, stableJson } from "../src/index.ts";

test("stable identifiers do not depend on note paths or content", () => {
  const time = new Date("2026-07-17T12:00:00.000Z");
  const entropy = "0123456789abcdef0123456789abcdef";
  assert.equal(createId("obj", time, entropy), `obj_20260717120000000_${entropy}`);
  assert.throws(() => createId("obj", time, "0123456789abcdef"), /128 bits/);
});

test("stable JSON and checksum detect changed persisted content", () => {
  assert.equal(stableJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.notEqual(checksum({ a: 1 }), checksum({ a: 2 }));
});
