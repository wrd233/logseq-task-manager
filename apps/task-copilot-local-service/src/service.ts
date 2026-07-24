import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";

import { V2Application, V2CandidateApplication, V2MigrationApplication, V2ProposalApplication, planAcceptedV2LifecycleTransition, planAcceptedV2ProposalCommit, planAcceptedV2OwnershipChange, planAcceptedV2ProjectClosure, planAcceptedV2ProjectStructure, projectV2NowWork, type MaterializeExplicitObjectInput, type V2ReentryCommitFact } from "@task-copilot/application";
import { renderV2ProposalFiles, requiredV2ProposalRevalidationScope, validateV2MiniProjectClosure, validateV2ProposalForSubmission, type LegacyMigrationReviewDecision, type V2Anchor, type V2CandidateDisposition, type V2CandidateKind, type V2Condition, type V2ManagedObject, type V2MiniProjectClosure, type V2Proposal, type V2ProposalGroupDecision, type V2ProposalScopeObservation } from "@task-copilot/domain";
import { parseExplicitObjectSyntax } from "@task-copilot/logseq-adapter";
import { V2_DATABASE_SCHEMA_VERSION, V2SqliteStore, type V2CommitStepStatus } from "@task-copilot/persistence/node";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type ServiceCapabilities,
  type ServiceDescriptor,
  type ServiceDoctor,
  type ServiceDoctorCheck,
  type ServiceGraphReadResult,
} from "@task-copilot/service-client";
import { removeServiceDescriptor, writeServiceDescriptor } from "@task-copilot/service-client/node";
import { StructuredError, checksum, createId, stableJson } from "@task-copilot/shared";

import type { LocalLlmProposalGenerator, V2PromptBundle } from "./llm-proposal.ts";
import type { LocalLlmUxOutputGenerator } from "./llm-ux-output.ts";
import { listTaskCopilotSkills, readTaskCopilotSkill } from "./skill-catalog.ts";
import { buildContextPackage, contextPackageFingerprint, type ContextExportScope } from "./context-package.ts";
import { buildProjectContextRecoveryGeneration } from "./project-context-recovery.ts";
import { GraphReadBroker } from "./graph-read-broker.ts";
import { parseGraphReadQuery, parseGraphReadResult } from "./graph-read-contract.ts";
import { readLegacyRecoveryBundle, scanLegacyRecoveryBundle } from "./migration-scan.ts";

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
  /** Test-only fault boundary; production callers must omit it. */
  faults?: { afterProjectClosureDomainWrite?: () => void; afterOwnershipPrepare?: () => void; afterOwnershipDomainWrite?: () => void; afterOwnershipCommitFailedBeforeProposalTerminal?: () => void; beforeOwnershipUndoDomainWrite?: () => void; afterOwnershipUndoDomainWrite?: () => void; afterLifecyclePrepare?: () => void; afterLifecycleDomainWrite?: () => void; afterLifecycleUndoPrepare?: () => void; afterLifecycleUndoDomainWrite?: () => void; afterLifecycleProposalStale?: () => void; afterLifecycleCommitFailed?: () => void };
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

function serviceError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-192", "D-204"] });
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

