import assert from "node:assert/strict";
import test from "node:test";

import {
  MIGRATION_BUNDLE_MAX_BYTES,
  MigrationScanController,
  type MigrationScanClient,
} from "../src/migration-scan-controller.ts";
import type { ServiceLegacyMigrationScanReport } from "@task-copilot/service-client";

function report(): ServiceLegacyMigrationScanReport {
  return {
    schemaVersion: 1 as const,
    sourceBundleSha256: "a".repeat(64),
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    status: "SCANNED" as const,
    zeroFormalWrites: true as const,
    counts: { total: 1, directBind: 1, needsConfirmation: 0, keepOrdinary: 0, structuralError: 0 },
    reviewItems: [{
      legacyObjectId: "private-object-id",
      displayTitle: "需要审阅的测试事项",
      titleTruncated: false,
      sourceObjectType: "TASK",
    }],
    previews: [{
      legacyObjectId: "private-object-id",
      sourceBundleSha256: "a".repeat(64),
      classification: "DIRECT_BIND" as const,
      oldPhase: "ACTIVE" as const,
      oldCondition: { kind: "ACTIONABLE" as const },
      oldSignals: [],
      suggestedObjectType: "TASK" as const,
      suggestedLifecycle: "OPEN" as const,
      suggestedCondition: { kind: "ACTIONABLE" as const },
      suggestedFocus: null,
      reasonCodes: ["PRIVATE_REASON"],
      evidenceRefs: ["private:evidence"],
      informationLoss: [],
      conflicts: [],
      decision: "PENDING_REVIEW" as const,
      rollbackRef: null,
    }],
  };
}

test("Recovery Bundle scan retains only a session-private source and exposes an identity-free summary", async () => {
  const calls: unknown[] = [];
  const client: MigrationScanClient = {
    async scanLegacyMigration(bundle) {
      calls.push(bundle);
      return report();
    },
  };
  const controller = new MigrationScanController();
  await controller.scan(client, JSON.stringify({ bundleVersion: 1, privateBody: "正文" }));
  assert.equal(calls.length, 1);
  assert.deepEqual(controller.snapshot(), {
    status: "ready",
    counts: { total: 1, directBind: 1, needsConfirmation: 0, keepOrdinary: 0, structuralError: 0 },
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    items: [{
      token: "migration-item:1",
      title: "需要审阅的测试事项",
      titleTruncated: false,
      sourceObjectType: "TASK",
      classification: "DIRECT_BIND",
      oldPhase: "ACTIVE",
      oldConditionKind: "ACTIONABLE",
      suggestedObjectType: "TASK",
      suggestedLifecycle: "OPEN",
      suggestedCondition: { kind: "ACTIONABLE" },
    }],
    previewStatus: "idle",
    decisionsComplete: false,
    message: "只读扫描完成；请逐项确认，尚未创建迁移计划。",
  });
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private-object-id|private:evidence|PRIVATE_REASON|a{12,}|正文/);
});

test("invalid JSON and oversized input fail before the Service and leave no reusable scan result", async () => {
  let calls = 0;
  const client: MigrationScanClient = {
    async scanLegacyMigration() {
      calls += 1;
      return report();
    },
  };
  const controller = new MigrationScanController();
  await assert.rejects(() => controller.scan(client, "{x"), /不是合法/);
  assert.deepEqual(controller.snapshot(), {
    status: "error",
    message: "所选文件不是合法 Recovery Bundle JSON；没有发起扫描。",
  });
  await assert.rejects(() => controller.scan(client, `"${"x".repeat(MIGRATION_BUNDLE_MAX_BYTES)}"`), /大小不在安全范围/);
  assert.equal(calls, 0);
  assert.deepEqual(controller.snapshot(), {
    status: "error",
    message: "所选 Recovery Bundle 大小不在安全范围内；没有读取或保存。",
  });
  controller.rejectInput("请选择 Recovery Bundle JSON 文件；没有读取或保存。");
  assert.deepEqual(controller.snapshot(), {
    status: "error",
    message: "请选择 Recovery Bundle JSON 文件；没有读取或保存。",
  });
});

