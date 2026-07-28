import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";

import {
  PageContextController,
  type PageContextClient,
  type PageContextHost,
} from "../src/page-context-controller.ts";

function object(overrides: Partial<V2ManagedObject> = {}): V2ManagedObject {
  return {
    objectId: "task-1",
    objectType: "TASK",
    version: 3,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "核对发布结果",
    createdAt: "2026-07-23T01:00:00.000Z",
    updatedAt: "2026-07-23T01:00:00.000Z",
    sourceOrCreationEvent: "test",
    ...overrides,
  };
}

function anchor(overrides: Partial<V2Anchor> = {}): V2Anchor {
  return {
    anchorId: "anchor-1",
    objectId: "task-1",
    graphId: "graph-a",
    externalId: "block-1",
    role: "primary_text",
    status: "active",
    contentHash: "hash-1",
    lastSeenAt: "2026-07-23T01:00:00.000Z",
    ...overrides,
  };
}

function host(overrides: Partial<PageContextHost> = {}): PageContextHost {
  const page = { uuid: "page-1", name: "release-check", originalName: "Release Check" };
  return {
    async getPage() { return page; },
    async getCurrentPage() { return page; },
    async getPageBlocksTree() {
      return [{ uuid: "block-1", children: [{ uuid: "block-child" }] }];
    },
    ...overrides,
  };
}

function client(overrides: Partial<PageContextClient> = {}): PageContextClient {
  return {
    async listObjects() { return [object()]; },
    async listPrimaryAnchors() { return { anchors: [anchor()] }; },
    ...overrides,
  };
}

test("Page Context rereads payload/current identity and lists only formal items on the page", async () => {
  const reads: string[] = [];
  const value = host({
    async getPage(identity) {
      reads.push(`page:${identity}`);
      return { uuid: "page-1", name: "release-check", originalName: "Release Check" };
    },
    async getCurrentPage() {
      reads.push("current");
      return { uuid: "page-1", name: "release-check", originalName: "Release Check" };
    },
  });
  const result = await new PageContextController(() => client(), value).open("Release Check");

  assert.equal(result.kind, "PAGE");
  assert.equal(result.pageUuid, "page-1");
  assert.equal(result.pageName, "Release Check");
  assert.deepEqual(result.formalItems.map(({ objectId }) => objectId), ["task-1"]);
  assert.deepEqual(reads, ["page:Release Check", "current", "page:page-1"]);
});

test("Page Context recognizes a Project only from its active page Primary Anchor", async () => {
  const project = object({
    objectId: "project-1",
    objectType: "PROJECT",
    text: "发布 Task Copilot",
    version: 7,
    projectStructure: {
      currentSummary: "正在做 Desktop 验收",
      currentFocuses: ["Page Context"],
      objectives: [],
      deliverables: [],
      workStages: [],
      stageMappings: [],
    },
  });
  const result = await new PageContextController(
    () => client({
      async listObjects() { return [project, object()]; },
      async listPrimaryAnchors() {
        return {
          anchors: [
            anchor({ anchorId: "project-anchor", objectId: "project-1", externalId: "page-1" }),
            anchor(),
          ],
        };
      },
    }),
    host(),
  ).open({ uuid: "page-1" });

  assert.equal(result.kind, "PROJECT");
  assert.equal(result.originSurface, "MAIN_PAGE");
  assert.deepEqual(result.project, {
    objectId: "project-1",
    objectText: "发布 Task Copilot",
    objectVersion: 7,
    lifecycle: "OPEN",
  });
  assert.deepEqual(result.formalItems.map(({ objectId }) => objectId), ["project-1", "task-1"]);
});

test("Page Context reuses controlled Project page ownership when File Graph changes the Page UUID", async () => {
  const project = object({
    objectId: "project-1",
    objectType: "PROJECT",
    text: "发布 Task Copilot",
    version: 7,
  });
  const page = {
    uuid: "file-graph-page",
    name: "project/release",
    originalName: "Project/Release",
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": project.objectId,
    },
  };
  const controller = new PageContextController(
    () => client({
      async listObjects() { return [project]; },
      async listPrimaryAnchors() {
        return {
          anchors: [anchor({
            anchorId: "project-anchor",
            objectId: project.objectId,
            externalId: "page-uuid-before-reload",
          })],
        };
      },
    }),
    host({
      async getPage() { return page; },
      async getCurrentPage() { return page; },
      async getPageBlocksTree() { return []; },
    }),
  );

  const result = await controller.open(page);
  assert.equal(result.kind, "PROJECT");
  assert.equal(result.project?.objectId, project.objectId);
  assert.deepEqual(result.formalItems.map(({ objectId }) => objectId), [project.objectId]);
  assert.equal((await controller.resolveCurrentProject())?.project.objectId, project.objectId);
});

test("controlled Project page ownership cannot override a conflicting exact Page Anchor", async () => {
  const exactProject = object({ objectId: "project-exact", objectType: "PROJECT", text: "Exact" });
  const ownedProject = object({ objectId: "project-owned", objectType: "PROJECT", text: "Owned" });
  const page = {
    uuid: "page-1",
    name: "project/conflict",
    originalName: "Project/Conflict",
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": ownedProject.objectId,
    },
  };
  const controller = new PageContextController(
    () => client({
      async listObjects() { return [exactProject, ownedProject]; },
      async listPrimaryAnchors() {
        return {
          anchors: [
            anchor({ anchorId: "exact", objectId: exactProject.objectId, externalId: page.uuid }),
            anchor({ anchorId: "owned", objectId: ownedProject.objectId, externalId: "old-page-uuid" }),
          ],
        };
      },
    }),
    host({
      async getPage() { return page; },
      async getCurrentPage() { return page; },
      async getPageBlocksTree() { return []; },
    }),
  );

  await assert.rejects(() => controller.open(page), /身份与 active Primary Anchor 不一致/);
  await assert.rejects(() => controller.resolveCurrentProject(), /身份与 active Primary Anchor 不一致/);
});

