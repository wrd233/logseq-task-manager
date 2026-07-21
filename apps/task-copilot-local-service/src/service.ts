import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";

import { V2Application, V2MigrationApplication, V2ProposalApplication, planAcceptedV2Formalization, planAcceptedV2OwnershipChange, planAcceptedV2ProjectClosure, projectV2NowWork, type MaterializeExplicitObjectInput } from "@task-copilot/application";
import { renderV2ProposalFiles, requiredV2ProposalRevalidationScope, validateV2ProposalForSubmission, type LegacyMigrationReviewDecision, type V2Condition, type V2ProposalGroupDecision, type V2ProposalScopeObservation } from "@task-copilot/domain";
import { V2_DATABASE_SCHEMA_VERSION, V2SqliteStore, type V2CommitStepStatus } from "@task-copilot/persistence/node";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type ServiceCapabilities,
  type ServiceDescriptor,
  type ServiceDoctor,
  type ServiceDoctorCheck,
} from "@task-copilot/service-client";
import { removeServiceDescriptor, writeServiceDescriptor } from "@task-copilot/service-client/node";
import { StructuredError, checksum, createId, stableJson } from "@task-copilot/shared";

import type { LocalLlmProposalGenerator, V2PromptBundle } from "./llm-proposal.ts";
import { listTaskCopilotSkills, readTaskCopilotSkill } from "./skill-catalog.ts";
import { buildContextPackage, contextPackageFingerprint, type ContextExportScope } from "./context-package.ts";
import { readLegacyRecoveryBundle, scanLegacyRecoveryBundle } from "./migration-scan.ts";

export { LOCAL_SERVICE_PROTOCOL_VERSION } from "@task-copilot/service-client";

export const LOCAL_SERVICE_CAPABILITIES = {
  formalWrites: true,
  migration: true,
  provider: false,
  backup: true,
} satisfies ServiceCapabilities;

export interface LocalServiceOptions {
  databasePath: string;
  graphId: string;
  token?: string;
  descriptorPath?: string;
  backupRoot?: string;
  proposalGenerator?: LocalLlmProposalGenerator;
  /** Test-only fault boundary; production callers must omit it. */
  faults?: { afterProjectClosureDomainWrite?: () => void; afterOwnershipPrepare?: () => void; afterOwnershipDomainWrite?: () => void; afterOwnershipCommitFailedBeforeProposalTerminal?: () => void };
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

async function readContextExportRequest(request: IncomingMessage): Promise<{ scope: ContextExportScope; id: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "id,scope" || !["object", "project"].includes(String(record.scope)) || typeof record.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.id)) {
    throw serviceError("CONTEXT_EXPORT_REQUEST_INVALID", "Context export 只接受 object/project 和受控对象 ID。");
  }
  return { scope: record.scope as ContextExportScope, id: record.id };
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

async function readProposalReviewRequest(request: IncomingMessage): Promise<{ decisions: Record<string, V2ProposalGroupDecision>; expectedUpdatedAt: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const decisions = record.decisions && typeof record.decisions === "object" && !Array.isArray(record.decisions) ? record.decisions as Record<string, unknown> : undefined;
  if (Object.keys(record).sort().join(",") !== "decisions,expectedUpdatedAt" || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || !decisions || Object.keys(decisions).length > 64) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 审阅请求无效。");
  for (const [groupId, rawDecision] of Object.entries(decisions)) {
    const decision = rawDecision && typeof rawDecision === "object" && !Array.isArray(rawDecision) ? rawDecision as Record<string, unknown> : {};
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(groupId) || !["ACCEPTED", "REJECTED", "DEFERRED"].includes(String(decision.disposition))) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 审阅决定无效。");
    if (decision.disposition === "ACCEPTED" && (Object.keys(decision).some((key) => !["disposition", "highImpactConfirmed"].includes(key)) || (decision.highImpactConfirmed !== undefined && typeof decision.highImpactConfirmed !== "boolean"))) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 接受决定包含未知字段。");
    if (decision.disposition === "REJECTED" && Object.keys(decision).length !== 1) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 拒绝决定包含未知字段。");
    if (decision.disposition === "DEFERRED" && (Object.keys(decision).sort().join(",") !== "deferredUntil,disposition,reason" || typeof decision.deferredUntil !== "string" || typeof decision.reason !== "string")) throw serviceError("PROPOSAL_REVIEW_REQUEST_INVALID", "Proposal 暂缓决定无效。");
  }
  return { decisions: decisions as Record<string, V2ProposalGroupDecision>, expectedUpdatedAt: record.expectedUpdatedAt };
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

