import type { V2ManagedObject } from "@task-copilot/domain";
import { RuntimeShapeAdapter } from "@task-copilot/logseq-adapter";

import type { ServiceRuntimeClient } from "./service-connection.ts";
import { ownedProjectPageObjectId } from "./v2-project-creation.ts";

export type PageContextClient = Pick<ServiceRuntimeClient, "listObjects" | "listPrimaryAnchors">;

export interface PageContextHost {
  getPage(identity: string): Promise<unknown>;
  getCurrentPage(): Promise<unknown>;
  getPageBlocksTree(identity: string): Promise<unknown[] | null>;
}

export interface PageContextFormalItem {
  objectId: string;
  objectType: V2ManagedObject["objectType"];
  objectText: string;
  objectVersion: number;
  lifecycle: V2ManagedObject["lifecycle"];
}

export interface PageContextProject {
  objectId: string;
  objectText: string;
  objectVersion: number;
  lifecycle: V2ManagedObject["lifecycle"];
}

export interface CurrentProjectPage {
  pageUuid: string;
  pageName: string;
  project: PageContextProject;
}

export interface PageContextSnapshot {
  kind: "PAGE" | "PROJECT";
  originSurface: "MAIN_PAGE" | "SECONDARY_PAGE";
  pageUuid: string;
  pageName: string;
  formalItems: PageContextFormalItem[];
  project?: PageContextProject;
}

interface PageIdentity {
  uuid: string;
  name: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function pageIdentity(value: unknown): PageIdentity {
  const shape = record(value);
  const uuid = shape?.uuid;
  const name = shape?.originalName ?? shape?.name;
  if (typeof uuid !== "string" || !uuid.trim() || typeof name !== "string" || !name.trim()) {
    throw new Error("Logseq 未返回可验证的当前 Page identity；没有打开页面操作。");
  }
  return { uuid, name };
}

function assertSamePage(expected: PageIdentity, actual: PageIdentity): void {
  if (expected.uuid !== actual.uuid) {
    throw new Error("页面已切换；旧 Page Context 已作废，没有执行操作。请在当前页重新打开页面菜单。");
  }
}

function collectBlockUuids(values: unknown[], target: Set<string>): void {
  for (const value of values) {
    const shape = record(value);
    if (!shape) continue;
    if (typeof shape.uuid === "string" && shape.uuid.trim()) target.add(shape.uuid);
    if (Array.isArray(shape.children)) collectBlockUuids(shape.children, target);
  }
}

function formalItem(object: V2ManagedObject): PageContextFormalItem {
  return {
    objectId: object.objectId,
    objectType: object.objectType,
    objectText: object.text,
    objectVersion: object.version,
    lifecycle: object.lifecycle,
  };
}

export class PageContextController {
  constructor(
    private readonly getClient: () => PageContextClient | undefined,
    private readonly host: PageContextHost,
  ) {}

  async open(payload: unknown): Promise<PageContextSnapshot> {
    const client = this.getClient();
    if (!client) throw new Error("V2 Local Service 未就绪；没有打开页面操作。");
    const payloadRef = RuntimeShapeAdapter.pageRef(payload);
    const selectedEntity = await this.host.getPage(payloadRef);
    const selected = pageIdentity(selectedEntity);
    const current = pageIdentity(await this.host.getCurrentPage());

    const [objects, blocks, anchors] = await Promise.all([
      client.listObjects(),
      this.host.getPageBlocksTree(selected.uuid),
      this.loadAnchors(client),
    ]);
    if (!Array.isArray(blocks)) {
      throw new Error("Logseq 未返回当前页 Block 树；没有打开页面操作。");
    }
    assertSamePage(selected, pageIdentity(await this.host.getPage(selected.uuid)));

    const pageExternalIds = new Set<string>([selected.uuid]);
    collectBlockUuids(blocks, pageExternalIds);
    const activeAnchors = anchors.filter((value) => (
      value.role === "primary_text"
      && value.status === "active"
      && pageExternalIds.has(value.externalId)
    ));
    const objectsById = new Map(objects.map((value) => [value.objectId, value]));
    const formalItems = [...new Set(activeAnchors.map(({ objectId }) => objectId))]
      .map((objectId) => objectsById.get(objectId))
      .filter((value): value is V2ManagedObject => value !== undefined)
      .map(formalItem);
    const projectAnchors = activeAnchors.filter((value) => (
      value.externalId === selected.uuid
      && objectsById.get(value.objectId)?.objectType === "PROJECT"
    ));
    if (projectAnchors.length > 1) {
      throw new Error("当前页对应多个 active Project Primary Anchor；请先修复 Anchor 冲突，没有打开项目操作。");
    }
    const ownedObjectId = ownedProjectPageObjectId(selectedEntity);
    const ownedObject = ownedObjectId ? objectsById.get(ownedObjectId) : undefined;
    const ownedAnchors = ownedObject?.objectType === "PROJECT"
      ? anchors.filter((value) => (
        value.objectId === ownedObject.objectId
        && value.role === "primary_text"
        && value.status === "active"
      ))
      : [];
    if (ownedAnchors.length > 1) {
      throw new Error("当前页声明的 Project 对应多个 active Primary Anchor；请先修复 Anchor 冲突，没有打开项目操作。");
    }
    if (projectAnchors[0] && ownedObjectId && projectAnchors[0].objectId !== ownedObjectId) {
      throw new Error("当前页的 Project 身份与 active Primary Anchor 不一致；没有打开项目操作。");
    }
    const projectObject = projectAnchors[0]
      ? objectsById.get(projectAnchors[0].objectId)
      : ownedAnchors[0]
        ? ownedObject
        : undefined;
    if (projectObject && !formalItems.some(({ objectId }) => objectId === projectObject.objectId)) {
      formalItems.unshift(formalItem(projectObject));
    }
    const project = projectObject ? {
      objectId: projectObject.objectId,
      objectText: projectObject.text,
      objectVersion: projectObject.version,
      lifecycle: projectObject.lifecycle,
    } : undefined;
    return {
      kind: project ? "PROJECT" : "PAGE",
      originSurface: selected.uuid === current.uuid ? "MAIN_PAGE" : "SECONDARY_PAGE",
      pageUuid: selected.uuid,
      pageName: selected.name,
      formalItems,
      ...(project ? { project } : {}),
    };
  }

