import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { deterministicUuid, graphEvidenceProofPayload, stableHash, type GraphEffect } from "@task-copilot/contracts";
import { LogseqGraphAdapter, type LogseqGraphHost } from "../src/graph-adapter.ts";

interface Node { uuid: string; content: string; parent: string | null; children: string[] }
class Host implements LogseqGraphHost {
  nodes = new Map<string, Node>();
  failAfterNextUpdate = false;
  mutateStateAfterSourceUpdate: (() => void) | null = null;
  mutateSourceBeforeShallowRead: (() => void) | null = null;
  mutateFocusAfterStateUpdate: (() => void) | null = null;
  mutateFocusBeforeShallowRead: (() => void) | null = null;
  constructor() { this.nodes.set("source-01", { uuid: "source-01", content: "自然记录", parent: null, children: [] }); }
  tree(uuid: string): unknown { const value = this.nodes.get(uuid); return value ? { uuid: value.uuid, content: value.content, properties: {}, children: value.children.map((child) => this.tree(child)) } : null; }
  async getBlock(uuid: string, options?: { includeChildren: boolean }): Promise<unknown> {
    if (uuid === "source-01" && !options?.includeChildren && this.mutateSourceBeforeShallowRead) { const mutate = this.mutateSourceBeforeShallowRead; this.mutateSourceBeforeShallowRead = null; mutate(); }
    if (uuid === core.focusUuid && !options?.includeChildren && this.mutateFocusBeforeShallowRead) { const mutate = this.mutateFocusBeforeShallowRead; this.mutateFocusBeforeShallowRead = null; mutate(); }
    const value = this.nodes.get(uuid); return !value ? null : options?.includeChildren ? this.tree(uuid) : { uuid: value.uuid, content: value.content };
  }
  async insertBlock(target: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown> {
    const targetNode = this.nodes.get(target)!; const parent = options.sibling ? targetNode.parent : target;
    const node = { uuid: options.customUUID, content: `${content}\nid:: ${options.customUUID}`, parent, children: [] }; this.nodes.set(node.uuid, node);
    const siblings = parent ? this.nodes.get(parent)!.children : [];
    if (options.sibling) siblings.splice(siblings.indexOf(target) + (options.before ? 0 : 1), 0, node.uuid); else siblings.splice(options.before ? 0 : siblings.length, 0, node.uuid);
    return { uuid: node.uuid, content: node.content };
  }
  async updateBlock(uuid: string, content: string): Promise<unknown> {
    this.nodes.get(uuid)!.content = content;
    if (uuid === "source-01" && this.mutateStateAfterSourceUpdate) { const mutate = this.mutateStateAfterSourceUpdate; this.mutateStateAfterSourceUpdate = null; mutate(); }
    if (uuid === core.stateUuid && this.mutateFocusAfterStateUpdate) { const mutate = this.mutateFocusAfterStateUpdate; this.mutateFocusAfterStateUpdate = null; mutate(); }
    if (this.failAfterNextUpdate) { this.failAfterNextUpdate = false; throw new Error("RESPONSE_LOST_AFTER_UPDATE"); }
    return this.getBlock(uuid);
  }
  async removeBlock(uuid: string): Promise<unknown> { const value = this.nodes.get(uuid)!; if (value.parent) this.nodes.get(value.parent)!.children = this.nodes.get(value.parent)!.children.filter((child) => child !== uuid); this.nodes.delete(uuid); return null; }
}

const core = { containerUuid: "11111111-1111-4111-8111-111111111111", titleUuid: "22222222-2222-4222-8222-222222222222", stateUuid: "33333333-3333-4333-8333-333333333333", focusUuid: "44444444-4444-4444-8444-444444444444", waitingUuid: "66666666-6666-4666-8666-666666666666", title: "自然记录", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, waitingCondition: null, currentFocus: null };
const effect = {
  type: "UPSERT_MANAGED_PROJECTION", commitId: "commit-01", effectId: "effect-01",
  graphId: "graph-01", sourceBlockUuid: "source-01", projection: { ...core, projectionHash: stableHash(core) },
} satisfies GraphEffect;

test("real adapter contract writes a deterministic child projection and leaves natural text intact", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01", () => "2026-08-12T00:00:00.000Z");
  assert.equal((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" })).projection, null);
  const result = await adapter.applyGraphEffect(effect);
  assert.equal(result.projectionHash, effect.projection.projectionHash);
  assert.equal(host.nodes.get("source-01")?.content, "自然记录");
  assert.deepEqual(host.nodes.get(core.containerUuid)?.children, [core.titleUuid, core.stateUuid]);
});

test("evidence material is a fresh canonical Graph read bound to the separate proof capability", async () => {
  const host = new Host();
  host.nodes.get("source-01")!.content = "自然记录\r\nid:: 11111111-1111-4111-8111-111111111111";
  const adapter = new LogseqGraphAdapter(host, "graph-01", () => "2026-08-12T00:00:00.000Z");
  const proofKey = "a".repeat(64);
  const material = await adapter.readEvidenceMaterial({ graphId: "graph-01", blockUuid: "source-01" }, proofKey);
  assert.deepEqual({ ...material, proof: undefined }, {
    graphId: "graph-01",
    blockUuid: "source-01",
    content: "自然记录",
    sourceContentHash: stableHash("自然记录"),
    proof: undefined,
  });
  assert.equal(material.proof, createHmac("sha256", proofKey).update(graphEvidenceProofPayload(material)).digest("hex"));
});

test("remove refuses an edited or expanded managed container", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  await host.insertBlock(core.containerUuid, "用户后续内容", { sibling: false, customUUID: "55555555-5555-4555-8555-555555555555" });
  await assert.rejects(adapter.applyGraphEffect({
    type: "REMOVE_MANAGED_PROJECTION", commitId: "commit-02", effectId: "effect-02", graphId: "graph-01",
    sourceBlockUuid: "source-01", containerUuid: core.containerUuid, expectedProjectionHash: effect.projection.projectionHash,
  }), /GRAPH_REMOVE_PRECONDITION_FAILED/u);
  assert.ok(host.nodes.has(core.containerUuid));
});

test("update rechecks the full projection hash immediately before writing", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  host.nodes.get(core.stateUuid)!.content = "状态：OPEN · WAITING";
  await assert.rejects(adapter.applyGraphEffect({
    type: "UPDATE_MANAGED_FIELD", commitId: "commit-rename", effectId: "effect-rename", graphId: "graph-01",
    sourceBlockUuid: "source-01", fieldUuid: core.titleUuid, content: "标题：新标题",
    expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: "deadbeef",
  }), /GRAPH_(?:UPDATE_PRECONDITION_FAILED|WAITING_INVARIANT_INVALID)/u);
  assert.equal(host.nodes.get(core.titleUuid)?.content.includes("自然记录"), true);
});