test("clear invalidates an in-flight scan so a late result cannot cross Graph or session boundaries", async () => {
  let finish: ((value: ReturnType<typeof report>) => void) | undefined;
  const client: MigrationScanClient = {
    scanLegacyMigration() {
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const controller = new MigrationScanController();
  const scanning = controller.scan(client, JSON.stringify({ bundleVersion: 1 }));
  assert.equal(controller.snapshot().status, "loading");
  controller.clear();
  finish?.(report());
  await scanning;
  assert.deepEqual(controller.snapshot(), { status: "idle" });
});

test("Service rejection is user-visible, retryable, never preserves a prior summary, and never exposes remote detail", async () => {
  let fail = false;
  const client: MigrationScanClient = {
    async scanLegacyMigration() {
      if (fail) {
        const error = new Error("objects.jsonl checksum mismatch for private-object-id and aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") as Error & { code: string };
        error.code = "SERVICE_HTTP_ERROR";
        throw error;
      }
      return report();
    },
  };
  const controller = new MigrationScanController();
  const raw = JSON.stringify({ bundleVersion: 1 });
  await controller.scan(client, raw);
  fail = true;
  await assert.rejects(() => controller.scan(client, raw), /暂时无法完成安全检查/);
  assert.deepEqual(controller.snapshot(), {
    status: "error",
    message: "迁移材料暂时无法完成安全检查；没有保存材料，也没有改变正式状态。",
  });
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /objects\.jsonl|checksum|private-object-id|a{12,}/);
});

test("known transport failures map to bounded user recovery messages", async () => {
  for (const [code, expected] of [
    ["SERVICE_TIMEOUT", "等待时间过长"],
    ["SERVICE_UNAVAILABLE", "本地运行环境暂时不可用"],
    ["SERVICE_UNAUTHORIZED", "当前本地连接已失效"],
    ["SERVICE_PROTOCOL_MISMATCH", "暂不兼容"],
    ["SERVICE_RESPONSE_INVALID", "暂不兼容"],
  ] as const) {
    const client: MigrationScanClient = {
      async scanLegacyMigration() {
        const error = new Error("private remote response") as Error & { code: string };
        error.code = code;
        throw error;
      },
    };
    const controller = new MigrationScanController();
    await assert.rejects(() => controller.scan(client, JSON.stringify({ bundleVersion: 1 })), new RegExp(expected));
    assert.match(controller.snapshot().message ?? "", new RegExp(expected));
    assert.doesNotMatch(controller.snapshot().message ?? "", /private remote response/);
  }
});

test("review decisions stay tokenized in the snapshot and create one complete server-owned preview", async () => {
  let previewInput: { bundle: unknown; decisions: unknown[] } | undefined;
  const client: MigrationScanClient = {
    async scanLegacyMigration() {
      return report();
    },
    async previewLegacyMigration(bundle, decisions) {
      previewInput = { bundle, decisions };
      return {
        run: { summary: { total: 1, import: 1, keepOrdinary: 0, defer: 0, exclude: 0 } },
        replayed: false,
      };
    },
  };
  const controller = new MigrationScanController();
  const bundle = { bundleVersion: 1, privateBody: "正文" };
  await controller.scan(client, JSON.stringify(bundle));
  controller.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
  });
  const reviewed = controller.snapshot();
  assert.equal(reviewed.decisionsComplete, true);
  assert.equal(reviewed.items?.[0]?.decision?.action, "IMPORT");
  assert.doesNotMatch(JSON.stringify(reviewed), /private-object-id|privateBody|正文/);
  await controller.createPreview(client);
  assert.deepEqual(previewInput, {
    bundle,
    decisions: [{
      legacyObjectId: "private-object-id",
      action: "IMPORT",
      objectType: "TASK",
      lifecycle: "OPEN",
      condition: { kind: "ACTIONABLE" },
    }],
  });
  assert.deepEqual(controller.snapshot(), {
    status: "idle",
    message: "迁移计划已创建：1 项完成审阅，1 项准备迁移；尚未导入正式对象。",
  });
});