test("current Project resolver uses only the exact active Page Anchor and revalidates the main Page", async () => {
  const project = object({
    objectId: "project-1",
    objectType: "PROJECT",
    text: "发布 Task Copilot",
    version: 7,
  });
  let treeReads = 0;
  const controller = new PageContextController(
    () => client({
      async listObjects() { return [project]; },
      async listPrimaryAnchors() {
        return {
          anchors: [
            anchor({ anchorId: "project-active", objectId: project.objectId, externalId: "page-1" }),
            anchor({ anchorId: "project-missing", objectId: project.objectId, externalId: "page-1", status: "missing" }),
          ],
        };
      },
    }),
    host({
      async getPageBlocksTree() {
        treeReads += 1;
        return [];
      },
    }),
  );

  assert.deepEqual(await controller.resolveCurrentProject(), {
    pageUuid: "page-1",
    pageName: "Release Check",
    project: {
      objectId: "project-1",
      objectText: "发布 Task Copilot",
      objectVersion: 7,
      lifecycle: "OPEN",
    },
  });
  assert.equal(treeReads, 0, "the passive Page head action must not scan the Page Block tree");
});

test("current Project resolver hides ordinary, changed, and ambiguous pages", async () => {
  const project = object({ objectId: "project-1", objectType: "PROJECT", text: "Project" });
  assert.equal(await new PageContextController(() => client(), host()).resolveCurrentProject(), undefined);

  let reads = 0;
  await assert.rejects(
    () => new PageContextController(
      () => client({
        async listObjects() { return [project]; },
        async listPrimaryAnchors() {
          return { anchors: [anchor({ objectId: project.objectId, externalId: "page-1" })] };
        },
      }),
      host({
        async getCurrentPage() {
          reads += 1;
          return reads === 1
            ? { uuid: "page-1", name: "one", originalName: "One" }
            : { uuid: "page-2", name: "two", originalName: "Two" };
        },
      }),
    ).resolveCurrentProject(),
    /页面已切换/,
  );

  await assert.rejects(
    () => new PageContextController(
      () => client({
        async listObjects() { return [project]; },
        async listPrimaryAnchors() {
          return {
            anchors: [
              anchor({ anchorId: "one", objectId: project.objectId, externalId: "page-1" }),
              anchor({ anchorId: "two", objectId: project.objectId, externalId: "page-1" }),
            ],
          };
        },
      }),
      host(),
    ).resolveCurrentProject(),
    /多个 active Project Primary Anchor/,
  );

  await assert.rejects(
    () => new PageContextController(
      () => client({
        async listObjects() { return [project, { ...project, version: 2 }]; },
        async listPrimaryAnchors() {
          return { anchors: [anchor({ objectId: project.objectId, externalId: "page-1" })] };
        },
      }),
      host(),
    ).resolveCurrentProject(),
    /正式对象身份重复/,
  );
});

test("Page Context rejects a target whose identity changes while the route is loading", async () => {
  let pageReads = 0;
  const value = host({
    async getPage() {
      pageReads += 1;
      return pageReads === 1
        ? { uuid: "page-1", name: "release-check", originalName: "Release Check" }
        : { uuid: "page-2", name: "another-page", originalName: "Another Page" };
    },
  });
  await assert.rejects(
    () => new PageContextController(() => client(), value).open("Release Check"),
    /页面已切换/,
  );
});

test("Page Context supports a right-sidebar target without treating the main page as its identity", async () => {
  const result = await new PageContextController(
    () => client(),
    host({
      async getCurrentPage() {
        return { uuid: "main-page", name: "main-page", originalName: "Main Page" };
      },
    }),
  ).open("Release Check");

  assert.equal(result.originSurface, "SECONDARY_PAGE");
  assert.equal(result.pageUuid, "page-1");
  await new PageContextController(
    () => client(),
    host({
      async getCurrentPage() {
        return { uuid: "main-page", name: "main-page", originalName: "Main Page" };
      },
    }),
  ).revalidate(result);
});

test("Page Context revalidates the original page before a routed action", async () => {
  let currentUuid = "page-1";
  const controller = new PageContextController(
    () => client(),
    host({
      async getCurrentPage() {
        return { uuid: currentUuid, name: currentUuid, originalName: currentUuid };
      },
    }),
  );
  const snapshot = await controller.open("Release Check");
  currentUuid = "page-2";

  await assert.rejects(() => controller.revalidate(snapshot), /页面已切换/);
});

test("Page Context fails closed for duplicate Project anchors and anchor cursor loops", async () => {
  const project = object({ objectId: "project-1", objectType: "PROJECT", text: "Project" });
  await assert.rejects(
    () => new PageContextController(
      () => client({
        async listObjects() { return [project]; },
        async listPrimaryAnchors() {
          return {
            anchors: [
              anchor({ anchorId: "a", objectId: "project-1", externalId: "page-1" }),
              anchor({ anchorId: "b", objectId: "project-1", externalId: "page-1" }),
            ],
          };
        },
      }),
      host(),
    ).open("Release Check"),
    /多个 active Project Primary Anchor/,
  );

  await assert.rejects(
    () => new PageContextController(
      () => client({
        async listPrimaryAnchors() { return { anchors: [], nextCursor: "same" }; },
      }),
      host(),
    ).open("Release Check"),
    /分页状态异常/,
  );
});