test("current focus uses one stable field UUID and clear removes only that managed field", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const focusedCore = { ...core, currentFocus: "准备上架" };
  await adapter.applyGraphEffect({
    type: "SET_CURRENT_FOCUS_FIELD", commitId: "commit-focus", effectId: "effect-focus", graphId: "graph-01", sourceBlockUuid: "source-01",
    containerUuid: core.containerUuid, fieldUuid: core.focusUuid, content: "准备上架", expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(focusedCore),
  });
  assert.equal(host.nodes.get(core.focusUuid)?.content.includes("准备上架"), true);
  await adapter.applyGraphEffect({
    type: "SET_CURRENT_FOCUS_FIELD", commitId: "commit-clear", effectId: "effect-clear", graphId: "graph-01", sourceBlockUuid: "source-01",
    containerUuid: core.containerUuid, fieldUuid: core.focusUuid, content: null, expectedProjectionHash: stableHash(focusedCore), resultingProjectionHash: effect.projection.projectionHash,
  });
  assert.equal(host.nodes.has(core.focusUuid), false);
  assert.ok(host.nodes.has(core.titleUuid));
  assert.equal(host.nodes.get("source-01")?.content, "自然记录");
});

test("Waiting projection is human-readable, stable, removable, and round-trips its full condition", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const condition = { workObjectId: "work-01", description: "等待网络组分配 VLAN", since: "2026-08-13T08:00:00.000Z", reviewAt: "2026-08-15T00:00:00.000Z", evidenceIds: ["evidence-01"] };
  const waitingCore = { ...core, engagement: "WAITING" as const, waitingCondition: condition };
  await adapter.applyGraphEffect({ type: "CHANGE_ENGAGEMENT_FIELDS", commitId: "commit-wait", effectId: "effect-wait", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, waitingUuid: core.waitingUuid, engagement: "WAITING", waiting: condition, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(waitingCore) });
  assert.match(host.nodes.get(core.stateUuid)!.content, /\n等待：等待网络组分配 VLAN\n/u);
  assert.match(host.nodes.get(core.stateUuid)!.content, /复查：2026-08-15/u);
  assert.deepEqual((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" })).projection?.waitingCondition, condition);
  await adapter.applyGraphEffect({ type: "CHANGE_ENGAGEMENT_FIELDS", commitId: "commit-actionable", effectId: "effect-actionable", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, waitingUuid: core.waitingUuid, engagement: "ACTIONABLE", waiting: null, expectedProjectionHash: stableHash(waitingCore), resultingProjectionHash: effect.projection.projectionHash });
  assert.doesNotMatch(host.nodes.get(core.stateUuid)!.content, /等待：/u);
  assert.equal(host.nodes.get("source-01")?.content, "自然记录");
});

test("Waiting projection parsing is stable when Logseq normalizes property lines before human text", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const condition = { workObjectId: "work-01", description: "等待网络组分配 VLAN", since: "2026-08-13T08:00:00.000Z", reviewAt: null, evidenceIds: ["evidence-01"] };
  const waitingCore = { ...core, engagement: "WAITING" as const, waitingCondition: condition };
  host.nodes.get(core.stateUuid)!.content = ["TASK-COPILOT-WAITING-SUBJECT:: work-01", "TASK-COPILOT-WAITING-SINCE:: 2026-08-13T08:00:00.000Z", "TASK-COPILOT-WAITING-EVIDENCE:: [\"evidence-01\"]", "状态：OPEN · WAITING", "等待：等待网络组分配 VLAN"].join("\n");
  const snapshot = await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" });
  assert.deepEqual(snapshot.projection?.waitingCondition, condition);
  assert.equal(snapshot.projection?.projectionHash, stableHash(waitingCore));
});

