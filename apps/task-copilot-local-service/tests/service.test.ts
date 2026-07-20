import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalServiceClient, type ServiceDescriptor } from "@task-copilot/service-client";
import { V2SqliteStore } from "@task-copilot/persistence/node";
import { checksum } from "@task-copilot/shared";

import { LOCAL_SERVICE_PROTOCOL_VERSION, startLocalService } from "../src/service.ts";

function clientFor(service: { url: string; token: string }): LocalServiceClient {
  const descriptor: ServiceDescriptor = {
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    url: service.url,
    token: service.token,
    pid: process.pid,
    createdAt: "2026-07-20T06:00:00.000Z",
  };
  return new LocalServiceClient(descriptor);
}

test("Local Service is loopback-only, authenticated, and reports one SQLite authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-"));
  let closed = false;
  const service = await startLocalService({
    databasePath: join(root, ".task-copilot", "task-copilot.db"),
    graphId: "graph-service-test",
    token: "test-session-token-at-least-24-characters",
    descriptorPath: join(root, "runtime", "service.json"),
  });
  t.after(async () => {
    if (!closed) await service.close();
    await rm(root, { recursive: true, force: true });
  });
  assert.match(service.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal((await stat(join(root, "runtime", "service.json"))).mode & 0o777, 0o600);
  const unauthorized = await fetch(new URL("health", service.url));
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(await unauthorized.text(), /test-session-token/);

  const headers = { authorization: `Bearer ${service.token}` };
  const health = await fetch(new URL("health", service.url), { headers });
  assert.deepEqual(await health.json(), {
    status: "READY",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    capabilities: { formalWrites: true, migration: false, provider: false, backup: true },
  });
  const status = await fetch(new URL("status", service.url), { headers });
  assert.deepEqual(await status.json(), {
    status: "READY",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    capabilities: { formalWrites: true, migration: false, provider: false, backup: true },
    databaseSchemaVersion: 3,
    objectCount: 0,
  });
  const doctor = await fetch(new URL("doctor", service.url), { method: "POST", headers });
  assert.equal((await doctor.json() as { status: string }).status, "PASS");
  await service.close();
  closed = true;
  await assert.rejects(access(join(root, "runtime", "service.json")));
});
test("Local Service exposes object reads but refuses an unscoped generic write route", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-read-only",
    token: "another-test-session-token-24-chars",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const headers = { authorization: `Bearer ${service.token}` };
  const list = await fetch(new URL("objects", service.url), { headers });
  assert.deepEqual(await list.json(), { objects: [] });
  assert.equal((await fetch(new URL("objects/missing", service.url), { headers })).status, 404);
  const write = await fetch(new URL("objects", service.url), { method: "POST", headers });
  assert.equal(write.status, 404);
});