async function readReasonedLifecycleProposalRequest(request: IncomingMessage): Promise<{ expectedVersion: number; action: "CANCEL" | "REOPEN"; reason: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (Object.keys(record).sort().join(",") !== "action,expectedVersion,reason" || !Number.isSafeInteger(record.expectedVersion) || Number(record.expectedVersion) < 1 || (record.action !== "CANCEL" && record.action !== "REOPEN") || !reason || reason.length > 4_000) throw serviceError("LIFECYCLE_PROPOSAL_REQUEST_INVALID", "Lifecycle Proposal 必须包含对象版本、取消或重开动作和有界原因。");
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

async function readLifecycleCommitRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; confirmation: "COMPLETE_MINI_PROJECT" | "CANCEL_OBJECT" | "REOPEN_OBJECT"; observations: V2ProposalScopeObservation[]; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,observations,traceId" || !["COMPLETE_MINI_PROJECT", "CANCEL_OBJECT", "REOPEN_OBJECT"].includes(String(record.confirmation)) || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("LIFECYCLE_COMMIT_REQUEST_INVALID", "Lifecycle Commit 必须有当前 Proposal 版本、trace_id 和精确动作确认。");
  return { expectedUpdatedAt: record.expectedUpdatedAt, confirmation: record.confirmation as "COMPLETE_MINI_PROJECT" | "CANCEL_OBJECT" | "REOPEN_OBJECT", observations: parseProposalGraphObservations(record.observations, "LIFECYCLE_COMMIT_REQUEST_INVALID", "Lifecycle 重验证据无效。"), traceId: record.traceId };
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

function projectSemanticCommitId(graphId: string, name: string): string {
  return `project-create:${createHash("sha256").update(JSON.stringify([graphId, normalizedProjectName(name).toLocaleLowerCase("zh-CN")])).digest("hex")}`;
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
    const proposalConflictCodes = ["V2_PROPOSAL_REVIEW_STALE", "V2_PROPOSAL_REVALIDATION_STALE", "V2_PROPOSAL_COMMIT_STALE", "V2_PROPOSAL_NOT_ACCEPTED", "V2_PROPOSAL_ID_CONFLICT", "V2_PROPOSAL_COMMIT_IN_PROGRESS", "V2_PROPOSAL_COMMIT_RECOVERY_REQUIRED", "V2_PROPOSAL_COMMIT_INTENT_MISMATCH", "V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "V2_PROPOSAL_COMMIT_GRAPH_EVIDENCE_MISMATCH", "V2_PROPOSAL_COMPENSATION_EVIDENCE_MISMATCH", "V2_PROJECT_CLOSURE_COMMIT_RECOVERY_REQUIRED", "V2_PROJECT_CLOSURE_COMMIT_LEDGER_CORRUPT", "V2_LIFECYCLE_ACTION_NOT_AVAILABLE", "V2_LIFECYCLE_PROPOSAL_AMBIGUOUS", "V2_LIFECYCLE_COMMIT_RECOVERY_REQUIRED", "V2_LIFECYCLE_COMMIT_LEDGER_CORRUPT", "V2_LIFECYCLE_COMMIT_TARGET_STALE", "V2_LIFECYCLE_COMMIT_OTHER_GROUPS_UNRESOLVED", "V2_LIFECYCLE_UNDO_NOT_AVAILABLE", "V2_LIFECYCLE_UNDO_LEDGER_CORRUPT", "V2_LIFECYCLE_UNDO_STATE_CHANGED", "V2_OWNERSHIP_COMMIT_RECOVERY_REQUIRED", "V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "V2_OWNERSHIP_UNDO_NOT_AVAILABLE", "V2_OWNERSHIP_UNDO_LEDGER_CORRUPT", "V2_PRIMARY_OWNER_STALE", "V2_PRIMARY_OWNER_UNDO_STALE", "V2_PRIMARY_OWNER_UNCHANGED", "V2_PRIMARY_OWNERSHIP_NOT_ALLOWED"];
    const proposalInputError = error.code.startsWith("V2_PROPOSAL_") && error.code !== "V2_PROPOSAL_NOT_FOUND" && !proposalConflictCodes.includes(error.code);
    const domainInputError = ["AREA_REQUEST_INVALID", "V2_AREA_ONLY", "V2_AREA_TEXT_REQUIRED", "V2_ASSOCIATION_REQUEST_INVALID", "V2_ASSOCIATION_SELF_REFERENCE", "V2_CANDIDATE_DISCOVERY_REQUEST_INVALID", "V2_CANDIDATE_DISPOSITION_REQUEST_INVALID", "V2_CANDIDATE_FORMALIZATION_REQUEST_INVALID", "V2_CANDIDATE_UPDATE_REQUEST_INVALID", "V2_CANDIDATE_UPDATE_TARGET_INVALID", "V2_CANDIDATE_UPDATE_TARGET_UNSUPPORTED", "V2_CANDIDATE_COMMAND_INVALID", "V2_CANDIDATE_KIND_INVALID", "V2_CANDIDATE_SOURCE_INVALID", "V2_CANDIDATE_REASON_REQUIRED", "V2_CANDIDATE_SUGGESTION_REQUIRED", "V2_CANDIDATE_DEFERRAL_INVALID", "V2_CANDIDATE_DISPOSITION_REASON_REQUIRED", "MINI_PROJECT_CLOSURE_PROPOSAL_REQUEST_INVALID", "MINI_PROJECT_CLOSURE_DRAFT_REQUEST_INVALID", "OWNERSHIP_COMMIT_REQUEST_INVALID", "OWNERSHIP_UNDO_REQUEST_INVALID", "LIFECYCLE_PROPOSAL_REQUEST_INVALID", "LIFECYCLE_COMMIT_REQUEST_INVALID", "LIFECYCLE_COMMIT_CONFIRMATION_MISMATCH", "LIFECYCLE_UNDO_REQUEST_INVALID"].includes(error.code) || (error.code.startsWith("V2_OWNERSHIP_COMMIT_") && !proposalConflictCodes.includes(error.code)) || (error.code.startsWith("V2_LIFECYCLE_COMMIT_") && !proposalConflictCodes.includes(error.code));
    const migrationNotFound = ["MIGRATION_RUN_NOT_FOUND", "MIGRATION_BATCH_NOT_FOUND", "MIGRATION_SOURCE_OBJECT_NOT_FOUND"].includes(error.code);
    const migrationInputError = error.code.startsWith("MIGRATION_") && ["INVALID", "REQUIRED", "INCOMPLETE", "MISMATCH", "STRUCTURAL"].some((token) => error.code.includes(token)) && !migrationNotFound;
    const migrationConflict = error.code.startsWith("MIGRATION_") && !migrationInputError && !migrationNotFound;
    const uxInputError = ["UX_CONTEXT_RECOVERY_REQUEST_INVALID", "UX_CONTEXT_PROJECT_REQUIRED"].includes(error.code);
    const status = error.code === "REQUEST_BODY_TOO_LARGE"
      ? 413
      : migrationInputError || proposalInputError || domainInputError || uxInputError || error.code === "PROPOSAL_REVIEW_REQUEST_INVALID" || error.code === "PROPOSAL_REVALIDATION_REQUEST_INVALID" || error.code === "PROPOSAL_COMMIT_REQUEST_INVALID" || error.code === "PROJECT_CLOSURE_COMMIT_REQUEST_INVALID" || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_SHAPE") || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_OPERATION") || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_TARGET") || error.code === "V2_PROJECT_CLOSURE_PAYLOAD_INVALID" || error.code.startsWith("V2_PROJECT_CLOSURE_FIELD_") || error.code === "V2_PROJECT_CLOSURE_LIST_INVALID" || error.code === "CONTEXT_EXPORT_REQUEST_INVALID" || error.code === "CONTEXT_PROJECT_REQUIRED" || error.code === "FOCUS_REQUEST_INVALID" || error.code === "FOCUS_REORDER_REQUEST_INVALID" || error.code === "CONDITION_REQUEST_INVALID" || error.code === "DEADLINE_REQUEST_INVALID" || error.code === "V2_DEADLINE_INVALID" || error.code === "V2_DEADLINE_TASK_ONLY" || ["WAITING_FOR_REQUIRED", "WAITING_RESULT_REQUIRED", "WAITING_REVIEW_REQUIRED", "WAITING_REVIEW_INVALID", "BLOCKED_REASON_REQUIRED", "BLOCKER_OBJECT_ID_INVALID", "BLOCKER_OBJECT_SELF_REFERENCE", "PAUSED_REASON_REQUIRED", "PAUSED_REVIEW_INVALID"].includes(error.code) || error.code === "REQUEST_BODY_NOT_ALLOWED" || error.code === "REQUEST_JSON_INVALID" || error.code === "BACKUP_ID_INVALID" || error.code === "RESTORE_CONFIRMATION_REQUIRED" || error.code === "MATERIALIZATION_REQUEST_INVALID" || error.code === "PROJECT_CREATION_REQUEST_INVALID" || error.code === "PRIMARY_ANCHOR_CURSOR_INVALID" || error.code === "PRIMARY_ANCHOR_OBSERVATION_INVALID" || error.code === "PRIMARY_ANCHOR_REBIND_INVALID" || error.code === "V2_REBIND_CONFIRMATION_REQUIRED" || error.code === "V2_FOCUS_COMMAND_INVALID" || error.code === "V2_FOCUS_ORDER_INVALID" || error.code === "V2_FOCUS_SELECTION_INVALID"
        ? 400
          : migrationNotFound || error.code === "V2_OBJECT_NOT_FOUND" || error.code === "V2_PRIMARY_ANCHOR_NOT_FOUND" || error.code === "V2_PROPOSAL_NOT_FOUND" || error.code === "V2_MINI_PROJECT_CLOSURE_PROPOSAL_NOT_FOUND" || error.code === "V2_CANDIDATE_NOT_FOUND" || error.code === "V2_BLOCKER_OBJECT_NOT_FOUND" || error.code === "CONTEXT_OBJECT_NOT_FOUND"
          ? 404
          : error.code === "V2_GRAPH_ID_MISMATCH" || error.code === "V2_UNSUPPORTED_DATABASE_SCHEMA" || error.code === "V2_BACKUP_VALIDATION_FAILED"
          ? 422
          : migrationConflict || error.code === "V2_AREA_CLOSED" || error.code === "V2_ASSOCIATION_EXISTS" || error.code === "V2_CANDIDATE_STALE" || error.code === "V2_CANDIDATE_UPDATE_TARGET_STALE" || error.code === "V2_OBJECT_UPDATE_TARGET_STALE" || error.code === "V2_CANDIDATE_ALREADY_RESOLVED" || error.code === "V2_CANDIDATE_NOT_ACTIONABLE" || error.code === "V2_CANDIDATE_PROPOSAL_EXISTS" || error.code === "V2_CANDIDATE_PROPOSAL_ACTIVE" || error.code === "V2_EXPLICIT_CANDIDATE_REVIEW_REQUIRED" || error.code === "V2_MINI_PROJECT_CLOSURE_NOT_AVAILABLE" || error.code === "V2_MINI_PROJECT_CLOSURE_PROPOSAL_ACTIVE" || error.code === "V2_MINI_PROJECT_CLOSURE_PROPOSAL_AMBIGUOUS" || error.code === "V2_IDEMPOTENCY_KEY_CONFLICT" || error.code === "V2_BACKUP_DESTINATION_EXISTS" || error.code === "V2_EXTERNAL_PRIMARY_ANCHOR_EXISTS" || error.code === "V2_OBJECT_VERSION_CONFLICT" || error.code === "V2_CONDITION_OBJECT_CLOSED" || error.code === "V2_BLOCKER_OBJECT_CLOSED" || error.code === "V2_DEADLINE_OBJECT_CLOSED" || error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL" || error.code === "V2_COMPLEX_CLOSURE_REQUIRES_PROPOSAL" || error.code === "V2_PROJECT_CLOSURE_REQUIRED" || error.code === "V2_PROJECT_CLOSURE_PROJECT_ONLY" || error.code === "V2_PROJECT_CLOSURE_NOT_OPEN" || error.code === "V2_MARKER_LIFECYCLE_UNSUPPORTED" || error.code === "V2_MARKER_TERMINAL_CONFLICT" || error.code === "V2_TASK_CANCELLATION_REASON_REQUIRED" || error.code === "V2_PRIMARY_ANCHOR_CONFLICT" || error.code === "V2_REBIND_TARGET_ALREADY_BOUND" || error.code === "V2_REBIND_PREVIEW_STALE" || error.code === "V2_PROJECT_CREATION_INTENT_MISMATCH" || error.code === "V2_PROJECT_CREATION_RECOVERY_REQUIRED" || error.code === "V2_FOCUS_OBJECT_STALE" || error.code === "V2_FOCUS_OBJECT_CLOSED" || error.code === "V2_FOCUS_ORDER_STALE" || proposalConflictCodes.includes(error.code)
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
  const store = await V2SqliteStore.open(options.databasePath);
  let storeOpen = true;
  let stopping = false;
  store.initialize(options.graphId);
  const application = new V2Application(store);
  const candidateApplication = new V2CandidateApplication(store);
  const migrationApplication = new V2MigrationApplication(store);
  const proposalApplication = new V2ProposalApplication(store);
  const graphReadBroker = new GraphReadBroker();
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
      && proposal.groups.some(({ semanticOperations }) => semanticOperations.some(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && (payload.action === "CANCEL" || payload.action === "REOPEN"))),
    );
    if (matches.length > 1) throw serviceError("V2_LIFECYCLE_PROPOSAL_AMBIGUOUS", "同一对象存在多个活跃取消或重开 Proposal；必须先恢复为单一机器权威。");
    return matches[0];
  };
  const submitReasonedLifecycle = async (object: V2ManagedObject, input: { action: "CANCEL" | "REOPEN"; reason: string }) => serializeByKey(`lifecycle-proposal:${object.objectId}`, async () => {
    if (!["TASK", "MINI_PROJECT", "PROJECT"].includes(object.objectType)) throw serviceError("V2_LIFECYCLE_ACTION_NOT_AVAILABLE", "只有 Task、MiniProject 或 Project 支持取消与重开。");
    if (input.action === "CANCEL" ? object.lifecycle !== "OPEN" : !["COMPLETED", "CANCELLED"].includes(object.lifecycle)) throw serviceError("V2_LIFECYCLE_ACTION_NOT_AVAILABLE", `当前 ${object.lifecycle} 对象不能执行 ${input.action}。`);
    const active = await activeReasonedLifecycle(object.objectId);
    const historyCount = (await proposalApplication.list()).filter(({ proposal }) => proposal.scope.modify.some(({ kind, id, version }) => kind === "OBJECT" && id === object.objectId && version === object.version) && proposal.groups.some(({ semanticOperations }) => semanticOperations.some(({ kind, payload }) => kind === "TRANSITION_LIFECYCLE" && payload.action === input.action))).length;
    const proposalId = active?.proposal.proposalId ?? `proposal_lifecycle_${createHash("sha256").update(JSON.stringify([options.graphId, object.objectId, object.version, input.action, historyCount + 1])).digest("hex").slice(0, 32)}`;
    const lifecycle = input.action === "CANCEL" ? "CANCELLED" : "OPEN";
    const verb = input.action === "CANCEL" ? "取消" : "重开";
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
  const providerConfigured = options.proposalGenerator !== undefined;
  const capabilities = { ...LOCAL_SERVICE_CAPABILITIES, provider: providerConfigured };
  const comprehensiveDoctor = async (): Promise<ServiceDoctor> => {
    const core = store.doctor();
    const operational = store.operationalDiagnostics();
    const skillCount = (await listTaskCopilotSkills()).length;
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
      { component: "SKILL_PROFILE", status: skillCount === 3 ? "PASS" : "FAIL", code: skillCount === 3 ? "BUILTIN_SKILLS_VALID" : "BUILTIN_SKILLS_INVALID", count: skillCount },
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

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!authorized(request, token)) {
      respond(response, 401, { error: { code: "UNAUTHORIZED", message: "Local Service session token is required." } });
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (stopping) {
      respond(response, 503, { error: { code: "SERVICE_STOPPING", message: "Local Service 正在执行受控恢复并停止。" } });
      return;
    }
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
        const generated = await options.uxOutputGenerator.generate({
          ...generation.request,
          signal: controller.signal,
        });
        const latest = store.getObject(project.objectId);
        if (!latest || latest.version !== input.expectedVersion) {
          throw serviceError("V2_OBJECT_VERSION_CONFLICT", "Project 在恢复草稿生成期间已变化；草稿已丢弃。");
        }
        respond(response, 200, { ...generated, contextFingerprint });
      } finally {
        request.removeListener("aborted", abort);
      }
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
      respond(response, 200, { run, evidence: store.migrationEvidence(runId) });
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
      respond(response, result.replayed ? 200 : 201, result);
      return;
    }
    const migrationBatchActionMatch = request.method === "POST" ? url.pathname.match(/^\/migration\/runs\/([^/]+)\/batches\/([^/]+)\/(verify|undo)$/) : null;
    if (migrationBatchActionMatch?.[1] && migrationBatchActionMatch[2] && migrationBatchActionMatch[3]) {
      const runId = decodeURIComponent(migrationBatchActionMatch[1]);
      const batchId = decodeURIComponent(migrationBatchActionMatch[2]);
      if (migrationBatchActionMatch[3] === "verify") {
        await requireNoBody(request);
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
      const plan = planAcceptedV2ProjectClosure(stored.proposal);
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const receiptKey = `project-closure:${semanticCommitId}`;
      const existing = store.semanticCommit(semanticCommitId);
      const existingSteps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
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
      const object = await application.completeProject(plan.objectId, plan.closure, {
        actor: "proposal_commit",
        expectedVersion: plan.expectedVersion,
        idempotencyKey: receiptKey,
        traceId: input.traceId,
      }, now);
      options.faults?.afterProjectClosureDomainWrite?.();
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "PREPARED") store.advanceSemanticCommitStep(semanticCommitId, 0, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(semanticCommitId)[0]?.status === "APPLIED") store.advanceSemanticCommitStep(semanticCommitId, 0, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(semanticCommitId, "COMPLETED", now.toISOString(), checksum(object));
      const record = await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt, now);
      respond(response, 200, { status: "COMPLETED", semanticCommitId, object, record, replayed: false });
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
      const expectedConfirmation = "action" in plan ? (plan.action === "CANCEL" ? "CANCEL_OBJECT" : "REOPEN_OBJECT") : "COMPLETE_MINI_PROJECT";
      if (input.confirmation !== expectedConfirmation) throw serviceError("LIFECYCLE_COMMIT_CONFIRMATION_MISMATCH", "Lifecycle Commit 确认词与已审阅动作不一致。");
      const receiptCommand = "action" in plan ? (plan.action === "CANCEL" ? "cancel_lifecycle" : "reopen_lifecycle") : plan.evidenceKind === "MARKER" ? "complete_mini_project_from_marker" : "complete_mini_project";
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
            : await application.reopenLifecycle(plan.objectId, plan.reason, envelope, now);
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
            const object = plan.action === "CANCEL" ? await application.cancelLifecycle(plan.objectId, plan.reason, envelope, now) : await application.reopenLifecycle(plan.objectId, plan.reason, envelope, now);
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
      stopping = true;
      const createdAt = new Date();
      const recoveryBackupId = createId("backup", createdAt);
      const recoveryPath = join(backupRoot, `${recoveryBackupId}.db`);
      try {
        store.close();
        storeOpen = false;
        const restored = await V2SqliteStore.restoreOffline(options.databasePath, source, recoveryPath, options.graphId);
        respond(response, 200, {
          status: "RESTORED_SERVICE_STOPPING",
          backupId,
          recoveryBackupId,
          validation: restored.validation,
        });
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
