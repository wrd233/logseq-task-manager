import assert from "node:assert/strict";
import test from "node:test";

import { creationSessionMiniTreeHash } from "@task-copilot/application";
import type { ServiceCreationSessionMiniGraphPlan, ServiceCreationSessionMiniTreeNode } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { commitCreationSessionMini, undoCreationSessionMini, type CreationSessionMiniGraphHost } from "../src/creation-session-mini-commit.ts";

interface Block { uuid: string; content: string; parent?: string; children: string[] }

class FakeMiniHost implements CreationSessionMiniGraphHost {
  blocks = new Map<string, Block>();
  roots: string[] = [];
  private staging = 0;

  tree(uuid: string): unknown {
    const block = this.blocks.get(uuid)!;
    return { uuid: block.uuid, content: block.content, children: block.children.map((child) => this.tree(child)) };
  }
  async getBlock(uuid: string): Promise<unknown> { return this.blocks.has(uuid) ? this.tree(uuid) : null; }
  async appendBlockInPage(_pageIdentity: string, content: string): Promise<unknown> {
    const uuid = `staging-${++this.staging}`;
    this.blocks.set(uuid, { uuid, content, children: [] });
    this.roots.push(uuid);
    return { uuid };
  }
  async insertBlock(targetUuid: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown> {
    const target = this.blocks.get(targetUuid);
    if (!target) throw new Error("target missing");
    const block: Block = { uuid: options.customUUID, content, children: [] };
    this.blocks.set(block.uuid, block);
    if (options.sibling) {
      const siblings = target.parent ? this.blocks.get(target.parent)!.children : this.roots;
      const index = siblings.indexOf(target.uuid);
      siblings.splice(options.before ? index : index + 1, 0, block.uuid);
      if (target.parent) block.parent = target.parent;
    } else {
      target.children.splice(options.before ? 0 : target.children.length, 0, block.uuid);
      block.parent = target.uuid;
    }
    return { uuid: block.uuid };
  }
  async updateBlock(uuid: string, content: string): Promise<void> { this.blocks.get(uuid)!.content = content; }
  async moveBlock(sourceUuid: string, targetUuid: string, options?: { children: boolean }): Promise<void> {
    const source = this.blocks.get(sourceUuid)!;
    const old = source.parent ? this.blocks.get(source.parent)!.children : this.roots;
    old.splice(old.indexOf(sourceUuid), 1);
    const target = this.blocks.get(targetUuid)!;
    if (options?.children) {
      target.children.unshift(sourceUuid);
      source.parent = targetUuid;
    } else {
      const siblings = target.parent ? this.blocks.get(target.parent)!.children : this.roots;
      siblings.splice(siblings.indexOf(targetUuid) + 1, 0, sourceUuid);
      if (target.parent) source.parent = target.parent;
      else delete source.parent;
    }
  }
  async removeBlock(uuid: string): Promise<void> {
    const block = this.blocks.get(uuid);
    if (!block) return;
    const siblings = block.parent ? this.blocks.get(block.parent)!.children : this.roots;
    siblings.splice(siblings.indexOf(uuid), 1);
    const remove = (id: string): void => { const current = this.blocks.get(id); current?.children.forEach(remove); this.blocks.delete(id); };
    remove(uuid);
  }
}

function node(blockUuid: string, text: string, order: number, parentBlockUuid?: string, operation: ServiceCreationSessionMiniTreeNode["operation"] = "CREATE"): ServiceCreationSessionMiniTreeNode {
  return { blockUuid, text, ...(parentBlockUuid ? { parentBlockUuid } : {}), order, contentHash: checksum(text), operation };
}

const rootUuid = "11111111-1111-4111-8111-111111111111";
const firstUuid = "22222222-2222-4222-8222-222222222222";
const secondUuid = "33333333-3333-4333-8333-333333333333";
const createdUuid = "44444444-4444-4444-8444-444444444444";

function graphPlan(mode: "IN_PLACE" | "NEW_TREE"): ServiceCreationSessionMiniGraphPlan {
  const beforeNodes = mode === "IN_PLACE" ? [node(rootUuid, "普通来源", 0, undefined, "KEEP"), node(firstUuid, "材料 A", 0, rootUuid, "KEEP"), node(secondUuid, "材料 B", 1, rootUuid, "KEEP")] : [];
  const afterNodes = mode === "IN_PLACE"
    ? [node(rootUuid, "**[MiniProject]** 告警验证 #MiniProject", 0, undefined, "REWRITE"), node(secondUuid, "材料 B", 0, rootUuid, "MOVE"), node(createdUuid, "**[目标]** 告警可追踪", 1, rootUuid), node(firstUuid, "材料 A", 2, rootUuid, "MOVE")]
    : [node(rootUuid, "**[MiniProject]** 告警验证 #MiniProject", 0), node(createdUuid, "**[目标]** 告警可追踪", 0, rootUuid)];
  return {
    mode,
    placement: mode === "IN_PLACE" ? { kind: "SOURCE_BLOCK_IN_PLACE", sourceBlockUuid: rootUuid } : { kind: "PAGE_END", pageId: "page-target", pageName: "目标页", pageHash: "deadbeef" },
    rootBlockUuid: rootUuid,
    beforeNodes,
    afterNodes,
    beforeHash: mode === "IN_PLACE" ? creationSessionMiniTreeHash(rootUuid, beforeNodes) : checksum({ rootBlockUuid: rootUuid, exists: false }),
    afterHash: creationSessionMiniTreeHash(rootUuid, afterNodes),
  };
}

function seedInPlace(host: FakeMiniHost): void {
  host.blocks.set(rootUuid, { uuid: rootUuid, content: "普通来源", children: [firstUuid, secondUuid] });
  host.blocks.set(firstUuid, { uuid: firstUuid, content: "材料 A", parent: rootUuid, children: [] });
  host.blocks.set(secondUuid, { uuid: secondUuid, content: "材料 B", parent: rootUuid, children: [] });
  host.roots = [rootUuid];
}

test("MiniProject Creation Session creates a new deterministic tree and exact Undo removes it", async () => {
  const host = new FakeMiniHost();
  const placement = { uuid: "page-block", content: "已有内容", children: [] as string[] };
  host.blocks.set(placement.uuid, placement);
  host.roots = [placement.uuid];
  const plan = graphPlan("NEW_TREE");
  const committed = await commitCreationSessionMini({
    async prepareCreationSessionMiniCommit() { return { status: "PREPARED", semanticCommitId: "proposal-commit:mini", proposalId: "proposal-mini", expectedUpdatedAt: "2026-08-02T12:00:00.000Z", objectId: "mini-object", graphPlan: plan, replayed: false }; },
    async finalizeCreationSessionMiniCommit() { return { status: "COMPLETED", semanticCommitId: "proposal-commit:mini", session: { sessionId: "session" }, object: { objectId: "mini-object" }, anchor: { externalId: rootUuid }, record: {}, replayed: false } as never; },
    async compensateCreationSessionMiniCommit() { throw new Error("unused"); },
  }, host, "proposal-mini", "2026-08-02T12:00:00.000Z", "trace-mini");
  assert.equal(committed.status, "COMPLETED");
  assert.deepEqual(host.roots, [placement.uuid, rootUuid]);
  assert.deepEqual(host.blocks.get(rootUuid)?.children, [createdUuid]);
  let prepareCalls = 0;
  const undone = await undoCreationSessionMini({
    async prepareCreationSessionMiniUndo(_id, input) {
      prepareCalls += 1;
      const common = { originalSemanticCommitId: "proposal-commit:mini", undoSemanticCommitId: "creation-session-undo:proposal-commit:mini", proposalId: "proposal-mini", objectId: "mini-object", graphPlan: plan, replayed: false };
      return input.confirmedGraphHash ? { status: "GRAPH_RESTORE_REQUIRED", ...common, session: { sessionId: "session" } } as never : { status: "GRAPH_PREFLIGHT_REQUIRED", ...common } as never;
    },
    async finalizeCreationSessionMiniUndo() { return { status: "COMPLETED", originalSemanticCommitId: "proposal-commit:mini", undoSemanticCommitId: "creation-session-undo:proposal-commit:mini", session: { sessionId: "session" }, replayed: false } as never; },
  }, host, "proposal-commit:mini", "trace-mini-undo");
  assert.equal(undone.status, "COMPLETED");
  assert.equal(prepareCalls, 2);
  assert.equal(host.blocks.has(rootUuid), false);
});

test("Page-end MiniProject creation removes its exact staging block when root insertion fails", async () => {
  const host = new FakeMiniHost();
  const placement = { uuid: "page-block", content: "已有内容", children: [] as string[] };
  host.blocks.set(placement.uuid, placement);
  host.roots = [placement.uuid];
  const originalInsert = host.insertBlock.bind(host);
  host.insertBlock = async (targetUuid, content, options) => {
    if (targetUuid.startsWith("staging-")) throw new Error("injected root insertion failure");
    return originalInsert(targetUuid, content, options);
  };
  await assert.rejects(() => commitCreationSessionMini({
    async prepareCreationSessionMiniCommit() { return { status: "PREPARED", semanticCommitId: "proposal-commit:mini-staging", proposalId: "proposal-mini-staging", expectedUpdatedAt: "2026-08-02T12:00:00.000Z", objectId: "mini-object", graphPlan: graphPlan("NEW_TREE"), replayed: false }; },
    async finalizeCreationSessionMiniCommit() { throw new Error("unused"); },
    async compensateCreationSessionMiniCommit() { throw new Error("unused"); },
  }, host, "proposal-mini-staging", "2026-08-02T12:00:00.000Z", "trace-staging"), /injected root insertion failure/);
  assert.deepEqual(host.roots, [placement.uuid]);
  assert.equal([...host.blocks.keys()].some((uuid) => uuid.startsWith("staging-")), false);
  assert.equal(host.blocks.has(rootUuid), false);
});

test("in-place MiniProject Creation Session rewrites and reorders the exact source tree then restores it", async () => {
  const host = new FakeMiniHost();
  seedInPlace(host);
  const plan = graphPlan("IN_PLACE");
  await commitCreationSessionMini({
    async prepareCreationSessionMiniCommit() { return { status: "PREPARED", semanticCommitId: "proposal-commit:mini-in-place", proposalId: "proposal-mini-in-place", expectedUpdatedAt: "2026-08-02T12:00:00.000Z", objectId: "mini-object", graphPlan: plan, replayed: false }; },
    async finalizeCreationSessionMiniCommit() { return { status: "COMPLETED", semanticCommitId: "proposal-commit:mini-in-place", session: {}, object: {}, anchor: {}, record: {}, replayed: false } as never; },
    async compensateCreationSessionMiniCommit() { throw new Error("unused"); },
  }, host, "proposal-mini-in-place", "2026-08-02T12:00:00.000Z", "trace-in-place");
  assert.equal(host.blocks.get(rootUuid)?.content, "**[MiniProject]** 告警验证 #MiniProject");
  assert.deepEqual(host.blocks.get(rootUuid)?.children, [secondUuid, createdUuid, firstUuid]);
  await undoCreationSessionMini({
    async prepareCreationSessionMiniUndo(_id, input) {
      const common = { originalSemanticCommitId: "proposal-commit:mini-in-place", undoSemanticCommitId: "creation-session-undo:proposal-commit:mini-in-place", proposalId: "proposal-mini-in-place", objectId: "mini-object", graphPlan: plan, replayed: false };
      return input.confirmedGraphHash ? { status: "GRAPH_RESTORE_REQUIRED", ...common, session: {} } as never : { status: "GRAPH_PREFLIGHT_REQUIRED", ...common } as never;
    },
    async finalizeCreationSessionMiniUndo() { return { status: "COMPLETED", originalSemanticCommitId: "proposal-commit:mini-in-place", undoSemanticCommitId: "creation-session-undo:proposal-commit:mini-in-place", session: {}, replayed: false } as never; },
  }, host, "proposal-commit:mini-in-place", "trace-in-place-undo");
  assert.equal(host.blocks.get(rootUuid)?.content, "普通来源");
  assert.deepEqual(host.blocks.get(rootUuid)?.children, [firstUuid, secondUuid]);
  assert.equal(host.blocks.has(createdUuid), false);
});

test("MiniProject Creation Session compensates the exact in-place tree when Domain creation conflicts", async () => {
  const host = new FakeMiniHost();
  seedInPlace(host);
  const plan = graphPlan("IN_PLACE");
  let compensated = false;
  await assert.rejects(() => commitCreationSessionMini({
    async prepareCreationSessionMiniCommit() { return { status: "PREPARED", semanticCommitId: "proposal-commit:mini-conflict", proposalId: "proposal-mini-conflict", expectedUpdatedAt: "2026-08-02T12:00:00.000Z", objectId: "mini-object", graphPlan: plan, replayed: false }; },
    async finalizeCreationSessionMiniCommit() { return { status: "COMPENSATION_REQUIRED", semanticCommitId: "proposal-commit:mini-conflict", proposalId: "proposal-mini-conflict", expectedUpdatedAt: "2026-08-02T12:00:00.000Z", objectId: "mini-object", graphPlan: plan }; },
    async compensateCreationSessionMiniCommit(_proposalId, input) { compensated = input.graphContentHash === plan.beforeHash; return { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId: "proposal-mini-conflict", record: {}, replayed: false } as never; },
  }, host, "proposal-mini-conflict", "2026-08-02T12:00:00.000Z", "trace-conflict"), /安全收口/);
  assert.equal(compensated, true);
  assert.equal(host.blocks.get(rootUuid)?.content, "普通来源");
  assert.deepEqual(host.blocks.get(rootUuid)?.children, [firstUuid, secondUuid]);
  assert.equal(host.blocks.has(createdUuid), false);
});

test("MiniProject Creation Session Undo preserves a tree with later user content", async () => {
  const host = new FakeMiniHost();
  seedInPlace(host);
  const plan = graphPlan("IN_PLACE");
  host.blocks.get(rootUuid)!.content = plan.afterNodes[0]!.text;
  host.blocks.get(rootUuid)!.children = [secondUuid, createdUuid, firstUuid];
  host.blocks.get(secondUuid)!.parent = rootUuid;
  host.blocks.set(createdUuid, { uuid: createdUuid, content: plan.afterNodes.find(({ blockUuid }) => blockUuid === createdUuid)!.text, parent: rootUuid, children: [] });
  host.blocks.get(firstUuid)!.parent = rootUuid;
  host.blocks.get(firstUuid)!.content = "用户后续补充";
  let domainPrepared = false;
  await assert.rejects(() => undoCreationSessionMini({
    async prepareCreationSessionMiniUndo(_id, input) {
      if (input.confirmedGraphHash) domainPrepared = true;
      return { status: "GRAPH_PREFLIGHT_REQUIRED", originalSemanticCommitId: "proposal-commit:mini", undoSemanticCommitId: "creation-session-undo:proposal-commit:mini", proposalId: "proposal-mini", objectId: "mini-object", graphPlan: plan, replayed: false };
    },
    async finalizeCreationSessionMiniUndo() { throw new Error("unused"); },
  }, host, "proposal-commit:mini", "trace-changed"), /后续变化/);
  assert.equal(domainPrepared, false);
  assert.equal(host.blocks.get(firstUuid)?.content, "用户后续补充");
});