test("Local Service materializes one explicit Block without accepting Graph, path, or object authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-materialize-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-materialize",
    token: "materialize-service-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  const input = {
    objectType: "TASK" as const,
    text: "核对时间同步来源",
    externalId: "block-materialize",
    inputVersion: "1001",
    contentHash: checksum("[任务] 核对时间同步来源"),
    idempotencyKey: "graph-materialize:block-materialize:first-seen",
    traceId: "trace-materialize",
  };
  const created = await client.materializeExplicitObject(input);
  assert.equal(created.replayed, false);
  assert.equal(created.object.objectType, "TASK");
  assert.equal(created.object.version, 2);
  assert.equal(created.anchor.graphId, "graph-materialize");
  assert.equal(created.anchor.externalId, "block-materialize");
  assert.equal((await client.materializeExplicitObject(input)).replayed, true);
  assert.equal((await client.status()).objectCount, 1);
  assert.deepEqual((await client.listPrimaryAnchors()).anchors.map((anchor) => anchor.externalId), ["block-materialize"]);

  const synchronizedFirst = await client.synchronizeExplicitObject({ ...input, externalId: "block-sync", idempotencyKey: "sync-block:first" });
  assert.equal(synchronizedFirst.operation, "MATERIALIZED");
  assert.equal(synchronizedFirst.object.version, 2);
  assert.equal((await client.synchronizeExplicitObject({ ...input, externalId: "block-sync", idempotencyKey: "sync-block:first-retry" })).replayed, true);
  const synchronizedUpdate = await client.synchronizeExplicitObject({
    ...input,
    text: "核对时间同步来源并保存证据",
    externalId: "block-sync",
    contentHash: checksum("[任务] 核对时间同步来源并保存证据"),
    inputVersion: "1002",
    idempotencyKey: "sync-block:second",
  });
  assert.equal(synchronizedUpdate.operation, "SYNCHRONIZED");
  assert.equal(synchronizedUpdate.object.version, 3);
  assert.equal(synchronizedUpdate.object.text, "核对时间同步来源并保存证据");
  await assert.rejects(() => client.synchronizeExplicitObject({
    ...input,
    objectType: "MINI_PROJECT",
    externalId: "block-sync",
    contentHash: checksum("[MiniProject] 不得静默迁移"),
    inputVersion: "1003",
    idempotencyKey: "sync-block:type-change",
  }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_EXPLICIT_TYPE_CHANGE_REQUIRES_PROPOSAL");
  assert.equal((await client.getObject(synchronizedFirst.object.objectId))?.objectType, "TASK");

  const observedMissing = await client.observePrimaryAnchor({
    anchorId: synchronizedUpdate.anchor.anchorId,
    status: "missing",
    traceId: "trace-anchor-missing",
  });
  assert.equal(observedMissing.anchor.status, "missing");
  assert.equal(observedMissing.object.version, 4);
  assert.equal((await client.observePrimaryAnchor({
    anchorId: synchronizedUpdate.anchor.anchorId,
    status: "missing",
    traceId: "trace-anchor-missing-repeat",
  })).object.version, 4, "an unchanged repeated observation must not inflate object versions");
  assert.equal((await client.listPrimaryAnchors()).anchors.find((anchor) => anchor.anchorId === observedMissing.anchor.anchorId)?.status, "missing");
  const recovered = await client.synchronizeExplicitObject({
    ...input,
    text: "核对时间同步来源并保存证据",
    externalId: "block-sync",
    contentHash: checksum("[任务] 核对时间同步来源并保存证据"),
    inputVersion: "1004",
    idempotencyKey: "sync-block:recover",
  });
  assert.equal(recovered.anchor.status, "active");
  assert.equal(recovered.object.version, 5);

  const unsafe = await fetch(new URL("objects/materialize", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...input, graphId: "caller-graph", objectId: "caller-object", databasePath: "/tmp/caller.db" }),
  });
  assert.equal(unsafe.status, 400);
  assert.equal((await unsafe.json() as { error: { code: string } }).error.code, "MATERIALIZATION_REQUEST_INVALID");
  assert.equal((await client.status()).objectCount, 2);

  const unsafeObservation = await fetch(new URL("anchors/primary/observe", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ anchorId: recovered.anchor.anchorId, status: "missing", traceId: "trace-unsafe", graphId: "caller-graph" }),
  });
  assert.equal(unsafeObservation.status, 400);
  assert.equal((await unsafeObservation.json() as { error: { code: string } }).error.code, "PRIMARY_ANCHOR_OBSERVATION_INVALID");
  const missingObservation = await fetch(new URL("anchors/primary/observe", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ anchorId: "missing-anchor", status: "missing", traceId: "trace-not-found" }),
  });
  assert.equal(missingObservation.status, 404);
  assert.equal((await missingObservation.json() as { error: { code: string } }).error.code, "V2_PRIMARY_ANCHOR_NOT_FOUND");

  const reboundInput = {
    previousAnchorId: recovered.anchor.anchorId,
    previewObjectVersion: recovered.object.version,
    previewAnchorStatus: recovered.anchor.status,
    previewAnchorContentHash: recovered.anchor.contentHash,
    objectType: "TASK" as const,
    text: "新的主正文",
    externalId: "block-rebound",
    inputVersion: "1005",
    contentHash: checksum("[任务] 新的主正文"),
    confirmation: "REBIND_PRIMARY_ANCHOR" as const,
    traceId: "trace-rebind",
  };
  await assert.rejects(() => client.rebindPrimaryAnchor({ ...reboundInput, previewObjectVersion: recovered.object.version - 1 }),
    (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_REBIND_PREVIEW_STALE");
  assert.equal((await client.getObject(recovered.object.objectId))?.version, recovered.object.version);
  const rebound = await client.rebindPrimaryAnchor(reboundInput);
  assert.equal(rebound.object.objectId, recovered.object.objectId);
  assert.equal(rebound.previousAnchor.status, "replaced");
  assert.equal(rebound.anchor.externalId, "block-rebound");
  assert.equal((await client.rebindPrimaryAnchor(reboundInput)).replayed, true);
  assert.equal((await client.listPrimaryAnchors()).anchors.some((anchor) => anchor.anchorId === recovered.anchor.anchorId), false);
  assert.equal((await client.listPrimaryAnchors(undefined, true)).anchors.find((anchor) => anchor.anchorId === recovered.anchor.anchorId)?.status, "replaced");
  const unconfirmedRebind = await fetch(new URL("anchors/primary/rebind", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...reboundInput, confirmation: "yes" }),
  });
  assert.equal(unconfirmedRebind.status, 400);
  assert.equal((await unconfirmedRebind.json() as { error: { code: string } }).error.code, "PRIMARY_ANCHOR_REBIND_INVALID");
  const unsafeRebind = await fetch(new URL("anchors/primary/rebind", service.url), {
    method: "POST",
    headers: { authorization: `Bearer ${service.token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...reboundInput, objectId: rebound.object.objectId, graphId: "caller-graph", expectedVersion: rebound.object.version }),
  });
  assert.equal(unsafeRebind.status, 400);
  assert.equal((await unsafeRebind.json() as { error: { code: string } }).error.code, "PRIMARY_ANCHOR_REBIND_INVALID");
  await assert.rejects(() => client.rebindPrimaryAnchor({
    ...reboundInput,
    previousAnchorId: rebound.anchor.anchorId,
    previewObjectVersion: rebound.object.version,
    previewAnchorStatus: "active",
    previewAnchorContentHash: rebound.anchor.contentHash,
    externalId: "block-materialize",
    inputVersion: "1006",
    traceId: "trace-rebind-bound-target",
  }), (error: unknown) => error instanceof Error && "details" in error && (error as { details?: { remoteCode?: string } }).details?.remoteCode === "V2_REBIND_TARGET_ALREADY_BOUND");
  assert.equal((await client.getObject(rebound.object.objectId))?.version, rebound.object.version);
});

test("same UUID move keeps identity while a copied UUID materializes a distinct object", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-copy-move-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-copy-move",
    token: "copy-move-service-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = clientFor(service);
  const base = {
    objectType: "TASK" as const,
    text: "验证外部推送",
    contentHash: checksum("[任务] 验证外部推送"),
    idempotencyKey: "transport-only",
  };
  const original = await client.synchronizeExplicitObject({
    ...base,
    externalId: "uuid-original",
    inputVersion: "2001",
    traceId: "trace-original",
  });
  assert.equal(original.operation, "MATERIALIZED");

  const moved = await client.synchronizeExplicitObject({
    ...base,
    externalId: "uuid-original",
    inputVersion: "2002",
    traceId: "trace-moved",
  });
  assert.equal(moved.operation, "SYNCHRONIZED");
  assert.equal(moved.object.objectId, original.object.objectId);
  assert.equal(moved.anchor.anchorId, original.anchor.anchorId);

  const copied = await client.synchronizeExplicitObject({
    ...base,
    externalId: "uuid-copy",
    inputVersion: "2003",
    traceId: "trace-copy",
  });
  assert.equal(copied.operation, "MATERIALIZED");
  assert.notEqual(copied.object.objectId, original.object.objectId);
  assert.notEqual(copied.anchor.anchorId, original.anchor.anchorId);
  assert.deepEqual((await client.listPrimaryAnchors()).anchors.map((anchor) => anchor.externalId), ["uuid-copy", "uuid-original"]);
});

test("Backup API creates a private server-named snapshot and validates it read-only", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-backup-"));
  const backupRoot = join(root, ".task-copilot", "backups");
  const service = await startLocalService({
    databasePath: join(root, ".task-copilot", "task-copilot.db"),
    backupRoot,
    graphId: "graph-backup",
    token: "backup-test-session-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });

  const client = clientFor(service);
  const created = await client.createBackup();
  assert.match(created.backupId, /^backup_[0-9]{17}_[0-9a-f]{32}$/);
  assert.equal(created.validation.status, "PASS");
  const backupPath = join(backupRoot, `${created.backupId}.db`);
  assert.equal((await stat(backupRoot)).mode & 0o777, 0o700);
  assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
  const before = await readFile(backupPath);
  assert.deepEqual(await client.validateBackup(created.backupId), {
    backupId: created.backupId,
    validation: created.validation,
  });
  assert.deepEqual(await readFile(backupPath), before, "restore validation must not mutate snapshot bytes");
  assert.equal("path" in created, false, "service must not disclose or accept an arbitrary backup path");
});

test("Backup API rejects request paths, traversal IDs, and corrupt snapshots without leaking internals", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-backup-errors-"));
  const backupRoot = join(root, "backups");
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    backupRoot,
    graphId: "graph-backup-errors",
    token: "backup-error-session-token-24-characters",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const headers = { authorization: `Bearer ${service.token}`, "content-type": "application/json" };
  const attemptedDestination = join(root, "caller-selected.db");
  const arbitraryDestination = await fetch(new URL("backup/create", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ destination: attemptedDestination }),
  });
  assert.equal(arbitraryDestination.status, 400);
  assert.deepEqual(await arbitraryDestination.json(), {
    error: { code: "REQUEST_BODY_NOT_ALLOWED", message: "Backup 创建不接受客户端路径或其他参数。" },
  });
  await assert.rejects(access(attemptedDestination));

  const traversal = await fetch(new URL("backup/restore/validate", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: "../outside" }),
  });
  assert.equal(traversal.status, 400);
  assert.deepEqual(await traversal.json(), {
    error: { code: "BACKUP_ID_INVALID", message: "Backup ID 无效。" },
  });

  const oversized = await fetch(new URL("backup/restore/validate", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: "x".repeat(17 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), {
    error: { code: "REQUEST_BODY_TOO_LARGE", message: "Local Service 请求体超过 16 KiB 限制。" },
  });

  const corruptId = "backup_20260720060000000_00000000000000000000000000000000";
  await writeFile(join(backupRoot, `${corruptId}.db`), "not sqlite");
  const corrupt = await fetch(new URL("backup/restore/validate", service.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: corruptId }),
  });
  assert.equal(corrupt.status, 422);
  const corruptBody = await corrupt.json() as { error: { code: string; message: string }; path?: string; cause?: string };
  assert.equal(corruptBody.error.code, "V2_BACKUP_VALIDATION_FAILED");
  assert.equal("path" in corruptBody, false);
  assert.equal("cause" in corruptBody, false);
  assert.doesNotMatch(JSON.stringify(corruptBody), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Restore Apply requires explicit confirmation, creates a recovery point, restores, and stops Service", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-service-restore-"));
  const databasePath = join(root, ".task-copilot", "task-copilot.db");
  const backupRoot = join(root, ".task-copilot", "backups");
  const descriptorPath = join(root, "runtime", "service.json");
  let first = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore",
    token: "restore-first-session-token-24-characters",
  });
  t.after(async () => {
    await first.close();
    await rm(root, { recursive: true, force: true });
  });
  const snapshot = await clientFor(first).createBackup();
  await first.close();

  const changed = await V2SqliteStore.open(databasePath);
  const occurredAt = "2026-07-20T13:00:00.000Z";
  changed.commitObject({
    object: {
      objectId: "post-snapshot",
      objectType: "TASK",
      version: 1,
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
      text: "快照后必须可回滚",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      sourceOrCreationEvent: "restore-test",
    },
    expectedVersion: 0,
    idempotencyKey: "post-snapshot",
    audit: { traceId: "post-snapshot", actor: "test", command: "create_object", objectId: "post-snapshot", beforeVersion: 0, afterVersion: 1, occurredAt },
  });
  changed.close();

  first = await startLocalService({
    databasePath,
    backupRoot,
    descriptorPath,
    graphId: "graph-restore",
    token: "restore-second-session-token-24-characters",
  });
  const headers = { authorization: `Bearer ${first.token}`, "content-type": "application/json" };
  const unconfirmed = await fetch(new URL("backup/restore/apply", first.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: snapshot.backupId, confirmation: "yes" }),
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal((await unconfirmed.json() as { error: { code: string } }).error.code, "RESTORE_CONFIRMATION_REQUIRED");

  const restored = await clientFor(first).restoreBackup(snapshot.backupId, "RESTORE_AND_STOP_SERVICE");
  assert.equal(restored.status, "RESTORED_SERVICE_STOPPING");
  assert.equal(restored.validation.objectCount, 0);
  assert.match(restored.recoveryBackupId, /^backup_[0-9]{17}_[0-9a-f]{32}$/);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await access(descriptorPath);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      break;
    }
  }
  await assert.rejects(access(descriptorPath));
  await assert.rejects(() => clientFor(first).health());
  assert.equal(V2SqliteStore.validateBackup(join(backupRoot, `${restored.recoveryBackupId}.db`), "graph-restore").objectCount, 1);
  const active = await V2SqliteStore.open(databasePath);
  assert.equal(active.getObject("post-snapshot"), undefined);
  assert.equal(active.doctor().status, "PASS");
  active.close();
});
