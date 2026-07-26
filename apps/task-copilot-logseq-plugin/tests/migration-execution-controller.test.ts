import assert from "node:assert/strict";
import test from "node:test";

import type {
  ServiceLegacyMigrationScanReport,
  ServiceMigrationBatch,
  ServiceMigrationRun,
  ServiceMigrationRunDetails,
} from "@task-copilot/service-client";
import {
  MigrationExecutionController,
  type MigrationExecutionClient,
} from "../src/migration-execution-controller.ts";

const sourceHash = "a".repeat(64);
const runId = "migration-run:private";
const objectId = "legacy-private-object";

function run(status: ServiceMigrationRun["status"] = "PREVIEWED"): ServiceMigrationRun {
  return {
    runId,
    sourceBundleSha256: sourceHash,
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    status,
    summary: { total: 2, import: 1, keepOrdinary: 1, defer: 0, exclude: 0 },
    createdAt: "2026-07-26T08:00:00.000Z",
    updatedAt: "2026-07-26T09:00:00.000Z",
  };
}

function runWithSnapshot(status: ServiceMigrationRun["status"] = "PREVIEWED"): ServiceMigrationRun {
  return {
    ...run(status),
    snapshotBackupId: "backup_20260726110000000_22222222222222222222222222222222",
  };
}

function batch(status: ServiceMigrationBatch["status"] = "IMPORTED"): ServiceMigrationBatch {
  return {
    batchId: "migration-batch:private",
    runId,
    idempotencyKey: "private-key",
    sourceHash,
    status,
    objectIds: [objectId],
    importedCount: 1,
    ...(status === "VERIFIED" ? { validation: { status: "PASS" as const, objectCount: 1, checksum: "private-checksum" } } : {}),
    createdAt: "2026-07-26T09:00:00.000Z",
    updatedAt: "2026-07-26T09:01:00.000Z",
  };
}

function detail(status: ServiceMigrationRun["status"] = "PREVIEWED", batches: ServiceMigrationBatch[] = []): ServiceMigrationRunDetails {
  return {
    run: run(status),
    evidence: [{
      legacyObjectId: objectId,
      decision: { legacyObjectId: objectId, action: "IMPORT", objectType: "TASK", lifecycle: "OPEN", condition: { kind: "ACTIONABLE" } },
    }, {
      legacyObjectId: "keep-private-object",
      decision: { legacyObjectId: "keep-private-object", action: "KEEP_ORDINARY", reviewNote: "保留为普通内容" },
    }],
    batches,
  };
}

function report(hash = sourceHash): ServiceLegacyMigrationScanReport {
  return {
    schemaVersion: 1,
    sourceBundleSha256: hash,
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    status: "SCANNED",
    zeroFormalWrites: true,
    counts: { total: 2, directBind: 1, needsConfirmation: 0, keepOrdinary: 1, structuralError: 0 },
    reviewItems: [{
      legacyObjectId: objectId,
      displayTitle: "准备导入的任务",
      titleTruncated: false,
      sourceObjectType: "TASK",
    }, {
      legacyObjectId: "keep-private-object",
      displayTitle: "保持普通内容",
      titleTruncated: false,
      sourceObjectType: "RESOURCE",
    }],
    previews: [{
      legacyObjectId: objectId,
      sourceBundleSha256: hash,
      classification: "DIRECT_BIND",
      oldPhase: "ACTIVE",
      oldCondition: { kind: "ACTIONABLE" },
      oldSignals: [],
      suggestedObjectType: "TASK",
      suggestedLifecycle: "OPEN",
      suggestedCondition: { kind: "ACTIONABLE" },
      suggestedFocus: null,
      reasonCodes: [],
      evidenceRefs: [],
      informationLoss: [],
      conflicts: [],
      decision: "PENDING_REVIEW",
      rollbackRef: null,
    }, {
      legacyObjectId: "keep-private-object",
      sourceBundleSha256: hash,
      classification: "KEEP_ORDINARY",
      oldPhase: "ACTIVE",
      oldCondition: { kind: "NONE" },
      oldSignals: [],
      suggestedFocus: null,
      reasonCodes: [],
      evidenceRefs: [],
      informationLoss: [],
      conflicts: [],
      decision: "PENDING_REVIEW",
      rollbackRef: null,
    }],
  };
}

