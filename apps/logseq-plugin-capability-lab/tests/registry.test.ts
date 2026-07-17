import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyRegistry, parseRegistry, registerBlock, registerPage,
  registerStorageKey, removeBlockAssets, removeStorageKey,
} from "../src/registry.ts";

const now = "2026-07-17T00:00:00.000Z";

test("empty and corrupt registries degrade without throwing", () => {
  assert.equal(parseRegistry(undefined, now).degraded, false);
  const corrupt = parseRegistry("{broken", now);
  assert.equal(corrupt.degraded, true);
  assert.equal(corrupt.registry.schemaVersion, 1);
  assert.deepEqual(corrupt.registry.blocks, []);
  assert.equal(parseRegistry(JSON.stringify({ schemaVersion: 99 }), now).degraded, true);
  const damagedV1 = parseRegistry(JSON.stringify({ schemaVersion: 1, pages: {}, blocks: [], updatedAt: now }), now);
  assert.equal(damagedV1.degraded, true);
  assert.match(damagedV1.warnings.join(" "), /pages field/);
  assert.match(damagedV1.warnings.join(" "), /storageKeys field/);
});

test("legacy UUID registry migrates conservatively with unresolved page identity", () => {
  const result = parseRegistry(JSON.stringify({ createdUuids: ["old-1", "old-2"], updatedAt: now }), now);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.registry.blocks.map((item) => item.blockUuid), ["old-1", "old-2"]);
  assert.ok(result.registry.blocks.every((item) => item.pageUuid === ""));
  const roundTrip = parseRegistry(JSON.stringify(result.registry), now);
  assert.equal(roundTrip.registry.blocks.length, 2, "unresolved legacy assets must survive schema-v1 persistence");
});

test("registry tracks multiple pages, blocks, and FileStorage keys across setting changes", () => {
  let registry = emptyRegistry(now);
  registry = registerPage(registry, { pageUuid: "page-a", pageNameAtCreation: "Task Copilot Lab/A", labPageId: "lab-a", createdAt: now }, now);
  registry = registerPage(registry, { pageUuid: "page-b", pageNameAtCreation: "Task Copilot Lab/B", labPageId: "lab-b", createdAt: now }, now);
  registry = registerBlock(registry, { blockUuid: "block-a", pageUuid: "page-a", runId: "run-a", createdAt: now }, now);
  registry = registerStorageKey(registry, "capability-lab/storage-probe.json", now);
  assert.deepEqual(registry.pages.map((item) => item.pageUuid), ["page-a", "page-b"]);
  assert.equal(registry.blocks[0]?.pageUuid, "page-a");
  assert.deepEqual(registry.storageKeys, ["capability-lab/storage-probe.json"]);
  registry = removeStorageKey(registry, "capability-lab/storage-probe.json", now);
  registry = removeBlockAssets(registry, new Set(["block-a"]), now);
  assert.deepEqual(registry.storageKeys, []);
  assert.deepEqual(registry.blocks, []);
});

test("legacy page identity remains unresolved until an explicit out-of-band recovery", () => {
  const migrated = parseRegistry(JSON.stringify({ createdUuids: ["old-1"] }), now).registry;
  assert.equal(migrated.blocks[0]?.pageUuid, "");
});