test("non-direct or adjusted review requires a reason and structural conflicts cannot import", async () => {
  const uncertain = report();
  uncertain.previews[0] = {
    ...uncertain.previews[0]!,
    classification: "NEEDS_CONFIRMATION",
  };
  uncertain.counts = { total: 1, directBind: 0, needsConfirmation: 1, keepOrdinary: 0, structuralError: 0 };
  delete uncertain.previews[0]!.suggestedCondition;
  const controller = new MigrationScanController();
  await controller.scan({ async scanLegacyMigration() { return uncertain; } }, JSON.stringify({ bundleVersion: 1 }));
  assert.throws(() => controller.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
  }), /说明判断依据/);
  controller.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    reviewNote: "已确认这是当前可推进事项",
  });
  assert.equal(controller.snapshot().decisionsComplete, true);

  const conflict = report();
  conflict.previews[0] = {
    ...conflict.previews[0]!,
    classification: "STRUCTURAL_ERROR",
    conflicts: ["PRIVATE_CONFLICT"],
  };
  conflict.counts = { total: 1, directBind: 0, needsConfirmation: 0, keepOrdinary: 0, structuralError: 1 };
  const conflictController = new MigrationScanController();
  await conflictController.scan({ async scanLegacyMigration() { return conflict; } }, JSON.stringify({ bundleVersion: 1 }));
  assert.throws(() => conflictController.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    reviewNote: "尝试忽略冲突",
  }), /source before import/);
});

test("preview failure keeps the reviewed session retryable and exposes no Service or bundle detail", async () => {
  const controller = new MigrationScanController();
  await controller.scan({ async scanLegacyMigration() { return report(); } }, JSON.stringify({ bundleVersion: 1, privateBody: "正文" }));
  controller.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
  });
  await assert.rejects(() => controller.createPreview({
    async scanLegacyMigration() {
      return report();
    },
    async previewLegacyMigration() {
      throw new Error("private-object-id objects.jsonl aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    },
  }), /无法确认/);
  const snapshot = controller.snapshot();
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.previewStatus, "uncertain");
  assert.equal(snapshot.decisionsComplete, true);
  assert.equal(snapshot.items?.[0]?.decision?.action, "IMPORT");
  assert.doesNotMatch(JSON.stringify(snapshot), /private-object-id|objects\.jsonl|a{12,}|正文/);
  assert.match(snapshot.message ?? "", /先看下方迁移台账/);
});

test("malformed Service review projections and empty bundles cannot open a migration plan", async () => {
  const malformed = report();
  malformed.reviewItems[0] = {
    ...malformed.reviewItems[0]!,
    displayTitle: "x".repeat(161),
  };
  const malformedController = new MigrationScanController();
  await assert.rejects(
    () => malformedController.scan({ async scanLegacyMigration() { return malformed; } }, JSON.stringify({ bundleVersion: 1 })),
    /暂时无法完成安全检查/,
  );
  assert.deepEqual(malformedController.snapshot(), {
    status: "error",
    message: "迁移材料暂时无法完成安全检查；没有保存材料，也没有改变正式状态。",
  });

  const empty = report();
  empty.counts = { total: 0, directBind: 0, needsConfirmation: 0, keepOrdinary: 0, structuralError: 0 };
  empty.previews = [];
  empty.reviewItems = [];
  const emptyController = new MigrationScanController();
  const client: MigrationScanClient = {
    async scanLegacyMigration() {
      return empty;
    },
    async previewLegacyMigration() {
      throw new Error("must not be reached");
    },
  };
  await emptyController.scan(client, JSON.stringify({ bundleVersion: 1 }));
  assert.equal(emptyController.snapshot().decisionsComplete, false);
  await assert.rejects(() => emptyController.createPreview(client), /没有可审阅/);
});

test("preview loading rejects duplicate requests and decision changes at the controller boundary", async () => {
  let finish: ((value: {
    run: { summary: { total: number; import: number; keepOrdinary: number; defer: number; exclude: number } };
    replayed: boolean;
  }) => void) | undefined;
  const client: MigrationScanClient = {
    async scanLegacyMigration() {
      return report();
    },
    previewLegacyMigration() {
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const controller = new MigrationScanController();
  await controller.scan(client, JSON.stringify({ bundleVersion: 1 }));
  controller.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
  });
  const previewing = controller.createPreview(client);
  assert.equal(controller.snapshot().previewStatus, "loading");
  await assert.rejects(() => controller.createPreview(client), /正在创建/);
  assert.throws(() => controller.saveDecision("migration-item:1", { action: "DEFER", reviewNote: "稍后" }), /正在创建/);
  await assert.rejects(() => controller.scan(client, JSON.stringify({ bundleVersion: 1 })), /正在创建/);
  finish?.({
    run: { summary: { total: 1, import: 1, keepOrdinary: 0, defer: 0, exclude: 0 } },
    replayed: false,
  });
  await previewing;
  assert.equal(controller.snapshot().status, "idle");
});

