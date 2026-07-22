import assert from "node:assert/strict";
import test from "node:test";

import { checksum } from "@task-copilot/shared";

import { renderV2ProposalFiles, revalidateAcceptedV2Proposal, reviewV2ProposalGroups, validateV2Proposal, validateV2ProposalForSubmission, type V2Proposal } from "../src/index.ts";

function proposal(): V2Proposal {
  const beforeText = "核对外部推送";
  const afterText = "[任务] 核对外部推送";
  return {
    proposalId: "prop_example",
    schemaVersion: "v2",
    title: "正式化外部推送核对",
    context: "当前 Block 是普通正文。",
    understanding: "用户希望把一次可完成行动纳入正式系统。",
    objective: "建立一个可追踪 Task。",
    logic: "先增加显式标识，再创建对象和 Primary Anchor。",
    finalPreview: afterText,
    unresolvedQuestions: [],
    source: { kind: "user" },
    scope: { read: [{ kind: "PAGE", id: "Journal/2026-07-20" }], modify: [{ kind: "BLOCK", id: "block-1", version: 7, hash: checksum(beforeText) }] },
    preconditions: ["Block UUID 与 hash 未变化"],
    groups: [{
      groupId: "formalize-task",
      explanation: "正文标识与 Task/Anchor 必须作为一个语义组接受。",
      risk: "MEDIUM",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [{ blockUuid: "block-1", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }],
      semanticOperations: [{ operationId: "create-task", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-1", version: 7, hash: checksum(beforeText) }, summary: "创建 OPEN Task 并绑定 Primary Anchor", payload: { objectType: "TASK", text: "核对外部推送" }, preconditions: ["marker absent"] }],
      disposition: "PENDING",
    }],
    status: "READY",
    createdAt: "2026-07-20T12:00:00.000Z",
  };
}

test("V2 Proposal validator accepts one coupled text and semantic operation group", () => {
  assert.equal(validateV2Proposal(proposal()).groups[0]?.groupId, "formalize-task");
  assert.throws(() => validateV2Proposal({ schemaVersion: "v2" }), /顶层字段/);
  const missingFinalText = proposal();
  delete missingFinalText.groups[0]!.semanticOperations[0]!.payload.text;
  assert.equal(validateV2Proposal(missingFinalText).proposalId, "prop_example", "legacy persisted records remain readable");
  assert.throws(() => validateV2ProposalForSubmission(missingFinalText), /最终对象类型与正文/);
});

test("MiniProject completion submission validates the reviewed shape early while allowing unresolved three questions", () => {
  const value = proposal();
  value.scope = { read: [{ kind: "BLOCK", id: "block-mini", hash: "12345678" }], modify: [{ kind: "OBJECT", id: "mini-1", version: 3 }] };
  value.groups = [{ groupId: "complete-mini", explanation: "独立关闭。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{
    operationId: "complete-mini", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: "mini-1", version: 3 }, summary: "完成 MiniProject",
    payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT", text: "关闭 Gate", marker: "DONE", externalId: "block-mini", contentHash: "12345678" }, preconditions: [],
  }], disposition: "PENDING" }];
  value.unresolvedQuestions = ["原目标？", "实际结果？", "遗留？"];
  assert.equal(validateV2ProposalForSubmission(value).proposalId, value.proposalId, "Marker Proposal may wait for the human answers");
  value.groups[0]!.semanticOperations[0]!.payload.closure = { originalGoal: "完成 Gate", actualResult: "", remainingWork: "无遗留" };
  assert.throws(() => validateV2ProposalForSubmission(value), /实际结果/);
  delete value.groups[0]!.semanticOperations[0]!.payload.closure;
  value.groups[0]!.semanticOperations[0]!.payload.contentHash = "bad";
  assert.throws(() => validateV2ProposalForSubmission(value), /独立 HIGH/);
});

test("V2 Proposal validator refuses modify-scope escape, stale patch hashes, and risk downgrade", () => {
  const outside = proposal();
  outside.groups[0]!.textPatches[0]!.blockUuid = "block-outside";
  assert.throws(() => validateV2Proposal(outside), /modify scope/);
  const stale = proposal();
  stale.groups[0]!.textPatches[0]!.beforeText = "正文已变化";
  assert.throws(() => validateV2Proposal(stale), /hash/);
  const downgraded = proposal();
  downgraded.groups[0]!.semanticOperations[0]!.kind = "CHANGE_OWNERSHIP";
  downgraded.groups[0]!.risk = "MEDIUM";
  assert.throws(() => validateV2Proposal(downgraded), /不能降级风险/);
});

test("V2 Proposal validator refuses missing and cyclic group dependencies", () => {
  const missing = proposal();
  missing.groups[0]!.dependencies = ["missing"];
  assert.throws(() => validateV2Proposal(missing), /依赖不存在/);
  const cyclic = proposal();
  cyclic.groups.push({ ...cyclic.groups[0]!, groupId: "second", dependencies: ["formalize-task"], textPatches: [], semanticOperations: [{ ...cyclic.groups[0]!.semanticOperations[0]!, operationId: "second-op" }] });
  cyclic.groups[0]!.dependencies = ["second"];
  assert.throws(() => validateV2Proposal(cyclic), /循环/);
});

