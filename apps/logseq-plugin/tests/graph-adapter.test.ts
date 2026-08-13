import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { graphEvidenceProofPayload, stableHash, type GraphEffect, type ManagedProjection } from "@task-copilot/contracts";
import { LogseqGraphAdapter, type LogseqGraphHost } from "../src/graph-adapter.ts";
import { reviewFieldUuid } from "../src/projection-renderer.ts";

interface Node { uuid: string; content: string; parent: string | null; children: string[] }

class Host implements LogseqGraphHost {
  nodes = new Map<string, Node>();
  throwAfterNextMutation = false;
  afterSourceUpdate: (() => void) | null = null;

  constructor(content = "TODO 自然记录") {
    this.nodes.set("source-01", { uuid: "source-01", content, parent: null, children: [] });
  }

  tree(uuid: string): unknown {
    const value = this.nodes.get(uuid);
    return value ? { uuid: value.uuid, content: value.content, properties: {}, children: value.children.map((child) => this.tree(child)) } : null;
  }

  async getBlock(uuid: string, options?: { includeChildren: boolean }): Promise<unknown> {
    const value = this.nodes.get(uuid);
    return !value ? null : options?.includeChildren ? this.tree(uuid) : { uuid: value.uuid, content: value.content, properties: {} };
  }

  #maybeThrow(): void {
    if (this.throwAfterNextMutation) { this.throwAfterNextMutation = false; throw new Error("RESPONSE_LOST_AFTER_MUTATION"); }
  }

  async insertBlock(target: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown> {
    const targetNode = this.nodes.get(target);
    if (!targetNode) throw new Error(`HOST_TARGET_MISSING:${target}`);
    const parent = options.sibling ? targetNode.parent : target;
    if (!parent) throw new Error("HOST_PARENT_MISSING");
    const node = { uuid: options.customUUID, content: `${content}\nid:: ${options.customUUID}`, parent, children: [] };
    this.nodes.set(node.uuid, node);
    const siblings = this.nodes.get(parent)!.children;
    if (options.sibling) siblings.splice(siblings.indexOf(target) + (options.before ? 0 : 1), 0, node.uuid);
    else siblings.splice(options.before ? 0 : siblings.length, 0, node.uuid);
    this.#maybeThrow();
    return { uuid: node.uuid, content: node.content, properties: {} };
  }

  async updateBlock(uuid: string, content: string): Promise<unknown> {
    const node = this.nodes.get(uuid);
    if (!node) throw new Error(`HOST_BLOCK_MISSING:${uuid}`);
    node.content = content;
    if (uuid === "source-01" && this.afterSourceUpdate) { const action = this.afterSourceUpdate; this.afterSourceUpdate = null; action(); }
    this.#maybeThrow();
    return this.getBlock(uuid);
  }

  async removeBlock(uuid: string): Promise<unknown> {
    const node = this.nodes.get(uuid);
    if (!node) return null;
    for (const child of [...node.children]) await this.removeBlock(child);
    if (node.parent) this.nodes.get(node.parent)!.children = this.nodes.get(node.parent)!.children.filter((child) => child !== uuid);
    this.nodes.delete(uuid);
    this.#maybeThrow();
    return null;
  }

  addNaturalChild(uuid = "natural-child", content = "用户自然子块"): void {
    this.nodes.set(uuid, { uuid, content, parent: "source-01", children: [] });
    this.nodes.get("source-01")!.children.push(uuid);
  }
}

const identity = {
  containerUuid: "11111111-1111-4111-8111-111111111111",
  titleUuid: "22222222-2222-4222-8222-222222222222",
  stateUuid: "33333333-3333-4333-8333-333333333333",
  focusUuid: "44444444-4444-4444-8444-444444444444",
  waitingUuid: "66666666-6666-4666-8666-666666666666",
};

function projection(overrides: Partial<Omit<ManagedProjection, "projectionHash">> = {}): ManagedProjection {
  const core = { ...identity, title: "自然记录", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, waitingCondition: null, currentFocus: null, ...overrides };
  return { ...core, projectionHash: stableHash(core) };
}