function client(overrides: Partial<MigrationExecutionClient> = {}): MigrationExecutionClient & { calls: Array<{ name: string; args: unknown[] }> } {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  return {
    calls,
    async scanLegacyMigration(bundle) {
      calls.push({ name: "scan", args: [bundle] });
      return report();
    },
    async getMigrationRun(id) {
      calls.push({ name: "detail", args: [id] });
      return detail();
    },
    async createBackup() {
      calls.push({ name: "backup", args: [] });
      return {
        backupId: "backup_20260726120000000_11111111111111111111111111111111",
        createdAt: "2026-07-26T12:00:00.000Z",
        validation: { status: "PASS", graphId: "graph", schemaVersion: 12, integrity: "ok", foreignKeyViolations: 0, objectCount: 4 },
      };
    },
    async validateBackup(backupId) {
      calls.push({ name: "validate-backup", args: [backupId] });
      return {
        backupId,
        validation: { status: "PASS", graphId: "graph", schemaVersion: 12, integrity: "ok", foreignKeyViolations: 0, objectCount: 4 },
      };
    },
    async importLegacyMigration(id, input) {
      calls.push({ name: "import", args: [id, input] });
      return { batch: batch(), replayed: false };
    },
    async verifyLegacyMigrationBatch(id, batchId) {
      calls.push({ name: "verify", args: [id, batchId] });
      return batch("VERIFIED");
    },
    async undoLegacyMigrationBatch(id, batchId, confirmation) {
      calls.push({ name: "undo", args: [id, batchId, confirmation] });
      return batch("UNDONE");
    },
    async activateLegacyMigration(id, confirmation) {
      calls.push({ name: "activate", args: [id, confirmation] });
      return { ...run("ACTIVATED"), runId: id };
    },
    ...overrides,
  };
}

async function prepare(controller: MigrationExecutionController, service = client()) {
  const [view] = controller.bindRuns([run()], [detail()]);
  controller.beginMaterial(view!.token);
  await controller.loadMaterial(service, JSON.stringify({ privateBody: "正文" }));
  return { service, view: view!, itemToken: controller.snapshot().items![0]!.token };
}

test("ledger binding exposes opaque run and batch tokens without formal identities or hashes", () => {
  const controller = new MigrationExecutionController(() => "safe-key");
  const views = controller.bindRuns([run("VERIFIED")], [detail("VERIFIED", [batch("VERIFIED")])]);
  assert.equal(views[0]?.token, "migration-plan:1");
  assert.equal(views[0]?.batches[0]?.token, "migration-batch:1");
  assert.doesNotMatch(JSON.stringify(views), /private|a{12,}|checksum|backup_|legacy-/);
});

test("material must match the persisted plan before backup or formal import", async () => {
  const controller = new MigrationExecutionController(() => "safe-key");
  const service = client({
    async scanLegacyMigration() {
      return report("b".repeat(64));
    },
  });
  const [view] = controller.bindRuns([run()], [detail()]);
  controller.beginMaterial(view!.token);
  await assert.rejects(() => controller.loadMaterial(service, JSON.stringify({ privateBody: "正文" })), /不一致/);
  assert.equal(service.calls.some(({ name }) => name === "backup" || name === "import"), false);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private|a{12,}|b{12,}|正文/);
});

test("matching material exposes bounded opaque pending items and creates only a validated recovery point", async () => {
  const controller = new MigrationExecutionController(() => "safe-key");
  const { service, itemToken } = await prepare(controller);
  assert.deepEqual(controller.snapshot().items, [{
    token: "migration-import-item:1",
    title: "准备导入的任务",
    titleTruncated: false,
    sourceObjectType: "TASK",
  }]);
  await assert.rejects(() => controller.createRecoveryPoint(service, []), /1 到 50/);
  await controller.createRecoveryPoint(service, [itemToken]);
  assert.equal(controller.snapshot().status, "ready-to-import");
  assert.equal(controller.snapshot().recoveryPointReady, true);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /backup_|private|a{12,}|safe-key|正文/);
});

test("a later batch reuses and revalidates the migration run recovery baseline", async () => {
  const controller = new MigrationExecutionController(() => "safe-key");
  const service = client({
    async getMigrationRun(id) {
      service.calls.push({ name: "detail", args: [id] });
      return { ...detail(), run: runWithSnapshot() };
    },
  });
  const [view] = controller.bindRuns([runWithSnapshot()], [{ ...detail(), run: runWithSnapshot() }]);
  controller.beginMaterial(view!.token);
  await controller.loadMaterial(service, JSON.stringify({ privateBody: "正文" }));
  const itemToken = controller.snapshot().items![0]!.token;
  assert.equal(controller.snapshot().recoveryPointMode, "REUSED");
  await controller.createRecoveryPoint(service, [itemToken]);
  assert.equal(service.calls.some(({ name }) => name === "backup"), false);
  assert.deepEqual(service.calls.filter(({ name }) => name === "validate-backup"), [{
    name: "validate-backup",
    args: ["backup_20260726110000000_22222222222222222222222222222222"],
  }]);
  assert.equal(controller.snapshot().status, "ready-to-import");
  assert.equal(controller.snapshot().recoveryPointMode, "REUSED");
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /backup_|private|a{12,}|safe-key|正文/);
});