test("scan and preview summaries must match their actual bounded records", async () => {
  const miscounted = report();
  miscounted.counts = { total: 1, directBind: 0, needsConfirmation: 1, keepOrdinary: 0, structuralError: 0 };
  const scanController = new MigrationScanController();
  await assert.rejects(
    () => scanController.scan({ async scanLegacyMigration() { return miscounted; } }, JSON.stringify({ bundleVersion: 1 })),
    /暂时无法完成安全检查/,
  );
  const privateState = scanController as unknown as {
    selectedReport?: unknown;
    itemIdentities: Map<string, string>;
    decisions: Map<string, unknown>;
  };
  assert.equal(privateState.selectedReport, undefined);
  assert.equal(privateState.itemIdentities.size, 0);
  assert.equal(privateState.decisions.size, 0);

  const previewController = new MigrationScanController();
  await previewController.scan({ async scanLegacyMigration() { return report(); } }, JSON.stringify({ bundleVersion: 1 }));
  previewController.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
  });
  await assert.rejects(() => previewController.createPreview({
    async scanLegacyMigration() {
      return report();
    },
    async previewLegacyMigration() {
      return {
        run: { summary: { total: 2, import: 1, keepOrdinary: 0, defer: 0, exclude: 0 } },
        replayed: false,
      };
    },
  }), /无法确认/);
  assert.equal(previewController.snapshot().previewStatus, "uncertain");
});

test("an unchanged UI-level Condition preserves server-owned precision and blocker identity", async () => {
  const waitingReport = report();
  waitingReport.previews[0] = {
    ...waitingReport.previews[0]!,
    oldCondition: {
      kind: "WAITING",
      waitingFor: "发布窗口",
      expectedResult: "允许上线",
      reviewAt: "2026-07-27T08:15:42.000Z",
      startedAt: "2026-07-26T08:00:00.000Z",
    },
    suggestedCondition: {
      kind: "WAITING",
      waitingFor: "发布窗口",
      expectedResult: "允许上线",
      reviewAt: "2026-07-27T08:15:42.000Z",
    },
  };
  let waitingDecision: unknown;
  const waitingClient: MigrationScanClient = {
    async scanLegacyMigration() {
      return waitingReport;
    },
    async previewLegacyMigration(_bundle, decisions) {
      waitingDecision = decisions[0];
      return {
        run: { summary: { total: 1, import: 1, keepOrdinary: 0, defer: 0, exclude: 0 } },
        replayed: false,
      };
    },
  };
  const waitingController = new MigrationScanController();
  await waitingController.scan(waitingClient, JSON.stringify({ bundleVersion: 1 }));
  waitingController.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: {
      kind: "WAITING",
      waitingFor: "发布窗口",
      expectedResult: "允许上线",
      reviewAt: "2026-07-27T08:15:00.000Z",
    },
  });
  await waitingController.createPreview(waitingClient);
  assert.deepEqual(waitingDecision, {
    legacyObjectId: "private-object-id",
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: {
      kind: "WAITING",
      waitingFor: "发布窗口",
      expectedResult: "允许上线",
      reviewAt: "2026-07-27T08:15:42.000Z",
    },
  });

  const blockedReport = report();
  blockedReport.previews[0] = {
    ...blockedReport.previews[0]!,
    oldCondition: { kind: "BLOCKED", reason: "等待依赖", blockerObjectId: "private-blocker-id" },
    suggestedCondition: { kind: "BLOCKED", reason: "等待依赖", blockerObjectId: "private-blocker-id" },
  };
  let blockedDecision: unknown;
  const blockedClient: MigrationScanClient = {
    async scanLegacyMigration() {
      return blockedReport;
    },
    async previewLegacyMigration(_bundle, decisions) {
      blockedDecision = decisions[0];
      return {
        run: { summary: { total: 1, import: 1, keepOrdinary: 0, defer: 0, exclude: 0 } },
        replayed: false,
      };
    },
  };
  const blockedController = new MigrationScanController();
  await blockedController.scan(blockedClient, JSON.stringify({ bundleVersion: 1 }));
  blockedController.saveDecision("migration-item:1", {
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "BLOCKED", reason: "等待依赖" },
  });
  await blockedController.createPreview(blockedClient);
  assert.deepEqual(blockedDecision, {
    legacyObjectId: "private-object-id",
    action: "IMPORT",
    objectType: "TASK",
    lifecycle: "OPEN",
    condition: { kind: "BLOCKED", reason: "等待依赖", blockerObjectId: "private-blocker-id" },
  });
});
