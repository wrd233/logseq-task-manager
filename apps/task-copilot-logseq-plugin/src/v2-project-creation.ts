import type {
  ServiceFinalizeProjectResult,
  ServiceProjectIntent,
} from "@task-copilot/service-client";
import { StructuredError, checksum } from "@task-copilot/shared";

const projectPageOwner = "task-copilot-personal-mvp";
const ownerProperty = "task-copilot-owner";
const objectProperty = "task-copilot-object-id";
const commitProperty = "task-copilot-semantic-commit-id";

export interface ProjectPageEntity {
  uuid: string;
  name: string;
  originalName?: string;
  properties?: Record<string, unknown>;
}

export interface ProjectPageHost {
  getPage(pageName: string): Promise<ProjectPageEntity | null>;
  createPage(pageName: string, properties: Record<string, string>, options: { redirect: false; createFirstBlock: false; journal: false }): Promise<ProjectPageEntity | null>;
  getPageBlocksTree(pageName: string): Promise<unknown[] | null>;
}

export interface ProjectCreationService {
  prepareProject(input: { name: string; traceId: string }): Promise<ServiceProjectIntent>;
  finalizeProject(input: {
    semanticCommitId: string;
    objectId: string;
    name: string;
    pageExternalId: string;
    pageContentHash: string;
    traceId: string;
  }): Promise<ServiceFinalizeProjectResult>;
}

export interface ProjectCreationResult extends ServiceFinalizeProjectResult {
  pageName: string;
  pageCreated: boolean;
}

function projectError(code: string, message: string, details?: Record<string, unknown>): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-044", "D-220"], ...(details ? { details } : {}) });
}

function normalizedPropertyKey(value: string): string {
  return value.toLowerCase().replaceAll(/[-_]/g, "");
}

function property(properties: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!properties) return undefined;
  const normalized = normalizedPropertyKey(key);
  const entry = Object.entries(properties).find(([candidate]) => normalizedPropertyKey(candidate) === normalized);
  return typeof entry?.[1] === "string" ? entry[1] : undefined;
}

function expectedProperties(intent: ServiceProjectIntent): Record<string, string> {
  return {
    [ownerProperty]: projectPageOwner,
    [objectProperty]: intent.objectId,
    [commitProperty]: intent.semanticCommitId,
  };
}

function assertOwnedPage(page: ProjectPageEntity, intent: ServiceProjectIntent): void {
  const actualName = page.originalName ?? page.name;
  if (
    (intent.status !== "COMPLETED" && actualName.toLowerCase() !== intent.pageName.toLowerCase())
    || property(page.properties, ownerProperty) !== projectPageOwner
    || property(page.properties, objectProperty) !== intent.objectId
    || property(page.properties, commitProperty) !== intent.semanticCommitId
  ) {
    throw projectError(
      "V2_PROJECT_PAGE_OWNERSHIP_CONFLICT",
      `页面 ${intent.pageName} 已存在，但不是本次受控创建事务拥有的页面；未覆盖任何内容。`,
      { pageName: intent.pageName },
    );
  }
}

export async function createProjectWithControlledPage(
  service: ProjectCreationService,
  host: ProjectPageHost,
  name: string,
  traceId: string,
): Promise<ProjectCreationResult> {
  const intent = await service.prepareProject({ name, traceId });
  let page = await host.getPage(intent.pageExternalId ?? intent.pageName);
  let pageCreated = false;
  if (page) {
    assertOwnedPage(page, intent);
  } else {
    page = await host.createPage(intent.pageName, expectedProperties(intent), {
      redirect: false,
      createFirstBlock: false,
      journal: false,
    });
    pageCreated = true;
    if (!page) throw projectError("V2_PROJECT_PAGE_CREATE_FAILED", `Logseq 未能创建 ${intent.pageName}；SQLite 尚未创建 Project。`);
    assertOwnedPage(page, intent);
  }
  const blocks = await host.getPageBlocksTree(page.uuid);
  if (!Array.isArray(blocks)) {
    throw projectError("V2_PROJECT_PAGE_READ_FAILED", `${intent.pageName} 已创建但 Logseq 尚未返回可验证的页面 Block 树；SQLite 尚未创建 Project，请保留页面并重试同名创建。`);
  }
  const pageContentHash = checksum({
    pageName: intent.pageName,
    pageExternalId: page.uuid,
    properties: expectedProperties(intent),
    emptyAtCreation: blocks.length === 0,
  });
  try {
    const finalized = await service.finalizeProject({
      semanticCommitId: intent.semanticCommitId,
      objectId: intent.objectId,
      name,
      pageExternalId: page.uuid,
      pageContentHash,
      traceId,
    });
    return { ...finalized, pageName: page.originalName ?? intent.pageName, pageCreated };
  } catch (error) {
    throw projectError(
      "V2_PROJECT_FINALIZE_RECOVERY_REQUIRED",
      `${intent.pageName} 已由本次事务安全标记，但 SQLite 收口结果尚未确认；请保留页面并重试同名创建。`,
      { semanticCommitId: intent.semanticCommitId, cause: error instanceof Error ? error.message : String(error) },
    );
  }
}
