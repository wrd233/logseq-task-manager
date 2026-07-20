import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";

import { V2Application, type MaterializeExplicitObjectInput } from "@task-copilot/application";
import { V2SqliteStore } from "@task-copilot/persistence/node";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type ServiceCapabilities,
  type ServiceDescriptor,
} from "@task-copilot/service-client";
import { removeServiceDescriptor, writeServiceDescriptor } from "@task-copilot/service-client/node";
import { StructuredError, createId } from "@task-copilot/shared";

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
  externalId: string;
  inputVersion: string;
  contentHash: string;
  idempotencyKey: string;
  traceId: string;
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
  const exactKeys = ["contentHash", "externalId", "idempotencyKey", "inputVersion", "objectType", "text", "traceId"];
  const actualKeys = Object.keys(record).sort();
  const objectTypes = ["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"];
  if (
    actualKeys.length !== exactKeys.length ||
    actualKeys.some((key, index) => key !== exactKeys[index]) ||
    typeof record.objectType !== "string" ||
    !objectTypes.includes(record.objectType) ||
    typeof record.text !== "string" || !record.text.trim() || record.text.length > 8_192 ||
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
    const status = error.code === "REQUEST_BODY_TOO_LARGE"
      ? 413
      : error.code === "REQUEST_BODY_NOT_ALLOWED" || error.code === "REQUEST_JSON_INVALID" || error.code === "BACKUP_ID_INVALID" || error.code === "RESTORE_CONFIRMATION_REQUIRED" || error.code === "MATERIALIZATION_REQUEST_INVALID" || error.code === "PRIMARY_ANCHOR_CURSOR_INVALID" || error.code === "PRIMARY_ANCHOR_OBSERVATION_INVALID" || error.code === "PRIMARY_ANCHOR_REBIND_INVALID" || error.code === "V2_REBIND_CONFIRMATION_REQUIRED"
        ? 400
        : error.code === "V2_PRIMARY_ANCHOR_NOT_FOUND"
          ? 404
          : error.code === "V2_GRAPH_ID_MISMATCH" || error.code === "V2_UNSUPPORTED_DATABASE_SCHEMA" || error.code === "V2_BACKUP_VALIDATION_FAILED"
          ? 422
          : error.code === "V2_BACKUP_DESTINATION_EXISTS" || error.code === "V2_EXTERNAL_PRIMARY_ANCHOR_EXISTS" || error.code === "V2_OBJECT_VERSION_CONFLICT" || error.code === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL" || error.code === "V2_PRIMARY_ANCHOR_CONFLICT" || error.code === "V2_REBIND_TARGET_ALREADY_BOUND" || error.code === "V2_REBIND_PREVIEW_STALE"
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
    if (request.method === "POST" && url.pathname === "/objects/materialize") {
      const input = await readMaterializeRequest(request);
      const idempotencyKey = explicitSyncIdempotencyKey(options.graphId, input);
      const result = await application.materializeExplicitObject({
        objectType: input.objectType,
        text: input.text,
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
      if (after !== undefined && (!after.trim() || after.length > 512)) {
        throw serviceError("PRIMARY_ANCHOR_CURSOR_INVALID", "Primary Anchor 分页游标无效。");
      }
      const page = store.listPrimaryAnchors(options.graphId, after, 257);
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
