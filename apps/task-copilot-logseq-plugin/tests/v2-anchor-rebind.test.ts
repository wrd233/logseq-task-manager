import assert from "node:assert/strict";
import test from "node:test";

import type { ServicePrimaryAnchorRebindRequest } from "@task-copilot/service-client";

import {
  prepareV2PrimaryAnchorRebind,
  renderV2PrimaryAnchorRebindPanel,
  submitV2PrimaryAnchorRebind,
} from "../src/v2-anchor-rebind.ts";

const object = {
  objectId: "task-1", objectType: "TASK" as const, version: 3, lifecycle: "OPEN" as const, condition: { kind: "ACTIONABLE" as const }, text: "旧任务",
  createdAt: "2026-07-20T07:00:00.000Z", updatedAt: "2026-07-20T07:01:00.000Z", sourceOrCreationEvent: "explicit",
};
const anchor = {
  anchorId: "anchor-old", objectId: object.objectId, graphId: "graph-1", externalId: "block-old", role: "primary_text" as const,
  status: "missing" as const, contentHash: "11111111", lastSeenAt: "2026-07-20T07:01:00.000Z",
};
const targetUuid = "00000000-0000-4000-8000-000000000002";
const targetBlock = { uuid: targetUuid, content: "[任务] 新任务", "updated-at": 1002 };

function client(received: ServicePrimaryAnchorRebindRequest[]) {
  return {
    listObjects: async () => [object],
    listPrimaryAnchors: async () => ({ anchors: [anchor], nextCursor: "deferred" }),
    rebindPrimaryAnchor: async (input: ServicePrimaryAnchorRebindRequest) => {
      received.push(input);
      return {
        object: { ...object, version: 4, text: "新任务" },
        previousAnchor: { ...anchor, status: "replaced" as const },
        anchor: { ...anchor, anchorId: "anchor-new", externalId: targetUuid, status: "active" as const },
        replayed: false,
      };
    },
  };
}

test("rebind preview reads one known-Anchor page and renders explicit impact", async () => {
  const preview = await prepareV2PrimaryAnchorRebind(client([]), async () => targetBlock);
  assert.equal(preview.target.externalId, targetUuid);
  assert.equal(preview.target.objectType, "TASK");
  assert.equal(preview.candidates[0]?.anchor.anchorId, "anchor-old");
  assert.equal(preview.moreAnchorsDeferred, true);
  const html = renderV2PrimaryAnchorRebindPanel({ status: "ready", preview, serviceGeneration: 1 }, true);
  assert.match(html, /新任务/);
  assert.match(html, /missing/);
  assert.match(html, /旧 Anchor 保留为 replaced/);
  assert.match(html, /data-field="v2RebindConfirmed"/);
  assert.match(html, /data-action="v2-rebind-submit"/);
});

test("rebind submit requires confirmation, revalidates the selected Block, and sends no ownership authority", async () => {
  const received: ServicePrimaryAnchorRebindRequest[] = [];
  const transport = client(received);
  const preview = await prepareV2PrimaryAnchorRebind(transport, async () => targetBlock);
  let ensured = 0;
  await assert.rejects(() => submitV2PrimaryAnchorRebind(transport, preview, "anchor-old", false, async () => targetBlock, async () => { ensured += 1; }, "trace-no"), /确认/);
  await assert.rejects(() => submitV2PrimaryAnchorRebind(transport, preview, "anchor-old", true, async () => ({ ...targetBlock, content: "[任务] 已变化" }), async () => { ensured += 1; }, "trace-stale"), /变化/);
  assert.equal(received.length, 0);
  assert.equal(ensured, 0, "confirmation and stale checks happen before Graph identity writes");
  let currentBlock = targetBlock;
  await submitV2PrimaryAnchorRebind(transport, preview, "anchor-old", true, async () => currentBlock, async (externalId) => {
    assert.equal(externalId, targetBlock.uuid);
    ensured += 1;
    currentBlock = { ...targetBlock, content: `${targetBlock.content}\nid:: ${targetBlock.uuid}`, "updated-at": 1003 };
  }, "trace-ok");
  assert.equal(ensured, 1);
  assert.deepEqual(received, [{
    previousAnchorId: "anchor-old",
    previewObjectVersion: 3,
    previewAnchorStatus: "missing",
    previewAnchorContentHash: "11111111",
    objectType: "TASK",
    text: "新任务",
    externalId: targetUuid,
    inputVersion: "1003",
    contentHash: preview.target.contentHash,
    confirmation: "REBIND_PRIMARY_ANCHOR",
    traceId: "trace-ok",
  }]);
  assert.equal("objectId" in (received[0] as unknown as Record<string, unknown>), false);
  assert.equal("graphId" in (received[0] as unknown as Record<string, unknown>), false);
  const busyHtml = renderV2PrimaryAnchorRebindPanel({ status: "ready", preview, serviceGeneration: 1, busy: true }, true);
  assert.doesNotMatch(busyHtml, /data-action="v2-rebind-cancel"/);
  assert.match(busyHtml, /请等待明确结果/);
});

test("rebind preview refuses non-explicit current Blocks and mismatched object types", async () => {
  await assert.rejects(() => prepareV2PrimaryAnchorRebind(client([]), async () => ({ uuid: "plain", content: "普通记录" })), /不是/);
  await assert.rejects(() => prepareV2PrimaryAnchorRebind({
    ...client([]),
    listObjects: async () => [{ ...object, objectType: "MINI_PROJECT" as const }],
  }, async () => targetBlock), /同类型/);
});