test("import uses one private exact scope and retries uncertain transport with the same idempotency key", async () => {
  let attempt = 0;
  const service = client({
    async importLegacyMigration(id, input) {
      service.calls.push({ name: "import", args: [id, input] });
      attempt += 1;
      if (attempt === 1) throw new Error("response lost with private detail");
      return { batch: batch(), replayed: true };
    },
  });
  const controller = new MigrationExecutionController(() => "stable-safe-key");
  const { itemToken } = await prepare(controller, service);
  await controller.createRecoveryPoint(service, [itemToken]);
  await assert.rejects(() => controller.importBatch(service), /结果尚未确认/);
  assert.equal(controller.snapshot().status, "import-uncertain");
  await controller.importBatch(service);
  const imports = service.calls.filter(({ name }) => name === "import");
  assert.equal(imports.length, 2);
  assert.deepEqual(imports[0]?.args, imports[1]?.args);
  const input = imports[0]?.args[1] as Record<string, unknown>;
  assert.deepEqual(input.objectIds, [objectId]);
  assert.equal(input.confirmation, "IMPORT_REVIEWED_V1_BATCH");
  assert.equal(input.idempotencyKey, "stable-safe-key");
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /stable-safe-key|backup_|private|legacy-|正文/);
});

test("verify and undo route opaque tokens to exact server identities and confirmations", async () => {
  const controller = new MigrationExecutionController(() => "safe-key");
  const service = client();
  const [view] = controller.bindRuns([run("IMPORTING")], [detail("IMPORTING", [batch()])]);
  const batchToken = view!.batches[0]!.token;
  await controller.verify(service, batchToken);
  assert.equal(controller.snapshot().status, "verified");
  controller.prepareUndo(batchToken);
  await controller.undo(service);
  assert.equal(controller.snapshot().status, "undone");
  assert.deepEqual(service.calls.filter(({ name }) => name === "verify" || name === "undo"), [
    { name: "verify", args: [runId, "migration-batch:private"] },
    { name: "undo", args: [runId, "migration-batch:private", "UNDO_MIGRATION_BATCH"] },
  ]);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private|legacy-|a{12,}/);
});

test("clear invalidates late material reads and releases all session-private material", async () => {
  let finish: ((value: ServiceLegacyMigrationScanReport) => void) | undefined;
  const service = client({
    scanLegacyMigration() {
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const controller = new MigrationExecutionController(() => "safe-key");
  const [view] = controller.bindRuns([run()], [detail()]);
  controller.beginMaterial(view!.token);
  const loading = controller.loadMaterial(service, JSON.stringify({ privateBody: "正文" }));
  controller.clear();
  finish?.(report());
  await loading;
  assert.deepEqual(controller.snapshot(), { status: "idle" });
  await assert.rejects(() => controller.createRecoveryPoint(service, ["migration-import-item:1"]), /失效/);
});

test("activation requires a ledger token, exact confirmation, and safely retries an uncertain response", async () => {
  let attempt = 0;
  const service = client({
    async activateLegacyMigration(id, confirmation) {
      service.calls.push({ name: "activate", args: [id, confirmation] });
      attempt += 1;
      if (attempt === 1) throw new Error("private response lost");
      return { ...run("ACTIVATED"), runId: id };
    },
  });
  const controller = new MigrationExecutionController(() => "safe-key");
  const [view] = controller.bindRuns([run("VERIFIED")], [detail("VERIFIED", [batch("VERIFIED")])]);
  controller.prepareActivation(view!.token);
  assert.equal(controller.snapshot().status, "activation-confirm");
  await assert.rejects(() => controller.activate(service), /结果尚未确认/);
  assert.equal(controller.snapshot().status, "activation-uncertain");
  await controller.activate(service);
  assert.equal(controller.snapshot().status, "activated");
  assert.deepEqual(service.calls.filter(({ name }) => name === "activate"), [
    { name: "activate", args: [runId, "ACTIVATE_V2_SQLITE"] },
    { name: "activate", args: [runId, "ACTIVATE_V2_SQLITE"] },
  ]);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private|migration-run:|a{12,}/);
});