test("two-file renderer includes every required human review section and stable JSON", () => {
  const value = proposal();
  const files = renderV2ProposalFiles(value);
  for (const heading of ["当前上下文", "理解摘要", "修改目标", "修改逻辑", "最终可读预览", "语义影响", "高影响操作", "未解决问题", "版本与来源摘要"]) assert.match(files.proposalMd, new RegExp(`## ${heading}`));
  assert.deepEqual(JSON.parse(files.proposalJson), value);
});

test("group review supports partial acceptance but blocks dependency halves and unconfirmed high impact", () => {
  const value = proposal();
  value.groups.push({
    ...value.groups[0]!, groupId: "ownership", explanation: "设置主归属。", risk: "HIGH", dependencies: ["formalize-task"], textPatches: [],
    semanticOperations: [{ ...value.groups[0]!.semanticOperations[0]!, operationId: "set-owner", kind: "CHANGE_OWNERSHIP", summary: "设置主归属" }],
  });
  const partial = reviewV2ProposalGroups(value, { "formalize-task": { disposition: "ACCEPTED" } });
  assert.equal(partial.status, "PARTIALLY_ACCEPTED");
  assert.throws(() => reviewV2ProposalGroups(value, { ownership: { disposition: "ACCEPTED", highImpactConfirmed: true } }), /依赖链/);
  assert.throws(() => reviewV2ProposalGroups(value, { "formalize-task": { disposition: "ACCEPTED" }, ownership: { disposition: "ACCEPTED" } }), /独立确认/);
  const accepted = reviewV2ProposalGroups(value, { "formalize-task": { disposition: "ACCEPTED" }, ownership: { disposition: "ACCEPTED", highImpactConfirmed: true } });
  assert.equal(accepted.status, "ACCEPTED");
});

test("group review records a valid deferral and rejects non-independent partial acceptance", () => {
  const deferred = reviewV2ProposalGroups(proposal(), { "formalize-task": { disposition: "DEFERRED", deferredUntil: "2026-07-21T09:00:00.000Z", reason: "等待确认" } });
  assert.equal(deferred.groups[0]?.deferReason, "等待确认");
  assert.equal(deferred.status, "IN_REVIEW");
  const coupled = proposal();
  coupled.groups[0]!.independentlyAcceptable = false;
  coupled.groups.push({ ...coupled.groups[0]!, groupId: "second", independentlyAcceptable: true, semanticOperations: [{ ...coupled.groups[0]!.semanticOperations[0]!, operationId: "second-op" }] });
  assert.throws(() => reviewV2ProposalGroups(coupled, { "formalize-task": { disposition: "ACCEPTED" } }), /不能脱离/);
});

test("accepted Proposal revalidation checks read context and accepted modify targets", () => {
  const value = proposal();
  value.scope.read[0]!.hash = checksum("journal snapshot");
  const accepted = reviewV2ProposalGroups(value, { "formalize-task": { disposition: "ACCEPTED" } });
  const result = revalidateAcceptedV2Proposal(accepted, [
    { kind: "PAGE", id: "Journal/2026-07-20", exists: true, hash: checksum("journal snapshot") },
    { kind: "BLOCK", id: "block-1", exists: true, version: 7, hash: checksum("核对外部推送") },
  ]);
  assert.deepEqual(result, { status: "VALID", acceptedGroupIds: ["formalize-task"] });
});

test("accepted Proposal revalidation reports stale and refuses unscoped or duplicate evidence", () => {
  const value = proposal();
  value.scope.read[0]!.hash = checksum("journal snapshot");
  const accepted = reviewV2ProposalGroups(value, { "formalize-task": { disposition: "ACCEPTED" } });
  assert.deepEqual(revalidateAcceptedV2Proposal(accepted, [
    { kind: "PAGE", id: "Journal/2026-07-20", exists: true, hash: checksum("journal snapshot") },
    { kind: "BLOCK", id: "block-1", exists: true, version: 8, hash: checksum("正文已变化") },
  ]), {
    status: "STALE",
    acceptedGroupIds: ["formalize-task"],
    issues: [
      { kind: "BLOCK", id: "block-1", reason: "VERSION_CHANGED" },
      { kind: "BLOCK", id: "block-1", reason: "HASH_CHANGED" },
    ],
  });
  assert.throws(() => revalidateAcceptedV2Proposal(accepted, [{ kind: "BLOCK", id: "outside", exists: true, version: 1 }]), /scope/);
  assert.throws(() => revalidateAcceptedV2Proposal(accepted, [
    { kind: "BLOCK", id: "block-1", exists: true, version: 7, hash: checksum("核对外部推送") },
    { kind: "BLOCK", id: "block-1", exists: true, version: 7, hash: checksum("核对外部推送") },
  ]), /重复/);
});
