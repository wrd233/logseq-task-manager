import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceProjectIntent } from "@task-copilot/service-client";

import {
  createProjectWithControlledPage,
  type ProjectCreationService,
  type ProjectPageEntity,
  type ProjectPageHost,
} from "../src/v2-project-creation.ts";

function intent(): ServiceProjectIntent {
  return {
    semanticCommitId: `project-create:${"a".repeat(64)}`,
    objectId: `obj_20260720120000000_${"b".repeat(32)}`,
    pageName: "Project/告警推送治理",
    status: "PENDING",
    replayed: false,
  };
}

function fixture(existing?: ProjectPageEntity) {
  const prepared = intent();
  let page = existing;
  let createCalls = 0;
  let finalizeCalls = 0;
  const service: ProjectCreationService = {
    async prepareProject() { return prepared; },
    async finalizeProject(input) {
      finalizeCalls += 1;
      return {
        semanticCommitId: input.semanticCommitId,
        status: "COMPLETED",
        replayed: false,
        object: { objectId: input.objectId, objectType: "PROJECT", version: 2, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: input.name, createdAt: "2026-07-20T12:00:00.000Z", updatedAt: "2026-07-20T12:00:00.000Z", sourceOrCreationEvent: `project_page:graph:${input.pageExternalId}` },
        anchor: { anchorId: `anc_20260720120000000_${"c".repeat(32)}`, objectId: input.objectId, role: "primary_text", graphId: "graph", externalId: input.pageExternalId, status: "active", contentHash: input.pageContentHash, lastSeenAt: "2026-07-20T12:00:00.000Z" },
      };
    },
  };
  const host: ProjectPageHost = {
    async getPage() { return page ?? null; },
    async createPage(pageName, properties) {
      createCalls += 1;
      page = { uuid: "project-page-uuid", name: pageName.toLowerCase(), originalName: pageName, properties };
      return page;
    },
    async getPageBlocksTree() { return []; },
  };
  return { prepared, service, host, createCalls: () => createCalls, finalizeCalls: () => finalizeCalls };
}

test("Project controller creates an owned empty page before finalizing the same service intent", async () => {
  const value = fixture();
  const result = await createProjectWithControlledPage(value.service, value.host, "告警推送治理", "trace-project");
  assert.equal(result.pageName, "Project/告警推送治理");
  assert.equal(result.pageCreated, true);
  assert.equal(result.object.objectId, value.prepared.objectId);
  assert.equal(value.createCalls(), 1);
  assert.equal(value.finalizeCalls(), 1);
});

test("Project controller resumes its exact owned page and refuses an unknown existing page", async () => {
  const prepared = intent();
  const owned = fixture({
    uuid: "owned-page",
    name: prepared.pageName.toLowerCase(),
    originalName: prepared.pageName,
    properties: {
      taskCopilotOwner: "task-copilot-personal-mvp",
      taskCopilotObjectId: prepared.objectId,
      taskCopilotSemanticCommitId: prepared.semanticCommitId,
    },
  });
  assert.equal((await createProjectWithControlledPage(owned.service, owned.host, "告警推送治理", "trace-resume")).pageCreated, false);
  assert.equal(owned.createCalls(), 0);

  const unknown = fixture({ uuid: "unknown-page", name: prepared.pageName.toLowerCase(), originalName: prepared.pageName, properties: {} });
  await assert.rejects(() => createProjectWithControlledPage(unknown.service, unknown.host, "告警推送治理", "trace-conflict"), /不是本次受控创建事务/);
  assert.equal(unknown.finalizeCalls(), 0);
});

test("ambiguous finalize failure preserves the owned page for a same-intent retry", async () => {
  const value = fixture();
  value.service.finalizeProject = async () => { throw new Error("connection closed after request"); };
  await assert.rejects(() => createProjectWithControlledPage(value.service, value.host, "告警推送治理", "trace-failure"), /保留页面并重试同名创建/);
  assert.equal(value.createCalls(), 1);
  assert.ok(await value.host.getPage(value.prepared.pageName), "an ambiguous response must never delete a possibly committed Project page");
});

test("Project controller refuses a null page tree without finalizing SQLite", async () => {
  const value = fixture();
  value.host.getPageBlocksTree = async () => null;
  await assert.rejects(() => createProjectWithControlledPage(value.service, value.host, "告警推送治理", "trace-null-tree"), /尚未返回可验证的页面 Block 树/);
  assert.equal(value.createCalls(), 1);
  assert.equal(value.finalizeCalls(), 0);
  assert.ok(await value.host.getPage(value.prepared.pageName));
});

test("a completed intent resolves its recorded page UUID after a user rename instead of creating a duplicate", async () => {
  const prepared = { ...intent(), status: "COMPLETED" as const, replayed: true, pageExternalId: "renamed-page-uuid" };
  let requestedIdentity = "";
  let createCalls = 0;
  const page = {
    uuid: "renamed-page-uuid",
    name: "project/告警推送治理-已改名",
    originalName: "Project/告警推送治理-已改名",
    properties: {
      taskCopilotOwner: "task-copilot-personal-mvp",
      taskCopilotObjectId: prepared.objectId,
      taskCopilotSemanticCommitId: prepared.semanticCommitId,
    },
  };
  const base = fixture(page);
  base.service.prepareProject = async () => prepared;
  base.host.getPage = async (identity) => { requestedIdentity = identity; return page; };
  base.host.createPage = async () => { createCalls += 1; return null; };
  const result = await createProjectWithControlledPage(base.service, base.host, "告警推送治理", "trace-renamed");
  assert.equal(requestedIdentity, "renamed-page-uuid");
  assert.equal(createCalls, 0);
  assert.equal(result.pageName, "Project/告警推送治理-已改名");
  assert.equal(result.object.objectId, prepared.objectId);
});
