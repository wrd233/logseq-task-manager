import assert from "node:assert/strict";
import test from "node:test";

import { stableHash, type GraphEffect, type GraphSnapshot, type ManagedProjection } from "@task-copilot/contracts";
import { readRecoveryVerificationSnapshot } from "../src/recovery-verification.ts";

const absent = { graphId: "graph", sourceBlockUuid: "source", sourceContentHash: "hash", projection: null } satisfies GraphSnapshot;
const projectionCore = { containerUuid: "container", titleUuid: "title", stateUuid: "state", focusUuid: "focus", waitingUuid: "waiting", title: "task", lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null } as const;
const expectedProjection = { ...projectionCore, projectionHash: stableHash(projectionCore) } satisfies ManagedProjection;

test("GRAPH_APPLIED create compensation verifies absence without loading the deleted WorkObject", async () => {
  let targetReads = 0;
  const effect = { type: "REMOVE_MANAGED_PROJECTION", commitId: "commit", effectId: "effect", graphId: "graph", sourceBlockUuid: "source", containerUuid: "container", expectedProjectionHash: expectedProjection.projectionHash, expectedProjection } satisfies GraphEffect;
  assert.equal(await readRecoveryVerificationSnapshot(effect, "deleted-target", {
    readAbsentProjection: async () => absent,
    readTargetProjection: async () => { targetReads += 1; throw new Error("deleted target must not be loaded"); },
  }), absent);
  assert.equal(targetReads, 0);
});

test("removal recovery fails closed without the registered projection identity", async () => {
  const effect = { type: "REMOVE_MANAGED_PROJECTION", commitId: "commit", effectId: "effect", graphId: "graph", sourceBlockUuid: "source", containerUuid: "container", expectedProjectionHash: "hash" } satisfies GraphEffect;
  await assert.rejects(readRecoveryVerificationSnapshot(effect, "deleted-target", {
    readAbsentProjection: async () => absent,
    readTargetProjection: async () => absent,
  }), /RECOVERY_EXPECTED_PROJECTION_REQUIRED/u);
});

test("every non-removal recovery still requires and reads its target projection", async () => {
  const effect = { type: "SET_CURRENT_FOCUS_FIELD", commitId: "commit", effectId: "effect", graphId: "graph", sourceBlockUuid: "source", containerUuid: "container", fieldUuid: "focus", content: "next", expectedProjectionHash: "before", resultingProjectionHash: "after" } satisfies GraphEffect;
  await assert.rejects(readRecoveryVerificationSnapshot(effect, null, { readAbsentProjection: async () => absent, readTargetProjection: async () => absent }), /RECOVERY_TARGET_REQUIRED/u);
  assert.deepEqual(await readRecoveryVerificationSnapshot(effect, "work", { readAbsentProjection: async () => absent, readTargetProjection: async (id) => ({ ...absent, sourceContentHash: id }) }), { ...absent, sourceContentHash: "work" });
});