function reproject(before: ManagedProjection, overrides: Partial<Omit<ManagedProjection, "projectionHash">>): ManagedProjection {
  const core: Partial<ManagedProjection> = { ...before };
  delete core.projectionHash;
  return projection({ ...core as Omit<ManagedProjection, "projectionHash">, ...overrides });
}

const initial = projection();
const upsert = { type: "UPSERT_MANAGED_PROJECTION", commitId: "commit-create", effectId: "effect-create", graphId: "graph-01", sourceBlockUuid: "source-01", projection: initial } satisfies GraphEffect;

function focusEffect(before: ManagedProjection, value: string | null, suffix = "focus"): Extract<GraphEffect, { type: "SET_CURRENT_FOCUS_FIELD" }> {
  const after = reproject(before, { currentFocus: value });
  return { type: "SET_CURRENT_FOCUS_FIELD", commitId: `commit-${suffix}`, effectId: `effect-${suffix}`, graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: identity.containerUuid, fieldUuid: identity.focusUuid, content: value, expectedProjectionHash: before.projectionHash, resultingProjectionHash: after.projectionHash, expectedProjection: before, resultingProjection: after };
}

function engagementEffect(before: ManagedProjection, after: ManagedProjection, suffix = "engagement"): Extract<GraphEffect, { type: "CHANGE_ENGAGEMENT_FIELDS" }> {
  return { type: "CHANGE_ENGAGEMENT_FIELDS", commitId: `commit-${suffix}`, effectId: `effect-${suffix}`, graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: identity.containerUuid, stateUuid: identity.stateUuid, waitingUuid: identity.waitingUuid, engagement: after.engagement as "ACTIONABLE" | "WAITING", waiting: after.waitingCondition, expectedProjectionHash: before.projectionHash, resultingProjectionHash: after.projectionHash, expectedProjection: before, resultingProjection: after };
}

function closureEffect(before: ManagedProjection, after: ManagedProjection, expectedMarker: "TODO" | "DONE", resultingMarker: "TODO" | "DONE", suffix = "closure"): Extract<GraphEffect, { type: "CHANGE_CLOSURE_FIELDS" }> {
  return { type: "CHANGE_CLOSURE_FIELDS", commitId: `commit-${suffix}`, effectId: `effect-${suffix}`, graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: identity.containerUuid, stateUuid: identity.stateUuid, focusUuid: identity.focusUuid, expectedSourceMarker: expectedMarker, resultingSourceMarker: resultingMarker, expectedProjection: before, lifecycle: after.lifecycle, engagement: after.engagement, waitingCondition: after.waitingCondition, currentFocus: after.currentFocus, closure: after.closure ?? null, expectedProjectionHash: before.projectionHash, resultingProjectionHash: after.projectionHash, resultingProjection: after };
}

test("ordinary formalization is a verified zero-noise projection", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01");
  assert.equal((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" })).projection, null);
  assert.equal((await adapter.applyGraphEffect(upsert)).projectionHash, initial.projectionHash);
  assert.deepEqual(host.nodes.get("source-01")!.children, []);
  assert.equal(host.nodes.get("source-01")!.content, "TODO 自然记录");
  assert.equal((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: initial })).projection?.projectionHash, initial.projectionHash);
});

test("focus is UUID-addressed, label-independent, and safely standardized by re-render", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const effect = focusEffect(initial, "验证管理网络"); const after = effect.resultingProjection!;
  await adapter.applyGraphEffect(effect);
  assert.deepEqual(host.nodes.get("source-01")!.children, [identity.focusUuid]);
  assert.match(host.nodes.get(identity.focusUuid)!.content, /^\*\*\[当前推进\]\*\* 验证管理网络/u);
  host.nodes.get(identity.focusUuid)!.content = "**[推进]** 验证管理网络";
  assert.equal((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: after })).projection?.projectionHash, after.projectionHash);
  await adapter.rerenderManagedProjection({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: after });
  assert.equal(host.nodes.get(identity.focusUuid)!.content, "**[当前推进]** 验证管理网络");
});