  async revalidate(snapshot: PageContextSnapshot): Promise<void> {
    const current = pageIdentity(await this.host.getCurrentPage());
    const reread = pageIdentity(await this.host.getPage(snapshot.pageUuid));
    assertSamePage({ uuid: snapshot.pageUuid, name: snapshot.pageName }, reread);
    if (snapshot.originSurface === "MAIN_PAGE") {
      assertSamePage({ uuid: snapshot.pageUuid, name: snapshot.pageName }, current);
    }
  }

  async resolveCurrentProject(): Promise<CurrentProjectPage | undefined> {
    const client = this.getClient();
    if (!client) return undefined;
    const currentEntity = await this.host.getCurrentPage();
    const current = pageIdentity(currentEntity);
    const [objects, anchors] = await Promise.all([
      client.listObjects(),
      this.loadAnchors(client),
    ]);
    assertSamePage(current, pageIdentity(await this.host.getCurrentPage()));
    const objectsById = new Map<string, V2ManagedObject>();
    for (const object of objects) {
      if (objectsById.has(object.objectId)) {
        throw new Error("正式对象身份重复；顶部项目入口保持隐藏。");
      }
      objectsById.set(object.objectId, object);
    }
    const matches = anchors.filter((anchor) => (
      anchor.role === "primary_text"
      && anchor.status === "active"
      && anchor.externalId === current.uuid
      && objectsById.get(anchor.objectId)?.objectType === "PROJECT"
    ));
    if (matches.length > 1) {
      throw new Error("当前页对应多个 active Project Primary Anchor；顶部项目入口保持隐藏。");
    }
    const ownedObjectId = ownedProjectPageObjectId(currentEntity);
    const ownedObject = ownedObjectId ? objectsById.get(ownedObjectId) : undefined;
    const ownedAnchors = ownedObject?.objectType === "PROJECT"
      ? anchors.filter((anchor) => (
        anchor.objectId === ownedObject.objectId
        && anchor.role === "primary_text"
        && anchor.status === "active"
      ))
      : [];
    if (ownedAnchors.length > 1) {
      throw new Error("当前页声明的 Project 对应多个 active Primary Anchor；顶部项目入口保持隐藏。");
    }
    if (matches[0] && ownedObjectId && matches[0].objectId !== ownedObjectId) {
      throw new Error("当前页的 Project 身份与 active Primary Anchor 不一致；顶部项目入口保持隐藏。");
    }
    const object = matches[0]
      ? objectsById.get(matches[0].objectId)
      : ownedAnchors[0]
        ? ownedObject
        : undefined;
    if (!object) return undefined;
    return {
      pageUuid: current.uuid,
      pageName: current.name,
      project: {
        objectId: object.objectId,
        objectText: object.text,
        objectVersion: object.version,
        lifecycle: object.lifecycle,
      },
    };
  }

  private async loadAnchors(client: PageContextClient) {
    const anchors: Awaited<ReturnType<PageContextClient["listPrimaryAnchors"]>>["anchors"] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.listPrimaryAnchors(cursor);
      anchors.push(...page.anchors);
      cursor = page.nextCursor;
      if (cursor && seenCursors.has(cursor)) {
        throw new Error("Primary Anchor 分页状态异常；没有打开页面操作。");
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return anchors;
  }
}
