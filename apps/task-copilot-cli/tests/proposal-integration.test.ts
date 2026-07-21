import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { V2Proposal } from "@task-copilot/domain";
import { LocalServiceClient, type ServiceDescriptor } from "@task-copilot/service-client";
import { checksum } from "@task-copilot/shared";
import { startLocalService } from "../../task-copilot-local-service/src/service.ts";

import { runCli, type CliIo } from "../src/cli.ts";
import { loadProposalFile } from "../src/proposal-file.ts";

test("external Proposal validate and submit cross the real Local Service while formal state remains unchanged", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-cli-proposal-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-cli-proposal",
    token: "cli-proposal-integration-token-24-chars",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const descriptor: ServiceDescriptor = {
    protocolVersion: 1,
    url: service.url,
    token: service.token,
    pid: process.pid,
    createdAt: "2026-07-21T08:00:00.000Z",
  };
  const client = new LocalServiceClient(descriptor);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo = { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) };
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => client, loadProposal: loadProposalFile };
  const proposalPath = join(import.meta.dirname, "fixtures", "external-proposal.json");

  assert.equal(await runCli(["--json", "proposal", "validate", proposalPath], dependencies, io), 0);
  assert.equal((await client.listProposals()).length, 0, "validate must not persist a Proposal");
  assert.equal((await client.status()).objectCount, 0);
  assert.equal((await client.listSemanticCommits()).length, 0);

  assert.equal(await runCli(["--json", "proposal", "submit", proposalPath], dependencies, io), 0);
  const submitted = JSON.parse(stdout.at(-1) ?? "") as { data: { record: { proposal: { proposalId: string; status: string } }; effects: { formalWritesExecuted: boolean } } };
  assert.equal(submitted.data.record.proposal.proposalId, "proposal_cli_external_1");
  assert.equal(submitted.data.record.proposal.status, "READY");
  assert.equal(submitted.data.effects.formalWritesExecuted, false);
  assert.equal((await client.listProposals()).length, 1, "submit enters the shared review queue");
  assert.equal((await client.status()).objectCount, 0, "submit does not create a formal object");
  assert.equal((await client.listSemanticCommits()).length, 0, "submit does not create a SemanticCommit");
  assert.deepEqual(stderr, []);
});

test("external Agent Project Closure file reaches Review through CLI without completing the Project", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-cli-project-closure-"));
  const service = await startLocalService({
    databasePath: join(root, "task-copilot.db"),
    graphId: "graph-cli-project-closure",
    token: "cli-project-closure-token-24-chars",
  });
  t.after(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  const client = new LocalServiceClient({ protocolVersion: 1, url: service.url, token: service.token, pid: process.pid, createdAt: "2026-07-21T08:00:00.000Z" });
  const intent = await client.prepareProject({ name: "CLI Closure", traceId: "trace-cli-closure-create" });
  const created = await client.finalizeProject({
    semanticCommitId: intent.semanticCommitId, objectId: intent.objectId, name: "CLI Closure", pageExternalId: "page-cli-closure",
    pageContentHash: checksum("Project/CLI Closure"), traceId: "trace-cli-closure-finalize",
  });
  const closure = {
    originalGoal: "使 CLI Closure 项目形成可追溯结果。", actualResult: "主要交付已完成。", majorDeliverables: ["可追溯报告"],
    incompleteObjectives: [{ objective: "次要自动化", reason: "现有数据不足", nextStep: "转入后续 Project" }],
    legacyDisposition: "后续 Project 承接次要自动化。", keyDecisions: ["保留人工校验"], futureSummary: "重入时先检查数据完整性。",
  };
  const proposal: V2Proposal = {
    proposalId: "proposal_cli_project_closure_1", schemaVersion: "v2", title: "完成 CLI Closure Project", context: "主要交付已完成。", understanding: "次要自动化有明确承接。", objective: "形成 Closure 并完成 Project。", logic: "Closure 与 Lifecycle 同组审阅。", finalPreview: "主要交付完成，次要自动化转移。", unresolvedQuestions: [],
    source: { kind: "external_agent", skillVersion: "design-project@1" },
    scope: { read: [{ kind: "PAGE", id: "Project/CLI Closure", hash: checksum("cli-project-closure-context") }], modify: [{ kind: "OBJECT", id: created.object.objectId, version: created.object.version }] },
    preconditions: ["Project 仍为 OPEN"],
    groups: [{ groupId: "close-project", explanation: "Closure 与完成不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: [
      { operationId: "record-closure", kind: "UPDATE_PROJECT_INTERFACE", target: { kind: "OBJECT", id: created.object.objectId, version: created.object.version }, summary: "记录 Closure", payload: { closure }, preconditions: [] },
      { operationId: "complete-project", kind: "TRANSITION_LIFECYCLE", target: { kind: "OBJECT", id: created.object.objectId, version: created.object.version }, summary: "完成 Project", payload: { lifecycle: "COMPLETED" }, preconditions: [] },
    ], disposition: "PENDING" }],
    status: "READY", createdAt: "2026-07-21T12:30:00.000Z",
  };
  const proposalPath = join(root, "project-closure-proposal.json");
  await writeFile(proposalPath, `${JSON.stringify(proposal)}\n`, { encoding: "utf8", mode: 0o600 });
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo = { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) };
  const dependencies = { descriptorPath: "/runtime/service.json", loadService: async () => client, loadProposal: loadProposalFile };
  const commitsBefore = (await client.listSemanticCommits()).length;

  assert.equal(await runCli(["--json", "object", "list", "--type", "project", "--lifecycle", "open"], dependencies, io), 0);
  assert.deepEqual((JSON.parse(stdout.at(-1) ?? "") as { data: { objects: Array<{ objectId: string }> } }).data.objects.map(({ objectId }) => objectId), [created.object.objectId]);
  assert.equal(await runCli(["--json", "object", "search", "closure", "--type", "project"], dependencies, io), 0);
  assert.deepEqual((JSON.parse(stdout.at(-1) ?? "") as { data: { objects: Array<{ objectId: string }> } }).data.objects.map(({ objectId }) => objectId), [created.object.objectId]);

  assert.equal(await runCli(["--json", "proposal", "validate", proposalPath], dependencies, io), 0);
  assert.equal((await client.listProposals()).length, 0);
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN");
  assert.equal(await runCli(["--json", "proposal", "submit", proposalPath], dependencies, io), 0);
  const submitted = (await client.listProposals())[0];
  assert.equal(submitted?.proposal.proposalId, proposal.proposalId);
  assert.equal(submitted?.proposal.source.kind, "external_agent");
  assert.equal(submitted?.proposal.status, "READY");
  assert.equal((await client.getObject(created.object.objectId))?.lifecycle, "OPEN", "CLI submit cannot complete the Project");
  assert.equal((await client.listSemanticCommits()).length, commitsBefore, "CLI submit creates no Commit");
  assert.deepEqual(stderr, []);
});
