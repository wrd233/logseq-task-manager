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
    databaseSchemaVersion: 1,
    objectCount: 0,
  };
  const doctor: ServiceDoctor = { status: "PASS", schemaVersion: 1, integrity: "ok", foreignKeyViolations: 0, objectCount: 0 };
  return {
    service: {
      status: async () => status,
      doctor: async () => doctor,
      listObjects: async () => [],
      getObject: async () => undefined,
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
  const value = fixture({ doctor: async () => ({ status: "FAIL", schemaVersion: 1, integrity: "corrupt", foreignKeyViolations: 0, objectCount: 0 }) });
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
