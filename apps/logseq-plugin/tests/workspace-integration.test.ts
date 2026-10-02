import test from "node:test";
import assert from "node:assert/strict";
import { contentFixture } from "./fixtures/content-writeback.ts";
import { sourceHash, validateLensSource } from "../src/features/work-view/lens-source.ts";
import type { LensSourceSnapshot } from "../src/features/work-view/lens-source.ts";
import { validateFocusPlan } from "../src/features/work-view/lens-plan.ts";

test("lenses can consume actual SDK snapshots rooted below a parent or at a later page sibling", async () => {
  const f = await contentFixture();
  try {
    const sibling = f.add("another page block", "");
    for (const rootUuid of [f.a, f.b, sibling.uuid]) {
      const scope = {...f.scope, rootUuid};
      const actual = (await f.adapter.read(scope, () => true)).snapshot;
      const source = await validateLensSource(actual, scope);
      assert.deepEqual(source.blocks, actual.blocks);
      assert.equal(source.structureVersion, actual.structureVersion);
      const root = source.blocks[0]!;
      const request = {schemaVersion: 1 as const, requestId: "real-root", question: "选定范围", scope};
      const focus = validateFocusPlan({...request, structureVersion: source.structureVersion,
        sourceVersions: [{sourceId: root.sourceId, contentVersion: root.contentVersion!}],
        visibleRanges: [{unit: "block", sourceId: root.sourceId, contentVersion: root.contentVersion!}],
      }, source, request);
      assert.deepEqual([...focus.selected], [rootUuid]);
      assert.equal(focus.ancestors.size, 0); // The parent outside this scope confers no membership.
    }
    assert.equal(f.counts().writes, 0); assert.equal(f.counts().identities, 0);
  } finally { await f.cleanup(); }
});

test("actual nested-root provider supports descendant focus without including its outside parent", async () => {
  const f = await contentFixture(), child = f.add("nested natural record", f.a);
  const {WorkView} = await import("../src/features/work-view/controller.ts");
  const work = new WorkView(() => undefined, {source: {read: async scope => (await f.adapter.read(scope, () => true)).snapshot}});
  try {
    await work.open(f.a);
    assert.equal((await work.lensesAPI.select(child.uuid)).ok, true);
    const selected = work.lensesAPI.read();
    assert.equal(selected.phase, "focused");
    assert.equal(selected.plan!.sourceVersions.length, 2);
    assert.equal(selected.plan!.sourceVersions.some(version => version.sourceId.includes(f.root)), false);
    f.graph("B");
    assert.equal(work.lensesAPI.read().plan, null);
    assert.equal((await work.lensesAPI.source()).ok, false);
  } finally { work.dispose(); await f.cleanup(); }
});

test("provider root compatibility still rejects cycles, negative order and invalid descendant topology with truthful hashes", async () => {
  const f = await contentFixture();
  try {
    const original = (await f.adapter.read(f.scope, () => true)).snapshot;
    const mutations: Array<(source: LensSourceSnapshot) => void> = [
      source => { source.blocks[0]!.parentUuid = f.root; },
      source => { source.blocks[0]!.parentUuid = f.a; },
      source => { source.blocks[0]!.order = -1; },
      source => { source.blocks[1]!.parentUuid = "outside"; },
      source => { source.blocks[1]!.depth = 0; },
      source => { source.blocks[2]!.order = 0; },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original); mutate(value);
      value.structureVersion = await sourceHash(JSON.stringify(value.blocks.map(block => [block.sourceId, block.parentUuid, block.order, block.depth])));
      await assert.rejects(validateLensSource(value, f.scope), /invalid-source-structure/);
    }
    assert.equal(f.counts().writes, 0);
  } finally { await f.cleanup(); }
});