test("Waiting projection parsing matches Logseq's persisted property layout", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const condition = { workObjectId: "52ae1c4d-1e97-4622-852b-0b5137fc0ae9", description: "等待网络组分配 VLAN 和网关信息", since: "2026-08-12T19:15:46.124Z", reviewAt: null, evidenceIds: ["evidence-014a1606-a0e3-4a83-a04d-585c60c24f0f"] };
  const waitingCore = { ...core, engagement: "WAITING" as const, waitingCondition: condition };
  host.nodes.get(core.stateUuid)!.content = ["状态：OPEN · WAITING", "id:: 33333333-3333-4333-8333-333333333333", "task-copilot-waiting-subject:: 52ae1c4d-1e97-4622-852b-0b5137fc0ae9", "task-copilot-waiting-since:: 2026-08-12T19:15:46.124Z", "task-copilot-waiting-evidence:: [\"evidence-014a1606-a0e3-4a83-a04d-585c60c24f0f\"]", "等待：等待网络组分配 VLAN 和网关信息"].join("\n");
  const snapshot = await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" });
  assert.deepEqual(snapshot.projection?.waitingCondition, condition);
  assert.equal(snapshot.projection?.projectionHash, stableHash(waitingCore));
});

test("Waiting projection reads properties when Logseq omits property lines from content", async () => {
  const host = new Host(); const setupAdapter = new LogseqGraphAdapter(host, "graph-01"); await setupAdapter.applyGraphEffect(effect);
  const adapter = new LogseqGraphAdapter({
    insertBlock: host.insertBlock.bind(host), updateBlock: host.updateBlock.bind(host), removeBlock: host.removeBlock.bind(host),
    getBlock: async (uuid, options) => {
      const enrich = (value: unknown): unknown => {
        if (!value || typeof value !== "object") return value;
        const record = value as Record<string, unknown>;
        const enriched: Record<string, unknown> = record.uuid === core.stateUuid ? { ...record, content: "状态：OPEN · WAITING\n等待：等待网络组分配 VLAN", properties: { id: core.stateUuid, "task-copilot-waiting-subject": "work-01", "task-copilot-waiting-since": "2026-08-13T08:00:00.000Z", "task-copilot-waiting-evidence": "[\"evidence-01\"]", "logseq.order-list-type": "number" } } : { ...record };
        if (Array.isArray(record.children)) enriched.children = record.children.map(enrich);
        return enriched;
      };
      return enrich(await host.getBlock(uuid, options));
  } }, "graph-01");
  host.nodes.get(core.stateUuid)!.content = "状态：OPEN · WAITING\n等待：等待网络组分配 VLAN";
  const condition = { workObjectId: "work-01", description: "等待网络组分配 VLAN", since: "2026-08-13T08:00:00.000Z", reviewAt: null, evidenceIds: ["evidence-01"] };
  const snapshot = await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" });
  assert.deepEqual(snapshot.projection?.waitingCondition, condition);
});

