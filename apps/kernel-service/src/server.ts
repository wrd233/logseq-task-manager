import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile, chmod } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";

import { DeepSeekDiscoveryExecutor, DeepSeekV4FlashExecutor, DeterministicCurrentFocusAgent, DeterministicEngagementAgent, FakeContextAwareExecutor, FakeDiscoveryExecutor, loadCurrentFocusSkill, loadEngagementReconciliationSkill, loadMiniProjectGovernanceSkill, loadMiniProjectTaste, loadWorkIntentMaintenanceSkill } from "@task-copilot/agent";
import { parseSemanticOperation, type CognitionExecutor, type CurrentFocusAgent, type DiscoveryExecutor, type DiscoveryScope, type EngagementAgent, type ExecutionProfile, type FormalizationCandidate, type GovernanceIssue, type GraphGatewayResponse, type ReconcileJob, type SkillPackage, type SourceChangeObservation, type TasteProfile } from "@task-copilot/contracts";
import { Kernel, KernelError } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";
import { DiscoveryCoordinator } from "./discovery-coordinator.ts";
import { ProjectionCoordinator } from "./projection-coordinator.ts";
import { ExternalAgentCoordinator } from "./external-agent-coordinator.ts";
import { GraphRequestBroker } from "./graph-broker.ts";
import { MaintenanceCoordinator } from "./maintenance-coordinator.ts";

export interface StartKernelOptions { databasePath: string; descriptorPath: string; graphDescriptorPath?: string; token?: string; graphSnapshotKey?: string; graphBridgeToken?: string; userChannelToken?: string; requireTrustedUserChannel?: boolean; now?: () => string; currentFocusAgent?: CurrentFocusAgent; currentFocusSkill?: SkillPackage; engagementAgent?: EngagementAgent; engagementSkill?: SkillPackage; miniProjectSkill?: SkillPackage; workIntentSkill?: SkillPackage; miniProjectTaste?: TasteProfile; workspaceRoot?: string; graphOfflineAfterMs?: number; graphRequestTimeoutMs?: number; projectionMaxAttempts?: number; projectionBackoffBaseMs?: number; projectionTemporaryBackoffMs?: number; cognitionExecutor?: CognitionExecutor; executionProfile?: ExecutionProfile; discoveryExecutor?: DiscoveryExecutor; discoveryProfile?: ExecutionProfile; journalPageNames?: (date: string) => string[] }

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