test("value or topology conflicts fail closed and preserve natural children", async () => {
  const host = new Host(); host.addNaturalChild(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const effect = focusEffect(initial, "原推进"); const focused = effect.resultingProjection!; await adapter.applyGraphEffect(effect);
  host.nodes.get(identity.focusUuid)!.content = "**[当前推进]** 用户编辑后的推进";
  await assert.rejects(adapter.rerenderManagedProjection({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: focused }), /GRAPH_RERENDER_CONFLICT/u);
  assert.equal(host.nodes.get(identity.focusUuid)!.content, "**[当前推进]** 用户编辑后的推进");
  assert.equal(host.nodes.get("natural-child")!.content, "用户自然子块");

  host.nodes.get(identity.focusUuid)!.content = "**[当前推进]** 原推进";
  host.nodes.get("source-01")!.children = host.nodes.get("source-01")!.children.filter((uuid) => uuid !== identity.focusUuid);
  host.nodes.get(identity.focusUuid)!.parent = "natural-child";
  host.nodes.get("natural-child")!.children.push(identity.focusUuid);
  await assert.rejects(adapter.rerenderManagedProjection({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: focused }), /GRAPH_RERENDER_CONFLICT/u);
});

test("Waiting and review render as sparse ordered children while full semantics stay Kernel-owned", async () => {
  const host = new Host(); host.addNaturalChild(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const condition = { workObjectId: "work-01", description: "网络组确认测试 VLAN", since: "2026-08-13T08:00:00.000Z", reviewAt: "2026-08-15", evidenceIds: ["evidence-01"] };
  const waiting = projection({ engagement: "WAITING", waitingCondition: condition });
  await adapter.applyGraphEffect(engagementEffect(initial, waiting));
  assert.deepEqual(host.nodes.get("source-01")!.children, [identity.waitingUuid, reviewFieldUuid(identity.waitingUuid), "natural-child"]);
  assert.equal(host.nodes.get(identity.waitingUuid)!.content.split("\n")[0], "**[等待]** 网络组确认测试 VLAN");
  assert.equal(host.nodes.get(reviewFieldUuid(identity.waitingUuid))!.content.split("\n")[0], "**[复查]** 2026-08-15");
  assert.deepEqual((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: waiting })).projection?.waitingCondition, condition);
  await adapter.applyGraphEffect(engagementEffect(waiting, initial, "actionable"));
  assert.deepEqual(host.nodes.get("source-01")!.children, ["natural-child"]);
});

test("partial multi-block response loss resumes without overwriting a third value", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const condition = { workObjectId: "work-01", description: "等待测试资源", since: "2026-08-13T08:00:00.000Z", reviewAt: "2026-08-15", evidenceIds: [] };
  const waiting = projection({ engagement: "WAITING", waitingCondition: condition }); const effect = engagementEffect(initial, waiting, "response-loss");
  host.throwAfterNextMutation = true;
  await assert.rejects(adapter.applyGraphEffect(effect), /RESPONSE_LOST_AFTER_MUTATION/u);
  assert.ok(host.nodes.has(identity.waitingUuid)); assert.equal(host.nodes.has(reviewFieldUuid(identity.waitingUuid)), false);
  assert.equal((await adapter.applyGraphEffect(effect)).projectionHash, waiting.projectionHash);
  assert.ok(host.nodes.has(reviewFieldUuid(identity.waitingUuid)));
});

