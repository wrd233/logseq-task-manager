import assert from "node:assert/strict";
import test from "node:test";

import {
  MIGRATION_BUNDLE_MAX_BYTES,
  MigrationScanController,
  type MigrationScanClient,
} from "../src/migration-scan-controller.ts";

function report() {
  return {
    schemaVersion: 1 as const,
    sourceBundleSha256: "a".repeat(64),
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    status: "SCANNED" as const,
    zeroFormalWrites: true as const,
    counts: { total: 5, directBind: 2, needsConfirmation: 1, keepOrdinary: 1, structuralError: 1 },
    previews: [{
      legacyObjectId: "private-object-id",
      sourceBundleSha256: "a".repeat(64),
      classification: "DIRECT_BIND" as const,
      reasonCodes: ["PRIVATE_REASON"],
      evidenceRefs: ["private:evidence"],
      informationLoss: [],
      conflicts: [],
      decision: "PENDING_REVIEW" as const,
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
    counts: { total: 5, directBind: 2, needsConfirmation: 1, keepOrdinary: 1, structuralError: 1 },
    sourceCreatedAt: "2026-07-20T08:00:00.000Z",
    message: "只读扫描完成；尚未创建迁移计划，也没有改变正式状态。",
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

test("Service rejection is user-visible, retryable, and never preserves a prior ready summary", async () => {
  let fail = false;
  const client: MigrationScanClient = {
    async scanLegacyMigration() {
      if (fail) throw new Error("Recovery Bundle 校验失败；扫描已停止。");
      return report();
    },
  };
  const controller = new MigrationScanController();
  const raw = JSON.stringify({ bundleVersion: 1 });
  await controller.scan(client, raw);
  fail = true;
  await assert.rejects(() => controller.scan(client, raw), /校验失败/);
  assert.deepEqual(controller.snapshot(), {
    status: "error",
    message: "Recovery Bundle 校验失败；扫描已停止。",
  });
});
