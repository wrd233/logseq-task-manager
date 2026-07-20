import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceMaterializeExplicitObjectRequest } from "@task-copilot/service-client";

import {
  prepareV2ExplicitCandidateDiscovery,
  renderV2ExplicitCandidateDiscoveryPanel,
  submitV2ExplicitCandidate,
} from "../src/v2-explicit-candidate-discovery.ts";

const task = { uuid: "candidate-task", content: "[任务] DONE 核对候选", "updated-at": 101, children: [] };
const mini = { uuid: "candidate-mini", content: "[MiniProject] 收敛候选", "updated-at": 102, children: [] };
const known = { uuid: "known-task", content: "[任务] 已同步", "updated-at": 103, children: [] };
const historical = { uuid: "historical-task", content: "[任务] 历史 UUID", "updated-at": 104, children: [] };

function client(received: ServiceMaterializeExplicitObjectRequest[]) {
  return {
    listPrimaryAnchors: async (cursor?: string, includeReplaced = false) => cursor
      ? { anchors: [] }
      : { anchors: [
        { anchorId: "known-anchor", objectId: "known-object", graphId: "graph-1", externalId: "known-task", role: "primary_text" as const, status: "active" as const, contentHash: "11111111", lastSeenAt: "2026-07-20T00:00:00.000Z" },
        ...(includeReplaced ? [{ anchorId: "historical-anchor", objectId: "historical-object", graphId: "graph-1", externalId: "historical-task", role: "primary_text" as const, status: "replaced" as const, contentHash: "22222222", lastSeenAt: "2026-07-20T00:00:00.000Z" }] : []),
      ], nextCursor: "page-2" },
    synchronizeExplicitObject: async (input: ServiceMaterializeExplicitObjectRequest) => {
      received.push(input);
      return {
        object: { objectId: "new-object", objectType: input.objectType, version: 1, lifecycle: "OPEN" as const, condition: { kind: "ACTIONABLE" as const }, text: input.text, createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z", sourceOrCreationEvent: "explicit" },
        anchor: { anchorId: "new-anchor", objectId: "new-object", graphId: "graph-1", externalId: input.externalId, role: "primary_text" as const, status: "active" as const, contentHash: input.contentHash, lastSeenAt: "2026-07-20T00:00:00.000Z" },
        operation: "MATERIALIZED" as const,
        replayed: false,
      };
    },
  };
}

test("manual candidate discovery traverses only the current page within explicit bounds", async () => {
  const preview = await prepareV2ExplicitCandidateDiscovery(client([]), async () => [
    { uuid: "parent", content: "普通父块", children: [task, { uuid: "invalid", content: "[任务]", children: [mini] }] },
    known,
    historical,
    { uuid: "deferred", content: "[成果] 超出上限", children: [] },
  ], async () => undefined, { maxBlocks: 6, maxAnchorPages: 2 });
  assert.deepEqual(preview.candidates.map((value) => value.externalId), ["candidate-task", "candidate-mini"]);
  assert.equal(preview.scannedBlocks, 6);
  assert.equal(preview.truncated, true, "the seventh current-page block is not processed into the candidate set");
  assert.equal(preview.invalidExplicitBlocks, 1);
  const html = renderV2ExplicitCandidateDiscoveryPanel({ status: "ready", preview, serviceGeneration: 3 }, true);
  assert.match(html, /只扫描当前页/);
  assert.match(html, /不扫描全 Graph/);
  assert.match(html, /candidate-task/);
  assert.doesNotMatch(html, /known-task/);
  assert.doesNotMatch(html, /historical-task/);
  assert.match(html, /每次只同步一项/);
  const busyHtml = renderV2ExplicitCandidateDiscoveryPanel({ status: "ready", preview, serviceGeneration: 3, busy: true }, true);
  assert.match(busyHtml, /同步中/);
  assert.doesNotMatch(busyHtml, /data-action="v2-candidate-cancel"/);
});

test("candidate submit rereads the selected Block and sends one bounded synchronize command", async () => {
  const received: ServiceMaterializeExplicitObjectRequest[] = [];
  const transport = client(received);
  const preview = await prepareV2ExplicitCandidateDiscovery(transport, async () => [task], async () => undefined, { maxBlocks: 10, maxAnchorPages: 2 });
  await assert.rejects(() => submitV2ExplicitCandidate(transport, preview, "unknown", async () => task, "trace-unknown"), /候选/);
  await assert.rejects(() => submitV2ExplicitCandidate(transport, preview, task.uuid, async () => ({ ...task, content: "[任务] 已变化" }), "trace-stale"), /变化/);
  assert.equal(received.length, 0);
  await submitV2ExplicitCandidate(transport, preview, task.uuid, async () => task, "trace-ok");
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], {
    objectType: "TASK",
    text: "核对候选",
    marker: "DONE",
    externalId: "candidate-task",
    inputVersion: "101",
    contentHash: preview.candidates[0]?.contentHash,
    idempotencyKey: `explicit-discovery:candidate-task:101:${preview.candidates[0]?.contentHash}`,
    traceId: "trace-ok",
  });
});

test("candidate discovery refuses incomplete Anchor coverage and non-page shapes", async () => {
  const received: ServiceMaterializeExplicitObjectRequest[] = [];
  await assert.rejects(() => prepareV2ExplicitCandidateDiscovery({
    ...client(received),
    listPrimaryAnchors: async () => ({ anchors: [], nextCursor: "more" }),
  }, async () => [task], async () => undefined, { maxBlocks: 10, maxAnchorPages: 1 }), /Anchor.*上限/);
  assert.equal(received.length, 0);
  await assert.rejects(() => prepareV2ExplicitCandidateDiscovery(client([]), async () => null, async () => undefined, { maxBlocks: 10, maxAnchorPages: 1 }), /当前页/);
});

test("candidate discovery resolves nested Logseq UUID tuples within the processing budget", async () => {
  const resolved = { uuid: "tuple-task", content: "[任务] tuple 候选", "updated-at": 105, children: [["uuid", "tuple-mini"]] };
  const preview = await prepareV2ExplicitCandidateDiscovery(
    client([]),
    async () => [["uuid", "tuple-task"]],
    async (externalId) => externalId === "tuple-task"
      ? resolved
      : { uuid: "tuple-mini", content: "[MiniProject] tuple 子项", "updated-at": 106, children: [] },
    { maxBlocks: 2, maxAnchorPages: 2 },
  );
  assert.deepEqual(preview.candidates.map((candidate) => candidate.externalId), ["tuple-task", "tuple-mini"]);
  await assert.rejects(() => prepareV2ExplicitCandidateDiscovery(
    client([]),
    async () => [["uuid", "tuple-task"]],
    async () => ({ ...resolved, uuid: "wrong-task" }),
    { maxBlocks: 2, maxAnchorPages: 2 },
  ), /不匹配/);
  await assert.rejects(() => prepareV2ExplicitCandidateDiscovery(
    client([]),
    async () => [["uuid", 42]],
    async () => undefined,
    { maxBlocks: 2, maxAnchorPages: 2 },
  ), /无法识别/);
});
