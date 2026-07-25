import assert from "node:assert/strict";
import test from "node:test";

import type { ServicePreparedProposalProjectCreation, ServiceProjectIntent, ServiceProposalProjectCreationFinalization } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";

import {
  compensateReviewedProjectCreation,
  createReviewedProjectWithPage,
  createProjectWithControlledPage,
  undoReviewedProjectCreation,
  type ProjectCreationService,
  type ProjectPageEntity,
  type ProjectPageHost,
  type ReviewedProjectCreationService,
} from "../src/v2-project-creation.ts";
import { proposalPageEvidenceHash } from "../src/v2-proposal-revalidation.ts";

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

function reviewedIntent(mode: ServicePreparedProposalProjectCreation["relationshipMode"]): ServicePreparedProposalProjectCreation {
  return {
    status: "PREPARED",
    semanticCommitId: `proposal-commit:${"d".repeat(64)}`,
    proposalId: "proposal-project-create",
    expectedUpdatedAt: "2026-07-25T15:00:00.000Z",
    objectId: `obj_20260725150000000_${"e".repeat(32)}`,
    pageName: mode === "REUSE_SOURCE_PAGE" ? "设备治理材料" : "Project/设备治理",
    relationshipMode: mode,
    replayed: false,
  };
}

function reviewedFinalized(intent: ServicePreparedProposalProjectCreation, pageExternalId: string, pageContentHash: string): ServiceProposalProjectCreationFinalization {
  return {
    status: "COMPLETED",
    semanticCommitId: intent.semanticCommitId,
    replayed: false,
    object: { objectId: intent.objectId, objectType: "PROJECT", version: 1, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text: "设备治理", createdAt: "2026-07-25T15:00:00.000Z", updatedAt: "2026-07-25T15:00:00.000Z", sourceOrCreationEvent: `project_page:graph:${pageExternalId}` },
    anchor: { anchorId: `anc_20260725150000000_${"f".repeat(32)}`, objectId: intent.objectId, role: "primary_text", graphId: "graph", externalId: pageExternalId, status: "active", contentHash: pageContentHash, lastSeenAt: "2026-07-25T15:00:00.000Z" },
    record: {} as Extract<ServiceProposalProjectCreationFinalization, { status: "COMPLETED" }>["record"],
  };
}

function ownedMetadataBlock(intent: Pick<ServiceProjectIntent, "objectId" | "semanticCommitId">): unknown[] {
  return [{
    uuid: "logseq-property-block",
    content: [
      "task-copilot-owner:: task-copilot-personal-mvp",
      `task-copilot-object-id:: ${intent.objectId}`,
      `task-copilot-semantic-commit-id:: ${intent.semanticCommitId}`,
    ].join("\n"),
    children: [],
  }];
}

test("reviewed Project creation creates only its controlled empty Page before the proposal-bound finalize", async () => {
  const prepared = reviewedIntent("CREATE_DEDICATED_PROJECT_PAGE");
  let page: ProjectPageEntity | undefined;
  let finalInput: Parameters<ReviewedProjectCreationService["finalizeProposalProjectCreation"]>[1] | undefined;
  const service: ReviewedProjectCreationService = {
    async prepareProposalProjectCreation() { return prepared; },
    async finalizeProposalProjectCreation(_proposalId, input) {
      finalInput = input;
      return reviewedFinalized(prepared, input.pageExternalId, input.pageContentHash);
    },
  };
  const host: ProjectPageHost = {
    async getPage() { return page ?? null; },
    async createPage(name, properties) {
      page = { uuid: "reviewed-project-page", name: name.toLowerCase(), originalName: name, properties };
      return page;
    },
    async getPageBlocksTree() { return ownedMetadataBlock(prepared); },
  };
  const result = await createReviewedProjectWithPage(service, host, prepared.proposalId, prepared.expectedUpdatedAt, "reviewed-project-create");
  assert.equal(result.status, "COMPLETED");
  if (result.status !== "COMPLETED") throw new Error("expected reviewed Project creation");
  assert.equal(result.pageCreated, true);
  assert.equal(result.pageName, prepared.pageName);
  assert.equal(finalInput?.pageExternalId, "reviewed-project-page");
  assert.equal(finalInput?.pageContentHash, checksum({
    pageName: prepared.pageName,
    pageExternalId: "reviewed-project-page",
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": prepared.objectId,
      "task-copilot-semantic-commit-id": prepared.semanticCommitId,
    },
    emptyAtCreation: true,
  }));
});

