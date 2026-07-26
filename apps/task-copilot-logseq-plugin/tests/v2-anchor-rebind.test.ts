import assert from "node:assert/strict";
import test from "node:test";

import type { ServicePrimaryAnchorRebindRequest } from "@task-copilot/service-client";

import {
  prepareV2PrimaryAnchorRebind,
  renderV2AnchorIssueStatus,
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
  assert.match(html, /旧任务/);
  assert.match(html, /原连接位置不可用/);
  assert.match(html, /旧连接保留在历史中/);
  assert.match(html, /data-field="v2RebindConfirmed"/);
  assert.match(html, /data-action="v2-rebind-submit"/);
  assert.match(html, /value="candidate:0"/);
  for (const hidden of [targetUuid, "anchor-old", "block-old", "11111111"]) {
    assert.doesNotMatch(html, new RegExp(hidden));
  }
  assert.doesNotMatch(html, /Primary Anchor|externalId|contentHash|missing|replaced/);
});

test("rebind preview rejects a target that already belongs to another formal object before confirmation", async () => {
  await assert.rejects(() => prepareV2PrimaryAnchorRebind({
    ...client([]),
    listPrimaryAnchors: async () => ({
      anchors: [
        anchor,
        {
          ...anchor,
          anchorId: "anchor-target",
          objectId: "task-target",
          externalId: targetUuid,
          status: "active" as const,
        },
      ],
    }),
    listObjects: async () => [
      object,
      { ...object, objectId: "task-target", text: "另一个正式事项" },
    ],
  }, async () => targetBlock), /已经连接到另一个正式事项/);
});

test("rebind submit requires confirmation, revalidates the selected Block, and sends no ownership authority", async () => {
  const received: ServicePrimaryAnchorRebindRequest[] = [];
  const transport = client(received);
  const preview = await prepareV2PrimaryAnchorRebind(transport, async () => targetBlock);
  let ensured = 0;
  await assert.rejects(() => submitV2PrimaryAnchorRebind(transport, preview, "candidate:0", false, async () => targetBlock, async () => { ensured += 1; }, "trace-no"), /确认/);
  await assert.rejects(() => submitV2PrimaryAnchorRebind(transport, preview, "candidate:0", true, async () => ({ ...targetBlock, content: "[任务] 已变化" }), async () => { ensured += 1; }, "trace-stale"), /变化/);
  assert.equal(received.length, 0);
  assert.equal(ensured, 0, "confirmation and stale checks happen before Graph identity writes");
  let currentBlock = targetBlock;
  await submitV2PrimaryAnchorRebind(transport, preview, "candidate:0", true, async () => currentBlock, async (externalId) => {
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

test("Anchor issue status stays user-readable, bounded, and routes only to existing preview", () => {
  const issue = {
    objectText: "恢复发布",
    conclusion: "正式事项与正文失去连接",
    keyEvidence: ["原正文位置当前不可用", "正式事项仍保留"],
    unknowns: [],
    nextActionEligible: true,
    nextActionLabel: "检查正文连接",
    narrationRuleId: "anchor-missing",
  };
  const html = renderV2AnchorIssueStatus([
    issue,
    ...Array.from({ length: 5 }, (_, index) => ({ ...issue, objectText: `事项 ${index + 2}` })),
  ], true);

  assert.match(html, /有 6 个正式事项需要重新确认正文/);
  assert.match(html, /正式事项仍保留/);
  assert.match(html, /先进入受控选择窗口/);
  assert.match(html, /data-action="v2-rebind-capture"/);
  assert.match(html, /另有 1 项/);
  assert.doesNotMatch(html, /事项 6/);
  assert.doesNotMatch(html, /anchorId|externalId|objectId|contentHash|Primary Anchor/);
});

test("Anchor issue status suppresses repair action while formal writes are unavailable", () => {
  const html = renderV2AnchorIssueStatus([{
    conclusion: "正式事项与正文连接存在冲突",
    keyEvidence: ["当前连接不能安全确定唯一正文位置"],
    unknowns: ["尚未读取正式事项的当前状态"],
    nextActionEligible: true,
    nextActionLabel: "检查正文连接",
    narrationRuleId: "anchor-conflict",
  }], false);

  assert.match(html, /正式写入已暂停/);
  assert.doesNotMatch(html, /data-action="v2-rebind-capture"/);
});

test("Rebind capture panel explains bounded auto-sync pause without implementation identity", () => {
  const html = renderV2PrimaryAnchorRebindPanel({ status: "capturing" }, true);
  assert.match(html, /选择替换正文/);
  assert.match(html, /5 分钟/);
  assert.match(html, /data-action="v2-rebind-open"/);
  assert.match(html, /data-action="v2-rebind-cancel"/);
  assert.doesNotMatch(html, /UUID|externalId|Primary Anchor|contentHash/);
});
