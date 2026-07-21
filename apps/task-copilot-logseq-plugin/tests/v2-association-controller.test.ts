import assert from "node:assert/strict";
import test from "node:test";

import type { V2ManagedObject } from "@task-copilot/domain";

import { submitV2Association, type V2AssociationClient, type V2AssociationSubmissionState } from "../src/v2-association-controller.ts";

const source: V2ManagedObject = {
  objectId: "task-source", objectType: "TASK", text: "来源", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, version: 2,
  createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z", sourceOrCreationEvent: "test",
};

function input() {
  return { sourceObjectId: source.objectId, targetObjectId: "decision-target", expectedVersion: source.version, confirmed: true, traceId: "trace-association" };
}

test("Association submission blocks a concurrent duplicate and exposes busy transitions", async () => {
  const state: V2AssociationSubmissionState = { busy: false };
  const transitions: boolean[] = [];
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  const client: V2AssociationClient = {
    listObjects: async () => { await waiting; return [source]; },
    addAssociation: async () => {
      writes += 1;
      return { object: { ...source, version: 3 }, association: { associationId: "rel-1", sourceObjectId: source.objectId, targetObjectId: "decision-target", associationKind: "RELATED", status: "ACTIVE", createdAt: source.updatedAt, updatedAt: source.updatedAt }, replayed: false };
    },
  };
  const first = submitV2Association(state, client, input(), async (busy) => { transitions.push(busy); });
  assert.equal(state.busy, true);
  assert.equal(await submitV2Association(state, client, input(), async () => undefined), undefined);
  release();
  assert.equal((await first)?.association.associationId, "rel-1");
  assert.equal(writes, 1);
  assert.deepEqual(transitions, [true, false]);
  assert.equal(state.busy, false);
});

test("Association submission rejects stale source evidence before a formal write and resets busy", async () => {
  const state: V2AssociationSubmissionState = { busy: false };
  const transitions: boolean[] = [];
  let writes = 0;
  const client: V2AssociationClient = {
    listObjects: async () => [{ ...source, version: 3 }],
    addAssociation: async () => { writes += 1; throw new Error("must not run"); },
  };
  await assert.rejects(() => submitV2Association(state, client, input(), async (busy) => { transitions.push(busy); }), /已变化/);
  assert.equal(writes, 0);
  assert.deepEqual(transitions, [true, false]);
  assert.equal(state.busy, false);
});

test("Association submission resets busy after a Service failure", async () => {
  const state: V2AssociationSubmissionState = { busy: false };
  const transitions: boolean[] = [];
  const client: V2AssociationClient = {
    listObjects: async () => [source],
    addAssociation: async () => { throw new Error("Service unavailable"); },
  };
  await assert.rejects(() => submitV2Association(state, client, input(), async (busy) => { transitions.push(busy); }), /Service unavailable/);
  assert.deepEqual(transitions, [true, false]);
  assert.equal(state.busy, false);
});

test("Association submission resets busy when the initial busy refresh fails", async () => {
  const state: V2AssociationSubmissionState = { busy: false };
  const transitions: boolean[] = [];
  let reads = 0;
  const client: V2AssociationClient = {
    listObjects: async () => { reads += 1; return [source]; },
    addAssociation: async () => { throw new Error("must not run"); },
  };
  await assert.rejects(() => submitV2Association(state, client, input(), async (busy) => {
    transitions.push(busy);
    if (busy) throw new Error("refresh failed");
  }), /refresh failed/);
  assert.equal(reads, 0);
  assert.deepEqual(transitions, [true, false]);
  assert.equal(state.busy, false);
});