test("Engagement effect is one atomic managed-field write and resumes after its response is lost", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const condition = { workObjectId: "work-01", description: "等待网络组分配 VLAN", since: "2026-08-13T08:00:00.000Z", reviewAt: null, evidenceIds: ["evidence-01"] };
  const waitingCore = { ...core, engagement: "WAITING" as const, waitingCondition: condition };
  const enter = { type: "CHANGE_ENGAGEMENT_FIELDS", commitId: "commit-enter-resume", effectId: "effect-enter-resume", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, waitingUuid: core.waitingUuid, engagement: "WAITING", waiting: condition, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(waitingCore) } satisfies GraphEffect;
  host.failAfterNextUpdate = true;
  await assert.rejects(adapter.applyGraphEffect(enter), /RESPONSE_LOST_AFTER_UPDATE/u);
  assert.match(host.nodes.get(core.stateUuid)!.content, /^状态：OPEN · WAITING\n等待：等待网络组分配 VLAN/u);
  assert.match(host.nodes.get(core.stateUuid)!.content, /等待：等待网络组分配 VLAN/u);
  assert.equal((await adapter.applyGraphEffect(enter)).projectionHash, enter.resultingProjectionHash);
  assert.equal((await adapter.applyGraphEffect(enter)).projectionHash, enter.resultingProjectionHash);

  const leave = { type: "CHANGE_ENGAGEMENT_FIELDS", commitId: "commit-leave-resume", effectId: "effect-leave-resume", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, waitingUuid: core.waitingUuid, engagement: "ACTIONABLE", waiting: null, expectedProjectionHash: enter.resultingProjectionHash, resultingProjectionHash: effect.projection.projectionHash } satisfies GraphEffect;
  host.failAfterNextUpdate = true;
  await assert.rejects(adapter.applyGraphEffect(leave), /RESPONSE_LOST_AFTER_UPDATE/u);
  assert.equal(host.nodes.get(core.stateUuid)?.content, "状态：OPEN · ACTIONABLE");
  assert.doesNotMatch(host.nodes.get(core.stateUuid)!.content, /等待：/u);
  assert.equal((await adapter.applyGraphEffect(leave)).projectionHash, leave.resultingProjectionHash);
  assert.equal((await adapter.applyGraphEffect(leave)).projectionHash, leave.resultingProjectionHash);
});

test("Engagement update refuses to overwrite extra user content in the managed state block", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  host.nodes.get(core.stateUuid)!.content += "\n用户备注：不要覆盖";
  const condition = { workObjectId: "work-01", description: "等待网络组分配 VLAN", since: "2026-08-13T08:00:00.000Z", reviewAt: null, evidenceIds: ["evidence-01"] };
  await assert.rejects(adapter.applyGraphEffect({ type: "CHANGE_ENGAGEMENT_FIELDS", commitId: "commit-user-note", effectId: "effect-user-note", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, waitingUuid: core.waitingUuid, engagement: "WAITING", waiting: condition, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash({ ...core, engagement: "WAITING", waitingCondition: condition }) }), /GRAPH_ENGAGEMENT_PRECONDITION_FAILED/u);
  assert.match(host.nodes.get(core.stateUuid)!.content, /用户备注：不要覆盖/u);
});

