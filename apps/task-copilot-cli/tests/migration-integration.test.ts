import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createEmptyState } from "@task-copilot/application";
import { createManagedObject } from "@task-copilot/domain";
import { exportRecoveryBundle } from "@task-copilot/persistence";
import { LocalServiceClient, type ServiceDescriptor } from "@task-copilot/service-client";
import { startLocalService } from "../../task-copilot-local-service/src/service.ts";

import { runCli, type CliIo } from "../src/cli.ts";

test("CLI completes one copied-data migration through the real Local Service", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-cli-migration-"));
  const options = { databasePath: join(root, "task-copilot.db"), backupRoot: join(root, "backups"), graphId: "graph-cli-migration", token: "cli-migration-integration-token-24-chars" };
  let service = await startLocalService(options);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let descriptor: ServiceDescriptor = { protocolVersion: 1, url: service.url, token: service.token, pid: process.pid, createdAt: "2026-07-21T08:00:00.000Z" };
  let client = new LocalServiceClient(descriptor);
  const legacy = createManagedObject({ objectId: "legacy-cli-task", objectType: "TASK", text: "CLI 迁移闭环" }, new Date("2026-07-20T08:00:00.000Z"));
  const bundle = exportRecoveryBundle({ ...createEmptyState(), objects: [{ ...legacy, phase: "ACTIVE", condition: { kind: "ACTIONABLE" } }] }, new Date("2026-07-21T08:00:00.000Z"));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo = { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) };
  const dependencies = {
    descriptorPath: "/runtime/service.json",
    loadService: async () => client,
    loadMigrationBundle: async (path: string) => path === "decisions.json" ? [{ legacyObjectId: "legacy-cli-task", action: "IMPORT" }] : path === "batch.json" ? { objectIds: ["legacy-cli-task"], idempotencyKey: "cli-batch-1" } : bundle,
  };
  assert.equal(await runCli(["--json", "backup", "create"], dependencies, io), 0);
  const backupId = (JSON.parse(stdout.at(-1) ?? "") as { data: { backupId: string } }).data.backupId;
  assert.equal(await runCli(["--json", "migration", "preview", "bundle.json", "--decisions", "decisions.json"], dependencies, io), 0);
  const runId = (JSON.parse(stdout.at(-1) ?? "") as { data: { run: { runId: string } } }).data.run.runId;
  assert.equal(await runCli(["--json", "migration", "import", runId, "--bundle", "bundle.json", "--batch", "batch.json", "--backup", backupId, "--confirm", "IMPORT_REVIEWED_V1_BATCH"], dependencies, io), 0);
  const batchId = (JSON.parse(stdout.at(-1) ?? "") as { data: { batch: { batchId: string } } }).data.batch.batchId;
  await service.close();
  service = await startLocalService(options);
  descriptor = { ...descriptor, url: service.url, token: service.token, createdAt: "2026-07-21T09:00:00.000Z" };
  client = new LocalServiceClient(descriptor);
  assert.equal(await runCli(["--json", "migration", "show", runId], dependencies, io), 0);
  assert.equal((JSON.parse(stdout.at(-1) ?? "") as { data: { run: { status: string } } }).data.run.status, "IMPORTING");
  assert.equal(await runCli(["--json", "migration", "verify", runId, "--batch", batchId], dependencies, io), 0);
  assert.equal(await runCli(["--json", "migration", "activate", runId, "--confirm", "ACTIVATE_V2_SQLITE"], dependencies, io), 0);
  assert.equal((await client.getObject("legacy-cli-task"))?.text, "CLI 迁移闭环");
  assert.deepEqual(stderr, []);
});
