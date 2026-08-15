import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/cli.ts";

const client = {
  status: async () => ({ status: "ok" as const, schemaVersion: 1, pid: 42 }),
  agentBootstrap: async () => ({ kernel: { ready: true }, graph: { ready: false, graphId: null, capabilities: [], reason: "GRAPH_ADAPTER_OFFLINE" }, agent: { executorType: "EXTERNAL_CLI" as const, supportedPurposes: [] }, skills: [], forbidden: [] }),
  listSkills: async () => ({ skills: [] }), showSkill: async () => ({ skill: {} as never, resultContract: {} }),
  listTasteProfiles: async () => ({ profiles: [] }), showTasteProfile: async () => ({ profile: {} as never }),
  listObjects: async () => ({ objects: [{ id: "work-01", kind: "TASK" as const, title: "Task", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "now", updatedAt: "now" }] }),
  showObject: async (id: string) => ({ object: { id, kind: "TASK" as const, title: "Task", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "now", updatedAt: "now" }, anchor: null }),
  showClosure: async () => ({ closure: { current: null, completions: [], cancellations: [], amendments: [], reopens: [] } }),
  showCommit: async (id: string) => ({ commit: { id } as never }),
  listRecovery: async () => ({ recovery: [] }),
  graphStatus: async () => ({ available: false, reason: "GRAPH_ADAPTER_OFFLINE" as const, graphId: null, capabilities: [], lastSeenAt: null }),
  graphSearch: async () => ({ matches: [], receipt: null }), graphBlock: async () => ({ block: {} as never, receipt: null }), graphPage: async () => ({ page: {} as never, receipt: null }),
  freezeExternalEvidence: async () => ({ evidence: {} as never }), startExternalAgentRun: async () => ({ run: {} as never }), finishExternalAgentRun: async () => ({ run: {} as never, proposal: null, revision: null }), listAgentRunReads: async () => ({ receipts: [] }), applyExternalProposal: async () => ({ commit: {} as never, recovered: false }),
  showEvidence: async (id: string) => ({ evidence: { id } as never }),
  showAgentRun: async (id: string) => ({ run: { id } as never }),
  showProposal: async (id: string) => ({ proposal: { id } as never, revision: { proposalId: id } as never }),
  listFeedback: async () => ({ feedback: [] }),
  addReferenceCuration: async () => ({ receipt: {} as never }), listCurationReceipts: async () => ({ receipts: [] }),
  listEvidence: async () => ({ evidence: [] }),
  listContextAssociations: async () => ({ associations: [] }), associateContext: async () => ({ association: {} as never }),
  invalidateContextAssociation: async () => ({ association: {} as never }), recordAssociationCorrection: async () => ({ correction: {} as never }),
  listGovernanceIssues: async () => ({ issues: [] }), showGovernanceIssue: async () => ({ issue: {} as never }),
  resolveGovernanceIssue: async () => ({ issue: {} as never }), supersedeGovernanceIssue: async () => ({ issue: {} as never }),
  projectionHealth: async () => ({ backlog: 0, oldestPendingAt: null, retrying: 0, degraded: 0, lastError: null }),
  listProjectionObligations: async () => ({ obligations: [] }),
  maintenanceStatus: async () => ({ globalPaused: false, jobs: [] }),
  setMaintenancePause: async () => ({ paused: true }),
  reconcileMaintenance: async () => ({ job: {} as never }),
  listDecisionPackages: async () => ({ packages: [] }), listDecisionCandidates: async () => ({ candidates: [] }),
  compileUserDecision: async () => ({ kind: "NEEDS_CLARIFICATION" as const, reason: "none" }),
  executeUserDecision: async () => ({ decision: {} as never, commit: {} as never, projectionObligation: {} as never }),
  listUserDecisions: async () => ({ decisions: [] }),
};

test("all reference commands support machine-readable output", async () => {
  for (const args of [["status"], ["object", "list"], ["object", "show", "work-01"], ["closure", "show", "work-01"], ["commit", "show", "commit-01"], ["recovery", "list"], ["evidence", "show", "evidence-01"], ["agent-run", "show", "run-01"], ["proposal", "show", "proposal-01"], ["feedback", "list"]]) {
    const output: string[] = [];
    assert.equal(await runCli([...args, "--json"], client, { out: (line) => output.push(line), err: () => undefined }), 0);
    assert.doesNotThrow(() => JSON.parse(output[0]!));
  }
});

test("unknown commands fail without touching a fallback database", async () => {
  const errors: string[] = [];
  assert.equal(await runCli(["db", "patch"], client, { out: () => undefined, err: (line) => errors.push(line) }), 2);
  assert.match(errors[0]!, /CLI_USAGE/u);
});

test("External Agent commands are JSON-first, non-interactive, and filter objects without a query DSL", async () => {
  for (const args of [
    ["agent", "bootstrap"], ["skill", "list"], ["skill", "show", "current-focus-maintenance"],
    ["graph", "status"], ["graph", "search", "--query", "network"], ["graph", "block", "show", "block"], ["graph", "page", "show", "Page"],
    ["evidence", "freeze", "--object", "work-01", "--block", "block"],
    ["agent-run", "start", "--purpose", "current-focus", "--object", "work-01", "--evidence", "evidence"],
    ["agent-run", "finish", "run", "--result-file", "-"], ["agent-run", "reads", "run"], ["proposal", "apply", "proposal", "--wait"],
  ]) {
    const output: string[] = []; const errors: string[] = [];
    assert.equal(await runCli([...args, "--json"], client, { out: (line) => output.push(line), err: (line) => errors.push(line), readInput: async () => JSON.stringify({ outcome: "NO_PROPOSAL", reasonCode: "NO_FORMAL_CHANGE", rationaleSummary: "none" }) }), 0, `${args.join(" ")}: ${errors.join(" ")}`);
    assert.doesNotThrow(() => JSON.parse(output[0]!));
  }
  const output: string[] = []; await runCli(["object", "list", "--engagement", "WAITING", "--json"], client, { out: (line) => output.push(line), err: () => undefined });
  assert.deepEqual(JSON.parse(output[0]!).objects, []);
});

test("CLI emits stable JSON errors and refuses non-waiting proposal apply", async () => {
  const errors: string[] = [];
  assert.equal(await runCli(["proposal", "apply", "proposal", "--json"], client, { out: () => undefined, err: (line) => errors.push(line) }), 2);
  assert.equal(JSON.parse(errors[0]!).error.code, "CLI_USAGE");
});

test("object filters fail closed instead of silently returning an empty list", async () => {
  const errors: string[] = [];
  assert.equal(await runCli(["object", "list", "--lifecycle", "BOGUS", "--json"], client, { out: () => undefined, err: (line) => errors.push(line) }), 2);
  assert.equal(JSON.parse(errors[0]!).error.code, "CLI_USAGE");
});
