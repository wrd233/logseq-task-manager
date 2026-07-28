import type {
  ServiceFinalizeProjectResult,
  ServiceCompensateProposalProjectCreationRequest,
  ServiceFinalizeProposalProjectCreationRequest,
  ServicePrepareProposalProjectCreationRequest,
  ServiceProposalProjectCreationCompensation,
  ServiceProposalProjectCreationFinalization,
  ServiceProposalProjectCreationPreparation,
  ServiceProposalProjectCreationUndoFinalization,
  ServiceProposalProjectCreationUndoPreparation,
  ServiceProjectIntent,
} from "@task-copilot/service-client";
import { StructuredError, checksum } from "@task-copilot/shared";

import { proposalPageEvidenceHash } from "./v2-proposal-revalidation.ts";

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
  deletePage?(pageName: string): Promise<void>;
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

export interface ReviewedProjectCreationService {
  prepareProposalProjectCreation(proposalId: string, input: ServicePrepareProposalProjectCreationRequest): Promise<ServiceProposalProjectCreationPreparation>;
  finalizeProposalProjectCreation(proposalId: string, input: ServiceFinalizeProposalProjectCreationRequest): Promise<ServiceProposalProjectCreationFinalization>;
  compensateProposalProjectCreation?(proposalId: string, input: ServiceCompensateProposalProjectCreationRequest): Promise<ServiceProposalProjectCreationCompensation>;
  prepareProposalProjectCreationUndo?(originalSemanticCommitId: string, input: { traceId: string; confirmedOwnedEmpty?: true; pageExternalId?: string }): Promise<ServiceProposalProjectCreationUndoPreparation>;
  finalizeProposalProjectCreationUndo?(originalSemanticCommitId: string, input: {
    originalSemanticCommitId: string;
    undoSemanticCommitId: string;
    pageExternalId: string;
    pageExists: boolean;
    traceId: string;
  }): Promise<ServiceProposalProjectCreationUndoFinalization>;
}

export interface ProjectCreationResult extends ServiceFinalizeProjectResult {
  pageName: string;
  pageCreated: boolean;
}

export type ReviewedProjectCreationResult = Extract<ServiceProposalProjectCreationFinalization, { status: "COMPLETED" }> & {
  pageName: string;
  pageCreated: boolean;
};

export interface ReviewedProjectCreationUndoResult extends ServiceProposalProjectCreationUndoFinalization {
  pageName: string;
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

export function ownedProjectPageObjectId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const properties = (value as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return undefined;
  const record = properties as Record<string, unknown>;
  if (property(record, ownerProperty) !== projectPageOwner) return undefined;
  return property(record, objectProperty);
}

function expectedProperties(intent: Pick<ServiceProjectIntent, "objectId" | "semanticCommitId">): Record<string, string> {
  return {
    [ownerProperty]: projectPageOwner,
    [objectProperty]: intent.objectId,
    [commitProperty]: intent.semanticCommitId,
  };
}

function pageContainsOnlyOwnedMetadata(
  blocks: unknown[],
  intent: Pick<ServiceProjectIntent, "objectId" | "semanticCommitId">,
): boolean {
  if (blocks.length === 0) return true;
  if (blocks.length !== 1) return false;
  const block = blocks[0];
  if (!block || typeof block !== "object" || Array.isArray(block)) return false;
  const { content, children } = block as { content?: unknown; children?: unknown };
  if (typeof content !== "string" || (Array.isArray(children) && children.length > 0)) return false;
  const properties = new Map<string, string>();
  for (const line of content.split("\n").map((item) => item.trim()).filter(Boolean)) {
    const match = /^([^:\n]+)::\s*(.*)$/u.exec(line);
    if (!match) return false;
    const key = normalizedPropertyKey(match[1]!);
    if (properties.has(key)) return false;
    properties.set(key, match[2]!);
  }
  const expected = expectedProperties(intent);
  return properties.size === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => properties.get(normalizedPropertyKey(key)) === value);
}

async function confirmPageAbsent(host: ProjectPageHost, ...identities: Array<string | undefined>): Promise<boolean> {
  const exactIdentities = [...new Set(identities.filter((identity): identity is string => Boolean(identity)))];
  const delaysMs = [0, 50, 100, 200];
  for (const delayMs of delaysMs) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const pages = await Promise.all(exactIdentities.map((identity) => host.getPage(identity)));
    if (pages.every((page) => !page)) return true;
  }
  return false;
}