test("Phase 2 managed projections derive the Phase 3 focus UUID without rejecting existing objects", async () => {
  const host = new Host();
  host.nodes.set(core.containerUuid, { uuid: core.containerUuid, content: "> [Task Copilot]\ntask-copilot-managed:: true", parent: "source-01", children: [core.titleUuid, core.stateUuid] });
  host.nodes.get("source-01")!.children = [core.containerUuid];
  host.nodes.set(core.titleUuid, { uuid: core.titleUuid, content: "标题：自然记录", parent: core.containerUuid, children: [] });
  host.nodes.set(core.stateUuid, { uuid: core.stateUuid, content: "状态：OPEN · ACTIONABLE", parent: core.containerUuid, children: [] });
  const snapshot = await new LogseqGraphAdapter(host, "graph-01").readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" });
  assert.equal(snapshot.projection?.focusUuid, deterministicUuid(`focus:${core.containerUuid}`));
  assert.equal(snapshot.projection?.currentFocus, null);
});

test("Closure effect converges marker, state, summary, Waiting removal, and focus removal as one verified result", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "TODO 自然记录";
  const adapter = new LogseqGraphAdapter(host, "graph-01", () => "2026-08-13T10:00:00.000Z"); await adapter.applyGraphEffect(effect);
  const record = { id: "completion-01", workObjectId: "work-01", completedAt: "2026-08-13T10:00:00.000Z", outcomeSummary: "完成生产验证", evidenceIds: [], createdBy: { type: "USER" as const, id: "local-user" } };
  const closure = { type: "COMPLETED" as const, recordId: record.id, outcomeSummary: record.outcomeSummary };
  const closedCore = { ...core, lifecycle: "COMPLETED" as const, engagement: null, closure };
  const close = { type: "CHANGE_CLOSURE_FIELDS", commitId: "commit-close", effectId: "effect-close", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, focusUuid: core.focusUuid, expectedSourceMarker: "TODO", resultingSourceMarker: "DONE", expectedProjection: effect.projection, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, closure, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(closedCore) } satisfies GraphEffect;
  const applied = await adapter.applyGraphEffect(close);
  assert.equal(applied.projectionHash, close.resultingProjectionHash);
  assert.equal(host.nodes.get("source-01")?.content, "DONE 自然记录");
  assert.match(host.nodes.get(core.stateUuid)!.content, /^状态：COMPLETED · null\n完成：完成生产验证/u);
  assert.equal((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" })).projection?.closure?.type, "COMPLETED");
  assert.equal((await adapter.applyGraphEffect(close)).projectionHash, close.resultingProjectionHash);
});

test("Closure effect fails closed when marker or managed projection changed", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "TODO 自然记录"; const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const record = { id: "completion-01", workObjectId: "work-01", completedAt: "2026-08-13T10:00:00.000Z", outcomeSummary: "完成", evidenceIds: [], createdBy: { type: "USER" as const, id: "local-user" } };
  const closure = { type: "COMPLETED" as const, recordId: record.id, outcomeSummary: record.outcomeSummary };
  host.nodes.get("source-01")!.content = "DOING 自然记录";
  await assert.rejects(adapter.applyGraphEffect({ type: "CHANGE_CLOSURE_FIELDS", commitId: "commit-race", effectId: "effect-race", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, focusUuid: core.focusUuid, expectedSourceMarker: "TODO", resultingSourceMarker: "DONE", expectedProjection: effect.projection, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, closure, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash({ ...core, lifecycle: "COMPLETED", engagement: null, closure }) }), /GRAPH_CLOSURE_PRECONDITION_FAILED/u);
  assert.equal(host.nodes.get("source-01")?.content, "DOING 自然记录"); assert.match(host.nodes.get(core.stateUuid)!.content, /^状态：OPEN · ACTIONABLE/u);
});

test("Closure effect resumes safely after the marker write response is lost", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "TODO 自然记录"; const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const record = { id: "completion-resume", workObjectId: "work-01", completedAt: "2026-08-13T10:00:00.000Z", outcomeSummary: "完成", evidenceIds: [], createdBy: { type: "USER" as const, id: "local-user" } }; const closure = { type: "COMPLETED" as const, recordId: record.id, outcomeSummary: "完成" }; const resultCore = { ...core, lifecycle: "COMPLETED" as const, engagement: null, closure };
  const close = { type: "CHANGE_CLOSURE_FIELDS", commitId: "commit-resume", effectId: "effect-resume", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, focusUuid: core.focusUuid, expectedSourceMarker: "TODO", resultingSourceMarker: "DONE", expectedProjection: effect.projection, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, closure, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(resultCore) } satisfies GraphEffect;
  host.failAfterNextUpdate = true; await assert.rejects(adapter.applyGraphEffect(close), /RESPONSE_LOST_AFTER_UPDATE/u); assert.equal(host.nodes.get("source-01")?.content, "DONE 自然记录"); assert.match(host.nodes.get(core.stateUuid)!.content, /^状态：OPEN/u);
  assert.equal((await adapter.applyGraphEffect(close)).projectionHash, close.resultingProjectionHash);
});

