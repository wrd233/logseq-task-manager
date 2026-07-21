import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalServiceClient, type ServiceDescriptor } from "@task-copilot/service-client";
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
