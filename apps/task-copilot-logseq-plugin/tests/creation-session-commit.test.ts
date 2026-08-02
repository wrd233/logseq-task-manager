import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceCreationSessionCommitNode } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import { commitCreationSessionProject, undoCreationSessionProject, type CreationSessionProjectHost, type CreationSessionProjectPage } from "../src/creation-session-commit.ts";

interface Block { uuid: string; content: string; parent?: string; children: string[] }

class FakeProjectHost implements CreationSessionProjectHost {
  page?: CreationSessionProjectPage;
  roots: string[] = [];
  blocks = new Map<string, Block>();
  deleted = false;
  failOnInsertUuid?: string;
  private appended = 0;

  async getPage(identity: string): Promise<CreationSessionProjectPage | null> {
    if (this.deleted || !this.page) return null;
    return [this.page.uuid, this.page.name, this.page.originalName].includes(identity) ? this.page : null;
  }
  async createPage(pageName: string, properties: Record<string, string>): Promise<CreationSessionProjectPage> {
    this.page = { uuid: "page-created", name: pageName, originalName: pageName, properties };
    return this.page;
  }
  async getPageBlocksTree(): Promise<unknown[]> {
    const project = (uuid: string): unknown => {
      const block = this.blocks.get(uuid)!;
      return { uuid: block.uuid, content: block.content, children: block.children.map(project) };
    };
    return this.roots.map(project);
  }
  async appendBlockInPage(_pageIdentity: string, content: string): Promise<unknown> {
    const uuid = `staging-${++this.appended}`;
    this.blocks.set(uuid, { uuid, content, children: [] });
    this.roots.push(uuid);
    return { uuid };
  }
  async insertBlock(targetBlockUuid: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown> {
    if (options.customUUID === this.failOnInsertUuid) throw new Error("simulated insert failure");
    const target = this.blocks.get(targetBlockUuid);
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
  async removeBlock(blockUuid: string): Promise<void> {
    const block = this.blocks.get(blockUuid);
    if (!block) return;
    const siblings = block.parent ? this.blocks.get(block.parent)!.children : this.roots;
    siblings.splice(siblings.indexOf(blockUuid), 1);
    this.blocks.delete(blockUuid);
  }
  async deletePage(): Promise<void> {
    this.deleted = true;
    this.roots = [];
    this.blocks.clear();
  }
}

const nodes: ServiceCreationSessionCommitNode[] = [
  { nodeId: "root", semanticKey: "project-root", text: "统一硬件告警治理", order: 0, nodeType: "PAGE_SECTION", operation: "CREATE", blockUuid: "11111111-1111-4111-8111-111111111111", contentHash: checksum("统一硬件告警治理") },
  { nodeId: "goal", semanticKey: "goal", text: "**[项目目标]** 建立持续治理工作面", parentNodeId: "root", order: 0, nodeType: "BLOCK", operation: "CREATE", blockUuid: "22222222-2222-4222-8222-222222222222", contentHash: checksum("**[项目目标]** 建立持续治理工作面") },
  { nodeId: "evidence", semanticKey: "evidence", text: "**[完成证据]** 告警可追踪", parentNodeId: "root", order: 1, nodeType: "BLOCK", operation: "CREATE", blockUuid: "33333333-3333-4333-8333-333333333333", contentHash: checksum("**[完成证据]** 告警可追踪") },
];

test("Creation Session Project executor writes one deterministic tree then finalizes the existing SemanticCommit", async () => {
  const host = new FakeProjectHost();
  let finalizedHash: string | undefined;
  const result = await commitCreationSessionProject({
    async prepareCreationSessionCommit() {
      return { status: "PREPARED", semanticCommitId: "proposal-commit:creation", proposalId: "proposal-creation", expectedUpdatedAt: "2026-08-02T10:00:00.000Z", pageName: "Project/统一硬件告警治理", objectId: "creation-object", nodes, replayed: false };
    },
    async finalizeCreationSessionCommit(_proposalId, input) {
      finalizedHash = input.pageContentHash;
      return { status: "COMPLETED", semanticCommitId: input.semanticCommitId, session: { sessionId: "session" }, object: { objectId: "creation-object", text: "统一硬件告警治理" }, anchor: { externalId: input.pageExternalId }, record: { proposal: { status: "APPLIED" } }, replayed: false } as never;
    },
    async compensateCreationSessionCommit() { throw new Error("unused"); },
  }, host, "proposal-creation", "2026-08-02T10:00:00.000Z", "trace-create");
  assert.equal(result.status, "COMPLETED");
  assert.equal(host.roots.length, 1);
  assert.equal(host.roots[0], nodes[0]!.blockUuid);
  assert.deepEqual(host.blocks.get(nodes[0]!.blockUuid)?.children, [nodes[1]!.blockUuid, nodes[2]!.blockUuid]);
  assert.ok(finalizedHash && /^[0-9a-f]{8}$/.test(finalizedHash));
  assert.equal([...host.blocks.values()].some(({ content }) => content.includes("creation-session-staging")), false);
});

test("Creation Session Project executor removes its controlled partial Page after an interrupted tree write", async () => {
  const host = new FakeProjectHost();
  host.failOnInsertUuid = nodes[2]!.blockUuid;
  let finalized = false;
  await assert.rejects(() => commitCreationSessionProject({
    async prepareCreationSessionCommit() {
      return { status: "PREPARED", semanticCommitId: "proposal-commit:creation", proposalId: "proposal-creation", expectedUpdatedAt: "2026-08-02T10:00:00.000Z", pageName: "Project/统一硬件告警治理", objectId: "creation-object", nodes, replayed: false };
    },
    async finalizeCreationSessionCommit() { finalized = true; throw new Error("unused"); },
    async compensateCreationSessionCommit() { throw new Error("unused"); },
  }, host, "proposal-creation", "2026-08-02T10:00:00.000Z", "trace-partial"), /simulated insert failure/);
  assert.equal(finalized, false);
  assert.equal(host.deleted, true);
  assert.deepEqual(host.roots, []);
});

test("Creation Session Project Undo checks the exact owned tree before removing Domain and Page", async () => {
  const host = new FakeProjectHost();
  const properties = {
    "task-copilot-owner": "task-copilot-personal-mvp",
    "task-copilot-object-id": "creation-object",
    "task-copilot-semantic-commit-id": "proposal-commit:creation",
  };
  host.page = { uuid: "page-created", name: "Project/统一硬件告警治理", originalName: "Project/统一硬件告警治理", properties };
  host.blocks.set(nodes[0]!.blockUuid, { uuid: nodes[0]!.blockUuid, content: nodes[0]!.text, children: [nodes[1]!.blockUuid, nodes[2]!.blockUuid] });
  host.blocks.set(nodes[1]!.blockUuid, { uuid: nodes[1]!.blockUuid, content: nodes[1]!.text, parent: nodes[0]!.blockUuid, children: [] });
  host.blocks.set(nodes[2]!.blockUuid, { uuid: nodes[2]!.blockUuid, content: nodes[2]!.text, parent: nodes[0]!.blockUuid, children: [] });
  host.roots = [nodes[0]!.blockUuid];
  let prepares = 0;
  const result = await undoCreationSessionProject({
    async prepareCreationSessionUndo(_commitId, input) {
      prepares += 1;
      const common = { originalSemanticCommitId: "proposal-commit:creation", undoSemanticCommitId: "creation-session-undo:proposal-commit:creation", proposalId: "proposal-creation", pageName: host.page!.name, pageExternalId: host.page!.uuid, pageContentHash: "deadbeef", objectId: "creation-object", nodes, replayed: false };
      return input.confirmedOwnedTree ? { status: "PAGE_DELETION_REQUIRED", ...common, session: { sessionId: "session" } } as never : { status: "PAGE_PREFLIGHT_REQUIRED", ...common } as never;
    },
    async finalizeCreationSessionUndo(_commitId, input) {
      assert.equal(input.pageExists, false);
      return { status: "COMPLETED", originalSemanticCommitId: "proposal-commit:creation", undoSemanticCommitId: input.undoSemanticCommitId, session: { sessionId: "session" }, replayed: false } as never;
    },
  }, host, "proposal-commit:creation", "trace-undo");
  assert.equal(prepares, 2);
  assert.equal(host.deleted, true);
  assert.equal(result.status, "COMPLETED");
});

test("Creation Session Project Undo preserves a Page whose Draft Tree changed", async () => {
  const host = new FakeProjectHost();
  host.page = { uuid: "page-created", name: "Project/统一硬件告警治理", properties: { "task-copilot-owner": "task-copilot-personal-mvp", "task-copilot-object-id": "creation-object", "task-copilot-semantic-commit-id": "proposal-commit:creation" } };
  host.blocks.set(nodes[0]!.blockUuid, { uuid: nodes[0]!.blockUuid, content: "用户后续修改", children: [] });
  host.roots = [nodes[0]!.blockUuid];
  let domainPrepared = false;
  await assert.rejects(() => undoCreationSessionProject({
    async prepareCreationSessionUndo(_commitId, input) {
      if (input.confirmedOwnedTree) domainPrepared = true;
      return { status: "PAGE_PREFLIGHT_REQUIRED", originalSemanticCommitId: "proposal-commit:creation", undoSemanticCommitId: "creation-session-undo:proposal-commit:creation", proposalId: "proposal-creation", pageName: host.page!.name, pageExternalId: host.page!.uuid, pageContentHash: "deadbeef", objectId: "creation-object", nodes, replayed: false };
    },
    async finalizeCreationSessionUndo() { throw new Error("unused"); },
  }, host, "proposal-commit:creation", "trace-changed"), /后续变化/);
  assert.equal(domainPrepared, false);
  assert.equal(host.deleted, false);
});