test("Closure effect tolerates Logseq reads that briefly lag a completed state write", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "DONE 自然记录";
  const setupAdapter = new LogseqGraphAdapter(host, "graph-01"); await setupAdapter.applyGraphEffect(effect);
  const closure = { type: "COMPLETED" as const, recordId: "completion-lagged-read", outcomeSummary: "自然记录" };
  const resultCore = { ...core, lifecycle: "COMPLETED" as const, engagement: null, closure };
  const close = { type: "CHANGE_CLOSURE_FIELDS", commitId: "commit-lagged-read", effectId: "effect-lagged-read", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, focusUuid: core.focusUuid, expectedSourceMarker: "DONE", resultingSourceMarker: "DONE", expectedProjection: effect.projection, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, closure, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(resultCore) } satisfies GraphEffect;
  let staleStateContent: string | null = null; let staleTreeReads = 0;
  const laggedHost: LogseqGraphHost = {
    insertBlock: host.insertBlock.bind(host), removeBlock: host.removeBlock.bind(host),
    updateBlock: async (uuid, content) => { if (uuid === core.stateUuid) { staleStateContent = host.nodes.get(uuid)!.content; staleTreeReads = 2; } return host.updateBlock(uuid, content); },
    getBlock: async (uuid, options) => {
      const value = await host.getBlock(uuid, options);
      if (uuid !== "source-01" || !options?.includeChildren || !staleStateContent || staleTreeReads <= 0) return value;
      staleTreeReads -= 1;
      const replace = (candidate: unknown): unknown => {
        if (!candidate || typeof candidate !== "object") return candidate;
        const record = candidate as Record<string, unknown>;
        return { ...record, ...(record.uuid === core.stateUuid ? { content: staleStateContent } : {}), ...(Array.isArray(record.children) ? { children: record.children.map(replace) } : {}) };
      };
      return replace(value);
    },
  };
  const result = await new LogseqGraphAdapter(laggedHost, "graph-01").applyGraphEffect(close);
  assert.equal(result.projectionHash, close.resultingProjectionHash);
  assert.equal(staleTreeReads, 0);
});

test("Closure effect detects a managed edit triggered between marker and state writes", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "TODO 自然记录\nid:: source-property"; const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const record = { id: "completion-mid-race", workObjectId: "work-01", completedAt: "2026-08-13T10:00:00.000Z", outcomeSummary: "完成", evidenceIds: [], createdBy: { type: "USER" as const, id: "local-user" } }; const closure = { type: "COMPLETED" as const, recordId: record.id, outcomeSummary: "完成" }; const resultCore = { ...core, lifecycle: "COMPLETED" as const, engagement: null, closure };
  const close = { type: "CHANGE_CLOSURE_FIELDS", commitId: "commit-mid-race", effectId: "effect-mid-race", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, focusUuid: core.focusUuid, expectedSourceMarker: "TODO", resultingSourceMarker: "DONE", expectedProjection: effect.projection, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, closure, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(resultCore) } satisfies GraphEffect;
  host.mutateStateAfterSourceUpdate = () => { host.nodes.get(core.stateUuid)!.content += "\n用户并发备注：保留"; };
  await assert.rejects(adapter.applyGraphEffect(close), /GRAPH_CLOSURE_PRECONDITION_FAILED/u);
  assert.match(host.nodes.get(core.stateUuid)!.content, /用户并发备注：保留/u);
  assert.match(host.nodes.get("source-01")!.content, /^DONE 自然记录\nid:: source-property$/u);
});