test("Completion uses DONE alone when outcome repeats title and shows only an informative outcome", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const completed = projection({ lifecycle: "COMPLETED", engagement: null, closure: { type: "COMPLETED", recordId: "completion-01", outcomeSummary: "自然记录" } });
  await adapter.applyGraphEffect(closureEffect(initial, completed, "TODO", "DONE", "complete-default"));
  assert.equal(host.nodes.get("source-01")!.content, "DONE 自然记录");
  assert.deepEqual(host.nodes.get("source-01")!.children, []);

  const reopened = projection(); await adapter.applyGraphEffect(closureEffect(completed, reopened, "DONE", "TODO", "reopen"));
  const informative = projection({ lifecycle: "COMPLETED", engagement: null, closure: { type: "COMPLETED", recordId: "completion-02", outcomeSummary: "管理口和业务口均已验证" } });
  await adapter.applyGraphEffect(closureEffect(reopened, informative, "TODO", "DONE", "complete-informative"));
  assert.equal(host.nodes.get(identity.stateUuid)!.content.split("\n")[0], "**[完成]** 管理口和业务口均已验证");
});

test("Cancellation and reopen use one stable closure UUID", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const cancelled = projection({ lifecycle: "CANCELLED", engagement: null, closure: { type: "CANCELLED", recordId: "cancel-01", reason: "替代方案已覆盖" } });
  await adapter.applyGraphEffect(closureEffect(initial, cancelled, "TODO", "TODO", "cancel"));
  assert.equal(host.nodes.get(identity.stateUuid)!.content.split("\n")[0], "**[取消]** 替代方案已覆盖");
  await adapter.applyGraphEffect(closureEffect(cancelled, initial, "TODO", "TODO", "reopen-cancel"));
  assert.equal(host.nodes.has(identity.stateUuid), false);
});

test("marker response loss and restart-style retry converge safely", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const completed = projection({ lifecycle: "COMPLETED", engagement: null, closure: { type: "COMPLETED", recordId: "completion-loss", outcomeSummary: "自然记录" } });
  const effect = closureEffect(initial, completed, "TODO", "DONE", "marker-loss"); host.throwAfterNextMutation = true;
  await assert.rejects(adapter.applyGraphEffect(effect), /RESPONSE_LOST_AFTER_MUTATION/u);
  assert.equal(host.nodes.get("source-01")!.content, "DONE 自然记录");
  const restarted = new LogseqGraphAdapter(host, "graph-01");
  assert.equal((await restarted.applyGraphEffect(effect)).projectionHash, completed.projectionHash);
});

test("a managed edit between marker and presentation writes is retained and fails closed", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const focus = focusEffect(initial, "原推进").resultingProjection!; await adapter.applyGraphEffect(focusEffect(initial, "原推进"));
  const completed = reproject(focus, { lifecycle: "COMPLETED", engagement: null, currentFocus: null, closure: { type: "COMPLETED", recordId: "completion-race", outcomeSummary: "自然记录" } });
  host.afterSourceUpdate = () => { host.nodes.get(identity.focusUuid)!.content = "**[当前推进]** 用户并发修改"; };
  await assert.rejects(adapter.applyGraphEffect(closureEffect(focus, completed, "TODO", "DONE", "race")), /GRAPH_CLOSURE_PRECONDITION_FAILED/u);
  assert.equal(host.nodes.get(identity.focusUuid)!.content, "**[当前推进]** 用户并发修改");
});

test("bounded legacy engineering projection is presentation-equivalent and safely converges", async () => {
  const host = new Host();
  host.nodes.set(identity.containerUuid, { uuid: identity.containerUuid, content: `> [Task Copilot]\ntask-copilot-managed:: true\ntask-copilot-focus-uuid:: ${identity.focusUuid}\ntask-copilot-waiting-uuid:: ${identity.waitingUuid}`, parent: "source-01", children: [identity.titleUuid, identity.stateUuid] });
  host.nodes.get("source-01")!.children = [identity.containerUuid];
  host.nodes.set(identity.titleUuid, { uuid: identity.titleUuid, content: "标题：自然记录", parent: identity.containerUuid, children: [] });
  host.nodes.set(identity.stateUuid, { uuid: identity.stateUuid, content: "状态：OPEN · ACTIONABLE", parent: identity.containerUuid, children: [] });
  const adapter = new LogseqGraphAdapter(host, "graph-01");
  assert.equal((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: initial })).projection?.projectionHash, initial.projectionHash);
  await adapter.rerenderManagedProjection({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: initial });
  assert.equal(host.nodes.has(identity.containerUuid), false);
  assert.deepEqual(host.nodes.get("source-01")!.children, []);
});

