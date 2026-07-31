import assert from "node:assert/strict";
import test from "node:test";

import {
  clearDurableOrigin,
  DURABLE_ORIGIN_STORAGE_KEY,
  loadDurableOrigin,
  saveDurableOrigin,
  type DurableOriginStorage,
} from "../src/durable-origin-storage.ts";

const graphKey = `graph-${"a".repeat(64)}`;

function storage(initial?: string): DurableOriginStorage & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  if (initial !== undefined) values.set(DURABLE_ORIGIN_STORAGE_KEY, initial);
  return {
    values,
    getItem: async (key) => values.get(key),
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
}

test("durable origin round-trips one graph-bound Block identity without route fragments", async () => {
  const target = storage();
  const token = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "block-uuid",
    pageUuid: "page-uuid",
    pageName: "Renamed Page",
  };
  await saveDurableOrigin(target, graphKey, token);
  assert.deepEqual(await loadDurableOrigin(target, graphKey), token);
  const raw = String(target.values.get(DURABLE_ORIGIN_STORAGE_KEY));
  assert.doesNotMatch(raw, /anchor=|block-content-|#\/page/u);
});

test("durable origin refuses another graph, extra fields, malformed data, and unsafe identities", async () => {
  const target = storage();
  await saveDurableOrigin(target, graphKey, {
    kind: "PAGE", surface: "SECONDARY_PAGE", pageUuid: "page-uuid", pageName: "Project/Renamed",
  });
  assert.equal(await loadDurableOrigin(target, `graph-${"b".repeat(64)}`), undefined);

  target.values.set(DURABLE_ORIGIN_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    graphKey,
    token: { kind: "PAGE", surface: "MAIN_PAGE", pageUuid: "page", pageName: "name", route: "/page/page" },
  }));
  assert.equal(await loadDurableOrigin(target, graphKey), undefined);
  target.values.set(DURABLE_ORIGIN_STORAGE_KEY, "not-json");
  assert.equal(await loadDurableOrigin(target, graphKey), undefined);
  await assert.rejects(
    saveDurableOrigin(target, graphKey, { kind: "PAGE", surface: "MAIN_PAGE", pageUuid: "bad\npage", pageName: "name" }),
    /DURABLE_ORIGIN_INVALID/u,
  );
});

test("clearing a durable origin removes only its fixed private storage key", async () => {
  const target = storage("value");
  target.values.set("unrelated", "keep");
  await clearDurableOrigin(target);
  assert.equal(target.values.has(DURABLE_ORIGIN_STORAGE_KEY), false);
  assert.equal(target.values.get("unrelated"), "keep");
});
