import assert from "node:assert/strict";
import test from "node:test";

import type {
  ServiceMiniProjectRestructureCompensationStep,
  ServiceMiniProjectRestructurePreparation,
  ServiceMiniProjectRestructureRecoveryResult,
  ServiceMiniProjectRestructureStep,
  ServiceMiniProjectRestructureStepVerification,
  ServiceMiniProjectRestructureUndoPreparation,
  ServiceMiniProjectRestructureUndoRecoveryResult,
  ServiceMiniProjectRestructureUndoStepVerification,
} from "@task-copilot/service-client";

import { commitMiniProjectRestructure, undoMiniProjectRestructure, type MiniProjectRestructureGraphHost } from "../src/v2-mini-project-restructure.ts";

const created: ServiceMiniProjectRestructureStep = {
  operationId: "create-outcome",
  kind: "CREATE_BLOCK",
  blockUuid: "11111111-1111-4111-8111-111111111111",
  parentBlockUuid: "root",
  previousSiblingUuid: null,
  text: "成果",
  contentHash: "created-hash",
  beforeHash: "before-create",
  afterHash: "after-create",
};

const createdAfter: ServiceMiniProjectRestructureStep = {
  operationId: "create-entry",
  kind: "CREATE_BLOCK",
  blockUuid: "22222222-2222-4222-8222-222222222222",
  parentBlockUuid: "root",
  previousSiblingUuid: created.blockUuid,
  text: "当前可进入工作",
  contentHash: "created-after-hash",
  beforeHash: "before-create-after",
  afterHash: "after-create-after",
};

const moved: ServiceMiniProjectRestructureStep = {
  operationId: "move-source",
  kind: "MOVE_BLOCK",
  blockUuid: "source",
  contentHash: "source-hash",
  fromParentBlockUuid: "root",
  fromPreviousSiblingUuid: null,
  applyFromParentBlockUuid: "root",
  applyFromPreviousSiblingUuid: createdAfter.blockUuid,
  toParentBlockUuid: created.blockUuid,
  toPreviousSiblingUuid: null,
  beforeHash: "before-move",
  afterHash: "after-move",
};

function preparation(steps: ServiceMiniProjectRestructureStep[]): ServiceMiniProjectRestructurePreparation {
  return {
    status: "PREPARED",
    semanticCommitId: "proposal-commit:restructure",
    proposalId: "proposal-restructure",
    expectedUpdatedAt: "2026-07-24T08:00:00.000Z",
    plan: {
      proposalId: "proposal-restructure",
      groupId: "restructure-mini-project",
      objectId: "mini-1",
      expectedVersion: 3,
      sourceRootBlockUuid: "root",
      sourceScopeHash: "scope",
      sourceStructureHash: "before",
      expectedStructureHash: "after",
      steps,
      compensationSteps: [],
    },
    stepStatuses: steps.map(() => "PREPARED"),
    replayed: false,
    formalGraphWritesExecuted: false,
  };
}

function host(calls: string[], failMove = false): MiniProjectRestructureGraphHost {
  return {
    async insertBlock(target, content, options) {
      calls.push(`insert:${target}:${content}:${JSON.stringify(options)}`);
      return { uuid: options.customUUID };
    },
    async moveBlock(source, target, options) {
      calls.push(`move:${source}:${target}:${JSON.stringify(options)}`);
      if (failMove) throw new Error("simulated Desktop move failure");
    },
    async removeBlock(uuid) { calls.push(`remove:${uuid}`); },
  };
}