test("Closure effect preserves a marker edit made immediately before its marker write", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "TODO 自然记录"; const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  const closure = { type: "COMPLETED" as const, recordId: "completion-marker-race", outcomeSummary: "完成" }; const resultCore = { ...core, lifecycle: "COMPLETED" as const, engagement: null, closure };
  const close = { type: "CHANGE_CLOSURE_FIELDS", commitId: "commit-marker-race", effectId: "effect-marker-race", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, focusUuid: core.focusUuid, expectedSourceMarker: "TODO", resultingSourceMarker: "DONE", expectedProjection: effect.projection, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, closure, expectedProjectionHash: effect.projection.projectionHash, resultingProjectionHash: stableHash(resultCore) } satisfies GraphEffect;
  host.mutateSourceBeforeShallowRead = () => { host.nodes.get("source-01")!.content = "DOING 用户切换为处理中"; };
  await assert.rejects(adapter.applyGraphEffect(close), /GRAPH_CLOSURE_PRECONDITION_FAILED/u);
  assert.equal(host.nodes.get("source-01")!.content, "DOING 用户切换为处理中");
  assert.match(host.nodes.get(core.stateUuid)!.content, /^状态：OPEN · ACTIONABLE(?:\n|$)/u);
});

test("Closure effect preserves a focus edit made immediately before focus removal", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "TODO 自然记录"; const focusCore = { ...core, currentFocus: "原推进" }; const setup = { ...effect, projection: { ...focusCore, projectionHash: stableHash(focusCore) } } satisfies GraphEffect; const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(setup);
  const closure = { type: "COMPLETED" as const, recordId: "completion-focus-race", outcomeSummary: "完成" }; const resultCore = { ...focusCore, lifecycle: "COMPLETED" as const, engagement: null, currentFocus: null, closure };
  const close = { type: "CHANGE_CLOSURE_FIELDS", commitId: "commit-focus-race", effectId: "effect-focus-race", graphId: "graph-01", sourceBlockUuid: "source-01", containerUuid: core.containerUuid, stateUuid: core.stateUuid, focusUuid: core.focusUuid, expectedSourceMarker: "TODO", resultingSourceMarker: "DONE", expectedProjection: setup.projection, lifecycle: "COMPLETED", engagement: null, waitingCondition: null, currentFocus: null, closure, expectedProjectionHash: setup.projection.projectionHash, resultingProjectionHash: stableHash(resultCore) } satisfies GraphEffect;
  host.mutateFocusBeforeShallowRead = () => { host.nodes.get(core.focusUuid)!.content = "当前推进：用户刚改的推进"; };
  await assert.rejects(adapter.applyGraphEffect(close), /GRAPH_CLOSURE_PRECONDITION_FAILED/u);
  assert.equal(host.nodes.get(core.focusUuid)!.content, "当前推进：用户刚改的推进");
});

test("Closure projection reads its metadata when Logseq omits property lines from content", async () => {
  const host = new Host(); host.nodes.get("source-01")!.content = "TODO 自然记录";
  const setupAdapter = new LogseqGraphAdapter(host, "graph-01"); await setupAdapter.applyGraphEffect(effect);
  const record = { id: "completion-properties", workObjectId: "work-01", completedAt: "2026-08-13T10:00:00.000Z", outcomeSummary: "完成验收", evidenceIds: [], createdBy: { type: "USER" as const, id: "local-user" } };
  const closure = { type: "COMPLETED" as const, recordId: record.id, outcomeSummary: "完成验收" };
  const closedCore = { ...core, lifecycle: "COMPLETED" as const, engagement: null, closure };
  host.nodes.get("source-01")!.content = "DONE 自然记录";
  host.nodes.get(core.stateUuid)!.content = "状态：COMPLETED · null\n完成：完成验收";
  const adapter = new LogseqGraphAdapter({
    insertBlock: host.insertBlock.bind(host), updateBlock: host.updateBlock.bind(host), removeBlock: host.removeBlock.bind(host),
    getBlock: async (uuid, options) => {
      const enrich = (value: unknown): unknown => {
        if (!value || typeof value !== "object") return value;
        const recordValue = value as Record<string, unknown>;
        const enriched: Record<string, unknown> = recordValue.uuid === core.stateUuid ? { ...recordValue, properties: { "task-copilot-closure": JSON.stringify(closure) } } : { ...recordValue };
        if (Array.isArray(recordValue.children)) enriched.children = recordValue.children.map(enrich);
        return enriched;
      };
      return enrich(await host.getBlock(uuid, options));
    },
  }, "graph-01");
  const snapshot = await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" });
  assert.deepEqual(snapshot.projection?.closure, closure);
  assert.equal(snapshot.projection?.projectionHash, stableHash(closedCore));
});
