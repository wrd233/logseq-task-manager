import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDoctor, ServiceStatus } from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

import { runCli, type CliIo, type CliService } from "../src/cli.ts";

function fixture(overrides: Partial<CliService> = {}): { service: CliService; io: CliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status: ServiceStatus = {
    status: "READY",
    protocolVersion: 1,
    capabilities: { formalWrites: false, migration: false, provider: false, backup: true },
    databaseSchemaVersion: 3,
    objectCount: 0,
  };
  const doctor: ServiceDoctor = { status: "PASS", schemaVersion: 3, integrity: "ok", foreignKeyViolations: 0, objectCount: 0 };
  return {
    service: {
      status: async () => status,
      doctor: async () => doctor,
      listObjects: async () => [],
      getObject: async () => undefined,
      createBackup: async () => ({ backupId: "backup_20260720130000000_00000000000000000000000000000000", createdAt: "2026-07-20T13:00:00.000Z", validation: doctor }),
      validateBackup: async (backupId) => ({ backupId, validation: doctor }),
      restoreBackup: async (backupId) => ({ status: "RESTORED_SERVICE_STOPPING", backupId, recoveryBackupId: "backup_20260720130100000_11111111111111111111111111111111", validation: doctor }),
      ...overrides,
    },
    io: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
    stdout,
    stderr,
  };
}

test("CLI help and JSON status have stable output and exit codes", async () => {
  const value = fixture();
  assert.equal(await runCli(["help"], { loadService: async () => value.service }, value.io), 0);
  assert.match(value.stdout[0] ?? "", /never opens SQLite directly/);
  value.stdout.length = 0;
  assert.equal(await runCli(["--json", "status"], { descriptorPath: "/runtime/service.json", loadService: async () => value.service }, value.io), 0);
  assert.deepEqual(JSON.parse(value.stdout[0] ?? "") as unknown, {
    schema_version: 1,
    data: await value.service.status(),
  });
});

test("CLI distinguishes usage, missing object, doctor failure, and unavailable service", async () => {
  const value = fixture({ doctor: async () => ({ status: "FAIL", schemaVersion: 3, integrity: "corrupt", foreignKeyViolations: 0, objectCount: 0 }) });
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => value.service };
  assert.equal(await runCli(["unknown"], dependencies, value.io), 2);
  assert.equal(await runCli(["object", "show", "missing"], dependencies, value.io), 6);
  assert.equal(await runCli(["doctor"], dependencies, value.io), 7);

  const unavailable = fixture();
  assert.equal(await runCli(["status"], {
    descriptorPath: "/runtime/service.json",
    loadService: async () => {
      throw new StructuredError({ code: "SERVICE_UNAVAILABLE", message: "offline", ruleRefs: ["D-216"] });
    },
  }, unavailable.io), 4);
  assert.deepEqual(unavailable.stderr, ["offline"]);
});

test("CLI requires an explicit descriptor and never receives a SQLite path", async () => {
  const value = fixture();
  let loadedPath = "";
  assert.equal(await runCli(["status"], { loadService: async (path) => {
    loadedPath = path;
    return value.service;
  } }, value.io), 3);
  assert.equal(loadedPath, "");
  assert.match(value.stderr[0] ?? "", /descriptor/);
});

test("CLI backup restore requires the exact confirmation before dispatch and returns recovery evidence", async () => {
  let restoreCalls = 0;
  const value = fixture({
    restoreBackup: async (backupId, confirmation) => {
      restoreCalls += 1;
      assert.equal(confirmation, "RESTORE_AND_STOP_SERVICE");
      return { status: "RESTORED_SERVICE_STOPPING", backupId, recoveryBackupId: "backup_20260720130100000_11111111111111111111111111111111", validation: await value.service.doctor() };
    },
  });
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => value.service };
  const backupId = "backup_20260720130000000_00000000000000000000000000000000";
  assert.equal(await runCli(["backup", "restore", backupId], dependencies, value.io), 2);
  assert.equal(restoreCalls, 0);
  assert.match(value.stderr.at(-1) ?? "", /No request was sent/);
  assert.equal(await runCli(["--json", "backup", "restore", backupId, "--confirm", "RESTORE_AND_STOP_SERVICE"], dependencies, value.io), 0);
  assert.equal(restoreCalls, 1);
  const output = JSON.parse(value.stdout.at(-1) ?? "") as { data: { recoveryBackupId: string } };
  assert.match(output.data.recoveryBackupId, /^backup_/);
});
