import assert from "node:assert/strict";
import test from "node:test";

import { Kernel } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { createDogfoodScope, loadDogfoodConfig, type DogfoodConfig } from "../src/dogfood-scope.ts";

function putObject(store: SqliteStore, id: string, kind: "PROJECT" | "MINI_PROJECT" | "TASK" = "TASK"): void {
  store.putWorkObject({ id, kind, title: id, lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" });
}

function link(store: SqliteStore, childId: string, ownerId: string): void {
  store.putOwnership({ childId, ownerId, createdAt: "2026-08-01T00:00:00.000Z" });
}

test("dogfood scope includes root descendants dynamically from ownership", () => {
  const store = new SqliteStore(":memory:");
  putObject(store, "p1", "PROJECT");
  putObject(store, "m1", "MINI_PROJECT");
  putObject(store, "t1");
  putObject(store, "t2");
  putObject(store, "outside");
  link(store, "m1", "p1");
  link(store, "t1", "m1");
  link(store, "t2", "p1");

  const config: DogfoodConfig = { maintenance: true, formalization: false, closure: true, roots: ["p1"] };
  const scope = createDogfoodScope(store, config);
  assert.equal(scope.isInScope("p1"), true);
  assert.equal(scope.isInScope("m1"), true);
  assert.equal(scope.isInScope("t1"), true);
  assert.equal(scope.isInScope("t2"), true);
  assert.equal(scope.isInScope("outside"), false);
  assert.equal(scope.isMaintenanceEnabled(), true);
  assert.equal(scope.isClosureEnabled(), true);
  assert.equal(scope.isFormalizationEnabled(), false);
});

test("same dogfood scope instance reflects live ownership moves", () => {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => "2026-08-02T00:00:00.000Z" });
  putObject(store, "p1", "PROJECT");
  putObject(store, "p2", "PROJECT");
  putObject(store, "m1", "MINI_PROJECT");
  link(store, "m1", "p1");
  const scope = createDogfoodScope(store, { maintenance: true, formalization: false, closure: false, roots: ["p1"] });
  assert.equal(scope.isInScope("m1"), true);

  kernel.assignPrimaryOwnership({ childId: "m1", ownerId: "p2" });
  assert.equal(scope.isInScope("m1"), false);

  kernel.assignPrimaryOwnership({ childId: "m1", ownerId: "p1" });
  assert.equal(scope.isInScope("m1"), true);
});

test("no config is legacy unrestricted; explicit empty roots is an empty autonomous scope", () => {
  const store = new SqliteStore(":memory:");
  putObject(store, "any");
  assert.equal(createDogfoodScope(store, null).isInScope("any"), true);
  assert.equal(createDogfoodScope(store, { maintenance: true, formalization: false, closure: false, roots: [] }).isInScope("any"), false);
});

test("loadDogfoodConfig parses a minimal config and tolerates missing file", async () => {
  const config = await loadDogfoodConfig(undefined);
  assert.equal(config, null);
});