async function readOwnershipCommitRequest(request: IncomingMessage): Promise<{ expectedUpdatedAt: string; observations: V2ProposalScopeObservation[]; traceId: string }> {
  const body = await readBody(request);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw serviceError("REQUEST_JSON_INVALID", "请求体必须是合法 JSON。"); }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(record).sort().join(",") !== "confirmation,expectedUpdatedAt,observations,traceId" || record.confirmation !== "CHANGE_PRIMARY_OWNERSHIP" || typeof record.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(record.expectedUpdatedAt)) || typeof record.traceId !== "string" || !record.traceId.trim() || record.traceId.length > 256) throw serviceError("OWNERSHIP_COMMIT_REQUEST_INVALID", "Primary Ownership Commit 必须有当前 Proposal 版本、trace_id 和精确高影响确认。");
  return { expectedUpdatedAt: record.expectedUpdatedAt, observations: parseProposalGraphObservations(record.observations, "OWNERSHIP_COMMIT_REQUEST_INVALID", "Primary Ownership 重验证据无效。"), traceId: record.traceId };
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
    const proposalConflictCodes = ["V2_PROPOSAL_REVIEW_STALE", "V2_PROPOSAL_REVALIDATION_STALE", "V2_PROPOSAL_COMMIT_STALE", "V2_PROPOSAL_NOT_ACCEPTED", "V2_PROPOSAL_ID_CONFLICT", "V2_PROPOSAL_COMMIT_IN_PROGRESS", "V2_PROPOSAL_COMMIT_RECOVERY_REQUIRED", "V2_PROPOSAL_COMMIT_INTENT_MISMATCH", "V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "V2_PROPOSAL_COMMIT_GRAPH_EVIDENCE_MISMATCH", "V2_PROPOSAL_COMPENSATION_EVIDENCE_MISMATCH", "V2_PROJECT_CLOSURE_COMMIT_RECOVERY_REQUIRED", "V2_PROJECT_CLOSURE_COMMIT_LEDGER_CORRUPT", "V2_OWNERSHIP_COMMIT_RECOVERY_REQUIRED", "V2_OWNERSHIP_COMMIT_LEDGER_CORRUPT", "V2_PRIMARY_OWNER_STALE", "V2_PRIMARY_OWNER_UNCHANGED", "V2_PRIMARY_OWNERSHIP_NOT_ALLOWED"];
    const proposalInputError = error.code.startsWith("V2_PROPOSAL_") && error.code !== "V2_PROPOSAL_NOT_FOUND" && !proposalConflictCodes.includes(error.code);
    const domainInputError = ["V2_ASSOCIATION_REQUEST_INVALID", "V2_ASSOCIATION_SELF_REFERENCE", "OWNERSHIP_COMMIT_REQUEST_INVALID"].includes(error.code) || (error.code.startsWith("V2_OWNERSHIP_COMMIT_") && !proposalConflictCodes.includes(error.code));
    const migrationNotFound = ["MIGRATION_RUN_NOT_FOUND", "MIGRATION_BATCH_NOT_FOUND", "MIGRATION_SOURCE_OBJECT_NOT_FOUND"].includes(error.code);
    const migrationInputError = error.code.startsWith("MIGRATION_") && ["INVALID", "REQUIRED", "INCOMPLETE", "MISMATCH", "STRUCTURAL"].some((token) => error.code.includes(token)) && !migrationNotFound;
    const migrationConflict = error.code.startsWith("MIGRATION_") && !migrationInputError && !migrationNotFound;
    const status = error.code === "REQUEST_BODY_TOO_LARGE"
      ? 413
      : migrationInputError || proposalInputError || domainInputError || error.code === "PROPOSAL_REVIEW_REQUEST_INVALID" || error.code === "PROPOSAL_REVALIDATION_REQUEST_INVALID" || error.code === "PROPOSAL_COMMIT_REQUEST_INVALID" || error.code === "PROJECT_CLOSURE_COMMIT_REQUEST_INVALID" || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_SHAPE") || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_OPERATION") || error.code.startsWith("V2_PROJECT_CLOSURE_COMMIT_TARGET") || error.code === "V2_PROJECT_CLOSURE_PAYLOAD_INVALID" || error.code.startsWith("V2_PROJECT_CLOSURE_FIELD_") || error.code === "V2_PROJECT_CLOSURE_LIST_INVALID" || error.code === "CONTEXT_EXPORT_REQUEST_INVALID" || error.code === "CONTEXT_PROJECT_REQUIRED" || error.code === "FOCUS_REQUEST_INVALID" || error.code === "FOCUS_REORDER_REQUEST_INVALID" || error.code === "CONDITION_REQUEST_INVALID" || error.code === "DEADLINE_REQUEST_INVALID" || error.code === "V2_DEADLINE_INVALID" || error.code === "V2_DEADLINE_TASK_ONLY" || ["WAITING_FOR_REQUIRED", "WAITING_RESULT_REQUIRED", "WAITING_REVIEW_REQUIRED", "WAITING_REVIEW_INVALID", "BLOCKED_REASON_REQUIRED", "BLOCKER_OBJECT_ID_INVALID", "BLOCKER_OBJECT_SELF_REFERENCE", "PAUSED_REASON_REQUIRED", "PAUSED_REVIEW_INVALID"].includes(error.code) || error.code === "REQUEST_BODY_NOT_ALLOWED" || error.code === "REQUEST_JSON_INVALID" || error.code === "BACKUP_ID_INVALID" || error.code === "RESTORE_CONFIRMATION_REQUIRED" || error.code === "MATERIALIZATION_REQUEST_INVALID" || error.code === "PROJECT_CREATION_REQUEST_INVALID" || error.code === "PRIMARY_ANCHOR_CURSOR_INVALID" || error.code === "PRIMARY_ANCHOR_OBSERVATION_INVALID" || error.code === "PRIMARY_ANCHOR_REBIND_INVALID" || error.code === "V2_REBIND_CONFIRMATION_REQUIRED" || error.code === "V2_FOCUS_COMMAND_INVALID" || error.code === "V2_FOCUS_ORDER_INVALID" || error.code === "V2_FOCUS_SELECTION_INVALID"
        ? 400
        : migrationNotFound || error.code === "V2_OBJECT_NOT_FOUND" || error.code === "V2_PRIMARY_ANCHOR_NOT_FOUND" || error.code === "V2_PROPOSAL_NOT_FOUND" || error.code === "V2_BLOCKER_OBJECT_NOT_FOUND" || error.code === "CONTEXT_OBJECT_NOT_FOUND"
          ? 404
          : error.code === "V2_GRAPH_ID_MISMATCH" || error.code === "V2_UNSUPPORTED_DATABASE_SCHEMA" || error.code === "V2_BACKUP_VALIDATION_FAILED"
          ? 422
          : migrationConflict || error.code === "V2_ASSOCIATION_EXISTS" || error.code === "V2_BACKUP_DESTINATION_EXISTS" || error.code === "V2_EXTERNAL_PRIMARY_ANCHOR_EXISTS" || error.code === "V2_OBJECT_VERSION_CONFLICT" || error.code === "V2_CONDITION_OBJECT_CLOSED" || error.code === "V2_BLOCKER_OBJECT_CLOSED" || error.code === "V2_DEADLINE_OBJECT_CLOSED" || error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL" || error.code === "V2_COMPLEX_CLOSURE_REQUIRES_PROPOSAL" || error.code === "V2_PROJECT_CLOSURE_REQUIRED" || error.code === "V2_PROJECT_CLOSURE_PROJECT_ONLY" || error.code === "V2_PROJECT_CLOSURE_NOT_OPEN" || error.code === "V2_MARKER_LIFECYCLE_UNSUPPORTED" || error.code === "V2_MARKER_TERMINAL_CONFLICT" || error.code === "V2_TASK_CANCELLATION_REASON_REQUIRED" || error.code === "V2_PRIMARY_ANCHOR_CONFLICT" || error.code === "V2_REBIND_TARGET_ALREADY_BOUND" || error.code === "V2_REBIND_PREVIEW_STALE" || error.code === "V2_PROJECT_CREATION_INTENT_MISMATCH" || error.code === "V2_PROJECT_CREATION_RECOVERY_REQUIRED" || error.code === "V2_FOCUS_OBJECT_STALE" || error.code === "V2_FOCUS_OBJECT_CLOSED" || error.code === "V2_FOCUS_ORDER_STALE" || proposalConflictCodes.includes(error.code)
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
  const migrationApplication = new V2MigrationApplication(store);
  const proposalApplication = new V2ProposalApplication(store);
  const capabilities = { ...LOCAL_SERVICE_CAPABILITIES, provider: options.proposalGenerator !== undefined };
  const comprehensiveDoctor = async (): Promise<ServiceDoctor> => {
    const core = store.doctor();
    const operational = store.operationalDiagnostics();
    const skillCount = (await listTaskCopilotSkills()).length;
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
      { component: "GRAPH", status: "INFO", code: "GRAPH_RUNTIME_NOT_OBSERVED" },
      { component: "SQLITE", status: core.integrity === "ok" && core.foreignKeyViolations === 0 ? "PASS" : "FAIL", code: core.integrity === "ok" && core.foreignKeyViolations === 0 ? "SQLITE_INTEGRITY_VALID" : "SQLITE_INTEGRITY_INVALID", count: core.foreignKeyViolations },
      { component: "SCHEMA", status: core.schemaVersion === V2_DATABASE_SCHEMA_VERSION ? "PASS" : "FAIL", code: core.schemaVersion === V2_DATABASE_SCHEMA_VERSION ? "SCHEMA_CURRENT" : "SCHEMA_UNSUPPORTED" },
      { component: "ANCHOR", status: operational.multiplePrimaryAnchorObjectCount > 0 ? "FAIL" : operational.missingAnchorCount + operational.conflictAnchorCount > 0 ? "WARN" : "PASS", code: operational.multiplePrimaryAnchorObjectCount > 0 ? "ANCHOR_MULTIPLE_PRIMARY" : operational.missingAnchorCount + operational.conflictAnchorCount > 0 ? "ANCHOR_RECONCILIATION_REQUIRED" : "ANCHOR_HEALTHY", count: operational.missingAnchorCount + operational.conflictAnchorCount + operational.multiplePrimaryAnchorObjectCount },
      { component: "IDENTITY", status: operational.invalidIdentityCount > 0 ? "FAIL" : "PASS", code: operational.invalidIdentityCount > 0 ? "IDENTITY_INVALID" : "IDENTITY_VALID", count: operational.invalidIdentityCount },
      { component: "PROPOSAL", status: operational.staleProposalCount > 0 ? "WARN" : "PASS", code: operational.staleProposalCount > 0 ? "STALE_PROPOSAL_PRESENT" : "PROPOSAL_HEALTHY", count: operational.staleProposalCount },
      { component: "SEMANTIC_COMMIT", status: operational.recoveryRequiredCommitCount > 0 ? "FAIL" : operational.pendingCommitCount > 0 ? "WARN" : "PASS", code: operational.recoveryRequiredCommitCount > 0 ? "COMMIT_RECOVERY_REQUIRED" : operational.pendingCommitCount > 0 ? "COMMIT_PENDING" : "COMMIT_HEALTHY", count: operational.pendingCommitCount + operational.recoveryRequiredCommitCount },
      { component: "BACKUP", status: backupStatus, code: backupCode, count: backupCount },
      { component: "KEY_REFERENCE", status: "PASS", code: options.proposalGenerator ? "KEY_RESOLVED_OUT_OF_BAND" : "KEY_NOT_REQUIRED" },
      { component: "PROVIDER", status: "INFO", code: options.proposalGenerator ? "PROVIDER_CONFIGURED_NOT_PROBED" : "PROVIDER_DISABLED" },
      { component: "SKILL_PROFILE", status: skillCount === 2 ? "PASS" : "FAIL", code: skillCount === 2 ? "BUILTIN_SKILLS_VALID" : "BUILTIN_SKILLS_INVALID", count: skillCount },
      { component: "LOGGING", status: "INFO", code: "SERVICE_LOG_COLLECTION_NOT_CONFIGURED" },
      { component: "PROTOCOL", status: "PASS", code: "CLI_SERVICE_PROTOCOL_CURRENT" },
    ];
    const summary = {
      pass: checks.filter(({ status }) => status === "PASS").length,
      warn: checks.filter(({ status }) => status === "WARN").length,
      fail: checks.filter(({ status }) => status === "FAIL").length,
      info: checks.filter(({ status }) => status === "INFO").length,
    };
    return { ...core, status: summary.fail > 0 ? "FAIL" : "PASS", checks, summary, limitations: ["Graph and Desktop event health require the Plugin runtime gate.", "Provider health requires an explicit bounded live smoke.", "Service log collection is not configured; the diagnostic archive contains structured status only."] };
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
    if (request.method === "GET" && url.pathname === "/skills") {
      respond(response, 200, { skills: await listTaskCopilotSkills() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/context/export") {
      const input = await readContextExportRequest(request);
      const skillSummaries = await listTaskCopilotSkills();
      const skillDocuments = (await Promise.all(skillSummaries.map(({ name }) => readTaskCopilotSkill(name)))).filter((skill) => skill !== undefined);
      const contextPackage = buildContextPackage({
        getObject: (objectId) => store.getObject(objectId),
        listObjects: () => store.listObjects(),
        listPrimaryOwnerships: () => store.listPrimaryOwnerships(),
        listAssociations: () => store.listAssociations(),
        getActivePrimaryAnchorByObject: (objectId) => store.getActivePrimaryAnchorByObject(objectId),
        databaseSchemaVersion: () => store.doctor().schemaVersion,
      }, skillDocuments, { kind: input.scope, id: input.id });
      respond(response, 200, { contextPackage, fingerprint: contextPackageFingerprint(contextPackage) });
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
      const result = await proposalApplication.submit(candidate);
      respond(response, result.replayed ? 200 : 201, result);
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
        const result = await options.proposalGenerator.generateAndSubmit({
          proposalId: createId("prop"),
          createdAt,
          prompt: input.prompt,
          signal: controller.signal,
        }, proposalApplication);
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
    const proposalCommitPrepareMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/commit\/prepare$/) : null;
    if (proposalCommitPrepareMatch?.[1]) {
      const proposalId = decodeURIComponent(proposalCommitPrepareMatch[1]);
      const input = await readProposalRevalidationRequest(request);
      const stored = await proposalApplication.get(proposalId);
      if (!stored) throw serviceError("V2_PROPOSAL_NOT_FOUND", "Proposal 不存在。");
      const plan = planAcceptedV2Formalization(stored.proposal);
      const semanticCommitId = proposalSemanticCommitId(options.graphId, proposalId, input.expectedUpdatedAt);
      const existing = store.semanticCommit(semanticCommitId);
      const existingSteps = existing ? store.semanticCommitSteps(semanticCommitId) : [];
      const existingObjectId = existingSteps[1]?.operationId;
      if (existing && ["PENDING", "RECOVERY_REQUIRED", "COMPLETED"].includes(existing.status)) {
        if (existingSteps.length !== 2 || !existingObjectId) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "Proposal Commit ledger 缺少对象身份或步骤。");
        if (existing.status === "COMPLETED" && stored.proposal.status !== "APPLIED") await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
        respond(response, 200, { status: existing.status === "PENDING" ? "PREPARED" : existing.status, semanticCommitId, proposalId, expectedUpdatedAt: input.expectedUpdatedAt, objectId: existingObjectId, plan, replayed: true });
        return;
      }
      if (existing) throw serviceError("V2_PROPOSAL_COMMIT_RECOVERY_REQUIRED", "Proposal Commit 已终止，不能创建平行事务。");
      const revalidation = await proposalApplication.revalidate(proposalId, completeProposalObservations(stored.proposal, input.observations), input.expectedUpdatedAt);
      if (revalidation.result.status === "STALE") {
        respond(response, 200, { status: "STALE", ...revalidation });
        return;
      }
      const objectId = createId("obj", new Date());
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
      const plan = planAcceptedV2Formalization(stored.proposal);
      const commit = store.semanticCommit(input.semanticCommitId);
      const steps = store.semanticCommitSteps(input.semanticCommitId);
      const objectId = steps[1]?.operationId;
      if (!commit || commit.proposalId !== proposalId || steps.length !== 2 || steps[0]?.operationId !== plan.patch.blockUuid || steps[0]?.beforeHash !== plan.patch.beforeHash || steps[0]?.afterHash !== plan.patch.afterHash || !objectId) throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "Proposal Commit ledger 与已审阅计划不一致。");
      const receiptKey = `proposal-commit:${input.semanticCommitId}`;
      if (commit.status === "COMPLETED") {
        const receipt = store.getCommandReceipt(receiptKey);
        if (receipt?.command !== "materialize_explicit_object") throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "已完成 Proposal Commit 缺少领域回执。");
        const record = stored.proposal.status === "APPLIED" ? stored : await proposalApplication.markApplied(proposalId, input.expectedUpdatedAt);
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
        result = await application.materializeExplicitObject({ objectId, objectType: plan.create.objectType, text: plan.create.text, anchor: { graphId: options.graphId, externalId: plan.patch.blockUuid, contentHash: plan.patch.afterHash } }, { actor: "proposal_commit", expectedVersion: 0, idempotencyKey: receiptKey, traceId: input.traceId }, now);
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
      const plan = planAcceptedV2Formalization(stored.proposal);
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
      const plan = planAcceptedV2Formalization(stored.proposal);
      const receipt = store.getCommandReceipt(`proposal-commit:${originalSemanticCommitId}`);
      if (receipt?.command !== "materialize_explicit_object") throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "原 Commit 缺少物化回执。");
      const existing = store.semanticCommit(undoSemanticCommitId);
      if (original.status === "UNDONE" && existing?.status === "COMPLETED") {
        respond(response, 200, { status: "COMPLETED", originalSemanticCommitId, undoSemanticCommitId, proposalId: original.proposalId, objectId: receipt.object.objectId, patch: plan.patch, replayed: true });
        return;
      }
      if (original.status === "COMPLETED" && existing?.status === "COMPLETED") {
        store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
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
      const plan = planAcceptedV2Formalization(stored.proposal);
      const receipt = store.getCommandReceipt(`proposal-commit:${originalSemanticCommitId}`);
      if (receipt?.command !== "materialize_explicit_object") throw serviceError("V2_PROPOSAL_COMMIT_LEDGER_CORRUPT", "原 Commit 缺少物化回执。");
      if (inverse.status === "COMPLETED" && ["COMPLETED", "UNDONE"].includes(original.status)) {
        if (original.status === "COMPLETED") store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, new Date().toISOString());
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
        undone = await application.undoMaterialization({ object: receipt.object, anchor: receipt.anchor }, { actor: "proposal_undo", expectedVersion: receipt.object.version, idempotencyKey: `proposal-undo:${undoSemanticCommitId}`, traceId: input.traceId }, now);
      } catch {
        store.advanceSemanticCommitStep(undoSemanticCommitId, 0, "RECOVERY_REQUIRED", now.toISOString(), "DOMAIN_UNDO_FAILED");
        store.finalizeSemanticCommit(undoSemanticCommitId, "RECOVERY_REQUIRED", now.toISOString(), undefined, "DOMAIN_UNDO_FAILED");
        respond(response, 200, { status: "COMPENSATION_REQUIRED", originalSemanticCommitId, undoSemanticCommitId, patch: plan.patch });
        return;
      }
      const domainStep = store.semanticCommitSteps(undoSemanticCommitId)[1];
      if (domainStep?.status === "PREPARED") store.advanceSemanticCommitStep(undoSemanticCommitId, 1, "APPLIED", now.toISOString());
      if (store.semanticCommitSteps(undoSemanticCommitId)[1]?.status === "APPLIED") store.advanceSemanticCommitStep(undoSemanticCommitId, 1, "VERIFIED", now.toISOString());
      store.finalizeSemanticCommit(undoSemanticCommitId, "COMPLETED", now.toISOString(), checksum({ objectRemoved: undone.object.objectId, anchorRemoved: undone.anchor.anchorId }));
      store.markSemanticCommitUndone(originalSemanticCommitId, undoSemanticCommitId, now.toISOString());
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
      respond(response, 200, await proposalApplication.review(proposalId, input.decisions, input.expectedUpdatedAt));
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
          server.close();
        }
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/objects") {
      respond(response, 200, { objects: store.listObjects() });
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
    store.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
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
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      if (storeOpen) {
        store.close();
        storeOpen = false;
      }
      if (options.descriptorPath) await removeServiceDescriptor(options.descriptorPath);
    },
  };
}
