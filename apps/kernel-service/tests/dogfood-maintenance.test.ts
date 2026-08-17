import assert from "node:assert/strict";
import test from "node:test";

import type { CognitionExecutor, PrimaryAnchor, SemanticJudgment, WorkObject } from "@task-copilot/contracts";
import { Kernel } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { GraphRequestBroker } from "../src/graph-broker.ts";
import { FAKE_COGNITION_PROFILE, MaintenanceCoordinator } from "../src/maintenance-coordinator.ts";

class SpyCognition implements CognitionExecutor {
  readonly id = "spy-cognition";
  calls = 0;
  async judge(): Promise<SemanticJudgment> {
    this.calls += 1;
    return { kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "spy no-op" };
  }
}

const at = "2026-08-18T00:00:00.000Z";

function object(id: string, overrides: Partial<WorkObject> = {}): WorkObject {
  return { id, kind: "TASK", title: id, lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: at, updatedAt: at, ...overrides };
}

function anchor(workObjectId: string): PrimaryAnchor {
  return { id: `anchor-${workObjectId}`, workObjectId, graphId: "graph-1", externalId: `block-${workObjectId}`, sourceContentHash: "hash", projectionContainerUuid: "c", projectionTitleUuid: "t", projectionStateUuid: "s", projectionFocusUuid: "f", projectionWaitingUuid: "w", projectionOutcomeUuid: "o", projectionCompletionUuid: "k", createdAt: at, updatedAt: at };
}

function setup(scope: { isMaintenanceEnabled(): boolean; isInScope(id: string): boolean }): { store: SqliteStore; maintenance: MaintenanceCoordinator; cognition: SpyCognition } {
  const store = new SqliteStore(":memory:");
  const kernel = new Kernel(store, { now: () => at });
  store.putWorkObject(object("outside"));
  store.putAnchor(anchor("outside"));
  const broker = new GraphRequestBroker({});
  const cognition = new SpyCognition();
  const maintenance = new MaintenanceCoordinator(kernel, store, broker, { now: () => at, scope }, cognition, FAKE_COGNITION_PROFILE);
  return { store, maintenance, cognition };
}

test("scope-out source change records coverage but does not auto-associate Context", () => {
  const scope = { isMaintenanceEnabled: () => true, isInScope: (id: string) => id === "in-scope" };
  const { store, maintenance } = setup(scope);
  const result = maintenance.recordSourceChange({ workObjectId: "outside", graphId: "graph-1", sourceBlockUuid: "natural-block", sourceContentHash: "deadbeef", sourceMarker: null, observedAt: at });
  assert.equal(result.coverage.hasUncoveredChanges, true);
  assert.equal(result.coverage.lastReconciledSourceSnapshotId, null);
  assert.equal(store.listContextAssociations("outside", "ACTIVE").length, 0);
});

test("scope-out autonomous job is skipped without marking source reconciled or busy-looping", async () => {
  const scope = { isMaintenanceEnabled: () => true, isInScope: (id: string) => id === "in-scope" };
  const { store, maintenance, cognition } = setup(scope);
  maintenance.recordSourceChange({ workObjectId: "outside", graphId: "graph-1", sourceBlockUuid: "natural-block", sourceContentHash: "deadbeef", sourceMarker: null, observedAt: at });
  const job = await maintenance.tick();
  assert.equal(job?.status, "DONE");
  assert.equal(job?.lastOutcome, "SKIPPED_BY_DOGFOOD_SCOPE");
  const coverage = store.getSourceCoverage("outside")!;
  assert.equal(coverage.hasUncoveredChanges, true);
  assert.notEqual(coverage.lastReconciledSourceSnapshotId, coverage.lastObservedSourceSnapshotId);
  // A second tick should not claim the same job again (it is already DONE).
  assert.equal(await maintenance.tick(), null);
  assert.equal(cognition.calls, 0);
});

test("INTERACTIVE explicit reconcile bypasses dogfood scope", async () => {
  const scope = { isMaintenanceEnabled: () => true, isInScope: (id: string) => id === "in-scope" };
  const { maintenance } = setup(scope);
  const job = maintenance.manualReconcile("outside", "INTERACTIVE");
  assert.equal(job.priorityClass, "INTERACTIVE");
  const processed = await maintenance.tick();
  // It should not be skipped by scope; because the broker is offline it fails/requeues instead.
  assert.notEqual(processed?.lastOutcome, "SKIPPED_BY_DOGFOOD_SCOPE");
  assert.notEqual(processed?.lastError, "SKIPPED_BY_DOGFOOD_SCOPE");
  assert.equal(processed?.status, "QUEUED");
});
