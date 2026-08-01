import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceCandidateDiscoveryRequest } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import {
  formalizeV2Candidate,
  persistV2ExplicitCandidateDiscovery,
  prepareV2ExplicitCandidateDiscovery,
  renderV2ExplicitCandidateDiscoveryPanel,
  updateExistingObjectFromV2Candidate,
} from "../src/v2-explicit-candidate-discovery.ts";

const task = { uuid: "candidate-task", content: "[任务] DONE 核对候选", "updated-at": 101, children: [] };
const mini = { uuid: "candidate-mini", content: "[MiniProject] 收敛候选", "updated-at": 102, children: [] };
const known = { uuid: "known-task", content: "[任务] 已同步", "updated-at": 103, children: [] };
const historical = { uuid: "historical-task", content: "[任务] 历史 UUID", "updated-at": 104, children: [] };

function client(received: ServiceCandidateDiscoveryRequest[]) {
  return {
    listPrimaryAnchors: async (cursor?: string, includeReplaced = false) => cursor
      ? { anchors: [] }
      : { anchors: [
        { anchorId: "known-anchor", objectId: "known-object", graphId: "graph-1", externalId: "known-task", role: "primary_text" as const, status: "active" as const, contentHash: "11111111", lastSeenAt: "2026-07-20T00:00:00.000Z" },
        ...(includeReplaced ? [{ anchorId: "historical-anchor", objectId: "historical-object", graphId: "graph-1", externalId: "historical-task", role: "primary_text" as const, status: "replaced" as const, contentHash: "22222222", lastSeenAt: "2026-07-20T00:00:00.000Z" }] : []),
      ], nextCursor: "page-2" },
    discoverCandidate: async (input: ServiceCandidateDiscoveryRequest) => {
      received.push(input);
      return {
        candidate: { candidateId: `candidate:${input.sourceAnchorId}`, sourceAnchorId: input.sourceAnchorId, sourceVersion: input.sourceVersion, candidateKind: input.candidateKind, reason: input.reason, suggestion: input.suggestion, disposition: "PENDING" as const, lastAnalyzedAt: "2026-07-20T00:00:00.000Z", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z" },
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
  assert.match(html, /只检查当前页/);
  assert.match(html, /任务 · 核对候选/);
  assert.match(html, /小项目 · 收敛候选/);
  assert.doesNotMatch(html, /candidate-task/);
  assert.doesNotMatch(html, /candidate-mini/);
  assert.doesNotMatch(html, /known-task/);
  assert.doesNotMatch(html, /historical-task/);
  assert.match(html, /只加入待整理列表/);
  const busyHtml = renderV2ExplicitCandidateDiscoveryPanel({ status: "ready", preview, serviceGeneration: 3, busy: true }, true);
  assert.match(busyHtml, /保存中/);
  assert.doesNotMatch(busyHtml, /data-action="v2-candidate-cancel"/);
});

test("candidate persistence rereads the whole preview before sending bounded Candidate-only commands", async () => {
  const received: ServiceCandidateDiscoveryRequest[] = [];
  const transport = client(received);
  const preview = await prepareV2ExplicitCandidateDiscovery(transport, async () => [task, mini], async () => undefined, { maxBlocks: 10, maxAnchorPages: 2 });
  await assert.rejects(() => persistV2ExplicitCandidateDiscovery(transport, preview, async (id) => id === task.uuid ? task : ({ ...mini, content: "[MiniProject] 已变化" }), "trace-stale"), /变化/);
  assert.equal(received.length, 0);
  const result = await persistV2ExplicitCandidateDiscovery(transport, preview, async (id) => id === task.uuid ? task : mini, "trace-ok");
  assert.equal(result.candidates.length, 2);
  assert.equal(received.length, 2);
  assert.deepEqual(received[0], {
    sourceAnchorId: "candidate-task",
    sourceVersion: `101:${preview.candidates[0]?.contentHash}`,
    candidateKind: "WORK_ITEM",
    reason: "TASK 显式标识尚未绑定正式对象。",
    suggestion: "生成 TASK 正式化 Proposal。",
    traceId: "trace-ok:candidate-task",
  });
});

test("Candidate formalization rereads source evidence and creates only one review-ready Proposal request", async () => {
  let received: unknown;
  let rediscovered: ServiceCandidateDiscoveryRequest | undefined;
  const formalTask = { ...task, uuid: "11111111-1111-4111-8111-111111111111" };
  const candidate = { candidateId: "candidate:task", sourceAnchorId: formalTask.uuid, sourceVersion: `101:${checksum("[任务] DONE 核对候选")}`, candidateKind: "WORK_ITEM" as const, reason: "显式标识", suggestion: "生成 Proposal", disposition: "PENDING" as const, lastAnalyzedAt: "2026-07-21T00:00:00.000Z", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:01:00.000Z" };
  const transport = {
    discoverCandidate: async (input: ServiceCandidateDiscoveryRequest) => {
      rediscovered = input;
      return { candidate: { ...candidate, sourceVersion: input.sourceVersion, updatedAt: "2026-07-21T00:02:00.000Z" }, replayed: false };
    },
    formalizeCandidate: async (candidateId: string, input: unknown) => { received = { candidateId, input }; return { candidate: { ...candidate, activeProposalId: "proposal:task" }, record: { proposal: { proposalId: "proposal:task" }, files: {}, updatedAt: "now" }, replayed: false } as never; },
  };
  await assert.rejects(() => formalizeV2Candidate(transport, candidate, async () => ({ ...formalTask, content: "[任务] 已变化" }), "trace-stale"), /重新扫描/);
  assert.equal(received, undefined);
  await formalizeV2Candidate(transport, candidate, async () => formalTask, "trace-formalize");
  assert.deepEqual(received, { candidateId: candidate.candidateId, input: { sourceAnchorId: formalTask.uuid, inputVersion: "101", contentHash: checksum(formalTask.content), content: formalTask.content, objectType: "TASK", text: "核对候选", expectedUpdatedAt: candidate.updatedAt, traceId: "trace-formalize" } });
  let identityEstablished = false;
  received = undefined;
  await formalizeV2Candidate(transport, candidate, async () => identityEstablished
    ? { ...formalTask, content: `${formalTask.content}\nid:: ${formalTask.uuid}`, "updated-at": 102, properties: { id: formalTask.uuid } }
    : formalTask, "trace-identity", async () => { identityEstablished = true; });
  assert.equal(rediscovered?.sourceVersion, `102:${checksum(formalTask.content)}`, "identity-only version changes refresh the Candidate before Proposal creation");
  assert.deepEqual(received, { candidateId: candidate.candidateId, input: { sourceAnchorId: formalTask.uuid, inputVersion: "102", contentHash: checksum(formalTask.content), content: formalTask.content, objectType: "TASK", text: "核对候选", expectedUpdatedAt: "2026-07-21T00:02:00.000Z", traceId: "trace-identity" } });
  received = undefined;
  await formalizeV2Candidate(transport, candidate, async () => ({ ...formalTask, content: `${formalTask.content}\nid:: ${formalTask.uuid}`, "updated-at": 102, properties: { id: formalTask.uuid } }), "trace-identity-retry", async () => undefined);
  assert.ok(received, "an identity-only version change remains recoverable without forcing another page scan after a transient Service failure");
});

test("Candidate update rereads source and target, then creates only one existing-object Proposal request", async () => {
  const sourceContent = "供应商补充：必须记录结论";
  const targetContent = "[任务] 核对旧告警";
  const candidate = { candidateId: "candidate:update", sourceAnchorId: "source-update", sourceVersion: `3:${checksum(sourceContent)}`, candidateKind: "UPDATE" as const, reason: "补充事实", suggestion: "更新已有对象", disposition: "PENDING" as const, lastAnalyzedAt: "2026-07-22T00:00:00.000Z", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:01:00.000Z" };
  let request: unknown;
  const transport = {
    listObjects: async () => [{ objectId: "task-existing", objectType: "TASK" as const, lifecycle: "OPEN" as const, condition: { kind: "ACTIONABLE" as const }, version: 4, text: "核对旧告警", sourceOrCreationEvent: "test", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z" }],
    listPrimaryAnchors: async () => ({ anchors: [{ anchorId: "anchor-existing", objectId: "task-existing", graphId: "graph", externalId: "target-update", role: "primary_text" as const, status: "active" as const, contentHash: checksum(targetContent), lastSeenAt: "2026-07-22T00:00:00.000Z" }] }),
    discoverCandidate: async () => { throw new Error("unchanged source version must not refresh Candidate"); },
    updateCandidate: async (_candidateId: string, input: unknown) => { request = input; return { candidate: { ...candidate, activeProposalId: "proposal-update" }, record: { proposal: { proposalId: "proposal-update" }, files: {}, updatedAt: "now" }, replayed: false } as never; },
  };
  const blocks = new Map<string, unknown>([["source-update", { uuid: "source-update", content: sourceContent, "updated-at": 3 }], ["target-update", { uuid: "target-update", content: targetContent, "updated-at": 8 }]]);
  await updateExistingObjectFromV2Candidate(transport, candidate, "task-existing", "[任务] 核对新告警并记录结论", async (id) => blocks.get(id), "trace-update");
  assert.deepEqual(request, {
    sourceAnchorId: "source-update", sourceInputVersion: "3", sourceContentHash: checksum(sourceContent), targetObjectId: "task-existing", targetExternalId: "target-update", targetInputVersion: "8", targetContentHash: checksum(targetContent), targetContent,
    afterContent: "[任务] 核对新告警并记录结论", expectedUpdatedAt: candidate.updatedAt, traceId: "trace-update",
  });
  await assert.rejects(() => updateExistingObjectFromV2Candidate(transport, candidate, "task-existing", "[成果] 类型偷换", async (id) => blocks.get(id), "trace-wrong-type"), /显式类型/);
  blocks.set("source-update", { uuid: "source-update", content: `${sourceContent} 已变化`, "updated-at": 4 });
  await assert.rejects(() => updateExistingObjectFromV2Candidate(transport, candidate, "task-existing", "[任务] 最终正文", async (id) => blocks.get(id), "trace-stale"), /来源已变化/);
});

test("Candidate update refreshes an identity-only Logseq version change before creating the Proposal", async () => {
  const sourceContent = "[任务] 供应商补充事实";
  const targetContent = "[任务] 核对旧告警";
  const sourceId = "11111111-1111-4111-8111-111111111111";
  const candidate = { candidateId: "candidate:update-identity", sourceAnchorId: sourceId, sourceVersion: `3:${checksum(sourceContent)}`, candidateKind: "WORK_ITEM" as const, reason: "补充事实", suggestion: "更新已有对象", disposition: "PENDING" as const, lastAnalyzedAt: "2026-07-22T00:00:00.000Z", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:01:00.000Z" };
  let refreshed: ServiceCandidateDiscoveryRequest | undefined;
  let request: { expectedUpdatedAt?: string; sourceInputVersion?: string } | undefined;
  const transport = {
    listObjects: async () => [{ objectId: "task-existing", objectType: "TASK" as const, lifecycle: "OPEN" as const, condition: { kind: "ACTIONABLE" as const }, version: 4, text: "核对旧告警", sourceOrCreationEvent: "test", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z" }],
    listPrimaryAnchors: async () => ({ anchors: [{ anchorId: "anchor-existing", objectId: "task-existing", graphId: "graph", externalId: "target-update", role: "primary_text" as const, status: "active" as const, contentHash: checksum(targetContent), lastSeenAt: "2026-07-22T00:00:00.000Z" }] }),
    discoverCandidate: async (input: ServiceCandidateDiscoveryRequest) => {
      refreshed = input;
      return { candidate: { ...candidate, sourceVersion: input.sourceVersion, updatedAt: "2026-07-22T00:02:00.000Z" }, replayed: false };
    },
    updateCandidate: async (_candidateId: string, input: unknown) => {
      request = input as typeof request;
      return { candidate: { ...candidate, activeProposalId: "proposal-update" }, record: { proposal: { proposalId: "proposal-update" }, files: {}, updatedAt: "now" }, replayed: false } as never;
    },
  };
  const blocks = new Map<string, unknown>([
    [sourceId, { uuid: sourceId, content: `${sourceContent}\nid:: ${sourceId}`, "updated-at": 4, properties: { id: sourceId } }],
    ["target-update", { uuid: "target-update", content: targetContent, "updated-at": 8 }],
  ]);
  await updateExistingObjectFromV2Candidate(transport, candidate, "task-existing", "[任务] 核对新告警", async (id) => blocks.get(id), "trace-identity");
  assert.equal(refreshed?.sourceVersion, `4:${checksum(sourceContent)}`);
  assert.equal(request?.sourceInputVersion, "4");
  assert.equal(request?.expectedUpdatedAt, "2026-07-22T00:02:00.000Z");
});

test("Candidate queue renders only the same bounded set whose source text was hydrated", () => {
  const candidates = Array.from({ length: 51 }, (_, index) => ({ candidateId: `candidate-${index}`, sourceAnchorId: `block-${index}`, sourceVersion: `1:hash-${index}`, candidateKind: "WORK_ITEM" as const, reason: index === 0 ? "MINI_PROJECT 显式标识尚未绑定正式对象。" : "原因", suggestion: index === 0 ? "生成 MINI_PROJECT 正式化 Proposal。" : "建议", disposition: "PENDING" as const, lastAnalyzedAt: "2026-07-21T00:00:00.000Z", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z" }));
  const previews = Object.fromEntries(candidates.slice(0, 50).map(({ candidateId }, index) => [candidateId, `原文 ${index}`]));
  const html = renderV2ExplicitCandidateDiscoveryPanel({ status: "idle" }, true, candidates, previews);
  assert.match(html, /当前显示前 50 项/);
  assert.match(html, /原文 49/);
  assert.match(html, /这段内容已经标为小项目/);
  assert.match(html, /审阅后把它整理为正式小项目/);
  assert.doesNotMatch(html, /MINI_PROJECT|Proposal/);
  assert.match(html, /<summary>更多处置<\/summary>/);
  assert.doesNotMatch(html, /block-50/);
  assert.doesNotMatch(html, /来源位置：block-49/);
  assert.doesNotMatch(html, /正在等待来源重读/);
});

test("candidate preview keeps current dispositions and no-more cooldown quiet", () => {
  const preview = {
    candidates: [
      { externalId: "later-source", inputVersion: "1", contentHash: "hash-later", objectType: "TASK" as const, text: "稍后处理" },
      { externalId: "dismissed-source", inputVersion: "1", contentHash: "hash-dismissed", objectType: "OUTPUT" as const, text: "保持普通内容" },
      { externalId: "suppressed-source", inputVersion: "2", contentHash: "hash-changed", objectType: "MINI_PROJECT" as const, text: "不再提示" },
      { externalId: "new-source", inputVersion: "1", contentHash: "hash-new", objectType: "TASK" as const, text: "新的任务" },
    ],
    scannedBlocks: 4,
    invalidExplicitBlocks: 0,
    truncated: false,
  };
  const persisted = [
    { candidateId: "later", sourceAnchorId: "later-source", sourceVersion: "1:hash-later", candidateKind: "WORK_ITEM" as const, reason: "原因", suggestion: "建议", disposition: "LATER" as const, deferredUntil: "2099-07-28T00:00:00.000Z", lastAnalyzedAt: "2026-07-28T00:00:00.000Z", createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" },
    { candidateId: "dismissed", sourceAnchorId: "dismissed-source", sourceVersion: "1:hash-dismissed", candidateKind: "OUTPUT" as const, reason: "原因", suggestion: "建议", disposition: "DISMISSED" as const, lastAnalyzedAt: "2026-07-28T00:00:00.000Z", createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" },
    { candidateId: "suppressed", sourceAnchorId: "suppressed-source", sourceVersion: "1:hash-before-edit", candidateKind: "WORK_ITEM" as const, reason: "原因", suggestion: "建议", disposition: "NO_MORE_LIKE_THIS" as const, lastAnalyzedAt: "2026-07-28T00:00:00.000Z", createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" },
  ];
  const html = renderV2ExplicitCandidateDiscoveryPanel({ status: "ready", preview, serviceGeneration: 1 }, true, persisted);
  assert.match(html, /发现 1 项新增内容/);
  assert.match(html, /任务 · 新的任务/);
  assert.doesNotMatch(html, /稍后处理|保持普通内容|不再提示/);

  const quiet = renderV2ExplicitCandidateDiscoveryPanel({ status: "ready", preview: { ...preview, candidates: preview.candidates.slice(0, 3) }, serviceGeneration: 1 }, true, persisted);
  assert.match(quiet, /没有新增需要整理的内容/);
  assert.doesNotMatch(quiet, /data-action="v2-candidate-submit"/);
});

test("candidate discovery refuses incomplete Anchor coverage and non-page shapes", async () => {
  const received: ServiceCandidateDiscoveryRequest[] = [];
  await assert.rejects(() => prepareV2ExplicitCandidateDiscovery({
    ...client(received),
    listPrimaryAnchors: async () => ({ anchors: [], nextCursor: "more" }),
  }, async () => [task], async () => undefined, { maxBlocks: 10, maxAnchorPages: 1 }), /Anchor.*上限/);
  assert.equal(received.length, 0);
  await assert.rejects(() => prepareV2ExplicitCandidateDiscovery(client([]), async () => null, async () => undefined, { maxBlocks: 10, maxAnchorPages: 1 }), /当前页/);
});

test("empty and all-invalid current-page scans are neutral empty results, not errors", async () => {
  const empty = await prepareV2ExplicitCandidateDiscovery(client([]), async () => [
    { uuid: "plain", content: "普通记录", "updated-at": 1, children: [] },
    { uuid: "known-task", content: "[任务] 已同步", "updated-at": 2, children: [] },
  ], async () => undefined, { maxBlocks: 10, maxAnchorPages: 2 });
  assert.deepEqual(empty.candidates, []);
  assert.equal(empty.scannedBlocks, 2);
  assert.equal(empty.invalidExplicitBlocks, 0);
  const emptyHtml = renderV2ExplicitCandidateDiscoveryPanel({ status: "ready", preview: empty, serviceGeneration: 1 }, true);
  assert.match(emptyHtml, /没有新增需要整理的内容/);
  assert.doesNotMatch(emptyHtml, /这次检查没有完成/);
  assert.doesNotMatch(emptyHtml, /data-action="v2-candidate-submit"/);

  const invalidOnly = await prepareV2ExplicitCandidateDiscovery(client([]), async () => [
    { uuid: "bad-task", content: "[任务]", "updated-at": 1, children: [] },
    { uuid: "bad-mini", content: "[MiniProject] [任务] 双类型", "updated-at": 2, children: [] },
  ], async () => undefined, { maxBlocks: 10, maxAnchorPages: 2 });
  assert.deepEqual(invalidOnly.candidates, []);
  assert.equal(invalidOnly.invalidExplicitBlocks, 2);
  const invalidHtml = renderV2ExplicitCandidateDiscoveryPanel({ status: "ready", preview: invalidOnly, serviceGeneration: 1 }, true);
  assert.match(invalidHtml, /没有新增需要整理的内容/);
  assert.match(invalidHtml, /2 个显式标识存在冲突或缺少标题/);
  assert.doesNotMatch(invalidHtml, /这次检查没有完成/);
  assert.doesNotMatch(invalidHtml, /data-action="v2-candidate-submit"/);
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
