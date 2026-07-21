import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDoctor, ServiceStatus, ServiceStoredProposal } from "@task-copilot/service-client";
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
  const proposalRecord: ServiceStoredProposal = {
    proposal: {
      proposalId: "proposal-cli-1", schemaVersion: "v2", title: "整理当前块", context: "当前块", understanding: "需要整理", objective: "形成任务", logic: "保留原意", finalPreview: "TODO 整理当前块", unresolvedQuestions: [],
      source: { kind: "external_agent" }, scope: { read: [{ kind: "BLOCK", id: "block-1", hash: "11111111" }], modify: [{ kind: "BLOCK", id: "block-1", hash: "11111111" }] }, preconditions: [], groups: [], status: "READY", createdAt: "2026-07-21T08:00:00.000Z",
    },
    files: { proposalMd: "# Proposal", proposalJson: "{}" },
    updatedAt: "2026-07-21T08:00:00.000Z",
  };
  return {
    service: {
      status: async () => status,
      doctor: async () => doctor,
      listObjects: async () => [],
      getObject: async () => undefined,
      listProposals: async () => [],
      getProposal: async () => undefined,
      validateProposal: async () => ({ status: "VALID", proposal: proposalRecord.proposal, files: proposalRecord.files }),
      submitProposal: async () => ({ record: proposalRecord, replayed: false }),
      listSkills: async () => [],
      getSkill: async () => undefined,
      exportContext: async (scope, id) => ({
        fingerprint: "f".repeat(64),
        contextPackage: {
          manifest: { schemaVersion: 1, generatedAt: "2026-07-21T08:00:00.000Z", scope: { kind: scope, id }, authority: "READ_ONLY_DERIVATIVE", formalFactsSource: "SQLITE", graphExcerptStatus: "NOT_AVAILABLE_IN_LOCAL_SERVICE", includedObjectCount: 1, files: [] },
          files: {},
        },
      }),
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

test("CLI lists and shows the shared Local Service Proposal review queue", async () => {
  const listed = fixture();
  const record = (await listed.service.validateProposal({}));
  const stored: ServiceStoredProposal = { proposal: record.proposal, files: record.files, updatedAt: "2026-07-21T08:00:00.000Z" };
  listed.service.listProposals = async () => [stored];
  listed.service.getProposal = async (proposalId) => proposalId === stored.proposal.proposalId ? stored : undefined;
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => listed.service };

  assert.equal(await runCli(["proposal", "list"], dependencies, listed.io), 0);
  assert.match(listed.stdout.at(-1) ?? "", /proposal-cli-1\tREADY/);
  assert.equal(await runCli(["--json", "proposal", "show", "proposal-cli-1"], dependencies, listed.io), 0);
  const shown = JSON.parse(listed.stdout.at(-1) ?? "") as { data: { record: ServiceStoredProposal } };
  assert.equal(shown.data.record.proposal.title, "整理当前块");
  assert.equal(await runCli(["proposal", "show", "missing"], dependencies, listed.io), 6);
});

test("CLI validates and submits external Proposal files without exposing a commit/apply path", async () => {
  const value = fixture();
  let submitted = 0;
  value.service.submitProposal = async (proposal) => {
    submitted += 1;
    assert.deepEqual(proposal, { proposalId: "external" });
    const validated = await value.service.validateProposal(proposal);
    return { record: { proposal: validated.proposal, files: validated.files, updatedAt: "2026-07-21T08:00:00.000Z" }, replayed: false };
  };
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => value.service, loadProposal: async () => ({ proposalId: "external" }) };

  assert.equal(await runCli(["--json", "proposal", "validate", "/tmp/proposal.json"], dependencies, value.io), 0);
  const validated = JSON.parse(value.stdout.at(-1) ?? "") as { data: { effects: { proposalStored: boolean; formalWritesExecuted: boolean } } };
  assert.deepEqual(validated.data.effects, { proposalStored: false, formalWritesExecuted: false });
  assert.equal(submitted, 0);

  assert.equal(await runCli(["--json", "proposal", "submit", "/tmp/proposal.json"], dependencies, value.io), 0);
  const submittedOutput = JSON.parse(value.stdout.at(-1) ?? "") as { data: { effects: { proposalStored: boolean; formalWritesExecuted: boolean } } };
  assert.deepEqual(submittedOutput.data.effects, { proposalStored: true, formalWritesExecuted: false });
  assert.equal(submitted, 1);
  assert.equal(await runCli(["proposal", "commit", "proposal-cli-1"], dependencies, value.io), 2);
  assert.equal(await runCli(["proposal", "apply", "proposal-cli-1"], dependencies, value.io), 2);
});

test("CLI rejects unreadable Proposal input before any validate or submit request", async () => {
  let requests = 0;
  const value = fixture({
    validateProposal: async () => { requests += 1; throw new Error("not reached"); },
    submitProposal: async () => { requests += 1; throw new Error("not reached"); },
  });
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => value.service, loadProposal: async () => { throw new Error("Proposal input is not valid JSON"); } };
  assert.equal(await runCli(["proposal", "validate", "bad.json"], dependencies, value.io), 2);
  assert.equal(await runCli(["proposal", "submit", "bad.json"], dependencies, value.io), 2);
  assert.equal(requests, 0);
  assert.match(value.stderr.at(-1) ?? "", /not valid JSON/);
});

test("CLI lists and shows versioned Skill content from Local Service", async () => {
  const value = fixture({
    listSkills: async () => [{ name: "task-copilot-core", version: "1.0.0", description: "Safe authority boundary", sha256: "a".repeat(64) }],
    getSkill: async (name) => name === "task-copilot-core" ? { name, version: "1.0.0", description: "Safe authority boundary", sha256: "a".repeat(64), content: "# Task Copilot Core" } : undefined,
  });
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => value.service };
  assert.equal(await runCli(["skill", "list"], dependencies, value.io), 0);
  assert.match(value.stdout.at(-1) ?? "", /task-copilot-core\t1\.0\.0/);
  assert.equal(await runCli(["--json", "skill", "show", "task-copilot-core"], dependencies, value.io), 0);
  const shown = JSON.parse(value.stdout.at(-1) ?? "") as { data: { skill: { content: string } } };
  assert.equal(shown.data.skill.content, "# Task Copilot Core");
  assert.equal(await runCli(["skill", "show", "missing"], dependencies, value.io), 6);
});

test("CLI context export requires a matching bounded scope and delegates verified package output", async () => {
  const value = fixture();
  let written: { path: string; fingerprint: string } | undefined;
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => value.service, writeContextPackage: async (path: string, result: { fingerprint: string }) => { written = { path, fingerprint: result.fingerprint }; } };
  assert.equal(await runCli(["--json", "context", "export", "--scope", "object", "--object", "object-1", "--out", "/tmp/context-1"], dependencies, value.io), 0);
  assert.deepEqual(written, { path: "/tmp/context-1", fingerprint: "f".repeat(64) });
  const output = JSON.parse(value.stdout.at(-1) ?? "") as { data: { manifest: { authority: string } } };
  assert.equal(output.data.manifest.authority, "READ_ONLY_DERIVATIVE");
  assert.equal(await runCli(["context", "export", "--scope", "project", "--object", "object-1", "--out", "/tmp/context-2"], dependencies, value.io), 2);
  assert.equal(await runCli(["context", "export", "--scope", "page", "--out", "/tmp/context-3"], dependencies, value.io), 2);
});