test("legacy ownership expansion prevents destructive re-render", async () => {
  const host = new Host();
  host.nodes.set(identity.containerUuid, { uuid: identity.containerUuid, content: "> [Task Copilot]\ntask-copilot-managed:: true", parent: "source-01", children: [identity.titleUuid, identity.stateUuid] });
  host.nodes.get("source-01")!.children = [identity.containerUuid];
  host.nodes.set(identity.titleUuid, { uuid: identity.titleUuid, content: "标题：自然记录", parent: identity.containerUuid, children: [] });
  host.nodes.set(identity.stateUuid, { uuid: identity.stateUuid, content: "状态：OPEN · ACTIONABLE\n用户备注：必须保留", parent: identity.containerUuid, children: [] });
  const adapter = new LogseqGraphAdapter(host, "graph-01");
  await assert.rejects(adapter.rerenderManagedProjection({ graphId: "graph-01", sourceBlockUuid: "source-01", expectedProjection: initial }), /GRAPH_RERENDER_CONFLICT/u);
  assert.match(host.nodes.get(identity.stateUuid)!.content, /必须保留/u);
});

test("create compensation removes registered presentation only", async () => {
  const host = new Host(); host.addNaturalChild(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(upsert);
  const focused = focusEffect(initial, "验证网络").resultingProjection!; await adapter.applyGraphEffect(focusEffect(initial, "验证网络"));
  const remove = { type: "REMOVE_MANAGED_PROJECTION", commitId: "commit-remove", effectId: "effect-remove", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: identity.containerUuid, expectedProjectionHash: focused.projectionHash, expectedProjection: focused } satisfies GraphEffect;
  assert.equal((await adapter.applyGraphEffect(remove)).projectionHash, null);
  assert.equal(host.nodes.has(identity.focusUuid), false);
  assert.equal(host.nodes.get("natural-child")!.content, "用户自然子块");
});

test("fresh readback tolerates only the exact pre-write projection while Logseq catches up", async () => {
  const host = new Host(); const setup = new LogseqGraphAdapter(host, "graph-01"); await setup.applyGraphEffect(upsert);
  const focused = focusEffect(initial, "验证网络").resultingProjection!;
  let staleReads = 2;
  const lagged: LogseqGraphHost = {
    insertBlock: host.insertBlock.bind(host), updateBlock: host.updateBlock.bind(host), removeBlock: host.removeBlock.bind(host),
    getBlock: async (uuid, options) => {
      const value = await host.getBlock(uuid, options);
      if (uuid !== "source-01" || !options?.includeChildren || staleReads <= 0 || !host.nodes.has(identity.focusUuid)) return value;
      staleReads -= 1;
      return { uuid: "source-01", content: host.nodes.get("source-01")!.content, properties: {}, children: [] };
    },
  };
  assert.equal((await new LogseqGraphAdapter(lagged, "graph-01").applyGraphEffect(focusEffect(initial, "验证网络"))).projectionHash, focused.projectionHash);
  assert.equal(staleReads, 0);
});

test("evidence material remains a fresh canonical read bound to the separate proof capability", async () => {
  const host = new Host("自然记录\r\nid:: 11111111-1111-4111-8111-111111111111"); const adapter = new LogseqGraphAdapter(host, "graph-01");
  const proofKey = "a".repeat(64); const material = await adapter.readEvidenceMaterial({ graphId: "graph-01", blockUuid: "source-01" }, proofKey);
  assert.equal(material.content, "自然记录"); assert.equal(material.sourceContentHash, stableHash("自然记录"));
  assert.equal(material.proof, createHmac("sha256", proofKey).update(graphEvidenceProofPayload(material)).digest("hex"));
});