export async function startKernelServer(options: StartKernelOptions): Promise<{ baseUrl: string; token: string; graphSnapshotKey: string; graphBridgeToken: string; userChannelToken: string; graphDescriptorPath: string; close: () => Promise<void>; store: SqliteStore }> {
  const token = options.token ?? randomBytes(32).toString("hex");
  const graphSnapshotKey = options.graphSnapshotKey ?? randomBytes(32).toString("hex");
  const graphBridgeToken = options.graphBridgeToken ?? randomBytes(32).toString("hex");
  const userChannelToken = options.userChannelToken ?? randomBytes(32).toString("hex");
  const requireTrustedUserChannel = options.requireTrustedUserChannel ?? true;
  const assertTrustedUserChannel = (request: IncomingMessage): void => {
    if (requireTrustedUserChannel && request.headers["x-task-copilot-user-channel"] !== userChannelToken) throw new KernelError("TRUSTED_USER_CHANNEL_REQUIRED", "USER-authorized Formal mutation requires the Plugin USER-channel capability.");
  };
  const graphDescriptorPath = options.graphDescriptorPath ?? join(dirname(options.descriptorPath), "graph-adapter.json");
  await mkdir(dirname(options.databasePath), { recursive: true });
  const store = new SqliteStore(options.databasePath);
  const currentFocusSkill = options.currentFocusSkill ?? await loadCurrentFocusSkill(options.workspaceRoot);
  const engagementSkill = options.engagementSkill ?? await loadEngagementReconciliationSkill(options.workspaceRoot);
  const miniProjectSkill = options.miniProjectSkill ?? await loadMiniProjectGovernanceSkill(options.workspaceRoot);
  const workIntentSkill = options.workIntentSkill ?? await loadWorkIntentMaintenanceSkill(options.workspaceRoot);
  const miniProjectTaste = options.miniProjectTaste ?? await loadMiniProjectTaste(options.workspaceRoot);
  const kernel = new Kernel(store, { ...(options.now ? { now: options.now } : {}), currentFocusAgent: options.currentFocusAgent ?? new DeterministicCurrentFocusAgent(), currentFocusSkill, engagementAgent: options.engagementAgent ?? new DeterministicEngagementAgent(), engagementSkill, miniProjectSkill, workIntentSkill, miniProjectTaste, graphSnapshotKey, ...(options.projectionMaxAttempts ? { projectionMaxAttempts: options.projectionMaxAttempts } : {}), ...(options.projectionBackoffBaseMs ? { projectionBackoffBaseMs: options.projectionBackoffBaseMs } : {}), ...(options.projectionTemporaryBackoffMs ? { projectionTemporaryBackoffMs: options.projectionTemporaryBackoffMs } : {}) });
  const broker = new GraphRequestBroker({ ...(options.now ? { now: options.now } : {}), ...(options.graphOfflineAfterMs ? { offlineAfterMs: options.graphOfflineAfterMs } : {}), ...(options.graphRequestTimeoutMs ? { requestTimeoutMs: options.graphRequestTimeoutMs } : {}) });
  const external = new ExternalAgentCoordinator(kernel, store, broker, options.now);
  const cognitionExecutor = options.cognitionExecutor ?? (process.env.DEEPSEEK_EXECUTOR_ENABLED === "true" ? new DeepSeekV4FlashExecutor() : new FakeContextAwareExecutor());
  const executionProfile = options.executionProfile ?? (process.env.DEEPSEEK_EXECUTOR_ENABLED === "true" ? {
    id: "deepseek-default", executor: "DEEPSEEK" as const, modelAlias: "deepseek-v4-flash", remoteEnabled: true,
    allowedDataScope: ["formal_state", "current_workobject_context"], maxContextItems: 8, maxInputChars: 24_000,
    reasoningEffort: "high" as const, timeoutMs: 30_000, retryBudget: 2, credentialRef: "DEEPSEEK_API_KEY",
  } : { id: "builtin-fake", executor: "FAKE" as const, remoteEnabled: false, allowedDataScope: ["formal_state", "current_workobject_context"], maxContextItems: 12, maxInputChars: 24_000, timeoutMs: 5_000, retryBudget: 2, credentialRef: null });
  const maintenance = new MaintenanceCoordinator(kernel, store, broker, { now: options.now }, cognitionExecutor, executionProfile);
  const discoveryExecutor = options.discoveryExecutor ?? (process.env.DEEPSEEK_EXECUTOR_ENABLED === "true" ? new DeepSeekDiscoveryExecutor() : new FakeDiscoveryExecutor());
  const discoveryProfile = options.discoveryProfile ?? (process.env.DEEPSEEK_EXECUTOR_ENABLED === "true" ? {
    id: "deepseek-discovery-default", executor: "DEEPSEEK" as const, modelAlias: "deepseek-v4-flash", remoteEnabled: true,
    allowedDataScope: ["discovery_today"], maxContextItems: 40, maxInputChars: 24_000,
    reasoningEffort: "high" as const, timeoutMs: 30_000, retryBudget: 2, credentialRef: "DEEPSEEK_API_KEY",
  } : { id: "builtin-fake-discovery", executor: "FAKE" as const, remoteEnabled: false, allowedDataScope: ["discovery_today"], maxContextItems: 40, maxInputChars: 24_000, timeoutMs: 5_000, retryBudget: 1, credentialRef: null });
  const discovery = new DiscoveryCoordinator(kernel, store, broker, maintenance, discoveryExecutor, discoveryProfile, { ...(options.now ? { now: options.now } : {}), ...(options.journalPageNames ? { journalPageNames: options.journalPageNames } : {}) });
  const projections = new ProjectionCoordinator(store, kernel, discovery, maintenance, broker, { ...(options.now ? { now: options.now } : {}) });
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
      if (request.method === "GET" && url.pathname === "/v1/taste") { send(response, 200, { profiles: kernel.tasteProfiles() }); return; }
      const tasteMatch = /^\/v1\/taste\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && tasteMatch) { const profile = kernel.tasteProfiles().find((item) => item.id === decodeURIComponent(tasteMatch[1]!)); if (!profile) throw new KernelError("TASTE_PROFILE_NOT_FOUND", "Taste profile does not exist."); send(response, 200, { profile }); return; }
      if (request.method === "GET" && url.pathname === "/v1/graph/status") { send(response, 200, broker.status()); return; }
      if (request.method === "POST" && url.pathname === "/v1/maintenance/source-change") {
        const value = await body(request) as SourceChangeObservation;
        send(response, 200, maintenance.recordSourceChange(value)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/maintenance/reconcile") {
        const value = await body(request) as { workObjectId: string; priorityClass?: "NORMAL" | "INTERACTIVE" | "SYSTEM_RECOVERY" };
        send(response, 200, { job: maintenance.manualReconcile(value.workObjectId, value.priorityClass) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/maintenance/pause") {
        const value = await body(request) as { scope: "global" | "object"; workObjectId?: string | null; paused: boolean };
        maintenance.setPause(value.scope, value.workObjectId ?? null, value.paused);
        send(response, 200, { paused: maintenance.isPaused(value.scope, value.workObjectId ?? null) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/maintenance/status") {
        const status = url.searchParams.get("status");
        const allowed = new Set<ReconcileJob["status"]>(["QUEUED", "RUNNING", "DONE", "FAILED", "STALE"]);
        const jobs = status && allowed.has(status as ReconcileJob["status"]) ? maintenance.jobs(status as ReconcileJob["status"]) : maintenance.jobs();
        send(response, 200, { globalPaused: maintenance.isPaused("global", null), jobs }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/projections/now") { send(response, 200, projections.now()); return; }
      if (request.method === "GET" && url.pathname === "/v1/projections/confirmations") { send(response, 200, projections.confirmations()); return; }
      if (request.method === "GET" && url.pathname === "/v1/projections/workmap") { send(response, 200, projections.workMap()); return; }
      if (request.method === "GET" && url.pathname === "/v1/projections/system") { send(response, 200, projections.system()); return; }
      if (request.method === "POST" && url.pathname === "/v1/organize/today") {
        const value = await body(request) as { date?: string };
        send(response, 200, await discovery.organizeToday(value)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/discovery/run") {
        const value = await body(request) as { scope: DiscoveryScope; continuationToken?: string | null };
        if (!value.scope || typeof value.scope !== "object" || !("kind" in value.scope)) throw new KernelError("DISCOVERY_SCOPE_INVALID", "Discovery scope is required.");
        send(response, 201, { run: await discovery.runDiscovery(value.scope, { continuationToken: value.continuationToken ?? null }) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/discovery/runs") { send(response, 200, { runs: discovery.listRuns() }); return; }
      const discoveryRunMatch = /^\/v1\/discovery\/runs\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && discoveryRunMatch) {
        const run = discovery.getRun(decodeURIComponent(discoveryRunMatch[1]!));
        if (!run) { send(response, 404, { error: { code: "DISCOVERY_RUN_NOT_FOUND", message: "Discovery run not found." } }); return; }
        send(response, 200, { run, sources: store.listDiscoveryRunSources(run.id) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/candidates") {
        const status = url.searchParams.get("status");
        const allowed = new Set<FormalizationCandidate["status"]>(["OPEN", "MATERIALIZED", "DISMISSED", "EXPIRED"]);
        send(response, 200, { candidates: discovery.listCandidates(status && allowed.has(status as FormalizationCandidate["status"]) ? status as FormalizationCandidate["status"] : undefined) }); return;
      }
      const candidateEvidenceMatch = /^\/v1\/candidates\/([^/]+)\/evidence$/u.exec(url.pathname);
      if (request.method === "GET" && candidateEvidenceMatch) { send(response, 200, { evidence: discovery.listCandidateEvidence(decodeURIComponent(candidateEvidenceMatch[1]!)) }); return; }
      const candidateMatch = /^\/v1\/candidates\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && candidateMatch) {
        const candidate = discovery.getCandidate(decodeURIComponent(candidateMatch[1]!));
        if (!candidate) { send(response, 404, { error: { code: "CANDIDATE_NOT_FOUND", message: "Formalization Candidate not found." } }); return; }
        send(response, 200, { candidate }); return;
      }
      const candidateMature = /^\/v1\/candidates\/([^/]+)\/mature$/u.exec(url.pathname);
      if (request.method === "POST" && candidateMature) { send(response, 201, await discovery.matureCandidate(decodeURIComponent(candidateMature[1]!))); return; }
      const candidateDismiss = /^\/v1\/candidates\/([^/]+)\/dismiss$/u.exec(url.pathname);
      if (request.method === "POST" && candidateDismiss) { send(response, 200, { candidate: discovery.dismissCandidate(decodeURIComponent(candidateDismiss[1]!)) }); return; }
      const candidateAbsorb = /^\/v1\/candidates\/([^/]+)\/absorb$/u.exec(url.pathname);
      if (request.method === "POST" && candidateAbsorb) {
        const value = await body(request) as { targetWorkObjectId: string };
        send(response, 200, { candidate: discovery.absorbCandidate(decodeURIComponent(candidateAbsorb[1]!), value.targetWorkObjectId) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/context") {
        send(response, 200, { associations: kernel.listContextAssociations(url.searchParams.get("object") ?? undefined) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/context/associate") {
        const value = await body(request) as Parameters<Kernel["associateContext"]>[0];
        send(response, 201, { association: kernel.associateContext(value) }); return;
      }
      const contextInvalidate = /^\/v1\/context\/([^/]+)\/invalidate$/u.exec(url.pathname);
      if (request.method === "POST" && contextInvalidate) {
        send(response, 200, { association: kernel.invalidateContextAssociation(decodeURIComponent(contextInvalidate[1]!)) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/context/corrections") {
        const value = await body(request) as Parameters<Kernel["recordAssociationCorrection"]>[0];
        send(response, 201, { correction: kernel.recordAssociationCorrection(value) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/issues") {
        const status = url.searchParams.get("status");
        const allowed = new Set<GovernanceIssue["status"]>(["OPEN", "RESOLVED", "SUPERSEDED"]);
        send(response, 200, { issues: kernel.listGovernanceIssues(url.searchParams.get("object") ?? undefined, status && allowed.has(status as GovernanceIssue["status"]) ? status as GovernanceIssue["status"] : undefined) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/issues") {
        const value = await body(request) as Parameters<Kernel["upsertGovernanceIssue"]>[0];
        send(response, 201, { issue: kernel.upsertGovernanceIssue(value) }); return;
      }
      const issueMatch = /^\/v1\/issues\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && issueMatch) {
        const issue = kernel.listGovernanceIssues().find((item) => item.id === decodeURIComponent(issueMatch[1]!));
        if (!issue) { send(response, 404, { error: { code: "ISSUE_NOT_FOUND", message: "Governance Issue not found." } }); return; }
        send(response, 200, { issue }); return;
      }
      const issueTransition = /^\/v1\/issues\/([^/]+)\/(resolve|supersede)$/u.exec(url.pathname);
      if (request.method === "POST" && issueTransition) {
        const issue = issueTransition[2] === "resolve" ? kernel.resolveGovernanceIssue(decodeURIComponent(issueTransition[1]!)) : kernel.supersedeGovernanceIssue(decodeURIComponent(issueTransition[1]!));
        send(response, 200, { issue }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/decision-packages") {
        const status = url.searchParams.get("status");
        const allowed = new Set(["OPEN", "ACCEPTED", "REJECTED", "STALE"]);
        send(response, 200, { packages: kernel.listDecisionPackages(status && allowed.has(status) ? status as "OPEN" | "ACCEPTED" | "REJECTED" | "STALE" : undefined) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/decision-packages") {
        const value = await body(request) as Parameters<Kernel["createDecisionPackage"]>[0];
        send(response, 201, kernel.createDecisionPackage(value)); return;
      }
      const packageCandidates = /^\/v1\/decision-packages\/([^/]+)\/candidates$/u.exec(url.pathname);
      if (request.method === "GET" && packageCandidates) {
        send(response, 200, { candidates: kernel.listDecisionCandidates(decodeURIComponent(packageCandidates[1]!)) }); return;
      }
      const packageDefer = /^\/v1\/decision-packages\/([^/]+)\/defer$/u.exec(url.pathname);
      if (request.method === "POST" && packageDefer) {
        assertTrustedUserChannel(request);
        send(response, 200, { package: kernel.deferDecisionPackage(decodeURIComponent(packageDefer[1]!)) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/user-events") {
        if (request.headers["x-task-copilot-user-channel"] !== userChannelToken) { send(response, 401, { error: { code: "TRUSTED_USER_CHANNEL_REQUIRED", message: "A Plugin USER-channel capability is required." } }); return; }
        const value = await body(request) as Omit<Parameters<Kernel["recordTrustedUserEvent"]>[0], "sourceChannel">;
        send(response, 201, { event: kernel.recordTrustedUserEvent({ ...value, sourceChannel: "PLUGIN_USER_CHANNEL" }) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/user-decisions/compile") {
        const value = await body(request) as Parameters<Kernel["compileUserDecision"]>[0];
        send(response, 201, kernel.compileUserDecision(value)); return;
      }
      const decisionExecute = /^\/v1\/user-decisions\/([^/]+)\/execute$/u.exec(url.pathname);
      if (request.method === "POST" && decisionExecute) {
        const decisionId = decodeURIComponent(decisionExecute[1]!);
        const decision = kernel.listUserDecisions().find((item) => item.id === decisionId);
        if (decision?.operationType === "CREATE_WORK_OBJECT" && decision.packageId && !(await discovery.validateMaterializationPackage(decision.packageId))) {
          store.transitionDecisionPackage(decision.packageId, "STALE", options.now?.() ?? new Date().toISOString());
          store.updateUserDecisionExecution(decisionId, "STALE", options.now?.() ?? new Date().toISOString(), []);
          send(response, 409, { error: { code: "USER_DECISION_STALE", message: "Candidate source material changed after the package was presented; no CREATE was executed." } }); return;
        }
        const result = kernel.executeUserDecision(decisionId);
        if (result.decision.operationType === "CREATE_WORK_OBJECT" && result.decision.packageId) discovery.markMaterializedByPackage(result.decision.packageId, result.commit.targetId!);
        send(response, 200, result); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/user-decisions") {
        send(response, 200, { decisions: kernel.listUserDecisions(url.searchParams.get("package") ?? undefined) }); return;
      }
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
      if (request.method === "POST" && url.pathname === "/v1/external/curation/add-reference") { send(response, 200, { receipt: await external.addReference(await body(request) as Parameters<ExternalAgentCoordinator["addReference"]>[0]) }); return; }
      if (request.method === "GET" && url.pathname === "/v1/curation-receipts") { send(response, 200, { receipts: store.listCurationReceipts(url.searchParams.get("object") ?? undefined) }); return; }
      if (request.method === "GET" && url.pathname === "/v1/ownerships") { send(response, 200, { ownerships: kernel.listOwnerships() }); return; }
      if (request.method === "POST" && url.pathname === "/v1/ownerships") { send(response, 404, { error: { code: "ROUTE_NOT_FOUND", message: "Ownership changes require a trusted USER decision; no direct ownership mutation route exists." } }); return; }
      if (request.method === "GET" && url.pathname === "/v1/objects") { send(response, 200, { objects: store.listWorkObjects() }); return; }
      if (request.method === "GET" && url.pathname === "/v1/objects/anchors") {
        send(response, 200, { objects: store.listWorkObjects().map((object) => ({ object, anchor: store.getAnchorForWorkObject(object.id) })) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/objects/actionable") { send(response, 200, { objects: store.listActionableWorkObjects() }); return; }
      const viewedMatch = /^\/v1\/objects\/([^/]+)\/viewed$/u.exec(url.pathname);
      if (request.method === "POST" && viewedMatch) {
        assertTrustedUserChannel(request);
        const baseline = kernel.markObjectViewed(decodeURIComponent(viewedMatch[1]!));
        send(response, 200, { baseline }); return;
      }
      const objectContextMatch = /^\/v1\/objects\/([^/]+)\/context$/u.exec(url.pathname);
      if (request.method === "GET" && objectContextMatch) {
        const pack = await projections.objectContext(decodeURIComponent(objectContextMatch[1]!));
        if (!pack) { send(response, 404, { error: { code: "WORK_OBJECT_NOT_FOUND", message: "WorkObject not found." } }); return; }
        send(response, 200, { pack }); return;
      }
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
      if (request.method === "POST" && url.pathname === "/v1/feedback/strong-positive") { assertTrustedUserChannel(request); const value = await body(request) as { commitId: string; actor: { type: "USER"; id: string }; userComment?: string | null }; kernel.recordStrongPositive(value); send(response, 200, { recorded: true }); return; }
      const evidenceMatch = /^\/v1\/evidence\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && url.pathname === "/v1/evidence") {
        send(response, 200, { evidence: kernel.listEvidence(url.searchParams.get("object") ?? undefined) }); return;
      }
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
        send(response, 202, proposal?.revision.operationType === "CHANGE_ENGAGEMENT" ? kernel.applyEngagementProposal({ ...value, proposalId: id }) : proposal?.revision.operationType === "UPDATE_WORK_INTENT" ? kernel.applyWorkIntentProposal({ ...value, proposalId: id }) : kernel.applyProposal({ ...value, proposalId: id })); return;
      }
      const proposalRevisionMatch = /^\/v1\/proposals\/([^/]+)\/revisions$/u.exec(url.pathname);
      if (request.method === "POST" && proposalRevisionMatch) {
        assertTrustedUserChannel(request);
        const value = await body(request) as Omit<Parameters<Kernel["reviseProposal"]>[0], "proposalId">;
        send(response, 201, kernel.reviseProposal({ ...value, proposalId: decodeURIComponent(proposalRevisionMatch[1]!) })); return;
      }
      const proposalDismissMatch = /^\/v1\/proposals\/([^/]+)\/dismiss$/u.exec(url.pathname);
      if (request.method === "POST" && proposalDismissMatch) {
        assertTrustedUserChannel(request);
        const value = await body(request) as { actor: Parameters<Kernel["dismissProposal"]>[0]["actor"] };
        send(response, 200, { proposal: kernel.dismissProposal({ proposalId: decodeURIComponent(proposalDismissMatch[1]!), actor: value.actor }) }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/commits/prepare") {
        assertTrustedUserChannel(request);
        const value = await body(request) as { operation: unknown; snapshot: Parameters<Kernel["prepare"]>[1] };
        send(response, 202, kernel.prepare(parseSemanticOperation(value.operation), value.snapshot)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/commits/commit") {
        assertTrustedUserChannel(request);
        const value = await body(request) as { operation: unknown; snapshot?: Parameters<Kernel["commitFormal"]>[1] };
        send(response, 200, kernel.commitFormal(parseSemanticOperation(value.operation), value.snapshot ?? null)); return;
      }
      const projectionVerifyMatch = /^\/v1\/commits\/([^/]+)\/projection\/verify$/u.exec(url.pathname);
      if (request.method === "POST" && projectionVerifyMatch) {
        assertTrustedUserChannel(request);
        const value = await body(request) as { result: Parameters<Kernel["verifyFormalProjection"]>[1]; snapshot: Parameters<Kernel["verifyFormalProjection"]>[2] };
        send(response, 200, { obligation: kernel.verifyFormalProjection(decodeURIComponent(projectionVerifyMatch[1]!), value.result, value.snapshot) }); return;
      }
      const projectionFailedMatch = /^\/v1\/commits\/([^/]+)\/projection\/failed$/u.exec(url.pathname);
      if (request.method === "POST" && projectionFailedMatch) {
        assertTrustedUserChannel(request);
        const value = await body(request) as { reason: string };
        send(response, 200, { obligation: kernel.graphProjectionFailed(decodeURIComponent(projectionFailedMatch[1]!), value.reason) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/projection-obligations") {
        const status = url.searchParams.get("status");
        const allowed = new Set<NonNullable<Parameters<Kernel["listProjectionObligations"]>[0]>>(["PENDING", "APPLIED", "VERIFIED", "FAILED"]);
        send(response, 200, { obligations: kernel.listProjectionObligations(status && allowed.has(status as never) ? status as never : undefined) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/projection-health") {
        send(response, 200, kernel.projectionHealth()); return;
      }
      const completeMatch = /^\/v1\/commits\/([^/]+)\/complete$/u.exec(url.pathname);
      if (request.method === "POST" && completeMatch) {
        assertTrustedUserChannel(request);
        const value = await body(request) as { result: Parameters<Kernel["complete"]>[1]; snapshot: Parameters<Kernel["complete"]>[2] };
        send(response, 200, { commit: kernel.complete(decodeURIComponent(completeMatch[1]!), value.result, value.snapshot) }); return;
      }
      const failMatch = /^\/v1\/commits\/([^/]+)\/graph-failed$/u.exec(url.pathname);
      if (request.method === "POST" && failMatch) {
        assertTrustedUserChannel(request);
        const value = await body(request) as { reason: string };
        send(response, 200, { commit: kernel.graphApplyFailed(decodeURIComponent(failMatch[1]!), value.reason) }); return;
      }
      const undoMatch = /^\/v1\/commits\/([^/]+)\/undo\/prepare$/u.exec(url.pathname);
      if (request.method === "POST" && undoMatch) {
        assertTrustedUserChannel(request);
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
  maintenance.start();
  const startedAt = (options.now ?? (() => new Date().toISOString()))();
  await writePrivateJson(options.descriptorPath, { schemaVersion: 1, baseUrl, token, pid: process.pid, startedAt });
  await writePrivateJson(graphDescriptorPath, { schemaVersion: 1, baseUrl, token, graphSnapshotKey, graphBridgeToken, userChannelToken, pid: process.pid, startedAt });
  return {
    baseUrl, token, graphSnapshotKey, graphBridgeToken, userChannelToken, graphDescriptorPath, store,
    close: async () => {
      maintenance.stop();
      broker.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      store.close();
      await removeOwnedDescriptor(options.descriptorPath, token); await removeOwnedDescriptor(graphDescriptorPath, token);
    },
  };
}