test("structural Commit uses deterministic Logseq insertion and first-child move semantics", async () => {
  const calls: string[] = [];
  const prepared = preparation([created, createdAfter, moved]);
  const verifications: ServiceMiniProjectRestructureStepVerification[] = [
    { status: "NOT_APPLIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "PREPARED" },
    { status: "VERIFIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "VERIFIED", nextStepIndex: 1 },
    { status: "NOT_APPLIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 1, stepStatus: "PREPARED" },
    { status: "VERIFIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 1, stepStatus: "VERIFIED", nextStepIndex: 2 },
    { status: "NOT_APPLIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 2, stepStatus: "PREPARED" },
    { status: "COMPLETED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, record: {} as never, replayed: false },
  ];
  const client = {
    async prepareMiniProjectRestructure() { return prepared; },
    async verifyMiniProjectRestructureStep() { return verifications.shift()!; },
    async beginMiniProjectRestructureRecovery() { throw new Error("not expected"); },
    async verifyMiniProjectRestructureCompensation() { throw new Error("not expected"); },
  };
  const result = await commitMiniProjectRestructure(client, host(calls), prepared.proposalId, prepared.expectedUpdatedAt, "trace");
  assert.deepEqual(result, { status: "COMPLETED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, replayed: false });
  assert.deepEqual(calls, [
    `insert:root:成果:${JSON.stringify({ sibling: false, before: true, customUUID: created.blockUuid })}`,
    `insert:${created.blockUuid}:当前可进入工作:${JSON.stringify({ sibling: true, customUUID: createdAfter.blockUuid })}`,
    `move:source:${created.blockUuid}:${JSON.stringify({ children: true })}`,
  ]);
});

test("replayed verified steps never write the Graph twice", async () => {
  const calls: string[] = [];
  const prepared = preparation([created]);
  const client = {
    async prepareMiniProjectRestructure() { return prepared; },
    async verifyMiniProjectRestructureStep() { return { status: "COMPLETED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, record: {} as never, replayed: true } as const; },
    async beginMiniProjectRestructureRecovery() { throw new Error("not expected"); },
    async verifyMiniProjectRestructureCompensation() { throw new Error("not expected"); },
  };
  const result = await commitMiniProjectRestructure(client, host(calls), prepared.proposalId, prepared.expectedUpdatedAt, "trace-replay");
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(calls, []);
});

test("a later Desktop failure compensates verified steps in Service-owned reverse order", async () => {
  const calls: string[] = [];
  const prepared = preparation([created, moved]);
  const compensation: ServiceMiniProjectRestructureCompensationStep = {
    operationId: "compensate:create-outcome",
    kind: "REMOVE_CREATED_BLOCK",
    blockUuid: created.blockUuid,
    contentHash: created.contentHash,
    expectedParentBlockUuid: created.parentBlockUuid,
    expectedPreviousSiblingUuid: created.previousSiblingUuid,
  };
  const stepVerifications: ServiceMiniProjectRestructureStepVerification[] = [
    { status: "NOT_APPLIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "PREPARED" },
    { status: "VERIFIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "VERIFIED", nextStepIndex: 1 },
    { status: "NOT_APPLIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 1, stepStatus: "PREPARED" },
  ];
  let compensationVerification = 0;
  const client = {
    async prepareMiniProjectRestructure() { return prepared; },
    async verifyMiniProjectRestructureStep() { return stepVerifications.shift()!; },
    async beginMiniProjectRestructureRecovery(): Promise<ServiceMiniProjectRestructureRecoveryResult> {
      return { status: "COMPENSATION_REQUIRED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, compensations: [{ stepIndex: 0, step: compensation }], replayed: false };
    },
    async verifyMiniProjectRestructureCompensation(): Promise<ServiceMiniProjectRestructureRecoveryResult> {
      compensationVerification += 1;
      return compensationVerification === 1
        ? { status: "NOT_COMPENSATED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 0 }
        : { status: "FAILED_COMPENSATED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, record: {} as never, replayed: false };
    },
  };
  const result = await commitMiniProjectRestructure(client, host(calls, true), prepared.proposalId, prepared.expectedUpdatedAt, "trace-failure");
  assert.equal(result.status, "FAILED_COMPENSATED");
  assert.deepEqual(calls, [
    `insert:root:成果:${JSON.stringify({ sibling: false, before: true, customUUID: created.blockUuid })}`,
    `move:source:${created.blockUuid}:${JSON.stringify({ children: true })}`,
    `remove:${created.blockUuid}`,
  ]);
});

test("an unverified custom UUID never advances and enters controlled recovery", async () => {
  const prepared = preparation([created]);
  let recoveryCalled = false;
  const client = {
    async prepareMiniProjectRestructure() { return prepared; },
    async verifyMiniProjectRestructureStep() { return { status: "NOT_APPLIED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "PREPARED" } as const; },
    async beginMiniProjectRestructureRecovery(): Promise<ServiceMiniProjectRestructureRecoveryResult> {
      recoveryCalled = true;
      return { status: "FAILED_COMPENSATED", semanticCommitId: prepared.semanticCommitId, proposalId: prepared.proposalId, record: {} as never, replayed: false };
    },
    async verifyMiniProjectRestructureCompensation() { throw new Error("not expected"); },
  };
  const unsafeHost: MiniProjectRestructureGraphHost = {
    async insertBlock() { return null; },
    async moveBlock() { throw new Error("not expected"); },
    async removeBlock() { throw new Error("not expected"); },
  };
  const result = await commitMiniProjectRestructure(client, unsafeHost, prepared.proposalId, prepared.expectedUpdatedAt, "trace-identity");
  assert.equal(result.status, "FAILED_COMPENSATED");
  assert.equal(recoveryCalled, true);
});

const moveBack: ServiceMiniProjectRestructureCompensationStep = {
  operationId: "compensate:move-source",
  kind: "MOVE_BLOCK",
  blockUuid: moved.blockUuid,
  contentHash: moved.contentHash,
  fromParentBlockUuid: moved.toParentBlockUuid,
  fromPreviousSiblingUuid: moved.toPreviousSiblingUuid,
  toParentBlockUuid: moved.fromParentBlockUuid,
  toPreviousSiblingUuid: moved.fromPreviousSiblingUuid,
};
const removeCreated: ServiceMiniProjectRestructureCompensationStep = {
  operationId: "compensate:create-outcome",
  kind: "REMOVE_CREATED_BLOCK",
  blockUuid: created.blockUuid,
  contentHash: created.contentHash,
  expectedParentBlockUuid: created.parentBlockUuid,
  expectedPreviousSiblingUuid: created.previousSiblingUuid,
};

function undoPreparation(): ServiceMiniProjectRestructureUndoPreparation {
  return {
    status: "PREPARED",
    originalSemanticCommitId: "proposal-commit:restructure",
    undoSemanticCommitId: "mini-project-restructure-undo:proposal-commit:restructure",
    proposalId: "proposal-restructure",
    sourceRootBlockUuid: "root",
    sourceStructureHash: "before",
    expectedStructureHash: "after",
    steps: [
      { stepIndex: 0, forwardStepIndex: 1, step: moveBack },
      { stepIndex: 1, forwardStepIndex: 0, step: removeCreated },
    ],
    stepStatuses: ["PREPARED", "PREPARED"],
    replayed: false,
    formalGraphWritesExecuted: false,
  };
}

test("completed structure Undo executes the Service-owned reverse plan and preserves the immutable original Commit", async () => {
  const calls: string[] = [];
  const prepared = undoPreparation();
  const verifications: ServiceMiniProjectRestructureUndoStepVerification[] = [
    { status: "NOT_APPLIED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "PREPARED" },
    { status: "VERIFIED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "VERIFIED", nextStepIndex: 1 },
    { status: "NOT_APPLIED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, stepIndex: 1, stepStatus: "PREPARED" },
    { status: "COMPLETED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, replayed: false },
  ];
  const client = {
    async prepareMiniProjectRestructureUndo() { return prepared; },
    async verifyMiniProjectRestructureUndoStep() { return verifications.shift()!; },
    async beginMiniProjectRestructureUndoRecovery() { throw new Error("not expected"); },
    async verifyMiniProjectRestructureUndoCompensation() { throw new Error("not expected"); },
  };
  const result = await undoMiniProjectRestructure(client, host(calls), prepared.originalSemanticCommitId, "trace-undo");
  assert.deepEqual(result, { status: "COMPLETED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, replayed: false });
  assert.deepEqual(calls, [
    `move:source:root:${JSON.stringify({ children: true })}`,
    `remove:${created.blockUuid}`,
  ]);
});

test("structure Undo replay performs no duplicate Graph writes", async () => {
  const calls: string[] = [];
  const prepared = undoPreparation();
  const client = {
    async prepareMiniProjectRestructureUndo() { return { status: "COMPLETED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, replayed: true } as const; },
    async verifyMiniProjectRestructureUndoStep() { throw new Error("not expected"); },
    async beginMiniProjectRestructureUndoRecovery() { throw new Error("not expected"); },
    async verifyMiniProjectRestructureUndoCompensation() { throw new Error("not expected"); },
  };
  const result = await undoMiniProjectRestructure(client, host(calls), prepared.originalSemanticCommitId, "trace-undo-replay");
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(calls, []);
});

test("failed structure Undo restores the applied structure through forward compensation", async () => {
  const calls: string[] = [];
  const prepared = undoPreparation();
  const verifications: ServiceMiniProjectRestructureUndoStepVerification[] = [
    { status: "NOT_APPLIED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "PREPARED" },
    { status: "VERIFIED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, stepIndex: 0, stepStatus: "VERIFIED", nextStepIndex: 1 },
    { status: "NOT_APPLIED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, stepIndex: 1, stepStatus: "PREPARED" },
  ];
  let compensationVerification = 0;
  const client = {
    async prepareMiniProjectRestructureUndo() { return prepared; },
    async verifyMiniProjectRestructureUndoStep() { return verifications.shift()!; },
    async beginMiniProjectRestructureUndoRecovery(): Promise<ServiceMiniProjectRestructureUndoRecoveryResult> {
      return { status: "COMPENSATION_REQUIRED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, compensations: [{ stepIndex: 0, forwardStepIndex: 1, step: moved }], replayed: false };
    },
    async verifyMiniProjectRestructureUndoCompensation(): Promise<ServiceMiniProjectRestructureUndoRecoveryResult> {
      compensationVerification += 1;
      return compensationVerification === 1
        ? { status: "NOT_COMPENSATED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, stepIndex: 0 }
        : { status: "FAILED_COMPENSATED", originalSemanticCommitId: prepared.originalSemanticCommitId, undoSemanticCommitId: prepared.undoSemanticCommitId, proposalId: prepared.proposalId, replayed: false };
    },
  };
  const failingHost: MiniProjectRestructureGraphHost = {
    async insertBlock(target, content, options) { calls.push(`insert:${target}:${content}:${JSON.stringify(options)}`); return { uuid: options.customUUID }; },
    async moveBlock(source, target, options) { calls.push(`move:${source}:${target}:${JSON.stringify(options)}`); },
    async removeBlock(uuid) { calls.push(`remove:${uuid}`); throw new Error("simulated remove failure"); },
  };
  const result = await undoMiniProjectRestructure(client, failingHost, prepared.originalSemanticCommitId, "trace-undo-failure");
  assert.equal(result.status, "FAILED_COMPENSATED");
  assert.deepEqual(calls, [
    `move:source:root:${JSON.stringify({ children: true })}`,
    `remove:${created.blockUuid}`,
    `move:source:${created.blockUuid}:${JSON.stringify({ children: true })}`,
  ]);
});
