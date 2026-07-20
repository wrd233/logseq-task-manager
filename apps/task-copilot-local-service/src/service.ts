import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";

import { V2Application, V2ProposalApplication, type MaterializeExplicitObjectInput } from "@task-copilot/application";
import { renderV2ProposalFiles, validateV2Proposal, type V2ProposalGroupDecision } from "@task-copilot/domain";
import { V2SqliteStore, type V2CommitStepStatus } from "@task-copilot/persistence/node";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type ServiceCapabilities,
  type ServiceDescriptor,
} from "@task-copilot/service-client";
import { removeServiceDescriptor, writeServiceDescriptor } from "@task-copilot/service-client/node";
import { StructuredError, checksum, createId } from "@task-copilot/shared";

export { LOCAL_SERVICE_PROTOCOL_VERSION } from "@task-copilot/service-client";

export interface LocalServiceOptions {
  databasePath: string;
  graphId: string;
  token?: string;
  descriptorPath?: string;
  backupRoot?: string;
}
export interface LocalServiceHandle {
  url: string;
  token: string;
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

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    size += chunk.length;
    if (size > maximumRequestBodyBytes) {
      throw serviceError("REQUEST_BODY_TOO_LARGE", "Local Service 请求体超过 16 KiB 限制。");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function requireNoBody(request: IncomingMessage): Promise<void> {
  if ((await readBody(request)).trim().length > 0) {
    throw serviceError("REQUEST_BODY_NOT_ALLOWED", "Backup 创建不接受客户端路径或其他参数。");
  }
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
    const proposalInputError = error.code.startsWith("V2_PROPOSAL_") && !["V2_PROPOSAL_NOT_FOUND", "V2_PROPOSAL_REVIEW_STALE", "V2_PROPOSAL_ID_CONFLICT"].includes(error.code);
    const status = error.code === "REQUEST_BODY_TOO_LARGE"
      ? 413
      : proposalInputError || error.code === "PROPOSAL_REVIEW_REQUEST_INVALID" || error.code === "REQUEST_BODY_NOT_ALLOWED" || error.code === "REQUEST_JSON_INVALID" || error.code === "BACKUP_ID_INVALID" || error.code === "RESTORE_CONFIRMATION_REQUIRED" || error.code === "MATERIALIZATION_REQUEST_INVALID" || error.code === "PROJECT_CREATION_REQUEST_INVALID" || error.code === "PRIMARY_ANCHOR_CURSOR_INVALID" || error.code === "PRIMARY_ANCHOR_OBSERVATION_INVALID" || error.code === "PRIMARY_ANCHOR_REBIND_INVALID" || error.code === "V2_REBIND_CONFIRMATION_REQUIRED"
        ? 400
        : error.code === "V2_PRIMARY_ANCHOR_NOT_FOUND" || error.code === "V2_PROPOSAL_NOT_FOUND"
          ? 404
          : error.code === "V2_GRAPH_ID_MISMATCH" || error.code === "V2_UNSUPPORTED_DATABASE_SCHEMA" || error.code === "V2_BACKUP_VALIDATION_FAILED"
          ? 422
          : error.code === "V2_BACKUP_DESTINATION_EXISTS" || error.code === "V2_EXTERNAL_PRIMARY_ANCHOR_EXISTS" || error.code === "V2_OBJECT_VERSION_CONFLICT" || error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL" || error.code === "V2_COMPLEX_CLOSURE_REQUIRES_PROPOSAL" || error.code === "V2_MARKER_LIFECYCLE_UNSUPPORTED" || error.code === "V2_MARKER_TERMINAL_CONFLICT" || error.code === "V2_TASK_CANCELLATION_REASON_REQUIRED" || error.code === "V2_PRIMARY_ANCHOR_CONFLICT" || error.code === "V2_REBIND_TARGET_ALREADY_BOUND" || error.code === "V2_REBIND_PREVIEW_STALE" || error.code === "V2_PROJECT_CREATION_INTENT_MISMATCH" || error.code === "V2_PROJECT_CREATION_RECOVERY_REQUIRED" || error.code === "V2_PROPOSAL_REVIEW_STALE" || error.code === "V2_PROPOSAL_ID_CONFLICT"
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
  const proposalApplication = new V2ProposalApplication(store);
  const capabilities: ServiceCapabilities = { formalWrites: true, migration: false, provider: false, backup: true };

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
      const doctor = store.doctor();
      respond(response, doctor.status === "PASS" ? 200 : 503, doctor);
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
      const proposal = validateV2Proposal(candidate);
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
    if (request.method === "GET" && url.pathname === "/proposals") {
      respond(response, 200, { proposals: await proposalApplication.list() });
      return;
    }
    const proposalReviewMatch = request.method === "POST" ? url.pathname.match(/^\/proposals\/([^/]+)\/review$/) : null;
    if (proposalReviewMatch?.[1]) {
      const input = await readProposalReviewRequest(request);
      respond(response, 200, await proposalApplication.review(decodeURIComponent(proposalReviewMatch[1]), input.decisions, input.expectedUpdatedAt));
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
