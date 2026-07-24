import assert from "node:assert/strict";
import test from "node:test";

import { GrillPreviewSessionStore } from "../src/grill-preview-session.ts";

test("preview handles are bounded, session-only, expiring, and capacity-limited", () => {
  let now = 1_000;
  let next = 1;
  const store = new GrillPreviewSessionStore<{ id: number }>(() => now, 100, 2, () => `grill_preview_${String(next++).padStart(24, "a")}`);
  const first = store.issue({ id: 1 });
  const second = store.issue({ id: 2 });
  assert.deepEqual(store.get(first), { id: 1 });
  const third = store.issue({ id: 3 });
  assert.equal(store.get(second), undefined, "least recently used handle is evicted");
  assert.deepEqual(store.get(third), { id: 3 });
  now += 101;
  assert.equal(store.get(first), undefined);
  assert.equal(store.get(third), undefined);
});

test("clear models Service restart and invalid handles never become authority", () => {
  const store = new GrillPreviewSessionStore(() => 1_000, 100, 2, () => "grill_preview_aaaaaaaaaaaaaaaaaaaaaaaa");
  const handle = store.issue({ ok: true });
  store.clear();
  assert.equal(store.get(handle), undefined);
  assert.throws(() => new GrillPreviewSessionStore(() => 1_000, 100, 2, () => "bad").issue({ ok: true }), /invalid/);
});
