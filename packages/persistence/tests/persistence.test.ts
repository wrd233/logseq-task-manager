import assert from "node:assert/strict";
import test from "node:test";

import { createManagedObject, type Anchor, type DomainEvent, type ObjectRelation } from "@task-copilot/domain";

import {
  CorruptionError,
  MemoryBlobStore,
  VersionedStateRepository,
  createEmptyState,
  exportRecoveryBundle,
  restoreRecoveryBundle,
} from "../src/index.ts";

test("versioned state uses checksummed slots and keeps the last committed generation", async () => {
  const blobs = new MemoryBlobStore();
  const repository = new VersionedStateRepository(blobs);
  const state = createEmptyState();
  state.objects.push(createManagedObject({ objectId: "obj_1", objectType: "TASK", text: "保留正文" }));
  await repository.save(state);
  const restored = await repository.load();
  assert.equal(restored.objects[0]?.text, "保留正文");
  assert.equal(restored.revision, 1);
});

test("corrupted active payload is detected rather than silently accepted", async () => {
  const blobs = new MemoryBlobStore();
  const repository = new VersionedStateRepository(blobs);
  await repository.save(createEmptyState());
  const manifest = JSON.parse((await blobs.get("task-copilot/state/manifest.json")) ?? "") as { activeSlot: string };
  await blobs.set(`task-copilot/state/${manifest.activeSlot}.json`, "{damaged");
  await assert.rejects(repository.load(), CorruptionError);
});

test("recovery bundle restores objects, relations, events and reports missing anchors", () => {
  const state = createEmptyState();
  state.objects.push(createManagedObject({ objectId: "obj_1", objectType: "TASK", text: "恢复演练" }));
  state.relations.push({
    relationId: "rel_1",
    fromObjectId: "obj_1",
    toObjectId: "obj_2",
    relationType: "related_to",
    createdAt: "2026-07-17T00:00:00.000Z",
    status: "ACTIVE",
  } satisfies ObjectRelation);
  state.anchors.push({
    anchorId: "anc_1",
    objectId: "obj_1",
    adapter: "logseq",
    graphId: "graph_1",
    externalId: "block_1",
    role: "primary_text",
    contentHash: "abc",
    lastSeenAt: "2026-07-17T00:00:00.000Z",
    status: "missing",
  } satisfies Anchor);
  state.events.push({
    eventId: "event_1",
    timestamp: "2026-07-17T00:00:00.000Z",
    actor: "user",
    objectId: "obj_1",
    operationType: "object_created",
    payload: {},
    ruleRefs: ["SEM-COMMON-001"],
    reversible: true,
  } satisfies DomainEvent);
  const bundle = exportRecoveryBundle(state, new Date("2026-07-17T12:00:00.000Z"));
  const restored = restoreRecoveryBundle(bundle);
  assert.equal(restored.state.objects.length, 1);
  assert.equal(restored.state.relations.length, 1);
  assert.equal(restored.state.events.length, 1);
  assert.deepEqual(restored.anchorReport.missing, ["anc_1"]);
  assert.deepEqual(restored.differences, []);
});