function assertOwnedPage(page: ProjectPageEntity, intent: Pick<ServiceProjectIntent, "objectId" | "semanticCommitId" | "pageName"> & { status?: string }): void {
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

async function resolveOwnedDedicatedPage(
  host: ProjectPageHost,
  intent: Required<Pick<ServiceProjectIntent, "objectId" | "semanticCommitId" | "pageName" | "pageExternalId">>,
): Promise<ProjectPageEntity | null> {
  const exact = await host.getPage(intent.pageExternalId);
  if (exact) return exact;
  const rebound = await host.getPage(intent.pageName);
  if (!rebound) return null;
  assertOwnedPage(rebound, { ...intent, status: "PENDING" });
  return rebound;
}

export async function createReviewedProjectWithPage(
  service: ReviewedProjectCreationService,
  host: ProjectPageHost,
  proposalId: string,
  expectedUpdatedAt: string,
  traceId: string,
): Promise<ReviewedProjectCreationResult | Extract<ServiceProposalProjectCreationPreparation, { status: "STALE" }>> {
  const intent = await service.prepareProposalProjectCreation(proposalId, {
    confirmation: "CREATE_PROJECT",
    expectedUpdatedAt,
    traceId,
  });
  if (intent.status === "STALE") return intent;
  if (intent.status === "COMPLETED") {
    const page = await host.getPage(intent.pageExternalId);
    return {
      status: "COMPLETED",
      semanticCommitId: intent.semanticCommitId,
      object: intent.object,
      anchor: intent.anchor,
      record: intent.record,
      replayed: true,
      pageName: page?.originalName ?? page?.name ?? intent.pageName,
      pageCreated: false,
    };
  }
  if (intent.status === "RECOVERY_REQUIRED") {
    await compensateReviewedProjectCreation(service, host, proposalId, {
      expectedUpdatedAt,
      semanticCommitId: intent.semanticCommitId,
      relationshipMode: intent.relationshipMode,
      pageName: intent.pageName,
      pageExternalId: intent.pageExternalId,
      pageContentHash: intent.pageContentHash,
      objectId: intent.objectId,
    }, `${traceId}:resume-compensation`);
    throw projectError(
      "V2_PROJECT_CREATION_FAILED_COMPENSATED",
      intent.relationshipMode === "REUSE_SOURCE_PAGE"
        ? "上次 Project 创建失败已收口；来源 Page 保持原样。"
        : "上次 Project 创建失败与其受控空 Page 已安全收口。",
      { semanticCommitId: intent.semanticCommitId },
    );
  }
  let page: ProjectPageEntity | null;
  let pageCreated = false;
  let pageContentHash: string;
  if (intent.relationshipMode === "REUSE_SOURCE_PAGE") {
    if (!intent.pageExternalId || !intent.pageContentHash) {
      throw projectError("V2_PROJECT_PAGE_REUSE_EVIDENCE_MISSING", "复用当前 Page 的机器身份或版本证据缺失；没有创建 Project。");
    }
    page = await host.getPage(intent.pageExternalId);
    if (!page || page.uuid !== intent.pageExternalId || proposalPageEvidenceHash(page) !== intent.pageContentHash) {
      throw projectError("V2_PROJECT_PAGE_REUSE_STALE", "当前 Page 已在最终提交前变化；没有创建 Project 或改写页面。");
    }
    pageContentHash = intent.pageContentHash;
  } else {
    page = await host.getPage(intent.pageName);
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
    if (!Array.isArray(blocks) || !pageContainsOnlyOwnedMetadata(blocks, intent)) {
      throw projectError("V2_PROJECT_PAGE_NOT_EMPTY", `${intent.pageName} 不再是本次事务创建的空页面；SQLite 尚未创建 Project，请先检查页面内容。`);
    }
    pageContentHash = checksum({
      pageName: intent.pageName,
      pageExternalId: page.uuid,
      properties: expectedProperties(intent),
      emptyAtCreation: true,
    });
  }
  let finalized: ServiceProposalProjectCreationFinalization;
  try {
    finalized = await service.finalizeProposalProjectCreation(proposalId, {
      expectedUpdatedAt,
      semanticCommitId: intent.semanticCommitId,
      objectId: intent.objectId,
      pageExternalId: page.uuid,
      pageContentHash,
      traceId,
    });
  } catch {
    throw projectError(
      "V2_PROJECT_FINALIZE_RECOVERY_REQUIRED",
      intent.relationshipMode === "REUSE_SOURCE_PAGE"
        ? "当前 Page 未被改写，但 Project 正式创建结果尚未确认；请保留页面并从同一 Proposal 继续恢复。"
        : `${intent.pageName} 已由本次事务安全标记，但 Project 正式创建结果尚未确认；请保留页面并从同一 Proposal 继续恢复。`,
      { semanticCommitId: intent.semanticCommitId },
    );
  }
  if (finalized.status === "COMPENSATION_REQUIRED") {
    await compensateReviewedProjectCreation(service, host, proposalId, {
      expectedUpdatedAt,
      semanticCommitId: intent.semanticCommitId,
      relationshipMode: intent.relationshipMode,
      pageName: intent.pageName,
      pageExternalId: page.uuid,
      pageContentHash,
      objectId: intent.objectId,
    }, `${traceId}:compensate`);
    throw projectError(
      "V2_PROJECT_CREATION_FAILED_COMPENSATED",
      intent.relationshipMode === "REUSE_SOURCE_PAGE"
        ? "Project 未创建，失败事务已收口；来源 Page 保持原样。"
        : `Project 未创建，失败事务与本次受控空 Page 已安全收口。`,
      { semanticCommitId: intent.semanticCommitId },
    );
  }
  return { ...finalized, pageName: page.originalName ?? intent.pageName, pageCreated };
}

export async function compensateReviewedProjectCreation(
  service: ReviewedProjectCreationService,
  host: ProjectPageHost,
  proposalId: string,
  intent: {
    expectedUpdatedAt: string;
    semanticCommitId: string;
    relationshipMode: "CREATE_DEDICATED_PROJECT_PAGE" | "CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE" | "REUSE_SOURCE_PAGE";
    pageName: string;
    pageExternalId: string;
    pageContentHash: string;
    objectId: string;
  },
  traceId: string,
): Promise<ServiceProposalProjectCreationCompensation> {
  if (!service.compensateProposalProjectCreation) throw projectError("V2_PROJECT_CREATION_RECOVERY_UNAVAILABLE", "当前 Service 不支持 Project 创建恢复。");
  const reuse = intent.relationshipMode === "REUSE_SOURCE_PAGE";
  const page = reuse
    ? await host.getPage(intent.pageExternalId)
    : await resolveOwnedDedicatedPage(host, intent);
  if (reuse) {
    if (!page || page.uuid !== intent.pageExternalId || proposalPageEvidenceHash(page) !== intent.pageContentHash) {
      throw projectError("V2_PROJECT_CREATION_COMPENSATION_PAGE_STALE", "来源 Page 已变化；系统不会删除或猜测补偿，请保留现场并查看恢复状态。");
    }
  } else {
    if (!page) {
      // A previous recovery attempt may already have removed the exact owned Page.
    } else {
      assertOwnedPage(page, { ...intent, status: "PENDING" });
      const blocks = await host.getPageBlocksTree(page.uuid);
      if (!Array.isArray(blocks) || !pageContainsOnlyOwnedMetadata(blocks, intent)) throw projectError("V2_PROJECT_CREATION_COMPENSATION_PAGE_CHANGED", "受控 Project Page 已包含内容；系统不会删除它，请保留现场并人工恢复。");
      if (!host.deletePage) throw projectError("V2_PROJECT_CREATION_RECOVERY_UNAVAILABLE", "当前 Logseq Host 不支持安全删除受控 Page。");
      await host.deletePage(page.originalName ?? page.name);
      if (!await confirmPageAbsent(host, intent.pageExternalId, page.uuid, page.originalName ?? page.name)) {
        throw projectError("V2_PROJECT_CREATION_COMPENSATION_DELETE_UNCONFIRMED", "Logseq 尚未确认受控 Page 已移除；没有收口失败事务。");
      }
    }
  }
  return service.compensateProposalProjectCreation(proposalId, {
    expectedUpdatedAt: intent.expectedUpdatedAt,
    semanticCommitId: intent.semanticCommitId,
    pageExternalId: intent.pageExternalId,
    pageContentHash: intent.pageContentHash,
    pageExists: reuse,
    traceId,
  });
}

export async function undoReviewedProjectCreation(
  service: ReviewedProjectCreationService,
  host: ProjectPageHost,
  originalSemanticCommitId: string,
  traceId: string,
): Promise<ReviewedProjectCreationUndoResult | Extract<ServiceProposalProjectCreationUndoPreparation, { status: "COMPLETED" }>> {
  if (!service.prepareProposalProjectCreationUndo || !service.finalizeProposalProjectCreationUndo) throw projectError("V2_PROJECT_CREATION_UNDO_UNAVAILABLE", "当前 Service 不支持 Project 创建 Undo。");
  let prepared = await service.prepareProposalProjectCreationUndo(originalSemanticCommitId, { traceId });
  if (prepared.status === "COMPLETED") {
    const page = await host.getPage(prepared.pageExternalId);
    return { ...prepared, pageName: page?.originalName ?? page?.name ?? prepared.pageExternalId };
  }
  if (prepared.status === "PAGE_PREFLIGHT_REQUIRED") {
    const page = await resolveOwnedDedicatedPage(host, {
      objectId: prepared.objectId,
      semanticCommitId: originalSemanticCommitId,
      pageName: prepared.pageName,
      pageExternalId: prepared.pageExternalId,
    });
    if (!page) throw projectError("V2_PROJECT_CREATION_UNDO_PAGE_MISSING", "专用 Project Page 已不存在；系统没有先删除正式对象，请从恢复状态检查现场。");
    assertOwnedPage(page, {
      objectId: prepared.objectId,
      semanticCommitId: originalSemanticCommitId,
      pageName: prepared.pageName,
      status: "PENDING",
    });
    const blocks = await host.getPageBlocksTree(page.uuid);
    if (!Array.isArray(blocks) || !pageContainsOnlyOwnedMetadata(blocks, { objectId: prepared.objectId, semanticCommitId: originalSemanticCommitId })) throw projectError("V2_PROJECT_CREATION_UNDO_PAGE_CHANGED", "Project Page 已包含正文；系统不会删除用户内容，且尚未撤销 Project 正式对象。");
    prepared = await service.prepareProposalProjectCreationUndo(originalSemanticCommitId, {
      traceId: `${traceId}:confirmed-owned-empty`,
      confirmedOwnedEmpty: true,
      pageExternalId: prepared.pageExternalId,
    });
    if (prepared.status === "COMPLETED") return { ...prepared, pageName: page.originalName ?? page.name };
    if (prepared.status === "PAGE_PREFLIGHT_REQUIRED") throw projectError("V2_PROJECT_CREATION_UNDO_PREFLIGHT_NOT_ADVANCED", "Project 创建 Undo 未能从空 Page 预检进入正式撤销。");
  }
  const page = await resolveOwnedDedicatedPage(host, {
    objectId: prepared.objectId,
    semanticCommitId: originalSemanticCommitId,
    pageName: prepared.pageName,
    pageExternalId: prepared.pageExternalId,
  });
  if (page) {
    assertOwnedPage(page, {
      objectId: prepared.objectId,
      semanticCommitId: originalSemanticCommitId,
      pageName: prepared.pageName,
      status: "PENDING",
    });
    const blocks = await host.getPageBlocksTree(page.uuid);
    if (!Array.isArray(blocks) || !pageContainsOnlyOwnedMetadata(blocks, { objectId: prepared.objectId, semanticCommitId: originalSemanticCommitId })) throw projectError("V2_PROJECT_CREATION_UNDO_PAGE_CHANGED", "Project Page 已包含正文；系统不会删除用户内容，Project 创建 Undo 已停在可恢复状态。");
    if (!host.deletePage) throw projectError("V2_PROJECT_CREATION_UNDO_UNAVAILABLE", "当前 Logseq Host 不支持安全删除受控 Project Page。");
    await host.deletePage(page.originalName ?? page.name);
  }
  if (!await confirmPageAbsent(host, prepared.pageExternalId, page?.uuid, page?.originalName ?? page?.name ?? prepared.pageName)) {
    throw projectError("V2_PROJECT_CREATION_UNDO_DELETE_UNCONFIRMED", "Logseq 尚未确认 Project Page 已移除；Undo 没有收口。");
  }
  const finalized = await service.finalizeProposalProjectCreationUndo(originalSemanticCommitId, {
    originalSemanticCommitId,
    undoSemanticCommitId: prepared.undoSemanticCommitId,
    pageExternalId: prepared.pageExternalId,
    pageExists: false,
    traceId,
  });
  return { ...finalized, pageName: prepared.pageName };
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
    emptyAtCreation: pageContainsOnlyOwnedMetadata(blocks, intent),
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
