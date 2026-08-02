import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";

import { AgentGovernanceApplication, CreationSessionApplication, V2Application, V2CandidateApplication, V2MigrationApplication, V2ProposalApplication, buildMiniProjectRestructureProposal, buildProjectClosureEvidenceDraft, buildProjectCreationProposal, buildProjectNarrationProposal, inspectReviewedV2ProjectClosure, miniProjectStructureHash, planAcceptedMiniProjectRestructure, planCompletedMiniProjectRestructureUndo, planAcceptedV2LifecycleTransition, planAcceptedV2ProjectCreation, planAcceptedV2ProposalCommit, planAcceptedV2OwnershipChange, planAcceptedV2ProjectClosure, planAcceptedV2ProjectStructure, projectV2NowWork, type GrillPreview, type InteractionEvidenceBuffer, type MaterializeExplicitObjectInput, type ProjectCreationPreview, type V2ReentryCommitFact } from "@task-copilot/application";
import { agentGovernanceSemanticText, buildAgentReviewEvidencePackage, renderV2ProposalFiles, requiredV2ProposalRevalidationScope, validateV2MiniProjectClosure, validateV2ProposalForSubmission, type AgentCurrentSourceEvidence, type AgentFeedbackInput, type CreationRoundAnswerInput, type CreationSessionSource, type CreationSessionStatus, type CreationSourceCapture, type LegacyMigrationReviewDecision, type V2Anchor, type V2CandidateDisposition, type V2CandidateKind, type V2Condition, type V2ManagedObject, type V2MiniProjectClosure, type V2Proposal, type V2ProposalGroupDecision, type V2ProposalScopeObservation } from "@task-copilot/domain";
import { parseExplicitObjectSyntax, stripLogseqBlockIdentityProperty } from "@task-copilot/logseq-adapter";
import { V2_DATABASE_SCHEMA_VERSION, V2SqliteStore, type V2CommitStepStatus } from "@task-copilot/persistence/node";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type ServiceCapabilities,
  type ServiceDescriptor,
  type ServiceDoctor,
  type ServiceDoctorCheck,
  type ServiceBackupCatalog,
  type ServiceGraphReadResult,
  type ServiceGraphSnapshot,
  type ServiceCreationSourceSelection,
  type ServiceProjectCreationSourceReturnTarget,
} from "@task-copilot/service-client";
import { removeServiceDescriptor, writeServiceDescriptor } from "@task-copilot/service-client/node";
import { StructuredError, checksum, createId, stableJson } from "@task-copilot/shared";
import {
  armRestoreRecoveryInterlock,
  assertRestoreRecoveryInterlockClear,
  clearRestoreRecoveryInterlock,
  readRestoreRecoveryInterlock,
  replaceRestoreRecoveryInterlock,
  type RestoreRecoveryInterlock,
} from "@task-copilot/shared/node";

import type { LocalLlmProposalGenerator, V2PromptBundle } from "./llm-proposal.ts";
import type { LocalLlmUxOutputGenerator } from "./llm-ux-output.ts";
import type { LocalLlmGrillTurnGenerator } from "./llm-grill-turn.ts";
import type { LocalLlmGrillPreviewGenerator } from "./llm-grill-preview.ts";
import type { LocalLlmProjectCreationPreviewGenerator } from "./llm-project-creation-preview.ts";
import type { LocalLlmCreationRoundGenerator } from "./creation-session-round.ts";
import { listTaskCopilotSkills, readAgentGovernanceSkill, readTaskCopilotSkill } from "./skill-catalog.ts";
import { buildContextPackage, contextPackageFingerprint, type ContextExportScope, type ServiceContextPackage } from "./context-package.ts";
import { buildProjectContextRecoveryGeneration } from "./project-context-recovery.ts";
import { buildMiniProjectGrillGeneration, buildMiniProjectGrillPreviewGeneration, buildMiniProjectSourcePositions, type MiniProjectGrillAnswer, type MiniProjectGrillSource } from "./mini-project-grill.ts";
import { buildProjectCreationGrillGeneration, buildProjectCreationPreviewGeneration, type ProjectCreationGrillAnswer, type ProjectCreationGrillMaterial, type ProjectCreationGrillSource } from "./project-creation-grill.ts";
import { GrillPreviewSessionStore } from "./grill-preview-session.ts";
import { GraphReadBroker } from "./graph-read-broker.ts";
import { parseGraphReadQuery, parseGraphReadResult } from "./graph-read-contract.ts";
import { readLegacyRecoveryBundle, scanLegacyRecoveryBundle } from "./migration-scan.ts";
import { buildProjectClosureProposalPrompt, validateGeneratedProjectClosureProposal, validateProjectClosureUserJudgments, type ProjectClosureUserJudgments } from "./project-closure-provider.ts";
import { AgentGovernanceRuntime, type AgentGovernanceRuntimeProvider } from "./agent-governance-runtime.ts";

export { LOCAL_SERVICE_PROTOCOL_VERSION } from "@task-copilot/service-client";

export const LOCAL_SERVICE_CAPABILITIES = {
  formalWrites: true,
  migration: true,
  provider: false,
  backup: true,
  graphReadBridge: true,
} satisfies ServiceCapabilities;

export interface LocalServiceOptions {
  databasePath: string;
  graphId: string;
  token?: string;
  descriptorPath?: string;
  backupRoot?: string;
  proposalGenerator?: LocalLlmProposalGenerator;
  uxOutputGenerator?: LocalLlmUxOutputGenerator;
  grillTurnGenerator?: LocalLlmGrillTurnGenerator;
  grillPreviewGenerator?: LocalLlmGrillPreviewGenerator;
  projectCreationPreviewGenerator?: LocalLlmProjectCreationPreviewGenerator;
  creationRoundGenerator?: LocalLlmCreationRoundGenerator;
  agentGovernanceProvider?: AgentGovernanceRuntimeProvider;
  interactionEvidence?: InteractionEvidenceBuffer;
  /** Test-only fault boundary; production callers must omit it. */
  faults?: { beforeProjectClosureDomainWrite?: () => void; afterProjectClosureDomainWrite?: () => void; afterOwnershipPrepare?: () => void; afterOwnershipDomainWrite?: () => void; afterOwnershipCommitFailedBeforeProposalTerminal?: () => void; beforeOwnershipUndoDomainWrite?: () => void; afterOwnershipUndoDomainWrite?: () => void; afterLifecyclePrepare?: () => void; afterLifecycleDomainWrite?: () => void; afterLifecycleUndoPrepare?: () => void; afterLifecycleUndoDomainWrite?: () => void; afterLifecycleProposalStale?: () => void; afterLifecycleCommitFailed?: () => void; beforeProposalProjectCreationDomainWrite?: () => void; afterProposalProjectCreationDomainWrite?: () => void; beforeAreaDomainWrite?: () => void | Promise<void>; afterMigrationImport?: () => void; beforeMigrationVerify?: () => void; beforeMigrationActivate?: () => void; beforeRestoreDrain?: () => void; beforeRestoreOffline?: () => void; afterRestoreActivate?: () => void; beforeRestoreRollback?: () => void };
}
export interface LocalServiceHandle {
  url: string;
  token: string;
  capabilities: ServiceCapabilities;
  close(): Promise<void>;
}

function respond(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function authorized(request: IncomingMessage, token: string): boolean {
  return request.headers.authorization === `Bearer ${token}`;
}

const maximumRequestBodyBytes = 16 * 1024;
const backupIdPattern = /^backup_[0-9]{17}_[0-9a-f]{32}$/;
const BACKUP_CATALOG_LIMIT = 20;

function backupCreatedAt(backupId: string): string {
  const timestamp = backupId.slice("backup_".length, "backup_".length + 17);
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}.${timestamp.slice(14, 17)}Z`;
}

function serviceError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-192", "D-204"] });
}

function miniProjectRestructureProposalBuildError(error: unknown): StructuredError {
  if (error instanceof StructuredError) return error;
  const reason = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    "MiniProject restructure requires a zero-delete session preview.": "结构预览不满足零删除边界；没有创建 Proposal。",
    "MiniProject restructure subject is invalid.": "MiniProject 对象版本或预览时间无效；没有创建 Proposal。",
    "MiniProject restructure source positions are incomplete.": "结构预览与当前来源 Block 数量不一致；没有创建 Proposal。",
    "MiniProject restructure preview material placement is invalid.": "结构预览没有为每项来源材料提供唯一去向；没有创建 Proposal。",
    "MiniProject restructure source evidence changed after preview.": "结构预览中的材料证据与当前来源不一致；没有创建 Proposal。",
    "MiniProject restructure requires one root source Block.": "结构预览无法确定唯一根 Block；没有创建 Proposal。",
    "MiniProject restructure source scope hash is invalid.": "结构预览缺少有效的来源范围指纹；没有创建 Proposal。",
    "MiniProject root material cannot move out of root.": "结构预览试图移动 MiniProject 根 Block；没有创建 Proposal。",
    "MiniProject restructure source material lacks an original parent.": "结构预览中的来源 Block 缺少可恢复的原位置；没有创建 Proposal。",
    "MiniProject restructure move impact does not match the preview.": "结构预览的移动统计与正式操作不一致；没有创建 Proposal。",
    "MiniProject restructure create impact does not match the preview.": "结构预览的新增统计与正式操作不一致；没有创建 Proposal。",
    "MiniProject restructure source sibling chain is invalid.": "当前 Block 子树的相邻顺序无法安全还原；没有创建 Proposal。",
    "MiniProject restructure target sibling is invalid.": "结构预览包含无法安全定位的目标顺序；没有创建 Proposal。",
    "MiniProject restructure source Block is missing.": "结构预览引用的来源 Block 已不存在；没有创建 Proposal。",
    "MiniProject restructure source position is invalid.": "结构预览引用的来源 Block 位置无效；没有创建 Proposal。",
    "MiniProject restructure create simulation is invalid.": "结构预览的新增 Block 无法通过安全模拟；没有创建 Proposal。",
    "MiniProject restructure move simulation is invalid.": "结构预览的移动操作无法通过安全模拟；没有创建 Proposal。",
  };
  if (reason.startsWith("MiniProject restructure created Block identity is invalid for ")) {
    return serviceError("GRILL_PREVIEW_PROPOSAL_INVALID", "结构预览无法生成唯一且可恢复的 Block 身份；没有创建 Proposal。");
  }
  return serviceError("GRILL_PREVIEW_PROPOSAL_INVALID", messages[reason] ?? "结构预览无法安全转换为正式 Proposal；没有写入审阅队列。");
}

async function readBody(request: IncomingMessage, maximumBytes = maximumRequestBodyBytes): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    size += chunk.length;
    if (size > maximumBytes) {
      throw serviceError("REQUEST_BODY_TOO_LARGE", maximumBytes === maximumRequestBodyBytes ? "Local Service 请求体超过 16 KiB 限制。" : `Local Service 请求体超过 ${maximumBytes} bytes 限制。`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readMigrationJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(request, 8 * 1024 * 1024);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "迁移请求必须是合法 JSON。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw serviceError("MIGRATION_REQUEST_INVALID", "迁移请求必须是对象。");
  return value as Record<string, unknown>;
}

async function readCreationSessionJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(request, 512 * 1024);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Creation Session 请求必须是合法 JSON。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "Creation Session 请求必须是对象。");
  return value as Record<string, unknown>;
}

function safeCreationToken(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw serviceError("CREATION_SESSION_REQUEST_INVALID", `${label}必须是受控标识。`);
  return value;
}

function parseCreationSourceSelection(value: unknown): ServiceCreationSourceSelection {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const keys = Object.keys(record).sort().join(",");
  if (record.kind === "BLANK" && keys === "kind") return { kind: "BLANK" };
  if ((record.kind === "BLOCK" || record.kind === "PAGE") && keys === "kind,target" && typeof record.target === "string" && record.target.trim() && record.target.length <= 512) {
    if (record.kind === "BLOCK" && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.target)) throw serviceError("CREATION_SESSION_SOURCE_SELECTION_INVALID", "Block 来源必须使用受控 UUID。");
    return { kind: record.kind, target: record.target.trim() };
  }
  throw serviceError("CREATION_SESSION_SOURCE_SELECTION_INVALID", "来源选择只接受空白、一个 Block UUID 或一个 Page identity。");
}

function safeMigrationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

async function requireNoBody(request: IncomingMessage): Promise<void> {
  if ((await readBody(request)).trim().length > 0) {
    throw serviceError("REQUEST_BODY_NOT_ALLOWED", "Backup 创建不接受客户端路径或其他参数。");
  }
}

async function readProposalGenerationRequest(request: IncomingMessage): Promise<{ prompt: V2PromptBundle }> {
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).length !== 1 || !record.prompt || typeof record.prompt !== "object" || Array.isArray(record.prompt)) {
    throw serviceError("LLM_GENERATION_REQUEST_INVALID", "Provider 请求只接受有界的五层 Prompt。");
  }
  return { prompt: record.prompt as unknown as V2PromptBundle };
}

async function readProposalRevisionRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; prompt: V2PromptBundle }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "expectedUpdatedAt,prompt"
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || !record.prompt || typeof record.prompt !== "object" || Array.isArray(record.prompt)) {
    throw serviceError("LLM_REVISION_REQUEST_INVALID", "Provider 调整请求必须包含当前 Proposal 版本与有界五层 Prompt。");
  }
  return { expectedUpdatedAt: record.expectedUpdatedAt, prompt: record.prompt as unknown as V2PromptBundle };
}

function localLlmFormalizationRevisionIdentity(proposal: V2Proposal): string | undefined {
  const group = proposal.groups.length === 1 ? proposal.groups[0] : undefined;
  const patch = group?.textPatches.length === 1 ? group.textPatches[0] : undefined;
  const operation = group?.semanticOperations.length === 1 ? group.semanticOperations[0] : undefined;
  if (!group || !patch || operation?.kind !== "CREATE_OBJECT" || operation.target.kind !== "BLOCK") return undefined;
  return stableJson({
    proposalId: proposal.proposalId,
    createdAt: proposal.createdAt,
    scope: proposal.scope,
    group: {
      groupId: group.groupId,
      risk: group.risk,
      independentlyAcceptable: group.independentlyAcceptable,
      dependencies: group.dependencies,
      patch: { blockUuid: patch.blockUuid, beforeText: patch.beforeText, beforeHash: patch.beforeHash },
      operation: { operationId: operation.operationId, kind: operation.kind, target: operation.target },
    },
  });
}

function requireSameLocalLlmFormalizationIntent(current: V2Proposal, revised: V2Proposal): void {
  const currentIdentity = localLlmFormalizationRevisionIdentity(current);
  const revisedIdentity = localLlmFormalizationRevisionIdentity(revised);
  if (current.source.kind !== "local_llm" || revised.source.kind !== "local_llm"
    || !["READY", "IN_REVIEW", "PARTIALLY_ACCEPTED", "ACCEPTED"].includes(current.status)
    || revised.status !== "READY" || !currentIdentity || currentIdentity !== revisedIdentity) {
    throw serviceError("LLM_PROPOSAL_REVISION_INTENT_MISMATCH", "Agent 调整脱离原 Proposal 的 Block、scope 或操作身份；机器表示保持不变。");
  }
}

async function readContextExportRequest(request: IncomingMessage): Promise<{ scope: ContextExportScope; id: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const scope = String(record.scope);
  const objectId = typeof record.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.id);
  const pageId = typeof record.id === "string" && record.id.trim().length > 0 && record.id.length <= 512 && !Array.from(record.id).some((character) => character.charCodeAt(0) <= 31);
  if (Object.keys(record).sort().join(",") !== "id,scope" || !["block", "page", "object", "project"].includes(scope) || (scope === "page" ? !pageId : !objectId)) {
    throw serviceError("CONTEXT_EXPORT_REQUEST_INVALID", "Context export 只接受 block/page/object/project 与匹配的受控目标。");
  }
  return { scope: record.scope as ContextExportScope, id: String(record.id) };
}

async function readProjectContextRecoveryRequest(request: IncomingMessage): Promise<{ objectId: string; expectedVersion: number }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project context recovery 请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).sort().join(",") !== "expectedVersion,objectId"
    || typeof record.objectId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.objectId)
    || !Number.isSafeInteger(record.expectedVersion)
    || Number(record.expectedVersion) < 1
  ) {
    throw serviceError("UX_CONTEXT_RECOVERY_REQUEST_INVALID", "Project context recovery 只接受受控 objectId 与正整数 expectedVersion。");
  }
  return { objectId: record.objectId, expectedVersion: Number(record.expectedVersion) };
}

async function readMiniProjectGrillRequest(request: IncomingMessage): Promise<{ objectId: string; expectedVersion: number; answers: MiniProjectGrillAnswer[] }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject Grill 请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "answers,expectedVersion,objectId" || typeof record.objectId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.objectId) || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || !Array.isArray(record.answers) || record.answers.length > 4) {
    throw serviceError("GRILL_REQUEST_INVALID", "MiniProject Grill 只接受受控对象版本与最多四个本轮回答。");
  }
  const allowedUncertaintyIds = new Set(["boundary", "outcome", "completion-evidence", "material-disposition"]);
  const answers = record.answers.map((value) => {
    const answer = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    if (Object.keys(answer).sort().join(",") !== "text,uncertaintyId" || typeof answer.uncertaintyId !== "string" || !allowedUncertaintyIds.has(answer.uncertaintyId) || typeof answer.text !== "string" || !answer.text.trim() || answer.text.length > 2_000) throw serviceError("GRILL_REQUEST_INVALID", "MiniProject Grill 回答必须引用一个机器不确定性并保持有界。" );
    return { uncertaintyId: answer.uncertaintyId, text: answer.text.trim() };
  });
  if (new Set(answers.map(({ uncertaintyId }) => uncertaintyId)).size !== answers.length) throw serviceError("GRILL_REQUEST_INVALID", "MiniProject Grill 同一不确定性只能回答一次。");
  return { objectId: record.objectId, expectedVersion: Number(record.expectedVersion), answers };
}

type ProjectCreationGrillRequest =
  | { sourceKind: "BLANK"; answers: ProjectCreationGrillAnswer[] }
  | { sourceKind: "PAGE"; pageId: string; answers: ProjectCreationGrillAnswer[] }
  | { sourceKind: "MINI_PROJECT"; objectId: string; expectedVersion: number; answers: ProjectCreationGrillAnswer[] };

async function readProjectCreationGrillRequest(request: IncomingMessage): Promise<ProjectCreationGrillRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project Creation Grill 请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const sourceKind = record.sourceKind;
  const expectedKeys = sourceKind === "BLANK" ? "answers,sourceKind"
    : sourceKind === "PAGE" ? "answers,pageId,sourceKind"
    : sourceKind === "MINI_PROJECT" ? "answers,expectedVersion,objectId,sourceKind"
    : "";
  if (Object.keys(record).sort().join(",") !== expectedKeys || !Array.isArray(record.answers) || record.answers.length > 7
    || (sourceKind === "PAGE" && (typeof record.pageId !== "string" || !record.pageId.trim() || record.pageId.length > 512))
    || (sourceKind === "MINI_PROJECT" && (typeof record.objectId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.objectId) || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1))) {
    throw serviceError("PROJECT_CREATION_GRILL_REQUEST_INVALID", "Project Creation Grill 只接受受控 Blank、Page identity 或 MiniProject object/version 来源。");
  }
  const allowedUncertaintyIds = new Set(["outcome", "project-boundary", "completion-evidence", "material-disposition", "internal-closure", "current-interface", "page-object-relationship"]);
  const answers = record.answers.map((value) => {
    const answer = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    if (Object.keys(answer).sort().join(",") !== "text,uncertaintyId" || typeof answer.uncertaintyId !== "string" || !allowedUncertaintyIds.has(answer.uncertaintyId) || typeof answer.text !== "string" || !answer.text.trim() || answer.text.length > 2_000) {
      throw serviceError("PROJECT_CREATION_GRILL_REQUEST_INVALID", "Project Creation Grill 回答必须引用一个开放的机器不确定性并保持有界。");
    }
    return { uncertaintyId: answer.uncertaintyId, text: answer.text.trim() };
  });
  if (new Set(answers.map(({ uncertaintyId }) => uncertaintyId)).size !== answers.length) throw serviceError("PROJECT_CREATION_GRILL_REQUEST_INVALID", "Project Creation Grill 同一不确定性只能回答一次。");
  if (sourceKind === "PAGE") return { sourceKind, pageId: String(record.pageId).trim(), answers };
  if (sourceKind === "MINI_PROJECT") return { sourceKind, objectId: String(record.objectId), expectedVersion: Number(record.expectedVersion), answers };
  return { sourceKind: "BLANK", answers };
}

async function readMiniProjectGrillProposalRequest(request: IncomingMessage): Promise<{ objectId: string; expectedVersion: number; previewHandle: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject restructure Proposal 请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "expectedVersion,objectId,previewHandle" || typeof record.objectId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.objectId)
    || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || typeof record.previewHandle !== "string" || !/^grill_preview_[A-Za-z0-9_-]{24,96}$/.test(record.previewHandle)) {
    throw serviceError("GRILL_PROPOSAL_REQUEST_INVALID", "MiniProject restructure Proposal 只接受对象版本与当前 Service session 的 preview handle。");
  }
  return { objectId: record.objectId, expectedVersion: Number(record.expectedVersion), previewHandle: record.previewHandle };
}

async function readProjectCreationProposalRequest(request: IncomingMessage): Promise<{ previewHandle: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project Creation Proposal 请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).join(",") !== "previewHandle" || typeof record.previewHandle !== "string" || !/^grill_preview_[A-Za-z0-9_-]{24,96}$/.test(record.previewHandle)) {
    throw serviceError("PROJECT_CREATION_PROPOSAL_REQUEST_INVALID", "Project Creation Proposal 只接受当前 Service session 的 preview handle。");
  }
  return { previewHandle: record.previewHandle };
}

function deterministicBlockUuid(seed: string): string {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16]!, 16) % 4]!;
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readGraphQueryRequest(request: IncomingMessage) {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Graph 读取请求必须是合法 JSON。"); }
  return parseGraphReadQuery(value);
}

async function readGraphResultRequest(request: IncomingMessage): Promise<ServiceGraphReadResult> {
  const body = await readBody(request, 2 * 1024 * 1024);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Graph 只读桥接结果必须是合法 JSON。"); }
  return parseGraphReadResult(value);
}

async function readAgentGovernanceObservationRequest(request: IncomingMessage): Promise<{ changedBlockId: string; changedBlockCount: number }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Agent observation 请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "changedBlockCount,changedBlockId"
    || typeof record.changedBlockId !== "string" || !record.changedBlockId.trim() || record.changedBlockId.length > 512
    || !Number.isSafeInteger(record.changedBlockCount) || Number(record.changedBlockCount) < 1 || Number(record.changedBlockCount) > 1_024) {
    throw serviceError("AGENT_OBSERVATION_INVALID", "Agent observation 只接受受控 changed Block 身份与批次大小。");
  }
  return { changedBlockId: record.changedBlockId.trim(), changedBlockCount: Number(record.changedBlockCount) };
}

function parseAgentFeedbackInput(value: unknown): AgentFeedbackInput {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowed = new Set(["rating", "correctionType", "tendency", "routeAssessment", "note", "action"]);
  const valid = Object.keys(record).every((key) => allowed.has(key))
    && ["CORRECT", "MOSTLY_CORRECT", "WRONG"].includes(String(record.rating))
    && ["THIS_DECISION_ONLY", "RECORD_RULE_FEEDBACK", "PAUSE_RULE_AUTOMATION"].includes(String(record.action))
    && (record.correctionType === undefined || ["SHOULD_KEEP_ORDINARY", "SHOULD_CREATE_OBJECT", "SHOULD_UPDATE_EXISTING", "SHOULD_DEFER", "WRONG_TARGET", "TOO_AGGRESSIVE", "TOO_CONSERVATIVE", "RISK_TOO_HIGH", "RISK_TOO_LOW", "OTHER"].includes(String(record.correctionType)))
    && (record.tendency === undefined || ["TOO_AGGRESSIVE", "TOO_CONSERVATIVE"].includes(String(record.tendency)))
    && (record.routeAssessment === undefined || ["TOO_HIGH", "TOO_LOW"].includes(String(record.routeAssessment)))
    && (record.note === undefined || (typeof record.note === "string" && record.note.trim().length > 0 && record.note.length <= 2_048));
  if (!valid) throw serviceError("AGENT_FEEDBACK_INVALID", "Agent Feedback 字段、评价或纠正类型无效。");
  return {
    rating: record.rating as AgentFeedbackInput["rating"],
    ...(record.correctionType !== undefined ? { correctionType: record.correctionType as NonNullable<AgentFeedbackInput["correctionType"]> } : {}),
    ...(record.tendency !== undefined ? { tendency: record.tendency as NonNullable<AgentFeedbackInput["tendency"]> } : {}),
    ...(record.routeAssessment !== undefined ? { routeAssessment: record.routeAssessment as NonNullable<AgentFeedbackInput["routeAssessment"]> } : {}),
    ...(typeof record.note === "string" ? { note: record.note.trim() } : {}),
    action: record.action as AgentFeedbackInput["action"],
  };
}

function validAgentCommandIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value);
}

async function readAgentPauseRequest(
  request: IncomingMessage,
  field: "paused" | "globalWritesPaused" | "observationEnabled" | "expandedContextEnabled",
): Promise<{ paused: boolean; traceId: string; idempotencyKey: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Agent 暂停请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== [field, "idempotencyKey", "traceId"].sort().join(",")
    || typeof record[field] !== "boolean"
    || !validAgentCommandIdentity(record.traceId) || !validAgentCommandIdentity(record.idempotencyKey)) {
    throw serviceError("AGENT_PAUSE_COMMAND_INVALID", "Agent 暂停请求只接受布尔状态、trace ID 与幂等键。");
  }
  return { paused: record[field] as boolean, traceId: record.traceId, idempotencyKey: record.idempotencyKey };
}

async function readAgentFeedbackRequest(request: IncomingMessage): Promise<{ feedback: AgentFeedbackInput; traceId: string; idempotencyKey: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Agent Feedback 请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "feedback,idempotencyKey,traceId"
    || !validAgentCommandIdentity(record.traceId) || !validAgentCommandIdentity(record.idempotencyKey)) {
    throw serviceError("AGENT_FEEDBACK_INVALID", "Agent Feedback 只接受反馈、trace ID 与幂等键。");
  }
  return { feedback: parseAgentFeedbackInput(record.feedback), traceId: record.traceId, idempotencyKey: record.idempotencyKey };
}

async function readAgentBulkFeedbackRequest(request: IncomingMessage): Promise<{ decisionIds: string[]; feedback: AgentFeedbackInput; traceId: string; idempotencyKey: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "批量 Agent Feedback 请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const decisionIds = Array.isArray(record.decisionIds) ? record.decisionIds : [];
  if (Object.keys(record).sort().join(",") !== "decisionIds,feedback,idempotencyKey,traceId"
    || decisionIds.length < 1 || decisionIds.length > 50
    || decisionIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 256)
    || new Set(decisionIds).size !== decisionIds.length
    || !validAgentCommandIdentity(record.traceId) || !validAgentCommandIdentity(record.idempotencyKey)) {
    throw serviceError("AGENT_BULK_FEEDBACK_INVALID", "批量 Agent Feedback 只接受 1..50 个唯一 Decision ID、反馈、trace ID 与幂等键。");
  }
  return { decisionIds: decisionIds as string[], feedback: parseAgentFeedbackInput(record.feedback), traceId: record.traceId, idempotencyKey: record.idempotencyKey };
}

async function readAgentExportRequest(request: IncomingMessage, kind: "SKILL_FEEDBACK" | "REVIEW_EVIDENCE"): Promise<{ days: 7 | 30 | 60 | 180 }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Agent export 请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowed = kind === "REVIEW_EVIDENCE" ? [60, 180] : [7, 30, 60, 180];
  if (Object.keys(record).join(",") !== "days" || !Number.isSafeInteger(record.days) || !allowed.includes(Number(record.days))) {
    throw serviceError("AGENT_EXPORT_RANGE_INVALID", kind === "REVIEW_EVIDENCE" ? "主动复盘只接受最近 60 或 180 天。" : "Skill Feedback 只接受最近 7、30、60 或 180 天。");
  }
  return { days: Number(record.days) as 7 | 30 | 60 | 180 };
}

async function readAgentRetentionRequest(request: IncomingMessage): Promise<{ traceId: string; idempotencyKey: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Agent retention 请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,idempotencyKey,traceId"
    || record.confirmation !== "EXPIRE_REVIEW_SIGNAL_INDEX_ONLY"
    || !validAgentCommandIdentity(record.traceId) || !validAgentCommandIdentity(record.idempotencyKey)) {
    throw serviceError("AGENT_RETENTION_CONFIRMATION_REQUIRED", "Retention 作业需要精确确认 EXPIRE_REVIEW_SIGNAL_INDEX_ONLY、trace ID 与幂等键。");
  }
  return { traceId: record.traceId, idempotencyKey: record.idempotencyKey };
}

async function readAssociationRequest(request: IncomingMessage): Promise<{ sourceObjectId: string; targetObjectId: string; expectedVersion: number; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const keys = Object.keys(record).sort().join(",");
  const validId = (candidate: unknown) => typeof candidate === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate);
  if (keys !== "confirmation,expectedVersion,sourceObjectId,targetObjectId,traceId" || !validId(record.sourceObjectId) || !validId(record.targetObjectId) || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || record.confirmation !== "ADD_ASSOCIATION" || !validId(record.traceId)) {
    throw serviceError("V2_ASSOCIATION_REQUEST_INVALID", "Association 需要精确对象、版本、确认短语和 trace ID。");
  }
  return { sourceObjectId: String(record.sourceObjectId), targetObjectId: String(record.targetObjectId), expectedVersion: Number(record.expectedVersion), traceId: String(record.traceId) };
}

async function readInteractionDispositionRequest(request: IncomingMessage): Promise<{ disposition?: "HELPFUL" | "NOT_NEEDED" | "INACCURATE" | "TOO_MUCH" | "DO_NOT_REPEAT" }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "反馈请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const dispositions = ["HELPFUL", "NOT_NEEDED", "INACCURATE", "TOO_MUCH", "DO_NOT_REPEAT"];
  if (Object.keys(record).join(",") !== "disposition" || (record.disposition !== null && !dispositions.includes(String(record.disposition)))) {
    throw serviceError("UX_INTERACTION_DISPOSITION_INVALID", "反馈只接受有界处置或撤回。");
  }
  return record.disposition === null ? {} : { disposition: record.disposition as "HELPFUL" | "NOT_NEEDED" | "INACCURATE" | "TOO_MUCH" | "DO_NOT_REPEAT" };
}

async function readCandidateDiscoveryRequest(request: IncomingMessage): Promise<{ sourceAnchorId: string; sourceVersion: string; candidateKind: V2CandidateKind; reason: string; suggestion: string; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const kinds = new Set<V2CandidateKind>(["WORK_ITEM", "UPDATE", "DECISION", "OUTPUT", "OWNERSHIP", "CONFLICT"]);
  const validText = (candidate: unknown, maximum: number) => typeof candidate === "string" && candidate.trim().length > 0 && candidate.trim().length <= maximum;
  if (Object.keys(record).sort().join(",") !== "candidateKind,reason,sourceAnchorId,sourceVersion,suggestion,traceId"
    || !validText(record.sourceAnchorId, 512) || !validText(record.sourceVersion, 256)
    || !kinds.has(record.candidateKind as V2CandidateKind) || !validText(record.reason, 2_048)
    || !validText(record.suggestion, 2_048) || !validText(record.traceId, 128)) {
    throw serviceError("V2_CANDIDATE_DISCOVERY_REQUEST_INVALID", "Candidate discovery 请求字段无效或超出边界。");
  }
  return { sourceAnchorId: String(record.sourceAnchorId).trim(), sourceVersion: String(record.sourceVersion).trim(), candidateKind: record.candidateKind as V2CandidateKind, reason: String(record.reason).trim(), suggestion: String(record.suggestion).trim(), traceId: String(record.traceId).trim() };
}

async function readCandidateDispositionRequest(request: IncomingMessage): Promise<{ disposition: Exclude<V2CandidateDisposition, "PENDING" | "RESOLVED">; reason: string; deferredUntil?: string; expectedUpdatedAt: string; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const dispositions = new Set(["LATER", "DISMISSED", "NO_MORE_LIKE_THIS"]);
  const keys = Object.keys(record).sort().join(",");
  if (!["disposition,expectedUpdatedAt,reason,traceId", "deferredUntil,disposition,expectedUpdatedAt,reason,traceId"].includes(keys)
    || !dispositions.has(String(record.disposition)) || typeof record.reason !== "string" || !record.reason.trim()
    || record.reason.trim().length > 2_048 || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.traceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.traceId)
    || (record.deferredUntil !== undefined && (typeof record.deferredUntil !== "string" || !Number.isFinite(Date.parse(record.deferredUntil))))) {
    throw serviceError("V2_CANDIDATE_DISPOSITION_REQUEST_INVALID", "Candidate disposition 请求字段无效或超出边界。");
  }
  return { disposition: record.disposition as Exclude<V2CandidateDisposition, "PENDING" | "RESOLVED">, reason: record.reason.trim(), ...(typeof record.deferredUntil === "string" ? { deferredUntil: record.deferredUntil } : {}), expectedUpdatedAt: record.expectedUpdatedAt, traceId: record.traceId };
}

async function readCandidateFormalizationRequest(request: IncomingMessage): Promise<{ sourceAnchorId: string; inputVersion: string; contentHash: string; content: string; objectType: "MINI_PROJECT" | "TASK" | "DECISION" | "OUTPUT"; text: string; expectedUpdatedAt: string; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const valid = (candidate: unknown, maximum: number) => typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= maximum;
  if (Object.keys(record).sort().join(",") !== "content,contentHash,expectedUpdatedAt,inputVersion,objectType,sourceAnchorId,text,traceId"
    || !valid(record.sourceAnchorId, 512) || !valid(record.inputVersion, 128) || typeof record.contentHash !== "string" || !/^[0-9a-f]{8,64}$/.test(record.contentHash)
    || !valid(record.content, 8_192) || checksum(record.content) !== record.contentHash || !["MINI_PROJECT", "TASK", "DECISION", "OUTPUT"].includes(String(record.objectType))
    || !valid(record.text, 2_048) || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.traceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.traceId)) {
    throw serviceError("V2_CANDIDATE_FORMALIZATION_REQUEST_INVALID", "Candidate formalization 需要当前 Block 内容、版本、目标类型与审阅版本证据。");
  }
  return { sourceAnchorId: String(record.sourceAnchorId).trim(), inputVersion: String(record.inputVersion).trim(), contentHash: String(record.contentHash), content: String(record.content), objectType: record.objectType as "MINI_PROJECT" | "TASK" | "DECISION" | "OUTPUT", text: String(record.text).trim(), expectedUpdatedAt: String(record.expectedUpdatedAt), traceId: String(record.traceId) };
}

async function readCandidateObjectUpdateRequest(request: IncomingMessage): Promise<{
  sourceAnchorId: string; sourceInputVersion: string; sourceContentHash: string;
  targetObjectId: string; targetExternalId: string; targetInputVersion: string; targetContentHash: string; targetContent: string;
  afterContent: string; expectedUpdatedAt: string; traceId: string;
}> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const valid = (candidate: unknown, maximum: number) => typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= maximum;
  const validHash = (candidate: unknown) => typeof candidate === "string" && /^[0-9a-f]{8,64}$/.test(candidate);
  if (Object.keys(record).sort().join(",") !== "afterContent,expectedUpdatedAt,sourceAnchorId,sourceContentHash,sourceInputVersion,targetContent,targetContentHash,targetExternalId,targetInputVersion,targetObjectId,traceId"
    || !valid(record.sourceAnchorId, 512) || !valid(record.sourceInputVersion, 128) || !validHash(record.sourceContentHash)
    || !valid(record.targetObjectId, 128) || !valid(record.targetExternalId, 512) || !valid(record.targetInputVersion, 128)
    || !validHash(record.targetContentHash) || !valid(record.targetContent, 8_192) || checksum(record.targetContent) !== record.targetContentHash
    || !valid(record.afterContent, 8_192) || checksum(record.afterContent) === record.targetContentHash
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.traceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.traceId)) {
    throw serviceError("V2_CANDIDATE_UPDATE_REQUEST_INVALID", "Candidate update 需要来源、目标对象、目标 Anchor、最终正文和审阅版本证据。");
  }
  return {
    sourceAnchorId: String(record.sourceAnchorId).trim(), sourceInputVersion: String(record.sourceInputVersion).trim(), sourceContentHash: String(record.sourceContentHash),
    targetObjectId: String(record.targetObjectId).trim(), targetExternalId: String(record.targetExternalId).trim(), targetInputVersion: String(record.targetInputVersion).trim(), targetContentHash: String(record.targetContentHash), targetContent: String(record.targetContent),
    afterContent: String(record.afterContent), expectedUpdatedAt: String(record.expectedUpdatedAt), traceId: String(record.traceId),
  };
}

async function readBackupId(request: IncomingMessage): Promise<string> {
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw serviceError("BACKUP_ID_INVALID", "Backup ID 无效。");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.backupId !== "string" || !backupIdPattern.test(record.backupId)) {
    throw serviceError("BACKUP_ID_INVALID", "Backup ID 无效。");
  }
  return record.backupId;
}

async function readRestoreRequest(request: IncomingMessage): Promise<{ backupId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).length !== 2 ||
    typeof record.backupId !== "string" ||
    !backupIdPattern.test(record.backupId) ||
    record.confirmation !== "RESTORE_AND_STOP_SERVICE"
  ) {
    throw serviceError("RESTORE_CONFIRMATION_REQUIRED", "Restore 必须引用服务端 Backup ID 并显式确认停止 Service。");
  }
  return { backupId: record.backupId };
}

interface MaterializeRequest {
  objectType: MaterializeExplicitObjectInput["objectType"];
  text: string;
  marker?: "TODO" | "NOW" | "DOING" | "DONE" | "CANCELED" | "CANCELLED" | "WAITING";
  externalId: string;
  inputVersion: string;
  contentHash: string;
  idempotencyKey: string;
  traceId: string;
}

interface PrepareProjectRequest {
  name: string;
  traceId: string;
}

interface FinalizeProjectRequest extends PrepareProjectRequest {
  semanticCommitId: string;
  objectId: string;
  pageExternalId: string;
  pageContentHash: string;
}

interface PrepareProposalProjectCreationRequest {
  confirmation: "CREATE_PROJECT";
  expectedUpdatedAt: string;
  traceId: string;
}

interface FinalizeProposalProjectCreationRequest {
  expectedUpdatedAt: string;
  semanticCommitId: string;
  objectId: string;
  pageExternalId: string;
  pageContentHash: string;
  traceId: string;
}

interface CompensateProposalProjectCreationRequest {
  expectedUpdatedAt: string;
  semanticCommitId: string;
  pageExternalId: string;
  pageContentHash: string;
  pageExists: boolean;
  traceId: string;
}

type PrepareProposalProjectCreationUndoRequest =
  | { traceId: string }
  | { traceId: string; confirmedOwnedEmpty: true; pageExternalId: string };

interface FinalizeProposalProjectCreationUndoRequest {
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  pageExternalId: string;
  pageExists: boolean;
  traceId: string;
}

async function readFocusRequest(request: IncomingMessage, remove: boolean): Promise<{ expectedVersion: number; rank?: number }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const expectedKeys = remove ? "expectedVersion" : "expectedVersion,rank";
  if (Object.keys(record).sort().join(",") !== expectedKeys || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || (!remove && (!Number.isSafeInteger(record.rank) || Number(record.rank) < 0 || Number(record.rank) > 10_000))) throw serviceError("FOCUS_REQUEST_INVALID", "Focus 请求必须包含对象版本和合法排序位置。");
  return { expectedVersion: Number(record.expectedVersion), ...(!remove ? { rank: Number(record.rank) } : {}) };
}

async function readAreaRequest(request: IncomingMessage, edit: false): Promise<{ text: string; traceId: string }>;
async function readAreaRequest(request: IncomingMessage, edit: true): Promise<{ text: string; expectedVersion: number; traceId: string }>;
async function readAreaRequest(request: IncomingMessage, edit: boolean): Promise<{ text: string; expectedVersion?: number; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Area 请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const expectedKeys = edit ? ["expectedVersion", "text", "traceId"] : ["text", "traceId"];
  const actualKeys = Object.keys(record).sort();
  if (
    actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    typeof record.text !== "string" || !record.text.trim() || record.text.length > 4_000 ||
    typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256 ||
    (edit && (!Number.isSafeInteger(record.expectedVersion) || (record.expectedVersion as number) < 1))
  ) {
    throw serviceError("AREA_REQUEST_INVALID", "Area 请求必须包含有界责任描述、trace_id，编辑时还必须包含对象版本。");
  }
  return record as { text: string; expectedVersion?: number; traceId: string };
}

async function readFocusReorderRequest(request: IncomingMessage): Promise<{ expectedObjectIds: string[]; objectIds: string[] }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const validIds = (candidate: unknown): candidate is string[] => Array.isArray(candidate) && candidate.length <= 64 && candidate.every((id) => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id));
  if (Object.keys(record).sort().join(",") !== "expectedObjectIds,objectIds" || !validIds(record.expectedObjectIds) || !validIds(record.objectIds)) throw serviceError("FOCUS_REORDER_REQUEST_INVALID", "Focus 排序请求无效。");
  return { expectedObjectIds: record.expectedObjectIds, objectIds: record.objectIds };
}

async function readConditionRequest(request: IncomingMessage): Promise<{ expectedVersion: number; condition: V2Condition }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const condition = record.condition && typeof record.condition === "object" && !Array.isArray(record.condition) ? record.condition as Record<string, unknown> : {};
  const keys = Object.keys(condition).sort().join(",");
  const shapeValid = condition.kind === "ACTIONABLE" ? keys === "kind"
    : condition.kind === "WAITING" ? keys === "expectedResult,kind,reviewAt,waitingFor" && [condition.waitingFor, condition.expectedResult, condition.reviewAt].every((field) => typeof field === "string")
    : condition.kind === "BLOCKED" ? (keys === "kind,reason" || keys === "blockerObjectId,kind,reason") && typeof condition.reason === "string" && (condition.blockerObjectId === undefined || typeof condition.blockerObjectId === "string")
    : condition.kind === "PAUSED" ? (keys === "kind,reason" || keys === "kind,reason,reviewAt") && typeof condition.reason === "string" && (condition.reviewAt === undefined || typeof condition.reviewAt === "string")
    : false;
  if (Object.keys(record).sort().join(",") !== "condition,expectedVersion" || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || !shapeValid) throw serviceError("CONDITION_REQUEST_INVALID", "Condition 请求必须包含对象版本和封闭的 Condition 字段。");
  return { expectedVersion: Number(record.expectedVersion), condition: condition as unknown as V2Condition };
}

interface ConditionUndoRequest {
  conditionChangeId: string;
  expectedVersion: number;
  confirmation: "UNDO_CONDITION";
  traceId: string;
}

async function readConditionUndoRequest(request: IncomingMessage): Promise<ConditionUndoRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).sort().join(",") !== "conditionChangeId,confirmation,expectedVersion,traceId"
    || typeof record.conditionChangeId !== "string" || !/^[0-9a-f]{64}$/.test(record.conditionChangeId)
    || record.confirmation !== "UNDO_CONDITION"
    || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) {
    throw serviceError("CONDITION_UNDO_REQUEST_INVALID", "Condition Undo 必须引用受控变化、当前对象版本和精确确认。");
  }
  return record as unknown as ConditionUndoRequest;
}

function conditionChangeId(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

async function readDeadlineRequest(request: IncomingMessage): Promise<{ expectedVersion: number; dueAt?: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "dueAt,expectedVersion" || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || (record.dueAt !== null && typeof record.dueAt !== "string")) throw serviceError("DEADLINE_REQUEST_INVALID", "期限请求必须包含对象版本和时间或 null。");
  return { expectedVersion: Number(record.expectedVersion), ...(typeof record.dueAt === "string" ? { dueAt: record.dueAt } : {}) };
}

async function readMiniProjectClosureProposalRequest(request: IncomingMessage): Promise<{ expectedVersion: number }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).join(",") !== "expectedVersion" || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1) {
    throw serviceError("MINI_PROJECT_CLOSURE_PROPOSAL_REQUEST_INVALID", "MiniProject Closure Proposal 请求必须只引用对象版本。");
  }
  return { expectedVersion: Number(record.expectedVersion) };
}

async function readProjectClosureEvidenceRequest(request: IncomingMessage): Promise<{ expectedVersion: number }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).join(",") !== "expectedVersion" || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1) {
    throw serviceError("PROJECT_CLOSURE_EVIDENCE_REQUEST_INVALID", "Project Closure evidence 请求必须只引用当前对象版本。");
  }
  return { expectedVersion: Number(record.expectedVersion) };
}

async function readProjectClosureProposalRequest(request: IncomingMessage): Promise<{
  expectedVersion: number;
  userJudgments?: ProjectClosureUserJudgments;
}> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const keys = Object.keys(record).sort().join(",");
  if (!["expectedVersion", "expectedVersion,userJudgments"].includes(keys)
    || !Number.isSafeInteger(record.expectedVersion)
    || Number(record.expectedVersion) < 1
    || (record.userJudgments !== undefined && (!record.userJudgments || typeof record.userJudgments !== "object" || Array.isArray(record.userJudgments)))) {
    throw serviceError("PROJECT_CLOSURE_PROPOSAL_REQUEST_INVALID", "Project Closure Proposal 只接受对象版本与有界用户判断。");
  }
  return {
    expectedVersion: Number(record.expectedVersion),
    ...(record.userJudgments ? { userJudgments: record.userJudgments as ProjectClosureUserJudgments } : {}),
  };
}

async function readReasonedLifecycleProposalRequest(request: IncomingMessage): Promise<{ expectedVersion: number; action: "CANCEL" | "REOPEN" | "ARCHIVE"; reason: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (Object.keys(record).sort().join(",") !== "action,expectedVersion,reason" || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || (record.action !== "CANCEL" && record.action !== "REOPEN" && record.action !== "ARCHIVE") || !reason || reason.length > 4_000) throw serviceError("LIFECYCLE_PROPOSAL_REQUEST_INVALID", "Lifecycle Proposal 必须包含对象版本、取消/重开/归档动作和有界原因。");
  return { expectedVersion: Number(record.expectedVersion), action: record.action, reason };
}

async function readMiniProjectClosureDraftRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; draft: V2MiniProjectClosure }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const draft = record.draft && typeof record.draft === "object" && !Array.isArray(record.draft) ? record.draft as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "draft,expectedUpdatedAt"
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || Object.keys(draft).sort().join(",") !== "actualResult,originalGoal,remainingWork"
    || !Object.values(draft).every((item) => typeof item === "string" && item.length <= 4_000)) {
    throw serviceError("MINI_PROJECT_CLOSURE_DRAFT_REQUEST_INVALID", "Agent 三问草稿请求必须包含有界的当前表单和 Proposal 版本。");
  }
  return {
    expectedUpdatedAt: record.expectedUpdatedAt,
    draft: { originalGoal: String(draft.originalGoal).trim(), actualResult: String(draft.actualResult).trim(), remainingWork: String(draft.remainingWork).trim() },
  };
}

function normalizedProjectName(value: string): string {
  return value.trim().replace(/^Project\//i, "").trim();
}

async function readProjectRequest(request: IncomingMessage, finalize: false): Promise<PrepareProjectRequest>;
async function readProjectRequest(request: IncomingMessage, finalize: true): Promise<FinalizeProjectRequest>;
async function readProjectRequest(request: IncomingMessage, finalize: boolean): Promise<PrepareProjectRequest | FinalizeProjectRequest> {
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const exactKeys = finalize
    ? ["name", "objectId", "pageContentHash", "pageExternalId", "semanticCommitId", "traceId"]
    : ["name", "traceId"];
  const actualKeys = Object.keys(record).sort();
  const name = typeof record.name === "string" ? normalizedProjectName(record.name) : "";
  const valid = actualKeys.length === exactKeys.length && actualKeys.every((key, index) => key === exactKeys[index])
    && name.length > 0 && name.length <= 200 && !/[\n\r]/.test(name) && !name.includes("/")
    && typeof record.traceId === "string" && record.traceId.trim().length > 0 && record.traceId.length <= 256
    && (!finalize || (
      typeof record.semanticCommitId === "string" && record.semanticCommitId.length <= 128 && record.semanticCommitId.startsWith("project-create:")
      && typeof record.objectId === "string" && /^obj_[0-9]{17}_[0-9a-f]{32}$/.test(record.objectId)
      && typeof record.pageExternalId === "string" && record.pageExternalId.trim().length > 0 && record.pageExternalId.length <= 512
      && typeof record.pageContentHash === "string" && /^[0-9a-f]{8}$/.test(record.pageContentHash)
    ));
  if (!valid) throw serviceError("PROJECT_CREATION_REQUEST_INVALID", "Project 创建请求无效或包含未授权字段。");
  return { ...record, name } as unknown as PrepareProjectRequest | FinalizeProjectRequest;
}

async function readProposalProjectCreationPrepareRequest(request: IncomingMessage): Promise<PrepareProposalProjectCreationRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project 创建准备请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,traceId"
    || record.confirmation !== "CREATE_PROJECT"
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) throw serviceError("V2_PROJECT_CREATION_COMMIT_REQUEST_INVALID", "Project 创建需要当前 Proposal 版本、trace_id 和精确高影响确认。");
  return record as unknown as PrepareProposalProjectCreationRequest;
}

async function readProposalProjectCreationFinalizeRequest(request: IncomingMessage): Promise<FinalizeProposalProjectCreationRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project 创建收口请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).sort().join(",") !== "expectedUpdatedAt,objectId,pageContentHash,pageExternalId,semanticCommitId,traceId"
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.semanticCommitId !== "string" || !record.semanticCommitId.startsWith("proposal-commit:") || record.semanticCommitId.length > 96
    || typeof record.objectId !== "string" || !/^obj_[0-9]{17}_[0-9a-f]{32}$/.test(record.objectId)
    || typeof record.pageExternalId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.pageExternalId)
    || typeof record.pageContentHash !== "string" || !/^[0-9a-f]{8}$/.test(record.pageContentHash)
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) throw serviceError("V2_PROJECT_CREATION_COMMIT_REQUEST_INVALID", "Project 创建收口证据无效或包含未授权字段。");
  return record as unknown as FinalizeProposalProjectCreationRequest;
}

async function readProposalProjectCreationCompensateRequest(request: IncomingMessage): Promise<CompensateProposalProjectCreationRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project 创建补偿请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).sort().join(",") !== "expectedUpdatedAt,pageContentHash,pageExists,pageExternalId,semanticCommitId,traceId"
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.semanticCommitId !== "string" || !record.semanticCommitId.startsWith("proposal-commit:") || record.semanticCommitId.length > 96
    || typeof record.pageExternalId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.pageExternalId)
    || typeof record.pageContentHash !== "string" || !/^[0-9a-f]{8}$/.test(record.pageContentHash)
    || typeof record.pageExists !== "boolean"
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) throw serviceError("V2_PROJECT_CREATION_COMPENSATION_REQUEST_INVALID", "Project 创建补偿证据无效或包含未授权字段。");
  return record as unknown as CompensateProposalProjectCreationRequest;
}

async function readProposalProjectCreationUndoPrepareRequest(request: IncomingMessage): Promise<PrepareProposalProjectCreationUndoRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project 创建 Undo 准备请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const keys = Object.keys(record).sort().join(",");
  if (
    !["traceId", "confirmedOwnedEmpty,pageExternalId,traceId"].includes(keys)
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
    || (keys !== "traceId" && (record.confirmedOwnedEmpty !== true || typeof record.pageExternalId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.pageExternalId)))
  ) {
    throw serviceError("V2_PROJECT_CREATION_UNDO_REQUEST_INVALID", "Project 创建 Undo 必须包含有界 trace_id，删除专用 Page 前还需精确空 Page 确认。");
  }
  return record as unknown as PrepareProposalProjectCreationUndoRequest;
}

async function readProposalProjectCreationUndoFinalizeRequest(request: IncomingMessage): Promise<FinalizeProposalProjectCreationUndoRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "Project 创建 Undo 收口请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).sort().join(",") !== "originalSemanticCommitId,pageExists,pageExternalId,traceId,undoSemanticCommitId"
    || typeof record.originalSemanticCommitId !== "string" || !record.originalSemanticCommitId.startsWith("proposal-commit:") || record.originalSemanticCommitId.length > 96
    || typeof record.undoSemanticCommitId !== "string" || !record.undoSemanticCommitId.startsWith("project-creation-undo:proposal-commit:") || record.undoSemanticCommitId.length > 128
    || typeof record.pageExternalId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.pageExternalId)
    || typeof record.pageExists !== "boolean"
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) throw serviceError("V2_PROJECT_CREATION_UNDO_REQUEST_INVALID", "Project 创建 Undo 收口证据无效或包含未授权字段。");
  return record as unknown as FinalizeProposalProjectCreationUndoRequest;
}

async function readProposalReviewRequest(request: IncomingMessage): Promise<{ decisions: Record<string, V2ProposalGroupDecision>; expectedUpdatedAt: string; miniProjectClosure?: V2MiniProjectClosure }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const decisions = record.decisions && typeof record.decisions === "object" && !Array.isArray(record.decisions) ? record.decisions as Record<string, unknown> : undefined;
  const keys = Object.keys(record).sort().join(",");
  if (!["decisions,expectedUpdatedAt", "decisions,expectedUpdatedAt,miniProjectClosure"].includes(keys) || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || !decisions || Object.keys(decisions).length > 64) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 审阅请求无效。");
  for (const [groupId, rawDecision] of Object.entries(decisions)) {
    const decision = rawDecision && typeof rawDecision === "object" && !Array.isArray(rawDecision) ? rawDecision as Record<string, unknown> : {};
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(groupId) || !["ACCEPTED", "REJECTED", "DEFERRED"].includes(String(decision.disposition))) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 审阅决定无效。");
    if (decision.disposition === "ACCEPTED" && (Object.keys(decision).some((key) => !["disposition", "highImpactConfirmed"].includes(key)) || (decision.highImpactConfirmed !== undefined && typeof decision.highImpactConfirmed !== "boolean"))) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 接受决定包含未知字段。");
    if (decision.disposition === "REJECTED" && Object.keys(decision).length !== 1) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 拒绝决定包含未知字段。");
    if (decision.disposition === "DEFERRED" && (Object.keys(decision).sort().join(",") !== "deferredUntil,disposition,reason" || typeof decision.deferredUntil !== "string" || typeof decision.reason !== "string")) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 暂缓决定无效。");
  }
  let miniProjectClosure: V2MiniProjectClosure | undefined;
  if (record.miniProjectClosure !== undefined) {
    const closure = record.miniProjectClosure && typeof record.miniProjectClosure === "object" && !Array.isArray(record.miniProjectClosure) ? record.miniProjectClosure as Record<string, unknown> : {};
    if (Object.keys(closure).sort().join(",") !== "actualResult,originalGoal,remainingWork" || !Object.values(closure).every((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 4000)) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "MiniProject Closure 三问必须完整且有界。");
    miniProjectClosure = closure as unknown as V2MiniProjectClosure;
  }
  return { decisions: decisions as Record<string, V2ProposalGroupDecision>, expectedUpdatedAt: record.expectedUpdatedAt, ...(miniProjectClosure ? { miniProjectClosure } : {}) };
}

function parseProposalGraphObservations(value: unknown, errorCode: string, message: string): V2ProposalScopeObservation[] {
  if (!Array.isArray(value) || value.length > 256) throw serviceError(errorCode, message);
  return value.map((candidate): V2ProposalScopeObservation => {
    const observation = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
    const allowedKeys = ["exists", "hash", "id", "kind", "version"];
    if (
      Object.keys(observation).some((key) => !allowedKeys.includes(key))
      || !["BLOCK", "PAGE"].includes(String(observation.kind)) || typeof observation.id !== "string" || !observation.id.trim() || observation.id.length > 512
      || typeof observation.exists !== "boolean"
      || (observation.version !== undefined && (!Number.isSafeInteger(observation.version) || Number(observation.version) < 0))
      || (observation.hash !== undefined && (typeof observation.hash !== "string" || !/^[0-9a-f]{8}$/.test(observation.hash)))
    ) throw serviceError(errorCode, message);
    return observation as unknown as V2ProposalScopeObservation;
  });
}

async function readProposalRevalidationRequest(request: IncomingMessage): Promise<{ observations: V2ProposalScopeObservation[]; expectedUpdatedAt: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "expectedUpdatedAt,observations" || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))) {
    throw serviceError("PROPOSAL_REVALIDATION_REQUEST_INVALID", "Proposal 重验请求无效。");
  }
  const observations = parseProposalGraphObservations(record.observations, "PROPOSAL_REVALIDATION_REQUEST_INVALID", "Proposal 重验证据无效。");
  return { observations, expectedUpdatedAt: record.expectedUpdatedAt };
}

async function readProjectClosureCommitRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; confirmation: "COMPLETE_PROJECT_WITH_CLOSURE"; observations: V2ProposalScopeObservation[]; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (
    Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,observations,traceId"
    || record.confirmation !== "COMPLETE_PROJECT_WITH_CLOSURE"
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) throw serviceError("PROJECT_CLOSURE_COMMIT_REQUEST_INVALID", "Project Closure 必须有当前 Proposal 版本、trace_id 和精确高影响确认。");
  const observations = parseProposalGraphObservations(record.observations, "PROJECT_CLOSURE_COMMIT_REQUEST_INVALID", "Project Closure 重验证据无效。");
  return { expectedUpdatedAt: record.expectedUpdatedAt, confirmation: record.confirmation, observations, traceId: record.traceId } as { expectedUpdatedAt: string; confirmation: "COMPLETE_PROJECT_WITH_CLOSURE"; observations: V2ProposalScopeObservation[]; traceId: string };
}

async function readProjectStructureCommitRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; confirmation: "UPDATE_PROJECT_INTERFACE"; observations: V2ProposalScopeObservation[]; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,observations,traceId" || record.confirmation !== "UPDATE_PROJECT_INTERFACE" || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("PROJECT_STRUCTURE_COMMIT_REQUEST_INVALID", "Project 当前接口 Commit 必须有当前 Proposal 版本、trace_id 和精确高影响确认。");
  return { expectedUpdatedAt: record.expectedUpdatedAt, confirmation: "UPDATE_PROJECT_INTERFACE", observations: parseProposalGraphObservations(record.observations, "PROJECT_STRUCTURE_COMMIT_REQUEST_INVALID", "Project 当前接口重验证据无效。"), traceId: record.traceId };
}

async function readMiniProjectRestructurePrepareRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE"; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject 原位重构准备请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,traceId" || record.confirmation !== "APPLY_MINI_PROJECT_RESTRUCTURE" || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("MINI_PROJECT_RESTRUCTURE_PREPARE_REQUEST_INVALID", "MiniProject 原位重构需要当前 Proposal 版本、trace_id 和精确高影响确认。");
  return { expectedUpdatedAt: record.expectedUpdatedAt, confirmation: "APPLY_MINI_PROJECT_RESTRUCTURE", traceId: record.traceId };
}

async function readMiniProjectRestructureVerifyRequest(request: IncomingMessage): Promise<{ semanticCommitId: string; expectedUpdatedAt: string; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject 原位重构核验请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "expectedUpdatedAt,semanticCommitId,traceId" || typeof record.semanticCommitId !== "string" || !record.semanticCommitId.startsWith("proposal-commit:") || record.semanticCommitId.length > 96 || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("MINI_PROJECT_RESTRUCTURE_VERIFY_REQUEST_INVALID", "MiniProject 原位重构核验请求缺少匹配账本、Proposal 版本或 trace_id。");
  return record as unknown as { semanticCommitId: string; expectedUpdatedAt: string; traceId: string };
}

async function readMiniProjectRestructureRecoveryRequest(request: IncomingMessage): Promise<{ semanticCommitId: string; expectedUpdatedAt: string; failedStepIndex: number; failureCode: "GRAPH_WRITE_FAILED" | "GRAPH_VERIFY_FAILED" | "DESKTOP_DISCONNECTED"; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject 原位重构恢复请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "expectedUpdatedAt,failedStepIndex,failureCode,semanticCommitId,traceId" || typeof record.semanticCommitId !== "string" || !record.semanticCommitId.startsWith("proposal-commit:") || record.semanticCommitId.length > 96 || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || !Number.isSafeInteger(record.failedStepIndex) || Number(record.failedStepIndex) < 0 || Number(record.failedStepIndex) > 63 || !["GRAPH_WRITE_FAILED", "GRAPH_VERIFY_FAILED", "DESKTOP_DISCONNECTED"].includes(String(record.failureCode)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("MINI_PROJECT_RESTRUCTURE_RECOVERY_REQUEST_INVALID", "MiniProject 原位重构恢复请求缺少受控故障、账本或 step 证据。");
  return record as unknown as { semanticCommitId: string; expectedUpdatedAt: string; failedStepIndex: number; failureCode: "GRAPH_WRITE_FAILED" | "GRAPH_VERIFY_FAILED" | "DESKTOP_DISCONNECTED"; traceId: string };
}

async function readMiniProjectRestructureUndoPrepareRequest(request: IncomingMessage): Promise<{ traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject 原位重构 Undo 准备请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,traceId" || record.confirmation !== "UNDO_MINI_PROJECT_RESTRUCTURE" || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("MINI_PROJECT_RESTRUCTURE_UNDO_PREPARE_REQUEST_INVALID", "MiniProject 原位重构 Undo 需要 trace_id 和精确高影响确认。");
  return { traceId: record.traceId };
}

async function readMiniProjectRestructureUndoVerifyRequest(request: IncomingMessage): Promise<{ undoSemanticCommitId: string; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject 原位重构 Undo 核验请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "traceId,undoSemanticCommitId" || typeof record.undoSemanticCommitId !== "string" || !record.undoSemanticCommitId.startsWith("mini-project-restructure-undo:proposal-commit:") || record.undoSemanticCommitId.length > 160 || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("MINI_PROJECT_RESTRUCTURE_UNDO_VERIFY_REQUEST_INVALID", "MiniProject 原位重构 Undo 核验请求缺少匹配账本或 trace_id。");
  return record as unknown as { undoSemanticCommitId: string; traceId: string };
}

async function readMiniProjectRestructureUndoRecoveryRequest(request: IncomingMessage): Promise<{ undoSemanticCommitId: string; failedStepIndex: number; failureCode: "GRAPH_WRITE_FAILED" | "GRAPH_VERIFY_FAILED" | "DESKTOP_DISCONNECTED"; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "MiniProject 原位重构 Undo 恢复请求必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "failedStepIndex,failureCode,traceId,undoSemanticCommitId" || typeof record.undoSemanticCommitId !== "string" || !record.undoSemanticCommitId.startsWith("mini-project-restructure-undo:proposal-commit:") || record.undoSemanticCommitId.length > 160 || !Number.isSafeInteger(record.failedStepIndex) || Number(record.failedStepIndex) < 0 || Number(record.failedStepIndex) > 63 || !["GRAPH_WRITE_FAILED", "GRAPH_VERIFY_FAILED", "DESKTOP_DISCONNECTED"].includes(String(record.failureCode)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_REQUEST_INVALID", "MiniProject 原位重构 Undo 恢复请求缺少受控故障、账本或 step 证据。");
  return record as unknown as { undoSemanticCommitId: string; failedStepIndex: number; failureCode: "GRAPH_WRITE_FAILED" | "GRAPH_VERIFY_FAILED" | "DESKTOP_DISCONNECTED"; traceId: string };
}

async function readLifecycleCommitRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; confirmation: "COMPLETE_MINI_PROJECT" | "CANCEL_OBJECT" | "REOPEN_OBJECT" | "ARCHIVE_OBJECT"; observations: V2ProposalScopeObservation[]; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,observations,traceId" || !["COMPLETE_MINI_PROJECT", "CANCEL_OBJECT", "REOPEN_OBJECT", "ARCHIVE_OBJECT"].includes(String(record.confirmation)) || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("LIFECYCLE_COMMIT_REQUEST_INVALID", "Lifecycle Commit 必须有当前 Proposal 版本、trace_id 和精确动作确认。");
  return { expectedUpdatedAt: record.expectedUpdatedAt, confirmation: record.confirmation as "COMPLETE_MINI_PROJECT" | "CANCEL_OBJECT" | "REOPEN_OBJECT" | "ARCHIVE_OBJECT", observations: parseProposalGraphObservations(record.observations, "LIFECYCLE_COMMIT_REQUEST_INVALID", "Lifecycle 重验证据无效。"), traceId: record.traceId };
}

async function readOwnershipCommitRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; observations: V2ProposalScopeObservation[]; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,observations,traceId" || record.confirmation !== "CHANGE_PRIMARY_OWNERSHIP" || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("OWNERSHIP_COMMIT_REQUEST_INVALID", "Primary Ownership Commit 必须有当前 Proposal 版本、trace_id 和精确高影响确认。");
  return { expectedUpdatedAt: record.expectedUpdatedAt, observations: parseProposalGraphObservations(record.observations, "OWNERSHIP_COMMIT_REQUEST_INVALID", "Primary Ownership 重验证据无效。"), traceId: record.traceId };
}

async function readOwnershipUndoRequest(request: IncomingMessage): Promise<{ traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,traceId" || record.confirmation !== "UNDO_PRIMARY_OWNERSHIP" || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) {
    throw serviceError("OWNERSHIP_UNDO_REQUEST_INVALID", "Primary Ownership Undo 必须有 trace_id 和精确高影响确认。");
  }
  return { traceId: record.traceId };
}

async function readLifecycleUndoRequest(request: IncomingMessage): Promise<{ traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,traceId" || record.confirmation !== "UNDO_LIFECYCLE" || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) {
    throw serviceError("LIFECYCLE_UNDO_REQUEST_INVALID", "Lifecycle Undo 必须有 trace_id 和精确确认词。");
  }
  return { traceId: record.traceId };
}

async function readProjectStructureUndoRequest(request: IncomingMessage): Promise<{ traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,traceId" || record.confirmation !== "UNDO_PROJECT_INTERFACE" || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("PROJECT_STRUCTURE_UNDO_REQUEST_INVALID", "Project 当前接口 Undo 必须有 trace_id 和精确确认词。");
  return { traceId: record.traceId };
}

async function readProjectClosureUndoRequest(request: IncomingMessage): Promise<{ traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,traceId" || record.confirmation !== "UNDO_PROJECT_CLOSURE" || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("PROJECT_CLOSURE_UNDO_REQUEST_INVALID", "Project Closure Undo 必须有 trace_id 和精确确认词。");
  return { traceId: record.traceId };
}

interface ProposalCommitEvidenceRequest {
  semanticCommitId: string;
  proposalId: string;
  expectedUpdatedAt: string;
  blockUuid: string;
  contentHash: string;
  inputVersion: string;
  traceId: string;
}

interface ProposalUndoEvidenceRequest {
  originalSemanticCommitId: string;
  undoSemanticCommitId: string;
  blockUuid: string;
  contentHash: string;
  inputVersion: string;
  traceId: string;
}

async function readProposalUndoPrepareRequest(request: IncomingMessage): Promise<{ traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).join(",") !== "traceId" || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("PROPOSAL_UNDO_REQUEST_INVALID", "Proposal Undo 准备请求无效。");
  return { traceId: record.traceId };
}

async function readProposalUndoEvidenceRequest(request: IncomingMessage): Promise<ProposalUndoEvidenceRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const keys = ["blockUuid", "contentHash", "inputVersion", "originalSemanticCommitId", "traceId", "undoSemanticCommitId"];
  if (
    Object.keys(record).sort().join(",") !== keys.join(",")
    || typeof record.originalSemanticCommitId !== "string" || !record.originalSemanticCommitId.startsWith("proposal-commit:") || record.originalSemanticCommitId.length > 96
    || typeof record.undoSemanticCommitId !== "string" || record.undoSemanticCommitId !== `undo:${record.originalSemanticCommitId}`
    || typeof record.blockUuid !== "string" || !record.blockUuid.trim() || record.blockUuid.length > 512
    || typeof record.contentHash !== "string" || !/^[0-9a-f]{8}$/.test(record.contentHash)
    || typeof record.inputVersion !== "string" || !record.inputVersion.trim() || record.inputVersion.length > 128
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) throw serviceError("PROPOSAL_UNDO_REQUEST_INVALID", "Proposal Undo 证据请求无效。");
  return record as unknown as ProposalUndoEvidenceRequest;
}

async function readProposalCommitEvidenceRequest(request: IncomingMessage): Promise<ProposalCommitEvidenceRequest> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const keys = ["blockUuid", "contentHash", "expectedUpdatedAt", "inputVersion", "proposalId", "semanticCommitId", "traceId"];
  if (
    Object.keys(record).sort().join(",") !== keys.join(",")
    || typeof record.semanticCommitId !== "string" || !record.semanticCommitId.startsWith("proposal-commit:") || record.semanticCommitId.length > 96
    || typeof record.proposalId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.proposalId)
    || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt))
    || typeof record.blockUuid !== "string" || !record.blockUuid.trim() || record.blockUuid.length > 512
    || typeof record.contentHash !== "string" || !/^[0-9a-f]{8}$/.test(record.contentHash)
    || typeof record.inputVersion !== "string" || !record.inputVersion.trim() || record.inputVersion.length > 128
    || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) throw serviceError("PROPOSAL_COMMIT_REQUEST_INVALID", "Proposal Commit 证据请求无效。");
  return record as unknown as ProposalCommitEvidenceRequest;
}

function proposalSemanticCommitId(graphId: string, proposalId: string, expectedUpdatedAt: string): string {
  return `proposal-commit:${createHash("sha256").update(JSON.stringify([graphId, proposalId, expectedUpdatedAt])).digest("hex")}`;
}

function proposalUndoSemanticCommitId(originalSemanticCommitId: string): string {
  return `undo:${originalSemanticCommitId}`;
}

function ownershipUndoSemanticCommitId(originalSemanticCommitId: string): string {
  return `ownership-undo:${originalSemanticCommitId}`;
}

function lifecycleUndoSemanticCommitId(originalSemanticCommitId: string): string {
  return `lifecycle-undo:${originalSemanticCommitId}`;
}

function projectStructureUndoSemanticCommitId(originalSemanticCommitId: string): string {
  return `project-structure-undo:${originalSemanticCommitId}`;
}

function projectClosureUndoSemanticCommitId(originalSemanticCommitId: string): string {
  return `project-closure-undo:${originalSemanticCommitId}`;
}

function miniProjectRestructureUndoSemanticCommitId(originalSemanticCommitId: string): string {
  return `mini-project-restructure-undo:${originalSemanticCommitId}`;
}

function projectCreationUndoSemanticCommitId(originalSemanticCommitId: string): string {
  return `project-creation-undo:${originalSemanticCommitId}`;
}

function projectCreationSourceReturnTarget(
  store: V2SqliteStore,
  plan: ReturnType<typeof planAcceptedV2ProjectCreation>,
): ServiceProjectCreationSourceReturnTarget | undefined {
  if (plan.sourceKind === "PAGE" && plan.sourcePageTarget) {
    return { kind: "PAGE", externalId: plan.sourcePageTarget.id };
  }
  if (plan.sourceKind === "MINI_PROJECT" && plan.sourceMiniProjectTarget) {
    const anchor = store.getActivePrimaryAnchorByObject(plan.sourceMiniProjectTarget.id);
    if (anchor?.role === "primary_text" && anchor.status === "active") {
      return { kind: "BLOCK", externalId: anchor.externalId };
    }
  }
  return undefined;
}

function miniProjectRestructureUndoPlan(plan: ReturnType<typeof planAcceptedMiniProjectRestructure>) {
  return planCompletedMiniProjectRestructureUndo(plan);
}

function projectSemanticCommitId(graphId: string, name: string): string {
  return `project-create:${createHash("sha256").update(JSON.stringify([graphId, normalizedProjectName(name).toLocaleLowerCase("zh-CN")])).digest("hex")}`;
}

function controlledProjectPageContentHash(input: { pageName: string; pageExternalId: string; objectId: string; semanticCommitId: string }): string {
  return checksum({
    pageName: input.pageName,
    pageExternalId: input.pageExternalId,
    properties: {
      "task-copilot-owner": "task-copilot-personal-mvp",
      "task-copilot-object-id": input.objectId,
      "task-copilot-semantic-commit-id": input.semanticCommitId,
    },
    emptyAtCreation: true,
  });
}

async function readMaterializeRequest(request: IncomingMessage): Promise<MaterializeRequest> {
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const requiredKeys = ["contentHash", "externalId", "idempotencyKey", "inputVersion", "objectType", "text", "traceId"];
  const actualKeys = Object.keys(record).sort();
  const objectTypes = ["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"];
  if (
    actualKeys.some((key) => ![...requiredKeys, "marker"].includes(key)) ||
    requiredKeys.some((key) => !actualKeys.includes(key)) ||
    typeof record.objectType !== "string" ||
    !objectTypes.includes(record.objectType) ||
    typeof record.text !== "string" || !record.text.trim() || record.text.length > 8_192 ||
    (record.marker !== undefined && (typeof record.marker !== "string" || !["TODO", "NOW", "DOING", "DONE", "CANCELED", "CANCELLED", "WAITING"].includes(record.marker))) ||
    typeof record.externalId !== "string" || !record.externalId.trim() || record.externalId.length > 512 ||
    typeof record.inputVersion !== "string" || !record.inputVersion.trim() || record.inputVersion.length > 128 ||
    typeof record.contentHash !== "string" || !/^[0-9a-f]{8}$/.test(record.contentHash) ||
    typeof record.idempotencyKey !== "string" || !record.idempotencyKey.trim() || record.idempotencyKey.length > 512 ||
    typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) {
    throw serviceError("MATERIALIZATION_REQUEST_INVALID", "显式对象物化请求字段无效或包含服务端所有权字段。");
  }
  return record as unknown as MaterializeRequest;
}

interface PrimaryAnchorObservationRequest {
  anchorId: string;
  status: "active" | "missing" | "conflict";
  traceId: string;
}

interface PrimaryAnchorRebindRequest extends Omit<MaterializeRequest, "idempotencyKey"> {
  previousAnchorId: string;
  previewObjectVersion: number;
  previewAnchorStatus: "active" | "missing" | "conflict";
  previewAnchorContentHash: string;
  confirmation: "REBIND_PRIMARY_ANCHOR";
}

async function readPrimaryAnchorObservationRequest(request: IncomingMessage): Promise<PrimaryAnchorObservationRequest> {
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const exactKeys = ["anchorId", "status", "traceId"];
  const actualKeys = Object.keys(record).sort();
  if (
    actualKeys.length !== exactKeys.length || actualKeys.some((key, index) => key !== exactKeys[index]) ||
    typeof record.anchorId !== "string" || !record.anchorId.trim() || record.anchorId.length > 512 ||
    typeof record.status !== "string" || !["active", "missing", "conflict"].includes(record.status) ||
    typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) {
    throw serviceError("PRIMARY_ANCHOR_OBSERVATION_INVALID", "Primary Anchor 观察请求无效或包含服务端所有权字段。");
  }
  return record as unknown as PrimaryAnchorObservationRequest;
}

async function readPrimaryAnchorRebindRequest(request: IncomingMessage): Promise<PrimaryAnchorRebindRequest> {
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const exactKeys = ["confirmation", "contentHash", "externalId", "inputVersion", "objectType", "previewAnchorContentHash", "previewAnchorStatus", "previewObjectVersion", "previousAnchorId", "text", "traceId"];
  const actualKeys = Object.keys(record).sort();
  const objectTypes = ["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"];
  if (
    actualKeys.length !== exactKeys.length || actualKeys.some((key, index) => key !== exactKeys[index]) ||
    record.confirmation !== "REBIND_PRIMARY_ANCHOR" ||
    typeof record.previousAnchorId !== "string" || !record.previousAnchorId.trim() || record.previousAnchorId.length > 512 ||
    !Number.isSafeInteger(record.previewObjectVersion) || (record.previewObjectVersion as number) < 0 ||
    typeof record.previewAnchorStatus !== "string" || !["active", "missing", "conflict"].includes(record.previewAnchorStatus) ||
    typeof record.previewAnchorContentHash !== "string" || !/^[0-9a-f]{8}$/.test(record.previewAnchorContentHash) ||
    typeof record.objectType !== "string" || !objectTypes.includes(record.objectType) ||
    typeof record.text !== "string" || !record.text.trim() || record.text.length > 8_192 ||
    typeof record.externalId !== "string" || !record.externalId.trim() || record.externalId.length > 512 ||
    typeof record.inputVersion !== "string" || !record.inputVersion.trim() || record.inputVersion.length > 128 ||
    typeof record.contentHash !== "string" || !/^[0-9a-f]{8}$/.test(record.contentHash) ||
    typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256
  ) {
    throw serviceError("PRIMARY_ANCHOR_REBIND_INVALID", "Primary Anchor 重新绑定请求无效、未确认或包含服务端所有权字段。");
  }
  return record as unknown as PrimaryAnchorRebindRequest;
}

function explicitSyncIdempotencyKey(graphId: string, input: MaterializeRequest): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([graphId, input.externalId, input.inputVersion]))
    .digest("hex");
  return `explicit-sync:${digest}`;
}

function primaryAnchorObservationIdempotencyKey(graphId: string, input: PrimaryAnchorObservationRequest, expectedVersion: number): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([graphId, input.anchorId, input.status, expectedVersion]))
    .digest("hex");
  return `anchor-observation:${digest}`;
}

function primaryAnchorRebindIdempotencyKey(graphId: string, input: PrimaryAnchorRebindRequest): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([graphId, input.previousAnchorId, input.externalId, input.inputVersion]))
    .digest("hex");
  return `anchor-rebind:${digest}`;
}

function respondError(response: ServerResponse, error: unknown): void {
  if (error instanceof StructuredError) {
    const graphStatus = ["GRAPH_READ_REQUEST_INVALID", "GRAPH_READ_RESULT_INVALID", "GRAPH_READ_RESULT_MISMATCH"].includes(error.code) ? 400
      : ["GRAPH_READ_NOT_FOUND", "GRAPH_READ_REQUEST_NOT_FOUND"].includes(error.code) ? 404
      : error.code === "GRAPH_READ_BRIDGE_BUSY" ? 429
      : ["GRAPH_READ_BRIDGE_UNAVAILABLE", "GRAPH_READ_BRIDGE_CLOSED"].includes(error.code) ? 503
      : error.code === "GRAPH_READ_TIMEOUT" ? 504
      : error.code.startsWith("GRAPH_READ_") ? 502
      : undefined;
    if (graphStatus !== undefined) {
      respond(response, graphStatus, { error: { code: error.code, message: error.message } });
      return;
    }
    const grillSourceStatus = ["GRILL_SOURCE_STALE", "PROJECT_CREATION_PREVIEW_NOT_READY", "PROJECT_CREATION_PREVIEW_SESSION_EXPIRED", "PROJECT_CREATION_RELATIONSHIP_REVIEW_REQUIRED"].includes(error.code) ? 409
      : error.code === "PROJECT_CREATION_SOURCE_TOO_LARGE" ? 413
      : error.code === "PROJECT_CREATION_PREVIEW_PROMPT_TOO_LARGE" ? 413
      : ["PROJECT_CREATION_PREVIEW_PROMPT_LAYER_INVALID", "PROJECT_CREATION_PROPOSAL_REQUEST_INVALID"].includes(error.code) ? 400
      : ["PROJECT_CREATION_SOURCE_EMPTY", "PROJECT_CREATION_SOURCE_UNAVAILABLE", "GRILL_PRIMARY_ANCHOR_REQUIRED"].includes(error.code) ? 422
      : ["PROJECT_CREATION_PREVIEW_VALIDATION_FAILED", "PROJECT_CREATION_PROPOSAL_INVALID"].includes(error.code) ? 422
      : undefined;
    if (grillSourceStatus !== undefined) {
      const validationCategory = error.code === "PROJECT_CREATION_PREVIEW_VALIDATION_FAILED"
        && typeof error.details?.validationCategory === "string"
        ? error.details.validationCategory
        : undefined;
      respond(response, grillSourceStatus, {
        error: {
          code: error.code,
          message: error.message,
          ...(validationCategory ? { validationCategory } : {}),
        },
      });
      return;
    }
    const providerStatus = error.code === "LLM_RATE_LIMITED" ? 429
      : error.code === "LLM_TIMEOUT" ? 504
      : error.code === "UX_OUTPUT_SESSION_SUPPRESSED" ? 409
      : ["UX_OUTPUT_VALIDATION_FAILED", "GRILL_TURN_VALIDATION_FAILED", "GRILL_PREVIEW_VALIDATION_FAILED", "LLM_OUTPUT_TRUNCATED", "LLM_RESPONSE_EMPTY", "LLM_RESPONSE_INVALID_JSON", "LLM_RESPONSE_SHAPE_INVALID", "LLM_RESPONSE_TOO_LARGE"].includes(error.code) ? 422
      : error.code.startsWith("LLM_") ? 502
      : undefined;
    if (providerStatus !== undefined) {
      const validationCategory = ["GRILL_TURN_VALIDATION_FAILED", "UX_OUTPUT_VALIDATION_FAILED"].includes(error.code)
        && typeof error.details?.validationCategory === "string"
        ? error.details.validationCategory
        : undefined;
      respond(response, providerStatus, {
        error: {
          code: error.code,
          message: error.message,
          ...(validationCategory ? { validationCategory } : {}),
        },
      });
      return;
    }
    const projectCreationConflictCodes = ["V2_PROJECT_CREATION_COMMIT_CONFLICT", "V2_PROJECT_CREATION_COMMIT_RECOVERY_REQUIRED", "V2_PROJECT_CREATION_COMMIT_INTENT_MISMATCH", "V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "V2_PROJECT_CREATION_COMMIT_GRAPH_EVIDENCE_MISMATCH", "V2_PROJECT_CREATION_SOURCE_ANCHOR_STALE"];
    const proposalConflictCodes = ["V2_PROPOSAL_REVIEW_STALE", "V2_PROPOSAL_REVALIDATION_STALE", "V2_PROPOSAL_COMMIT_STALE", "V2_PROPOSAL_NOT_ACCEPTED", "V2_PROPOSAL_ID_CONFLICT", "V2_PROPOSAL_COMMIT_IN_PROGRESS", "V2_PROPOSAL_COMMIT_RECOVERY_REQUIRED", "V2_PROPOSAL_COMMIT_INTENT_MISMATCH", "V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "V2_PROPOSAL_COMMIT_GRAPH_EVIDENCE_MISMATCH", "V2_PROPOSAL_COMPENSATION_EVIDENCE_MISMATCH", "V2_PROJECT_CLOSURE_COMMIT_RECOVERY_REQUIRED", "V2_PROJECT_CLOSURE_COMMIT_LEDGER_CORRUPT", "V2_PROJECT_CLOSURE_COMMIT_STALE_RECOVERED", "V2_LIFECYCLE_ACTION_NOT_AVAILABLE", "V2_LIFECYCLE_PROPOSAL_AMBIGUOUS", "V2_LIFECYCLE_COMMIT_RECOVERY_REQUIRED", "V2_LIFECYCLE_COMMIT_LEDGER_CORRUPT", "V2_LIFECYCLE_COMMIT_TARGET_STALE", "V2_LIFECYCLE_COMMIT_OTHER_GROUPS_UNRESOLVED", "V2_LIFECYCLE_UNDO_NOT_AVAILABLE", "V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "V2_LIFECYCLE_UNDO_STATE_CHANGED", "V2_OWNERSHIP_COMMIT_RECOVERY_REQUIRED", "V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "V2_OWNERSHIP_UNDO_NOT_AVAILABLE", "V2_OWNERSHIP_UNDO_LEDGER_CORRUPT", "V2_PRIMARY_OWNER_STALE", "V2_PRIMARY_OWNER_UNDO_STALE", "V2_PRIMARY_OWNER_UNCHANGED", "V2_PRIMARY_OWNERSHIP_NOT_ALLOWED", ...projectCreationConflictCodes];
    const proposalInputError = error.code.startsWith("V2_PROPOSAL_") && error.code !== "V2_PROPOSAL_NOT_FOUND" && !proposalConflictCodes.includes(error.code);
    const domainInputError = ["AREA_REQUEST_INVALID", "V2_AREA_ONLY", "V2_AREA_TEXT_REQUIRED", "V2_ASSOCIATION_REQUEST_INVALID", "V2_ASSOCIATION_SELF_REFERENCE", "V2_CANDIDATE_DISCOVERY_REQUEST_INVALID", "V2_CANDIDATE_DISPOSITION_REQUEST_INVALID", "V2_CANDIDATE_FORMALIZATION_REQUEST_INVALID", "V2_CANDIDATE_UPDATE_REQUEST_INVALID", "V2_CANDIDATE_UPDATE_TARGET_INVALID", "V2_CANDIDATE_UPDATE_TARGET_UNSUPPORTED", "V2_CANDIDATE_COMMAND_INVALID", "V2_CANDIDATE_KIND_INVALID", "V2_CANDIDATE_SOURCE_INVALID", "V2_CANDIDATE_REASON_REQUIRED", "V2_CANDIDATE_SUGGESTION_REQUIRED", "V2_CANDIDATE_DEFERRAL_INVALID", "V2_CANDIDATE_DISPOSITION_REASON_REQUIRED", "MINI_PROJECT_CLOSURE_PROPOSAL_REQUEST_INVALID", "MINI_PROJECT_CLOSURE_DRAFT_REQUEST_INVALID", "OWNERSHIP_COMMIT_REQUEST_INVALID", "OWNERSHIP_UNDO_REQUEST_INVALID", "LIFECYCLE_PROPOSAL_REQUEST_INVALID", "LIFECYCLE_COMMIT_REQUEST_INVALID", "LIFECYCLE_COMMIT_CONFIRMATION_MISMATCH", "LIFECYCLE_UNDO_REQUEST_INVALID", "V2_PROJECT_CREATION_COMMIT_REQUEST_INVALID", "CONDITION_UNDO_REQUEST_INVALID"].includes(error.code) || (error.code.startsWith("V2_OWNERSHIP_COMMIT_") && !proposalConflictCodes.includes(error.code)) || (error.code.startsWith("V2_LIFECYCLE_COMMIT_") && !proposalConflictCodes.includes(error.code)) || (error.code.startsWith("V2_PROJECT_CREATION_COMMIT_") && !projectCreationConflictCodes.includes(error.code));
    const migrationNotFound = ["MIGRATION_RUN_NOT_FOUND", "MIGRATION_BATCH_NOT_FOUND", "MIGRATION_SOURCE_OBJECT_NOT_FOUND"].includes(error.code);
    const migrationInputError = error.code.startsWith("MIGRATION_") && ["INVALID", "REQUIRED", "INCOMPLETE", "MISMATCH", "STRUCTURAL"].some((token) => error.code.includes(token)) && !migrationNotFound;
    const migrationConflict = error.code.startsWith("MIGRATION_") && !migrationInputError && !migrationNotFound;
    const uxInputError = ["AGENT_OBSERVATION_INVALID", "AGENT_FEEDBACK_INVALID", "AGENT_BULK_FEEDBACK_INVALID", "AGENT_FEEDBACK_REQUIRES_USER", "AGENT_EXPORT_RANGE_INVALID"].includes(error.code) || ["UX_CONTEXT_RECOVERY_REQUEST_INVALID", "UX_CONTEXT_PROJECT_REQUIRED", "UX_INTERACTION_DISPOSITION_INVALID", "PROJECT_CREATION_GRILL_REQUEST_INVALID", "PROJECT_CLOSURE_EVIDENCE_REQUEST_INVALID", "PROJECT_CLOSURE_PROPOSAL_REQUEST_INVALID", "PROJECT_CLOSURE_USER_JUDGMENTS_INVALID"].includes(error.code)
      || error.code.startsWith("V2_PROJECT_CLOSURE_EVIDENCE_")
      || error.code.startsWith("PROJECT_CLOSURE_PROVIDER_");
    const status = error.code === "REQUEST_BODY_TOO_LARGE"
      ? 413
      : migrationInputError || proposalInputError || domainInputError || uxInputError || error.code === "PROPOSAL_REVIEW_REQUEST_INVALID" || error.code === "PROPOSAL_REVALIDATION_REQUEST_INVALID" || error.code === "PROPOSAL_COMMIT_REQUEST_INVALID" || error.code === "PROJECT_CLOSURE_COMMIT_REQUEST_INVALID" || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_SHAPE") || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_OPERATION") || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_TARGET") || error.code === "V2_PROJECT_CLOSURE_PAYLOAD_INVALID" || error.code.startsWith("V2_PROJECT_CLOSURE_FIELD_") || error.code === "V2_PROJECT_CLOSURE_LIST_INVALID" || error.code === "CONTEXT_EXPORT_REQUEST_INVALID" || error.code === "CONTEXT_PROJECT_REQUIRED" || error.code === "FOCUS_REQUEST_INVALID" || error.code === "FOCUS_REORDER_REQUEST_INVALID" || error.code === "CONDITION_REQUEST_INVALID" || error.code === "DEADLINE_REQUEST_INVALID" || error.code === "V2_DEADLINE_INVALID" || error.code === "V2_DEADLINE_TASK_ONLY" || ["WAITING_FOR_REQUIRED", "WAITING_RESULT_REQUIRED", "WAITING_REVIEW_REQUIRED", "WAITING_REVIEW_INVALID", "BLOCKED_REASON_REQUIRED", "BLOCKER_OBJECT_ID_INVALID", "BLOCKER_OBJECT_SELF_REFERENCE", "PAUSED_REASON_REQUIRED", "PAUSED_REVIEW_INVALID"].includes(error.code) || error.code === "REQUEST_BODY_NOT_ALLOWED" || error.code === "REQUEST_JSON_INVALID" || error.code === "BACKUP_ID_INVALID" || error.code === "RESTORE_CONFIRMATION_REQUIRED" || error.code === "MATERIALIZATION_REQUEST_INVALID" || error.code === "PROJECT_CREATION_REQUEST_INVALID" || error.code === "PRIMARY_ANCHOR_CURSOR_INVALID" || error.code === "PRIMARY_ANCHOR_OBSERVATION_INVALID" || error.code === "PRIMARY_ANCHOR_REBIND_INVALID" || error.code === "V2_REBIND_CONFIRMATION_REQUIRED" || error.code === "V2_FOCUS_COMMAND_INVALID" || error.code === "V2_FOCUS_ORDER_INVALID" || error.code === "V2_FOCUS_SELECTION_INVALID"
        ? 400
          : migrationNotFound || error.code === "AGENT_DECISION_NOT_FOUND" || error.code === "V2_OBJECT_NOT_FOUND" || error.code === "V2_PRIMARY_ANCHOR_NOT_FOUND" || error.code === "V2_PROPOSAL_NOT_FOUND" || error.code === "V2_MINI_PROJECT_CLOSURE_PROPOSAL_NOT_FOUND" || error.code === "V2_CANDIDATE_NOT_FOUND" || error.code === "V2_BLOCKER_OBJECT_NOT_FOUND" || error.code === "V2_CONDITION_CHANGE_NOT_FOUND" || error.code === "CONTEXT_OBJECT_NOT_FOUND" || error.code === "UX_INTERACTION_NOT_FOUND"
          ? 404
          : error.code === "UX_INTERACTION_SESSION_UNAVAILABLE"
          ? 409
          : error.code === "V2_GRAPH_ID_MISMATCH" || error.code === "V2_UNSUPPORTED_DATABASE_SCHEMA" || error.code === "V2_BACKUP_VALIDATION_FAILED"
          ? 422
          : migrationConflict || ["AGENT_RULE_AUTHORIZATION_STALE", "AGENT_FEEDBACK_DECISION_MISMATCH"].includes(error.code) || error.code === "V2_AREA_CLOSED" || error.code === "V2_ASSOCIATION_EXISTS" || error.code === "V2_CANDIDATE_STALE" || error.code === "V2_CANDIDATE_UPDATE_TARGET_STALE" || error.code === "V2_OBJECT_UPDATE_TARGET_STALE" || error.code === "V2_CANDIDATE_ALREADY_RESOLVED" || error.code === "V2_CANDIDATE_NOT_ACTIONABLE" || error.code === "V2_CANDIDATE_PROPOSAL_EXISTS" || error.code === "V2_CANDIDATE_PROPOSAL_ACTIVE" || error.code === "V2_EXPLICIT_CANDIDATE_REVIEW_REQUIRED" || error.code === "V2_MINI_PROJECT_CLOSURE_NOT_AVAILABLE" || error.code === "V2_MINI_PROJECT_CLOSURE_PROPOSAL_ACTIVE" || error.code === "V2_MINI_PROJECT_CLOSURE_PROPOSAL_AMBIGUOUS" || error.code === "V2_IDEMPOTENCY_KEY_CONFLICT" || error.code === "V2_BACKUP_DESTINATION_EXISTS" || error.code === "V2_EXTERNAL_PRIMARY_ANCHOR_EXISTS" || error.code === "V2_OBJECT_VERSION_CONFLICT" || error.code === "V2_CONDITION_OBJECT_CLOSED" || error.code === "V2_CONDITION_UNDO_ALREADY_APPLIED" || error.code === "V2_CONDITION_UNDO_STALE" || error.code === "V2_BLOCKER_OBJECT_CLOSED" || error.code === "V2_DEADLINE_OBJECT_CLOSED" || error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL" || error.code === "V2_COMPLEX_CLOSURE_REQUIRES_PROPOSAL" || error.code === "V2_PROJECT_CLOSURE_REQUIRED" || error.code === "V2_PROJECT_CLOSURE_PROJECT_ONLY" || error.code === "V2_PROJECT_CLOSURE_NOT_OPEN" || error.code === "V2_MARKER_LIFECYCLE_UNSUPPORTED" || error.code === "V2_MARKER_TERMINAL_CONFLICT" || error.code === "V2_TASK_CANCELLATION_REASON_REQUIRED" || error.code === "V2_PRIMARY_ANCHOR_CONFLICT" || error.code === "V2_REBIND_TARGET_ALREADY_BOUND" || error.code === "V2_REBIND_PREVIEW_STALE" || error.code === "V2_PROJECT_CREATION_INTENT_MISMATCH" || error.code === "V2_PROJECT_CREATION_RECOVERY_REQUIRED" || error.code === "V2_FOCUS_OBJECT_STALE" || error.code === "V2_FOCUS_OBJECT_CLOSED" || error.code === "V2_FOCUS_ORDER_STALE" || proposalConflictCodes.includes(error.code)
            ? 409
            : 500;
    respond(response, status, { error: { code: error.code, message: error.message } });
    return;
  }
  respond(response, 500, { error: { code: "SERVICE_INTERNAL_ERROR", message: "Local Service 请求失败。" } });
}

export async function startLocalService(options: LocalServiceOptions): Promise<LocalServiceHandle> {
  const token = options.token ?? randomBytes(32).toString("base64url");
  if (token.length < 24) throw new Error("Local Service session token must contain at least 24 characters");
  const backupRoot = resolve(options.backupRoot ?? join(dirname(resolve(options.databasePath)), "backups"));
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  await chmod(backupRoot, 0o700);
  await assertRestoreRecoveryInterlockClear(options.databasePath, options.graphId);
  const store = await V2SqliteStore.open(options.databasePath);
  let storeOpen = true;
  let stopping = false;
  let restoreClaimed = false;
  let activeRequestCount = 0;
  const activeRequestDrainWaiters = new Set<() => void>();
  const waitForActiveRequests = async (): Promise<void> => {
    if (activeRequestCount === 0) return;
    await new Promise<void>((resolve) => activeRequestDrainWaiters.add(resolve));
  };
  const leaveActiveRequest = (): void => {
    activeRequestCount -= 1;
    if (activeRequestCount !== 0) return;
    for (const resolve of activeRequestDrainWaiters) resolve();
    activeRequestDrainWaiters.clear();
  };
  store.initialize(options.graphId);
  const application = new V2Application(store);
  const creationSessionApplication = new CreationSessionApplication(store, options.graphId);
  const agentGovernanceApplication = new AgentGovernanceApplication(store);
  const candidateApplication = new V2CandidateApplication(store);
  const migrationApplication = new V2MigrationApplication(store);
  const proposalApplication = new V2ProposalApplication(store);
  const graphReadBroker = new GraphReadBroker();
  const sourceFromSnapshot = (snapshot: ServiceGraphSnapshot, role: CreationSessionSource["role"], reason: CreationSourceCapture["reason"], sourceId = createId("creation"), at = new Date()): CreationSessionSource => {
    if (snapshot.truncated) throw serviceError("CREATION_SESSION_SOURCE_TRUNCATED", "来源超过 Creation Session 的受控读取范围；没有保存不完整快照。");
    const hierarchy = snapshot.blocks.map((block, order) => ({
      nodeId: block.uuid,
      text: stripLogseqBlockIdentityProperty(block.content, block.uuid),
      ...(block.parentUuid ? { parentNodeId: block.parentUuid } : {}),
      order,
      depth: block.depth,
      relation: block.relation,
    }));
    const content = hierarchy.filter(({ relation }) => relation !== "PARENT").map(({ text, depth }) => `${"  ".repeat(Math.min(depth, 32))}${text}`).join("\n");
    if (Buffer.byteLength(content) > 256 * 1024) throw serviceError("CREATION_SESSION_SOURCE_TOO_LARGE", "来源正文超过 Creation Session 快照上限；没有保存截断内容。");
    const captureId = createId("creation", at);
    return {
      sourceId,
      role,
      kind: snapshot.kind === "BLOCK" ? "BLOCK_SUBTREE" : "PAGE",
      externalId: snapshot.resolved.id,
      ...(snapshot.resolved.name || snapshot.blocks[0]?.pageName ? { pageName: snapshot.resolved.name ?? snapshot.blocks[0]!.pageName } : {}),
      durableOrigin: snapshot.kind === "BLOCK" ? `BLOCK_UUID:${snapshot.resolved.id}` : `PAGE_ID:${snapshot.resolved.id}`,
      captures: [{ captureId, reason, snapshotHash: snapshot.scopeHash, content, hierarchy, capturedAt: snapshot.readAt }],
      currentCaptureId: captureId,
      latestKnownHash: snapshot.scopeHash,
      availability: "AVAILABLE",
    };
  };
  const captureCreationSource = async (selection: ServiceCreationSourceSelection, role: CreationSessionSource["role"], reason: CreationSourceCapture["reason"], sourceId?: string): Promise<CreationSessionSource> => {
    const at = new Date();
    if (selection.kind === "BLANK") {
      if (role !== "PRIMARY") throw serviceError("CREATION_SESSION_REFERENCE_INVALID", "空白不能作为参考来源。");
      const id = sourceId ?? createId("creation", at);
      const captureId = createId("creation", at);
      const snapshotHash = checksum({ kind: "BLANK" });
      return { sourceId: id, role, kind: "BLANK", captures: [{ captureId, reason, snapshotHash, content: "", hierarchy: [], capturedAt: at.toISOString() }], currentCaptureId: captureId, latestKnownHash: snapshotHash, availability: "AVAILABLE" };
    }
    const result = await graphReadBroker.read(selection.kind === "BLOCK"
      ? { kind: "BLOCK", target: selection.target, includeChildren: true, parents: 8 }
      : { kind: "PAGE", target: selection.target, depth: 5 });
    if (result.status === "NOT_FOUND") throw serviceError("CREATION_SESSION_SOURCE_NOT_FOUND", "Logseq Desktop 中未找到选择的来源；没有创建或修改会话。");
    if (result.status === "ERROR") throw new StructuredError({ code: result.errorCode, message: result.message, ruleRefs: ["D-132", "D-135", "CREATION-SESSION-001"] });
    return sourceFromSnapshot(result.snapshot, role, reason, sourceId, at);
  };
  const generateCreationRound = async (session: NonNullable<ReturnType<CreationSessionApplication["get"]>>, signal?: AbortSignal) => {
    if (!options.creationRoundGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Creation Session Provider；已保存内容没有变化。");
    const [core, skill, targetSkill] = await Promise.all([
      readTaskCopilotSkill("task-copilot-core"),
      readTaskCopilotSkill("creation-session"),
      session.targetType === "PROJECT" ? readTaskCopilotSkill("design-project") : Promise.resolve(undefined),
    ]);
    if (!core || !skill) throw serviceError("CREATION_SESSION_SKILL_MISSING", "Creation Session 所需 Skill 不完整；没有调用 Provider。");
    return options.creationRoundGenerator.generate({
      session,
      core: { version: core.version, content: core.content },
      skill: { version: skill.version, content: skill.content },
      targetSkill: targetSkill ? { version: targetSkill.version, content: targetSkill.content } : { version: "mini-project-creation-v1", content: "MiniProject 只收敛具体结果、完成证据、当前推进、必要背景、保留材料与放置；保持轻量。" },
      ...(signal ? { signal } : {}),
    });
  };
  const agentGovernanceSkill = await readAgentGovernanceSkill();
  const agentGovernanceRuntime = new AgentGovernanceRuntime({
    graphId: options.graphId,
    source: {
      getObject: (objectId) => store.getObject(objectId),
      listObjects: () => store.listObjects(),
      listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
      listAssociations: () => store.listAssociations(),
      getActivePrimaryAnchorByObject: (objectId) => store.getActivePrimaryAnchorByObject(objectId),
      databaseSchemaVersion: () => store.doctor().schemaVersion,
      listCandidates: () => store.listCandidates(),
    },
    application: agentGovernanceApplication,
    graph: graphReadBroker,
    skill: agentGovernanceSkill,
    ...(options.agentGovernanceProvider ? { provider: options.agentGovernanceProvider } : {}),
    runtimeMode: "EXPERIMENT",
    guardedAutomationEnabled: false,
    observationEnabled: () => store.getAgentGovernanceSettings()?.observationEnabled ?? false,
    expandedContextEnabled: () => store.getAgentGovernanceSettings()?.expandedContextEnabled ?? false,
    globalWritesPaused: () => store.getAgentGovernanceSettings()?.globalWritesPaused ?? true,
  });
  const grillPreviewSessions = new GrillPreviewSessionStore<{ objectId: string; expectedVersion: number; answers: MiniProjectGrillAnswer[]; preview: GrillPreview; graphScopeHash: string }>();
  const projectCreationPreviewSessions = new GrillPreviewSessionStore<{ input: ProjectCreationGrillRequest; preview: ProjectCreationPreview; sourceFingerprint: string; graphScopeHash?: string; pageAuthority?: { id: string; name?: string; version?: number; hash: string } }>();
  const serializedTails = new Map<string, Promise<void>>();
  const serializeByKey = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const prior = serializedTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = prior.then(() => gate);
    serializedTails.set(key, tail);
    await prior;
    try { return await task(); }
    finally {
      release();
      if (serializedTails.get(key) === tail) serializedTails.delete(key);
    }
  };
  const resolveConditionChange = (objectId: string, requestedChangeId?: string) => {
    const receipts = store.listConditionChangeReceipts(objectId);
    const receipt = requestedChangeId
      ? receipts.find((candidate) => conditionChangeId(candidate.idempotencyKey) === requestedChangeId)
      : receipts[0];
    if (!receipt) throw serviceError("V2_CONDITION_CHANGE_NOT_FOUND", "没有找到可核验的状态变化；旧版或未受控变化不会被猜测撤销。");
    const resolvedChangeId = conditionChangeId(receipt.idempotencyKey);
    const undoIdempotencyKey = `condition-undo:${resolvedChangeId}`;
    return {
      receipt,
      conditionChangeId: resolvedChangeId,
      undoIdempotencyKey,
      undoReceipt: store.getCommandReceipt(undoIdempotencyKey),
    };
  };
  const activeMiniProjectClosure = async (objectId: string) => {
    const matches = (await proposalApplication.list()).filter(({ proposal }) =>
      ["DRAFT", "READY", "IN_REVIEW", "PARTIALLY_ACCEPTED", "ACCEPTED"].includes(proposal.status)
      && proposal.scope.modify.some(({ kind, id }) => kind === "OBJECT" && id === objectId)
      && proposal.groups.some(({ semanticOperations }) => semanticOperations.some(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && payload.objectType === "MINI_PROJECT" && payload.lifecycle === "COMPLETED")),
    );
    if (matches.length > 1) throw serviceError("V2_MINI_PROJECT_CLOSURE_PROPOSAL_AMBIGUOUS", "同一 MiniProject 存在多个活跃 Closure Proposal；必须先恢复为单一机器权威。");
    return matches[0];
  };
  const activeReasonedLifecycle = async (objectId: string) => {
    const matches = (await proposalApplication.list()).filter(({ proposal }) =>
      ["DRAFT", "READY", "IN_REVIEW", "PARTIALLY_ACCEPTED", "ACCEPTED"].includes(proposal.status)
      && proposal.scope.modify.some(({ kind, id }) => kind === "OBJECT" && id === objectId)
      && proposal.groups.some(({ semanticOperations }) => semanticOperations.some(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && (payload.action === "CANCEL" || payload.action === "REOPEN" || payload.action === "ARCHIVE"))),
    );
    if (matches.length > 1) throw serviceError("V2_LIFECYCLE_PROPOSAL_AMBIGUOUS", "同一对象存在多个活跃取消、重开或归档 Proposal；必须先恢复为单一机器权威。");
    return matches[0];
  };
  const submitReasonedLifecycle = async (object: V2ManagedObject, input: { action: "CANCEL" | "REOPEN" | "ARCHIVE"; reason: string }) => serializeByKey(`lifecycle-proposal:${object.objectId}`, async () => {
    if (!["TASK", "MINI_PROJECT", "PROJECT"].includes(object.objectType)) throw serviceError("V2_LIFECYCLE_ACTION_NOT_AVAILABLE", "只有 Task、MiniProject 或 Project 支持取消、重开与归档。");
    if (input.action === "CANCEL" ? object.lifecycle !== "OPEN" : !["COMPLETED", "CANCELLED"].includes(object.lifecycle)) throw serviceError("V2_LIFECYCLE_ACTION_NOT_AVAILABLE", `当前 ${object.lifecycle} 对象不能执行 ${input.action}。`);
    const active = await activeReasonedLifecycle(object.objectId);
    const historyCount = (await proposalApplication.list()).filter(({ proposal }) => proposal.scope.modify.some(({ kind, id, version }) => kind === "OBJECT" && id === object.objectId && version === object.version) && proposal.groups.some(({ semanticOperations }) => semanticOperations.some(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && payload.action === input.action))).length;
    const proposalId = active?.proposal.proposalId ?? `proposal_lifecycle_${createHash("sha256").update(JSON.stringify([options.graphId, object.objectId, object.version, input.action, historyCount + 1])).digest("hex").slice(0, 32)}`;
    const lifecycle = input.action === "CANCEL" ? "CANCELLED" : input.action === "REOPEN" ? "OPEN" : "ARCHIVED";
    const verb = input.action === "CANCEL" ? "取消" : input.action === "REOPEN" ? "重开" : "归档";
    const risk = object.objectType === "TASK" ? "MEDIUM" : "HIGH";
    const proposal: V2Proposal = {
      proposalId, schemaVersion: "v2", title: `${verb}${object.objectType}：${object.text}`, context: `用户对 ${object.objectId} 发起显式${verb}。`, understanding: `${verb}不会由 Marker 删除或普通同步隐式触发，必须记录原因。`, objective: `审阅后${verb}同一对象，不改变正文、Anchor、Condition、Focus 或 Ownership。`, logic: "原因保存在唯一机器 Proposal；最终提交重验 SQLite Object version，并复用单步 Domain SemanticCommit。", finalPreview: `${verb}原因：${input.reason}`, unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "OBJECT", id: object.objectId, version: object.version }] }, preconditions: [`对象仍为 ${object.lifecycle} 且版本保持不变`], groups: [{ groupId: `${input.action.toLowerCase()}-object`, explanation: `${verb} Lifecycle 与原因不可拆分。`, risk, independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{ operationId: `${input.action.toLowerCase()}-object`, kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: object.objectId, version: object.version }, summary: `${verb}${object.objectType}`, payload: { action: input.action, lifecycle, fromLifecycle: object.lifecycle, objectType: object.objectType, reason: input.reason, ...(object.closure ? { previousClosure: object.closure } : {}) }, preconditions: [`Object 仍为 ${object.lifecycle}`] }], disposition: "PENDING" }], status: "READY", createdAt: active?.proposal.createdAt ?? object.updatedAt,
    };
    if (active) {
      requireNoUnfinishedProposalCommit(proposalId);
      return { record: await proposalApplication.reviseSameMachineIntent(proposal, active.updatedAt), replayed: false };
    }
    return proposalApplication.submit(proposal, new Date(object.updatedAt));
  });
  const submitMiniProjectMarkerClosure = async (input: MaterializeRequest, object: V2ManagedObject, anchor: V2Anchor) => serializeByKey(`closure-proposal:${object.objectId}`, async () => {
    if (object.objectType !== "MINI_PROJECT" || object.lifecycle !== "OPEN" || input.objectType !== "MINI_PROJECT" || input.marker !== "DONE" || anchor.status !== "active" || anchor.objectId !== object.objectId) throw serviceError("V2_COMPLEX_CLOSURE_REQUIRES_PROPOSAL", "MiniProject 关闭请求不符合可审阅形状；没有修改正式状态。");
    const active = await activeMiniProjectClosure(object.objectId);
    const proposalId = active?.proposal.proposalId ?? `proposal_marker_closure_${createHash("sha256").update(JSON.stringify([options.graphId, object.objectId, object.version, input.contentHash])).digest("hex").slice(0, 32)}`;
    const current = active ?? await proposalApplication.get(proposalId);
    const currentTransition = current?.proposal.groups.flatMap(({ semanticOperations }) => semanticOperations).find(({ kind }) => kind === "TRANSITION_LIFECYCLE");
    if (current && currentTransition?.target.id === object.objectId && currentTransition.target.version === object.version && currentTransition.payload.externalId === input.externalId && currentTransition.payload.contentHash === input.contentHash && currentTransition.payload.text === input.text) return { record: current, replayed: true };
    const proposal: V2Proposal = {
      proposalId, schemaVersion: "v2", title: `完成 MiniProject：${input.text}`, context: `Logseq Block ${input.externalId} 的显式 MiniProject 已改为 DONE。`,
      understanding: "DONE Marker 只是关闭请求；MiniProject 需要独立高影响审阅。", objective: "审阅后完成同一 MiniProject，不改变 Condition、Focus 或 Primary Ownership。",
      logic: "先填写并确认原目标、实际结果和遗留三问；提交前再重验当前 Block hash 与 SQLite Object version，通过单一 Domain SemanticCommit 原子记录 Closure、Lifecycle 和 Anchor 观察。", finalPreview: `${input.text} 等待填写三问，尚不会变为 COMPLETED。`,
      unresolvedQuestions: ["原本要得到什么？", "实际得到了什么？", "有什么遗留或需要转移？"], source: { kind: "user" }, scope: { read: [{ kind: "BLOCK", id: input.externalId, hash: input.contentHash }], modify: [{ kind: "OBJECT", id: object.objectId, version: object.version }] },
      preconditions: ["DONE Block hash 与 MiniProject Object version 保持不变"], groups: [{ groupId: "complete-mini-project", explanation: "MiniProject 关闭是独立 HIGH 组；接受后仍需最终确认。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{
        operationId: "complete-mini-project", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: object.objectId, version: object.version }, summary: "完成 MiniProject", payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT", text: input.text, marker: "DONE", externalId: input.externalId, contentHash: input.contentHash }, preconditions: ["Object 仍为 OPEN"],
      }], disposition: "PENDING" }], status: "READY", createdAt: current?.proposal.createdAt ?? object.updatedAt,
    };
    if (current) {
      const files = renderV2ProposalFiles(proposal);
      if (current.files.proposalJson === files.proposalJson && current.files.proposalMd === files.proposalMd) return { record: current, replayed: true };
      if (store.listSemanticCommits(proposalId).some((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED")) throw serviceError("V2_PROPOSAL_COMMIT_IN_PROGRESS", "MiniProject 关闭 Proposal 已有未完成 Commit；不能并行修订。");
      return { record: await proposalApplication.reviseSameMachineIntent(proposal, current.updatedAt), replayed: false };
    }
    return proposalApplication.submit(proposal, new Date(object.updatedAt));
  });
  const submitMiniProjectObjectClosure = async (object: V2ManagedObject) => serializeByKey(`closure-proposal:${object.objectId}`, async () => {
    if (object.objectType !== "MINI_PROJECT" || object.lifecycle !== "OPEN") throw serviceError("V2_MINI_PROJECT_CLOSURE_NOT_AVAILABLE", "只有 OPEN MiniProject 可以发起 Closure Proposal；没有修改正式状态。");
    const active = await activeMiniProjectClosure(object.objectId);
    const transition = active?.proposal.groups.flatMap(({ semanticOperations }) => semanticOperations).find(({ kind, target }) => kind === "TRANSITION_LIFECYCLE" && target.id === object.objectId);
    if (active && transition?.target.version === object.version) return { record: active, replayed: true };
    const proposalId = active?.proposal.proposalId ?? `proposal_object_closure_${createHash("sha256").update(JSON.stringify([options.graphId, object.objectId, object.version])).digest("hex").slice(0, 32)}`;
    const proposal: V2Proposal = {
      proposalId, schemaVersion: "v2", title: `完成 MiniProject：${object.text}`, context: `从对象列表发起 ${object.objectId} 的关闭审阅。`,
      understanding: "MiniProject 关闭需要记录原目标、实际结果和遗留三问。", objective: "审阅后完成同一 MiniProject，不改变正文、Anchor、Condition、Focus 或 Primary Ownership。",
      logic: "先在唯一 Proposal 中填写并确认三问；最终提交仅重验 SQLite Object version，并通过现有 SemanticCommit 原子记录 Closure 与 Lifecycle。", finalPreview: `${object.text} 等待填写三问，尚不会变为 COMPLETED。`,
      unresolvedQuestions: ["原本要得到什么？", "实际得到了什么？", "有什么遗留或需要转移？"], source: { kind: "user" }, scope: { read: [], modify: [{ kind: "OBJECT", id: object.objectId, version: object.version }] },
      preconditions: ["MiniProject 仍为 OPEN 且 Object version 保持不变"], groups: [{ groupId: "complete-mini-project", explanation: "MiniProject 关闭是独立 HIGH 组；接受后仍需最终确认。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [{
        operationId: "complete-mini-project", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: object.objectId, version: object.version }, summary: "完成 MiniProject", payload: { lifecycle: "COMPLETED", objectType: "MINI_PROJECT" }, preconditions: ["Object 仍为 OPEN"],
      }], disposition: "PENDING" }], status: "READY", createdAt: active?.proposal.createdAt ?? object.updatedAt,
    };
    if (active) {
      if (store.listSemanticCommits(proposalId).some((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED")) throw serviceError("V2_PROPOSAL_COMMIT_IN_PROGRESS", "MiniProject 关闭 Proposal 已有未完成 Commit；不能并行修订。");
      return { record: await proposalApplication.reviseSameMachineIntent(proposal, active.updatedAt), replayed: false };
    }
    return proposalApplication.submit(proposal, new Date(object.updatedAt));
  });
  const draftMiniProjectClosure = async (proposalId: string, input: { expectedUpdatedAt: string; draft: V2MiniProjectClosure }, signal: AbortSignal) => {
    if (!options.proposalGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Provider；没有修改 Proposal。");
    const initial = await proposalApplication.get(proposalId);
    const initialTransition = initial?.proposal.groups.flatMap(({ semanticOperations }) => semanticOperations)
      .find(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && payload.objectType === "MINI_PROJECT" && payload.lifecycle === "COMPLETED");
    if (!initial || !initialTransition) throw serviceError("V2_MINI_PROJECT_CLOSURE_PROPOSAL_NOT_FOUND", "未找到可草拟三问的 MiniProject Closure Proposal。");
    return serializeByKey(`closure-proposal:${initialTransition.target.id}`, async () => {
      requireNoUnfinishedProposalCommit(proposalId);
      const current = await proposalApplication.get(proposalId);
      if (!current || current.updatedAt !== input.expectedUpdatedAt) throw serviceError("V2_PROPOSAL_REVIEW_STALE", "Proposal 已变化；Agent 草稿没有覆盖当前表示。");
      if (current.proposal.status !== "READY") throw serviceError("V2_MINI_PROJECT_CLOSURE_DRAFT_NOT_ALLOWED", "只能在审阅前草拟 MiniProject Closure 三问。");
      const transition = current.proposal.groups.flatMap(({ semanticOperations }) => semanticOperations)
        .find(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && payload.objectType === "MINI_PROJECT" && payload.lifecycle === "COMPLETED");
      const object = transition ? store.getObject(transition.target.id) : undefined;
      if (!transition || !object || object.objectType !== "MINI_PROJECT" || object.lifecycle !== "OPEN" || transition.target.version !== object.version) {
        throw serviceError("V2_OBJECT_VERSION_CONFLICT", "MiniProject 已变化；Agent 草稿没有修改 Proposal 或正式状态。");
      }
      const generated = await options.proposalGenerator!.generate({
        proposalId: current.proposal.proposalId,
        createdAt: current.proposal.createdAt,
        signal,
        prompt: {
          core: { version: "mini-project-closure-draft-v1", content: "只为已存在的 MiniProject Closure Proposal 草拟三问。输出仍必须是完整、可验证、READY 但未审阅的 Proposal；不得声称已完成、已提交或已写入。" },
          domain: { version: "mini-project-closure-domain-v1", content: "三问为 originalGoal、actualResult、remainingWork，必须全部是非空、有界、可供用户修改的中文草稿。三问只能位于唯一 HIGH TRANSITION_LIFECYCLE 操作的 payload.closure。" },
          skill: { version: "mini-project-closure-writing-v1", content: "优先保留用户已填内容；对缺失内容给出简洁、保守草稿，不虚构数字、交付物或外部事实。" },
          userSemantics: { version: "mini-project-closure-user-v1", content: "用户将在 UI 中审阅和修改三问；Agent 草稿不是事实。" },
          runtimeContext: { version: `proposal-${current.updatedAt}`, content: stableJson({ object: { objectId: object.objectId, objectType: object.objectType, text: object.text, version: object.version }, currentDraft: input.draft, proposal: current.proposal }) },
        },
      });
      if (generated.kind !== "PROPOSAL") throw serviceError("LLM_MINI_PROJECT_CLOSURE_DRAFT_UNAVAILABLE", `Provider 未生成三问草稿：${generated.reason}`);
      const generatedTransitions = generated.proposal.groups.flatMap(({ semanticOperations }) => semanticOperations)
        .filter(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && payload.objectType === "MINI_PROJECT" && payload.lifecycle === "COMPLETED" && payload.closure !== undefined);
      if (generatedTransitions.length !== 1) throw serviceError("LLM_MINI_PROJECT_CLOSURE_DRAFT_INVALID", "Provider 没有返回唯一、完整的 MiniProject Closure 三问；没有修改 Proposal。");
      const closure = validateV2MiniProjectClosure(generatedTransitions[0]!.payload.closure as V2MiniProjectClosure);
      const latestObject = store.getObject(object.objectId);
      if (!latestObject || latestObject.lifecycle !== "OPEN" || latestObject.version !== object.version) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "MiniProject 在 Agent 草拟期间已变化；没有覆盖 Proposal 或正式状态。");
      const revised: V2Proposal = {
        ...current.proposal,
        finalPreview: `Agent 草稿（待审阅）\n原目标：${closure.originalGoal}\n实际结果：${closure.actualResult}\n遗留：${closure.remainingWork}`,
        unresolvedQuestions: [],
        source: generated.proposal.source,
        groups: current.proposal.groups.map((group) => ({
          ...group,
          semanticOperations: group.semanticOperations.map((operation) => operation.operationId === transition.operationId
            ? { ...operation, payload: { ...operation.payload, closure } }
            : operation),
        })),
      };
      const record = await proposalApplication.reviseSameMachineIntent(revised, current.updatedAt);
      return { record, provider: generated.provider, promptBundleVersion: generated.promptBundleVersion };
    });
  };
  const submitReviewProposal = async (candidate: unknown, at = new Date()) => {
    const proposal = validateV2ProposalForSubmission(candidate);
    const closureOperation = proposal.groups.flatMap(({ semanticOperations }) => semanticOperations)
      .find(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && payload.objectType === "MINI_PROJECT" && payload.lifecycle === "COMPLETED");
    if (!closureOperation) return proposalApplication.submit(proposal, at);
    const objectId = closureOperation.target.id;
    return serializeByKey(`closure-proposal:${objectId}`, async () => {
      const object = store.getObject(objectId);
      if (!object || object.objectType !== "MINI_PROJECT" || object.lifecycle !== "OPEN") throw serviceError("V2_MINI_PROJECT_CLOSURE_NOT_AVAILABLE", "只有当前 OPEN MiniProject 可以提交 Closure Proposal；没有修改正式状态。");
      if (closureOperation.target.version !== object.version) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "MiniProject 已变化；请刷新 Proposal 的对象版本。");
      const active = await activeMiniProjectClosure(objectId);
      if (active && active.proposal.proposalId !== proposal.proposalId) throw serviceError("V2_MINI_PROJECT_CLOSURE_PROPOSAL_ACTIVE", "该 MiniProject 已有活跃 Closure Proposal；请审阅同一机器表示。");
      return proposalApplication.submit(proposal, at);
    });
  };
  const providerConfigured = options.proposalGenerator !== undefined
    || options.uxOutputGenerator !== undefined
    || options.grillTurnGenerator !== undefined
    || options.grillPreviewGenerator !== undefined
    || options.projectCreationPreviewGenerator !== undefined
    || options.creationRoundGenerator !== undefined
    || options.agentGovernanceProvider !== undefined;
  const capabilities = { ...LOCAL_SERVICE_CAPABILITIES, provider: providerConfigured };
  const comprehensiveDoctor = async (): Promise<ServiceDoctor> => {
    const core = store.doctor();
    const operational = store.operationalDiagnostics();
    const [externalSkills] = await Promise.all([listTaskCopilotSkills(), readAgentGovernanceSkill()]);
    const skillCount = externalSkills.length + 1;
    const graphRuntime = graphReadBroker.status();
    let backupCount = 0;
    let backupCode = "BACKUP_NONE";
    let backupStatus: ServiceDoctorCheck["status"] = "WARN";
    try {
      const backupNames = (await readdir(backupRoot)).filter((name) => backupIdPattern.test(name.replace(/\.db$/, "")) && name.endsWith(".db")).sort();
      backupCount = backupNames.length;
      if (backupNames.length > 0) {
        const latest = backupNames.at(-1)!;
        try {
          const validation = V2SqliteStore.validateBackup(join(backupRoot, latest), options.graphId);
          backupCode = validation.status === "PASS" ? "BACKUP_LATEST_VALID" : "BACKUP_LATEST_INVALID";
          backupStatus = validation.status === "PASS" ? "PASS" : "WARN";
        } catch {
          backupCode = "BACKUP_LATEST_INVALID";
          backupStatus = "WARN";
        }
      }
    } catch {
      backupCode = "BACKUP_DIRECTORY_UNREADABLE";
      backupStatus = "WARN";
    }
    const checks: ServiceDoctorCheck[] = [
      { component: "LOCAL_SERVICE", status: "PASS", code: "LOCAL_SERVICE_READY" },
      { component: "GRAPH", status: graphRuntime.connected ? "PASS" : "INFO", code: graphRuntime.connected ? "GRAPH_READ_BRIDGE_CONNECTED" : "GRAPH_READ_BRIDGE_NOT_CONNECTED", count: graphRuntime.pending + graphRuntime.queued },
      { component: "SQLITE", status: core.integrity === "ok" && core.foreignKeyViolations === 0 ? "PASS" : "FAIL", code: core.integrity === "ok" && core.foreignKeyViolations === 0 ? "SQLITE_INTEGRITY_VALID" : "SQLITE_INTEGRITY_INVALID", count: core.foreignKeyViolations },
      { component: "SCHEMA", status: core.schemaVersion === V2_DATABASE_SCHEMA_VERSION ? "PASS" : "FAIL", code: core.schemaVersion === V2_DATABASE_SCHEMA_VERSION ? "SCHEMA_CURRENT" : "SCHEMA_UNSUPPORTED" },
      { component: "ANCHOR", status: operational.multiplePrimaryAnchorObjectCount > 0 ? "FAIL" : operational.missingAnchorCount + operational.conflictAnchorCount > 0 ? "WARN" : "PASS", code: operational.multiplePrimaryAnchorObjectCount > 0 ? "ANCHOR_MULTIPLE_PRIMARY" : operational.missingAnchorCount + operational.conflictAnchorCount > 0 ? "ANCHOR_RECONCILIATION_REQUIRED" : "ANCHOR_HEALTHY", count: operational.missingAnchorCount + operational.conflictAnchorCount + operational.multiplePrimaryAnchorObjectCount },
      { component: "IDENTITY", status: operational.invalidIdentityCount > 0 ? "FAIL" : "PASS", code: operational.invalidIdentityCount > 0 ? "IDENTITY_INVALID" : "IDENTITY_VALID", count: operational.invalidIdentityCount },
      { component: "PROPOSAL", status: operational.staleProposalCount > 0 ? "WARN" : "PASS", code: operational.staleProposalCount > 0 ? "STALE_PROPOSAL_PRESENT" : "PROPOSAL_HEALTHY", count: operational.staleProposalCount },
      { component: "SEMANTIC_COMMIT", status: operational.recoveryRequiredCommitCount > 0 ? "FAIL" : operational.pendingCommitCount > 0 ? "WARN" : "PASS", code: operational.recoveryRequiredCommitCount > 0 ? "COMMIT_RECOVERY_REQUIRED" : operational.pendingCommitCount > 0 ? "COMMIT_PENDING" : "COMMIT_HEALTHY", count: operational.pendingCommitCount + operational.recoveryRequiredCommitCount },
      { component: "BACKUP", status: backupStatus, code: backupCode, count: backupCount },
      { component: "KEY_REFERENCE", status: "PASS", code: providerConfigured ? "KEY_RESOLVED_OUT_OF_BAND" : "KEY_NOT_REQUIRED" },
      { component: "PROVIDER", status: "INFO", code: providerConfigured ? "PROVIDER_CONFIGURED_NOT_PROBED" : "PROVIDER_DISABLED" },
      { component: "SKILL_PROFILE", status: skillCount === 7 ? "PASS" : "FAIL", code: skillCount === 7 ? "BUILTIN_AND_GOVERNANCE_SKILLS_VALID" : "BUILTIN_SKILLS_INVALID", count: skillCount },
      { component: "LOGGING", status: "INFO", code: "SERVICE_LOG_COLLECTION_NOT_CONFIGURED" },
      { component: "PROTOCOL", status: "PASS", code: "CLI_SERVICE_PROTOCOL_CURRENT" },
    ];
    const summary = {
      pass: checks.filter(({ status }) => status === "PASS").length,
      warn: checks.filter(({ status }) => status === "WARN").length,
      fail: checks.filter(({ status }) => status === "FAIL").length,
      info: checks.filter(({ status }) => status === "INFO").length,
    };
    return { ...core, status: summary.fail > 0 ? "FAIL" : "PASS", checks, summary, limitations: ["Graph read availability is observed through the transient Desktop bridge; Desktop event health still requires the Plugin runtime gate.", "Provider health requires an explicit bounded live smoke.", "Service log collection is not configured; the diagnostic archive contains structured status only."] };
  };
  const completeProposalObservations = (proposal: Parameters<typeof requiredV2ProposalRevalidationScope>[0], observations: V2ProposalScopeObservation[]): V2ProposalScopeObservation[] => [
    ...observations,
    ...requiredV2ProposalRevalidationScope(proposal).targets.filter((target) => target.kind === "OBJECT").map((target) => {
      const object = store.getObject(target.id);
      return object
        ? { kind: "OBJECT" as const, id: target.id, exists: true, version: object.version, hash: checksum(object) }
        : { kind: "OBJECT" as const, id: target.id, exists: false };
    }),
  ];
  const projectCreationGraphObservations = async (
    plan: ReturnType<typeof planAcceptedV2ProjectCreation>,
  ): Promise<V2ProposalScopeObservation[]> => {
    const observations = new Map<string, V2ProposalScopeObservation>();
    const observePage = async (target: typeof plan.pageTarget, includeBlocks: boolean): Promise<void> => {
      const graphResult = await graphReadBroker.read({ kind: "PAGE", target: target.id, depth: includeBlocks ? 5 : 0 });
      if (graphResult.status === "ERROR") throw serviceError("GRAPH_READ_PROJECT_CREATION_FAILED", "Logseq Desktop 无法读取 Project 创建所需 Page；没有准备正式事务。");
      if (graphResult.status === "NOT_FOUND") {
        observations.set(`PAGE:${target.id}`, { kind: "PAGE", id: target.id, exists: false });
        return;
      }
      observations.set(`PAGE:${target.id}`, {
        kind: "PAGE",
        id: target.id,
        exists: true,
        ...(graphResult.snapshot.resolved.version !== undefined ? { version: graphResult.snapshot.resolved.version } : {}),
        ...(graphResult.snapshot.resolved.evidenceHash ? { hash: graphResult.snapshot.resolved.evidenceHash } : {}),
      });
      if (includeBlocks) {
        const byId = new Map(graphResult.snapshot.blocks.map((block) => [block.uuid, block]));
        for (const source of plan.sourceBlockTargets) {
          const block = byId.get(source.id);
          observations.set(`BLOCK:${source.id}`, block
            ? { kind: "BLOCK", id: source.id, exists: true, hash: block.contentHash }
            : { kind: "BLOCK", id: source.id, exists: false });
        }
      }
    };
    if (plan.sourcePageTarget) {
      await observePage(plan.sourcePageTarget, true);
    } else if (plan.sourceMiniProjectTarget) {
      const anchor = store.getActivePrimaryAnchorByObject(plan.sourceMiniProjectTarget.id);
      if (!anchor || anchor.graphId !== options.graphId) {
        throw serviceError("V2_PROJECT_CREATION_SOURCE_ANCHOR_STALE", "MiniProject 来源不再有当前 Graph 的 active Primary Anchor；没有准备正式事务。");
      }
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: anchor.externalId, includeChildren: true, parents: 0 });
      if (graphResult.status === "ERROR") throw serviceError("GRAPH_READ_PROJECT_CREATION_FAILED", "Logseq Desktop 无法读取 MiniProject 来源；没有准备正式事务。");
      const byId = new Map(graphResult.status === "FOUND" ? graphResult.snapshot.blocks.map((block) => [block.uuid, block]) : []);
      for (const source of plan.sourceBlockTargets) {
        const block = byId.get(source.id);
        observations.set(`BLOCK:${source.id}`, block
          ? { kind: "BLOCK", id: source.id, exists: true, hash: block.contentHash }
          : { kind: "BLOCK", id: source.id, exists: false });
      }
    }
    if (!plan.sourcePageTarget || plan.sourcePageTarget.id !== plan.pageTarget.id) {
      await observePage(plan.pageTarget, false);
    }
    return [...observations.values()];
  };
  const requireNoUnfinishedProposalCommit = (proposalId: string): void => {
    if (store.listSemanticCommits(proposalId).some((commit) => commit.status === "PENDING" || commit.status === "RECOVERY_REQUIRED")) {
      throw serviceError("V2_PROPOSAL_COMMIT_IN_PROGRESS", "Proposal 已有未完成 Commit；请先恢复或完成该 Commit，审阅状态没有改变。");
    }
  };
  const resolveCandidateForAppliedProposal = async (proposalId: string, at = new Date()): Promise<void> => {
    const candidate = store.candidateForProposal(proposalId);
    if (!candidate || candidate.disposition === "RESOLVED") return;
    await candidateApplication.resolve(candidate.candidateId, proposalId, candidate.updatedAt, {
      actor: "semantic-commit",
      traceId: `candidate-resolve:${proposalId}`,
      idempotencyKey: `candidate-resolve:${candidate.candidateId}:${proposalId}`,
    }, at);
  };
  const reopenCandidateForUndoneProposal = async (proposalId: string, at = new Date()): Promise<void> => {
    const candidate = store.candidateForProposal(proposalId);
    if (!candidate || candidate.disposition !== "RESOLVED") return;
    await candidateApplication.reopenAfterUndo(candidate.candidateId, proposalId, candidate.updatedAt, {
      actor: "semantic-commit",
      traceId: `candidate-reopen:${proposalId}`,
      idempotencyKey: `candidate-reopen:${candidate.candidateId}:${proposalId}`,
    }, at);
  };

  const prepareMiniProjectGrillSource = async (input: { objectId: string; expectedVersion: number; answers: MiniProjectGrillAnswer[] }): Promise<{
    source: MiniProjectGrillSource;
    primaryAnchor: V2Anchor;
  }> => {
    const subject = store.getObject(input.objectId);
    if (!subject) throw serviceError("V2_OBJECT_NOT_FOUND", "MiniProject Grill 目标不存在。");
    if (subject.objectType !== "MINI_PROJECT" || subject.lifecycle !== "OPEN") throw serviceError("GRILL_OPEN_MINI_PROJECT_REQUIRED", "Grill 只接受 OPEN MiniProject。");
    if (subject.version !== input.expectedVersion) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "MiniProject 已变化；没有读取子树或调用 Provider。");
    const primaryAnchor = store.getActivePrimaryAnchorByObject(subject.objectId);
    if (!primaryAnchor || primaryAnchor.role !== "primary_text") throw serviceError("GRILL_PRIMARY_ANCHOR_REQUIRED", "MiniProject 没有可用的正文入口；没有调用 Provider。");
    const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: primaryAnchor.externalId, includeChildren: true, parents: 0 });
    if (graphResult.status === "NOT_FOUND") throw serviceError("GRAPH_READ_NOT_FOUND", "Logseq Desktop 中未找到 MiniProject 正文。" );
    if (graphResult.status === "ERROR") throw new StructuredError({ code: graphResult.errorCode, message: graphResult.message, ruleRefs: ["D-132", "D-135"] });
    const [coreSkill, grillSkill] = await Promise.all([readTaskCopilotSkill("task-copilot-core"), readTaskCopilotSkill("mini-project-modeling")]);
    if (!coreSkill || !grillSkill) throw serviceError("GRILL_SKILL_UNAVAILABLE", "MiniProject Grill 内置 Skill 不可用。");
    const contextPackage = buildContextPackage({
      getObject: (objectId) => store.getObject(objectId),
      listObjects: () => store.listObjects(),
      listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
      listAssociations: () => store.listAssociations(),
      getActivePrimaryAnchorByObject: (objectId) => store.getActivePrimaryAnchorByObject(objectId),
      databaseSchemaVersion: () => store.doctor().schemaVersion,
    }, [coreSkill, grillSkill], { kind: "project", id: subject.objectId }, new Date(), graphResult.snapshot);
    const contextFingerprint = contextPackageFingerprint(contextPackage);
    const scopedObjects = (JSON.parse(contextPackage.files["objects.json"] ?? "{}") as { formalFacts?: V2ManagedObject[] }).formalFacts ?? [];
    const scopedAnchors = scopedObjects.map(({ objectId }) => store.getActivePrimaryAnchorByObject(objectId)).filter((anchor): anchor is V2Anchor => anchor !== undefined);
    return {
      primaryAnchor,
      source: {
        observedAt: contextPackage.manifest.generatedAt,
        subject,
        objects: scopedObjects,
        anchors: scopedAnchors,
        graphSnapshot: graphResult.snapshot,
        contextPackage,
        contextFingerprint,
        coreSkill,
        grillSkill,
        answers: input.answers,
      },
    };
  };
  const revalidateMiniProjectGrillSource = async (input: { objectId: string; expectedVersion: number }, primaryAnchor: V2Anchor, scopeHash: string): Promise<void> => {
    const latest = store.getObject(input.objectId);
    const latestAnchor = store.getActivePrimaryAnchorByObject(input.objectId);
    if (!latest || latest.version !== input.expectedVersion || !latestAnchor || latestAnchor.anchorId !== primaryAnchor.anchorId || latestAnchor.externalId !== primaryAnchor.externalId) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "MiniProject 或正文入口在生成期间已变化；草稿已丢弃。");
    const refreshedGraph = await graphReadBroker.read({ kind: "BLOCK", target: primaryAnchor.externalId, includeChildren: true, parents: 0 });
    if (refreshedGraph.status !== "FOUND" || refreshedGraph.snapshot.scopeHash !== scopeHash) throw serviceError("GRILL_SOURCE_STALE", "MiniProject 正文在生成期间已变化；草稿已丢弃。");
  };

  const prepareProjectCreationGrillSource = async (input: ProjectCreationGrillRequest): Promise<{
    source: ProjectCreationGrillSource;
    graphScopeHash?: string;
    pageAuthority?: { id: string; name?: string; version?: number; hash: string };
    revalidate(): Promise<void>;
  }> => {
    const [coreSkill, grillSkill] = await Promise.all([
      readTaskCopilotSkill("task-copilot-core"),
      readTaskCopilotSkill("project-creation-modeling"),
    ]);
    if (!coreSkill || !grillSkill) throw serviceError("PROJECT_CREATION_GRILL_SKILL_UNAVAILABLE", "Project Creation Grill 内置 Skill 不可用。");
    const generatedAt = new Date().toISOString();
    const contextSource = {
      getObject: (objectId: string) => store.getObject(objectId),
      listObjects: () => store.listObjects(),
      listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
      listAssociations: () => store.listAssociations(),
      getActivePrimaryAnchorByObject: (objectId: string) => store.getActivePrimaryAnchorByObject(objectId),
      databaseSchemaVersion: () => store.doctor().schemaVersion,
    };
    let contextPackage: ServiceContextPackage;
    let materials: ProjectCreationGrillMaterial[] = [];
    let graphScopeHash: string | undefined;
    let pageAuthority: { id: string; name?: string; version?: number; hash: string } | undefined;
    let revalidate = async (): Promise<void> => undefined;
    if (input.sourceKind === "BLANK") {
      const files: Record<string, string> = {
        "source.json": stableJson({ sourceKind: input.sourceKind, materials: [] }),
        "workspace-semantics.md": "# Workspace Semantics\n\nStatus: NOT_CONFIGURED\n",
        "writing-profile.md": "# Writing Profile\n\nStatus: NOT_CONFIGURED\n",
        "versions.json": stableJson({ schemaVersion: 1, databaseSchemaVersion: store.doctor().schemaVersion, skills: [coreSkill, grillSkill].map(({ name, version, sha256 }) => ({ name, version, sha256 })) }),
      };
      contextPackage = {
        manifest: {
          schemaVersion: 1,
          generatedAt,
          scope: { kind: "page", id: "project-creation:blank" },
          authority: "READ_ONLY_DERIVATIVE",
          formalFactsSource: "SQLITE",
          graphExcerptStatus: "NOT_INCLUDED",
          includedObjectCount: 0,
          files: Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, content]) => ({ path, sha256: createHash("sha256").update(content).digest("hex"), bytes: Buffer.byteLength(content) })),
        },
        files,
      };
    } else if (input.sourceKind === "PAGE") {
      const graphResult = await graphReadBroker.read({ kind: "PAGE", target: input.pageId, depth: 5 });
      if (graphResult.status !== "FOUND") throw serviceError("PROJECT_CREATION_SOURCE_UNAVAILABLE", "当前 Page 无法从 Logseq Desktop 完整读取；没有调用 Provider。");
      if (graphResult.snapshot.resolved.kind !== "PAGE" || !graphResult.snapshot.resolved.evidenceHash) throw serviceError("PROJECT_CREATION_SOURCE_UNAVAILABLE", "当前 Page 的 Logseq identity 无法确认；没有调用 Provider。");
      if (graphResult.snapshot.truncated || graphResult.snapshot.blocks.length > 16) throw serviceError("PROJECT_CREATION_SOURCE_TOO_LARGE", "当前 Page 超过 Project Creation Grill 的 16 Block 安全范围；没有调用 Provider。");
      materials = graphResult.snapshot.blocks.flatMap((block) => {
        const text = stripLogseqBlockIdentityProperty(block.content, block.uuid);
        return text.trim() ? [{ sourceRef: `block:${block.uuid}`, kind: "PAGE" as const, text, contentHash: block.contentHash }] : [];
      });
      if (!materials.length) throw serviceError("PROJECT_CREATION_SOURCE_EMPTY", "当前 Page 没有可用于 Project Creation Grill 的语义材料；没有调用 Provider。");
      contextPackage = buildContextPackage(contextSource, [coreSkill, grillSkill], { kind: "page", id: input.pageId }, new Date(generatedAt), graphResult.snapshot);
      graphScopeHash = graphResult.snapshot.scopeHash;
      pageAuthority = {
        id: graphResult.snapshot.resolved.id,
        ...(graphResult.snapshot.resolved.name ? { name: graphResult.snapshot.resolved.name } : {}),
        ...(graphResult.snapshot.resolved.version !== undefined ? { version: graphResult.snapshot.resolved.version } : {}),
        hash: graphResult.snapshot.resolved.evidenceHash!,
      };
      revalidate = async () => {
        const latest = await graphReadBroker.read({ kind: "PAGE", target: input.pageId, depth: 5 });
        if (latest.status !== "FOUND" || latest.snapshot.scopeHash !== graphResult.snapshot.scopeHash) throw serviceError("GRILL_SOURCE_STALE", "Page 在生成期间已变化；草稿已丢弃。");
      };
    } else {
      const subject = store.getObject(input.objectId);
      if (!subject || subject.objectType !== "MINI_PROJECT" || subject.lifecycle !== "OPEN" || subject.version !== input.expectedVersion) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "MiniProject 已变化或不可升级；没有调用 Provider。");
      const anchor = store.getActivePrimaryAnchorByObject(subject.objectId);
      if (!anchor || anchor.role !== "primary_text") throw serviceError("GRILL_PRIMARY_ANCHOR_REQUIRED", "MiniProject 没有可用正文入口；没有调用 Provider。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: anchor.externalId, includeChildren: true, parents: 0 });
      if (graphResult.status !== "FOUND") throw serviceError("PROJECT_CREATION_SOURCE_UNAVAILABLE", "MiniProject 正文无法从 Logseq Desktop 完整读取；没有调用 Provider。");
      if (graphResult.snapshot.truncated || graphResult.snapshot.blocks.length > 16) throw serviceError("PROJECT_CREATION_SOURCE_TOO_LARGE", "MiniProject 超过 Project Creation Grill 的 16 Block 安全范围；没有调用 Provider。");
      materials = graphResult.snapshot.blocks.flatMap((block) => {
        const text = stripLogseqBlockIdentityProperty(block.content, block.uuid);
        return text.trim() ? [{ sourceRef: `block:${block.uuid}`, kind: "MINI_PROJECT" as const, text, contentHash: block.contentHash }] : [];
      });
      if (!materials.length) throw serviceError("PROJECT_CREATION_SOURCE_EMPTY", "MiniProject 没有可用于 Project Creation Grill 的语义材料；没有调用 Provider。");
      contextPackage = buildContextPackage(contextSource, [coreSkill, grillSkill], { kind: "project", id: subject.objectId }, new Date(generatedAt), graphResult.snapshot);
      graphScopeHash = graphResult.snapshot.scopeHash;
      revalidate = async () => {
        const latest = store.getObject(input.objectId);
        const latestAnchor = store.getActivePrimaryAnchorByObject(input.objectId);
        const latestGraph = await graphReadBroker.read({ kind: "BLOCK", target: anchor.externalId, includeChildren: true, parents: 0 });
        if (!latest || latest.version !== input.expectedVersion || !latestAnchor || latestAnchor.anchorId !== anchor.anchorId || latestAnchor.externalId !== anchor.externalId || latestGraph.status !== "FOUND" || latestGraph.snapshot.scopeHash !== graphResult.snapshot.scopeHash) {
          throw serviceError("GRILL_SOURCE_STALE", "MiniProject 在生成期间已变化；草稿已丢弃。");
        }
      };
    }
    const contextFingerprint = contextPackageFingerprint(contextPackage);
    return {
      source: {
        observedAt: generatedAt,
        sourceKind: input.sourceKind,
        materials,
        contextPackage,
        contextFingerprint,
        coreSkill,
        grillSkill,
        answers: input.answers,
      },
      ...(graphScopeHash ? { graphScopeHash } : {}),
      ...(pageAuthority ? { pageAuthority } : {}),
      revalidate,
    };
  };

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!authorized(request, token)) {
      respond(response, 401, { error: { code: "UNAUTHORIZED", message: "Local Service session token is required." } });
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const restoreRequest = request.method === "POST" && url.pathname === "/backup/restore/apply";
    let admitted = false;
    if (restoreRequest) {
      if (stopping || restoreClaimed) {
        respond(response, 503, { error: { code: "SERVICE_STOPPING", message: "Local Service 正在执行受控恢复并停止。" } });
        return;
      }
      restoreClaimed = true;
    } else if (stopping || restoreClaimed) {
      respond(response, 503, { error: { code: "SERVICE_STOPPING", message: "Local Service 正在执行受控恢复并停止。" } });
      return;
    } else {
      activeRequestCount += 1;
      admitted = true;
    }
    try {
    if (request.method === "GET" && url.pathname === "/health") {
      respond(response, 200, { status: "READY", protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION, capabilities });
      return;
    }
    if (request.method === "GET" && url.pathname === "/status") {
      const doctor = store.doctor();
      respond(response, doctor.status === "PASS" ? 200 : 503, {
        status: doctor.status === "PASS" ? "READY" : "RESTRICTED",
        protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
        capabilities,
        databaseSchemaVersion: doctor.schemaVersion,
        objectCount: doctor.objectCount,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/doctor") {
      const doctor = await comprehensiveDoctor();
      respond(response, 200, doctor);
      return;
    }
    if (request.method === "POST" && url.pathname === "/creation-sessions") {
      const input = await readCreationSessionJson(request);
      if (Object.keys(input).some((key) => !["targetType", "primarySource", "userTitle", "sessionId", "idempotencyKey"].includes(key))
        || (input.targetType !== "MINI_PROJECT" && input.targetType !== "PROJECT")
        || !input.primarySource || typeof input.primarySource !== "object" || Array.isArray(input.primarySource)
        || (input.userTitle !== undefined && (typeof input.userTitle !== "string" || !input.userTitle.trim() || input.userTitle.length > 240))) {
        throw serviceError("CREATION_SESSION_REQUEST_INVALID", "Creation Session 创建参数无效。");
      }
      const idempotencyKey = safeCreationToken(input.idempotencyKey, "idempotency key");
      const sessionId = input.sessionId === undefined ? undefined : safeCreationToken(input.sessionId, "Session ID");
      const replay = creationSessionApplication.replay(idempotencyKey, "CreateCreationSession");
      if (replay) { respond(response, 200, replay); return; }
      const primarySource = await captureCreationSource(parseCreationSourceSelection(input.primarySource), "PRIMARY", "SESSION_START");
      const result = creationSessionApplication.create({
        targetType: input.targetType,
        primarySource,
        ...(input.userTitle ? { userTitle: input.userTitle } : {}),
        ...(sessionId ? { sessionId } : {}),
        idempotencyKey,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/creation-sessions") {
      if ([...url.searchParams.keys()].some((key) => key !== "status")) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "Creation Session 列表只接受 status 查询。");
      const statusText = url.searchParams.get("status");
      const statuses = statusText ? statusText.split(",") : undefined;
      if (statuses?.some((status) => !["DISCUSSING", "PREVIEW_READY", "CREATED", "ABANDONED"].includes(status))) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "Creation Session status 查询无效。");
      respond(response, 200, { sessions: creationSessionApplication.list(statuses as CreationSessionStatus[] | undefined) });
      return;
    }
    const creationSessionReadMatch = request.method === "GET" ? url.pathname.match(/^\/creation-sessions\/([^/]+)$/) : null;
    if (creationSessionReadMatch?.[1]) {
      const sessionId = safeCreationToken(decodeURIComponent(creationSessionReadMatch[1]), "Session ID");
      const session = creationSessionApplication.get(sessionId);
      respond(response, session ? 200 : 404, session ? { session } : { error: { code: "CREATION_SESSION_NOT_FOUND", message: "Creation Session 不存在。" } });
      return;
    }
    const creationSessionUpdateMatch = request.method === "POST" ? url.pathname.match(/^\/creation-sessions\/([^/]+)\/update$/) : null;
    if (creationSessionUpdateMatch?.[1]) {
      const sessionId = safeCreationToken(decodeURIComponent(creationSessionUpdateMatch[1]), "Session ID");
      const input = await readCreationSessionJson(request);
      if (Object.keys(input).some((key) => !["expectedVersion", "idempotencyKey", "patch"].includes(key))
        || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1
        || !input.patch || typeof input.patch !== "object" || Array.isArray(input.patch)) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "Creation Session 更新参数无效。");
      const patch = input.patch as Record<string, unknown>;
      if (Object.keys(patch).some((key) => !["userTitle", "placementPlan"].includes(key))) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "Creation Session 通用更新只允许会话标题与放置选择；来源、讨论和草稿必须走专用命令。");
      const result = await serializeByKey(`creation-session:${sessionId}`, async () => creationSessionApplication.update({ sessionId, expectedVersion: Number(input.expectedVersion), idempotencyKey: safeCreationToken(input.idempotencyKey, "idempotency key"), patch: patch as Parameters<CreationSessionApplication["update"]>[0]["patch"] }));
      respond(response, 200, result);
      return;
    }
    const creationSessionAddSourceMatch = request.method === "POST" ? url.pathname.match(/^\/creation-sessions\/([^/]+)\/sources$/) : null;
    if (creationSessionAddSourceMatch?.[1]) {
      const sessionId = safeCreationToken(decodeURIComponent(creationSessionAddSourceMatch[1]), "Session ID");
      const input = await readCreationSessionJson(request);
      if (Object.keys(input).sort().join(",") !== "expectedVersion,idempotencyKey,source" || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "添加参考来源需要当前版本、幂等键和受控来源选择。");
      const idempotencyKey = safeCreationToken(input.idempotencyKey, "idempotency key");
      const result = await serializeByKey(`creation-session:${sessionId}`, async () => {
        const replay = creationSessionApplication.replay(idempotencyKey, "AddCreationSessionSource");
        if (replay) return replay;
        const source = await captureCreationSource(parseCreationSourceSelection(input.source), "REFERENCE", "SESSION_START");
        return creationSessionApplication.addSource({ sessionId, expectedVersion: Number(input.expectedVersion), idempotencyKey, source });
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    const creationSessionSourceActionMatch = request.method === "POST" ? url.pathname.match(/^\/creation-sessions\/([^/]+)\/sources\/([^/]+)\/(check|refresh)$/) : null;
    if (creationSessionSourceActionMatch?.[1] && creationSessionSourceActionMatch[2] && creationSessionSourceActionMatch[3]) {
      const sessionId = safeCreationToken(decodeURIComponent(creationSessionSourceActionMatch[1]), "Session ID");
      const sourceId = safeCreationToken(decodeURIComponent(creationSessionSourceActionMatch[2]), "Source ID");
      const input = await readCreationSessionJson(request);
      if (Object.keys(input).sort().join(",") !== "expectedVersion,idempotencyKey" || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "来源检查需要当前版本和幂等键。");
      const idempotencyKey = safeCreationToken(input.idempotencyKey, "idempotency key");
      const sourceCommand = creationSessionSourceActionMatch[3] === "refresh" ? "RefreshCreationSessionSource" as const : "ObserveCreationSessionSource" as const;
      const result = await serializeByKey(`creation-session:${sessionId}`, async () => {
        const replay = creationSessionApplication.replay(idempotencyKey, sourceCommand);
        if (replay) return replay;
        const current = creationSessionApplication.get(sessionId);
        const source = current?.sources.find((candidate) => candidate.sourceId === sourceId);
        if (!source || source.kind === "BLANK" || !source.externalId) throw serviceError("CREATION_SESSION_SOURCE_NOT_FOUND", "Creation Session 中没有这个 Graph 来源。");
        if (creationSessionSourceActionMatch[3] === "refresh") {
          const refreshed = await captureCreationSource(source.kind === "BLOCK_SUBTREE" ? { kind: "BLOCK", target: source.externalId } : { kind: "PAGE", target: source.externalId }, source.role, "USER_REFRESH", source.sourceId);
          const capture = refreshed.captures[0]!;
          return creationSessionApplication.refreshSource({ sessionId, sourceId, expectedVersion: Number(input.expectedVersion), idempotencyKey, capture });
        }
        const graphResult = await graphReadBroker.read(source.kind === "BLOCK_SUBTREE" ? { kind: "BLOCK", target: source.externalId, includeChildren: true, parents: 8 } : { kind: "PAGE", target: source.externalId, depth: 5 });
        if (graphResult.status === "ERROR") throw new StructuredError({ code: graphResult.errorCode, message: graphResult.message, ruleRefs: ["D-132", "D-135", "CREATION-SESSION-001"] });
        const latestKnownHash = graphResult.status === "FOUND" ? graphResult.snapshot.scopeHash : undefined;
        const currentCapture = source.captures.find(({ captureId }) => captureId === source.currentCaptureId)!;
        const availability: CreationSessionSource["availability"] = graphResult.status === "NOT_FOUND" ? "DELETED" : latestKnownHash === currentCapture.snapshotHash ? "AVAILABLE" : "CHANGED";
        return creationSessionApplication.observeSource({ sessionId, sourceId, expectedVersion: Number(input.expectedVersion), idempotencyKey, ...(latestKnownHash ? { latestKnownHash } : {}), availability });
      });
      respond(response, 200, result);
      return;
    }
    const creationSessionStartRoundMatch = request.method === "POST" ? url.pathname.match(/^\/creation-sessions\/([^/]+)\/rounds\/start$/) : null;
    if (creationSessionStartRoundMatch?.[1]) {
      const sessionId = safeCreationToken(decodeURIComponent(creationSessionStartRoundMatch[1]), "Session ID");
      const input = await readCreationSessionJson(request);
      if (Object.keys(input).sort().join(",") !== "expectedVersion,idempotencyKey" || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "生成首轮需要当前版本和幂等键。");
      const idempotencyKey = safeCreationToken(input.idempotencyKey, "idempotency key");
      const result = await serializeByKey(`creation-session:${sessionId}`, async () => {
        const replay = creationSessionApplication.replay(idempotencyKey, "StartCreationSessionRound");
        if (replay) return { ...replay, providerStatus: "COMPLETED" as const };
        const current = creationSessionApplication.get(sessionId);
        if (!current) throw serviceError("CREATION_SESSION_NOT_FOUND", "Creation Session 不存在。");
        const generated = await generateCreationRound(current);
        const saved = creationSessionApplication.startRound({ sessionId, expectedVersion: Number(input.expectedVersion), idempotencyKey, round: generated.round });
        return { ...saved, providerStatus: "COMPLETED" as const };
      });
      respond(response, 200, result);
      return;
    }
    const creationSessionRoundActionMatch = request.method === "POST" ? url.pathname.match(/^\/creation-sessions\/([^/]+)\/rounds\/([^/]+)\/(submit|retry)$/) : null;
    if (creationSessionRoundActionMatch?.[1] && creationSessionRoundActionMatch[2] && creationSessionRoundActionMatch[3]) {
      const sessionId = safeCreationToken(decodeURIComponent(creationSessionRoundActionMatch[1]), "Session ID");
      const roundId = safeCreationToken(decodeURIComponent(creationSessionRoundActionMatch[2]), "Round ID");
      const action = creationSessionRoundActionMatch[3];
      const input = await readCreationSessionJson(request);
      const expectedKeys = action === "submit" ? "answers,expectedVersion,idempotencyKey" : "expectedVersion,idempotencyKey";
      if (Object.keys(input).sort().join(",") !== expectedKeys || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1 || (action === "submit" && (!Array.isArray(input.answers) || input.answers.length < 1 || input.answers.length > 5))) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "轮次提交或重试参数无效。");
      const idempotencyKey = safeCreationToken(input.idempotencyKey, "idempotency key");
      const answers: CreationRoundAnswerInput[] = action === "submit" ? (input.answers as unknown[]).map((raw) => {
        const answer = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
        if (Object.keys(answer).some((key) => !["questionId", "answerState", "userAnswer"].includes(key)) || typeof answer.questionId !== "string" || !["ANSWERED", "ACCEPTED_RECOMMENDATION", "SKIPPED", "UNCERTAIN", "UNANSWERED"].includes(String(answer.answerState)) || (answer.userAnswer !== undefined && (typeof answer.userAnswer !== "string" || answer.userAnswer.length > 4_000))) throw serviceError("CREATION_SESSION_ROUND_ANSWER_INVALID", "每题回答需要受控问题 ID、显式状态和可选有界文本。");
        return { questionId: safeCreationToken(answer.questionId, "Question ID"), answerState: answer.answerState as CreationRoundAnswerInput["answerState"], ...(typeof answer.userAnswer === "string" ? { userAnswer: answer.userAnswer } : {}) };
      }) : [];
      const controller = new AbortController();
      const abort = () => { if (!response.writableEnded) controller.abort(); };
      response.once("close", abort);
      try {
        const result = await serializeByKey(`creation-session:${sessionId}`, async () => {
          const requesting = action === "submit"
            ? creationSessionApplication.submitRoundAnswers({ sessionId, roundId, expectedVersion: Number(input.expectedVersion), idempotencyKey, answers })
            : creationSessionApplication.retryRound({ sessionId, roundId, expectedVersion: Number(input.expectedVersion), idempotencyKey });
          const actual = requesting.replayed ? creationSessionApplication.get(sessionId) : undefined;
          const actualRound = actual?.rounds.find((candidate) => candidate.roundId === roundId);
          if (actual && actual.version !== requesting.session.version && actualRound?.providerStatus === "COMPLETED") return { session: actual, replayed: true, providerStatus: "COMPLETED" as const };
          if (actual && actual.version !== requesting.session.version && ["FAILED", "CANCELLED"].includes(actualRound?.providerStatus ?? "")) return { session: actual, replayed: true, providerStatus: "FAILED" as const, error: { code: actualRound?.providerStatus === "CANCELLED" ? "CREATION_ROUND_CANCELLED" : "CREATION_ROUND_PROVIDER_FAILED", message: "本轮回答已保存；请使用安全重试继续。" } };
          try {
            const generated = await generateCreationRound(requesting.session, controller.signal);
            const completeKey = `creation-round-complete:${checksum({ sessionId, roundId, idempotencyKey })}`;
            const completed = creationSessionApplication.completeRound({
              sessionId, roundId, expectedVersion: requesting.session.version, idempotencyKey: completeKey,
              completion: { ...generated.completion, ...(generated.round.questions.length ? { nextRound: generated.round } : {}) },
            });
            return { ...completed, providerStatus: "COMPLETED" as const };
          } catch (error) {
            const status = controller.signal.aborted ? "CANCELLED" as const : "FAILED" as const;
            const failed = creationSessionApplication.failRound({ sessionId, roundId, expectedVersion: requesting.session.version, idempotencyKey: `creation-round-fail:${checksum({ sessionId, roundId, idempotencyKey, status })}`, status });
            return { ...failed, providerStatus: "FAILED" as const, error: { code: status === "CANCELLED" ? "CREATION_ROUND_CANCELLED" : error instanceof StructuredError ? error.code : "CREATION_ROUND_PROVIDER_FAILED", message: status === "CANCELLED" ? "请求已取消；本轮回答已保存。" : "暂时无法整理下一轮；本轮回答和稳定草稿已保存，可以安全重试。" } };
          }
        });
        if (!controller.signal.aborted) respond(response, 200, result);
      } finally {
        response.removeListener("close", abort);
      }
      return;
    }
    const creationSessionAbandonMatch = request.method === "POST" ? url.pathname.match(/^\/creation-sessions\/([^/]+)\/abandon$/) : null;
    if (creationSessionAbandonMatch?.[1]) {
      const sessionId = safeCreationToken(decodeURIComponent(creationSessionAbandonMatch[1]), "Session ID");
      const input = await readCreationSessionJson(request);
      if (Object.keys(input).some((key) => !["expectedVersion", "idempotencyKey"].includes(key)) || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) throw serviceError("CREATION_SESSION_REQUEST_INVALID", "Creation Session 放弃参数无效。");
      const result = await serializeByKey(`creation-session:${sessionId}`, async () => creationSessionApplication.abandon({ sessionId, expectedVersion: Number(input.expectedVersion), idempotencyKey: safeCreationToken(input.idempotencyKey, "idempotency key") }));
      respond(response, 200, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/associations") {
      respond(response, 200, { associations: store.listAssociations() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/ownerships/primary") {
      respond(response, 200, { ownerships: store.listPrimaryOwnerships() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/candidates") {
      respond(response, 200, { candidates: await candidateApplication.list() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/agent/decisions") {
      if ([...url.searchParams.keys()].some((key) => key !== "limit" && key !== "since")) throw serviceError("AGENT_DECISION_QUERY_INVALID", "Agent Decision 查询只接受 limit 和 since。");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const since = url.searchParams.get("since") ?? undefined;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (since !== undefined && !Number.isFinite(Date.parse(since)))) {
        throw serviceError("AGENT_DECISION_QUERY_INVALID", "Agent Decision 查询需要 limit 1..100 与可选的 ISO since。");
      }
      respond(response, 200, { decisions: await agentGovernanceApplication.listDecisions({ limit, ...(since ? { since } : {}) }) });
      return;
    }
    const agentDecisionEventsMatch = request.method === "GET" ? url.pathname.match(/^\/agent\/decisions\/([^/]+)\/events$/) : null;
    if (agentDecisionEventsMatch) {
      const threadId = decodeURIComponent(agentDecisionEventsMatch[1]!);
      if (!threadId.trim() || threadId.length > 256 || url.search) throw serviceError("AGENT_DECISION_EVENT_QUERY_INVALID", "Decision Event 查询需要唯一受控 thread ID。");
      respond(response, 200, { events: await agentGovernanceApplication.listDecisionEvents(threadId) });
      return;
    }
    const agentDecisionFeedbackMatch = request.method === "POST" ? url.pathname.match(/^\/agent\/decisions\/([^/]+)\/feedback$/) : null;
    if (agentDecisionFeedbackMatch) {
      const decisionId = decodeURIComponent(agentDecisionFeedbackMatch[1]!);
      if (!decisionId.trim() || decisionId.length > 256 || url.search) throw serviceError("AGENT_FEEDBACK_INVALID", "Agent Feedback 需要唯一受控 Decision ID。");
      const input = await readAgentFeedbackRequest(request);
      const result = await agentGovernanceApplication.recordFeedback(decisionId, input.feedback, {
        actor: "user", traceId: input.traceId, idempotencyKey: input.idempotencyKey,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/agent/feedback/bulk" && !url.search) {
      const input = await readAgentBulkFeedbackRequest(request);
      const result = await agentGovernanceApplication.recordBulkFeedback(input.decisionIds, input.feedback, {
        actor: "user", traceId: input.traceId, idempotencyKey: input.idempotencyKey,
      });
      respond(response, result.results.every(({ replayed }) => replayed) ? 200 : 201, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/agent/review-signals") {
      if ([...url.searchParams.keys()].some((key) => key !== "limit" && key !== "status")) throw serviceError("AGENT_REVIEW_SIGNAL_QUERY_INVALID", "Review Signal 查询只接受 limit 和 status。");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const status = url.searchParams.get("status") ?? undefined;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (status !== undefined && !["ACTIVE", "EXPIRED", "SOURCE_MISSING"].includes(status))) {
        throw serviceError("AGENT_REVIEW_SIGNAL_QUERY_INVALID", "Review Signal 查询需要 limit 1..100 与可选的合法 status。");
      }
      respond(response, 200, { signals: await agentGovernanceApplication.listReviewSignals({ limit, ...(status ? { status: status as "ACTIVE" | "EXPIRED" | "SOURCE_MISSING" } : {}) }) });
      return;
    }
    if (request.method === "GET" && url.pathname === "/agent/rules" && !url.search) {
      respond(response, 200, { authorizations: await agentGovernanceApplication.listRuleAuthorizations() });
      return;
    }
    const agentRulePauseMatch = request.method === "POST" ? url.pathname.match(/^\/agent\/rules\/([^/]+)\/pause$/) : null;
    if (agentRulePauseMatch) {
      const ruleId = decodeURIComponent(agentRulePauseMatch[1]!);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(ruleId) || url.search) throw serviceError("AGENT_RULE_PAUSE_INVALID", "Rule 暂停需要唯一受控 Rule ID。");
      const input = await readAgentPauseRequest(request, "paused");
      const result = await agentGovernanceApplication.setRulePaused(ruleId, input.paused, input.paused ? "用户从治理台暂停规则。" : "用户从治理台恢复规则。", {
        actor: "user", traceId: input.traceId, idempotencyKey: input.idempotencyKey,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/agent/settings" && !url.search) {
      respond(response, 200, { settings: await agentGovernanceApplication.getSettings() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/agent/settings/global-pause" && !url.search) {
      const input = await readAgentPauseRequest(request, "globalWritesPaused");
      const result = await agentGovernanceApplication.setGlobalWritesPaused(input.paused, {
        actor: "user", traceId: input.traceId, idempotencyKey: input.idempotencyKey,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/agent/settings/observation" && !url.search) {
      const input = await readAgentPauseRequest(request, "observationEnabled");
      const result = await agentGovernanceApplication.setObservationEnabled(input.paused, {
        actor: "user", traceId: input.traceId, idempotencyKey: input.idempotencyKey,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/agent/settings/expanded-context" && !url.search) {
      const input = await readAgentPauseRequest(request, "expandedContextEnabled");
      const result = await agentGovernanceApplication.setExpandedContextEnabled(input.paused, {
        actor: "user", traceId: input.traceId, idempotencyKey: input.idempotencyKey,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/agent/retention/preview" && !url.search) {
      respond(response, 200, { preview: await agentGovernanceApplication.previewRetention() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/agent/retention/run" && !url.search) {
      const input = await readAgentRetentionRequest(request);
      const result = await agentGovernanceApplication.runRetentionCleanup("EXPIRE_REVIEW_SIGNAL_INDEX_ONLY", {
        actor: "user", traceId: input.traceId, idempotencyKey: input.idempotencyKey,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/agent/exports/skill-feedback" && !url.search) {
      const input = await readAgentExportRequest(request, "SKILL_FEEDBACK");
      const generatedAt = new Date();
      const since = new Date(generatedAt);
      since.setUTCDate(since.getUTCDate() - input.days);
      respond(response, 200, await agentGovernanceApplication.exportSkillFeedback({ since: since.toISOString(), until: generatedAt.toISOString() }, generatedAt));
      return;
    }
    if (request.method === "POST" && url.pathname === "/agent/exports/review-evidence" && !url.search) {
      const input = await readAgentExportRequest(request, "REVIEW_EVIDENCE");
      const generatedAt = new Date();
      const material = await agentGovernanceApplication.prepareReviewEvidenceExport(input.days as 60 | 180, generatedAt);
      const currentSources = new Array<AgentCurrentSourceEvidence>(material.signals.length);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(4, material.signals.length) }, async () => {
        while (cursor < material.signals.length) {
          const index = cursor++;
          const signal = material.signals[index]!;
          try {
            const graphResult = await graphReadBroker.read(signal.sourceRoot.kind === "BLOCK"
              ? { kind: "BLOCK", target: signal.sourceRoot.externalId, includeChildren: true, parents: 8 }
              : { kind: "PAGE", target: signal.sourceRoot.externalId, depth: 2 });
            if (graphResult.status === "NOT_FOUND") {
              currentSources[index] = { graphId: signal.graphId, sourceRoot: signal.sourceRoot, status: "MISSING" };
            } else if (graphResult.status === "ERROR") {
              currentSources[index] = { graphId: signal.graphId, sourceRoot: signal.sourceRoot, status: "ERROR" };
            } else {
              const blocks = graphResult.snapshot.blocks;
              currentSources[index] = {
                graphId: signal.graphId,
                sourceRoot: signal.sourceRoot,
                status: "FOUND",
                currentText: blocks.map(({ depth, content }) => `${"  ".repeat(depth)}${content}`).join("\n"),
                currentSnapshotHash: checksum(blocks.map(({ uuid, relation, depth, parentUuid, content }) => ({
                  uuid, relation, depth, ...(parentUuid ? { parentUuid } : {}), content: agentGovernanceSemanticText(content),
                }))),
                truncated: graphResult.snapshot.truncated,
              };
            }
          } catch {
            currentSources[index] = { graphId: signal.graphId, sourceRoot: signal.sourceRoot, status: "ERROR" };
          }
        }
      });
      await Promise.all(workers);
      respond(response, 200, buildAgentReviewEvidencePackage({
        generatedAt,
        days: input.days as 60 | 180,
        signals: material.signals,
        decisions: material.decisions,
        events: material.events,
        currentSources,
        sourceTotal: material.sourceTotal,
        truncated: material.truncated,
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/candidates/discover") {
      const input = await readCandidateDiscoveryRequest(request);
      const identity = createHash("sha256").update(stableJson({ graphId: options.graphId, sourceAnchorId: input.sourceAnchorId, candidateKind: input.candidateKind })).digest("hex").slice(0, 32);
      const result = await candidateApplication.discover({
        candidateId: `candidate_${identity}`,
        sourceAnchorId: input.sourceAnchorId,
        sourceVersion: input.sourceVersion,
        candidateKind: input.candidateKind,
        reason: input.reason,
        suggestion: input.suggestion,
      }, {
        actor: "logseq-plugin",
        traceId: input.traceId,
        idempotencyKey: `candidate-discover:${identity}:${checksum(input.sourceVersion)}`,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    const candidateDispositionMatch = request.method === "POST" ? url.pathname.match(/^\/candidates\/([^/]+)\/disposition$/) : null;
    if (candidateDispositionMatch?.[1]) {
      const candidateId = decodeURIComponent(candidateDispositionMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidateId)) throw serviceError("V2_CANDIDATE_DISPOSITION_REQUEST_INVALID", "Candidate ID 无效。");
      const input = await readCandidateDispositionRequest(request);
      const result = await candidateApplication.setDisposition(candidateId, input.disposition, { reason: input.reason, ...(input.deferredUntil ? { deferredUntil: input.deferredUntil } : {}) }, input.expectedUpdatedAt, {
        actor: "logseq-plugin",
        traceId: input.traceId,
        idempotencyKey: `candidate-disposition:${candidateId}:${checksum(input)}`,
      });
      respond(response, 200, result);
      return;
    }
    const candidateFormalizationMatch = request.method === "POST" ? url.pathname.match(/^\/candidates\/([^/]+)\/formalize$/) : null;
    if (candidateFormalizationMatch?.[1]) {
      const candidateId = decodeURIComponent(candidateFormalizationMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidateId)) throw serviceError("V2_CANDIDATE_FORMALIZATION_REQUEST_INVALID", "Candidate ID 无效。");
      const input = await readCandidateFormalizationRequest(request);
      const candidate = await candidateApplication.get(candidateId);
      if (!candidate) throw serviceError("V2_CANDIDATE_NOT_FOUND", "Candidate 不存在。");
      const expectedKind = input.objectType === "DECISION" ? "DECISION" : input.objectType === "OUTPUT" ? "OUTPUT" : "WORK_ITEM";
      if (candidate.sourceAnchorId !== input.sourceAnchorId || candidate.sourceVersion !== `${input.inputVersion}:${input.contentHash}` || candidate.candidateKind !== expectedKind) {
        throw serviceError("V2_CANDIDATE_STALE", "Candidate 来源或分类已变化；请重新扫描后再生成 Proposal。");
      }
      const proposalIdentity = createHash("sha256").update(stableJson({ graphId: options.graphId, candidateId, sourceVersion: candidate.sourceVersion })).digest("hex").slice(0, 32);
      const proposalId = `proposal_candidate_${proposalIdentity}`;
      const numericVersion = /^\d+$/.test(input.inputVersion) ? Number(input.inputVersion) : undefined;
      const blockTarget: V2Proposal["scope"]["modify"][number] = { kind: "BLOCK", id: input.sourceAnchorId, ...(numericVersion !== undefined && Number.isSafeInteger(numericVersion) ? { version: numericVersion } : {}), hash: input.contentHash };
      const now = new Date();
      const proposal: V2Proposal = {
        proposalId, schemaVersion: "v2", title: `正式化 ${input.text}`, context: "Candidate Review Center 中的显式对象候选。",
        understanding: `${candidate.reason} ${candidate.suggestion}`, objective: `经审阅后创建 ${input.objectType} 并绑定当前 Block。`,
        logic: "扫描只产生 Candidate；本 Proposal 经 Validator、Review 与 SemanticCommit 后才可成为正式状态。", finalPreview: input.content,
        unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [], modify: [blockTarget] }, preconditions: ["Candidate 来源版本与 Block hash 保持不变"],
        groups: [{ groupId: "formalize-candidate", explanation: "同一 Block 的 Graph 证据与 SQLite 对象创建不可拆分。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [],
          textPatches: [{ blockUuid: input.sourceAnchorId, beforeText: input.content, afterText: input.content, beforeHash: input.contentHash, afterHash: input.contentHash }],
          semanticOperations: [{ operationId: "create-candidate-object", kind: "CREATE_OBJECT", target: blockTarget, summary: `创建 ${input.objectType} 与 Primary Anchor`, payload: { objectType: input.objectType, text: input.text }, preconditions: [] }], disposition: "PENDING" }],
        status: "READY", createdAt: now.toISOString(),
      };
      const result = await candidateApplication.formalize(candidateId, proposal, input.expectedUpdatedAt, { actor: "logseq-plugin", traceId: input.traceId, idempotencyKey: `candidate-formalize:${candidateId}:${proposalIdentity}` }, now);
      respond(response, result.replayed ? 200 : 201, { candidate: result.candidate, record: store.storedProposal(result.proposal.proposalId), replayed: result.replayed });
      return;
    }
    const candidateUpdateMatch = request.method === "POST" ? url.pathname.match(/^\/candidates\/([^/]+)\/update$/) : null;
    if (candidateUpdateMatch?.[1]) {
      const candidateId = decodeURIComponent(candidateUpdateMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidateId)) throw serviceError("V2_CANDIDATE_UPDATE_REQUEST_INVALID", "Candidate ID 无效。");
      const input = await readCandidateObjectUpdateRequest(request);
      const candidate = await candidateApplication.get(candidateId);
      if (!candidate) throw serviceError("V2_CANDIDATE_NOT_FOUND", "Candidate 不存在。");
      if (candidate.sourceAnchorId !== input.sourceAnchorId || candidate.sourceVersion !== `${input.sourceInputVersion}:${input.sourceContentHash}`) {
        throw serviceError("V2_CANDIDATE_STALE", "Candidate 来源已变化；请重新分析后再生成更新 Proposal。");
      }
      const object = store.getObject(input.targetObjectId);
      const anchor = store.getPrimaryAnchorByExternal(options.graphId, input.targetExternalId);
      if (!object || !anchor || anchor.objectId !== object.objectId || anchor.status !== "active" || anchor.contentHash !== input.targetContentHash) {
        throw serviceError("V2_CANDIDATE_UPDATE_TARGET_STALE", "目标对象或 Primary Anchor 已变化；没有生成 Proposal。");
      }
      if (!["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"].includes(object.objectType)) throw serviceError("V2_CANDIDATE_UPDATE_TARGET_UNSUPPORTED", "更新已有对象当前只支持 Block 型正式对象。");
      if (input.sourceAnchorId === input.targetExternalId) throw serviceError("V2_CANDIDATE_UPDATE_TARGET_INVALID", "Candidate 来源不能同时作为被更新的目标 Anchor。");
      const beforeParsed = parseExplicitObjectSyntax(input.targetContent);
      const afterParsed = parseExplicitObjectSyntax(input.afterContent);
      if (beforeParsed.kind !== "OBJECT" || beforeParsed.objectType !== object.objectType || beforeParsed.title !== object.text) throw serviceError("V2_CANDIDATE_UPDATE_TARGET_STALE", "目标正文与正式对象投影不一致；没有生成 Proposal。");
      if (afterParsed.kind !== "OBJECT" || afterParsed.objectType !== object.objectType || afterParsed.marker !== beforeParsed.marker) throw serviceError("V2_CANDIDATE_UPDATE_REQUEST_INVALID", "最终正文必须保留目标对象类型、Marker 和非空标题；Lifecycle 变化请使用专用入口。");
      const proposalIdentity = createHash("sha256").update(stableJson({ graphId: options.graphId, candidateId, sourceVersion: candidate.sourceVersion, targetObjectId: object.objectId, targetVersion: object.version, afterHash: checksum(input.afterContent) })).digest("hex").slice(0, 32);
      const proposalId = `proposal_candidate_update_${proposalIdentity}`;
      const sourceVersion = /^\d+$/.test(input.sourceInputVersion) ? Number(input.sourceInputVersion) : undefined;
      const targetVersion = /^\d+$/.test(input.targetInputVersion) ? Number(input.targetInputVersion) : undefined;
      const sourceTarget: V2Proposal["scope"]["read"][number] = { kind: "BLOCK", id: input.sourceAnchorId, ...(sourceVersion !== undefined && Number.isSafeInteger(sourceVersion) ? { version: sourceVersion } : {}), hash: input.sourceContentHash };
      const blockTarget: V2Proposal["scope"]["modify"][number] = { kind: "BLOCK", id: input.targetExternalId, ...(targetVersion !== undefined && Number.isSafeInteger(targetVersion) ? { version: targetVersion } : {}), hash: input.targetContentHash };
      const objectTarget: V2Proposal["scope"]["modify"][number] = { kind: "OBJECT", id: object.objectId, version: object.version };
      const now = new Date();
      const proposal: V2Proposal = {
        proposalId, schemaVersion: "v2", title: `更新已有 ${object.objectType}：${object.text}`, context: "Candidate Review Center 中的补充信息。",
        understanding: `${candidate.reason} ${candidate.suggestion}`, objective: `经审阅后更新已有 ${object.objectType}，不创建第二对象。`,
        logic: "Candidate 来源保持只读；最终正文只在 Review 接受并完成 SemanticCommit 后同时更新 Logseq 与 SQLite 投影。", finalPreview: input.afterContent,
        unresolvedQuestions: [], source: { kind: "user" }, scope: { read: [sourceTarget], modify: [blockTarget, objectTarget] }, preconditions: ["Candidate 来源、目标对象版本与 Primary Anchor 正文保持不变"],
        groups: [{ groupId: "update-existing-object", explanation: "目标 Graph 正文与现有对象缓存必须作为一个可恢复 Commit 更新。", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [],
          textPatches: [{ blockUuid: input.targetExternalId, beforeText: input.targetContent, afterText: input.afterContent, beforeHash: input.targetContentHash, afterHash: checksum(input.afterContent) }],
          semanticOperations: [{ operationId: "rewrite-existing-object", kind: "REWRITE_BLOCK", target: blockTarget, summary: `更新已有 ${object.objectType} 正文`, payload: { objectId: object.objectId, objectType: object.objectType, beforeText: object.text, text: afterParsed.title }, preconditions: [] }], disposition: "PENDING" }],
        status: "READY", createdAt: now.toISOString(),
      };
      const result = await candidateApplication.formalize(candidateId, proposal, input.expectedUpdatedAt, { actor: "logseq-plugin", traceId: input.traceId, idempotencyKey: `candidate-update:${candidateId}:${proposalIdentity}` }, now);
      respond(response, result.replayed ? 200 : 201, { candidate: result.candidate, record: store.storedProposal(result.proposal.proposalId), replayed: result.replayed });
      return;
    }
    if (request.method === "POST" && url.pathname === "/associations") {
      const input = await readAssociationRequest(request);
      const result = await application.addAssociation(input.sourceObjectId, input.targetObjectId, {
        actor: "logseq-plugin", expectedVersion: input.expectedVersion,
        idempotencyKey: `association:${input.sourceObjectId}:${input.targetObjectId}:${input.expectedVersion}`,
        traceId: input.traceId,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/graph/bridge/next") {
      const next = await graphReadBroker.claim();
      respond(response, 200, next ? { request: next } : {});
      return;
    }
    if (request.method === "POST" && url.pathname === "/graph/bridge/result") {
      graphReadBroker.complete(await readGraphResultRequest(request));
      respond(response, 200, { accepted: true });
      return;
    }
    if (request.method === "POST" && url.pathname === "/graph/read") {
      const result = await graphReadBroker.read(await readGraphQueryRequest(request));
      if (result.status === "FOUND") {
        respond(response, 200, { snapshot: result.snapshot });
        return;
      }
      if (result.status === "NOT_FOUND") throw new StructuredError({ code: "GRAPH_READ_NOT_FOUND", message: "Logseq Desktop 中未找到目标。", ruleRefs: ["D-132", "D-135"] });
      throw new StructuredError({ code: result.errorCode, message: result.message, ruleRefs: ["D-132", "D-135"] });
    }
    if (request.method === "POST" && url.pathname === "/agent/observations") {
      const input = await readAgentGovernanceObservationRequest(request);
      const controller = new AbortController();
      const abort = () => { if (!response.writableEnded) controller.abort(); };
      response.once("close", abort);
      try {
        const result = await serializeByKey("agent-governance-observation", () => agentGovernanceRuntime.observe(input, controller.signal));
        if (!controller.signal.aborted) respond(response, 200, result);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        response.removeListener("close", abort);
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/skills") {
      respond(response, 200, { skills: await listTaskCopilotSkills() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/context/export") {
      const input = await readContextExportRequest(request);
      const skillSummaries = await listTaskCopilotSkills();
      const skillDocuments = (await Promise.all(skillSummaries.map(({ name }) => readTaskCopilotSkill(name)))).filter((skill) => skill !== undefined);
      let graphSnapshot;
      if (input.scope === "block" || input.scope === "page") {
        const result = await graphReadBroker.read(input.scope === "block"
          ? { kind: "BLOCK", target: input.id, includeChildren: true, parents: 2 }
          : { kind: "PAGE", target: input.id, depth: 2 });
        if (result.status === "NOT_FOUND") throw new StructuredError({ code: "GRAPH_READ_NOT_FOUND", message: "Logseq Desktop 中未找到 Context 目标。", ruleRefs: ["D-132", "D-135"] });
        if (result.status === "ERROR") throw new StructuredError({ code: result.errorCode, message: result.message, ruleRefs: ["D-132", "D-135"] });
        graphSnapshot = result.snapshot;
      }
      const contextPackage = buildContextPackage({
        getObject: (objectId) => store.getObject(objectId),
        listObjects: () => store.listObjects(),
        listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
        listAssociations: () => store.listAssociations(),
        getActivePrimaryAnchorByObject: (objectId) => store.getActivePrimaryAnchorByObject(objectId),
        databaseSchemaVersion: () => store.doctor().schemaVersion,
      }, skillDocuments, { kind: input.scope, id: input.id }, new Date(), graphSnapshot);
      respond(response, 200, { contextPackage, fingerprint: contextPackageFingerprint(contextPackage) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/ux/project-context-recovery") {
      const input = await readProjectContextRecoveryRequest(request);
      const project = store.getObject(input.objectId);
      if (!project) throw serviceError("V2_OBJECT_NOT_FOUND", "Project context recovery 目标不存在。");
      if (project.objectType !== "PROJECT") throw serviceError("UX_CONTEXT_PROJECT_REQUIRED", "Project context recovery 只接受正式 Project。");
      if (project.version !== input.expectedVersion) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "Project 已变化；没有调用 Provider。");
      if (!options.uxOutputGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Unified UX Provider；没有生成恢复草稿。");
      const skillDocuments = (await Promise.all([
        readTaskCopilotSkill("task-copilot-core"),
        readTaskCopilotSkill("recover-context"),
      ]));
      const coreSkill = skillDocuments[0];
      const recoverySkill = skillDocuments[1];
      if (!coreSkill || !recoverySkill) throw serviceError("UX_CONTEXT_SKILL_UNAVAILABLE", "Project context recovery 内置 Skill 不可用。");
      const contextPackage = buildContextPackage({
        getObject: (objectId) => store.getObject(objectId),
        listObjects: () => store.listObjects(),
        listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
        listAssociations: () => store.listAssociations(),
        getActivePrimaryAnchorByObject: (objectId) => store.getActivePrimaryAnchorByObject(objectId),
        databaseSchemaVersion: () => store.doctor().schemaVersion,
      }, [coreSkill, recoverySkill], { kind: "project", id: project.objectId }, new Date());
      const contextFingerprint = contextPackageFingerprint(contextPackage);
      const objects = store.listObjects();
      const proposals = await proposalApplication.list();
      const proposalTargets = new Map(proposals.map((record) => {
        const objectIds = new Set<string>();
        for (const target of record.proposal.scope.modify) if (target.kind === "OBJECT") objectIds.add(target.id);
        for (const group of record.proposal.groups) {
          for (const operation of group.semanticOperations) {
            if (operation.target.kind === "OBJECT") objectIds.add(operation.target.id);
          }
        }
        return [record.proposal.proposalId, {
          objectIds: [...objectIds].sort(),
          title: record.proposal.title,
        }] as const;
      }));
      const commits: V2ReentryCommitFact[] = store.listSemanticCommits().map((commit) => {
        const proposal = commit.proposalId ? proposalTargets.get(commit.proposalId) : undefined;
        return {
          semanticCommitId: commit.semanticCommitId,
          status: commit.status,
          objectIds: proposal?.objectIds ?? [],
          updatedAt: commit.updatedAt,
          ...(proposal?.title ? { title: proposal.title } : {}),
        };
      });
      const generation = buildProjectContextRecoveryGeneration({
        observedAt: contextPackage.manifest.generatedAt,
        project,
        objects,
        ownerships: store.listPrimaryOwnerships(),
        associations: store.listAssociations(),
        focus: store.listFocusSelections(),
        anchors: objects.map(({ objectId }) => store.getActivePrimaryAnchorByObject(objectId)).filter((anchor): anchor is V2Anchor => anchor !== undefined),
        commits,
        contextPackage,
        contextFingerprint,
        coreSkill,
        recoverySkill,
      });
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const generated = await options.uxOutputGenerator.generate({
          ...generation.request,
          signal: controller.signal,
        });
        const latest = store.getObject(project.objectId);
        if (!latest || latest.version !== input.expectedVersion) {
          if (generated.interactionId) {
            options.interactionEvidence?.setOutcome(generated.interactionId, "STALE", "V2_OBJECT_VERSION_CONFLICT");
          }
          throw serviceError("V2_OBJECT_VERSION_CONFLICT", "Project 在恢复草稿生成期间已变化；草稿已丢弃。");
        }
        respond(response, 200, { ...generated, contextFingerprint });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/ux/project-narration-proposal") {
      const input = await readProjectContextRecoveryRequest(request);
      const project = store.getObject(input.objectId);
      if (!project) throw serviceError("V2_OBJECT_NOT_FOUND", "Project 当前摘要目标不存在。");
      if (project.objectType !== "PROJECT" || project.lifecycle !== "OPEN" || !project.projectStructure) {
        throw serviceError("UX_CONTEXT_PROJECT_REQUIRED", "Project 当前摘要只接受带当前接口的 OPEN Project。");
      }
      if (project.version !== input.expectedVersion) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "Project 已变化；没有调用 Provider。");
      if (!options.uxOutputGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Unified UX Provider；没有生成摘要 Proposal。");
      const [coreSkill, recoverySkill] = await Promise.all([
        readTaskCopilotSkill("task-copilot-core"),
        readTaskCopilotSkill("recover-context"),
      ]);
      if (!coreSkill || !recoverySkill) throw serviceError("UX_CONTEXT_SKILL_UNAVAILABLE", "Project 当前摘要内置 Skill 不可用。");
      const contextPackage = buildContextPackage({
        getObject: (objectId) => store.getObject(objectId),
        listObjects: () => store.listObjects(),
        listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
        listAssociations: () => store.listAssociations(),
        getActivePrimaryAnchorByObject: (objectId) => store.getActivePrimaryAnchorByObject(objectId),
        databaseSchemaVersion: () => store.doctor().schemaVersion,
      }, [coreSkill, recoverySkill], { kind: "project", id: project.objectId }, new Date());
      const contextFingerprint = contextPackageFingerprint(contextPackage);
      const objects = store.listObjects();
      const proposals = await proposalApplication.list();
      const proposalTargets = new Map(proposals.map((record) => {
        const objectIds = new Set<string>();
        for (const target of record.proposal.scope.modify) if (target.kind === "OBJECT") objectIds.add(target.id);
        for (const group of record.proposal.groups) for (const operation of group.semanticOperations) {
          if (operation.target.kind === "OBJECT") objectIds.add(operation.target.id);
        }
        return [record.proposal.proposalId, [...objectIds].sort()] as const;
      }));
      const commits: V2ReentryCommitFact[] = store.listSemanticCommits().map((commit) => ({
        semanticCommitId: commit.semanticCommitId,
        status: commit.status,
        objectIds: commit.proposalId ? proposalTargets.get(commit.proposalId) ?? [] : [],
        updatedAt: commit.updatedAt,
      }));
      const generation = buildProjectContextRecoveryGeneration({
        observedAt: contextPackage.manifest.generatedAt,
        project,
        objects,
        ownerships: store.listPrimaryOwnerships(),
        associations: store.listAssociations(),
        focus: store.listFocusSelections(),
        anchors: objects.map(({ objectId }) => store.getActivePrimaryAnchorByObject(objectId)).filter((anchor): anchor is V2Anchor => anchor !== undefined),
        commits,
        contextPackage,
        contextFingerprint,
        coreSkill,
        recoverySkill,
      });
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const narrationRuntime = JSON.parse(generation.request.runtimeContext.content) as {
          uxAuthority?: { allowedNextActions?: unknown };
          [key: string]: unknown;
        };
        const narrationRuntimeContext = stableJson({
          ...narrationRuntime,
          machinePurpose: "OPTIMIZE_CURRENT_SUMMARY_ONLY",
          constraints: [
            "The output summary is a candidate replacement for Project currentSummary.",
            "Keep it concise, factual, and useful for reentry.",
            "Do not suggest structural changes.",
          ],
          uxAuthority: {
            ...(narrationRuntime.uxAuthority ?? {}),
            allowedNextActions: [],
          },
        });
        const generated = await options.uxOutputGenerator.generate({
          ...generation.request,
          minimumRiskLevel: "MEDIUM",
          requiresReview: true,
          allowedNextActions: [],
          runtimeContext: {
            version: `${generation.request.runtimeContext.version}:project-narration-v1`,
            content: narrationRuntimeContext,
          },
          signal: controller.signal,
        });
        const latest = store.getObject(project.objectId);
        if (!latest || latest.version !== input.expectedVersion) {
          if (generated.interactionId) {
            options.interactionEvidence?.setOutcome(generated.interactionId, "STALE", "V2_OBJECT_VERSION_CONFLICT");
          }
          throw serviceError("V2_OBJECT_VERSION_CONFLICT", "Project 在摘要生成期间已变化；草稿已丢弃。");
        }
        let proposal: V2Proposal;
        try {
          proposal = buildProjectNarrationProposal({
            project: latest,
            output: generated.output,
            createdAt: generated.output.provenance.generatedAt,
          });
        } catch (error) {
          throw serviceError("PROJECT_NARRATION_PROPOSAL_INVALID", error instanceof Error ? error.message : "Project 当前摘要 Proposal 无效。");
        }
        const submitted = await submitReviewProposal(proposal, new Date(proposal.createdAt));
        respond(response, 200, {
          record: submitted.record,
          replayed: submitted.replayed,
          provider: generated.provider,
          promptBundleVersion: generated.promptBundleVersion,
          contextFingerprint,
          ...(generated.interactionId ? { interactionId: generated.interactionId } : {}),
        });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/grill/project-creation/turn") {
      const input = await readProjectCreationGrillRequest(request);
      if (!options.grillTurnGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Grill Provider；没有生成 Project 创建会话草稿。");
      const prepared = await prepareProjectCreationGrillSource(input);
      const generation = buildProjectCreationGrillGeneration(prepared.source);
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const generated = await options.grillTurnGenerator.generate({ ...generation, signal: controller.signal });
        await prepared.revalidate();
        respond(response, 200, { ...generated, contextFingerprint: prepared.source.contextFingerprint });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/grill/project-creation/preview") {
      const input = await readProjectCreationGrillRequest(request);
      if (!options.projectCreationPreviewGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Project Creation Preview Provider；没有生成最终阅读预览。");
      const prepared = await prepareProjectCreationGrillSource(input);
      let generation: ReturnType<typeof buildProjectCreationPreviewGeneration>;
      try {
        generation = buildProjectCreationPreviewGeneration(prepared.source);
      } catch {
        throw serviceError("PROJECT_CREATION_PREVIEW_NOT_READY", "Project 创建的结果、边界、完成证据、材料去向、内部闭环、当前接口或页面关系尚未全部确认；没有调用 Preview Provider。");
      }
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const generated = await options.projectCreationPreviewGenerator.generate({ ...generation, signal: controller.signal });
        await prepared.revalidate();
        const previewHandle = projectCreationPreviewSessions.issue({
          input,
          preview: generated.output,
          sourceFingerprint: generation.authority.sourceFingerprint,
          ...(prepared.graphScopeHash ? { graphScopeHash: prepared.graphScopeHash } : {}),
          ...(prepared.pageAuthority ? { pageAuthority: prepared.pageAuthority } : {}),
        });
        respond(response, 200, { ...generated, contextFingerprint: prepared.source.contextFingerprint, previewHandle });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/grill/project-creation/proposal") {
      const input = await readProjectCreationProposalRequest(request);
      const session = projectCreationPreviewSessions.get(input.previewHandle);
      if (!session) throw serviceError("PROJECT_CREATION_PREVIEW_SESSION_EXPIRED", "Project 创建预览已过期或不属于当前 Service session；请重新生成预览。");
      const prepared = await prepareProjectCreationGrillSource(session.input);
      const generation = buildProjectCreationPreviewGeneration(prepared.source);
      if (
        generation.authority.sourceFingerprint !== session.sourceFingerprint
        || prepared.graphScopeHash !== session.graphScopeHash
        || ((prepared.pageAuthority !== undefined || session.pageAuthority !== undefined)
          && stableJson(prepared.pageAuthority ?? null) !== stableJson(session.pageAuthority ?? null))
      ) {
        throw serviceError("GRILL_SOURCE_STALE", "Project 创建来源在预览后已变化；没有创建 Proposal。");
      }
      const previewIntent = {
        finalReading: session.preview.finalReading,
        pageObjectRelationship: session.preview.pageObjectRelationship,
        sourceMaterials: session.preview.sourceMaterials,
        evidenceScope: {
          refs: session.preview.evidenceScope.refs,
          scopeHash: session.preview.evidenceScope.scopeHash,
        },
        provenance: {
          contractVersion: session.preview.provenance.contractVersion,
          promptVersion: session.preview.provenance.promptVersion,
          skillName: session.preview.provenance.skillName,
          skillVersion: session.preview.provenance.skillVersion,
          providerId: session.preview.provenance.providerId,
          providerVersion: session.preview.provenance.providerVersion,
          model: session.preview.provenance.model,
        },
      };
      const identity = createHash("sha256").update(stableJson({
        graphId: options.graphId,
        sourceFingerprint: session.sourceFingerprint,
        previewHandle: input.previewHandle,
        previewIntent,
      })).digest("hex");
      let proposal;
      try {
        proposal = buildProjectCreationProposal({
          proposalId: `proposal_project_creation_${identity.slice(0, 32)}`,
          preview: session.preview,
          source: session.input.sourceKind === "BLANK"
            ? { sourceKind: "BLANK" }
            : session.input.sourceKind === "PAGE"
              ? { sourceKind: "PAGE", page: session.pageAuthority! }
              : { sourceKind: "MINI_PROJECT", objectId: session.input.objectId, objectVersion: session.input.expectedVersion },
          sourceFingerprint: session.sourceFingerprint,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Project 创建 Preview 无法形成正式 Proposal。";
        if (message.includes("关系仍需确认")) throw serviceError("PROJECT_CREATION_RELATIONSHIP_REVIEW_REQUIRED", message);
        throw serviceError("PROJECT_CREATION_PROPOSAL_INVALID", message);
      }
      await prepared.revalidate();
      const submitted = await proposalApplication.submit(proposal, new Date(session.preview.provenance.generatedAt));
      respond(response, submitted.replayed ? 200 : 201, submitted);
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/grill/mini-project/turn") {
      const input = await readMiniProjectGrillRequest(request);
      if (!options.grillTurnGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Grill Provider；没有生成会话草稿。");
      const prepared = await prepareMiniProjectGrillSource(input);
      const generation = buildMiniProjectGrillGeneration(prepared.source);
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const generated = await options.grillTurnGenerator.generate({ ...generation, signal: controller.signal });
        await revalidateMiniProjectGrillSource(input, prepared.primaryAnchor, prepared.source.graphSnapshot.scopeHash);
        respond(response, 200, { ...generated, contextFingerprint: prepared.source.contextFingerprint });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/grill/mini-project/preview") {
      const input = await readMiniProjectGrillRequest(request);
      if (!options.grillPreviewGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Grill Preview Provider；没有生成结构预览。");
      const prepared = await prepareMiniProjectGrillSource(input);
      let generation: ReturnType<typeof buildMiniProjectGrillPreviewGeneration>;
      try {
        generation = buildMiniProjectGrillPreviewGeneration(prepared.source);
      } catch {
        throw serviceError("GRILL_PREVIEW_NOT_READY", "MiniProject 的成果、边界、完成证据或材料去向尚未全部确认；没有调用 Preview Provider。");
      }
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const generated = await options.grillPreviewGenerator.generate({ ...generation, signal: controller.signal });
        await revalidateMiniProjectGrillSource(input, prepared.primaryAnchor, prepared.source.graphSnapshot.scopeHash);
        const previewHandle = grillPreviewSessions.issue({ objectId: input.objectId, expectedVersion: input.expectedVersion, answers: [...input.answers], preview: generated.output, graphScopeHash: prepared.source.graphSnapshot.scopeHash });
        respond(response, 200, { ...generated, contextFingerprint: prepared.source.contextFingerprint, previewHandle });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/grill/mini-project/proposal") {
      const input = await readMiniProjectGrillProposalRequest(request);
      const session = grillPreviewSessions.get(input.previewHandle);
      if (!session || session.objectId !== input.objectId || session.expectedVersion !== input.expectedVersion) throw serviceError("GRILL_PREVIEW_SESSION_EXPIRED", "结构预览已过期或不属于当前 Service session；请重新生成预览。");
      const prepared = await prepareMiniProjectGrillSource({ objectId: input.objectId, expectedVersion: input.expectedVersion, answers: session.answers });
      buildMiniProjectGrillPreviewGeneration(prepared.source);
      if (prepared.source.graphSnapshot.scopeHash !== session.graphScopeHash) throw serviceError("GRILL_SOURCE_STALE", "MiniProject 来源在预览后已变化；没有创建 Proposal。");
      const identity = createHash("sha256").update(stableJson({ graphId: options.graphId, objectId: input.objectId, expectedVersion: input.expectedVersion, graphScopeHash: session.graphScopeHash, previewScopeHash: session.preview.evidenceScope.scopeHash })).digest("hex");
      const proposalId = `proposal_mini_restructure_${identity.slice(0, 32)}`;
      const createdBlockUuids: Record<string, string> = {};
      for (const section of session.preview.finalReading.sections) {
        if (section.sectionId !== "root") createdBlockUuids[`section:${section.sectionId}`] = deterministicBlockUuid(`${proposalId}:section:${section.sectionId}`);
        section.derivedBlocks.forEach((_block, index) => { createdBlockUuids[`derived:${section.sectionId}:${index}`] = deterministicBlockUuid(`${proposalId}:derived:${section.sectionId}:${index}`); });
      }
      let proposal: ReturnType<typeof buildMiniProjectRestructureProposal>;
      try {
        proposal = buildMiniProjectRestructureProposal({ proposalId, createdAt: session.preview.provenance.generatedAt, objectId: input.objectId, objectVersion: input.expectedVersion, preview: session.preview, sourceScopeHash: prepared.source.graphSnapshot.scopeHash, sourcePositions: buildMiniProjectSourcePositions(prepared.source.graphSnapshot), createdBlockUuids });
      } catch (error) {
        if (error instanceof Error && error.message === "MiniProject restructure proposal has no structural change.") {
          throw serviceError("GRILL_PREVIEW_NO_STRUCTURAL_CHANGE", "当前阅读预览不需要移动或新增 Block；讨论已完成，但无需创建正式变更。");
        }
        throw miniProjectRestructureProposalBuildError(error);
      }
      await revalidateMiniProjectGrillSource(input, prepared.primaryAnchor, prepared.source.graphSnapshot.scopeHash);
      const submitted = await proposalApplication.submit(proposal, new Date(session.preview.provenance.generatedAt));
      respond(response, submitted.replayed ? 200 : 201, submitted);
      return;
    }
    const miniProjectRestructurePrepareMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/mini-project-restructure\/commit\/prepare$/) : null;
    if (miniProjectRestructurePrepareMatch?.[1]) {
      const proposalId = decodeURIComponent(miniProjectRestructurePrepareMatch[1]);
      const input = await readMiniProjectRestructurePrepareRequest(request);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const existing = store.semanticCommit(semanticCommitId);
      if (existing?.status === "FAILED") {
        if (existing.proposalId !== proposalId) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构终态账本与 Proposal 不一致。");
        const record = stored.proposal.status === "FAILED" ? stored : await proposalApplication.markFailed(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "FAILED_COMPENSATED", semanticCommitId, proposalId, record, replayed: true });
        return;
      }
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      const expectedSteps = plan.steps.map((step, stepIndex) => ({ semanticCommitId, stepIndex, stepKind: "GRAPH_WRITE" as const, status: "PREPARED" as const, operationId: step.operationId, beforeHash: step.beforeHash, afterHash: step.afterHash }));
      if (existing) {
        const steps = store.semanticCommitSteps(semanticCommitId);
        const matches = existing.proposalId === proposalId && steps.length === expectedSteps.length && steps.every((step, index) => {
          const expected = expectedSteps[index]!;
          return step.stepIndex === expected.stepIndex && step.stepKind === expected.stepKind && step.operationId === expected.operationId && step.beforeHash === expected.beforeHash && step.afterHash === expected.afterHash;
        });
        if (!matches) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构账本与已审阅结构计划不一致。");
        if (existing.status === "COMPLETED") {
          const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
          respond(response, 200, { status: "COMPLETED", semanticCommitId, proposalId, record, replayed: true });
          return;
        }
        if (existing.status === "RECOVERY_REQUIRED") {
          const failed = steps.find(({ status }) => status === "RECOVERY_REQUIRED");
          if (!failed) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构恢复账本缺少待补偿 step。");
          respond(response, 200, { status: "RECOVERY_REQUIRED", semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, plan, stepStatuses: steps.map(({ status }) => status), failedStepIndex: failed.stepIndex, errorCode: existing.errorCode ?? "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_REQUIRED", replayed: true, formalGraphWritesExecuted: false });
          return;
        }
        if (existing.status !== "PENDING") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构账本处于不支持的状态。");
        respond(response, 200, { status: "PREPARED", semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, plan, stepStatuses: steps.map(({ status }) => status), replayed: true, formalGraphWritesExecuted: false });
        return;
      }
      requireNoUnfinishedProposalCommit(proposalId);
      const subject = store.getObject(plan.objectId);
      const anchor = store.getActivePrimaryAnchorByObject(plan.objectId);
      if (!subject || subject.objectType !== "MINI_PROJECT" || subject.lifecycle !== "OPEN" || subject.version !== plan.expectedVersion || !anchor || anchor.role !== "primary_text" || anchor.externalId !== plan.sourceRootBlockUuid) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_SUBJECT_STALE", "MiniProject 对象、版本或正文入口已变化；没有准备 Commit。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      if (graphResult.status === "NOT_FOUND") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_SOURCE_STALE", "MiniProject 来源子树已不存在；没有准备 Commit。");
      if (graphResult.status === "ERROR") throw new StructuredError({ code: graphResult.errorCode, message: graphResult.message, ruleRefs: ["D-132", "D-135"] });
      const snapshot = graphResult.snapshot;
      if (snapshot.kind !== "BLOCK" || snapshot.resolved.id !== plan.sourceRootBlockUuid || snapshot.truncated || snapshot.scopeHash !== plan.sourceScopeHash) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_SOURCE_STALE", "MiniProject 完整子树在审阅后已变化；没有准备 Commit。");
      if (miniProjectStructureHash(buildMiniProjectSourcePositions(snapshot)) !== plan.sourceStructureHash) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_SOURCE_STALE", "MiniProject 子树结构指纹在审阅后已变化；没有准备 Commit。");
      const blocks = new Map(snapshot.blocks.map((block) => [block.uuid, block]));
      const observations = requiredV2ProposalRevalidationScope(stored.proposal).targets.filter((target) => target.kind === "BLOCK").map((target): V2ProposalScopeObservation => {
        const block = blocks.get(target.id);
        return block ? { kind: "BLOCK", id: target.id, exists: true, hash: block.contentHash } : { kind: "BLOCK", id: target.id, exists: false };
      });
      const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, observations), input.expectedUpdatedAt);
      if (revalidation.result.status === "STALE") { respond(response, 200, { status: "STALE", ...revalidation }); return; }
      for (const step of plan.steps) {
        if (step.kind !== "MOVE_BLOCK") continue;
        const block = blocks.get(step.blockUuid);
        const siblings = snapshot.blocks.filter((candidate) => candidate.parentUuid === step.fromParentBlockUuid);
        const index = siblings.findIndex((candidate) => candidate.uuid === step.blockUuid);
        const previousSiblingUuid = index > 0 ? siblings[index - 1]!.uuid : null;
        if (!block || block.contentHash !== step.contentHash || block.parentUuid !== step.fromParentBlockUuid || previousSiblingUuid !== step.fromPreviousSiblingUuid) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_POSITION_STALE", "原材料 Block 的父级或相邻位置已变化；没有准备 Commit。");
      }
      const now = new Date().toISOString();
      store.prepareSemanticCommit({ semanticCommitId, proposalId, status: "PENDING", beforeStateChecksum: checksum({ proposal: stored.files.proposalJson, sourceScopeHash: plan.sourceScopeHash, sourceStructureHash: plan.sourceStructureHash, expectedStructureHash: plan.expectedStructureHash }), createdAt: now, updatedAt: now }, expectedSteps.map((step) => ({ ...step, updatedAt: now })));
      respond(response, 201, { status: "PREPARED", semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, plan, stepStatuses: expectedSteps.map(({ status }) => status), replayed: false, formalGraphWritesExecuted: false });
      return;
    }
    const miniProjectRestructureVerifyMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/mini-project-restructure\/commit\/steps\/(\d+)\/verify$/) : null;
    if (miniProjectRestructureVerifyMatch?.[1] && miniProjectRestructureVerifyMatch[2]) {
      const proposalId = decodeURIComponent(miniProjectRestructureVerifyMatch[1]);
      const stepIndex = Number(miniProjectRestructureVerifyMatch[2]);
      const input = await readMiniProjectRestructureVerifyRequest(request);
      if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex > 63 || input.semanticCommitId !== proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt)) throw serviceError("MINI_PROJECT_RESTRUCTURE_VERIFY_REQUEST_INVALID", "MiniProject 原位重构核验目标与账本意图不匹配。");
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      const commit = store.semanticCommit(input.semanticCommitId);
      const ledgerSteps = store.semanticCommitSteps(input.semanticCommitId);
      const step = plan.steps[stepIndex];
      if (!commit || commit.proposalId !== proposalId || !step || ledgerSteps.length !== plan.steps.length || ledgerSteps.some((ledgerStep, index) => ledgerStep.stepKind !== "GRAPH_WRITE" || ledgerStep.operationId !== plan.steps[index]!.operationId || ledgerStep.beforeHash !== plan.steps[index]!.beforeHash || ledgerStep.afterHash !== plan.steps[index]!.afterHash)) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构核验账本与已审阅计划不一致。");
      if (commit.status === "COMPLETED") {
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "COMPLETED", semanticCommitId: input.semanticCommitId, proposalId, record, replayed: true });
        return;
      }
      if (commit.status === "RECOVERY_REQUIRED") {
        const recoveryStep = ledgerSteps.find(({ status }) => status === "RECOVERY_REQUIRED");
        respond(response, 200, { status: "RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex: recoveryStep?.stepIndex ?? stepIndex, errorCode: commit.errorCode ?? "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_REQUIRED" });
        return;
      }
      if (commit.status !== "PENDING" || ledgerSteps.slice(0, stepIndex).some(({ status }) => status !== "VERIFIED") || ledgerSteps.slice(stepIndex + 1).some(({ status }) => status !== "PREPARED")) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_STEP_ORDER_INVALID", "MiniProject 原位重构必须按账本顺序逐步核验。");
      const currentLedgerStep = ledgerSteps[stepIndex]!;
      if (currentLedgerStep.status === "VERIFIED") {
        respond(response, 200, { status: "VERIFIED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, stepStatus: "VERIFIED", ...(stepIndex + 1 < plan.steps.length ? { nextStepIndex: stepIndex + 1 } : {}) });
        return;
      }
      if (currentLedgerStep.status !== "PREPARED" && currentLedgerStep.status !== "APPLIED") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_STEP_ORDER_INVALID", "MiniProject 原位重构 step 当前不能核验。");
      const subject = store.getObject(plan.objectId);
      const anchor = store.getActivePrimaryAnchorByObject(plan.objectId);
      if (!subject || subject.objectType !== "MINI_PROJECT" || subject.lifecycle !== "OPEN" || subject.version !== plan.expectedVersion || !anchor || anchor.externalId !== plan.sourceRootBlockUuid) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_SUBJECT_STALE", "MiniProject 对象或正文入口在结构应用期间已变化。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      if (graphResult.status !== "FOUND" || graphResult.snapshot.kind !== "BLOCK" || graphResult.snapshot.resolved.id !== plan.sourceRootBlockUuid || graphResult.snapshot.truncated) {
        const now = new Date().toISOString();
        store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_GRAPH_UNREADABLE");
        store.finalizeSemanticCommit(input.semanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_GRAPH_UNREADABLE");
        respond(response, 200, { status: "RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_GRAPH_UNREADABLE" });
        return;
      }
      const positions = buildMiniProjectSourcePositions(graphResult.snapshot);
      const position = positions.find(({ blockUuid }) => blockUuid === step.blockUuid);
      const matchesPosition = (parentBlockUuid: string, previousSiblingUuid: string | null): boolean => Boolean(position && position.contentHash === step.contentHash && position.parentBlockUuid === parentBlockUuid && position.previousSiblingUuid === previousSiblingUuid);
      const before = step.kind === "CREATE_BLOCK" ? position === undefined : matchesPosition(step.applyFromParentBlockUuid, step.applyFromPreviousSiblingUuid);
      const after = step.kind === "CREATE_BLOCK" ? matchesPosition(step.parentBlockUuid, step.previousSiblingUuid) : matchesPosition(step.toParentBlockUuid, step.toPreviousSiblingUuid);
      if (before && currentLedgerStep.status === "PREPARED") {
        respond(response, 200, { status: "NOT_APPLIED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, stepStatus: "PREPARED" });
        return;
      }
      if (!after) {
        const now = new Date().toISOString();
        store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_STEP_DIVERGED");
        store.finalizeSemanticCommit(input.semanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_STEP_DIVERGED");
        respond(response, 200, { status: "RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_STEP_DIVERGED" });
        return;
      }
      const now = new Date().toISOString();
      if (currentLedgerStep.status === "PREPARED") store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "APPLIED", now);
      if (store.semanticCommitSteps(input.semanticCommitId)[stepIndex]?.status === "APPLIED") store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "VERIFIED", now);
      if (stepIndex + 1 < plan.steps.length) {
        respond(response, 200, { status: "VERIFIED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, stepStatus: "VERIFIED", nextStepIndex: stepIndex + 1 });
        return;
      }
      if (miniProjectStructureHash(positions) !== plan.expectedStructureHash) {
        store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_FINAL_SHAPE_MISMATCH");
        store.finalizeSemanticCommit(input.semanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_FINAL_SHAPE_MISMATCH");
        respond(response, 200, { status: "RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_FINAL_SHAPE_MISMATCH" });
        return;
      }
      store.finalizeSemanticCommit(input.semanticCommitId, "COMPLETED", now, plan.expectedStructureHash);
      const record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, new Date(now));
      respond(response, 200, { status: "COMPLETED", semanticCommitId: input.semanticCommitId, proposalId, record, replayed: false });
      return;
    }
    const miniProjectRestructureRecoveryBeginMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/mini-project-restructure\/commit\/recovery\/begin$/) : null;
    if (miniProjectRestructureRecoveryBeginMatch?.[1]) {
      const proposalId = decodeURIComponent(miniProjectRestructureRecoveryBeginMatch[1]);
      const input = await readMiniProjectRestructureRecoveryRequest(request);
      if (input.semanticCommitId !== proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt)) throw serviceError("MINI_PROJECT_RESTRUCTURE_RECOVERY_REQUEST_INVALID", "MiniProject 原位重构恢复意图与账本不匹配。");
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const commit = store.semanticCommit(input.semanticCommitId);
      if (!commit || commit.proposalId !== proposalId) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构恢复账本与 Proposal 不一致。");
      if (commit.status === "FAILED") {
        const record = stored.proposal.status === "FAILED" ? stored : await proposalApplication.markFailed(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, record, replayed: true });
        return;
      }
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      const ledgerSteps = store.semanticCommitSteps(input.semanticCommitId);
      if (ledgerSteps.length !== plan.steps.length || !plan.steps[input.failedStepIndex]) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构恢复账本与计划不一致。");
      const compensationFor = (stepIndex: number) => {
        const operationId = `compensate:${plan.steps[stepIndex]!.operationId}`;
        const step = plan.compensationSteps.find((candidate) => candidate.operationId === operationId);
        if (!step) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构缺少逆向计划。");
        return { stepIndex, step };
      };
      const remainingCompensations = () => store.semanticCommitSteps(input.semanticCommitId).filter(({ status }) => status === "RECOVERY_REQUIRED").map(({ stepIndex }) => compensationFor(stepIndex)).sort((left, right) => right.stepIndex - left.stepIndex);
      if (commit.status === "RECOVERY_REQUIRED") {
        const compensations = remainingCompensations();
        if (compensations.length === 0) {
          respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex: input.failedStepIndex, errorCode: commit.errorCode ?? "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_REQUIRED" });
        } else respond(response, 200, { status: "COMPENSATION_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, compensations, replayed: true });
        return;
      }
      if (commit.status !== "PENDING" || ledgerSteps.slice(0, input.failedStepIndex).some(({ status }) => status !== "VERIFIED") || ledgerSteps.slice(input.failedStepIndex + 1).some(({ status }) => status !== "PREPARED") || !["PREPARED", "APPLIED"].includes(ledgerSteps[input.failedStepIndex]!.status)) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_STEP_ORDER_INVALID", "恢复只能从第一个未完成结构 step 开始。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      const currentPlanStep = plan.steps[input.failedStepIndex]!;
      const markRecovery = (errorCode: string): void => {
        const now = new Date().toISOString();
        const status = store.semanticCommitSteps(input.semanticCommitId)[input.failedStepIndex]!.status;
        if (status === "PREPARED" || status === "APPLIED") store.advanceSemanticCommitStep(input.semanticCommitId, input.failedStepIndex, "RECOVERY_REQUIRED", now, errorCode);
        if (store.semanticCommit(input.semanticCommitId)?.status === "PENDING") store.finalizeSemanticCommit(input.semanticCommitId, "RECOVERY_REQUIRED", now, undefined, errorCode);
      };
      if (graphResult.status !== "FOUND" || graphResult.snapshot.kind !== "BLOCK" || graphResult.snapshot.resolved.id !== plan.sourceRootBlockUuid || graphResult.snapshot.truncated) {
        markRecovery("V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_GRAPH_UNREADABLE");
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex: input.failedStepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_GRAPH_UNREADABLE" });
        return;
      }
      const positions = buildMiniProjectSourcePositions(graphResult.snapshot);
      const position = positions.find(({ blockUuid }) => blockUuid === currentPlanStep.blockUuid);
      const matches = (parentBlockUuid: string, previousSiblingUuid: string | null) => Boolean(position && position.contentHash === currentPlanStep.contentHash && position.parentBlockUuid === parentBlockUuid && position.previousSiblingUuid === previousSiblingUuid);
      const before = currentPlanStep.kind === "CREATE_BLOCK" ? position === undefined : matches(currentPlanStep.applyFromParentBlockUuid, currentPlanStep.applyFromPreviousSiblingUuid);
      const after = currentPlanStep.kind === "CREATE_BLOCK"
        ? Boolean(position && position.contentHash === currentPlanStep.contentHash && position.parentBlockUuid === currentPlanStep.parentBlockUuid && !positions.some(({ parentBlockUuid }) => parentBlockUuid === currentPlanStep.blockUuid))
        : matches(currentPlanStep.toParentBlockUuid, currentPlanStep.toPreviousSiblingUuid);
      if (!before && !after) {
        markRecovery("V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_DIVERGED");
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex: input.failedStepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_DIVERGED" });
        return;
      }
      const appliedIndexes = ledgerSteps.slice(0, input.failedStepIndex).map(({ stepIndex }) => stepIndex);
      if (after) appliedIndexes.push(input.failedStepIndex);
      const now = new Date().toISOString();
      if (after && ledgerSteps[input.failedStepIndex]!.status === "PREPARED") store.advanceSemanticCommitStep(input.semanticCommitId, input.failedStepIndex, "APPLIED", now);
      for (const stepIndex of [...appliedIndexes, ...(before ? [input.failedStepIndex] : [])]) {
        const status = store.semanticCommitSteps(input.semanticCommitId)[stepIndex]!.status;
        if (status === "VERIFIED" || status === "APPLIED" || status === "PREPARED") store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_EXECUTION_FAILED");
      }
      store.finalizeSemanticCommit(input.semanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_EXECUTION_FAILED");
      if (before) store.advanceSemanticCommitStep(input.semanticCommitId, input.failedStepIndex, "COMPENSATED", now);
      const compensations = remainingCompensations();
      if (compensations.length === 0) {
        if (miniProjectStructureHash(positions) !== plan.sourceStructureHash) {
          respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex: input.failedStepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_SHAPE_MISMATCH" });
          return;
        }
        store.finalizeSemanticCommit(input.semanticCommitId, "FAILED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_EXECUTION_FAILED");
        const record = await proposalApplication.markFailed(proposalId, input.expectedUpdatedAt, new Date(now));
        respond(response, 200, { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, record, replayed: false });
        return;
      }
      respond(response, 200, { status: "COMPENSATION_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, compensations, replayed: false });
      return;
    }
    const miniProjectRestructureCompensationVerifyMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/mini-project-restructure\/commit\/recovery\/steps\/(\d+)\/verify$/) : null;
    if (miniProjectRestructureCompensationVerifyMatch?.[1] && miniProjectRestructureCompensationVerifyMatch[2]) {
      const proposalId = decodeURIComponent(miniProjectRestructureCompensationVerifyMatch[1]);
      const stepIndex = Number(miniProjectRestructureCompensationVerifyMatch[2]);
      const input = await readMiniProjectRestructureVerifyRequest(request);
      if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex > 63 || input.semanticCommitId !== proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt)) throw serviceError("MINI_PROJECT_RESTRUCTURE_RECOVERY_REQUEST_INVALID", "MiniProject 原位重构补偿核验意图与账本不匹配。");
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const commit = store.semanticCommit(input.semanticCommitId);
      if (!commit || commit.proposalId !== proposalId) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构补偿账本与 Proposal 不一致。");
      if (commit.status === "FAILED") {
        const record = stored.proposal.status === "FAILED" ? stored : await proposalApplication.markFailed(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, record, replayed: true });
        return;
      }
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      let ledgerSteps = store.semanticCommitSteps(input.semanticCommitId);
      if (!plan.steps[stepIndex] || ledgerSteps.length !== plan.steps.length) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_LEDGER_CORRUPT", "MiniProject 原位重构补偿账本与计划不一致。");
      if (commit.status !== "RECOVERY_REQUIRED" || ledgerSteps.slice(stepIndex + 1).some(({ status }) => status === "RECOVERY_REQUIRED")) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_COMPENSATION_ORDER_INVALID", "MiniProject 原位重构必须按逆序补偿。");
      if (ledgerSteps[stepIndex]!.status === "COMPENSATED") {
        const next = ledgerSteps.filter(({ status }) => status === "RECOVERY_REQUIRED").map(({ stepIndex: index }) => index).sort((a, b) => b - a)[0];
        respond(response, 200, { status: "COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, ...(next !== undefined ? { nextStepIndex: next } : {}) });
        return;
      }
      if (ledgerSteps[stepIndex]!.status !== "RECOVERY_REQUIRED") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_COMPENSATION_ORDER_INVALID", "当前结构 step 不需要补偿。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      if (graphResult.status !== "FOUND" || graphResult.snapshot.kind !== "BLOCK" || graphResult.snapshot.resolved.id !== plan.sourceRootBlockUuid || graphResult.snapshot.truncated) {
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_GRAPH_UNREADABLE" });
        return;
      }
      const positions = buildMiniProjectSourcePositions(graphResult.snapshot);
      const planStep = plan.steps[stepIndex]!;
      const position = positions.find(({ blockUuid }) => blockUuid === planStep.blockUuid);
      const matches = (parentBlockUuid: string, previousSiblingUuid: string | null) => Boolean(position && position.contentHash === planStep.contentHash && position.parentBlockUuid === parentBlockUuid && position.previousSiblingUuid === previousSiblingUuid);
      const compensated = planStep.kind === "CREATE_BLOCK" ? position === undefined : matches(planStep.fromParentBlockUuid, planStep.fromPreviousSiblingUuid);
      const stillApplied = planStep.kind === "CREATE_BLOCK"
        ? Boolean(position && position.contentHash === planStep.contentHash && position.parentBlockUuid === planStep.parentBlockUuid && !positions.some(({ parentBlockUuid }) => parentBlockUuid === planStep.blockUuid))
        : matches(planStep.toParentBlockUuid, planStep.toPreviousSiblingUuid);
      if (stillApplied) {
        respond(response, 200, { status: "NOT_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex });
        return;
      }
      if (!compensated) {
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_COMPENSATION_DIVERGED" });
        return;
      }
      const now = new Date().toISOString();
      store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "COMPENSATED", now);
      ledgerSteps = store.semanticCommitSteps(input.semanticCommitId);
      const next = ledgerSteps.filter(({ status }) => status === "RECOVERY_REQUIRED").map(({ stepIndex: index }) => index).sort((a, b) => b - a)[0];
      if (next !== undefined) {
        respond(response, 200, { status: "COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, nextStepIndex: next });
        return;
      }
      if (miniProjectStructureHash(positions) !== plan.sourceStructureHash) {
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_RECOVERY_SHAPE_MISMATCH" });
        return;
      }
      store.finalizeSemanticCommit(input.semanticCommitId, "FAILED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_EXECUTION_FAILED");
      const record = await proposalApplication.markFailed(proposalId, input.expectedUpdatedAt, new Date(now));
      respond(response, 200, { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, record, replayed: false });
      return;
    }
    const miniProjectRestructureUndoPrepareMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/mini-project-restructure\/undo\/prepare$/) : null;
    if (miniProjectRestructureUndoPrepareMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(miniProjectRestructureUndoPrepareMatch[1]);
      await readMiniProjectRestructureUndoPrepareRequest(request);
      const original = store.semanticCommit(originalSemanticCommitId);
      if (!original?.proposalId || !["COMPLETED", "UNDONE"].includes(original.status)) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_NOT_AVAILABLE", "只有已完成的 MiniProject 结构 Commit 可以 Undo。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 找不到原 Proposal。");
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      const forwardSteps = store.semanticCommitSteps(originalSemanticCommitId);
      if (forwardSteps.length !== plan.steps.length || forwardSteps.some((step, index) => step.status !== "VERIFIED" || step.stepKind !== "GRAPH_WRITE" || step.operationId !== plan.steps[index]!.operationId || step.beforeHash !== plan.steps[index]!.beforeHash || step.afterHash !== plan.steps[index]!.afterHash)) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 的正向账本与已审阅计划不一致。");
      const undoSemanticCommitId = miniProjectRestructureUndoSemanticCommitId(originalSemanticCommitId);
      const undoPlan = miniProjectRestructureUndoPlan(plan);
      const expectedSteps = undoPlan.map(({ stepIndex, operationId, beforeHash, afterHash }) => ({ semanticCommitId: undoSemanticCommitId, stepIndex, stepKind: "GRAPH_WRITE" as const, status: "PREPARED" as const, operationId, beforeHash, afterHash }));
      const existing = store.semanticCommit(undoSemanticCommitId);
      if (existing) {
        const ledgerSteps = store.semanticCommitSteps(undoSemanticCommitId);
        const matches = existing.proposalId === original.proposalId && ledgerSteps.length === expectedSteps.length && ledgerSteps.every((step, index) => {
          const expected = expectedSteps[index]!;
          return step.stepIndex === expected.stepIndex && step.stepKind === expected.stepKind && step.operationId === expected.operationId && step.beforeHash === expected.beforeHash && step.afterHash === expected.afterHash;
        });
        if (!matches) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 逆向账本与原 Commit 不一致。");
        if (existing.status === "COMPLETED") {
          if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
          respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: true });
          return;
        }
        if (original.status === "UNDONE") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "已撤销结构 Commit 缺少完成的 inverse Commit。");
        if (existing.status === "FAILED") {
          respond(response, 200, { status: "FAILED_COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: true });
          return;
        }
        if (existing.status === "RECOVERY_REQUIRED") {
          const failed = ledgerSteps.find(({ status }) => status === "RECOVERY_REQUIRED");
          if (!failed) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 恢复账本缺少待补偿 step。");
          respond(response, 200, { status: "RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, sourceRootBlockUuid: plan.sourceRootBlockUuid, sourceStructureHash: plan.sourceStructureHash, expectedStructureHash: plan.expectedStructureHash, steps: undoPlan.map(({ stepIndex, forwardStepIndex, step }) => ({ stepIndex, forwardStepIndex, step })), stepStatuses: ledgerSteps.map(({ status }) => status), failedStepIndex: failed.stepIndex, errorCode: existing.errorCode ?? "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_REQUIRED", replayed: true, formalGraphWritesExecuted: false });
          return;
        }
        if (existing.status !== "PENDING") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 账本处于不支持的状态。");
        respond(response, 200, { status: "PREPARED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, sourceRootBlockUuid: plan.sourceRootBlockUuid, sourceStructureHash: plan.sourceStructureHash, expectedStructureHash: plan.expectedStructureHash, steps: undoPlan.map(({ stepIndex, forwardStepIndex, step }) => ({ stepIndex, forwardStepIndex, step })), stepStatuses: ledgerSteps.map(({ status }) => status), replayed: true, formalGraphWritesExecuted: false });
        return;
      }
      if (original.status === "UNDONE") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "已撤销结构 Commit 缺少 inverse Commit。");
      const subject = store.getObject(plan.objectId);
      const anchor = store.getActivePrimaryAnchorByObject(plan.objectId);
      if (!subject || subject.objectType !== "MINI_PROJECT" || subject.lifecycle !== "OPEN" || subject.version !== plan.expectedVersion || !anchor || anchor.externalId !== plan.sourceRootBlockUuid) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_STATE_CHANGED", "MiniProject 对象或正文入口在结构 Commit 后已有变化；Undo 没有写入。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      if (graphResult.status !== "FOUND" || graphResult.snapshot.kind !== "BLOCK" || graphResult.snapshot.resolved.id !== plan.sourceRootBlockUuid || graphResult.snapshot.truncated || miniProjectStructureHash(buildMiniProjectSourcePositions(graphResult.snapshot)) !== plan.expectedStructureHash) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_STATE_CHANGED", "MiniProject 子树在结构 Commit 后已有变化；Undo 没有写入。");
      const now = new Date().toISOString();
      store.prepareSemanticCommit({ semanticCommitId: undoSemanticCommitId, proposalId: original.proposalId, status: "PENDING", beforeStateChecksum: plan.expectedStructureHash, createdAt: now, updatedAt: now }, expectedSteps.map((step) => ({ ...step, updatedAt: now })));
      respond(response, 201, { status: "PREPARED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, sourceRootBlockUuid: plan.sourceRootBlockUuid, sourceStructureHash: plan.sourceStructureHash, expectedStructureHash: plan.expectedStructureHash, steps: undoPlan.map(({ stepIndex, forwardStepIndex, step }) => ({ stepIndex, forwardStepIndex, step })), stepStatuses: expectedSteps.map(({ status }) => status), replayed: false, formalGraphWritesExecuted: false });
      return;
    }
    const miniProjectRestructureUndoVerifyMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/mini-project-restructure\/undo\/steps\/(\d+)\/verify$/) : null;
    if (miniProjectRestructureUndoVerifyMatch?.[1] && miniProjectRestructureUndoVerifyMatch[2]) {
      const originalSemanticCommitId = decodeURIComponent(miniProjectRestructureUndoVerifyMatch[1]);
      const stepIndex = Number(miniProjectRestructureUndoVerifyMatch[2]);
      const input = await readMiniProjectRestructureUndoVerifyRequest(request);
      const undoSemanticCommitId = miniProjectRestructureUndoSemanticCommitId(originalSemanticCommitId);
      if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex > 63 || input.undoSemanticCommitId !== undoSemanticCommitId) throw serviceError("MINI_PROJECT_RESTRUCTURE_UNDO_VERIFY_REQUEST_INVALID", "MiniProject 原位重构 Undo 核验目标与账本不匹配。");
      const original = store.semanticCommit(originalSemanticCommitId);
      const inverse = store.semanticCommit(undoSemanticCommitId);
      if (!original?.proposalId || !inverse || inverse.proposalId !== original.proposalId) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 的正向与逆向账本不一致。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 找不到原 Proposal。");
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      const undoPlan = miniProjectRestructureUndoPlan(plan);
      const undoStep = undoPlan[stepIndex];
      const ledgerSteps = store.semanticCommitSteps(undoSemanticCommitId);
      if (!undoStep || ledgerSteps.length !== undoPlan.length || ledgerSteps.some((step, index) => step.stepKind !== "GRAPH_WRITE" || step.operationId !== undoPlan[index]!.operationId || step.beforeHash !== undoPlan[index]!.beforeHash || step.afterHash !== undoPlan[index]!.afterHash)) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 账本与逆向计划不一致。");
      if (inverse.status === "COMPLETED") {
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: true });
        return;
      }
      if (inverse.status === "RECOVERY_REQUIRED") {
        const failed = ledgerSteps.find(({ status }) => status === "RECOVERY_REQUIRED");
        respond(response, 200, { status: "RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex: failed?.stepIndex ?? stepIndex, errorCode: inverse.errorCode ?? "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_REQUIRED" });
        return;
      }
      if (inverse.status !== "PENDING" || original.status !== "COMPLETED" || ledgerSteps.slice(0, stepIndex).some(({ status }) => status !== "VERIFIED") || ledgerSteps.slice(stepIndex + 1).some(({ status }) => status !== "PREPARED")) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_STEP_ORDER_INVALID", "MiniProject 原位重构 Undo 必须按逆向账本顺序核验。");
      const currentLedgerStep = ledgerSteps[stepIndex]!;
      if (currentLedgerStep.status === "VERIFIED") {
        respond(response, 200, { status: "VERIFIED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, stepStatus: "VERIFIED", ...(stepIndex + 1 < undoPlan.length ? { nextStepIndex: stepIndex + 1 } : {}) });
        return;
      }
      if (currentLedgerStep.status !== "PREPARED" && currentLedgerStep.status !== "APPLIED") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_STEP_ORDER_INVALID", "当前结构 Undo step 不能核验。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      if (graphResult.status !== "FOUND" || graphResult.snapshot.kind !== "BLOCK" || graphResult.snapshot.resolved.id !== plan.sourceRootBlockUuid || graphResult.snapshot.truncated) {
        const now = new Date().toISOString();
        store.advanceSemanticCommitStep(undoSemanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_GRAPH_UNREADABLE");
        store.finalizeSemanticCommit(undoSemanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_GRAPH_UNREADABLE");
        respond(response, 200, { status: "RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_GRAPH_UNREADABLE" });
        return;
      }
      const positions = buildMiniProjectSourcePositions(graphResult.snapshot);
      const position = positions.find(({ blockUuid }) => blockUuid === undoStep.step.blockUuid);
      const matches = (parentBlockUuid: string, previousSiblingUuid: string | null) => Boolean(position && position.contentHash === undoStep.step.contentHash && position.parentBlockUuid === parentBlockUuid && position.previousSiblingUuid === previousSiblingUuid);
      const before = undoStep.step.kind === "REMOVE_CREATED_BLOCK"
        ? Boolean(position && position.contentHash === undoStep.step.contentHash && position.parentBlockUuid === undoStep.step.expectedParentBlockUuid)
        : matches(undoStep.step.fromParentBlockUuid, undoStep.step.fromPreviousSiblingUuid);
      const after = undoStep.step.kind === "REMOVE_CREATED_BLOCK" ? position === undefined : matches(undoStep.step.toParentBlockUuid, undoStep.step.toPreviousSiblingUuid);
      const createdHasChildren = undoStep.step.kind === "REMOVE_CREATED_BLOCK" && positions.some(({ parentBlockUuid }) => parentBlockUuid === undoStep.step.blockUuid);
      if (before && !createdHasChildren && currentLedgerStep.status === "PREPARED") {
        respond(response, 200, { status: "NOT_APPLIED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, stepStatus: "PREPARED" });
        return;
      }
      if (!after) {
        const now = new Date().toISOString();
        store.advanceSemanticCommitStep(undoSemanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_STEP_DIVERGED");
        store.finalizeSemanticCommit(undoSemanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_STEP_DIVERGED");
        respond(response, 200, { status: "RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_STEP_DIVERGED" });
        return;
      }
      const now = new Date().toISOString();
      if (currentLedgerStep.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, stepIndex, "APPLIED", now);
      if (store.semanticCommitSteps(undoSemanticCommitId)[stepIndex]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, stepIndex, "VERIFIED", now);
      if (stepIndex + 1 < undoPlan.length) {
        respond(response, 200, { status: "VERIFIED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, stepStatus: "VERIFIED", nextStepIndex: stepIndex + 1 });
        return;
      }
      if (miniProjectStructureHash(positions) !== plan.sourceStructureHash) {
        store.advanceSemanticCommitStep(undoSemanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_FINAL_SHAPE_MISMATCH");
        store.finalizeSemanticCommit(undoSemanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_FINAL_SHAPE_MISMATCH");
        respond(response, 200, { status: "RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_FINAL_SHAPE_MISMATCH" });
        return;
      }
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now, plan.sourceStructureHash);
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now);
      respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: false });
      return;
    }
    const miniProjectRestructureUndoRecoveryBeginMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/mini-project-restructure\/undo\/recovery\/begin$/) : null;
    if (miniProjectRestructureUndoRecoveryBeginMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(miniProjectRestructureUndoRecoveryBeginMatch[1]);
      const input = await readMiniProjectRestructureUndoRecoveryRequest(request);
      const undoSemanticCommitId = miniProjectRestructureUndoSemanticCommitId(originalSemanticCommitId);
      if (input.undoSemanticCommitId !== undoSemanticCommitId) throw serviceError("MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_REQUEST_INVALID", "MiniProject 原位重构 Undo 恢复意图与账本不匹配。");
      const original = store.semanticCommit(originalSemanticCommitId);
      const inverse = store.semanticCommit(undoSemanticCommitId);
      if (!original?.proposalId || !inverse || inverse.proposalId !== original.proposalId) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 恢复的正向与逆向账本不一致。");
      if (inverse.status === "FAILED") {
        respond(response, 200, { status: "FAILED_COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: true });
        return;
      }
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 恢复找不到原 Proposal。");
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      const undoPlan = miniProjectRestructureUndoPlan(plan);
      const ledgerSteps = store.semanticCommitSteps(undoSemanticCommitId);
      if (!undoPlan[input.failedStepIndex] || ledgerSteps.length !== undoPlan.length) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 恢复账本与逆向计划不一致。");
      const compensationFor = (stepIndex: number) => {
        const entry = undoPlan[stepIndex];
        if (!entry) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 恢复缺少正向补偿计划。");
        return { stepIndex, forwardStepIndex: entry.forwardStepIndex, step: plan.steps[entry.forwardStepIndex]! };
      };
      const remainingCompensations = () => store.semanticCommitSteps(undoSemanticCommitId).filter(({ status }) => status === "RECOVERY_REQUIRED").map(({ stepIndex }) => compensationFor(stepIndex)).sort((left, right) => right.stepIndex - left.stepIndex);
      const priorLedgerSteps = ledgerSteps.slice(0, input.failedStepIndex);
      const futureLedgerSteps = ledgerSteps.slice(input.failedStepIndex + 1);
      const recoveryNeedsInitialization = inverse.status === "RECOVERY_REQUIRED"
        && priorLedgerSteps.some(({ status }) => status === "VERIFIED")
        && priorLedgerSteps.every(({ status }) => status === "VERIFIED" || status === "RECOVERY_REQUIRED")
        && ledgerSteps[input.failedStepIndex]!.status === "RECOVERY_REQUIRED"
        && futureLedgerSteps.every(({ status }) => status === "PREPARED");
      if (inverse.status === "RECOVERY_REQUIRED" && !recoveryNeedsInitialization) {
        const compensations = remainingCompensations();
        if (compensations.length === 0) respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex: input.failedStepIndex, errorCode: inverse.errorCode ?? "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_REQUIRED" });
        else respond(response, 200, { status: "COMPENSATION_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, compensations, replayed: true });
        return;
      }
      const pendingRecoveryStart = inverse.status === "PENDING"
        && priorLedgerSteps.every(({ status }) => status === "VERIFIED")
        && futureLedgerSteps.every(({ status }) => status === "PREPARED")
        && ["PREPARED", "APPLIED"].includes(ledgerSteps[input.failedStepIndex]!.status);
      if ((!pendingRecoveryStart && !recoveryNeedsInitialization) || original.status !== "COMPLETED") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_STEP_ORDER_INVALID", "结构 Undo 恢复只能从第一个未完成 step 开始。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      const undoStep = undoPlan[input.failedStepIndex]!.step;
      const markRecovery = (errorCode: string): void => {
        const now = new Date().toISOString();
        const status = store.semanticCommitSteps(undoSemanticCommitId)[input.failedStepIndex]!.status;
        if (status === "PREPARED" || status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, input.failedStepIndex, "RECOVERY_REQUIRED", now, errorCode);
        if (store.semanticCommit(undoSemanticCommitId)?.status === "PENDING") store.finalizeSemanticCommit(undoSemanticCommitId, "RECOVERY_REQUIRED", now, undefined, errorCode);
      };
      if (graphResult.status !== "FOUND" || graphResult.snapshot.kind !== "BLOCK" || graphResult.snapshot.resolved.id !== plan.sourceRootBlockUuid || graphResult.snapshot.truncated) {
        markRecovery("V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_GRAPH_UNREADABLE");
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex: input.failedStepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_GRAPH_UNREADABLE" });
        return;
      }
      const positions = buildMiniProjectSourcePositions(graphResult.snapshot);
      const position = positions.find(({ blockUuid }) => blockUuid === undoStep.blockUuid);
      const matches = (parentBlockUuid: string, previousSiblingUuid: string | null) => Boolean(position && position.contentHash === undoStep.contentHash && position.parentBlockUuid === parentBlockUuid && position.previousSiblingUuid === previousSiblingUuid);
      const before = undoStep.kind === "REMOVE_CREATED_BLOCK"
        ? Boolean(position && position.contentHash === undoStep.contentHash && position.parentBlockUuid === undoStep.expectedParentBlockUuid && !positions.some(({ parentBlockUuid }) => parentBlockUuid === undoStep.blockUuid))
        : matches(undoStep.fromParentBlockUuid, undoStep.fromPreviousSiblingUuid);
      const after = undoStep.kind === "REMOVE_CREATED_BLOCK" ? position === undefined : matches(undoStep.toParentBlockUuid, undoStep.toPreviousSiblingUuid);
      if (!before && !after) {
        markRecovery("V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_DIVERGED");
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex: input.failedStepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_DIVERGED" });
        return;
      }
      const appliedIndexes = ledgerSteps.slice(0, input.failedStepIndex).map(({ stepIndex }) => stepIndex);
      if (after) appliedIndexes.push(input.failedStepIndex);
      const now = new Date().toISOString();
      if (after && ledgerSteps[input.failedStepIndex]!.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, input.failedStepIndex, "APPLIED", now);
      for (const stepIndex of [...appliedIndexes, ...(before ? [input.failedStepIndex] : [])]) {
        const status = store.semanticCommitSteps(undoSemanticCommitId)[stepIndex]!.status;
        if (status === "VERIFIED" || status === "APPLIED" || status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, stepIndex, "RECOVERY_REQUIRED", now, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_EXECUTION_FAILED");
      }
      if (store.semanticCommit(undoSemanticCommitId)?.status === "PENDING") store.finalizeSemanticCommit(undoSemanticCommitId, "RECOVERY_REQUIRED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_EXECUTION_FAILED");
      if (before) store.advanceSemanticCommitStep(undoSemanticCommitId, input.failedStepIndex, "COMPENSATED", now);
      const compensations = remainingCompensations();
      if (compensations.length === 0) {
        if (miniProjectStructureHash(positions) !== plan.expectedStructureHash) {
          respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex: input.failedStepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_SHAPE_MISMATCH" });
          return;
        }
        store.finalizeSemanticCommit(undoSemanticCommitId, "FAILED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_EXECUTION_FAILED");
        respond(response, 200, { status: "FAILED_COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: false });
        return;
      }
      respond(response, 200, { status: "COMPENSATION_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, compensations, replayed: false });
      return;
    }
    const miniProjectRestructureUndoCompensationVerifyMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/mini-project-restructure\/undo\/recovery\/steps\/(\d+)\/verify$/) : null;
    if (miniProjectRestructureUndoCompensationVerifyMatch?.[1] && miniProjectRestructureUndoCompensationVerifyMatch[2]) {
      const originalSemanticCommitId = decodeURIComponent(miniProjectRestructureUndoCompensationVerifyMatch[1]);
      const stepIndex = Number(miniProjectRestructureUndoCompensationVerifyMatch[2]);
      const input = await readMiniProjectRestructureUndoVerifyRequest(request);
      const undoSemanticCommitId = miniProjectRestructureUndoSemanticCommitId(originalSemanticCommitId);
      if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex > 63 || input.undoSemanticCommitId !== undoSemanticCommitId) throw serviceError("MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_REQUEST_INVALID", "MiniProject 原位重构 Undo 补偿核验与账本不匹配。");
      const original = store.semanticCommit(originalSemanticCommitId);
      const inverse = store.semanticCommit(undoSemanticCommitId);
      if (!original?.proposalId || !inverse || inverse.proposalId !== original.proposalId) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 补偿的正向与逆向账本不一致。");
      if (inverse.status === "FAILED") {
        respond(response, 200, { status: "FAILED_COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: true });
        return;
      }
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 补偿找不到原 Proposal。");
      const plan = planAcceptedMiniProjectRestructure(stored.proposal);
      const undoPlan = miniProjectRestructureUndoPlan(plan);
      let ledgerSteps = store.semanticCommitSteps(undoSemanticCommitId);
      const undoEntry = undoPlan[stepIndex];
      if (!undoEntry || ledgerSteps.length !== undoPlan.length) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_LEDGER_CORRUPT", "结构 Undo 补偿账本与计划不一致。");
      if (inverse.status !== "RECOVERY_REQUIRED" || ledgerSteps.slice(stepIndex + 1).some(({ status }) => status === "RECOVERY_REQUIRED")) throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_COMPENSATION_ORDER_INVALID", "结构 Undo 必须按逆序恢复已应用 step。");
      if (ledgerSteps[stepIndex]!.status === "COMPENSATED") {
        const next = ledgerSteps.filter(({ status }) => status === "RECOVERY_REQUIRED").map(({ stepIndex: index }) => index).sort((a, b) => b - a)[0];
        respond(response, 200, { status: "COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, ...(next !== undefined ? { nextStepIndex: next } : {}) });
        return;
      }
      if (ledgerSteps[stepIndex]!.status !== "RECOVERY_REQUIRED") throw serviceError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_COMPENSATION_ORDER_INVALID", "当前结构 Undo step 不需要补偿。");
      const graphResult = await graphReadBroker.read({ kind: "BLOCK", target: plan.sourceRootBlockUuid, includeChildren: true, parents: 0 });
      if (graphResult.status !== "FOUND" || graphResult.snapshot.kind !== "BLOCK" || graphResult.snapshot.resolved.id !== plan.sourceRootBlockUuid || graphResult.snapshot.truncated) {
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_GRAPH_UNREADABLE" });
        return;
      }
      const positions = buildMiniProjectSourcePositions(graphResult.snapshot);
      const forwardStep = plan.steps[undoEntry.forwardStepIndex]!;
      const position = positions.find(({ blockUuid }) => blockUuid === forwardStep.blockUuid);
      const matches = (parentBlockUuid: string, previousSiblingUuid: string | null) => Boolean(position && position.contentHash === forwardStep.contentHash && position.parentBlockUuid === parentBlockUuid && position.previousSiblingUuid === previousSiblingUuid);
      const restored = forwardStep.kind === "CREATE_BLOCK" ? matches(forwardStep.parentBlockUuid, forwardStep.previousSiblingUuid) : matches(forwardStep.toParentBlockUuid, forwardStep.toPreviousSiblingUuid);
      const stillUndone = forwardStep.kind === "CREATE_BLOCK" ? position === undefined : matches(forwardStep.fromParentBlockUuid, forwardStep.fromPreviousSiblingUuid);
      if (stillUndone) {
        respond(response, 200, { status: "NOT_COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex });
        return;
      }
      if (!restored) {
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_COMPENSATION_DIVERGED" });
        return;
      }
      const now = new Date().toISOString();
      store.advanceSemanticCommitStep(undoSemanticCommitId, stepIndex, "COMPENSATED", now);
      ledgerSteps = store.semanticCommitSteps(undoSemanticCommitId);
      const next = ledgerSteps.filter(({ status }) => status === "RECOVERY_REQUIRED").map(({ stepIndex: index }) => index).sort((a, b) => b - a)[0];
      if (next !== undefined) {
        respond(response, 200, { status: "COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, nextStepIndex: next });
        return;
      }
      if (miniProjectStructureHash(positions) !== plan.expectedStructureHash) {
        respond(response, 200, { status: "MANUAL_RECOVERY_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, stepIndex, errorCode: "V2_MINI_PROJECT_RESTRUCTURE_UNDO_RECOVERY_SHAPE_MISMATCH" });
        return;
      }
      store.finalizeSemanticCommit(undoSemanticCommitId, "FAILED", now, undefined, "V2_MINI_PROJECT_RESTRUCTURE_UNDO_EXECUTION_FAILED");
      respond(response, 200, { status: "FAILED_COMPENSATED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, replayed: false });
      return;
    }
    const interactionDispositionMatch = request.method === "POST" ? url.pathname.match(/^\/provider\/ux\/interactions\/(uxi_[A-Za-z0-9_-]{16,96})\/disposition$/) : null;
    if (interactionDispositionMatch?.[1]) {
      if (!options.interactionEvidence) throw serviceError("UX_INTERACTION_SESSION_UNAVAILABLE", "当前 Service session 没有可反馈的交互证据。");
      const input = await readInteractionDispositionRequest(request);
      const entry = options.interactionEvidence.setDisposition(interactionDispositionMatch[1], input.disposition);
      if (!entry) throw serviceError("UX_INTERACTION_NOT_FOUND", "交互已过期或不属于当前 Service session。");
      respond(response, 200, { userDisposition: entry.userDisposition ?? null, summary: options.interactionEvidence.summary() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/provider/ux/interactions/summary") {
      if (!options.interactionEvidence) throw serviceError("UX_INTERACTION_SESSION_UNAVAILABLE", "当前 Service session 没有交互证据摘要。");
      respond(response, 200, { summary: options.interactionEvidence.summary() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/migration/scan") {
      const body = await readBody(request, 8 * 1024 * 1024);
      let bundle: unknown;
      try { bundle = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "迁移输入必须是合法 Recovery Bundle JSON。"); }
      const before = store.doctor();
      const report = scanLegacyRecoveryBundle(bundle);
      if (stableJson(store.doctor()) !== stableJson(before)) throw serviceError("MIGRATION_SCAN_MUTATED_STORE", "迁移扫描意外改变了 SQLite；结果已拒绝。");
      respond(response, 200, { report });
      return;
    }
    if (request.method === "POST" && url.pathname === "/migration/preview") {
      const input = await readMigrationJson(request);
      if (Object.keys(input).sort().join(",") !== "bundle,decisions" || !Array.isArray(input.decisions)) throw serviceError("MIGRATION_REQUEST_INVALID", "Migration Preview 只接受 Recovery Bundle 与完整审阅决定。");
      const { report } = readLegacyRecoveryBundle(input.bundle);
      const result = await migrationApplication.reviewPreview({
        sourceBundleSha256: report.sourceBundleSha256,
        sourceCreatedAt: report.sourceCreatedAt,
        previews: report.previews,
        decisions: input.decisions as LegacyMigrationReviewDecision[],
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/migration/runs") {
      respond(response, 200, { runs: store.listMigrationRuns() });
      return;
    }
    const migrationRunMatch = request.method === "GET" ? url.pathname.match(/^\/migration\/runs\/([^/]+)$/) : null;
    if (migrationRunMatch?.[1]) {
      const runId = decodeURIComponent(migrationRunMatch[1]);
      const run = store.migrationRun(runId);
      if (!run) throw serviceError("MIGRATION_RUN_NOT_FOUND", "找不到 Migration Run。");
      respond(response, 200, { run, evidence: store.migrationEvidence(runId), batches: store.listMigrationBatches(runId) });
      return;
    }
    const migrationImportMatch = request.method === "POST" ? url.pathname.match(/^\/migration\/runs\/([^/]+)\/batches\/import$/) : null;
    if (migrationImportMatch?.[1]) {
      const runId = decodeURIComponent(migrationImportMatch[1]);
      const input = await readMigrationJson(request);
      if (Object.keys(input).sort().join(",") !== "backupId,bundle,confirmation,idempotencyKey,objectIds" || !backupIdPattern.test(String(input.backupId)) || input.confirmation !== "IMPORT_REVIEWED_V1_BATCH" || !safeMigrationId(input.idempotencyKey) || !Array.isArray(input.objectIds) || input.objectIds.some((id) => !safeMigrationId(id))) {
        throw serviceError("MIGRATION_IMPORT_REQUEST_INVALID", "Migration Import 需要服务端 Backup ID、唯一对象范围、幂等键和精确确认。");
      }
      const validation = V2SqliteStore.validateBackup(join(backupRoot, `${String(input.backupId)}.db`), options.graphId);
      if (validation.status !== "PASS") throw serviceError("V2_BACKUP_VALIDATION_FAILED", "Migration Import 前快照未通过校验。");
      const { report, state } = readLegacyRecoveryBundle(input.bundle);
      const objectIds = input.objectIds as string[];
      const sources = objectIds.map((objectId) => {
        const object = state.objects.find((candidate) => candidate.objectId === objectId);
        if (!object) throw serviceError("MIGRATION_SOURCE_OBJECT_NOT_FOUND", `Recovery Bundle 不含对象 ${objectId}。`);
        const ownership = state.relations.find((relation) => relation.status === "ACTIVE" && relation.relationType === "primary_ownership" && relation.fromObjectId === objectId);
        return {
          object: { objectId, text: object.text, createdAt: object.createdAt, updatedAt: object.updatedAt },
          anchors: state.anchors.filter((anchor) => anchor.objectId === objectId).map((anchor) => ({
            anchorId: anchor.anchorId, objectId, graphId: anchor.graphId, externalId: anchor.externalId,
            role: anchor.role, status: anchor.status, contentHash: anchor.contentHash, lastSeenAt: anchor.lastSeenAt,
          })),
          ...(ownership ? { ownership: { childObjectId: objectId, ownerObjectId: ownership.toObjectId, assignedAt: ownership.createdAt } } : {}),
        };
      });
      const result = await migrationApplication.importBatch({
        runId, sourceBundleSha256: report.sourceBundleSha256, snapshotBackupId: String(input.backupId), objectIds, sources,
        idempotencyKey: String(input.idempotencyKey), actor: "migration-cli", traceId: `migration:${String(input.idempotencyKey)}`,
      });
      options.faults?.afterMigrationImport?.();
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    const migrationBatchActionMatch = request.method === "POST" ? url.pathname.match(/^\/migration\/runs\/([^/]+)\/batches\/([^/]+)\/(verify|undo)$/) : null;
    if (migrationBatchActionMatch?.[1] && migrationBatchActionMatch[2] && migrationBatchActionMatch[3]) {
      const runId = decodeURIComponent(migrationBatchActionMatch[1]);
      const batchId = decodeURIComponent(migrationBatchActionMatch[2]);
      if (migrationBatchActionMatch[3] === "verify") {
        await requireNoBody(request);
        options.faults?.beforeMigrationVerify?.();
        respond(response, 200, { batch: await migrationApplication.verifyBatch(runId, batchId) });
      } else {
        const input = await readMigrationJson(request);
        if (Object.keys(input).join(",") !== "confirmation" || input.confirmation !== "UNDO_MIGRATION_BATCH") throw serviceError("MIGRATION_UNDO_CONFIRMATION_REQUIRED", "Migration Undo 需要精确确认。");
        respond(response, 200, { batch: await migrationApplication.undoBatch(runId, batchId, "UNDO_MIGRATION_BATCH") });
      }
      return;
    }
    const migrationActivateMatch = request.method === "POST" ? url.pathname.match(/^\/migration\/runs\/([^/]+)\/activate$/) : null;
    if (migrationActivateMatch?.[1]) {
      const input = await readMigrationJson(request);
      if (Object.keys(input).join(",") !== "confirmation" || input.confirmation !== "ACTIVATE_V2_SQLITE") throw serviceError("MIGRATION_ACTIVATION_CONFIRMATION_REQUIRED", "Migration Activate 需要精确确认。");
      options.faults?.beforeMigrationActivate?.();
      respond(response, 200, { run: await migrationApplication.activate(decodeURIComponent(migrationActivateMatch[1]), "ACTIVATE_V2_SQLITE") });
      return;
    }
    const skillMatch = request.method === "GET" ? url.pathname.match(/^\/skills\/([^/]+)$/) : null;
    if (skillMatch?.[1]) {
      const skill = await readTaskCopilotSkill(decodeURIComponent(skillMatch[1]));
      respond(response, skill ? 200 : 404, skill ? { skill } : { error: { code: "SKILL_NOT_FOUND", message: "Skill 不存在。" } });
      return;
    }
    if (request.method === "POST" && url.pathname === "/proposals/validate") {
      const body = await readBody(request);
      let candidate: unknown;
      try {
        candidate = JSON.parse(body) as unknown;
      } catch {
        throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。");
      }
      const proposal = validateV2ProposalForSubmission(candidate);
      respond(response, 200, { status: "VALID", proposal, files: renderV2ProposalFiles(proposal) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/proposals/submit") {
      const body = await readBody(request);
      let candidate: unknown;
      try { candidate = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
      const result = await submitReviewProposal(candidate);
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    const providerProposalRevisionMatch = request.method === "POST" ? url.pathname.match(/^\/provider\/proposals\/([^/]+)\/revise$/) : null;
    if (providerProposalRevisionMatch?.[1]) {
      if (!options.proposalGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Provider；没有修改 Proposal。");
      const proposalId = decodeURIComponent(providerProposalRevisionMatch[1]);
      const input = await readProposalRevisionRequest(request);
      requireNoUnfinishedProposalCommit(proposalId);
      const current = await proposalApplication.get(proposalId);
      if (!current) throw serviceError("V2_PROPOSAL_NOT_FOUND", "待调整 Proposal 不存在。");
      if (current.updatedAt !== input.expectedUpdatedAt) throw serviceError("V2_PROPOSAL_REVIEW_STALE", "Proposal 已在 Agent 调整前变化；没有覆盖当前机器表示。");
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const generated = await options.proposalGenerator.generate({
          proposalId,
          createdAt: current.proposal.createdAt,
          prompt: input.prompt,
          signal: controller.signal,
        });
        if (generated.kind === "NO_PROPOSAL") throw serviceError("LLM_PROPOSAL_REVISION_EMPTY", "Agent 调整没有返回完整 Proposal；原机器表示保持不变。");
        requireNoUnfinishedProposalCommit(proposalId);
        const latest = await proposalApplication.get(proposalId);
        if (!latest || latest.updatedAt !== input.expectedUpdatedAt) throw serviceError("V2_PROPOSAL_REVIEW_STALE", "Proposal 已在 Agent 调整期间变化；没有覆盖当前机器表示。");
        requireSameLocalLlmFormalizationIntent(latest.proposal, generated.proposal);
        const record = await proposalApplication.reviseSameMachineIntent(generated.proposal, input.expectedUpdatedAt);
        respond(response, 200, { generated, record });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/provider/proposals/generate") {
      if (!options.proposalGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Provider；没有创建 Proposal。");
      const input = await readProposalGenerationRequest(request);
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const createdAt = new Date().toISOString();
        const generated = await options.proposalGenerator.generate({
          proposalId: createId("prop"),
          createdAt,
          prompt: input.prompt,
          signal: controller.signal,
        });
        if (generated.kind === "NO_PROPOSAL") { respond(response, 200, { generated, replayed: false }); return; }
        const submitted = await submitReviewProposal(generated.proposal, new Date(createdAt));
        const result = { generated, ...submitted };
        respond(response, result.replayed ? 200 : 201, result);
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/proposals") {
      respond(response, 200, { proposals: await proposalApplication.list() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/semantic-commits") {
      respond(response, 200, { commits: store.listSemanticCommits() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/now-work") {
      const objects = store.listObjects();
      const projection = projectV2NowWork(objects, store.listFocusSelections(), new Date());
      const withAnchors = (items: typeof projection.next) => items.map((item) => {
        const anchor = store.getActivePrimaryAnchorByObject(item.objectId);
        return { ...item, ...(anchor ? { primaryAnchorExternalId: anchor.externalId } : {}) };
      });
      const conditionOptions = objects.filter((object) => object.lifecycle === "OPEN").map(({ objectId, objectType, text }) => ({ objectId, objectType, text }));
      respond(response, 200, { ...projection, focus: withAnchors(projection.focus), next: withAnchors(projection.next), waitingReview: withAnchors(projection.waitingReview), conditionOptions });
      return;
    }
    if (request.method === "GET" && url.pathname === "/focus") {
      respond(response, 200, { selections: store.listFocusSelections() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/focus/reorder") {
      const input = await readFocusReorderRequest(request);
      respond(response, 200, { selections: await application.reorderFocus(input.expectedObjectIds, input.objectIds) });
      return;
    }
    const focusMatch = url.pathname.match(/^\/focus\/([^/]+)$/);
    if (focusMatch?.[1] && (request.method === "POST" || request.method === "DELETE")) {
      const objectId = decodeURIComponent(focusMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("FOCUS_REQUEST_INVALID", "Focus 对象 ID 无效。");
      const remove = request.method === "DELETE";
      const input = await readFocusRequest(request, remove);
      if (remove) {
        await application.removeFocus(objectId, input.expectedVersion);
        respond(response, 200, { status: "REMOVED", objectId });
      } else {
        respond(response, 200, { status: "SELECTED", selection: await application.selectFocus(objectId, input.rank!, input.expectedVersion) });
      }
      return;
    }
    const ownershipCommitMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/ownership\/commit$/) : null;
    if (ownershipCommitMatch?.[1]) {
      const proposalId = decodeURIComponent(ownershipCommitMatch[1]);
      const input = await readOwnershipCommitRequest(request);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const receiptKey = `ownership-change:${semanticCommitId}`;
      const existing = store.semanticCommit(semanticCommitId);
      const steps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      const terminalFailureCodes = ["V2_OBJECT_VERSION_CONFLICT", "V2_OBJECT_NOT_FOUND", "V2_PRIMARY_OWNER_STALE", "V2_PRIMARY_OWNER_UNCHANGED", "V2_PRIMARY_OWNERSHIP_NOT_ALLOWED"];
      const terminalizeFailedProposal = async (at: Date) => {
        const latest = await proposalApplication.get(proposalId);
        if (!latest) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
        if (latest.proposal.status === "STALE" || latest.proposal.status === "FAILED") return latest;
        if (latest.proposal.status !== "ACCEPTED" && latest.proposal.status !== "PARTIALLY_ACCEPTED") throw serviceError("V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "失败的 Ownership Commit 与 Proposal 终态不一致。");
        const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(latest.proposal, input.observations), input.expectedUpdatedAt, at);
        return revalidation.result.status === "VALID" ? proposalApplication.markFailed(proposalId, input.expectedUpdatedAt, at) : revalidation.record;
      };
      if (existing?.status === "FAILED") {
        if (existing.proposalId !== proposalId || steps.length !== 1 || !existing.errorCode || !terminalFailureCodes.includes(existing.errorCode)) throw serviceError("V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "失败的 Ownership Commit 缺少可恢复终态证据。");
        if ((stored.proposal.status === "ACCEPTED" || stored.proposal.status === "PARTIALLY_ACCEPTED") && steps[0]?.operationId !== planAcceptedV2OwnershipChange(stored.proposal).childObjectId) throw serviceError("V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "失败的 Ownership Commit step 与已审阅计划不一致。");
        const record = await terminalizeFailedProposal(new Date());
        respond(response, 200, { status: "FAILED", semanticCommitId, record, errorCode: existing.errorCode, replayed: true }); return;
      }
      const plan = planAcceptedV2OwnershipChange(stored.proposal);
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (steps.length !== 1 || steps[0]?.operationId !== plan.childObjectId || receipt?.command !== "change_primary_owner" || receipt.object.objectId !== plan.childObjectId || receipt.object.version !== plan.expectedVersion + 1 || receipt.ownership.childObjectId !== plan.childObjectId || receipt.ownership.ownerObjectId !== plan.ownerObjectId) throw serviceError("V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "Ownership Commit 账本、回执与已审阅计划不一致。");
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "COMPLETED", semanticCommitId, object: receipt.object, ownership: receipt.ownership, record, replayed: true }); return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_OWNERSHIP_COMMIT_RECOVERY_REQUIRED", "Ownership Commit 已终止，不能建立平行事务。");
      if (!existing) {
        const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, input.observations), input.expectedUpdatedAt);
        if (revalidation.result.status === "STALE") { respond(response, 200, { status: "STALE", ...revalidation }); return; }
        const now = new Date();
        store.prepareSemanticCommit({ semanticCommitId, proposalId, status: "PENDING", beforeStateChecksum: checksum({ proposal: stored.files.proposalJson, expectedUpdatedAt: input.expectedUpdatedAt }), createdAt: now.toISOString(), updatedAt: now.toISOString() }, [{ semanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.childObjectId, updatedAt: now.toISOString() }]);
        options.faults?.afterOwnershipPrepare?.();
      } else if (steps.length !== 1 || steps[0]?.operationId !== plan.childObjectId) throw serviceError("V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "Ownership Commit 账本与预览不一致。");
      const now = new Date();
      let result;
      try {
        result = await application.changePrimaryOwner(plan.childObjectId, plan.ownerObjectId, plan.expectedOwnerVersion, plan.expectedCurrentOwnerId, { actor: "proposal_commit", expectedVersion: plan.expectedVersion, idempotencyKey: receiptKey, traceId: input.traceId }, now);
      } catch (error) {
        if (error instanceof StructuredError && terminalFailureCodes.includes(error.code) && !store.getCommandReceipt(receiptKey)) {
          store.finalizeSemanticCommit(semanticCommitId, "FAILED", now.toISOString(), undefined, error.code);
          options.faults?.afterOwnershipCommitFailedBeforeProposalTerminal?.();
          await terminalizeFailedProposal(now);
        }
        throw error;
      }
      options.faults?.afterOwnershipDomainWrite?.();
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(semanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(semanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(semanticCommitId, "COMPLETED", now.toISOString(), checksum(result));
      const record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, now);
      respond(response, 200, { status: "COMPLETED", semanticCommitId, object: result.object, ownership: result.ownership, record, replayed: false }); return;
    }
    const ownershipUndoMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/ownership\/undo$/) : null;
    if (ownershipUndoMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(ownershipUndoMatch[1]);
      const input = await readOwnershipUndoRequest(request);
      const original = store.semanticCommit(originalSemanticCommitId);
      if (!original?.proposalId || !["COMPLETED", "UNDONE"].includes(original.status)) throw serviceError("V2_OWNERSHIP_UNDO_NOT_AVAILABLE", "只有已完成且尚有审阅证据的 Ownership Commit 可以 Undo。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_OWNERSHIP_UNDO_LEDGER_CORRUPT", "原 Ownership Commit 引用的 Proposal 不存在。");
      const plan = planAcceptedV2OwnershipChange(stored.proposal);
      const forwardSteps = store.semanticCommitSteps(originalSemanticCommitId);
      const forwardReceipt = store.getCommandReceipt(`ownership-change:${originalSemanticCommitId}`);
      if (
        forwardSteps.length !== 1 || forwardSteps[0]?.operationId !== plan.childObjectId
        || forwardReceipt?.command !== "change_primary_owner"
        || forwardReceipt.object.objectId !== plan.childObjectId
        || forwardReceipt.object.version !== plan.expectedVersion + 1
        || forwardReceipt.ownership.childObjectId !== plan.childObjectId
        || forwardReceipt.ownership.ownerObjectId !== plan.ownerObjectId
        || (forwardReceipt.previousOwnerId !== undefined && forwardReceipt.previousOwnerId !== plan.expectedCurrentOwnerId)
      ) throw serviceError("V2_OWNERSHIP_UNDO_LEDGER_CORRUPT", "Ownership Undo 的正向回执与已审阅计划不一致。");
      // Receipts written before Ownership Undo support did not carry previousOwnerId.
      // The accepted Proposal is immutable machine authority for that reviewed precondition.
      const previousOwnerId = forwardReceipt.previousOwnerId ?? plan.expectedCurrentOwnerId;

      const undoSemanticCommitId = ownershipUndoSemanticCommitId(originalSemanticCommitId);
      const receiptKey = `ownership-undo:${undoSemanticCommitId}`;
      const existing = store.semanticCommit(undoSemanticCommitId);
      const steps = existing ? store.semanticCommitSteps(undoSemanticCommitId) : [];
      if (original.status === "UNDONE" && existing?.status !== "COMPLETED") throw serviceError("V2_OWNERSHIP_UNDO_LEDGER_CORRUPT", "已撤销的 Ownership Commit 缺少已完成逆向 Commit。");
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        const restoredOwnerId = receipt?.command === "undo_primary_owner_change" ? receipt.ownership?.ownerObjectId : undefined;
        if (existing.proposalId !== original.proposalId || steps.length !== 1 || steps[0]?.operationId !== plan.childObjectId || receipt?.command !== "undo_primary_owner_change" || receipt.object.objectId !== plan.childObjectId || receipt.object.version !== forwardReceipt.object.version + 1 || restoredOwnerId !== previousOwnerId || (receipt.ownership !== undefined && receipt.ownership.childObjectId !== plan.childObjectId)) throw serviceError("V2_OWNERSHIP_UNDO_LEDGER_CORRUPT", "已完成 Ownership Undo 缺少一致的逆向回执。");
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object: receipt.object, ...(receipt.ownership ? { ownership: receipt.ownership } : {}), replayed: true });
        return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_OWNERSHIP_UNDO_NOT_AVAILABLE", "Ownership Undo 已安全终止，不能建立平行逆向事务。");
      if (!existing) {
        const now = new Date();
        store.prepareSemanticCommit({
          semanticCommitId: undoSemanticCommitId,
          proposalId: original.proposalId,
          status: "PENDING",
          beforeStateChecksum: checksum({ object: forwardReceipt.object, ownership: forwardReceipt.ownership, previousOwnerId }),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }, [{ semanticCommitId: undoSemanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.childObjectId, updatedAt: now.toISOString() }]);
      } else if (existing.proposalId !== original.proposalId || steps.length !== 1 || steps[0]?.operationId !== plan.childObjectId) {
        throw serviceError("V2_OWNERSHIP_UNDO_LEDGER_CORRUPT", "Ownership Undo 账本与已审阅计划不一致。");
      }

      const now = new Date();
      let result;
      try {
        options.faults?.beforeOwnershipUndoDomainWrite?.();
        result = await application.undoPrimaryOwnerChange(plan.childObjectId, plan.ownerObjectId, previousOwnerId, {
          actor: "proposal_undo",
          expectedVersion: forwardReceipt.object.version,
          idempotencyKey: receiptKey,
          traceId: input.traceId,
        }, now);
      } catch (error) {
        const terminalCodes = ["V2_OBJECT_VERSION_CONFLICT", "V2_OBJECT_NOT_FOUND", "V2_PRIMARY_OWNER_UNDO_STALE", "V2_PRIMARY_OWNERSHIP_NOT_ALLOWED"];
        if (error instanceof StructuredError && terminalCodes.includes(error.code) && !store.getCommandReceipt(receiptKey) && store.semanticCommit(undoSemanticCommitId)?.status === "PENDING") {
          store.finalizeSemanticCommit(undoSemanticCommitId, "FAILED", now.toISOString(), undefined, error.code);
        }
        throw error;
      }
      options.faults?.afterOwnershipUndoDomainWrite?.();
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), checksum(result));
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
      respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object: result.object, ...(result.ownership ? { ownership: result.ownership } : {}), replayed: result.replayed });
      return;
    }
    const projectStructureCommitMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/project-interface\/commit$/) : null;
    if (projectStructureCommitMatch?.[1]) {
      const proposalId = decodeURIComponent(projectStructureCommitMatch[1]);
      const input = await readProjectStructureCommitRequest(request);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const plan = planAcceptedV2ProjectStructure(stored.proposal);
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const receiptKey = `project-structure:${semanticCommitId}`;
      const existing = store.semanticCommit(semanticCommitId);
      const steps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (steps.length !== 1 || steps[0]?.operationId !== plan.objectId || receipt?.command !== "update_project_structure" || receipt.object.objectId !== plan.objectId || receipt.object.version !== plan.expectedVersion + 1) throw serviceError("V2_PROJECT_STRUCTURE_COMMIT_LEDGER_CORRUPT", "Project 当前接口 Commit 账本与回执不一致。");
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "COMPLETED", semanticCommitId, object: receipt.object, record, replayed: true }); return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_PROJECT_STRUCTURE_COMMIT_RECOVERY_REQUIRED", "Project 当前接口 Commit 已终止，不能建立平行事务。");
      if (!existing) {
        const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, input.observations), input.expectedUpdatedAt);
        if (revalidation.result.status === "STALE") { respond(response, 200, { status: "STALE", ...revalidation }); return; }
        const now = new Date();
        store.prepareSemanticCommit({ semanticCommitId, proposalId, status: "PENDING", beforeStateChecksum: checksum({ proposal: stored.files.proposalJson, expectedUpdatedAt: input.expectedUpdatedAt }), createdAt: now.toISOString(), updatedAt: now.toISOString() }, [{ semanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.objectId, updatedAt: now.toISOString() }]);
      } else if (steps.length !== 1 || steps[0]?.operationId !== plan.objectId) throw serviceError("V2_PROJECT_STRUCTURE_COMMIT_LEDGER_CORRUPT", "Project 当前接口 Commit 账本与预览不一致。");
      const now = new Date();
      const object = await application.updateProjectStructure(plan.objectId, plan.structure, { actor: "proposal_commit", expectedVersion: plan.expectedVersion, idempotencyKey: receiptKey, traceId: input.traceId }, now);
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(semanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(semanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(semanticCommitId, "COMPLETED", now.toISOString(), checksum(object));
      const record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, now);
      respond(response, 200, { status: "COMPLETED", semanticCommitId, object, record, replayed: false }); return;
    }
    const projectStructureUndoMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/project-interface\/undo$/) : null;
    if (projectStructureUndoMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(projectStructureUndoMatch[1]);
      const input = await readProjectStructureUndoRequest(request);
      const original = store.semanticCommit(originalSemanticCommitId);
      if (!original?.proposalId || !["COMPLETED", "UNDONE"].includes(original.status)) throw serviceError("V2_PROJECT_STRUCTURE_UNDO_NOT_AVAILABLE", "只有已完成且保留审阅证据的 Project 当前接口 Commit 可以 Undo。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_PROJECT_STRUCTURE_UNDO_LEDGER_CORRUPT", "原 Project 当前接口 Commit 引用的 Proposal 不存在。");
      const plan = planAcceptedV2ProjectStructure(stored.proposal);
      const forwardSteps = store.semanticCommitSteps(originalSemanticCommitId);
      const forwardReceipt = store.getCommandReceipt(`project-structure:${originalSemanticCommitId}`);
      if (forwardSteps.length !== 1 || forwardSteps[0]?.operationId !== plan.objectId || forwardReceipt?.command !== "update_project_structure" || forwardReceipt.object.objectId !== plan.objectId || forwardReceipt.object.version !== plan.expectedVersion + 1 || stableJson(forwardReceipt.object.projectStructure) !== stableJson(plan.structure)) throw serviceError("V2_PROJECT_STRUCTURE_UNDO_LEDGER_CORRUPT", "Project 当前接口 Undo 的正向回执与已审阅计划不一致。");
      const undoSemanticCommitId = projectStructureUndoSemanticCommitId(originalSemanticCommitId);
      const receiptKey = `project-structure-undo:${undoSemanticCommitId}`;
      const existing = store.semanticCommit(undoSemanticCommitId);
      const steps = existing ? store.semanticCommitSteps(undoSemanticCommitId) : [];
      if (original.status === "UNDONE" && existing?.status !== "COMPLETED") throw serviceError("V2_PROJECT_STRUCTURE_UNDO_LEDGER_CORRUPT", "已撤销的 Project 当前接口 Commit 缺少已完成逆向 Commit。");
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (existing.proposalId !== original.proposalId || steps.length !== 1 || steps[0]?.operationId !== plan.objectId || receipt?.command !== "update_project_structure" || receipt.object.objectId !== plan.objectId || receipt.object.version !== forwardReceipt.object.version + 1 || stableJson(receipt.object.projectStructure) !== stableJson(plan.previousStructure)) throw serviceError("V2_PROJECT_STRUCTURE_UNDO_LEDGER_CORRUPT", "已完成 Project 当前接口 Undo 缺少一致逆向回执。");
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object: receipt.object, replayed: true }); return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_PROJECT_STRUCTURE_UNDO_NOT_AVAILABLE", "Project 当前接口 Undo 已安全终止，不能建立平行逆向事务。");
      if (!existing) {
        const now = new Date();
        store.prepareSemanticCommit({ semanticCommitId: undoSemanticCommitId, proposalId: original.proposalId, status: "PENDING", beforeStateChecksum: checksum(forwardReceipt.object), createdAt: now.toISOString(), updatedAt: now.toISOString() }, [{ semanticCommitId: undoSemanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.objectId, updatedAt: now.toISOString() }]);
      } else if (existing.proposalId !== original.proposalId || steps.length !== 1 || steps[0]?.operationId !== plan.objectId) throw serviceError("V2_PROJECT_STRUCTURE_UNDO_LEDGER_CORRUPT", "Project 当前接口 Undo 账本与已审阅计划不一致。");
      const now = new Date();
      let object: V2ManagedObject;
      try {
        object = await application.updateProjectStructure(plan.objectId, plan.previousStructure, { actor: "proposal_undo", expectedVersion: forwardReceipt.object.version, idempotencyKey: receiptKey, traceId: input.traceId }, now);
      } catch (error) {
        if (error instanceof StructuredError && ["V2_OBJECT_VERSION_CONFLICT", "V2_OBJECT_NOT_FOUND", "V2_PROJECT_STRUCTURE_CLOSED"].includes(error.code) && !store.getCommandReceipt(receiptKey) && store.semanticCommit(undoSemanticCommitId)?.status === "PENDING") store.finalizeSemanticCommit(undoSemanticCommitId, "FAILED", now.toISOString(), undefined, error.code);
        throw error;
      }
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), checksum(object));
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
      respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object, replayed: false }); return;
    }
    const projectClosureCommitMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/closure\/commit$/) : null;
    if (projectClosureCommitMatch?.[1]) {
      const proposalId = decodeURIComponent(projectClosureCommitMatch[1]);
      const input = await readProjectClosureCommitRequest(request);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const receiptKey = `project-closure:${semanticCommitId}`;
      const existing = store.semanticCommit(semanticCommitId);
      const existingSteps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      const terminalizeFailedClosureProposal = async (at: Date) => {
        const latest = await proposalApplication.get(proposalId);
        if (!latest) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
        if (latest.proposal.status === "FAILED") return latest;
        if (latest.proposal.status === "STALE") {
          throw serviceError("V2_PROJECT_CLOSURE_COMMIT_STALE_RECOVERED", "项目状态已经变化；失败的结束操作已安全收口，请重新发起。");
        }
        if (latest.proposal.status !== "ACCEPTED" && latest.proposal.status !== "PARTIALLY_ACCEPTED") {
          throw serviceError("V2_PROJECT_CLOSURE_COMMIT_LEDGER_CORRUPT", "失败的 Project Closure Commit 与 Proposal 终态不一致。");
        }
        const revalidation = await proposalApplication.revalidate(
          proposalId,
          completeProposalObservations(latest.proposal, input.observations),
          latest.updatedAt,
          at,
        );
        if (revalidation.result.status === "STALE") {
          throw serviceError("V2_PROJECT_CLOSURE_COMMIT_STALE_RECOVERED", "项目状态已经变化；失败的结束操作已安全收口，请重新发起。");
        }
        return proposalApplication.markFailed(proposalId, latest.updatedAt, at);
      };
      if (existing?.status === "FAILED") {
        const failedPlan = inspectReviewedV2ProjectClosure(stored.proposal);
        if (
          existing.proposalId !== proposalId
          || existingSteps.length !== 1
          || existingSteps[0]?.operationId !== failedPlan.objectId
          || existingSteps[0]?.status !== "PREPARED"
          || !existing.errorCode
          || store.getCommandReceipt(receiptKey)
        ) throw serviceError("V2_PROJECT_CLOSURE_COMMIT_LEDGER_CORRUPT", "失败的 Project Closure Commit 缺少可恢复终态证据。");
        const record = await terminalizeFailedClosureProposal(new Date());
        respond(response, 200, {
          status: "FAILED",
          semanticCommitId,
          record,
          errorCode: existing.errorCode,
          replayed: true,
        });
        return;
      }
      const plan = planAcceptedV2ProjectClosure(stored.proposal);
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (existingSteps.length !== 1 || existingSteps[0]?.operationId !== plan.objectId || receipt?.command !== "complete_project") throw serviceError("V2_PROJECT_CLOSURE_COMMIT_LEDGER_CORRUPT", "Project Closure Commit 账本与预览不一致。");
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "COMPLETED", semanticCommitId, object: receipt.object, record, replayed: true });
        return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_PROJECT_CLOSURE_COMMIT_RECOVERY_REQUIRED", "Project Closure Commit 已终止，不能建立平行事务。");
      if (!existing) {
        const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, input.observations), input.expectedUpdatedAt);
        if (revalidation.result.status === "STALE") {
          respond(response, 200, { status: "STALE", ...revalidation });
          return;
        }
        const now = new Date();
        store.prepareSemanticCommit({
          semanticCommitId,
          proposalId,
          status: "PENDING",
          beforeStateChecksum: checksum({ proposal: stored.files.proposalJson, expectedUpdatedAt: input.expectedUpdatedAt }),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }, [{ semanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.objectId, updatedAt: now.toISOString() }]);
      } else if (existingSteps.length !== 1 || existingSteps[0]?.operationId !== plan.objectId) {
        throw serviceError("V2_PROJECT_CLOSURE_COMMIT_LEDGER_CORRUPT", "Project Closure Commit 账本与预览不一致。");
      }
      const now = new Date();
      let object: V2ManagedObject;
      try {
        options.faults?.beforeProjectClosureDomainWrite?.();
        object = await application.completeProject(plan.objectId, plan.closure, {
          actor: "proposal_commit",
          expectedVersion: plan.expectedVersion,
          idempotencyKey: receiptKey,
          traceId: input.traceId,
        }, now);
      } catch (error) {
        if (
          !store.getCommandReceipt(receiptKey)
          && store.semanticCommit(semanticCommitId)?.status === "PENDING"
          && store.semanticCommitSteps(semanticCommitId).every((step) => step.status === "PREPARED")
        ) {
          const errorCode = error instanceof StructuredError ? error.code : "V2_PROJECT_CLOSURE_DOMAIN_WRITE_FAILED";
          store.finalizeSemanticCommit(semanticCommitId, "FAILED", now.toISOString(), undefined, errorCode);
          await terminalizeFailedClosureProposal(now);
        }
        throw error;
      }
      options.faults?.afterProjectClosureDomainWrite?.();
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(semanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(semanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(semanticCommitId, "COMPLETED", now.toISOString(), checksum(object));
      const record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, now);
      respond(response, 200, { status: "COMPLETED", semanticCommitId, object, record, replayed: false });
      return;
    }
    const projectClosureUndoMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/project-closure\/undo$/) : null;
    if (projectClosureUndoMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(projectClosureUndoMatch[1]);
      const input = await readProjectClosureUndoRequest(request);
      const original = store.semanticCommit(originalSemanticCommitId);
      if (!original?.proposalId || !["COMPLETED", "UNDONE"].includes(original.status)) throw serviceError("V2_PROJECT_CLOSURE_UNDO_NOT_AVAILABLE", "只有已完成且保留审阅证据的 Project Closure Commit 可以 Undo。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_PROJECT_CLOSURE_UNDO_LEDGER_CORRUPT", "原 Project Closure Commit 引用的 Proposal 不存在。");
      const plan = planAcceptedV2ProjectClosure(stored.proposal);
      const forwardSteps = store.semanticCommitSteps(originalSemanticCommitId);
      const forwardReceipt = store.getCommandReceipt(`project-closure:${originalSemanticCommitId}`);
      if (
        forwardSteps.length !== 1
        || forwardSteps[0]?.operationId !== plan.objectId
        || forwardReceipt?.command !== "complete_project"
        || forwardReceipt.object.objectId !== plan.objectId
        || forwardReceipt.object.objectType !== "PROJECT"
        || forwardReceipt.object.version !== plan.expectedVersion + 1
        || forwardReceipt.object.lifecycle !== "COMPLETED"
        || stableJson(forwardReceipt.object.closure) !== stableJson(plan.closure)
      ) throw serviceError("V2_PROJECT_CLOSURE_UNDO_LEDGER_CORRUPT", "Project Closure Undo 的正向回执与已审阅计划不一致。");

      const undoSemanticCommitId = projectClosureUndoSemanticCommitId(originalSemanticCommitId);
      const receiptKey = `project-closure-undo:${undoSemanticCommitId}`;
      const existing = store.semanticCommit(undoSemanticCommitId);
      const steps = existing ? store.semanticCommitSteps(undoSemanticCommitId) : [];
      if (original.status === "UNDONE" && existing?.status !== "COMPLETED") throw serviceError("V2_PROJECT_CLOSURE_UNDO_LEDGER_CORRUPT", "已撤销的 Project Closure Commit 缺少已完成逆向 Commit。");
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (
          existing.proposalId !== original.proposalId
          || steps.length !== 1
          || steps[0]?.operationId !== plan.objectId
          || receipt?.command !== "undo_lifecycle"
          || receipt.object.objectId !== plan.objectId
          || receipt.object.objectType !== "PROJECT"
          || receipt.object.version !== forwardReceipt.object.version + 1
          || receipt.object.lifecycle !== "OPEN"
          || receipt.object.closure !== undefined
        ) throw serviceError("V2_PROJECT_CLOSURE_UNDO_LEDGER_CORRUPT", "已完成 Project Closure Undo 缺少一致的逆向回执。");
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object: receipt.object, replayed: true });
        return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_PROJECT_CLOSURE_UNDO_NOT_AVAILABLE", "Project Closure Undo 已安全终止，不能建立平行逆向事务。");
      const priorUndoReceipt = store.getCommandReceipt(receiptKey);
      if (priorUndoReceipt && (
        priorUndoReceipt.command !== "undo_lifecycle"
        || priorUndoReceipt.object.objectId !== plan.objectId
        || priorUndoReceipt.object.objectType !== "PROJECT"
        || priorUndoReceipt.object.version !== forwardReceipt.object.version + 1
        || priorUndoReceipt.object.lifecycle !== "OPEN"
        || priorUndoReceipt.object.closure !== undefined
      )) throw serviceError("V2_PROJECT_CLOSURE_UNDO_LEDGER_CORRUPT", "Project Closure Undo 回执与已审阅计划不一致。");
      const currentObject = store.getObject(plan.objectId);
      if (!priorUndoReceipt && (!currentObject || checksum(currentObject) !== checksum(forwardReceipt.object))) throw serviceError("V2_PROJECT_CLOSURE_UNDO_STATE_CHANGED", "Project 在 Closure Commit 后已有变化；Undo 没有写入。");
      if (!existing) {
        const now = new Date();
        store.prepareSemanticCommit({ semanticCommitId: undoSemanticCommitId, proposalId: original.proposalId, status: "PENDING", beforeStateChecksum: checksum({ object: forwardReceipt.object, previous: { lifecycle: "OPEN" } }), createdAt: now.toISOString(), updatedAt: now.toISOString() }, [
          { semanticCommitId: undoSemanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.objectId, updatedAt: now.toISOString() },
        ]);
      } else if (existing.proposalId !== original.proposalId || steps.length !== 1 || steps[0]?.operationId !== plan.objectId) {
        throw serviceError("V2_PROJECT_CLOSURE_UNDO_LEDGER_CORRUPT", "Project Closure Undo 账本与已审阅计划不一致。");
      }
      const now = new Date();
      let result: { object: V2ManagedObject; replayed: boolean };
      try {
        result = {
          object: await application.undoLifecycle(plan.objectId, { lifecycle: "OPEN" }, { actor: "proposal_undo", expectedVersion: forwardReceipt.object.version, idempotencyKey: receiptKey, traceId: input.traceId }, now),
          replayed: priorUndoReceipt !== undefined,
        };
      } catch (error) {
        const terminalCodes = ["V2_OBJECT_VERSION_CONFLICT", "V2_OBJECT_NOT_FOUND", "V2_LIFECYCLE_UNDO_INVALID", "V2_LIFECYCLE_UNDO_SNAPSHOT_INVALID"];
        if (error instanceof StructuredError && terminalCodes.includes(error.code) && !store.getCommandReceipt(receiptKey) && store.semanticCommit(undoSemanticCommitId)?.status === "PENDING") store.finalizeSemanticCommit(undoSemanticCommitId, "FAILED", now.toISOString(), undefined, error.code);
        throw error;
      }
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), checksum(result.object));
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
      respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object: result.object, replayed: result.replayed });
      return;
    }
    const lifecycleCommitMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/lifecycle\/commit$/) : null;
    if (lifecycleCommitMatch?.[1]) {
      const proposalId = decodeURIComponent(lifecycleCommitMatch[1]);
      const input = await readLifecycleCommitRequest(request);
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const receiptKey = `lifecycle-transition:${semanticCommitId}`;
      await serializeByKey(`lifecycle-commit:${semanticCommitId}`, async () => {
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const existing = store.semanticCommit(semanticCommitId);
      const existingSteps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      const priorReceipt = store.getCommandReceipt(receiptKey);
      if (existing?.status === "PENDING" && stored.proposal.status === "STALE" && !priorReceipt) {
        if (existingSteps.every((step) => step.status === "PREPARED")) store.finalizeSemanticCommit(semanticCommitId, "FAILED", new Date().toISOString(), undefined, "V2_PROPOSAL_COMMIT_STALE");
        throw serviceError("V2_LIFECYCLE_COMMIT_STALE_RECOVERED", "已收口正文变化后的 MiniProject Completion Commit；请重新发起关闭审阅。");
      }
      if (existing?.status === "FAILED" && ["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(stored.proposal.status)) {
        await proposalApplication.markFailed(proposalId, stored.updatedAt);
        throw serviceError("V2_LIFECYCLE_COMMIT_RECOVERY_REQUIRED", "已收口失败的 MiniProject Completion Proposal；请重新发起关闭审阅。");
      }
      const plan = planAcceptedV2LifecycleTransition(stored.proposal);
      if ("action" in plan && !priorReceipt) {
        const currentObject = store.getObject(plan.objectId);
        if (!currentObject || currentObject.version !== plan.expectedVersion || currentObject.objectType !== plan.objectType || currentObject.lifecycle !== plan.previousLifecycle || checksum(currentObject.closure ?? null) !== checksum(plan.previousClosure ?? null)) throw serviceError("V2_LIFECYCLE_COMMIT_TARGET_STALE", "Lifecycle Proposal 的真实对象类型、源状态、Closure 或版本已变化；没有准备 Commit。");
      }
      const expectedConfirmation = "action" in plan ? (plan.action === "CANCEL" ? "CANCEL_OBJECT" : plan.action === "REOPEN" ? "REOPEN_OBJECT" : "ARCHIVE_OBJECT") : "COMPLETE_MINI_PROJECT";
      if (input.confirmation !== expectedConfirmation) throw serviceError("LIFECYCLE_COMMIT_CONFIRMATION_MISMATCH", "Lifecycle Commit 确认词与已审阅动作不一致。");
      const receiptCommand = "action" in plan ? (plan.action === "CANCEL" ? "cancel_lifecycle" : plan.action === "REOPEN" ? "reopen_lifecycle" : "transition_lifecycle") : plan.evidenceKind === "MARKER" ? "complete_mini_project_from_marker" : "complete_mini_project";
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (existingSteps.length !== 1 || existingSteps[0]?.operationId !== plan.objectId || receipt?.command !== receiptCommand) throw serviceError("V2_LIFECYCLE_COMMIT_LEDGER_CORRUPT", "MiniProject Completion Commit 账本与审阅计划不一致。");
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "COMPLETED", semanticCommitId, object: receipt.object, ...("anchor" in receipt ? { anchor: receipt.anchor } : {}), record, replayed: true });
        return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_LIFECYCLE_COMMIT_RECOVERY_REQUIRED", "MiniProject Completion Commit 已终止，不能建立平行事务。");
      if (priorReceipt && (priorReceipt.command !== receiptCommand || priorReceipt.object.objectId !== plan.objectId || priorReceipt.object.objectType !== plan.objectType || priorReceipt.object.version !== plan.expectedVersion + 1 || ("action" in plan && priorReceipt.object.lifecycle !== plan.lifecycle))) throw serviceError("V2_LIFECYCLE_COMMIT_LEDGER_CORRUPT", "Lifecycle Commit 回执与审阅计划不一致。");
      if (!priorReceipt) {
        const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, input.observations), input.expectedUpdatedAt);
        if (revalidation.result.status === "STALE") {
          options.faults?.afterLifecycleProposalStale?.();
          if (existing?.status === "PENDING" && existingSteps.every((step) => step.status === "PREPARED")) store.finalizeSemanticCommit(semanticCommitId, "FAILED", new Date().toISOString(), undefined, "V2_PROPOSAL_COMMIT_STALE");
          respond(response, 200, { status: "STALE", ...revalidation }); return;
        }
      }
      if (!existing) {
        const preparedAt = input.expectedUpdatedAt;
        store.prepareSemanticCommit({ semanticCommitId, proposalId, status: "PENDING", beforeStateChecksum: checksum({ proposal: stored.files.proposalJson, expectedUpdatedAt: input.expectedUpdatedAt }), createdAt: preparedAt, updatedAt: preparedAt }, [
          { semanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.objectId, updatedAt: preparedAt },
        ]);
        options.faults?.afterLifecyclePrepare?.();
      } else if (existingSteps.length !== 1 || existingSteps[0]?.operationId !== plan.objectId) throw serviceError("V2_LIFECYCLE_COMMIT_LEDGER_CORRUPT", "MiniProject Completion Commit 账本与审阅计划不一致。");
      const now = new Date();
      const envelope = { actor: "proposal_commit", expectedVersion: plan.expectedVersion, idempotencyKey: receiptKey, traceId: input.traceId };
      let result: { object: V2ManagedObject; anchor?: V2Anchor; replayed: boolean };
      try {
        if ("action" in plan) {
          const object = plan.action === "CANCEL"
            ? await application.cancelLifecycle(plan.objectId, plan.reason, envelope, now)
            : plan.action === "REOPEN"
              ? await application.reopenLifecycle(plan.objectId, plan.reason, envelope, now)
              : await application.transitionLifecycle(plan.objectId, "ARCHIVED", envelope, now);
          result = { object, replayed: priorReceipt?.command === receiptCommand };
        } else if (plan.evidenceKind === "MARKER") {
          result = await application.completeMiniProjectFromMarker({ objectType: plan.objectType, text: plan.text, marker: plan.marker, graphId: options.graphId, externalId: plan.externalId, contentHash: plan.contentHash, expectedObjectId: plan.objectId, closure: plan.closure }, envelope, now);
        } else {
          result = { object: await application.completeMiniProject(plan.objectId, plan.closure, envelope, now), replayed: priorReceipt?.command === receiptCommand };
        }
      } catch (error) {
        const concurrentReceipt = store.getCommandReceipt(receiptKey);
        if (concurrentReceipt?.command === receiptCommand) {
          if ("action" in plan) {
            const object = plan.action === "CANCEL"
              ? await application.cancelLifecycle(plan.objectId, plan.reason, envelope, now)
              : plan.action === "REOPEN"
                ? await application.reopenLifecycle(plan.objectId, plan.reason, envelope, now)
                : await application.transitionLifecycle(plan.objectId, "ARCHIVED", envelope, now);
            result = { object, replayed: true };
          } else if (plan.evidenceKind === "MARKER") result = await application.completeMiniProjectFromMarker({ objectType: plan.objectType, text: plan.text, marker: plan.marker, graphId: options.graphId, externalId: plan.externalId, contentHash: plan.contentHash, expectedObjectId: plan.objectId, closure: plan.closure }, envelope, now);
          else result = { object: await application.completeMiniProject(plan.objectId, plan.closure, envelope, now), replayed: true };
        } else {
          const terminalCodes = ["V2_OBJECT_VERSION_CONFLICT", "V2_EXPLICIT_BINDING_OBJECT_MISMATCH", "V2_REVIEWED_MINI_PROJECT_CLOSURE_CONFLICT", "V2_MINI_PROJECT_CLOSURE_MINI_PROJECT_ONLY", "V2_PRIMARY_ANCHOR_INVALID"];
          if (error instanceof StructuredError && terminalCodes.includes(error.code) && store.semanticCommit(semanticCommitId)?.status === "PENDING" && store.semanticCommitSteps(semanticCommitId).every((step) => step.status === "PREPARED")) {
            store.finalizeSemanticCommit(semanticCommitId, "FAILED", now.toISOString(), undefined, error.code);
            options.faults?.afterLifecycleCommitFailed?.();
            const latest = await proposalApplication.get(proposalId);
            if (latest && !["APPLIED", "FAILED"].includes(latest.proposal.status)) await proposalApplication.markFailed(proposalId, latest.updatedAt, now);
          }
          throw error;
        }
      }
      options.faults?.afterLifecycleDomainWrite?.();
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(semanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(semanticCommitId, 0, "VERIFIED", now.toISOString());
      if (store.semanticCommit(semanticCommitId)?.status === "PENDING") store.finalizeSemanticCommit(semanticCommitId, "COMPLETED", now.toISOString(), checksum({ object: result.object, ...(result.anchor ? { anchor: result.anchor } : {}) }));
      let record = await proposalApplication.get(proposalId);
      if (!record) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 在 Commit 收口时不存在。");
      if (record.proposal.status !== "APPLIED") {
        try { record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, now); }
        catch (error) {
          const converged = await proposalApplication.get(proposalId);
          if (converged?.proposal.status !== "APPLIED") throw error;
          record = converged;
        }
      }
      respond(response, 200, { status: "COMPLETED", semanticCommitId, object: result.object, ...(result.anchor ? { anchor: result.anchor } : {}), record, replayed: result.replayed });
      });
      return;
    }
    const lifecycleUndoMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/lifecycle\/undo$/) : null;
    if (lifecycleUndoMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(lifecycleUndoMatch[1]);
      const input = await readLifecycleUndoRequest(request);
      const original = store.semanticCommit(originalSemanticCommitId);
      if (!original?.proposalId || !["COMPLETED", "UNDONE"].includes(original.status)) throw serviceError("V2_LIFECYCLE_UNDO_NOT_AVAILABLE", "只有已完成且保留审阅证据的 Lifecycle Commit 可以 Undo。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "原 Lifecycle Commit 引用的 Proposal 不存在。");
      const plan = planAcceptedV2LifecycleTransition(stored.proposal);
      if (!("action" in plan)) throw serviceError("V2_LIFECYCLE_UNDO_NOT_AVAILABLE", "只有显式取消或重开 Lifecycle Commit 支持对象级 Undo。");
      const forwardSteps = store.semanticCommitSteps(originalSemanticCommitId);
      const forwardReceipt = store.getCommandReceipt(`lifecycle-transition:${originalSemanticCommitId}`);
      const forwardCommand = plan.action === "CANCEL" ? "cancel_lifecycle" : "reopen_lifecycle";
      if (
        forwardSteps.length !== 1 || forwardSteps[0]?.operationId !== plan.objectId
        || forwardReceipt?.command !== forwardCommand
        || forwardReceipt.object.objectId !== plan.objectId
        || forwardReceipt.object.objectType !== plan.objectType
        || forwardReceipt.object.version !== plan.expectedVersion + 1
        || forwardReceipt.object.lifecycle !== plan.lifecycle
      ) throw serviceError("V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "Lifecycle Undo 的正向回执与已审阅计划不一致。");

      const previous = { lifecycle: plan.previousLifecycle, ...(plan.previousClosure ? { closure: plan.previousClosure } : {}) } as const;
      const undoSemanticCommitId = lifecycleUndoSemanticCommitId(originalSemanticCommitId);
      const receiptKey = `lifecycle-undo:${undoSemanticCommitId}`;
      const existing = store.semanticCommit(undoSemanticCommitId);
      const steps = existing ? store.semanticCommitSteps(undoSemanticCommitId) : [];
      if (original.status === "UNDONE" && existing?.status !== "COMPLETED") throw serviceError("V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "已撤销的 Lifecycle Commit 缺少已完成逆向 Commit。");
      if (existing?.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (existing.proposalId !== original.proposalId || steps.length !== 1 || steps[0]?.operationId !== plan.objectId || receipt?.command !== "undo_lifecycle" || receipt.object.objectId !== plan.objectId || receipt.object.objectType !== plan.objectType || receipt.object.version !== forwardReceipt.object.version + 1 || receipt.object.lifecycle !== plan.previousLifecycle) throw serviceError("V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "已完成 Lifecycle Undo 缺少一致的逆向回执。");
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object: receipt.object, replayed: true });
        return;
      }
      if (existing && existing.status !== "PENDING") throw serviceError("V2_LIFECYCLE_UNDO_NOT_AVAILABLE", "Lifecycle Undo 已终止，不能建立平行逆向事务。");
      const priorUndoReceipt = store.getCommandReceipt(receiptKey);
      if (priorUndoReceipt && (priorUndoReceipt.command !== "undo_lifecycle" || priorUndoReceipt.object.objectId !== plan.objectId || priorUndoReceipt.object.objectType !== plan.objectType || priorUndoReceipt.object.version !== forwardReceipt.object.version + 1 || priorUndoReceipt.object.lifecycle !== plan.previousLifecycle)) throw serviceError("V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "Lifecycle Undo 回执与已审阅计划不一致。");
      const currentObject = store.getObject(plan.objectId);
      if (!priorUndoReceipt && (!currentObject || checksum(currentObject) !== checksum(forwardReceipt.object))) throw serviceError("V2_LIFECYCLE_UNDO_STATE_CHANGED", "对象在正向 Lifecycle Commit 后已有变化；Undo 没有写入。");
      if (!existing) {
        const now = new Date();
        store.prepareSemanticCommit({ semanticCommitId: undoSemanticCommitId, proposalId: original.proposalId, status: "PENDING", beforeStateChecksum: checksum({ object: forwardReceipt.object, previous }), createdAt: now.toISOString(), updatedAt: now.toISOString() }, [
          { semanticCommitId: undoSemanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: plan.objectId, updatedAt: now.toISOString() },
        ]);
        options.faults?.afterLifecycleUndoPrepare?.();
      } else if (existing.proposalId !== original.proposalId || steps.length !== 1 || steps[0]?.operationId !== plan.objectId) {
        throw serviceError("V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "Lifecycle Undo 账本与已审阅计划不一致。");
      }
      const now = new Date();
      let result: { object: V2ManagedObject; replayed: boolean };
      try {
        result = { object: await application.undoLifecycle(plan.objectId, previous, { actor: "proposal_undo", expectedVersion: forwardReceipt.object.version, idempotencyKey: receiptKey, traceId: input.traceId }, now), replayed: priorUndoReceipt !== undefined };
      } catch (error) {
        const terminalCodes = ["V2_OBJECT_VERSION_CONFLICT", "V2_OBJECT_NOT_FOUND", "V2_LIFECYCLE_UNDO_INVALID", "V2_LIFECYCLE_UNDO_SNAPSHOT_INVALID"];
        if (error instanceof StructuredError && terminalCodes.includes(error.code) && !store.getCommandReceipt(receiptKey) && store.semanticCommit(undoSemanticCommitId)?.status === "PENDING") store.finalizeSemanticCommit(undoSemanticCommitId, "FAILED", now.toISOString(), undefined, error.code);
        throw error;
      }
      options.faults?.afterLifecycleUndoDomainWrite?.();
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), checksum(result.object));
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
      respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, object: result.object, replayed: result.replayed });
      return;
    }
    const proposalCommitPrepareMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/commit\/prepare$/) : null;
    if (proposalCommitPrepareMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalCommitPrepareMatch[1]);
      const input = await readProposalRevalidationRequest(request);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const plan = planAcceptedV2ProposalCommit(stored.proposal);
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const existing = store.semanticCommit(semanticCommitId);
      const existingSteps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      const existingObjectId = existingSteps[1]?.operationId;
      if (existing && ["PENDING", "RECOVERY_REQUIRED", "COMPLETED"].includes(existing.status)) {
        if (existingSteps.length !== 2 || !existingObjectId) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "Proposal Commit ledger 缺少对象身份或步骤。");
        if (existing.status === "COMPLETED" && stored.proposal.status !== "APPLIED") await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        if (existing.status === "COMPLETED") await resolveCandidateForAppliedProposal(proposalId);
        respond(response, 200, { status: existing.status === "PENDING" ? "PREPARED" : existing.status, semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, objectId: existingObjectId, plan, replayed: true });
        return;
      }
      if (existing) throw serviceError("V2_PROPOSAL_COMMIT_RECOVERY_REQUIRED", "Proposal Commit 已终止，不能创建平行事务。");
      if ("update" in plan) {
        const currentObject = store.getObject(plan.update.objectId);
        const currentAnchor = store.getPrimaryAnchorByExternal(options.graphId, plan.patch.blockUuid);
        const beforeParsed = parseExplicitObjectSyntax(plan.patch.beforeText);
        const afterParsed = parseExplicitObjectSyntax(plan.patch.afterText);
        if (!currentObject || !currentAnchor || currentAnchor.status !== "active" || currentAnchor.objectId !== plan.update.objectId
          || currentAnchor.contentHash !== plan.patch.beforeHash || currentObject.version !== plan.update.expectedVersion
          || currentObject.objectType !== plan.update.objectType || currentObject.text !== plan.update.beforeText
          || beforeParsed.kind !== "OBJECT" || beforeParsed.objectType !== plan.update.objectType || beforeParsed.title !== plan.update.beforeText
          || afterParsed.kind !== "OBJECT" || afterParsed.objectType !== plan.update.objectType || afterParsed.title !== plan.update.text
          || (beforeParsed.kind === "OBJECT" && afterParsed.kind === "OBJECT" && beforeParsed.marker !== afterParsed.marker)) {
          throw serviceError("V2_OBJECT_UPDATE_TARGET_STALE", "更新 Proposal 的 Block、Anchor、对象或正文投影不再一致；没有准备 Commit。");
        }
      }
      const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, input.observations), input.expectedUpdatedAt);
      if (revalidation.result.status === "STALE") {
        respond(response, 200, { status: "STALE", ...revalidation });
        return;
      }
      const objectId = "update" in plan ? plan.update.objectId : createId("obj", new Date());
      if (!objectId) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "Proposal Commit 缺少对象身份。");
      const now = new Date();
      const prepared = store.prepareSemanticCommit({
        semanticCommitId,
        proposalId,
        status: "PENDING",
        beforeStateChecksum: checksum({ proposal: stored.files.proposalJson, expectedUpdatedAt: input.expectedUpdatedAt }),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }, [
        { semanticCommitId, stepIndex: 0, stepKind: "GRAPH_WRITE", status: "PREPARED", operationId: plan.patch.blockUuid, beforeHash: plan.patch.beforeHash, afterHash: plan.patch.afterHash, updatedAt: now.toISOString() },
        { semanticCommitId, stepIndex: 1, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: objectId, updatedAt: now.toISOString() },
      ]);
      respond(response, prepared.replayed ? 200 : 201, { status: "PREPARED", semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, objectId, plan, replayed: prepared.replayed });
      return;
    }
    const proposalCommitFinalizeMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/commit\/finalize$/) : null;
    if (proposalCommitFinalizeMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalCommitFinalizeMatch[1]);
      const input = await readProposalCommitEvidenceRequest(request);
      if (input.proposalId !== proposalId || input.semanticCommitId !== proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt)) throw serviceError("V2_PROPOSAL_COMMIT_INTENT_MISMATCH", "Proposal Commit 意图与当前 Graph/Proposal 不一致。");
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const plan = planAcceptedV2ProposalCommit(stored.proposal);
      const commit = store.semanticCommit(input.semanticCommitId);
      const steps = store.semanticCommitSteps(input.semanticCommitId);
      const objectId = steps[1]?.operationId;
      if (!commit || commit.proposalId !== proposalId || steps.length !== 2 || steps[0]?.operationId !== plan.patch.blockUuid || steps[0]?.beforeHash !== plan.patch.beforeHash || steps[0]?.afterHash !== plan.patch.afterHash || !objectId || ("update" in plan && objectId !== plan.update.objectId)) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "Proposal Commit ledger 与已审阅计划不一致。");
      const receiptKey = `proposal-commit:${input.semanticCommitId}`;
      if (commit.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        const expectedCommand = "update" in plan ? "synchronize_explicit_object" : "materialize_explicit_object";
        if (receipt?.command !== expectedCommand || ("update" in plan && (receipt.object.objectId !== plan.update.objectId || receipt.anchor.objectId !== plan.update.objectId || receipt.anchor.externalId !== plan.patch.blockUuid))) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "已完成 Proposal Commit 缺少匹配的领域回执。");
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        await resolveCandidateForAppliedProposal(proposalId);
        respond(response, 200, { status: "COMPLETED", semanticCommitId: input.semanticCommitId, object: receipt.object, anchor: receipt.anchor, record, replayed: true });
        return;
      }
      if (commit.status === "RECOVERY_REQUIRED") {
        respond(response, 200, { status: "COMPENSATION_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, patch: plan.patch });
        return;
      }
      if (input.blockUuid !== plan.patch.blockUuid || input.contentHash !== plan.patch.afterHash) throw serviceError("V2_PROPOSAL_COMMIT_GRAPH_EVIDENCE_MISMATCH", "Graph 结果与已审阅 Patch 不一致。");
      const now = new Date();
      if (steps[0]?.status === "PREPARED") store.advanceSemanticCommitStep(input.semanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(input.semanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(input.semanticCommitId, 0, "VERIFIED", now.toISOString());
      let result;
      try {
        result = "update" in plan
          ? await application.synchronizeExplicitObject({ objectType: plan.update.objectType, text: plan.update.text, graphId: options.graphId, externalId: plan.patch.blockUuid, contentHash: plan.patch.afterHash, expectedObjectId: plan.update.objectId }, { actor: "proposal_commit", expectedVersion: plan.update.expectedVersion, idempotencyKey: receiptKey, traceId: input.traceId }, now)
          : await application.materializeExplicitObject({ objectId, objectType: plan.create.objectType, text: plan.create.text, anchor: { graphId: options.graphId, externalId: plan.patch.blockUuid, contentHash: plan.patch.afterHash } }, { actor: "proposal_commit", expectedVersion: 0, idempotencyKey: receiptKey, traceId: input.traceId }, now);
        if ("update" in plan && (result.object.objectId !== plan.update.objectId || result.anchor.objectId !== plan.update.objectId || result.anchor.externalId !== plan.patch.blockUuid)) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "更新结果脱离已审阅对象与 Anchor 绑定；Commit 需要恢复。");
      } catch {
        store.advanceSemanticCommitStep(input.semanticCommitId, 0, "RECOVERY_REQUIRED", now.toISOString(), "DOMAIN_WRITE_FAILED");
        store.finalizeSemanticCommit(input.semanticCommitId, "RECOVERY_REQUIRED", now.toISOString(), undefined, "DOMAIN_WRITE_FAILED");
        respond(response, 200, { status: "COMPENSATION_REQUIRED", semanticCommitId: input.semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, patch: plan.patch });
        return;
      }
      const domainStep = store.semanticCommitSteps(input.semanticCommitId)[1];
      if (domainStep?.status === "PREPARED") store.advanceSemanticCommitStep(input.semanticCommitId, 1, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(input.semanticCommitId)[1]?.status === "APPLIED") store.advanceSemanticCommitStep(input.semanticCommitId, 1, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(input.semanticCommitId, "COMPLETED", now.toISOString(), checksum({ object: result.object, anchor: result.anchor }));
      const record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, now);
      await resolveCandidateForAppliedProposal(proposalId, now);
      respond(response, 200, { status: "COMPLETED", semanticCommitId: input.semanticCommitId, object: result.object, anchor: result.anchor, record, replayed: result.replayed });
      return;
    }
    const proposalCommitCompensateMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/commit\/compensate$/) : null;
    if (proposalCommitCompensateMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalCommitCompensateMatch[1]);
      const input = await readProposalCommitEvidenceRequest(request);
      if (input.proposalId !== proposalId || input.semanticCommitId !== proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt)) throw serviceError("V2_PROPOSAL_COMMIT_INTENT_MISMATCH", "Proposal 补偿意图不匹配。");
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const plan = planAcceptedV2ProposalCommit(stored.proposal);
      const commit = store.semanticCommit(input.semanticCommitId);
      const graphStep = store.semanticCommitSteps(input.semanticCommitId)[0];
      if (commit?.status !== "RECOVERY_REQUIRED" || graphStep?.status !== "RECOVERY_REQUIRED" || input.blockUuid !== plan.patch.blockUuid || input.contentHash !== plan.patch.beforeHash) throw serviceError("V2_PROPOSAL_COMPENSATION_EVIDENCE_MISMATCH", "Graph 补偿证据与恢复账本不一致。");
      const now = new Date();
      store.advanceSemanticCommitStep(input.semanticCommitId, 0, "COMPENSATED", now.toISOString());
      store.finalizeSemanticCommit(input.semanticCommitId, "FAILED", now.toISOString(), undefined, "DOMAIN_WRITE_FAILED");
      const record = await proposalApplication.markFailed(proposalId, input.expectedUpdatedAt, now);
      respond(response, 200, { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, record });
      return;
    }
    const proposalUndoPrepareMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/undo\/prepare$/) : null;
    if (proposalUndoPrepareMatch?.[1]) {
      await readProposalUndoPrepareRequest(request);
      const originalSemanticCommitId = decodeURIComponent(proposalUndoPrepareMatch[1]);
      const undoSemanticCommitId = proposalUndoSemanticCommitId(originalSemanticCommitId);
      const original = store.semanticCommit(originalSemanticCommitId);
      if (!original?.proposalId || !["COMPLETED", "UNDONE"].includes(original.status)) throw serviceError("V2_PROPOSAL_UNDO_NOT_AVAILABLE", "只有已完成且尚有历史证据的 Proposal Commit 可以 Undo。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "原 Commit 引用的 Proposal 不存在。");
      const plan = planAcceptedV2ProposalCommit(stored.proposal);
      const receipt = store.getCommandReceipt(`proposal-commit:${originalSemanticCommitId}`);
      const expectedCommand = "update" in plan ? "synchronize_explicit_object" : "materialize_explicit_object";
      if (receipt?.command !== expectedCommand || ("update" in plan && (receipt.object.objectId !== plan.update.objectId || receipt.anchor.objectId !== plan.update.objectId || receipt.anchor.externalId !== plan.patch.blockUuid))) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "原 Commit 缺少匹配的领域回执。");
      const existing = store.semanticCommit(undoSemanticCommitId);
      if (original.status === "UNDONE" && existing?.status === "COMPLETED") {
        await reopenCandidateForUndoneProposal(original.proposalId);
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, objectId: receipt.object.objectId, patch: plan.patch, replayed: true });
        return;
      }
      if (original.status === "COMPLETED" && existing?.status === "COMPLETED") {
        store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        await reopenCandidateForUndoneProposal(original.proposalId);
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, objectId: receipt.object.objectId, patch: plan.patch, replayed: true });
        return;
      }
      if (existing && !["PENDING", "RECOVERY_REQUIRED"].includes(existing.status)) throw serviceError("V2_PROPOSAL_UNDO_NOT_AVAILABLE", "Undo 已终止或状态不一致，不能建立平行事务。");
      const undoReceipt = store.getCommandReceipt(`proposal-undo:${undoSemanticCommitId}`);
      if (!undoReceipt) {
        const currentObject = store.getObject(receipt.object.objectId);
        const currentAnchor = store.getPrimaryAnchorById(receipt.anchor.anchorId);
        if (checksum(currentObject) !== checksum(receipt.object) || checksum(currentAnchor) !== checksum(receipt.anchor)) throw serviceError("V2_PROPOSAL_UNDO_STATE_CHANGED", "对象或 Anchor 已有后续变化；Undo 没有写入。");
      }
      const now = new Date();
      const prepared = store.prepareSemanticCommit({
        semanticCommitId: undoSemanticCommitId, proposalId: original.proposalId, status: "PENDING",
        beforeStateChecksum: original.afterStateChecksum ?? checksum({ object: receipt.object, anchor: receipt.anchor }),
        createdAt: existing?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
      }, [
        { semanticCommitId: undoSemanticCommitId, stepIndex: 0, stepKind: "GRAPH_WRITE", status: "PREPARED", operationId: plan.patch.blockUuid, beforeHash: plan.patch.afterHash, afterHash: plan.patch.beforeHash, updatedAt: now.toISOString() },
        { semanticCommitId: undoSemanticCommitId, stepIndex: 1, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: receipt.object.objectId, updatedAt: now.toISOString() },
      ]);
      respond(response, prepared.replayed ? 200 : 201, { status: existing?.status === "RECOVERY_REQUIRED" ? "RECOVERY_REQUIRED" : "PREPARED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, objectId: receipt.object.objectId, patch: plan.patch, replayed: prepared.replayed });
      return;
    }
    const proposalUndoFinalizeMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/undo\/finalize$/) : null;
    if (proposalUndoFinalizeMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(proposalUndoFinalizeMatch[1]);
      const input = await readProposalUndoEvidenceRequest(request);
      const undoSemanticCommitId = proposalUndoSemanticCommitId(originalSemanticCommitId);
      if (input.originalSemanticCommitId !== originalSemanticCommitId || input.undoSemanticCommitId !== undoSemanticCommitId) throw serviceError("V2_PROPOSAL_UNDO_INTENT_MISMATCH", "Undo 意图与路径不一致。");
      const original = store.semanticCommit(originalSemanticCommitId);
      const inverse = store.semanticCommit(undoSemanticCommitId);
      if (!original?.proposalId || !inverse || inverse.proposalId !== original.proposalId) throw serviceError("V2_PROPOSAL_UNDO_LEDGER_CORRUPT", "Undo ledger 与原 Commit 不一致。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "原 Commit 引用的 Proposal 不存在。");
      const plan = planAcceptedV2ProposalCommit(stored.proposal);
      const receipt = store.getCommandReceipt(`proposal-commit:${originalSemanticCommitId}`);
      const expectedCommand = "update" in plan ? "synchronize_explicit_object" : "materialize_explicit_object";
      if (receipt?.command !== expectedCommand || ("update" in plan && (receipt.object.objectId !== plan.update.objectId || receipt.anchor.objectId !== plan.update.objectId || receipt.anchor.externalId !== plan.patch.blockUuid))) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "原 Commit 缺少匹配的领域回执。");
      if (inverse.status === "COMPLETED" && ["COMPLETED", "UNDONE"].includes(original.status)) {
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        await reopenCandidateForUndoneProposal(original.proposalId);
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, objectId: receipt.object.objectId, replayed: true });
        return;
      }
      if (inverse.status === "RECOVERY_REQUIRED") {
        respond(response, 200, { status: "COMPENSATION_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, patch: plan.patch });
        return;
      }
      const steps = store.semanticCommitSteps(undoSemanticCommitId);
      if (steps.length !== 2 || steps[0]?.operationId !== plan.patch.blockUuid || steps[1]?.operationId !== receipt.object.objectId || input.blockUuid !== plan.patch.blockUuid || input.contentHash !== plan.patch.beforeHash) throw serviceError("V2_PROPOSAL_UNDO_GRAPH_EVIDENCE_MISMATCH", "Undo Graph 证据与逆向账本不一致。");
      const now = new Date();
      if (steps[0]?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "VERIFIED", now.toISOString());
      let undone;
      try {
        undone = "update" in plan
          ? await application.synchronizeExplicitObject({ objectType: plan.update.objectType, text: plan.update.beforeText, graphId: options.graphId, externalId: plan.patch.blockUuid, contentHash: plan.patch.beforeHash, expectedObjectId: plan.update.objectId }, { actor: "proposal_undo", expectedVersion: receipt.object.version, idempotencyKey: `proposal-undo:${undoSemanticCommitId}`, traceId: input.traceId }, now)
          : await application.undoMaterialization({ object: receipt.object, anchor: receipt.anchor }, { actor: "proposal_undo", expectedVersion: receipt.object.version, idempotencyKey: `proposal-undo:${undoSemanticCommitId}`, traceId: input.traceId }, now);
      } catch {
        store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "RECOVERY_REQUIRED", now.toISOString(), "DOMAIN_UNDO_FAILED");
        store.finalizeSemanticCommit(undoSemanticCommitId, "RECOVERY_REQUIRED", now.toISOString(), undefined, "DOMAIN_UNDO_FAILED");
        respond(response, 200, { status: "COMPENSATION_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, patch: plan.patch });
        return;
      }
      const domainStep = store.semanticCommitSteps(undoSemanticCommitId)[1];
      if (domainStep?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 1, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[1]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 1, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), "update" in plan ? checksum({ object: undone.object, anchor: undone.anchor }) : checksum({ objectRemoved: undone.object.objectId, anchorRemoved: undone.anchor.anchorId }));
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
      await reopenCandidateForUndoneProposal(original.proposalId, now);
      respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, objectId: undone.object.objectId, replayed: undone.replayed });
      return;
    }
    const proposalUndoCompensateMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/undo\/compensate$/) : null;
    if (proposalUndoCompensateMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(proposalUndoCompensateMatch[1]);
      const input = await readProposalUndoEvidenceRequest(request);
      const undoSemanticCommitId = proposalUndoSemanticCommitId(originalSemanticCommitId);
      const inverse = store.semanticCommit(undoSemanticCommitId);
      const graphStep = store.semanticCommitSteps(undoSemanticCommitId)[0];
      if (input.originalSemanticCommitId !== originalSemanticCommitId || input.undoSemanticCommitId !== undoSemanticCommitId || inverse?.status !== "RECOVERY_REQUIRED" || graphStep?.status !== "RECOVERY_REQUIRED" || input.blockUuid !== graphStep.operationId || input.contentHash !== graphStep.beforeHash) throw serviceError("V2_PROPOSAL_UNDO_COMPENSATION_EVIDENCE_MISMATCH", "Undo 补偿证据与恢复账本不一致。");
      const now = new Date();
      store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "COMPENSATED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "FAILED", now.toISOString(), undefined, "DOMAIN_UNDO_FAILED");
      respond(response, 200, { status: "FAILED_COMPENSATED", originalSemanticCommitId, undoSemanticCommitId });
      return;
    }
    const proposalRevalidationMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/revalidate$/) : null;
    if (proposalRevalidationMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalRevalidationMatch[1]);
      const input = await readProposalRevalidationRequest(request);
      requireNoUnfinishedProposalCommit(proposalId);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      respond(response, 200, await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, input.observations), input.expectedUpdatedAt));
      return;
    }
    const proposalReviewMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/review$/) : null;
    if (proposalReviewMatch?.[1]) {
      const input = await readProposalReviewRequest(request);
      const proposalId = decodeURIComponent(proposalReviewMatch[1]);
      requireNoUnfinishedProposalCommit(proposalId);
      if (input.miniProjectClosure) {
        const accepted = Object.entries(input.decisions).filter(([, decision]) => decision.disposition === "ACCEPTED" && decision.highImpactConfirmed === true);
        if (accepted.length !== 1 || Object.keys(input.decisions).length !== 1) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "MiniProject Closure 三问必须与唯一 HIGH 语义组一起确认。");
        respond(response, 200, await proposalApplication.reviewMiniProjectClosure(proposalId, accepted[0]![0], input.miniProjectClosure, input.expectedUpdatedAt));
      } else {
        respond(response, 200, await proposalApplication.review(proposalId, input.decisions, input.expectedUpdatedAt));
      }
      return;
    }
    const miniProjectClosureDraftMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/mini-project-closure\/draft$/) : null;
    if (miniProjectClosureDraftMatch?.[1]) {
      const input = await readMiniProjectClosureDraftRequest(request);
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        respond(response, 200, await draftMiniProjectClosure(decodeURIComponent(miniProjectClosureDraftMatch[1]), input, controller.signal));
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    const proposalReadMatch = request.method === "GET" ? url.pathname.match(/^\/proposals\/([^/]+)$/) : null;
    if (proposalReadMatch?.[1]) {
      const record = await proposalApplication.get(decodeURIComponent(proposalReadMatch[1]));
      respond(response, record ? 200 : 404, record ? { record } : { error: { code: "V2_PROPOSAL_NOT_FOUND" } });
      return;
    }
    const proposalProjectCreationPrepareMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/project-creation\/commit\/prepare$/) : null;
    if (proposalProjectCreationPrepareMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalProjectCreationPrepareMatch[1]);
      const input = await readProposalProjectCreationPrepareRequest(request);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Project 创建 Proposal 不存在。");
      const plan = planAcceptedV2ProjectCreation(stored.proposal);
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const existing = store.semanticCommit(semanticCommitId);
      const existingSteps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      const objectId = existingSteps[1]?.operationId;
      const expectedPageOperationId = plan.pageTarget.id;
      if (existing) {
        const graphStep = existingSteps[0];
        const pageOperationMatches = graphStep?.afterHash === undefined
          ? graphStep?.operationId === expectedPageOperationId
          : (plan.relationshipMode === "REUSE_SOURCE_PAGE" ? graphStep.operationId === plan.pageTarget.id && graphStep.afterHash === plan.pageTarget.hash : true);
        if (
          existing.proposalId !== proposalId || existingSteps.length !== 2
          || graphStep?.stepKind !== "GRAPH_WRITE" || !pageOperationMatches
          || existingSteps[1]?.stepKind !== "DOMAIN_WRITE" || !objectId
        ) throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "Project 创建账本与已审阅计划不一致。");
        if (existing.status === "COMPLETED") {
          const receipt = store.getCommandReceipt(`project-create-proposal:${semanticCommitId}`);
          if (receipt?.command !== "create_project_with_page" || receipt.object.objectId !== objectId) {
            throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "已完成 Project 创建事务缺少匹配领域回执。");
          }
          const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
          respond(response, 200, {
            status: "COMPLETED",
            semanticCommitId,
            proposalId,
            expectedUpdatedAt: input.expectedUpdatedAt,
            objectId,
            pageName: plan.pageName,
            relationshipMode: plan.relationshipMode,
            pageExternalId: receipt.anchor.externalId,
            object: receipt.object,
            anchor: receipt.anchor,
            record,
            replayed: true,
          });
          return;
        }
        if (stored.updatedAt !== input.expectedUpdatedAt) throw serviceError("V2_PROPOSAL_COMMIT_STALE", "Project 创建 Proposal 已变化；不能重放未完成事务。");
        if (existing.status === "RECOVERY_REQUIRED") {
          if (!graphStep?.operationId || !graphStep.afterHash || graphStep.status !== "RECOVERY_REQUIRED") throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "Project 创建恢复账本缺少实际 Page 身份或 hash。");
          respond(response, 200, {
            status: "RECOVERY_REQUIRED",
            semanticCommitId,
            proposalId,
            expectedUpdatedAt: input.expectedUpdatedAt,
            objectId,
            pageName: plan.pageName,
            relationshipMode: plan.relationshipMode,
            pageExternalId: graphStep.operationId,
            pageContentHash: graphStep.afterHash,
            replayed: true,
          });
          return;
        }
        if (existing.status !== "PENDING") throw serviceError("V2_PROJECT_CREATION_COMMIT_RECOVERY_REQUIRED", "Project 创建事务需要先完成恢复，不能创建平行事务。");
        respond(response, 200, {
          status: "PREPARED",
          semanticCommitId,
          proposalId,
          expectedUpdatedAt: input.expectedUpdatedAt,
          objectId,
          pageName: plan.pageName,
          relationshipMode: plan.relationshipMode,
          ...(plan.relationshipMode === "REUSE_SOURCE_PAGE" ? { pageExternalId: plan.pageTarget.id, pageContentHash: plan.pageTarget.hash } : {}),
          replayed: true,
        });
        return;
      }
      if (stored.updatedAt !== input.expectedUpdatedAt) throw serviceError("V2_PROPOSAL_COMMIT_STALE", "Project 创建 Proposal 已变化；没有准备正式事务。");
      if (store.semanticCommit(projectSemanticCommitId(options.graphId, plan.pageName))) {
        throw serviceError("V2_PROJECT_CREATION_COMMIT_CONFLICT", "同名 Project 已有旧创建事务；没有准备平行 Proposal 事务。");
      }
      const observations = await projectCreationGraphObservations(plan);
      const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, observations), input.expectedUpdatedAt);
      if (revalidation.result.status === "STALE") {
        respond(response, 200, { status: "STALE", ...revalidation });
        return;
      }
      const now = new Date();
      const newObjectId = createId("obj", now);
      store.prepareSemanticCommit({
        semanticCommitId,
        proposalId,
        status: "PENDING",
        beforeStateChecksum: checksum({ proposal: stored.files.proposalJson, expectedUpdatedAt: input.expectedUpdatedAt, plan }),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }, [
        {
          semanticCommitId,
          stepIndex: 0,
          stepKind: "GRAPH_WRITE",
          status: "PREPARED",
          operationId: expectedPageOperationId,
          ...(plan.pageTarget.hash ? { beforeHash: plan.pageTarget.hash } : {}),
          updatedAt: now.toISOString(),
        },
        { semanticCommitId, stepIndex: 1, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: newObjectId, updatedAt: now.toISOString() },
      ]);
      respond(response, 201, {
        status: "PREPARED",
        semanticCommitId,
        proposalId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        objectId: newObjectId,
        pageName: plan.pageName,
        relationshipMode: plan.relationshipMode,
        ...(plan.relationshipMode === "REUSE_SOURCE_PAGE" ? { pageExternalId: plan.pageTarget.id, pageContentHash: plan.pageTarget.hash } : {}),
        replayed: false,
      });
      return;
    }
    const proposalProjectCreationFinalizeMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/project-creation\/commit\/finalize$/) : null;
    if (proposalProjectCreationFinalizeMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalProjectCreationFinalizeMatch[1]);
      const input = await readProposalProjectCreationFinalizeRequest(request);
      if (input.semanticCommitId !== proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt)) {
        throw serviceError("V2_PROJECT_CREATION_COMMIT_INTENT_MISMATCH", "Project 创建收口意图与当前 Graph/Proposal 不一致。");
      }
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Project 创建 Proposal 不存在。");
      const plan = planAcceptedV2ProjectCreation(stored.proposal);
      const commit = store.semanticCommit(input.semanticCommitId);
      const steps = store.semanticCommitSteps(input.semanticCommitId);
      const graphStep = steps[0];
      const graphIdentityMatches = graphStep?.afterHash === undefined
        ? graphStep?.operationId === plan.pageTarget.id
        : graphStep.operationId === input.pageExternalId && graphStep.afterHash === input.pageContentHash;
      if (
        !commit || commit.proposalId !== proposalId || steps.length !== 2
        || graphStep?.stepKind !== "GRAPH_WRITE" || !graphIdentityMatches
        || steps[1]?.stepKind !== "DOMAIN_WRITE" || steps[1]?.operationId !== input.objectId
      ) throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "Project 创建账本与已审阅计划或页面证据不一致。");
      const receiptKey = `project-create-proposal:${input.semanticCommitId}`;
      if (commit.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (receipt?.command !== "create_project_with_page" || receipt.object.objectId !== input.objectId || receipt.anchor.externalId !== input.pageExternalId || receipt.anchor.contentHash !== input.pageContentHash) {
          throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "已完成 Project 创建事务缺少匹配领域回执。");
        }
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: "COMPLETED", semanticCommitId: input.semanticCommitId, object: receipt.object, anchor: receipt.anchor, record, replayed: true });
        return;
      }
      if (stored.updatedAt !== input.expectedUpdatedAt) throw serviceError("V2_PROPOSAL_COMMIT_STALE", "Project 创建 Proposal 已变化；没有收口正式事务。");
      if (commit.status !== "PENDING") throw serviceError("V2_PROJECT_CREATION_COMMIT_RECOVERY_REQUIRED", "Project 创建事务当前需要恢复，不能直接收口。");
      if (
        plan.relationshipMode === "REUSE_SOURCE_PAGE"
        && (input.pageExternalId !== plan.pageTarget.id || input.pageContentHash !== plan.pageTarget.hash)
      ) throw serviceError("V2_PROJECT_CREATION_COMMIT_GRAPH_EVIDENCE_MISMATCH", "复用 Page 的身份或版本证据已脱离已审阅计划。");
      if (
        plan.relationshipMode !== "REUSE_SOURCE_PAGE"
        && input.pageContentHash !== controlledProjectPageContentHash({
          pageName: plan.pageName,
          pageExternalId: input.pageExternalId,
          objectId: input.objectId,
          semanticCommitId: input.semanticCommitId,
        })
      ) throw serviceError("V2_PROJECT_CREATION_COMMIT_GRAPH_EVIDENCE_MISMATCH", "新 Project Page 缺少与本次事务一致的受控所有权证据。");
      const now = new Date();
      const latestGraphStep = store.semanticCommitSteps(input.semanticCommitId)[0];
      if (latestGraphStep?.status === "PREPARED") {
        store.recordPreparedSemanticCommitStepEvidence(input.semanticCommitId, 0, { operationId: input.pageExternalId, afterHash: input.pageContentHash }, now.toISOString());
        store.advanceSemanticCommitStep(input.semanticCommitId, 0, "APPLIED", now.toISOString());
      }
      if (store.semanticCommitSteps(input.semanticCommitId)[0]?.status === "APPLIED") {
        store.advanceSemanticCommitStep(input.semanticCommitId, 0, "VERIFIED", now.toISOString());
      }
      let result;
      try {
        options.faults?.beforeProposalProjectCreationDomainWrite?.();
        result = await application.createProjectWithPage({
          objectId: input.objectId,
          name: plan.title,
          page: { graphId: options.graphId, externalId: input.pageExternalId, contentHash: input.pageContentHash },
          projectStructure: plan.projectStructure,
        }, {
          actor: "proposal_commit",
          expectedVersion: 0,
          idempotencyKey: receiptKey,
          traceId: input.traceId,
        }, now);
      } catch {
        const concurrentReceipt = store.getCommandReceipt(receiptKey);
        if (concurrentReceipt?.command !== "create_project_with_page") {
          store.advanceSemanticCommitStep(input.semanticCommitId, 0, "RECOVERY_REQUIRED", now.toISOString(), "V2_PROJECT_CREATION_DOMAIN_WRITE_FAILED");
          store.finalizeSemanticCommit(input.semanticCommitId, "RECOVERY_REQUIRED", now.toISOString(), undefined, "V2_PROJECT_CREATION_DOMAIN_WRITE_FAILED");
          respond(response, 200, {
            status: "COMPENSATION_REQUIRED",
            semanticCommitId: input.semanticCommitId,
            proposalId,
            expectedUpdatedAt: input.expectedUpdatedAt,
            relationshipMode: plan.relationshipMode,
            pageExternalId: input.pageExternalId,
            pageContentHash: input.pageContentHash,
          });
          return;
        }
        result = await application.createProjectWithPage({
          objectId: input.objectId,
          name: plan.title,
          page: { graphId: options.graphId, externalId: input.pageExternalId, contentHash: input.pageContentHash },
          projectStructure: plan.projectStructure,
        }, {
          actor: "proposal_commit",
          expectedVersion: 0,
          idempotencyKey: receiptKey,
          traceId: input.traceId,
        }, now);
      }
      options.faults?.afterProposalProjectCreationDomainWrite?.();
      const domainStep = store.semanticCommitSteps(input.semanticCommitId)[1];
      if (domainStep?.status === "PREPARED") store.advanceSemanticCommitStep(input.semanticCommitId, 1, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(input.semanticCommitId)[1]?.status === "APPLIED") store.advanceSemanticCommitStep(input.semanticCommitId, 1, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(input.semanticCommitId, "COMPLETED", now.toISOString(), checksum({ object: result.object, anchor: result.anchor }));
      const record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, now);
      respond(response, 201, { status: "COMPLETED", semanticCommitId: input.semanticCommitId, object: result.object, anchor: result.anchor, record, replayed: result.replayed });
      return;
    }
    const proposalProjectCreationCompensateMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/project-creation\/commit\/compensate$/) : null;
    if (proposalProjectCreationCompensateMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalProjectCreationCompensateMatch[1]);
      const input = await readProposalProjectCreationCompensateRequest(request);
      if (input.semanticCommitId !== proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt)) {
        throw serviceError("V2_PROJECT_CREATION_COMMIT_INTENT_MISMATCH", "Project 创建补偿意图与当前 Graph/Proposal 不一致。");
      }
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Project 创建 Proposal 不存在。");
      const plan = planAcceptedV2ProjectCreation(stored.proposal);
      const commit = store.semanticCommit(input.semanticCommitId);
      const steps = store.semanticCommitSteps(input.semanticCommitId);
      const objectId = steps[1]?.operationId;
      const graphStep = steps[0];
      const receipt = store.getCommandReceipt(`project-create-proposal:${input.semanticCommitId}`);
      if (
        commit?.status !== "RECOVERY_REQUIRED" || commit.proposalId !== proposalId || receipt
        || steps.length !== 2 || !objectId || graphStep?.status !== "RECOVERY_REQUIRED"
        || graphStep.operationId !== input.pageExternalId || graphStep.afterHash !== input.pageContentHash
      ) throw serviceError("V2_PROJECT_CREATION_COMPENSATION_EVIDENCE_MISMATCH", "Project 创建补偿账本或领域回执不允许当前补偿。");
      const reuse = plan.relationshipMode === "REUSE_SOURCE_PAGE";
      if (
        (reuse && (!input.pageExists || input.pageExternalId !== plan.pageTarget.id || input.pageContentHash !== plan.pageTarget.hash))
        || (!reuse && (input.pageExists || input.pageContentHash !== controlledProjectPageContentHash({
          pageName: plan.pageName,
          pageExternalId: input.pageExternalId,
          objectId,
          semanticCommitId: input.semanticCommitId,
        })))
      ) throw serviceError("V2_PROJECT_CREATION_COMPENSATION_EVIDENCE_MISMATCH", reuse
        ? "复用来源 Page 必须仍以已审阅身份和版本存在，补偿不会删除它。"
        : "专用 Project Page 尚未按精确所有权证据移除；没有收口补偿。");
      const now = new Date();
      store.advanceSemanticCommitStep(input.semanticCommitId, 0, "COMPENSATED", now.toISOString());
      store.finalizeSemanticCommit(input.semanticCommitId, "FAILED", now.toISOString(), undefined, "V2_PROJECT_CREATION_DOMAIN_WRITE_FAILED");
      const record = await proposalApplication.markFailed(proposalId, input.expectedUpdatedAt, now);
      respond(response, 200, { status: "FAILED_COMPENSATED", semanticCommitId: input.semanticCommitId, proposalId, record, pagePreserved: reuse });
      return;
    }
    const proposalProjectCreationUndoPrepareMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/project-creation\/undo\/prepare$/) : null;
    if (proposalProjectCreationUndoPrepareMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(proposalProjectCreationUndoPrepareMatch[1]);
      const input = await readProposalProjectCreationUndoPrepareRequest(request);
      const original = store.semanticCommit(originalSemanticCommitId);
      if (!original?.proposalId || !["COMPLETED", "UNDONE"].includes(original.status)) throw serviceError("V2_PROJECT_CREATION_UNDO_NOT_AVAILABLE", "只有已完成的 Proposal Project 创建事务可以 Undo。");
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "原 Project 创建事务引用的 Proposal 不存在。");
      const plan = planAcceptedV2ProjectCreation(stored.proposal);
      const sourceReturnTarget = projectCreationSourceReturnTarget(store, plan);
      const sourceReturn = sourceReturnTarget ? { sourceReturnTarget } : {};
      const receipt = store.getCommandReceipt(`project-create-proposal:${originalSemanticCommitId}`);
      const forwardSteps = store.semanticCommitSteps(originalSemanticCommitId);
      if (
        receipt?.command !== "create_project_with_page" || forwardSteps.length !== 2
        || forwardSteps[0]?.operationId !== receipt.anchor.externalId || forwardSteps[0]?.afterHash !== receipt.anchor.contentHash || forwardSteps[1]?.operationId !== receipt.object.objectId
      ) throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "原 Project 创建事务缺少匹配的领域回执。");
      const undoSemanticCommitId = projectCreationUndoSemanticCommitId(originalSemanticCommitId);
      const existing = store.semanticCommit(undoSemanticCommitId);
      const reuse = plan.relationshipMode === "REUSE_SOURCE_PAGE";
      if (original.status === "UNDONE" && existing?.status !== "COMPLETED") throw serviceError("V2_PROJECT_CREATION_UNDO_LEDGER_CORRUPT", "已撤销 Project 创建事务缺少完成的逆向账本。");
      if (existing?.status === "COMPLETED") {
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, pageExternalId: receipt.anchor.externalId, pagePreserved: reuse, ...sourceReturn, replayed: true });
        return;
      }
      if (existing && !["PENDING", "RECOVERY_REQUIRED"].includes(existing.status)) throw serviceError("V2_PROJECT_CREATION_UNDO_NOT_AVAILABLE", "Project 创建 Undo 已终止，不能建立平行逆向事务。");
      if (!reuse && !("confirmedOwnedEmpty" in input)) {
        respond(response, 200, {
          status: "PAGE_PREFLIGHT_REQUIRED",
          originalSemanticCommitId,
          undoSemanticCommitId,
          proposalId: original.proposalId,
          pageName: plan.pageName,
          pageExternalId: receipt.anchor.externalId,
          objectId: receipt.object.objectId,
          pageContentHash: receipt.anchor.contentHash,
          ...sourceReturn,
          replayed: existing !== undefined,
        });
        return;
      }
      if (!reuse && ("confirmedOwnedEmpty" in input) && input.pageExternalId !== receipt.anchor.externalId) {
        throw serviceError("V2_PROJECT_CREATION_UNDO_GRAPH_EVIDENCE_MISMATCH", "Project 创建 Undo 的专用 Page 身份与原事务不一致。");
      }
      const undoReceipt = store.getCommandReceipt(`project-creation-undo:${undoSemanticCommitId}`);
      if (!undoReceipt) {
        const currentObject = store.getObject(receipt.object.objectId);
        const currentAnchor = store.getPrimaryAnchorById(receipt.anchor.anchorId);
        if (checksum(currentObject) !== checksum(receipt.object) || checksum(currentAnchor) !== checksum(receipt.anchor)) throw serviceError("V2_PROJECT_CREATION_UNDO_STATE_CHANGED", "Project 或 Anchor 已有后续变化；Undo 没有写入。");
      }
      const now = new Date();
      const expectedSteps = reuse ? [
        { semanticCommitId: undoSemanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE" as const, status: "PREPARED" as const, operationId: receipt.object.objectId, updatedAt: now.toISOString() },
      ] : [
        { semanticCommitId: undoSemanticCommitId, stepIndex: 0, stepKind: "DOMAIN_WRITE" as const, status: "PREPARED" as const, operationId: receipt.object.objectId, updatedAt: now.toISOString() },
        { semanticCommitId: undoSemanticCommitId, stepIndex: 1, stepKind: "GRAPH_WRITE" as const, status: "PREPARED" as const, operationId: receipt.anchor.externalId, beforeHash: receipt.anchor.contentHash, updatedAt: now.toISOString() },
      ];
      const prepared = store.prepareSemanticCommit({
        semanticCommitId: undoSemanticCommitId,
        proposalId: original.proposalId,
        status: "PENDING",
        beforeStateChecksum: checksum({ object: receipt.object, anchor: receipt.anchor, relationshipMode: plan.relationshipMode }),
        createdAt: existing?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
      }, expectedSteps);
      const currentSteps = store.semanticCommitSteps(undoSemanticCommitId);
      if (currentSteps.length !== expectedSteps.length || currentSteps.some((step, index) => step.operationId !== expectedSteps[index]?.operationId || step.stepKind !== expectedSteps[index]?.stepKind)) {
        throw serviceError("V2_PROJECT_CREATION_UNDO_LEDGER_CORRUPT", "Project 创建 Undo 账本与原事务不一致。");
      }
      if (!undoReceipt) {
        await application.undoMaterialization({ object: receipt.object, anchor: receipt.anchor }, {
          actor: "proposal_undo",
          expectedVersion: receipt.object.version,
          idempotencyKey: `project-creation-undo:${undoSemanticCommitId}`,
          traceId: input.traceId,
        }, now);
      }
      if (currentSteps[0]?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "VERIFIED", now.toISOString());
      if (reuse) {
        store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), checksum({ objectRemoved: receipt.object.objectId, anchorRemoved: receipt.anchor.anchorId, pagePreserved: true }));
        store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
        respond(response, prepared.replayed ? 200 : 201, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, pageExternalId: receipt.anchor.externalId, pagePreserved: true, ...sourceReturn, replayed: prepared.replayed });
        return;
      }
      respond(response, prepared.replayed ? 200 : 201, {
        status: existing?.status === "RECOVERY_REQUIRED" ? "RECOVERY_REQUIRED" : "PAGE_DELETION_REQUIRED",
        originalSemanticCommitId,
        undoSemanticCommitId,
        proposalId: original.proposalId,
        pageName: plan.pageName,
        pageExternalId: receipt.anchor.externalId,
        objectId: receipt.object.objectId,
        pageContentHash: receipt.anchor.contentHash,
        ...sourceReturn,
        replayed: prepared.replayed,
      });
      return;
    }
    const proposalProjectCreationUndoFinalizeMatch = request.method === "POST" ? url.pathname.match(/^\/semantic-commits\/([^/]+)\/project-creation\/undo\/finalize$/) : null;
    if (proposalProjectCreationUndoFinalizeMatch?.[1]) {
      const originalSemanticCommitId = decodeURIComponent(proposalProjectCreationUndoFinalizeMatch[1]);
      const input = await readProposalProjectCreationUndoFinalizeRequest(request);
      const undoSemanticCommitId = projectCreationUndoSemanticCommitId(originalSemanticCommitId);
      if (input.originalSemanticCommitId !== originalSemanticCommitId || input.undoSemanticCommitId !== undoSemanticCommitId) throw serviceError("V2_PROJECT_CREATION_UNDO_INTENT_MISMATCH", "Project 创建 Undo 意图与路径不一致。");
      const original = store.semanticCommit(originalSemanticCommitId);
      const inverse = store.semanticCommit(undoSemanticCommitId);
      const steps = store.semanticCommitSteps(undoSemanticCommitId);
      const receipt = store.getCommandReceipt(`project-create-proposal:${originalSemanticCommitId}`);
      if (!original?.proposalId || !inverse || inverse.proposalId !== original.proposalId || receipt?.command !== "create_project_with_page" || steps.length !== 2) {
        throw serviceError("V2_PROJECT_CREATION_UNDO_LEDGER_CORRUPT", "Project 创建 Undo 账本或原回执不一致。");
      }
      const stored = await proposalApplication.get(original.proposalId);
      if (!stored) throw serviceError("V2_PROJECT_CREATION_COMMIT_LEDGER_CORRUPT", "原 Project 创建事务引用的 Proposal 不存在。");
      const sourceReturnTarget = projectCreationSourceReturnTarget(store, planAcceptedV2ProjectCreation(stored.proposal));
      const sourceReturn = sourceReturnTarget ? { sourceReturnTarget } : {};
      if (inverse.status === "COMPLETED" && original.status === "UNDONE") {
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, pagePreserved: false, ...sourceReturn, replayed: true });
        return;
      }
      if (input.pageExternalId !== receipt.anchor.externalId || input.pageExists || steps[0]?.status !== "VERIFIED" || steps[1]?.operationId !== receipt.anchor.externalId) {
        throw serviceError("V2_PROJECT_CREATION_UNDO_GRAPH_EVIDENCE_MISMATCH", "专用 Project Page 尚未以精确身份安全移除；没有收口 Undo。");
      }
      const now = new Date();
      if (steps[1]?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 1, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[1]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 1, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), checksum({ objectRemoved: receipt.object.objectId, anchorRemoved: receipt.anchor.anchorId, pageRemoved: receipt.anchor.externalId }));
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
      respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, pagePreserved: false, ...sourceReturn, replayed: false });
      return;
    }
    if (request.method === "POST" && url.pathname === "/projects/prepare") {
      const input = await readProjectRequest(request, false);
      const requestedName = normalizedProjectName(input.name);
      const semanticCommitId = projectSemanticCommitId(options.graphId, requestedName);
      const existing = store.semanticCommit(semanticCommitId);
      if (existing && existing.status !== "PENDING" && existing.status !== "COMPLETED") {
        throw serviceError("V2_PROJECT_CREATION_RECOVERY_REQUIRED", "该 Project 创建事务需要先完成恢复，不能创建平行事务。");
      }
      const now = new Date();
      const existingSteps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      const pageName = existingSteps.find((step) => step.stepIndex === 0)?.operationId ?? `Project/${requestedName}`;
      const objectId = existing
        ? existingSteps.find((step) => step.stepIndex === 1)?.operationId
        : createId("obj", now);
      if (!objectId) throw serviceError("V2_PROJECT_CREATION_LEDGER_CORRUPT", "Project 创建事务缺少对象身份。");
      const prepared = store.prepareSemanticCommit({
        semanticCommitId,
        status: "PENDING",
        beforeStateChecksum: checksum({ graphId: options.graphId, pageName, objectId }),
        createdAt: existing?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
      }, [
        { semanticCommitId, stepIndex: 0, stepKind: "GRAPH_WRITE", status: "PREPARED", operationId: pageName, updatedAt: now.toISOString() },
        { semanticCommitId, stepIndex: 1, stepKind: "DOMAIN_WRITE", status: "PREPARED", operationId: objectId, updatedAt: now.toISOString() },
      ]);
      const completedReceipt = existing?.status === "COMPLETED"
        ? store.getCommandReceipt(`project-create:${semanticCommitId}`)
        : undefined;
      if (existing?.status === "COMPLETED" && completedReceipt?.command !== "create_project_with_page") {
        throw serviceError("V2_PROJECT_CREATION_LEDGER_CORRUPT", "已完成 Project 事务缺少命令回执。");
      }
      respond(response, prepared.replayed ? 200 : 201, {
        semanticCommitId,
        objectId,
        pageName,
        status: existing?.status ?? "PENDING",
        replayed: prepared.replayed,
        ...(completedReceipt?.command === "create_project_with_page" ? { pageExternalId: completedReceipt.anchor.externalId } : {}),
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/projects/finalize") {
      const input = await readProjectRequest(request, true);
      const requestedName = normalizedProjectName(input.name);
      const expectedCommitId = projectSemanticCommitId(options.graphId, requestedName);
      const commit = store.semanticCommit(input.semanticCommitId);
      const steps = store.semanticCommitSteps(input.semanticCommitId);
      const pageName = steps[0]?.operationId;
      const canonicalName = pageName?.startsWith("Project/") ? pageName.slice("Project/".length) : undefined;
      if (
        input.semanticCommitId !== expectedCommitId || !commit ||
        !canonicalName || canonicalName.toLocaleLowerCase("zh-CN") !== requestedName.toLocaleLowerCase("zh-CN") || steps[1]?.operationId !== input.objectId
      ) {
        throw serviceError("V2_PROJECT_CREATION_INTENT_MISMATCH", "Project 页面证据与已准备事务不一致；没有写入 SQLite。");
      }
      const idempotencyKey = `project-create:${input.semanticCommitId}`;
      if (commit.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(idempotencyKey);
        if (receipt?.command !== "create_project_with_page") throw serviceError("V2_PROJECT_CREATION_LEDGER_CORRUPT", "已完成 Project 事务缺少命令回执。");
        respond(response, 200, { semanticCommitId: input.semanticCommitId, status: "COMPLETED", object: receipt.object, anchor: receipt.anchor, replayed: true });
        return;
      }
      if (commit.status !== "PENDING") throw serviceError("V2_PROJECT_CREATION_RECOVERY_REQUIRED", "Project 创建事务当前不能继续。");
      const now = new Date();
      const verifyStep = (stepIndex: number): void => {
        let status: V2CommitStepStatus | undefined = store.semanticCommitSteps(input.semanticCommitId).find((step) => step.stepIndex === stepIndex)?.status;
        if (status === "PREPARED") status = store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "APPLIED", now.toISOString()).status;
        if (status === "APPLIED") status = store.advanceSemanticCommitStep(input.semanticCommitId, stepIndex, "VERIFIED", now.toISOString()).status;
        if (status !== "VERIFIED") throw serviceError("V2_PROJECT_CREATION_RECOVERY_REQUIRED", "Project 创建事务 step 状态异常。");
      };
      verifyStep(0);
      const result = await application.createProjectWithPage({
        objectId: input.objectId,
        name: canonicalName,
        page: { graphId: options.graphId, externalId: input.pageExternalId, contentHash: input.pageContentHash },
      }, {
        actor: "logseq-plugin",
        expectedVersion: 0,
        idempotencyKey,
        traceId: input.traceId,
      }, now);
      verifyStep(1);
      store.finalizeSemanticCommit(input.semanticCommitId, "COMPLETED", now.toISOString(), checksum({
        objectId: result.object.objectId,
        pageExternalId: result.anchor.externalId,
        pageContentHash: result.anchor.contentHash,
      }));
      respond(response, 201, { semanticCommitId: input.semanticCommitId, status: "COMPLETED", ...result });
      return;
    }
    if (request.method === "POST" && url.pathname === "/objects/materialize") {
      const input = await readMaterializeRequest(request);
      const idempotencyKey = explicitSyncIdempotencyKey(options.graphId, input);
      const result = await application.materializeExplicitObject({
        objectType: input.objectType,
        text: input.text,
        ...(input.marker ? { marker: input.marker } : {}),
        anchor: {
          graphId: options.graphId,
          externalId: input.externalId,
          contentHash: input.contentHash,
        },
      }, {
        actor: "logseq-plugin",
        expectedVersion: 0,
        idempotencyKey,
        traceId: input.traceId,
      });
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/objects/synchronize") {
      const input = await readMaterializeRequest(request);
      const idempotencyKey = explicitSyncIdempotencyKey(options.graphId, input);
      const receipt = store.getCommandReceipt(idempotencyKey);
      if (receipt?.command === "materialize_explicit_object" || receipt?.command === "synchronize_explicit_object") {
        if (receipt.object.objectType === "MINI_PROJECT" && receipt.object.lifecycle === "OPEN" && input.objectType === "MINI_PROJECT" && input.marker === "DONE") {
          const currentObject = store.getObject(receipt.object.objectId);
          const currentAnchor = store.getPrimaryAnchorByExternal(options.graphId, input.externalId);
          if (!currentObject || !currentAnchor || currentObject.version !== receipt.object.version || currentAnchor.contentHash !== input.contentHash || currentAnchor.status !== "active") {
            const active = await activeMiniProjectClosure(receipt.object.objectId);
            if (!active) throw serviceError("V2_EXPLICIT_SYNC_RECEIPT_STALE", "旧版 MiniProject DONE 回执已被较新正文取代；没有回退 Proposal。");
            respond(response, 200, { operation: "PROPOSAL_CREATED", proposalId: active.proposal.proposalId, object: currentObject ?? receipt.object, anchor: currentAnchor ?? receipt.anchor, replayed: true });
            return;
          }
          const submitted = await submitMiniProjectMarkerClosure(input, currentObject, currentAnchor);
          respond(response, 200, { operation: "PROPOSAL_CREATED", proposalId: submitted.record.proposal.proposalId, object: currentObject, anchor: currentAnchor, replayed: true });
          return;
        }
        respond(response, 200, {
          operation: receipt.command === "materialize_explicit_object" ? "MATERIALIZED" : "SYNCHRONIZED",
          object: receipt.object,
          anchor: receipt.anchor,
          replayed: true,
        });
        return;
      }
      if (receipt) throw serviceError("V2_IDEMPOTENCY_KEY_REUSED", "idempotency key 已被另一个命令使用。");
      const anchor = store.getPrimaryAnchorByExternal(options.graphId, input.externalId);
      if (anchor) {
        const current = store.getObject(anchor.objectId);
        if (!current) throw serviceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 引用的对象不存在；同步已停止。");
        if (current.objectType === "MINI_PROJECT" && current.lifecycle === "OPEN" && input.objectType === "MINI_PROJECT" && input.marker === "DONE") {
          if (anchor.status !== "active") throw serviceError("V2_PRIMARY_ANCHOR_CONFLICT", "MiniProject 关闭请求的 Primary Anchor 当前不是 active；请先完成 Anchor 恢复或重绑。");
          const evidence = current.text === input.text && anchor.status === "active" && anchor.contentHash === input.contentHash
            ? { object: current, anchor, replayed: true }
            : await application.synchronizeExplicitObject({
              objectType: input.objectType, text: input.text, graphId: options.graphId, externalId: input.externalId, contentHash: input.contentHash, expectedObjectId: current.objectId,
            }, { actor: "logseq-plugin", expectedVersion: current.version, idempotencyKey: idempotencyKey, traceId: input.traceId });
          const submitted = await submitMiniProjectMarkerClosure(input, evidence.object, evidence.anchor);
          respond(response, submitted.replayed ? 200 : 202, { operation: "PROPOSAL_CREATED", proposalId: submitted.record.proposal.proposalId, object: evidence.object, anchor: evidence.anchor, replayed: submitted.replayed });
          return;
        }
        const result = await application.synchronizeExplicitObject({
          objectType: input.objectType,
          text: input.text,
          ...(input.marker ? { marker: input.marker } : {}),
          graphId: options.graphId,
          externalId: input.externalId,
          contentHash: input.contentHash,
        }, {
          actor: "logseq-plugin",
          expectedVersion: current.version,
          idempotencyKey,
          traceId: input.traceId,
        });
        respond(response, 200, { operation: "SYNCHRONIZED", ...result });
        return;
      }
      if (store.activeCandidateForSourceAnchor(input.externalId)) {
        throw serviceError("V2_EXPLICIT_CANDIDATE_REVIEW_REQUIRED", "该 Block 已有未完成的 Candidate；请继续 Candidate、Proposal、Review 与 Commit 闭环。");
      }
      if (input.objectType === "MINI_PROJECT" && input.marker === "DONE") {
        const materialized = await application.materializeExplicitObject({
          objectType: input.objectType,
          text: input.text,
          anchor: { graphId: options.graphId, externalId: input.externalId, contentHash: input.contentHash },
        }, {
          actor: "logseq-plugin",
          expectedVersion: 0,
          idempotencyKey,
          traceId: input.traceId,
        });
        const submitted = await submitMiniProjectMarkerClosure(input, materialized.object, materialized.anchor);
        respond(response, 202, { operation: "PROPOSAL_CREATED", proposalId: submitted.record.proposal.proposalId, object: materialized.object, anchor: materialized.anchor, replayed: submitted.replayed });
        return;
      }
      const result = await application.materializeExplicitObject({
        objectType: input.objectType,
        text: input.text,
        ...(input.marker ? { marker: input.marker } : {}),
        anchor: { graphId: options.graphId, externalId: input.externalId, contentHash: input.contentHash },
      }, {
        actor: "logseq-plugin",
        expectedVersion: 0,
        idempotencyKey,
        traceId: input.traceId,
      });
      respond(response, 201, { operation: "MATERIALIZED", ...result });
      return;
    }
    if (request.method === "POST" && url.pathname === "/anchors/primary/observe") {
      const input = await readPrimaryAnchorObservationRequest(request);
      const anchor = store.getPrimaryAnchorById(input.anchorId);
      if (!anchor || anchor.graphId !== options.graphId || anchor.status === "replaced") {
        throw serviceError("V2_PRIMARY_ANCHOR_NOT_FOUND", "Primary Anchor 不存在于当前 Graph 或已被替换。");
      }
      const current = store.getObject(anchor.objectId);
      if (!current) throw serviceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 引用的对象不存在；观察已停止。");
      const result = await application.observePrimaryAnchor({ anchorId: anchor.anchorId, status: input.status }, {
        actor: "logseq-plugin",
        expectedVersion: current.version,
        idempotencyKey: primaryAnchorObservationIdempotencyKey(options.graphId, input, current.version),
        traceId: input.traceId,
      });
      respond(response, 200, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/anchors/primary/rebind") {
      const input = await readPrimaryAnchorRebindRequest(request);
      const idempotencyKey = primaryAnchorRebindIdempotencyKey(options.graphId, input);
      const receipt = store.getCommandReceipt(idempotencyKey);
      if (receipt?.command === "rebind_primary_anchor") {
        respond(response, 200, { object: receipt.object, previousAnchor: receipt.previousAnchor, anchor: receipt.anchor, replayed: true });
        return;
      }
      if (receipt) throw serviceError("V2_IDEMPOTENCY_KEY_REUSED", "idempotency key 已被另一个命令使用。");
      const previousAnchor = store.getPrimaryAnchorById(input.previousAnchorId);
      if (!previousAnchor || previousAnchor.graphId !== options.graphId || previousAnchor.status === "replaced") {
        throw serviceError("V2_PRIMARY_ANCHOR_NOT_FOUND", "Primary Anchor 不存在于当前 Graph 或已被替换。");
      }
      const current = store.getObject(previousAnchor.objectId);
      if (!current) throw serviceError("V2_PRIMARY_ANCHOR_CONFLICT", "Primary Anchor 引用的对象不存在；重新绑定已停止。");
      if (
        current.version !== input.previewObjectVersion ||
        previousAnchor.status !== input.previewAnchorStatus ||
        previousAnchor.contentHash !== input.previewAnchorContentHash
      ) {
        throw serviceError("V2_REBIND_PREVIEW_STALE", "对象或 Primary Anchor 已在预览后变化；重新绑定没有写入。");
      }
      const result = await application.rebindPrimaryAnchor({
        previousAnchorId: previousAnchor.anchorId,
        expectedAnchorStatus: input.previewAnchorStatus,
        expectedAnchorContentHash: input.previewAnchorContentHash,
        objectType: input.objectType,
        text: input.text,
        graphId: options.graphId,
        externalId: input.externalId,
        contentHash: input.contentHash,
        confirmation: input.confirmation,
      }, {
        actor: "logseq-plugin",
        expectedVersion: input.previewObjectVersion,
        idempotencyKey,
        traceId: input.traceId,
      });
      respond(response, 200, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/backup/create") {
      await requireNoBody(request);
      const createdAt = new Date();
      const backupId = createId("backup", createdAt);
      const destination = join(backupRoot, `${backupId}.db`);
      await store.backup(destination);
      const validation = V2SqliteStore.validateBackup(destination, options.graphId);
      if (validation.status !== "PASS") throw serviceError("V2_BACKUP_VALIDATION_FAILED", "Backup 创建后未通过完整性校验。");
      respond(response, 201, { backupId, createdAt: createdAt.toISOString(), validation });
      return;
    }
    if (request.method === "GET" && url.pathname === "/backups") {
      const names = (await readdir(backupRoot))
        .filter((name) => name.endsWith(".db") && backupIdPattern.test(name.slice(0, -3)))
        .sort()
        .reverse();
      const backups: ServiceBackupCatalog["backups"] = names.slice(0, BACKUP_CATALOG_LIMIT).map((name) => {
        const backupId = name.slice(0, -3);
        try {
          const validation = V2SqliteStore.validateBackup(join(backupRoot, name), options.graphId);
          if (validation.status !== "PASS") return { backupId, createdAt: backupCreatedAt(backupId), status: "INVALID" as const };
          return {
            backupId,
            createdAt: backupCreatedAt(backupId),
            status: "VALID" as const,
            schemaVersion: validation.schemaVersion,
            objectCount: validation.objectCount,
          };
        } catch {
          return { backupId, createdAt: backupCreatedAt(backupId), status: "INVALID" as const };
        }
      });
      respond(response, 200, { backups, total: names.length, limited: names.length > BACKUP_CATALOG_LIMIT });
      return;
    }
    if (request.method === "POST" && url.pathname === "/backup/restore/validate") {
      const backupId = await readBackupId(request);
      const validation = V2SqliteStore.validateBackup(join(backupRoot, `${backupId}.db`), options.graphId);
      if (validation.status !== "PASS") throw serviceError("V2_BACKUP_VALIDATION_FAILED", "Backup 未通过完整性校验。");
      respond(response, 200, { backupId, validation });
      return;
    }
    if (request.method === "POST" && url.pathname === "/backup/restore/apply") {
      const { backupId } = await readRestoreRequest(request);
      const source = join(backupRoot, `${backupId}.db`);
      const validation = V2SqliteStore.validateBackup(source, options.graphId);
      if (validation.status !== "PASS") throw serviceError("V2_BACKUP_VALIDATION_FAILED", "Backup 未通过完整性校验。");
      options.faults?.beforeRestoreDrain?.();
      await waitForActiveRequests();
      stopping = true;
      const createdAt = new Date();
      const recoveryBackupId = createId("backup", createdAt);
      const recoveryPath = join(backupRoot, `${recoveryBackupId}.db`);
      const armedInterlock: RestoreRecoveryInterlock = {
        schemaVersion: 1,
        status: "ARMED",
        graphId: options.graphId,
        recoveryBackupId,
        createdAt: createdAt.toISOString(),
      };
      let restoreInterlock = armedInterlock;
      try {
        await armRestoreRecoveryInterlock(options.databasePath, armedInterlock);
      } catch {
        let interlockAbsentOrCleared = false;
        try {
          const current = await readRestoreRecoveryInterlock(options.databasePath);
          if (!current) {
            interlockAbsentOrCleared = true;
          } else if (stableJson(current) === stableJson(armedInterlock)) {
            await clearRestoreRecoveryInterlock(options.databasePath, armedInterlock);
            interlockAbsentOrCleared = true;
          }
        } catch {
          // Fall through to the fail-closed shutdown below.
        }
        if (interlockAbsentOrCleared) {
          stopping = false;
          throw serviceError("V2_RESTORE_INTERLOCK_FAILED", "Restore 安全锁无法建立；没有开始切换正式状态。");
        }
        store.close();
        storeOpen = false;
        try {
          if (options.descriptorPath) await removeServiceDescriptor(options.descriptorPath);
        } finally {
          graphReadBroker.close();
          server.close();
        }
        throw serviceError("V2_RESTORE_INTERLOCK_CLEAR_FAILED", "Restore 没有开始切换，但安全锁状态无法确认；正式写入保持暂停，必须人工核验。");
      }
      try {
        store.close();
        storeOpen = false;
        options.faults?.beforeRestoreOffline?.();
        const restored = await V2SqliteStore.restoreOffline(
          options.databasePath,
          source,
          recoveryPath,
          options.graphId,
          {
            afterRecoveryPoint: async () => {
              const recoveryRequired: RestoreRecoveryInterlock = {
                ...armedInterlock,
                status: "RECOVERY_REQUIRED",
              };
              await replaceRestoreRecoveryInterlock(options.databasePath, armedInterlock, recoveryRequired);
              restoreInterlock = recoveryRequired;
            },
            ...(options.faults?.afterRestoreActivate ? { afterActivate: options.faults.afterRestoreActivate } : {}),
            ...(options.faults?.beforeRestoreRollback ? { beforeRollback: options.faults.beforeRestoreRollback } : {}),
          },
        );
        try {
          await clearRestoreRecoveryInterlock(options.databasePath, restoreInterlock);
        } catch {
          throw serviceError("V2_RESTORE_INTERLOCK_CLEAR_FAILED", "Restore 已完成，但安全锁无法清除；正式写入保持暂停，必须人工核验。");
        }
        respond(response, 200, {
          status: "RESTORED_SERVICE_STOPPING",
          backupId,
          recoveryBackupId,
          validation: restored.validation,
        });
      } catch (error) {
        const rollbackFailed = error instanceof StructuredError && error.code === "V2_RESTORE_ROLLBACK_FAILED";
        if (!rollbackFailed) {
          try {
            await clearRestoreRecoveryInterlock(options.databasePath, restoreInterlock);
          } catch {
            throw serviceError("V2_RESTORE_INTERLOCK_CLEAR_FAILED", "Restore 结果可恢复，但安全锁无法清除；正式写入保持暂停，必须人工核验。");
          }
        }
        throw error;
      } finally {
        try {
          if (options.descriptorPath) await removeServiceDescriptor(options.descriptorPath);
        } finally {
          graphReadBroker.close();
          server.close();
        }
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/areas") {
      const input = await readAreaRequest(request, false);
      const text = input.text.trim();
      const digest = createHash("sha256").update(JSON.stringify([options.graphId, text, input.traceId])).digest("hex");
      const idempotencyKey = `area-create:${digest}`;
      const receipt = store.getCommandReceipt(idempotencyKey);
      if (receipt && receipt.command !== "create_object") throw serviceError("V2_IDEMPOTENCY_KEY_REUSED", "Area 创建命令的 idempotency key 已被其他命令使用。");
      await options.faults?.beforeAreaDomainWrite?.();
      const object = await application.createObject({ objectType: "AREA", text, sourceOrCreationEvent: "controlled_area_entry" }, {
        actor: "logseq-plugin", expectedVersion: 0, idempotencyKey, traceId: input.traceId,
      });
      respond(response, receipt ? 200 : 201, { object, replayed: receipt !== undefined });
      return;
    }
    const areaEditMatch = request.method === "POST" ? url.pathname.match(/^\/areas\/([^/]+)\/edit$/) : null;
    if (areaEditMatch?.[1]) {
      const objectId = decodeURIComponent(areaEditMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("AREA_REQUEST_INVALID", "Area 对象 ID 无效。");
      const input = await readAreaRequest(request, true);
      const text = input.text.trim();
      const digest = createHash("sha256").update(JSON.stringify([options.graphId, objectId, input.expectedVersion, text, input.traceId])).digest("hex");
      const idempotencyKey = `area-edit:${digest}`;
      const receipt = store.getCommandReceipt(idempotencyKey);
      if (receipt && receipt.command !== "edit_area") throw serviceError("V2_IDEMPOTENCY_KEY_REUSED", "Area 编辑命令的 idempotency key 已被其他命令使用。");
      const object = await application.editArea(objectId, text, {
        actor: "logseq-plugin", expectedVersion: input.expectedVersion, idempotencyKey, traceId: input.traceId,
      });
      respond(response, 200, { object, replayed: receipt !== undefined });
      return;
    }
    if (request.method === "GET" && url.pathname === "/objects") {
      respond(response, 200, { objects: store.listObjects() });
      return;
    }
    const projectClosureEvidenceMatch = request.method === "POST" ? url.pathname.match(/^\/objects\/([^/]+)\/project-closure\/evidence$/) : null;
    if (projectClosureEvidenceMatch?.[1]) {
      const objectId = decodeURIComponent(projectClosureEvidenceMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("PROJECT_CLOSURE_EVIDENCE_REQUEST_INVALID", "Project Closure evidence 对象 ID 无效。");
      const input = await readProjectClosureEvidenceRequest(request);
      const project = store.getObject(objectId);
      if (!project) throw serviceError("V2_OBJECT_NOT_FOUND", "Project 不存在。");
      const evidence = buildProjectClosureEvidenceDraft({
        project,
        expectedVersion: input.expectedVersion,
        objects: store.listObjects(),
        ownerships: store.listPrimaryOwnerships(),
      });
      respond(response, 200, evidence);
      return;
    }
    const projectClosureProviderMatch = request.method === "POST" ? url.pathname.match(/^\/objects\/([^/]+)\/project-closure\/proposal$/) : null;
    if (projectClosureProviderMatch?.[1]) {
      if (!options.proposalGenerator) throw serviceError("LLM_PROVIDER_DISABLED", "Local Service 未配置 Proposal Provider；没有创建 Closure Proposal。");
      const objectId = decodeURIComponent(projectClosureProviderMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("PROJECT_CLOSURE_EVIDENCE_REQUEST_INVALID", "Project Closure 对象 ID 无效。");
      const input = await readProjectClosureProposalRequest(request);
      const project = store.getObject(objectId);
      if (!project) throw serviceError("V2_OBJECT_NOT_FOUND", "Project 不存在。");
      const evidence = buildProjectClosureEvidenceDraft({
        project,
        expectedVersion: input.expectedVersion,
        objects: store.listObjects(),
        ownerships: store.listPrimaryOwnerships(),
      });
      const userJudgments = input.userJudgments
        ? validateProjectClosureUserJudgments(input.userJudgments, evidence)
        : undefined;
      const [coreSkill, designProjectSkill] = await Promise.all([
        readTaskCopilotSkill("task-copilot-core"),
        readTaskCopilotSkill("design-project"),
      ]);
      if (!coreSkill || !designProjectSkill) throw serviceError("PROJECT_CLOSURE_PROVIDER_SKILL_UNAVAILABLE", "Project Closure 内置 Skill 不可用；没有调用 Provider。");
      const prompt = buildProjectClosureProposalPrompt({ evidence, coreSkill, designProjectSkill, ...(userJudgments ? { userJudgments } : {}) });
      const controller = new AbortController();
      const abort = (): void => controller.abort("client-disconnected");
      request.once("aborted", abort);
      try {
        const createdAt = new Date().toISOString();
        const generated = await options.proposalGenerator.generate({
          proposalId: createId("prop"),
          createdAt,
          prompt,
          signal: controller.signal,
        });
        const latest = store.getObject(objectId);
        if (!latest || latest.version !== input.expectedVersion) {
          throw serviceError("V2_OBJECT_VERSION_CONFLICT", "Project 在 Closure 草拟期间已变化；草稿已丢弃。");
        }
        const latestEvidence = buildProjectClosureEvidenceDraft({
          project: latest,
          expectedVersion: input.expectedVersion,
          objects: store.listObjects(),
          ownerships: store.listPrimaryOwnerships(),
        });
        if (latestEvidence.evidenceScopeHash !== evidence.evidenceScopeHash) {
          throw serviceError("V2_OBJECT_VERSION_CONFLICT", "Project Closure 证据范围在草拟期间已变化；草稿已丢弃。");
        }
        if (generated.kind === "NO_PROPOSAL") {
          respond(response, 200, {
            kind: generated.kind,
            reason: generated.reason,
            provider: generated.provider,
            promptBundleVersion: generated.promptBundleVersion,
            replayed: false,
          });
          return;
        }
        validateGeneratedProjectClosureProposal(generated.proposal, evidence, userJudgments);
        const submitted = await submitReviewProposal(generated.proposal, new Date(createdAt));
        respond(response, submitted.replayed ? 200 : 201, {
          kind: "PROPOSAL",
          record: submitted.record,
          replayed: submitted.replayed,
          provider: generated.provider,
          promptBundleVersion: generated.promptBundleVersion,
          evidenceScopeHash: evidence.evidenceScopeHash,
        });
      } finally {
        request.removeListener("aborted", abort);
      }
      return;
    }
    const miniProjectClosureProposalMatch = request.method === "POST" ? url.pathname.match(/^\/objects\/([^/]+)\/closure\/proposal$/) : null;
    if (miniProjectClosureProposalMatch?.[1]) {
      const objectId = decodeURIComponent(miniProjectClosureProposalMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("MINI_PROJECT_CLOSURE_PROPOSAL_REQUEST_INVALID", "MiniProject Closure 对象 ID 无效。");
      const input = await readMiniProjectClosureProposalRequest(request);
      const object = store.getObject(objectId);
      if (!object) throw serviceError("V2_OBJECT_NOT_FOUND", "MiniProject 不存在。");
      if (object.version !== input.expectedVersion) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "MiniProject 已变化；请刷新后重新发起 Closure Proposal。");
      const result = await submitMiniProjectObjectClosure(object);
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    const lifecycleProposalMatch = request.method === "POST" ? url.pathname.match(/^\/objects\/([^/]+)\/lifecycle\/proposal$/) : null;
    if (lifecycleProposalMatch?.[1]) {
      const objectId = decodeURIComponent(lifecycleProposalMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("LIFECYCLE_PROPOSAL_REQUEST_INVALID", "Lifecycle Proposal 对象 ID 无效。");
      const input = await readReasonedLifecycleProposalRequest(request);
      const object = store.getObject(objectId);
      if (!object) throw serviceError("V2_OBJECT_NOT_FOUND", "对象不存在。");
      if (object.version !== input.expectedVersion) throw serviceError("V2_OBJECT_VERSION_CONFLICT", "对象已变化；请刷新后重新发起 Lifecycle Proposal。");
      const result = await submitReasonedLifecycle(object, input);
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    const conditionMatch = request.method === "PATCH" ? url.pathname.match(/^\/objects\/([^/]+)\/condition$/) : null;
    if (conditionMatch?.[1]) {
      const objectId = decodeURIComponent(conditionMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("CONDITION_REQUEST_INVALID", "Condition 对象 ID 无效。");
      const input = await readConditionRequest(request);
      const digest = createHash("sha256").update(JSON.stringify([options.graphId, objectId, input.expectedVersion, checksum(input.condition)])).digest("hex");
      const object = await application.changeCondition(objectId, input.condition, { actor: "user", expectedVersion: input.expectedVersion, idempotencyKey: `condition:${digest}`, traceId: `condition:${digest.slice(0, 16)}` });
      respond(response, 200, { object });
      return;
    }
    const conditionUndoMatch = (request.method === "GET" || request.method === "POST")
      ? url.pathname.match(/^\/objects\/([^/]+)\/condition\/undo$/)
      : null;
    if (conditionUndoMatch?.[1]) {
      const objectId = decodeURIComponent(conditionUndoMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("CONDITION_UNDO_REQUEST_INVALID", "Condition Undo 对象 ID 无效。");
      if (request.method === "GET") {
        await requireNoBody(request);
        const resolved = resolveConditionChange(objectId);
        if (resolved.undoReceipt) throw serviceError("V2_CONDITION_UNDO_ALREADY_APPLIED", "最近一次状态变化已经撤销；没有重复写入。");
        const current = store.getObject(objectId);
        if (
          !current
          || current.version !== resolved.receipt.object.version
          || stableJson(current.condition) !== stableJson(resolved.receipt.object.condition)
        ) {
          throw serviceError("V2_CONDITION_UNDO_STALE", "对象已在该状态变化后继续改变；为避免覆盖较新状态，不能撤销。");
        }
        respond(response, 200, {
          status: "PREPARED",
          conditionChangeId: resolved.conditionChangeId,
          objectId,
          objectText: current.text,
          expectedVersion: current.version,
          beforeCondition: resolved.receipt.beforeCondition,
          afterCondition: current.condition,
          changedAt: resolved.receipt.createdAt,
        });
        return;
      }
      const input = await readConditionUndoRequest(request);
      const result = await serializeByKey(`condition-undo:${objectId}`, async () => {
        const resolved = resolveConditionChange(objectId, input.conditionChangeId);
        if (resolved.undoReceipt?.command === "change_condition") {
          return {
            status: "COMPLETED" as const,
            conditionChangeId: resolved.conditionChangeId,
            object: resolved.undoReceipt.object,
            replayed: true,
          };
        }
        if (resolved.undoReceipt) throw serviceError("V2_IDEMPOTENCY_KEY_CONFLICT", "Condition Undo 回执类型冲突；没有重复写入。");
        const current = store.getObject(objectId);
        if (
          !current
          || current.version !== input.expectedVersion
          || current.version !== resolved.receipt.object.version
          || stableJson(current.condition) !== stableJson(resolved.receipt.object.condition)
        ) {
          throw serviceError("V2_CONDITION_UNDO_STALE", "对象或状态已在确认前变化；为避免覆盖较新状态，没有撤销。");
        }
        const object = await application.changeCondition(objectId, resolved.receipt.beforeCondition, {
          actor: "user",
          expectedVersion: current.version,
          idempotencyKey: resolved.undoIdempotencyKey,
          traceId: input.traceId,
        });
        return {
          status: "COMPLETED" as const,
          conditionChangeId: resolved.conditionChangeId,
          object,
          replayed: false,
        };
      });
      respond(response, 200, result);
      return;
    }
    const deadlineMatch = request.method === "PATCH" ? url.pathname.match(/^\/objects\/([^/]+)\/deadline$/) : null;
    if (deadlineMatch?.[1]) {
      const objectId = decodeURIComponent(deadlineMatch[1]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(objectId)) throw serviceError("DEADLINE_REQUEST_INVALID", "期限对象 ID 无效。");
      const input = await readDeadlineRequest(request);
      const digest = createHash("sha256").update(JSON.stringify([options.graphId, objectId, input.expectedVersion, input.dueAt ?? null])).digest("hex");
      const object = await application.changeDueAt(objectId, input.dueAt, { actor: "user", expectedVersion: input.expectedVersion, idempotencyKey: `deadline:${digest}`, traceId: `deadline:${digest.slice(0, 16)}` });
      respond(response, 200, { object });
      return;
    }
    if (request.method === "GET" && url.pathname === "/anchors/primary") {
      const after = url.searchParams.get("after") ?? undefined;
      const includeReplacedValue = url.searchParams.get("includeReplaced");
      if (after !== undefined && (!after.trim() || after.length > 512)) {
        throw serviceError("PRIMARY_ANCHOR_CURSOR_INVALID", "Primary Anchor 分页游标无效。");
      }
      if (includeReplacedValue !== null && includeReplacedValue !== "1") {
        throw serviceError("PRIMARY_ANCHOR_QUERY_INVALID", "Primary Anchor 查询参数无效。");
      }
      const page = store.listPrimaryAnchors(options.graphId, after, 257, includeReplacedValue === "1");
      const anchors = page.slice(0, 256);
      respond(response, 200, {
        anchors,
        ...(page.length > anchors.length ? { nextCursor: anchors.at(-1)?.externalId } : {}),
      });
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/objects/")) {
      const objectId = decodeURIComponent(url.pathname.slice("/objects/".length));
      const object = store.getObject(objectId);
      respond(response, object ? 200 : 404, object ? { object } : { error: { code: "OBJECT_NOT_FOUND" } });
      return;
    }
    respond(response, 404, { error: { code: "ROUTE_NOT_FOUND" } });
    } finally {
      if (admitted) leaveActiveRequest();
      if (restoreRequest && !stopping) restoreClaimed = false;
    }
  };

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => respondError(response, error));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
  } catch (error) {
    graphReadBroker.close();
    store.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
    graphReadBroker.close();
    server.close();
    store.close();
    throw new Error("Local Service must bind only to 127.0.0.1");
  }

  if (options.descriptorPath) {
    const descriptor: ServiceDescriptor = {
      protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
      url: `http://127.0.0.1:${address.port}/`,
      token,
      pid: process.pid,
      createdAt: new Date().toISOString(),
    };
    try {
      await writeServiceDescriptor(options.descriptorPath, descriptor);
    } catch (error) {
      graphReadBroker.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (storeOpen) store.close();
      throw error;
    }
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    token,
    capabilities,
    close: async () => {
      grillPreviewSessions.clear();
      projectCreationPreviewSessions.clear();
      graphReadBroker.close();
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      if (storeOpen) {
        store.close();
        storeOpen = false;
      }
      if (options.descriptorPath) await removeServiceDescriptor(options.descriptorPath);
    },
  };
}
