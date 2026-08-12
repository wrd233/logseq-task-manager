import assert from "node:assert/strict";
import test from "node:test";

import { stableHash, type GraphEffect } from "@task-copilot/contracts";
import { LogseqGraphAdapter, type LogseqGraphHost } from "../src/graph-adapter.ts";

interface Node { uuid: string; content: string; parent: string | null; children: string[] }
class Host implements LogseqGraphHost {
  nodes = new Map<string, Node>();
  constructor() { this.nodes.set("source-01", { uuid: "source-01", content: "自然记录", parent: null, children: [] }); }
  tree(uuid: string): unknown { const value = this.nodes.get(uuid); return value ? { uuid: value.uuid, content: value.content, children: value.children.map((child) => this.tree(child)) } : null; }
  async getBlock(uuid: string, options?: { includeChildren: boolean }): Promise<unknown> { const value = this.nodes.get(uuid); return !value ? null : options?.includeChildren ? this.tree(uuid) : { uuid: value.uuid, content: value.content }; }
  async insertBlock(target: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown> {
    const targetNode = this.nodes.get(target)!; const parent = options.sibling ? targetNode.parent : target;
    const node = { uuid: options.customUUID, content: `${content}\nid:: ${options.customUUID}`, parent, children: [] }; this.nodes.set(node.uuid, node);
    const siblings = parent ? this.nodes.get(parent)!.children : [];
    if (options.sibling) siblings.splice(siblings.indexOf(target) + (options.before ? 0 : 1), 0, node.uuid); else siblings.splice(options.before ? 0 : siblings.length, 0, node.uuid);
    return { uuid: node.uuid, content: node.content };
  }
  async updateBlock(uuid: string, content: string): Promise<unknown> { this.nodes.get(uuid)!.content = content; return this.getBlock(uuid); }
  async removeBlock(uuid: string): Promise<unknown> { const value = this.nodes.get(uuid)!; if (value.parent) this.nodes.get(value.parent)!.children = this.nodes.get(value.parent)!.children.filter((child) => child !== uuid); this.nodes.delete(uuid); return null; }
}

const core = { containerUuid: "11111111-1111-4111-8111-111111111111", titleUuid: "22222222-2222-4222-8222-222222222222", stateUuid: "33333333-3333-4333-8333-333333333333", title: "自然记录", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const };
const effect: GraphEffect = {
  type: "UPSERT_MANAGED_PROJECTION", commitId: "commit-01", effectId: "effect-01",
  graphId: "graph-01", sourceBlockUuid: "source-01", projection: { ...core, projectionHash: stableHash(core) },
};

test("real adapter contract writes a deterministic child projection and leaves natural text intact", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01", () => "2026-08-12T00:00:00.000Z");
  assert.equal((await adapter.readGraphSnapshot({ graphId: "graph-01", sourceBlockUuid: "source-01" })).projection, null);
  const result = await adapter.applyGraphEffect(effect);
  assert.equal(result.projectionHash, effect.projection.projectionHash);
  assert.equal(host.nodes.get("source-01")?.content, "自然记录");
  assert.deepEqual(host.nodes.get(core.containerUuid)?.children, [core.titleUuid, core.stateUuid]);
});

test("remove refuses an edited or expanded managed container", async () => {
  const host = new Host(); const adapter = new LogseqGraphAdapter(host, "graph-01"); await adapter.applyGraphEffect(effect);
  await host.insertBlock(core.containerUuid, "用户后续内容", { sibling: false, customUUID: "44444444-4444-4444-8444-444444444444" });
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
  }), /GRAPH_UPDATE_PRECONDITION_FAILED/u);
  assert.equal(host.nodes.get(core.titleUuid)?.content.includes("自然记录"), true);
});
