import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyState } from "@task-copilot/application";
import type { ManagedObject, SemanticCommit } from "@task-copilot/domain";
import { exportRecoveryBundle } from "@task-copilot/persistence";

import { scanLegacyRecoveryBundle } from "../src/migration-scan.ts";

const legacyTask: ManagedObject = {
  objectId: "legacy-task-1", objectType: "TASK", version: 3, phase: "ACTIVE", condition: { kind: "WAITING", waitingFor: "审批", expectedResult: "批准", reviewAt: "2026-07-22T08:00:00.000Z", startedAt: "2026-07-20T08:00:00.000Z" }, text: "等待审批", createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-21T08:00:00.000Z", sourceOrCreationEvent: "pilot", lastMeaningfulEventAt: "2026-07-21T08:00:00.000Z",
};

test("verified V1 Recovery Bundle scan returns review records without source text or write authority", () => {
  const state = createEmptyState();
  state.objects.push(legacyTask, { ...legacyTask, objectId: "legacy-resource-1", objectType: "RESOURCE", phase: "IDEA", condition: { kind: "NONE" }, text: "参考资料" });
  const bundle = exportRecoveryBundle(state, new Date("2026-07-21T09:00:00.000Z"));
  const first = scanLegacyRecoveryBundle(bundle);
  const second = scanLegacyRecoveryBundle(bundle);
  assert.deepEqual(first, second);
  assert.equal(first.status, "SCANNED");
  assert.equal(first.zeroFormalWrites, true);
  assert.deepEqual(first.counts, { total: 2, directBind: 1, needsConfirmation: 0, keepOrdinary: 1, structuralError: 0 });
  assert.equal(first.previews.some((preview) => "text" in preview), false);
  assert.equal(first.previews.find(({ legacyObjectId }) => legacyObjectId === "legacy-task-1")?.suggestedFocus, null);
});

test("corrupt bundles and unfinished Commit evidence stop migration scanning", () => {
  const state = createEmptyState();
  state.objects.push(legacyTask);
  const pending: SemanticCommit = { semanticCommitId: "commit-pending", proposalId: "proposal-pending", status: "PENDING", operationIds: [], createdAt: "2026-07-21T08:00:00.000Z", updatedAt: "2026-07-21T08:00:00.000Z", beforeStateChecksum: "11111111", textMutations: [], domainChanges: [] };
  state.commits.push(pending);
  assert.throws(() => scanLegacyRecoveryBundle(exportRecoveryBundle(state)), /待恢复 Commit/);
  const corrupt = exportRecoveryBundle(createEmptyState());
  corrupt.files["objects.jsonl"] = "tampered";
  assert.throws(() => scanLegacyRecoveryBundle(corrupt), /校验失败/);
});