test("reviewed Project creation treats Logseq's property block as empty but refuses any user content", async () => {
  const prepared = reviewedIntent("CREATE_DEDICATED_PROJECT_PAGE");
  const page: ProjectPageEntity = {
    uuid: "reviewed-project-page-with-user-content",
    name: prepared.pageName.toLowerCase(),
    originalName: prepared.pageName,
    properties: {
      taskCopilotOwner: "task-copilot-personal-mvp",
      taskCopilotObjectId: prepared.objectId,
      taskCopilotSemanticCommitId: prepared.semanticCommitId,
    },
  };
  let finalizeCalls = 0;
  const service: ReviewedProjectCreationService = {
    async prepareProposalProjectCreation() { return prepared; },
    async finalizeProposalProjectCreation() {
      finalizeCalls += 1;
      throw new Error("must not finalize a Page containing user content");
    },
  };
  const host: ProjectPageHost = {
    async getPage() { return page; },
    async createPage() { throw new Error("existing owned Page must be resumed"); },
    async getPageBlocksTree() {
      return [...ownedMetadataBlock(prepared), { uuid: "user-content", content: "用户已经写入的正文", children: [] }];
    },
  };
  await assert.rejects(
    () => createReviewedProjectWithPage(service, host, prepared.proposalId, prepared.expectedUpdatedAt, "reviewed-project-user-content"),
    /不再是本次事务创建的空页面/,
  );
  assert.equal(finalizeCalls, 0);
});

test("reviewed Page reuse never creates or marks a Page and rejects changed Page evidence", async () => {
  const prepared = reviewedIntent("REUSE_SOURCE_PAGE");
  const page = { uuid: "source-page", name: "设备治理材料", originalName: "设备治理材料", properties: {}, updatedAt: 7 };
  prepared.pageExternalId = page.uuid;
  prepared.pageContentHash = proposalPageEvidenceHash(page);
  let createCalls = 0;
  let finalizeCalls = 0;
  const service: ReviewedProjectCreationService = {
    async prepareProposalProjectCreation() { return prepared; },
    async finalizeProposalProjectCreation(_proposalId, input) {
      finalizeCalls += 1;
      return reviewedFinalized(prepared, input.pageExternalId, input.pageContentHash);
    },
  };
  const host: ProjectPageHost = {
    async getPage() { return page; },
    async createPage() { createCalls += 1; return null; },
    async getPageBlocksTree() { throw new Error("reuse must not require an empty tree"); },
  };
  const result = await createReviewedProjectWithPage(service, host, prepared.proposalId, prepared.expectedUpdatedAt, "reviewed-page-reuse");
  assert.equal(result.status, "COMPLETED");
  assert.equal(createCalls, 0);
  assert.equal(finalizeCalls, 1);
  page.updatedAt = 8;
  await assert.rejects(
    () => createReviewedProjectWithPage(service, host, prepared.proposalId, prepared.expectedUpdatedAt, "reviewed-page-stale"),
    /最终提交前变化/,
  );
  assert.equal(finalizeCalls, 1);
});

test("reviewed Project creation recovery removes only its exact owned empty Page before terminal compensation", async () => {
  const prepared = reviewedIntent("CREATE_DEDICATED_PROJECT_PAGE");
  const pageContentHash = checksum({
    pageName: prepared.pageName,
    pageExternalId: "recovery-project-page",
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": prepared.objectId,
      "task-copilot-semantic-commit-id": prepared.semanticCommitId,
    },
    emptyAtCreation: true,
  });
  let page: ProjectPageEntity | undefined = {
    uuid: "recovery-project-page",
    name: prepared.pageName.toLowerCase(),
    originalName: prepared.pageName,
    properties: {
      taskCopilotOwner: "task-copilot-personal-mvp",
      taskCopilotObjectId: prepared.objectId,
      taskCopilotSemanticCommitId: prepared.semanticCommitId,
    },
  };
  let compensationInput: Parameters<NonNullable<ReviewedProjectCreationService["compensateProposalProjectCreation"]>>[1] | undefined;
  const service: ReviewedProjectCreationService = {
    async prepareProposalProjectCreation() { return prepared; },
    async finalizeProposalProjectCreation() { throw new Error("unused"); },
    async compensateProposalProjectCreation(_proposalId, input) {
      compensationInput = input;
      return { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId: prepared.proposalId, record: {} as never, pagePreserved: false };
    },
  };
  const host: ProjectPageHost = {
    async getPage() { return page ?? null; },
    async createPage() { throw new Error("recovery never creates a Page"); },
    async getPageBlocksTree() { return ownedMetadataBlock(prepared); },
    async deletePage() { page = undefined; },
  };
  const result = await compensateReviewedProjectCreation(service, host, prepared.proposalId, {
    expectedUpdatedAt: prepared.expectedUpdatedAt,
    semanticCommitId: prepared.semanticCommitId,
    relationshipMode: prepared.relationshipMode,
    pageName: prepared.pageName,
    pageExternalId: "recovery-project-page",
    pageContentHash,
    objectId: prepared.objectId,
  }, "project-create-recovery");
  assert.equal(result.status, "FAILED_COMPENSATED");
  assert.equal(compensationInput?.pageExists, false);
  assert.equal(page, undefined);
});

