import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile, chmod } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";

import { DeterministicCurrentFocusAgent, DeterministicEngagementAgent, loadCurrentFocusSkill, loadEngagementReconciliationSkill } from "@task-copilot/agent";
import { parseSemanticOperation, type CurrentFocusAgent, type EngagementAgent, type GraphGatewayResponse, type SkillPackage } from "@task-copilot/contracts";
import { Kernel, KernelError } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { ExternalAgentCoordinator } from "./external-agent-coordinator.ts";
import { GraphRequestBroker } from "./graph-broker.ts";

export interface StartKernelOptions { databasePath: string; descriptorPath: string; graphDescriptorPath?: string; token?: string; graphSnapshotKey?: string; graphBridgeToken?: string; now?: () => string; currentFocusAgent?: CurrentFocusAgent; currentFocusSkill?: SkillPackage; engagementAgent?: EngagementAgent; engagementSkill?: SkillPackage; workspaceRoot?: string; graphOfflineAfterMs?: number; graphRequestTimeoutMs?: number }

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new KernelError("JSON_INVALID", "Request body must be valid JSON."); }
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await chmod(temporary, 0o600); await rename(temporary, path);
}

async function removeOwnedDescriptor(path: string, token: string): Promise<void> {
  try { const current = JSON.parse(await readFile(path, "utf8")) as { token?: string }; if (current.token === token) await rm(path); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
}

export async function startKernelServer(options: StartKernelOptions): Promise<{ baseUrl: string; token: string; graphSnapshotKey: string; graphBridgeToken: string; graphDescriptorPath: string; close: () => Promise<void>; store: SqliteStore }> {
  const token = options.token ?? randomBytes(32).toString("hex");
  const graphSnapshotKey = options.graphSnapshotKey ?? randomBytes(32).toString("hex");
  const graphBridgeToken = options.graphBridgeToken ?? randomBytes(32).toString("hex");
  const graphDescriptorPath = options.graphDescriptorPath ?? join(dirname(options.descriptorPath), "graph-adapter.json");
  await mkdir(dirname(options.databasePath), { recursive: true });
  const store = new SqliteStore(options.databasePath);
  const currentFocusSkill = options.currentFocusSkill ?? await loadCurrentFocusSkill(options.workspaceRoot);
  const engagementSkill = options.engagementSkill ?? await loadEngagementReconciliationSkill(options.workspaceRoot);
  const kernel = new Kernel(store, { ...(options.now ? { now: options.now } : {}), currentFocusAgent: options.currentFocusAgent ?? new DeterministicCurrentFocusAgent(), currentFocusSkill, engagementAgent: options.engagementAgent ?? new DeterministicEngagementAgent(), engagementSkill, graphSnapshotKey });
  const broker = new GraphRequestBroker({ ...(options.now ? { now: options.now } : {}), ...(options.graphOfflineAfterMs ? { offlineAfterMs: options.graphOfflineAfterMs } : {}), ...(options.graphRequestTimeoutMs ? { requestTimeoutMs: options.graphRequestTimeoutMs } : {}) });
  const external = new ExternalAgentCoordinator(kernel, store, broker, options.now);
  const server = createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname.startsWith("/v1/graph-adapter/")) {
        if (request.headers["x-task-copilot-graph-bridge"] !== graphBridgeToken) { send(response, 401, { error: { code: "GRAPH_BRIDGE_AUTH_REQUIRED", message: "A valid Graph bridge capability is required." } }); return; }
        if (request.method === "POST" && url.pathname === "/v1/graph-adapter/heartbeat") { const value = await body(request) as { graphId: string }; send(response, 200, { graph: broker.heartbeat(value.graphId) }); return; }
        if (request.method === "POST" && url.pathname === "/v1/graph-adapter/poll") { const value = await body(request) as { graphId: string }; send(response, 200, { request: broker.poll(value.graphId) }); return; }
        const complete = /^\/v1\/graph-adapter\/requests\/([^/]+)\/(complete|fail)$/u.exec(url.pathname);
        if (request.method === "POST" && complete) {
          const value = await body(request) as { graphId: string; response?: GraphGatewayResponse; error?: { code: string; message: string } };
          if (complete[2] === "complete" && value.response) broker.complete(value.graphId, decodeURIComponent(complete[1]!), value.response);
          else if (complete[2] === "fail" && value.error) broker.fail(value.graphId, decodeURIComponent(complete[1]!), value.error.code, value.error.message);
          else throw new KernelError("GRAPH_BRIDGE_RESPONSE_INVALID", "Graph bridge completion payload is invalid.");
          send(response, 200, { accepted: true }); return;
        }
        send(response, 404, { error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }); return;
      }
      if (request.headers.authorization !== `Bearer ${token}`) { send(response, 401, { error: { code: "AUTH_REQUIRED", message: "A valid local capability token is required." } }); return; }
      if (request.method === "GET" && url.pathname === "/v1/status") { send(response, 200, { status: "ok", schemaVersion: store.schemaVersion(), pid: process.pid }); return; }
      if (request.method === "GET" && url.pathname === "/v1/agent/bootstrap") { send(response, 200, external.bootstrap()); return; }
      if (request.method === "GET" && url.pathname === "/v1/skills") { send(response, 200, { skills: external.skills() }); return; }
      const skillMatch = /^\/v1\/skills\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && skillMatch) { send(response, 200, external.skill(decodeURIComponent(skillMatch[1]!))); return; }
      if (request.method === "GET" && url.pathname === "/v1/graph/status") { send(response, 200, broker.status()); return; }
      if (request.method === "POST" && url.pathname === "/v1/graph/search") { const value = await body(request) as { query: string; limit?: number; runId?: string }; send(response, 200, await external.search({ query: value.query, limit: value.limit ?? 20, ...(value.runId ? { runId: value.runId } : {}) })); return; }
      const graphBlock = /^\/v1\/graph\/blocks\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && graphBlock) { send(response, 200, await external.readBlock({ blockUuid: decodeURIComponent(graphBlock[1]!), ...(url.searchParams.get("run") ? { runId: url.searchParams.get("run")! } : {}) })); return; }
      const graphPage = /^\/v1\/graph\/pages\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && graphPage) { send(response, 200, await external.readPage({ pageName: decodeURIComponent(graphPage[1]!), limit: Number(url.searchParams.get("limit") ?? 50), ...(url.searchParams.get("run") ? { runId: url.searchParams.get("run")! } : {}) })); return; }
      if (request.method === "POST" && url.pathname === "/v1/external/evidence/freeze") { const value = await body(request) as { evidenceId: string; workObjectId: string; blockUuid: string }; send(response, 201, { evidence: await external.freezeEvidence(value) }); return; }
      if (request.method === "POST" && url.pathname === "/v1/external/agent-runs/start") { const value = await body(request) as Parameters<ExternalAgentCoordinator["startRun"]>[0]; send(response, 201, { run: await external.startRun(value) }); return; }
      const externalFinish = /^\/v1\/external\/agent-runs\/([^/]+)\/finish$/u.exec(url.pathname);
      if (request.method === "POST" && externalFinish) { const value = await body(request) as { result: unknown }; send(response, 200, external.finishRun({ runId: decodeURIComponent(externalFinish[1]!), result: value.result })); return; }
      const receiptMatch = /^\/v1\/agent-runs\/([^/]+)\/reads$/u.exec(url.pathname);
      if (request.method === "GET" && receiptMatch) { send(response, 200, { receipts: external.readReceipts(decodeURIComponent(receiptMatch[1]!)) }); return; }
      const externalApply = /^\/v1\/external\/proposals\/([^/]+)\/apply$/u.exec(url.pathname);
      if (request.method === "POST" && externalApply) { send(response, 200, await external.applyProposal(decodeURIComponent(externalApply[1]!))); return; }
      if (request.method === "GET" && url.pathname === "/v1/objects") { send(response, 200, { objects: store.listWorkObjects() }); return; }
      if (request.method === "GET" && url.pathname === "/v1/objects/actionable") { send(response, 200, { objects: store.listActionableWorkObjects() }); return; }
      const objectMatch = /^\/v1\/objects\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && objectMatch) {
        const object = store.getWorkObject(decodeURIComponent(objectMatch[1]!));
        if (!object) { send(response, 404, { error: { code: "WORK_OBJECT_NOT_FOUND", message: "WorkObject not found." } }); return; }
        send(response, 200, { object, anchor: store.getAnchorForWorkObject(object.id) }); return;
      }
      const closureMatch = /^\/v1\/objects\/([^/]+)\/closure$/u.exec(url.pathname);
      if (request.method === "GET" && closureMatch) {
        const id = decodeURIComponent(closureMatch[1]!);
        if (!store.getWorkObject(id)) { send(response, 404, { error: { code: "WORK_OBJECT_NOT_FOUND", message: "WorkObject not found." } }); return; }
        send(response, 200, { closure: store.getClosureHistory(id) }); return;
      }
      const commitMatch = /^\/v1\/commits\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && commitMatch) {
        const commit = store.getCommit(decodeURIComponent(commitMatch[1]!));
        if (!commit) { send(response, 404, { error: { code: "COMMIT_NOT_FOUND", message: "Commit not found." } }); return; }
        send(response, 200, { commit }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/recovery") { send(response, 200, { recovery: kernel.recoveryList() }); return; }
      if (request.method === "GET" && url.pathname === "/v1/feedback") { send(response, 200, { feedback: store.listFeedback() }); return; }
      const evidenceMatch = /^\/v1\/evidence\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && evidenceMatch) {
        const evidence = store.getEvidence(decodeURIComponent(evidenceMatch[1]!));
        if (!evidence) { send(response, 404, { error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence not found." } }); return; }
        send(response, 200, { evidence }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/evidence/freeze") {
        const value = await body(request) as Parameters<Kernel["freezeEvidence"]>[0];
        send(response, 201, { evidence: kernel.freezeEvidence(value) }); return;
      }
      const runMatch = /^\/v1\/agent-runs\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && runMatch) {
        const run = store.getAgentRun(decodeURIComponent(runMatch[1]!));
        if (!run) { send(response, 404, { error: { code: "AGENT_RUN_NOT_FOUND", message: "Agent run not found." } }); return; }
        send(response, 200, { run }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/agent-runs/current-focus") {
        const value = await body(request) as Parameters<Kernel["runCurrentFocusAgent"]>[0];
        send(response, 201, await kernel.runCurrentFocusAgent(value)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/agent-runs/engagement") {
        const value = await body(request) as Parameters<Kernel["runEngagementAgent"]>[0];
        send(response, 201, await kernel.runEngagementAgent(value)); return;
      }
      const proposalMatch = /^\/v1\/proposals\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && proposalMatch) {
        const proposal = store.getProposal(decodeURIComponent(proposalMatch[1]!));
        if (!proposal) { send(response, 404, { error: { code: "PROPOSAL_NOT_FOUND", message: "Proposal not found." } }); return; }
        send(response, 200, proposal); return;
      }
      const proposalApplyMatch = /^\/v1\/proposals\/([^/]+)\/apply$/u.exec(url.pathname);
      if (request.method === "POST" && proposalApplyMatch) {
        const value = await body(request) as Omit<Parameters<Kernel["applyProposal"]>[0], "proposalId">;
        const id = decodeURIComponent(proposalApplyMatch[1]!);
        const proposal = store.getProposal(id);
        send(response, 202, proposal?.revision.operationType === "CHANGE_ENGAGEMENT" ? kernel.applyEngagementProposal({ ...value, proposalId: id }) : kernel.applyProposal({ ...value, proposalId: id })); return;
      }
      const proposalRevisionMatch = /^\/v1\/proposals\/([^/]+)\/revisions$/u.exec(url.pathname);
      if (request.method === "POST" && proposalRevisionMatch) {
        const value = await body(request) as Omit<Parameters<Kernel["reviseProposal"]>[0], "proposalId">;
        send(response, 201, kernel.reviseProposal({ ...value, proposalId: decodeURIComponent(proposalRevisionMatch[1]!) })); return;
      }
      const proposalDismissMatch = /^\/v1\/proposals\/([^/]+)\/dismiss$/u.exec(url.pathname);
      if (request.method === "POST" && proposalDismissMatch) {
        const value = await body(request) as { actor: Parameters<Kernel["dismissProposal"]>[0]["actor"] };
        send(response, 200, { proposal: kernel.dismissProposal({ proposalId: decodeURIComponent(proposalDismissMatch[1]!), actor: value.actor }) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/commits/prepare") {
        const value = await body(request) as { operation: unknown; snapshot: Parameters<Kernel["prepare"]>[1] };
        send(response, 202, kernel.prepare(parseSemanticOperation(value.operation), value.snapshot)); return;
      }
      const completeMatch = /^\/v1\/commits\/([^/]+)\/complete$/u.exec(url.pathname);
      if (request.method === "POST" && completeMatch) {
        const value = await body(request) as { result: Parameters<Kernel["complete"]>[1]; snapshot: Parameters<Kernel["complete"]>[2] };
        send(response, 200, { commit: kernel.complete(decodeURIComponent(completeMatch[1]!), value.result, value.snapshot) }); return;
      }
      const failMatch = /^\/v1\/commits\/([^/]+)\/graph-failed$/u.exec(url.pathname);
      if (request.method === "POST" && failMatch) {
        const value = await body(request) as { reason: string };
        send(response, 200, { commit: kernel.graphApplyFailed(decodeURIComponent(failMatch[1]!), value.reason) }); return;
      }
      const undoMatch = /^\/v1\/commits\/([^/]+)\/undo\/prepare$/u.exec(url.pathname);
      if (request.method === "POST" && undoMatch) {
        const value = await body(request) as { operationId: string; actor: Parameters<Kernel["prepareUndo"]>[0]["actor"]; snapshot: Parameters<Kernel["prepareUndo"]>[1] };
        send(response, 202, kernel.prepareUndo({ operationId: value.operationId, actor: value.actor, commitId: decodeURIComponent(undoMatch[1]!) }, value.snapshot)); return;
      }
      const recoveryMatch = /^\/v1\/recovery\/([^/]+)\/(abort|verify)$/u.exec(url.pathname);
      if (request.method === "POST" && recoveryMatch) {
        const commitId = decodeURIComponent(recoveryMatch[1]!);
        if (recoveryMatch[2] === "abort") send(response, 200, { commit: kernel.abortPrepared(commitId) });
        else {
          const value = await body(request) as { snapshot: Parameters<Kernel["verifyRecoveredGraph"]>[1] };
          send(response, 200, { commit: kernel.verifyRecoveredGraph(commitId, value.snapshot) });
        }
        return;
      }
      send(response, 404, { error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } });
    } catch (error) {
      const code = error instanceof KernelError ? error.code : error instanceof Error && "code" in error ? String(error.code) : "INTERNAL_ERROR";
      const message = code === "INTERNAL_ERROR" ? "Internal error." : error instanceof Error ? error.message : "Internal error.";
      send(response, code === "INTERNAL_ERROR" ? 500 : 409, { error: { code, message } });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("KERNEL_ADDRESS_INVALID");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const startedAt = (options.now ?? (() => new Date().toISOString()))();
  await writePrivateJson(options.descriptorPath, { schemaVersion: 1, baseUrl, token, pid: process.pid, startedAt });
  await writePrivateJson(graphDescriptorPath, { schemaVersion: 1, baseUrl, token, graphSnapshotKey, graphBridgeToken, pid: process.pid, startedAt });
  return {
    baseUrl, token, graphSnapshotKey, graphBridgeToken, graphDescriptorPath, store,
    close: async () => {
      broker.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      store.close();
      await removeOwnedDescriptor(options.descriptorPath, token); await removeOwnedDescriptor(graphDescriptorPath, token);
    },
  };
}