test("reviewed Project creation Undo preserves a reused source Page and deletes only an exact owned empty dedicated Page", async () => {
  const originalSemanticCommitId = `proposal-commit:${"1".repeat(64)}`;
  const reusedPage = { uuid: "reused-source-page", name: "设备治理材料", originalName: "设备治理材料", properties: {}, updatedAt: 9 };
  let deleteCalls = 0;
  const reuseService: ReviewedProjectCreationService = {
    async prepareProposalProjectCreation() { throw new Error("unused"); },
    async finalizeProposalProjectCreation() { throw new Error("unused"); },
    async prepareProposalProjectCreationUndo() {
      return { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId: `project-creation-undo:${originalSemanticCommitId}`, proposalId: "proposal-reuse", pageExternalId: reusedPage.uuid, pagePreserved: true, replayed: false };
    },
    async finalizeProposalProjectCreationUndo() { throw new Error("reused Page Undo completes in Service"); },
  };
  const reuseHost: ProjectPageHost = {
    async getPage() { return reusedPage; },
    async createPage() { throw new Error("unused"); },
    async getPageBlocksTree() { throw new Error("reused Page must not be inspected or deleted"); },
    async deletePage() { deleteCalls += 1; },
  };
  const reused = await undoReviewedProjectCreation(reuseService, reuseHost, originalSemanticCommitId, "undo-reused-project");
  assert.equal(reused.pagePreserved, true);
  assert.equal(deleteCalls, 0);

  const objectId = `obj_20260725150000000_${"2".repeat(32)}`;
  let dedicatedPage: ProjectPageEntity | undefined = {
    uuid: "dedicated-project-page",
    name: "project/设备治理",
    originalName: "Project/设备治理",
    properties: {
      taskCopilotOwner: "task-copilot-personal-mvp",
      taskCopilotObjectId: objectId,
      taskCopilotSemanticCommitId: originalSemanticCommitId,
    },
  };
  let finalizeCalls = 0;
  let prepareCalls = 0;
  const dedicatedService: ReviewedProjectCreationService = {
    async prepareProposalProjectCreation() { throw new Error("unused"); },
    async finalizeProposalProjectCreation() { throw new Error("unused"); },
    async prepareProposalProjectCreationUndo(_commitId, input) {
      prepareCalls += 1;
      if (!input.confirmedOwnedEmpty) {
        return {
          status: "PAGE_PREFLIGHT_REQUIRED", originalSemanticCommitId, undoSemanticCommitId: `project-creation-undo:${originalSemanticCommitId}`,
          proposalId: "proposal-dedicated", pageName: "Project/设备治理", pageExternalId: "dedicated-project-page", objectId,
          pageContentHash: checksum("owned-empty-page"), replayed: false,
        };
      }
      return {
        status: "PAGE_DELETION_REQUIRED", originalSemanticCommitId, undoSemanticCommitId: `project-creation-undo:${originalSemanticCommitId}`,
        proposalId: "proposal-dedicated", pageName: "Project/设备治理", pageExternalId: "dedicated-project-page", objectId,
        pageContentHash: checksum("owned-empty-page"), replayed: false,
      };
    },
    async finalizeProposalProjectCreationUndo(_commitId, input) {
      finalizeCalls += 1;
      assert.equal(input.pageExists, false);
      return { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId: input.undoSemanticCommitId, pagePreserved: false, replayed: false };
    },
  };
  const dedicatedHost: ProjectPageHost = {
    async getPage() { return dedicatedPage ?? null; },
    async createPage() { throw new Error("unused"); },
    async getPageBlocksTree() { return ownedMetadataBlock({ objectId, semanticCommitId: originalSemanticCommitId }); },
    async deletePage() { dedicatedPage = undefined; deleteCalls += 1; },
  };
  const dedicated = await undoReviewedProjectCreation(dedicatedService, dedicatedHost, originalSemanticCommitId, "undo-dedicated-project");
  assert.equal(dedicated.pagePreserved, false);
  assert.equal(prepareCalls, 2);
  assert.equal(finalizeCalls, 1);
  assert.equal(deleteCalls, 1);
});
