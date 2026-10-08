import { panels } from "../../workspace/context.ts";
import { markNavigation } from "../../host/panel-host.ts";
import { ClientError, FormalOutcomeUnknownError, type KernelClient } from "@task-copilot/client/browser";
import { buildManagedProjection, projectClosure, parseSemanticOperation, type GraphEffect, type GraphSnapshot, type ManagedProjection, type WorkMapNode, type WorkObject, type FormalCommitResult, type ProjectionObligation, type SemanticOperation, type TrustedGraphEvidenceMaterial } from "@task-copilot/contracts";
import { contextActionsFor, CONTEXT_ACTION_LABELS, type BlockContextActionId, type BlockIdentity } from "../../block-context.ts";
import { blockIdentityCache, type GraphScope } from "../../block-identity.ts";
import { extractTitleFromSourceLine, formatFormalSource, taskMarkerFromContent } from "../../canonical-writing.ts";
import { installFormalMarkerHost, type FormalMarkerHost } from "../../formal-marker-host.ts";
import { type LogseqGraphAdapter } from "../../graph-adapter.ts";
import { logseqBlock } from "../../projection-reader.ts";
import { pluginRuntime } from "../../plugin-runtime.ts";
import { registerOnlineDoneMarkerCommand } from "../../marker-command.ts";
import { readRecoveryVerificationSnapshot } from "../../recovery-verification.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import { clampSidebarWidth, parseSidebarWidth, sidebarLayoutSpec, SIDEBAR_DEFAULT_WIDTH, type SidebarLayoutSpec } from "../../sidebar-layout.ts";
import { requestTextPrompt } from "../../text-prompt.ts";
import { readOptionalPrivateItem } from "../../private-storage.ts";
import { readScopedPrivateItem,writeScopedPrivateItem,PrivateWriteUnconfirmedError } from "../../scoped-private-storage.ts";

const recentCommitKey = "task-copilot-vnext-recent-commit";
const currentWorkObjectKey = "task-copilot-vnext-current-work-object";
const recentEvidenceIdKey = "task-copilot-vnext-recent-evidence-id";
let panelOpen = false;
let panelNavigate: ((objectId: string) => void) | null = null;
let contextMenuRegistrations: Array<() => void> = [];
let contextMenuCategory: string | null = null;
let contextMenuHoverTimer: number | null = null;
let contextMenuHoverUuid: string | null = null;
let blockContextTrackerDispose: (() => void) | null = null;
let formalMarkerHost: FormalMarkerHost | null = null;

let taskUiActive = false;
let taskUiGeneration = 0;
let taskUiDispose: (() => Promise<void>) | null = null;
const descriptor = () => pluginRuntime.descriptor();
const refreshBlockIdentityCache = (api: KernelClient) => pluginRuntime.refreshIdentities(api);
const revalidateBlockIdentity = (api: KernelClient, uuid: string) => pluginRuntime.revalidateIdentity(api, uuid);
const adapterForCurrentGraph = () => pluginRuntime.adapterForCurrentGraph();

// Command state is scoped and writes to one key are serialized, including late SDK writes.
const stateWrites = new Map<string, Promise<void>>();
const commandSession = crypto.randomUUID();
function assertCommandScope(scope: GraphScope): void {
  if (!taskUiActive || !blockIdentityCache.isCurrent(scope)) throw new Error("GRAPH_SCOPE_CHANGED");
}
function scopedKey(key: string, scope: GraphScope): string { return JSON.stringify([key,scope.graphId]); }
const readScoped=(key:string,scope:GraphScope)=>pluginRuntime.inGraph(scope,()=>readScopedPrivateItem(logseq.FileStorage,key,scope.graphId,()=>assertCommandScope(scope)));
const writeScoped=(key:string,text:string,scope:GraphScope)=>pluginRuntime.inGraph(scope,()=>writeScopedPrivateItem(logseq.FileStorage,key,scope.graphId,text,()=>assertCommandScope(scope)));
async function readCommandState(key: string, scope = blockIdentityCache.scope()): Promise<string | null> {
  assertCommandScope(scope);
  const raw = await readScoped(key,scope);
  if (typeof raw === "string" && raw) {
    const state = JSON.parse(raw) as { value: string; session: string; generation: number };
    if (typeof state.value !== "string" || typeof state.session !== "string" || !Number.isSafeInteger(state.generation)) throw new Error("COMMAND_STATE_SHAPE_UNSUPPORTED");
    return state.session === commandSession && state.generation !== scope.generation ? null : state.value;
  }
  if (raw !== null && raw !== undefined && raw !== "") throw new Error("COMMAND_STATE_SHAPE_UNSUPPORTED");
  const legacy = await pluginRuntime.inGraph(scope, () => readOptionalPrivateItem(logseq.FileStorage, key)); // pre-round04 compatibility, validated against the target Graph
  if (legacy !== null && legacy !== undefined && typeof legacy !== "string") throw new Error("COMMAND_STATE_SHAPE_UNSUPPORTED");
  return typeof legacy === "string" ? legacy : null;
}
async function writeCommandState(key: string, value: string, scope = blockIdentityCache.scope()): Promise<void> {
  const path = scopedKey(key, scope), previous = stateWrites.get(path) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    assertCommandScope(scope);
    await writeScoped(key,JSON.stringify({ value, session: commandSession, generation: scope.generation }),scope);
    assertCommandScope(scope);
  });
  stateWrites.set(path, next);
  try { await next; } finally { if (stateWrites.get(path) === next) stateWrites.delete(path); }
}
type FormalSubmission =
  | { kind: "COMMIT"; operation: SemanticOperation; snapshot: GraphSnapshot }
  | { kind: "PROPOSAL"; proposalId: string; operationId: string; snapshot: GraphSnapshot; evidence: ReadonlyArray<{ evidenceId: string } & TrustedGraphEvidenceMaterial> }
  | { kind: "UNDO"; commitId: string; operationId: string; snapshot: GraphSnapshot };
const formalSubmissions = new Map<string, { scope: GraphScope; promise: Promise<FormalCommitResult> }>();
function submitFormal(api: KernelClient, scope: GraphScope, intent: string, submission: FormalSubmission): Promise<FormalCommitResult> {
  const key = scopedKey(intent, scope), existing = formalSubmissions.get(key);
  if (existing) {
    if (existing.scope.generation !== scope.generation) return Promise.reject(new Error("原作用域的正式请求仍在处理中；其回执会按原请求保留。"));
    return existing.promise;
  }
  const promise = submitCapturedFormal(api, scope, intent, submission);
  formalSubmissions.set(key, { scope, promise });
  const clear = () => { if (formalSubmissions.get(key)?.promise === promise) formalSubmissions.delete(key); };
  void promise.then(clear, clear);
  return promise;
}
async function submitCapturedFormal(api: KernelClient, scope: GraphScope, intent: string, submission: FormalSubmission): Promise<FormalCommitResult> {
  const key = `task-copilot-vnext-pending:${intent}`;
  const prior = await readScoped(key,scope);
  const request = typeof prior === "string" && prior ? JSON.parse(prior) as FormalSubmission : submission;
  const operationId = request.kind === "COMMIT" ? request.operation.operationId : request.operationId;
  if (prior) {
    const found = await api.formalReceipt(operationId);
    if (found.receipt) {
      if (blockIdentityCache.isCurrent(scope)) {
        try { await writeScoped(key,"",scope); } catch (error) { console.error("accepted-formal-receipt-storage", found.receipt.commit.id, error); }
      }
      return found.receipt;
    }
    assertCommandScope(scope);
  } else await writeScoped(key,JSON.stringify(request),scope);
  assertCommandScope(scope);
  try {
    const result = request.kind === "COMMIT" ? await api.commitFormal(request.operation, request.snapshot)
      : request.kind === "PROPOSAL" ? await api.applyProposalFormal(request.proposalId, request)
      : await api.undoFormal(request.commitId, { operationId, actor: { type: "USER", id: "local-user" }, snapshot: request.snapshot });
    if (blockIdentityCache.isCurrent(scope)) {
      try { await writeScoped(key,"",scope); } catch (error) { console.error("accepted-formal-receipt-storage", result.commit.id, error); }
    }
    return result;
  } catch (error) {
    if (error instanceof ClientError && error.status > 0 && error.status < 500 && blockIdentityCache.isCurrent(scope)) await writeScoped(key,"",scope);
    throw error;
  }
}
async function resumePendingFormal(api: KernelClient, scope: GraphScope, intent: string): Promise<FormalCommitResult | null> {
  const raw = await readScoped(`task-copilot-vnext-pending:${intent}`,scope);
  return typeof raw === "string" && raw ? submitFormal(api, scope, intent, JSON.parse(raw) as FormalSubmission) : null;
}
function projectionMessage(obligation: ProjectionObligation): string {
  return obligation.status === "VERIFIED" ? "笔记投影已核对。" : obligation.status === "FAILED" ? "正式提交已成功；笔记投影交付失败，恢复后可重试。" : "正式提交已成功；笔记投影待交付，连接恢复后会继续。";
}
async function finishFormal(api: KernelClient, scope: GraphScope, formal: FormalCommitResult): Promise<string> {
  if (!taskUiActive || !blockIdentityCache.isCurrent(scope)) throw new Error(`正式提交已成功（${formal.commit.id}）；Graph 作用域已切换，投影义务已保留。`);
  await rememberFormalState(recentCommitKey, formal.commit.id, scope, formal);
  let obligation = formal.projectionObligation;
  try { obligation = (await api.deliverFormalProjection(formal.commit.id)).obligation; }
  catch (error) { console.error("formal-projection-delivery", error); }
  if (!taskUiActive || !blockIdentityCache.isCurrent(scope)) throw new Error(`正式提交已成功（${formal.commit.id}）；Graph 作用域已切换，投影义务已保留。`);
  void refreshBlockIdentityCache(api);
  return projectionMessage(obligation);
}
async function rememberFormalState(key: string, value: string, scope: GraphScope, formal: FormalCommitResult): Promise<void> {
  try { await writeCommandState(key, value, scope); }
  catch (error) { throw new Error(`正式提交已成功（${formal.commit.id}）；最近记录未更新，投影义务已保留。`, { cause: error }); }
}

async function markRecentAgentChangeStrongPositive(): Promise<void> {
  const { graphId, scope } = await adapterForCurrentGraph();
  const commitId = await readCommandState(recentCommitKey, scope);
  if (typeof commitId !== "string" || !commitId) throw new Error("没有可反馈的最近 Commit。");
  const api = await client(), commit = (await api.showCommit(commitId)).commit;
  assertCommandScope(scope);
  if ((commit.graphEffect as GraphEffect | null)?.graphId !== graphId) throw new Error("当前 Graph 不是最近提交的 Graph。");
  await api.recordStrongPositive(commitId, { type: "USER", id: "local-user" });
  if (!blockIdentityCache.isCurrent(scope)) throw new Error("已记录认可反馈；Graph 作用域已切换。");
  await logseq.UI.showMsg("已记录明确正向反馈；不会自动修改或激活 Taste。", "success");
}


async function client(): Promise<KernelClient> { return pluginRuntime.client(); }

interface AnchorView {
  graphId: string;
  externalId: string;
  projectionContainerUuid: string;
  projectionTitleUuid: string;
  projectionStateUuid: string;
  projectionFocusUuid: string;
  projectionWaitingUuid: string;
  projectionOutcomeUuid: string;
  projectionCompletionUuid: string;
}

interface TargetView { object: WorkObject; anchor: unknown }

async function expectedProjection(api: KernelClient, target: TargetView): Promise<ManagedProjection> {
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  const current = (await api.showClosure(target.object.id)).closure.current;
  return buildManagedProjection(target.object, anchor, projectClosure(current));
}

async function readTargetSnapshot(adapter: LogseqGraphAdapter, graphId: string, api: KernelClient, target: TargetView): Promise<GraphSnapshot> {
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  return adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId, expectedProjection: await expectedProjection(api, target) });
}

async function formalizeCurrentRecord(kind: "TASK" | "MINI_PROJECT" = "TASK", blockUuid?: string): Promise<void> {
  const { adapter, graphId, scope } = await adapterForCurrentGraph();
  const current = logseqBlock(await pluginRuntime.inGraph(scope, () => blockUuid ? logseq.Editor.getBlock(blockUuid) : logseq.Editor.getCurrentBlock()));
  if (!current) throw new Error("请先把光标放在一条自然记录上。");
  const api = await client();
  const resumed = await resumePendingFormal(api, scope, `create:${current.uuid}`);
  if (resumed) {
    const delivery = await finishFormal(api, scope, resumed);
    if (resumed.commit.targetId) await rememberFormalState(currentWorkObjectKey, resumed.commit.targetId, scope, resumed);
    await logseq.UI.showMsg(`上次纳入已正式提交；${delivery}`, "success"); return;
  }
  const stable = await ensurePersistentSourceIdentity({
    getBlock: uuid => pluginRuntime.inGraph(scope, () => logseq.Editor.getBlock(uuid)),
    upsertBlockProperty: (uuid, key, value) => pluginRuntime.withSelfWrite(uuid, () => pluginRuntime.inGraph(scope, () => logseq.Editor.upsertBlockProperty(uuid, key, value)), false, scope),
  }, { uuid: current.uuid, content: current.content, isDbGraph: await pluginRuntime.inGraph(scope, () => currentGraphIsDb(logseq.App)) });
  const rawTitle = extractTitleFromSourceLine(stable.content);
  const source = logseqBlock(await pluginRuntime.inGraph(scope, () => logseq.Editor.getBlock(stable.uuid)));
  if (!source || source.uuid !== stable.uuid || source.content !== stable.content) throw new Error("来源已变化，请重新选择当前记录后纳入。");
  const originalContent = source.rawContent;
  const canonicalSource = formatFormalSource(originalContent, { kind, title: rawTitle });
  let formal: Awaited<ReturnType<typeof api.commitFormal>>;
  let submitted = false;
  try {
    if (originalContent !== canonicalSource) {
      const latest = logseqBlock(await pluginRuntime.inGraph(scope, () => logseq.Editor.getBlock(stable.uuid)));
      if (!latest || latest.rawContent !== originalContent) throw new Error("来源已变化，请重新选择当前记录后纳入。");
      await pluginRuntime.updateSource(graphId, stable.uuid, canonicalSource, scope);
    }
    const snapshot = await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: stable.uuid });
    const title = extractTitleFromSourceLine(canonicalSource);
    const operation = parseSemanticOperation({ operationId: `formalize-${crypto.randomUUID()}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title, anchor: { graphId, blockUuid: stable.uuid, sourceContentHash: snapshot.sourceContentHash } } });
    submitted = true;
    formal = await submitFormal(api, scope, `create:${stable.uuid}`, { kind: "COMMIT", operation, snapshot });
  } catch (error) {
    if ((!submitted || error instanceof PrivateWriteUnconfirmedError || (error instanceof ClientError && error.status > 0 && error.status < 500)) && !(error instanceof FormalOutcomeUnknownError) && originalContent !== canonicalSource) {
      try {
        const latest = logseqBlock(await pluginRuntime.inGraph(scope, () => logseq.Editor.getBlock(stable.uuid)));
        if (latest && latest.rawContent === canonicalSource) await pluginRuntime.updateSource(graphId, stable.uuid, originalContent, scope);
      } catch { /* Original Graph may be unavailable; preserve newer source edits and the original failure. */ }
    }
    throw error;
  }
  const delivery = await finishFormal(api, scope, formal);
  if (formal.commit.targetId) {
    await rememberFormalState(currentWorkObjectKey, formal.commit.targetId, scope, formal);
    blockIdentityCache.setFormal(stable.uuid, { kind: "FORMAL", workObjectId: formal.commit.targetId, objectKind: kind }, scope);
  }
  await logseq.UI.showMsg(`已纳入 Task Copilot；${delivery}`, "success");
}

async function letAgentUpdateCurrentFocus(): Promise<void> {
  const { adapter, graphId, scope } = await adapterForCurrentGraph();
  const workObjectId = await readCommandState(currentWorkObjectKey, scope);
  if (typeof workObjectId !== "string" || !workObjectId) throw new Error("没有明确的当前 WorkObject；请先正式化当前记录。");
  const api = await client();
  const resumed = await resumePendingFormal(api, scope, `agent:${workObjectId}`);
  if (resumed) { await logseq.UI.showMsg(`上次 Agent 变更已正式提交；${await finishFormal(api, scope, resumed)}`, "success"); return; }
  const selected = logseqBlock(await pluginRuntime.inGraph(scope, () => logseq.Editor.getCurrentBlock()));
  if (!selected) throw new Error("请把光标放在要冻结为 Evidence 的 Logseq block 上。");
  const target = await api.showObject(workObjectId);
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  if (graphId !== anchor.graphId) throw new Error("当前 Graph 不是目标 WorkObject 的 Primary Anchor Graph。");
  const evidenceId = `evidence-${crypto.randomUUID()}`;
  const connection = await descriptor();
  const evidenceMaterial = await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey);
  assertCommandScope(scope);
  const frozen = await api.freezeEvidence({ evidenceId, workObjectId, snapshot: evidenceMaterial });
  const targetSnapshot = await readTargetSnapshot(adapter, graphId, api, target);
  assertCommandScope(scope);
  const run = await api.runCurrentFocusAgent({ runId: `agent-run-${crypto.randomUUID()}`, workObjectId, evidenceIds: [frozen.evidence.id], snapshot: targetSnapshot });
  assertCommandScope(scope);
  if (!run.proposal) {
    await logseq.UI.showMsg(`Fake Agent 未提出变更；${run.run.reasonCode}；AgentRun ${run.run.id}`, "success");
    return;
  }
  const fresh = await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey);
  assertCommandScope(scope);
  const formal = await submitFormal(api, scope, `agent:${workObjectId}`, { kind: "PROPOSAL", proposalId: run.proposal.id,
    operationId: `apply-focus-${crypto.randomUUID()}`,
    snapshot: await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId }),
    evidence: [{ evidenceId, ...fresh }],
  });
  const delivery = await finishFormal(api, scope, formal);
  await rememberFormalState(recentEvidenceIdKey, evidenceId, scope, formal);
  await logseq.UI.showMsg(`Fake Agent 已更新当前推进；${delivery}；Commit ${formal.commit.id}；Evidence ${evidenceId}；可用“撤销最近一次提交”恢复。`, "success");
}

async function letAgentReconcileEngagement(blockUuid?: string): Promise<void> {
  const { adapter, graphId, scope } = await adapterForCurrentGraph();
  const workObjectId = await readCommandState(currentWorkObjectKey, scope);
  if (typeof workObjectId !== "string" || !workObjectId) throw new Error("没有明确的当前 WorkObject；请先正式化当前记录。");
  const api = await client();
  const resumed = await resumePendingFormal(api, scope, `agent:${workObjectId}`);
  if (resumed) { await logseq.UI.showMsg(`上次 Agent 变更已正式提交；${await finishFormal(api, scope, resumed)}`, "success"); return; }
  const selected = logseqBlock(await pluginRuntime.inGraph(scope, () => blockUuid ? logseq.Editor.getBlock(blockUuid) : logseq.Editor.getCurrentBlock()));
  if (!selected) throw new Error("请把光标放在要冻结为 Evidence 的 Logseq block 上。");
  const target = await api.showObject(workObjectId);
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  if (graphId !== anchor.graphId) throw new Error("当前 Graph 不是目标 WorkObject 的 Primary Anchor Graph。");
  const connection = await descriptor();
  const evidenceId = `evidence-${crypto.randomUUID()}`;
  assertCommandScope(scope);
  const frozen = await api.freezeEvidence({ evidenceId, workObjectId, snapshot: await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey) });
  assertCommandScope(scope);
  const run = await api.runEngagementAgent({ runId: `agent-run-${crypto.randomUUID()}`, workObjectId, evidenceIds: [frozen.evidence.id], snapshot: await readTargetSnapshot(adapter, graphId, api, target) });
  assertCommandScope(scope);
  if (!run.proposal || !run.revision) {
    await logseq.UI.showMsg(`Engagement 未变化；${run.run.reasonCode}；AgentRun ${run.run.id}`, "warning");
    return;
  }
  assertCommandScope(scope);
  const formal = await submitFormal(api, scope, `agent:${workObjectId}`, { kind: "PROPOSAL", proposalId: run.proposal.id, operationId: `apply-engagement-${crypto.randomUUID()}`, snapshot: await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId }), evidence: [{ evidenceId, ...await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey) }] });
  const delivery = await finishFormal(api, scope, formal);
  await rememberFormalState(recentEvidenceIdKey, evidenceId, scope, formal);
  const transition = run.revision.transition;
  const waiting = transition.waiting?.description ? `\n等待：${transition.waiting.description}` : "\n原等待条件已满足并清除。";
  await logseq.UI.showMsg(`Task Copilot：事项状态已变化；${delivery}\n${target.object.title}\n${transition.from} → ${transition.to}${waiting}\n依据：当前记录（Evidence ${evidenceId}）\n查看依据：运行“Task Copilot vNext：查看最近一次 Agent 依据”\n撤销：Cmd+Shift+U`, "warning", { timeout: 12000 });
}

async function organizeTodayCommand(): Promise<void> {
  const api = await client();
  const result = await api.organizeToday();
  const pending = result.maturePackages.length;
  const suffix = pending > 0 ? `\n有 ${pending} 个成熟候选已生成决策包；运行“Task Copilot vNext：回应当前决策”处理。` : "";
  await logseq.UI.showMsg(`Task Copilot：整理今天\n${result.summaryText}${suffix}`, pending > 0 ? "warning" : "success", { timeout: 12000 });
}

async function executeCapturedDecision(api: KernelClient, scope: GraphScope, decisionId?: string): Promise<Awaited<ReturnType<KernelClient["executeUserDecision"]>> | null> {
  const key = "task-copilot-vnext-pending-decision";
  const prior = await readScoped(key,scope);
  const id = typeof prior === "string" && prior ? prior : decisionId;
  if (!id) return null;
  if (!prior) await writeScoped(key,id,scope);
  assertCommandScope(scope);
  const result = await api.executeUserDecision(id);
  if (blockIdentityCache.isCurrent(scope)) {
    try { await writeScoped(key,"",scope); } catch (error) { console.error("accepted-decision-receipt-storage", result.commit.id, error); }
  }
  return result;
}
async function finishDecision(api: KernelClient, scope: GraphScope, result: NonNullable<Awaited<ReturnType<typeof executeCapturedDecision>>>): Promise<void> {
  if (!blockIdentityCache.isCurrent(scope)) throw new Error(`正式提交已成功（${result.commit.id}）；Graph 作用域已切换，回执已保留。`);
  const delivery = result.projectionObligation ? await finishFormal(api, scope, { commit: result.commit, graphEffect: result.commit.graphEffect as GraphEffect, projectionObligation: result.projectionObligation }) : "正式决定已提交。";
  if (!result.projectionObligation) await writeCommandState(recentCommitKey, result.commit.id, scope);
  await logseq.UI.showMsg(`已按你的授权执行；${delivery}`, "success");
}
async function assertDecisionGraph(api: KernelClient, scope: GraphScope, pkg: { id: string; workObjectId: string | null; targetVersions: Record<string, number> }): Promise<void> {
  const ids = [...new Set([...(pkg.workObjectId ? [pkg.workObjectId] : []), ...Object.keys(pkg.targetVersions)])];
  if (ids.length) {
    for (const id of ids) {
      const target = await api.showObject(id); assertCommandScope(scope);
      if ((target.anchor as AnchorView | null)?.graphId !== scope.graphId) throw new Error("当前 Graph 不是决策目标的 Graph。");
    }
  } else {
    const { candidates } = await api.listDecisionCandidates(pkg.id); assertCommandScope(scope);
    if (!candidates.length || candidates.some(item => (item.parameters as { anchor?: { graphId?: string } }).anchor?.graphId !== scope.graphId)) throw new Error("当前 Graph 不是候选来源的 Graph。");
  }
}

async function acceptDecisionPackage(packageId: string): Promise<boolean> {
  const { scope } = await adapterForCurrentGraph(), api = await client();
  const resumed = await executeCapturedDecision(api, scope);
  if (resumed) { await finishDecision(api, scope, resumed); return true; }
  const pkg = (await api.listDecisionPackages("OPEN")).packages.find((item) => item.id === packageId);
  if (!pkg) { await logseq.UI.showMsg("这条建议已经不在待确认列表里了。", "warning"); return false; }
  await assertDecisionGraph(api, scope, pkg);
  const event = await api.createTrustedUserEvent({ exactUserUtterance: "确认", packageId: pkg.id, presentationRevision: pkg.presentationRevision });
  const compiled = await api.compileUserDecision({ trustedUserEventId: event.event.id });
  if (compiled.kind !== "AUTHORIZED_DECISION") {
    await logseq.UI.showMsg(compiled.kind === "STALE" ? "这个建议刚刚发生了变化，请重新看一下。" : "这条确认没有形成授权，没有执行任何正式变化。", "warning");
    return false;
  }
  assertCommandScope(scope);
  await finishDecision(api, scope, (await executeCapturedDecision(api, scope, compiled.decision.id))!);
  return true;
}

async function deferDecisionPackage(packageId: string): Promise<void> {
  const api = await client();
  await api.deferDecisionPackage(packageId);
  await logseq.UI.showMsg("已暂不处理；不会改变候选或 Taste，之后整理时还可以重新出现。", "success");
}

async function respondToDecisionPackage(packageId?: string): Promise<void> {
  const { scope } = await adapterForCurrentGraph(), api = await client();
  const resumed = await executeCapturedDecision(api, scope);
  if (resumed) { await finishDecision(api, scope, resumed); return; }
  const open = (await api.listDecisionPackages("OPEN")).packages;
  if (!open.length) throw new Error("当前没有待回应的决策。");
  if (packageId) { await acceptDecisionPackage(packageId); return; }
  const pkg = open[0] ?? null;
  if (!pkg) throw new Error("没有选中有效的 Decision Package。");
  await assertDecisionGraph(api, scope, pkg);
  const utterance = await requestTextPrompt({ title: `回应当前决策：${pkg.summary}`, label: "你的回应（同意 / 好的 / 确认 …）", initialValue: "同意", confirmLabel: "提交回应" });
  if (!utterance) return;
  assertCommandScope(scope);
  const event = await api.createTrustedUserEvent({ exactUserUtterance: utterance, packageId: pkg.id, presentationRevision: pkg.presentationRevision });
  const compiled = await api.compileUserDecision({ trustedUserEventId: event.event.id });
  if (compiled.kind !== "AUTHORIZED_DECISION") {
    await logseq.UI.showMsg(`未执行：${compiled.kind === "NEEDS_CLARIFICATION" ? "回应不明确" : compiled.kind === "STALE" ? "决策已过期" : "未获得授权"}`, "warning");
    return;
  }
  assertCommandScope(scope);
  await finishDecision(api, scope, (await executeCapturedDecision(api, scope, compiled.decision.id))!);
}

const sidebarWidthKey = "task-copilot-vnext-sidebar-width";
let sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
let hostLayoutDispose: (() => void) | null = null;
let panelKeydownDispose: (() => void) | null = null;
let sidebarDrag: { pointerId: number; startScreenX: number; startWidth: number } | null = null;

function topDocument(): Document | null {
  try { return window.top?.document ?? null; } catch { return null; }
}

function hostWindow(): Window | null {
  try { return window.top ?? null; } catch { return null; }
}

function headerHeight(doc: Document): number {
  const rect = doc.querySelector(".cp__header")?.getBoundingClientRect();
  const value = rect ? Math.round(rect.height) : 48;
  return value > 0 ? value : 48;
}

function reservedWidths(doc: Document): { left: number; right: number } {
  const view = doc.defaultView;
  const measure = (element: Element | null) => {
    if (!element || !view || view.getComputedStyle(element).display === "none") return 0;
    return Math.max(0, Math.round(element.getBoundingClientRect().width));
  };
  return { left: measure(doc.querySelector("#left-sidebar")), right: measure(doc.querySelector(".cp__right-sidebar")) };
}

function syncPanelMode(spec: SidebarLayoutSpec): void {
  const root = document.querySelector<HTMLElement>("[data-task-copilot-daily-panel]");
  if (!root) return;
  root.dataset.tcMode = spec.mode;
  const handle = root.querySelector<HTMLElement>("[data-tc-resize-handle]");
  const back = root.querySelector<HTMLElement>("[data-tc-compact-back]");
  if (handle) handle.style.display = spec.mode === "DOCKED" ? "block" : "none";
  if (back) back.style.display = spec.mode === "COMPACT" ? "" : "none";
}

function applySidebarLayout(): SidebarLayoutSpec | null {
  const doc = topDocument(); const view = hostWindow();
  if (!doc || !view) return null;
  const viewport = doc.documentElement.clientWidth || view.innerWidth || 0;
  const reserved = reservedWidths(doc);
  const spec = sidebarLayoutSpec({ viewportWidth: viewport, sidebarWidth, leftReserved: reserved.left, rightReserved: reserved.right });
  doc.documentElement.style.setProperty("--tc-sidebar-width", `${spec.sidebarWidth}px`);
  doc.body.classList.toggle("tc-sidebar-docked", spec.mode === "DOCKED");
  doc.body.classList.toggle("tc-sidebar-compact", spec.mode === "COMPACT");
  const top = headerHeight(doc);
  const container = doc.querySelector<HTMLElement>("#task-copilot-vnext_lsp_main");
  if (container) {
    const base = `position:fixed;top:${top}px;height:calc(100vh - ${top}px);z-index:10000;pointer-events:auto;background:transparent;box-sizing:border-box;`;
    if (spec.mode === "DOCKED") {
      container.style.cssText = `${base}left:${spec.panelLeft}px;right:auto;bottom:auto;width:${spec.panelWidth}px;border-left:1px solid var(--ls-border-color,#e3e3e3);`;
    } else {
      const leftEdge = spec.panelLeft > 0 ? "border-left:1px solid var(--ls-border-color,#e3e3e3);" : "";
      const rightEdge = spec.panelRight > 0 ? "border-right:1px solid var(--ls-border-color,#e3e3e3);" : "";
      container.style.cssText = `${base}left:${spec.panelLeft}px;right:${spec.panelRight}px;bottom:auto;width:auto;${leftEdge}${rightEdge}`;
    }
  }
  syncPanelMode(spec);
  return spec;
}

function scheduleSidebarLayout(): void {
  window.setTimeout(() => applySidebarLayout(), 60);
}

function installHostLayoutObserver(): () => void {
  const doc = topDocument(); const view = hostWindow();
  if (!doc || !view) return () => undefined;
  const schedule = () => scheduleSidebarLayout();
  view.addEventListener("resize", schedule);
  const left = doc.querySelector("#left-sidebar"); const right = doc.querySelector(".cp__right-sidebar");
  const mutations = new MutationObserver(schedule);
  for (const element of [left, right]) if (element) mutations.observe(element, { attributes: true, attributeFilter: ["class", "style"] });
  let sizes: globalThis.ResizeObserver | null = null;
  if (typeof ResizeObserver === "function") {
    sizes = new ResizeObserver(schedule);
    if (left) sizes.observe(left);
    if (right) sizes.observe(right);
  }
  return () => { view.removeEventListener("resize", schedule); mutations.disconnect(); if (sizes) sizes.disconnect(); };
}

function persistSidebarWidth(): void {
  void logseq.FileStorage.setItem(sidebarWidthKey, String(sidebarWidth)).catch(() => undefined);
}

function installPanelStyle(): void {
  if (document.querySelector("#task-copilot-panel-style")) return;
  const style = document.createElement("style");
  style.id = "task-copilot-panel-style";
  style.textContent = `
html,body{margin:0;height:100%;overflow:hidden}
[data-task-copilot-daily-panel] ::-webkit-scrollbar{width:8px;height:8px}
[data-task-copilot-daily-panel] ::-webkit-scrollbar-thumb{background:rgba(128,128,128,.28);border-radius:4px}
[data-task-copilot-daily-panel] ::-webkit-scrollbar-track{background:transparent}
[data-tc-resize-handle]::after{content:"";position:absolute;top:0;bottom:0;left:4px;width:1px;background:var(--ls-border-color,#e3e3e3);opacity:.75}
[data-tc-resize-handle]:hover::after,[data-tc-resize-handle]:focus-visible::after{background:var(--ls-link-text-color,#4f74b8);opacity:.95;width:2px}
`;
  document.head.append(style);
}

function installHostLayoutStyle(): void {
  logseq.provideStyle(`
:root{--tc-sidebar-width:384px}
body.tc-sidebar-docked #main-content-container{margin-right:var(--tc-sidebar-width)}
body.tc-sidebar-compact #main-content-container{margin-right:0}
body.tc-sidebar-resizing,body.tc-sidebar-resizing *{user-select:none!important}
[data-tc-toolbar-button]{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 5px;border-radius:5px;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--ls-icon-color,#666)}
[data-tc-toolbar-button]:hover{background:var(--ls-secondary-background-color,transparent);color:var(--ls-primary-text-color,#222)}
[data-tc-toolbar-button][data-active="true"]{background:var(--ls-secondary-background-color,transparent);color:var(--ls-link-text-color,#4f74b8);box-shadow:inset 0 -2px 0 var(--ls-link-text-color,#4f74b8)}
[data-tc-formal-marker]:hover{opacity:.78!important}
[data-tc-formal-marker]:focus-visible{opacity:.78!important;outline:1px solid var(--ls-link-text-color,#4f74b8);outline-offset:1px}
[data-tc-formal-marker][data-tc-formal-consistency="WARNING"]{opacity:.72!important;color:var(--ls-warning-color,#b58900)}
`);
}

function closeDailyPanel(cancelPending = true): void {
  if (cancelPending) panels.reserve();
  document.querySelector("[data-task-copilot-daily-panel]")?.remove();
  hostLayoutDispose?.(); hostLayoutDispose = null;
  panelKeydownDispose?.(); panelKeydownDispose = null;
  sidebarDrag = null;
  panelOpen = false;
  panelNavigate = null;
  panels.release("tasks");
  const doc = topDocument();
  if (doc) { doc.body.classList.remove("tc-sidebar-docked", "tc-sidebar-compact", "tc-sidebar-resizing"); }
  syncToolbarState();
  void logseq.hideMainUI({ restoreEditingCursor: true });
}

function syncToolbarState(): void {
  const doc = topDocument();
  const button = doc?.querySelector<HTMLElement>("[data-tc-toolbar-button]");
  if (!button) return;
  button.dataset.active = String(panelOpen);
  button.title = panelOpen ? "关闭 Task Copilot" : "打开 Task Copilot";
  button.setAttribute("aria-label", button.title);
}

function toggleDailyPanel(): void {
  if (panelOpen) { closeDailyPanel(); return; }
  void guarded("open-daily", () => dailyPanel());
}

async function openPanelAtObject(objectId: string): Promise<void> {
  await writeCommandState(currentWorkObjectKey, objectId);
  if (panelOpen && panelNavigate) { panelNavigate(objectId); return; }
  await dailyPanel(objectId);
}

function ensureFormalMarkerHost(): FormalMarkerHost {
  if (formalMarkerHost) return formalMarkerHost;
  formalMarkerHost = installFormalMarkerHost({
    document: () => topDocument(),
    lookupFormal: (uuid) => blockIdentityCache.lookup(uuid),
    onOpen: (uuid) => void openObjectFromBlock(uuid),
  });
  return formalMarkerHost;
}

function contextMenuCategoryFor(identity: BlockIdentity): string {
  return identity.kind === "ORDINARY" ? "ordinary" : `formal:${identity.objectKind}`;
}

function hostPluginApi(): { unregister_plugin_simple_command?: (pid: string, key: string) => unknown } | null {
  const view = hostWindow();
  const api = (view as Window & { logseq?: { api?: { unregister_plugin_simple_command?: (pid: string, key: string) => unknown } } }).logseq?.api;
  return api?.unregister_plugin_simple_command ? api : null;
}

function blockContextMenuKeyFor(actionId: BlockContextActionId): string {
  return `tc-${actionId.toLowerCase().replaceAll("_", "-")}`;
}

function unregisterContextMenuItems(): void {
  for (const unregister of contextMenuRegistrations) { try { unregister(); } catch { /* already gone */ } }
  contextMenuRegistrations = [];
  contextMenuCategory = null;
}

function registerContextMenuItems(identity: BlockIdentity): void {
  unregisterContextMenuItems();
  const handlers: Record<BlockContextActionId, (uuid: string) => void> = {
    FORMALIZE_TASK: (uuid) => void formalizeBlockFromContextMenu(uuid, "TASK"),
    FORMALIZE_MINI_PROJECT: (uuid) => void formalizeBlockFromContextMenu(uuid, "MINI_PROJECT"),
    OPEN_OBJECT: (uuid) => void openObjectFromBlock(uuid),
    DISCUSS_OBJECT: (uuid) => void discussObjectFromBlock(uuid),
    RECONCILE_OBJECT: (uuid) => void reconcileObjectFromBlock(uuid),
  };
  for (const actionId of contextActionsFor(identity)) {
    const label = CONTEXT_ACTION_LABELS[actionId];
    const key = blockContextMenuKeyFor(actionId);
    logseq.App.registerCommand("block-context-menu-item", { key, label }, async (event: { uuid?: string }) => { if (taskUiActive && event.uuid) handlers[actionId](event.uuid); });
    const api = hostPluginApi();
    contextMenuRegistrations.push(() => { api?.unregister_plugin_simple_command?.("task-copilot-vnext", key); });
  }
  contextMenuCategory = contextMenuCategoryFor(identity);
}

async function syncContextMenuForUuid(uuid: string): Promise<void> {
  const generation = taskUiGeneration;
  try { await pluginRuntime.refreshIfStale(uuid); } catch { /* offline presentation retains its Graph-scoped cache */ }
  if (!taskUiActive || generation !== taskUiGeneration) return;
  const identity = blockIdentityCache.lookup(uuid);
  const category = contextMenuCategoryFor(identity);
  if (category !== contextMenuCategory) registerContextMenuItems(identity);
}

function installBlockContextTracker(): () => void {
  const doc = topDocument();
  if (!doc) return () => undefined;
  const onPointerOver = (event: Event) => {
    const target = event.target as Element | null;
    const block = target?.closest?.(".ls-block[blockid]") as HTMLElement | null;
    const uuid = block?.getAttribute("blockid");
    if (!uuid || uuid === contextMenuHoverUuid) return;
    contextMenuHoverUuid = uuid;
    if (contextMenuHoverTimer !== null) window.clearTimeout(contextMenuHoverTimer);
    contextMenuHoverTimer = window.setTimeout(() => { contextMenuHoverTimer = null; void syncContextMenuForUuid(uuid); }, 60);
  };
  doc.addEventListener("pointerover", onPointerOver, true);
  return () => {
    doc.removeEventListener("pointerover", onPointerOver, true);
    if (contextMenuHoverTimer !== null) window.clearTimeout(contextMenuHoverTimer);
    contextMenuHoverTimer = null;
    contextMenuHoverUuid = null;
  };
}

async function formalizeBlockFromContextMenu(uuid: string, kind: "TASK" | "MINI_PROJECT"): Promise<void> {
  if (blockIdentityCache.lookupFormal(uuid)) { await logseq.UI.showMsg("这条记录已经在 Task Copilot 中。", "warning"); return; }
  try {
    await formalizeCurrentRecord(kind, uuid);
    if (contextMenuHoverUuid === uuid) registerContextMenuItems(blockIdentityCache.lookup(uuid));
  } catch (error) {
    console.error("block-formalize", error);
    await logseq.UI.showMsg(error instanceof Error ? error.message : "当前记录无法纳入 Task Copilot。请确认 Kernel 正常连接后重试。", "error");
  }
}

async function openObjectFromBlock(uuid: string): Promise<void> {
  try {
    const api = await client();
    const entry = await revalidateBlockIdentity(api, uuid);
    if (!entry) { await logseq.UI.showMsg("这条记录还没有纳入 Task Copilot。", "warning"); return; }
    await openPanelAtObject(entry.object.id);
  } catch (error) {
    console.error("block-open-object", error);
    await logseq.UI.showMsg("无法打开事项。请确认 Kernel 正常连接后重试。", "error");
  }
}

async function discussObjectFromBlock(uuid: string): Promise<void> {
  try {
    const api = await client();
    const entry = await revalidateBlockIdentity(api, uuid);
    if (!entry) { await logseq.UI.showMsg("这条记录还没有纳入 Task Copilot。", "warning"); return; }
    const target = await api.showObject(entry.object.id);
    await openObjectConversation(api, target.object.id, target.object.title);
  } catch (error) {
    console.error("block-discuss-object", error);
    await logseq.UI.showMsg("无法开始讨论。请确认 Kernel 正常连接后重试。", "error");
  }
}

async function reconcileObjectFromBlock(uuid: string): Promise<void> {
  try {
    const { scope } = await adapterForCurrentGraph();
    const api = await client();
    const entry = await revalidateBlockIdentity(api, uuid);
    assertCommandScope(scope);
    if (!entry) { await logseq.UI.showMsg("这条记录还没有纳入 Task Copilot。", "warning"); return; }
    await writeCommandState(currentWorkObjectKey, entry.object.id, scope);
    await letAgentReconcileEngagement(uuid);
  } catch (error) {
    console.error("block-reconcile-object", error);
    await logseq.UI.showMsg(error instanceof Error ? error.message : "无法重新理解这条记录。请确认 Kernel 正常连接后重试。", "error");
  }
}

async function dailyPanel(initialObjectId: string | null = null): Promise<void> {
  const navigation = panels.reserve(), generation = taskUiGeneration;
  const api = await client();
  const [now, confirmations, workMap, system] = await Promise.all([api.nowProjection(), api.confirmationProjection(), api.workMapProjection(), api.systemProjection()]);
  const storedWidth = await logseq.FileStorage.getItem(sidebarWidthKey).catch(() => null);
  if (generation !== taskUiGeneration || !await panels.activate("tasks", navigation) || generation !== taskUiGeneration) return;
  markNavigation("任务");
  sidebarWidth = parseSidebarWidth(storedWidth);
  const root = document.createElement("div");
  root.dataset.taskCopilotDailyPanel = "true";
  root.style.cssText = "box-sizing:border-box;width:100%;height:100vh;overflow:hidden;background:var(--ls-primary-background-color,#fff);color:var(--ls-primary-text-color,#222);font-family:var(--ls-font-family,system-ui,sans-serif);display:flex;flex-direction:column;position:relative;";
  const header = document.createElement("div"); header.style.cssText = "flex:none;display:flex;align-items:center;gap:8px;padding:9px 14px 7px;";
  const brand = document.createElement("div"); brand.textContent = "Task Copilot"; brand.style.cssText = "font-size:13px;font-weight:700;letter-spacing:.02em;opacity:.9;";
  const compactBack = document.createElement("button"); compactBack.dataset.tcCompactBack = "true"; compactBack.textContent = "← Logseq"; compactBack.title = "返回 Logseq 主工作区"; compactBack.setAttribute("aria-label", "返回 Logseq 主工作区");
  compactBack.style.cssText = "border:1px solid var(--ls-border-color,#ccc);border-radius:5px;background:transparent;color:inherit;padding:2px 8px;font-size:12px;cursor:pointer;display:none;";
  compactBack.onclick = () => closeDailyPanel();
  const close = document.createElement("button"); close.textContent = "×"; close.title = "关闭 Task Copilot"; close.setAttribute("aria-label", "关闭 Task Copilot");
  close.style.cssText = "border:none;background:transparent;font-size:19px;line-height:1;cursor:pointer;color:inherit;opacity:.55;padding:0 2px;margin-left:auto;";
  close.onclick = () => closeDailyPanel();
  header.append(compactBack, brand, close);
  const tabs = document.createElement("div"); tabs.style.cssText = "flex:none;display:flex;gap:2px;padding:0 14px;border-bottom:1px solid var(--ls-border-color,#e3e3e3);";
  const view = document.createElement("div"); view.dataset.tcScrollView = "true"; view.style.cssText = "flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 14px 20px;";

  const render = (name: string, objectId: string | null = null) => {
    if (generation !== taskUiGeneration) return;
    tabs.querySelectorAll("button").forEach((button) => { (button as HTMLButtonElement).disabled = false; button.style.fontWeight = "500"; button.style.boxShadow = "none"; });
    const active = tabs.querySelector(`[data-tab="${name}"]`) as HTMLButtonElement | null;
    if (active && !objectId) { active.disabled = true; active.style.fontWeight = "700"; active.style.boxShadow = "inset 0 -2px 0 var(--ls-link-text-color,#4f74b8)"; }
    if (name === "now") {
      view.replaceChildren();
      if (!now.items.length) {
        const empty = document.createElement("p"); empty.textContent = "目前没有特别需要你恢复的工作。"; empty.style.cssText = "color:#777;font-size:13px;";
        const quiet = document.createElement("p"); quiet.textContent = "后台会在真正值得你注意时再把事情带回来。"; quiet.style.cssText = "color:#999;font-size:12px;margin:4px 0 0;";
        view.append(empty, quiet);
      }
      for (const item of now.items) {
        const card = document.createElement("section"); card.style.cssText = "border-bottom:1px solid rgba(128,128,128,.16);padding:10px 0;margin:0;cursor:pointer;";
        if (item.workObjectId) card.onclick = () => render("now", item.workObjectId);
        const h = document.createElement("h3"); h.textContent = item.title; h.style.cssText = "margin:0 0 3px;font-size:15px;font-weight:600;";
        const reality = document.createElement("p"); reality.textContent = item.currentReality; reality.style.cssText = "margin:0 0 4px;font-size:13px;";
        const why = document.createElement("p"); why.textContent = item.whyNow; why.style.cssText = "margin:0 0 4px;font-size:12px;color:#666;";
        const cont = document.createElement("p"); cont.textContent = item.continuationPoint; cont.style.cssText = "margin:0 0 8px;font-size:13px;color:#333;";
        const fragments: HTMLElement[] = [h, reality, why, cont];
        if (item.meaningfulChanges.length && item.lastSeenAt) {
          const changes = document.createElement("p"); changes.textContent = `上次以后：${item.meaningfulChanges.slice(0, 2).join("；")}`; changes.style.cssText = "margin:0 0 8px;font-size:12px;color:#444;";
          fragments.splice(3, 0, changes);
        }
        card.append(...fragments);
        if (item.workObjectId) {
          const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;font-size:12px;";
          const open = document.createElement("button"); open.textContent = "打开原文"; open.style.cssText = "border:none;background:transparent;color:var(--ls-link-text-color,#4f74b8);cursor:pointer;padding:0;";
          open.onclick = (event) => { event.stopPropagation(); void openObjectAnchor(api, item.workObjectId!); };
          const discuss = document.createElement("button"); discuss.textContent = "和 Agent 讨论"; discuss.style.cssText = "border:none;background:transparent;color:var(--ls-link-text-color,#4f74b8);cursor:pointer;padding:0;";
          discuss.onclick = (event) => { event.stopPropagation(); void openObjectConversation(api, item.workObjectId!, item.title); };
          actions.append(open, discuss); card.append(actions);
        }
        view.append(card);
      }
    } else if (name === "confirm") {
      view.replaceChildren();
      if (!confirmations.items.length) { const empty = document.createElement("p"); empty.textContent = "现在没有需要你确认的边界决定。"; empty.style.cssText = "color:#777;font-size:13px;"; view.append(empty); }
      for (const item of confirmations.items) {
        const card = document.createElement("section"); card.style.cssText = "border-bottom:1px solid rgba(128,128,128,.16);padding:10px 0;margin:0;";
        const title = document.createElement("h3"); title.textContent = item.title; title.style.cssText = "margin:0 0 5px;font-size:15px;font-weight:600;";
        const impact = document.createElement("p"); impact.textContent = item.impact; impact.style.cssText = "margin:0 0 4px;font-size:13px;";
        const fragments: HTMLElement[] = [title, impact];
        if (item.whyNow) { const why = document.createElement("p"); why.textContent = item.whyNow; why.style.cssText = "margin:0 0 10px;font-size:12px;color:#666;"; fragments.push(why); }
        const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;";
        const accept = document.createElement("button"); accept.textContent = "确认"; accept.disabled = item.status === "STALE"; accept.style.cssText = "border:1px solid #bbb;border-radius:5px;background:var(--ls-link-text-color,#4f74b8);color:#fff;padding:4px 12px;cursor:pointer;";
        accept.onclick = () => { closeDailyPanel(); void guarded("accept-decision", async () => { if (await acceptDecisionPackage(item.packageId)) await dailyPanel(); }); };
        const defer = document.createElement("button"); defer.textContent = "先不改"; defer.style.cssText = "border:1px solid #bbb;border-radius:5px;background:transparent;padding:4px 12px;cursor:pointer;color:inherit;";
        defer.onclick = () => { closeDailyPanel(); void guarded("defer-decision", () => deferDecisionPackage(item.packageId)); };
        actions.append(accept, defer); card.append(...fragments, actions); view.append(card);
      }
    } else if (name === "projects") {
      view.replaceChildren();
      const renderNode = (node: WorkMapNode, depth: number) => {
        const row = document.createElement("div"); row.style.cssText = `margin-left:${depth * 12}px;padding:7px 4px;font-size:14px;display:flex;align-items:baseline;gap:6px;border-bottom:1px solid rgba(128,128,128,.12);cursor:pointer;`;
        row.onclick = () => render("projects", node.workObjectId);
        const statusText = node.engagement === "WAITING" ? " · 等待" : node.currentFocus ? ` · ${node.currentFocus}` : node.currentPhase ? ` · ${node.currentPhase}` : "";
        const label = document.createElement("span"); label.textContent = `${node.title}${statusText}`;
        const kind = document.createElement("span"); kind.textContent = node.kind === "PROJECT" ? "项目" : node.kind === "MINI_PROJECT" ? "子项目" : "任务"; kind.style.cssText = "font-size:10px;color:#999;margin-left:2px;";
        row.append(label, kind); view.append(row);
        for (const child of node.children) renderNode(child, depth + 1);
      };
      for (const node of workMap.roots) renderNode(node, 0);
    } else if (name === "more") {
      view.replaceChildren();
      const group = (title: string, rows: string[]) => {
        const label = document.createElement("p"); label.textContent = title; label.style.cssText = "margin:10px 0 4px;font-size:11px;font-weight:600;color:#888;";
        view.append(label);
        for (const text of rows) { const p = document.createElement("p"); p.textContent = text; p.style.cssText = "margin:0 0 4px;font-size:13px;color:#444;overflow-wrap:anywhere;"; view.append(p); }
      };
      const systemRows = [system.runtimeSummary];
      if (system.runtimeStatus === "DEGRADED" || system.runtimeStatus === "CATCHING_UP") systemRows.push(`待处理：${system.runtimeQueuedJobs} · 失败：${system.runtimeFailedJobs}`);
      if (!system.graphAvailable) systemRows.push("图连接：离线，恢复后会自动继续。");
      group("系统", systemRows);
      group("工具", [system.lastDiscovery ? `最近整理：${system.lastDiscovery.summaryText}` : "最近整理：还没有运行"]);
      const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;";
      const pause = document.createElement("button"); pause.textContent = system.maintenancePaused ? "恢复后台维护" : "暂停后台维护"; pause.style.cssText = "border:1px solid #bbb;border-radius:5px;background:transparent;padding:4px 10px;cursor:pointer;color:inherit;";
      pause.onclick = () => void guarded("toggle-maintenance", async () => { await api.setMaintenancePause("global", !system.maintenancePaused); await dailyPanel(); });
      const organize = document.createElement("button"); organize.textContent = "运行整理今天"; organize.style.cssText = "border:1px solid #bbb;border-radius:5px;background:var(--ls-link-text-color,#4f74b8);color:#fff;padding:4px 10px;cursor:pointer;";
      organize.onclick = () => { closeDailyPanel(); void guarded("organize-today", organizeTodayCommand); };
      actions.append(pause, organize); view.append(actions);
    }
    if (objectId) {
      void guarded("object-surface", async () => {
        const pack = (await api.objectContextPack(objectId)).pack;
        if (generation !== taskUiGeneration || !root.isConnected) return;
        await api.markObjectViewed(objectId).catch(() => undefined);
        if (generation !== taskUiGeneration || !root.isConnected) return;
        view.replaceChildren();
        const back = document.createElement("button"); back.textContent = "‹ 返回"; back.style.cssText = "border:none;background:transparent;color:var(--ls-link-text-color,#4f74b8);cursor:pointer;padding:0;margin-bottom:8px;font-size:13px;";
        back.onclick = () => render(objectId === null ? "now" : pack.kind === "PROJECT" ? "projects" : "now");
        const title = document.createElement("h2"); title.textContent = pack.title; title.style.cssText = "margin:0 0 6px;font-size:17px;font-weight:700;";
        view.append(back, title);
        if (pack.projectIntent) {
          const intent = document.createElement("section"); intent.style.cssText = "border-bottom:1px solid rgba(128,128,128,.16);padding:2px 0 10px;margin-bottom:8px;";
          if (pack.projectIntent.objective) { const objective = document.createElement("p"); objective.textContent = `目标：${pack.projectIntent.objective}`; objective.style.cssText = "margin:0 0 4px;font-size:14px;"; intent.append(objective); }
          if (pack.projectIntent.currentPhase) { const phase = document.createElement("p"); phase.textContent = `当前阶段：${pack.projectIntent.currentPhase}`; phase.style.cssText = "margin:0 0 4px;font-size:12px;color:#555;"; intent.append(phase); }
          if (pack.projectIntent.keyResults.length) {
            const krTitle = document.createElement("p"); krTitle.textContent = "结果边界"; krTitle.style.cssText = "margin:4px 0 2px;font-size:11px;font-weight:600;color:#888;"; intent.append(krTitle);
            for (const kr of pack.projectIntent.keyResults) { const p = document.createElement("p"); p.textContent = `• ${kr.text}`; p.style.cssText = "margin:0 0 2px;font-size:13px;overflow-wrap:anywhere;"; intent.append(p); }
          }
          view.append(intent);
        }
        const reality = document.createElement("p"); reality.textContent = pack.reentrySummary; reality.style.cssText = "margin:0 0 8px;font-size:14px;overflow-wrap:anywhere;";
        view.append(reality);
        if (pack.recentChanges.length) { const changes = document.createElement("p"); changes.textContent = `最近变化：${pack.recentChanges.slice(0, 3).join("；")}`; changes.style.cssText = "margin:0 0 8px;font-size:12px;color:#444;"; view.append(changes); }
        if (pack.activeChildren.length) {
          const childrenTitle = document.createElement("p"); childrenTitle.textContent = "当前重点"; childrenTitle.style.cssText = "margin:8px 0 2px;font-size:11px;font-weight:600;color:#888;"; view.append(childrenTitle);
          for (const child of pack.activeChildren) { const p = document.createElement("p"); p.textContent = `• ${child.title}${child.reason ? ` — ${child.reason}` : ""}`; p.style.cssText = "margin:0 0 2px;font-size:13px;overflow-wrap:anywhere;"; view.append(p); }
        }
        if (pack.closureAssessment && pack.kind !== "TASK") {
          const assessment = pack.closureAssessment;
          const closure = document.createElement("section"); closure.style.cssText = "border-bottom:1px solid rgba(128,128,128,.16);padding:2px 0 10px;margin:8px 0;";
          const label = document.createElement("p"); label.textContent = !pack.closureAssessmentFresh ? "完成情况正在重新评估"
            : assessment.readiness === "READY" ? "已具备结束条件"
            : assessment.readiness === "CONFLICT" ? "当前存在冲突，不能判断已经完成"
            : assessment.readiness === "NOT_READY" ? "当前还不能结束"
            : "完成情况还不确定"; label.style.cssText = `margin:0 0 4px;font-size:13px;font-weight:600;${assessment.readiness === "CONFLICT" ? "color:#b02a37;" : assessment.readiness === "READY" && pack.closureAssessmentFresh ? "color:var(--ls-link-text-color,#4f74b8);" : ""}`;
          closure.append(label);
          if (assessment.blockers.length) { const blockers = document.createElement("p"); blockers.textContent = assessment.blockers.join("；"); blockers.style.cssText = "margin:0 0 4px;font-size:12px;color:#666;overflow-wrap:anywhere;"; closure.append(blockers); }
          if (assessment.checks.length) {
            for (const check of assessment.checks) {
              const glyph = check.status === "SATISFIED" ? "✓" : check.status === "UNSATISFIED" ? "✗" : check.status === "CONTRADICTED" ? "⚠" : "○";
              const p = document.createElement("p"); p.textContent = `${glyph} ${check.text}`; p.style.cssText = "margin:0 0 2px;font-size:12px;overflow-wrap:anywhere;";
              closure.append(p);
              if (check.rationale && check.status !== "SATISFIED") { const reason = document.createElement("p"); reason.textContent = `  ${check.rationale}`; reason.style.cssText = "margin:0 0 4px;font-size:11px;color:#777;"; closure.append(reason); }
            }
          }
          if (assessment.readiness === "READY" && pack.closureAssessmentFresh) {
            const closeButton = document.createElement("button"); closeButton.textContent = `结束这个${pack.kind === "PROJECT" ? "项目" : "子项目"}`; closeButton.style.cssText = "margin-top:6px;border:1px solid #b02a37;border-radius:5px;background:transparent;color:#b02a37;padding:4px 10px;cursor:pointer;";
            closeButton.onclick = () => void guarded("close-object", async () => { if (await closeObjectFromAssessment(api, objectId, pack.title, assessment.evidenceIds)) { closeDailyPanel(); await dailyPanel(); } });
            closure.append(closeButton);
          }
          view.append(closure);
        } else if (pack.lifecycle === "COMPLETED" || pack.lifecycle === "CANCELLED") {
          const closed = document.createElement("p"); closed.textContent = pack.lifecycle === "COMPLETED" ? "已完成" : "已取消"; closed.style.cssText = "margin:8px 0 0;font-size:13px;color:#555;"; view.append(closed);
        }
        const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;";
        if (pack.lifecycle === "OPEN") {
          const discuss = document.createElement("button"); discuss.textContent = "和 Agent 讨论"; discuss.style.cssText = "border:1px solid #bbb;border-radius:5px;background:var(--ls-link-text-color,#4f74b8);color:#fff;padding:5px 10px;cursor:pointer;";
          discuss.onclick = () => void openObjectConversation(api, objectId, pack.title);
          actions.append(discuss);
        }
        const open = document.createElement("button"); open.textContent = "打开原文"; open.style.cssText = "border:1px solid #bbb;border-radius:5px;background:transparent;padding:5px 10px;cursor:pointer;color:inherit;";
        open.onclick = () => void openObjectAnchor(api, objectId);
        actions.append(open); view.append(actions);
      });
    }
  };
  for (const [key, label] of [["now", "现在"], ["confirm", "待我确认"], ["projects", "项目"], ["more", "更多"]] as const) {
    const button = document.createElement("button"); button.dataset.tab = key; button.textContent = label; button.style.cssText = "border:none;background:transparent;padding:7px 8px 8px;cursor:pointer;color:inherit;font-size:13px;font-weight:500;";
    button.onclick = () => render(key); tabs.append(button);
  }
  const handle = document.createElement("div");
  handle.dataset.tcResizeHandle = "true"; handle.setAttribute("role", "separator"); handle.setAttribute("aria-orientation", "vertical"); handle.setAttribute("aria-label", "调整 Task Copilot 宽度"); handle.title = "拖动调整 Task Copilot 宽度（300–520px）";
  handle.style.cssText = "position:absolute;top:0;bottom:0;left:0;width:9px;margin-left:-4px;cursor:col-resize;touch-action:none;z-index:20;display:block;";
  handle.addEventListener("pointerdown", (event) => {
    if (root.dataset.tcMode === "COMPACT") return;
    event.preventDefault(); event.stopPropagation();
    const doc = topDocument();
    sidebarDrag = { pointerId: event.pointerId, startScreenX: event.screenX, startWidth: sidebarWidth };
    handle.setPointerCapture(event.pointerId);
    doc?.body.classList.add("tc-sidebar-resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!sidebarDrag || sidebarDrag.pointerId !== event.pointerId) return;
    const next = clampSidebarWidth(sidebarDrag.startWidth + (sidebarDrag.startScreenX - event.screenX));
    if (next !== sidebarWidth) { sidebarWidth = next; applySidebarLayout(); }
  });
  const endDrag = (event: PointerEvent) => {
    if (!sidebarDrag || sidebarDrag.pointerId !== event.pointerId) return;
    sidebarDrag = null; topDocument()?.body.classList.remove("tc-sidebar-resizing"); persistSidebarWidth();
  };
  handle.addEventListener("pointerup", endDrag); handle.addEventListener("pointercancel", endDrag);

  root.append(header, tabs, view, handle);
  document.querySelector("[data-task-copilot-daily-panel]")?.remove();
  document.body.append(root);
  logseq.setMainUIAttrs({ draggable: false, resizable: false });
  applySidebarLayout();
  logseq.showMainUI({ autoFocus: true });
  applySidebarLayout();
  hostLayoutDispose?.(); hostLayoutDispose = installHostLayoutObserver();
  root.tabIndex = -1; root.focus();
  panelKeydownDispose?.(); panelKeydownDispose = (() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeDailyPanel(); } };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  })();
  panelNavigate = (objectId) => render("projects", objectId);
  panelOpen = true;
  syncToolbarState();
  render("now");
  if (initialObjectId) render("projects", initialObjectId);
}


async function closeObjectFromAssessment(api: KernelClient, workObjectId: string, title: string, evidenceIds: readonly string[]): Promise<boolean> {
  const target = await api.showObject(workObjectId);
  const projection = await expectedProjection(api, target);
  const pkg = (await api.createDecisionPackage({
    workObjectId,
    summary: `结束「${title}」`,
    rationale: "结束条件已具备；正式结束只会标记承诺兑现，不会移动或删除自然笔记。",
    candidates: [{ operationType: "COMPLETE_WORK_OBJECT", parameters: { target: { workObjectId, expectedVersion: target.object.version, expectedProjectionHash: projection.projectionHash }, input: { outcomeSummary: target.object.title, evidenceIds } } }],
  })).pkg;
  return acceptDecisionPackage(pkg.id);
}

async function openObjectAnchor(api: KernelClient, workObjectId: string): Promise<void> {
  const anchors = await api.listObjectAnchorIndex();
  const anchor = anchors.objects.find((item) => item.object.id === workObjectId)?.anchor as { externalId?: string } | undefined;
  if (!anchor?.externalId) throw new Error("这个事项还没有 Logseq 原文。");
  await api.markObjectViewed(workObjectId).catch(() => undefined);
  await logseq.Editor.openInRightSidebar(anchor.externalId);
  await logseq.UI.showMsg("已打开 Logseq 原文。", "success");
}

async function openObjectConversation(api: KernelClient, workObjectId: string, title: string): Promise<void> {
  await api.markObjectViewed(workObjectId).catch(() => undefined);
  const pack = await api.objectContextPack(workObjectId);
  const text = `Task Copilot 对象上下文：${title}
对象 ID：${workObjectId}
${pack.pack.reentrySummary}

下一步建议在 DSH 中运行：object context ${workObjectId}`;
  try { await navigator.clipboard.writeText(text); await logseq.UI.showMsg("对象上下文已复制；在 DSH 中运行 object context <id> 开始讨论。", "success", { timeout: 8000 }); }
  catch { await logseq.UI.showMsg(`对象 ID：${workObjectId}；在 DSH 中运行 object context ${workObjectId}。`, "success", { timeout: 8000 }); }
}

async function correctCurrentReality(): Promise<void> {
  const { adapter, graphId, scope } = await adapterForCurrentGraph();
  const workObjectId = await readCommandState(currentWorkObjectKey, scope);
  if (typeof workObjectId !== "string" || !workObjectId) throw new Error("没有明确的当前 WorkObject；请先打开一个正式事项。");
  const current = logseqBlock(await pluginRuntime.inGraph(scope, () => logseq.Editor.getCurrentBlock()));
  if (!current) throw new Error("请把光标放在写有纠正说明的 Logseq block 上。");
  const utterance = current.content.split("\n")[0]!.replace(/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "").trim();
  if (!utterance) throw new Error("当前 block 没有可识别的纠正内容。");
  const api = await client();
  const target = await api.showObject(workObjectId);
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  if (graphId !== anchor.graphId) throw new Error("当前 Graph 不是目标 WorkObject 的 Primary Anchor Graph。");
  const evidenceId = `correction-${crypto.randomUUID()}`;
  const connection = await descriptor();
  const material = await adapter.readEvidenceMaterial({ graphId, blockUuid: current.uuid }, connection.graphSnapshotKey);
  assertCommandScope(scope);
  const frozen = await api.freezeEvidence({ evidenceId, workObjectId, snapshot: material });
  assertCommandScope(scope);
  const result = await api.applyUserRealityCorrection({ workObjectId, utterance, evidenceId: frozen.evidence.id, evidenceContentHash: frozen.evidence.contentHash });
  await finishDecision(api, scope, result);
}

async function currentTaskContext(blockUuid?: string, taskOnly = true) {
  const { adapter, graphId, scope } = await adapterForCurrentGraph();
  const api = await client();
  const identity = blockUuid ? await revalidateBlockIdentity(api, blockUuid) : null;
  const workObjectId = blockUuid ? identity?.object.id : await readCommandState(currentWorkObjectKey, scope);
  if (typeof workObjectId !== "string" || !workObjectId) throw new Error("没有明确的当前 WorkObject；请先正式化当前记录。");
  const pending = taskOnly ? await resumePendingFormal(api, scope, `closure:${workObjectId}`) : null;
  const target = await api.showObject(workObjectId); assertCommandScope(scope);
  if (taskOnly && target.object.kind !== "TASK") throw new Error("这个快捷命令只处理 Task；MiniProject / Project 请在对象页查看结束评估。");
  const anchor = target.anchor as AnchorView | null; if (!anchor) throw new Error("当前 Task 没有 Primary Anchor。");
  if (graphId !== anchor.graphId) throw new Error("当前 Graph 不是目标 Task 的 Primary Anchor Graph。");
  return { api, target, anchor, adapter, graphId, scope, pending };
}
async function executeClosureOperation(value: Awaited<ReturnType<typeof currentTaskContext>>, type: "COMPLETE_WORK_OBJECT" | "CANCEL_WORK_OBJECT" | "REOPEN_WORK_OBJECT" | "AMEND_CLOSURE", input: Record<string, unknown>): Promise<{ commitId: string; title: string; delivery: string }> {
  assertCommandScope(value.scope);
  if (value.pending) {
    if (value.pending.commit.operationType !== type) throw new Error(`上次 ${value.pending.commit.operationType} 已正式提交（${value.pending.commit.id}）；请重新查看当前事项。`);
    return { commitId: value.pending.commit.id, title: value.target.object.title, delivery: await finishFormal(value.api, value.scope, value.pending) };
  }
  const snapshot = await readTargetSnapshot(value.adapter, value.graphId, value.api, value.target);
  if (!snapshot.projection) throw new Error("当前 Task 缺少 managed projection。");
  const operation = parseSemanticOperation({ operationId: `closure-${crypto.randomUUID()}`, type, actor: { type: "USER", id: "local-user" }, target: { workObjectId: value.target.object.id, expectedVersion: value.target.object.version, expectedProjectionHash: snapshot.projection.projectionHash }, input });
  const formal = await submitFormal(value.api, value.scope, `closure:${value.target.object.id}`, { kind: "COMMIT", operation, snapshot });
  const delivery = await finishFormal(value.api, value.scope, formal);
  return { commitId: formal.commit.id, title: value.target.object.title, delivery };
}

async function completeCurrentTask(): Promise<void> {
  const value = await currentTaskContext();
  if (!value.pending && value.target.object.lifecycle !== "OPEN") throw new Error("只有 OPEN Task 可以完成。");
  const completed = await executeClosureOperation(value, "COMPLETE_WORK_OBJECT", { outcomeSummary: value.target.object.title, evidenceIds: [] });
  await logseq.UI.showMsg(`已完成「${completed.title}」；${completed.delivery}\n结果：${completed.title}\n撤销：Cmd+Shift+U`, "success", { timeout: 8000 });
}

async function completeFromObservedDone(blockUuid: string): Promise<void> {
  const scope = blockIdentityCache.scope();
  if (pluginRuntime.isSelfWritten(blockUuid, true)) return;
  const value = await currentTaskContext(blockUuid);
  if (!taskUiActive || !blockIdentityCache.isCurrent(scope)) return;
  if (value.anchor.externalId !== blockUuid || value.target.object.lifecycle !== "OPEN") return;
  const completed = await executeClosureOperation(value, "COMPLETE_WORK_OBJECT", { outcomeSummary: value.target.object.title, evidenceIds: [] });
  await logseq.UI.showMsg(`已从 TODO → DONE 正式完成「${completed.title}」；${completed.delivery}\n撤销：Cmd+Shift+U`, "success", { timeout: 8000 });
}

async function cancelCurrentTask(): Promise<void> {
  const value = await currentTaskContext();
  const reason = await requestTextPrompt({ title: "取消当前 Task", label: "取消原因", initialValue: "已不再需要", confirmLabel: "确认取消" }); if (!reason) return;
  const cancelled = await executeClosureOperation(value, "CANCEL_WORK_OBJECT", { reason, replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [] });
  await logseq.UI.showMsg(`已取消「${cancelled.title}」；${cancelled.delivery}\n原因：${reason}\n撤销：Cmd+Shift+U`, "success", { timeout: 8000 });
}

async function reopenCurrentTask(): Promise<void> {
  const value = await currentTaskContext();
  const reason = await requestTextPrompt({ title: "重新打开当前 Task", label: "重新打开原因", confirmLabel: "确认重新打开" }); if (!reason) return;
  const reopened = await executeClosureOperation(value, "REOPEN_WORK_OBJECT", { reason });
  await logseq.UI.showMsg(`已重新打开「${reopened.title}」；${reopened.delivery}\n原因：${reason}`, "success", { timeout: 8000 });
}

async function showCurrentClosure(): Promise<void> {
  const value = await currentTaskContext(); const history = (await value.api.showClosure(value.target.object.id)).closure;
  await logseq.UI.showMsg(history.current ? `当前结算：${history.current.type}\n${history.current.type === "COMPLETED" ? history.current.outcomeSummary : history.current.reason}\n历史：完成 ${history.completions.length} · 取消 ${history.cancellations.length} · 修订 ${history.amendments.length} · 重开 ${history.reopens.length}` : `当前 Task 未结算。\n历史：完成 ${history.completions.length} · 取消 ${history.cancellations.length} · 修订 ${history.amendments.length} · 重开 ${history.reopens.length}`, "success", { timeout: 15000 });
}

async function amendCurrentClosure(): Promise<void> {
  const value = await currentTaskContext(); const history = (await value.api.showClosure(value.target.object.id)).closure;
  if (!history.current) throw new Error("当前 Task 没有可修订的有效 Closure。");
  const reason = await requestTextPrompt({ title: "修订当前 Task Closure", label: "修订原因" }); if (!reason) return;
  const replacement = await requestTextPrompt({ title: "修订当前 Task Closure", label: history.current.type === "COMPLETED" ? "新的完成结果" : "新的取消原因", initialValue: history.current.type === "COMPLETED" ? history.current.outcomeSummary : history.current.reason }); if (!replacement) return;
  const amended = await executeClosureOperation(value, "AMEND_CLOSURE", { targetClosureRecordId: history.current.record.id, reason, replacementOutcomeSummary: history.current.type === "COMPLETED" ? replacement : null, replacementCancellationReason: history.current.type === "CANCELLED" ? replacement : null, addEvidenceIds: [] });
  await logseq.UI.showMsg(`已修订「${amended.title}」的结算说明；${amended.delivery}原记录保持不变。`, "success");
}

async function showRecentEvidence(): Promise<void> {
  const { graphId, scope } = await adapterForCurrentGraph();
  const evidenceId = await readCommandState(recentEvidenceIdKey, scope);
  if (typeof evidenceId !== "string" || !evidenceId) throw new Error("没有最近一次 Agent Evidence。请先运行 Agent 对账命令。");
  const { evidence } = await (await client()).showEvidence(evidenceId);
  assertCommandScope(scope);
  if (evidence.graphId !== graphId) throw new Error("当前 Graph 不是最近依据的 Graph。");
  await logseq.UI.showMsg(`Task Copilot Frozen Evidence\nID：${evidence.id}\n冻结内容：${evidence.frozenContent}\nSHA-256：${evidence.contentHash}\n冻结时间：${evidence.frozenAt}`, "warning", { timeout: 30000 });
}

async function undoRecent(): Promise<void> {
  const { adapter, graphId, scope } = await adapterForCurrentGraph();
  const commitId = await readCommandState(recentCommitKey, scope);
  if (!commitId) throw new Error("没有可撤销的最近 Commit。");
  const api = await client();
  const resumed = await resumePendingFormal(api, scope, `undo:${commitId}`);
  if (resumed) { await logseq.UI.showMsg(`上次撤销已正式提交；${await finishFormal(api, scope, resumed)}`, "success"); return; }
  const original = (await api.showCommit(commitId)).commit;
  if (!original.targetId) throw new Error("Commit 没有 WorkObject target。");
  const target = await api.showObject(original.targetId), anchor = target.anchor as AnchorView;
  if (anchor.graphId !== graphId) throw new Error("当前 Graph 不是被撤销对象的 Graph。");
  const snapshot = await readTargetSnapshot(adapter, graphId, api, target);
  const formal = await submitFormal(api, scope, `undo:${commitId}`, { kind: "UNDO", commitId, operationId: `undo-${crypto.randomUUID()}`, snapshot });
  const delivery = await finishFormal(api, scope, formal);
  await logseq.UI.showMsg(`已撤销；${delivery}`, "success");
}

async function recoverIncomplete(): Promise<void> {
  const { adapter, graphId, scope } = await adapterForCurrentGraph();
  const api = await client(); const recovery = (await api.listRecovery()).recovery;
  assertCommandScope(scope);
  if (!recovery.length) { await logseq.UI.showMsg("没有需要恢复的 Commit。", "success"); return; }
  for (const item of recovery) {
    assertCommandScope(scope);
    const effect = item.commit.graphEffect as GraphEffect;
    if (effect.graphId !== graphId) continue;
    if (item.action === "ABORT_PREPARED") await api.abortPrepared(item.commit.id);
    else if (item.action === "RESUME_GRAPH_APPLY") {
      const result = await adapter.applyGraphEffect(effect);
      const actual = await readRecoveryVerificationSnapshot(effect, item.commit.targetId, {
        readAbsentProjection: (remove) => adapter.readRemovedProjectionSnapshot({ graphId: remove.graphId, sourceBlockUuid: remove.sourceBlockUuid, expectedProjection: remove.expectedProjection }),
        readTargetProjection: async (targetId) => readTargetSnapshot(adapter, graphId, api, await api.showObject(targetId)),
      });
      assertCommandScope(scope);
      const completed = await api.complete(item.commit.id, result, actual);
      if (["CREATE_WORK_OBJECT", "SET_CURRENT_FOCUS", "UPDATE_WORK_INTENT", "CHANGE_ENGAGEMENT", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE"].includes(completed.commit.operationType)) await writeCommandState(recentCommitKey, completed.commit.id, scope);
    } else if (item.action === "VERIFY_GRAPH") {
      const actual = await readRecoveryVerificationSnapshot(effect, item.commit.targetId, {
        readAbsentProjection: (remove) => adapter.readRemovedProjectionSnapshot({ graphId: remove.graphId, sourceBlockUuid: remove.sourceBlockUuid, expectedProjection: remove.expectedProjection }),
        readTargetProjection: async (targetId) => readTargetSnapshot(adapter, effect.graphId, api, await api.showObject(targetId)),
      });
      assertCommandScope(scope);
      const completed = await api.verifyRecoveredGraph(item.commit.id, actual);
      if (["CREATE_WORK_OBJECT", "SET_CURRENT_FOCUS", "UPDATE_WORK_INTENT", "CHANGE_ENGAGEMENT", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE"].includes(completed.commit.operationType)) await writeCommandState(recentCommitKey, completed.commit.id, scope);
    } else throw new Error(`Commit ${item.commit.id} 需要人工协调，未自动覆盖 Graph。`);
  }
  await logseq.UI.showMsg(`已处理 ${recovery.length} 个恢复项。`, "success");
}

async function rerenderCurrentFormalItem(): Promise<void> {
  const value = await currentTaskContext(undefined, false);
  const recovery = (await value.api.listRecovery()).recovery;
  if (recovery.length) throw new Error("存在未完成 Commit；请先运行“恢复未完成提交”。");
  const obligations = (await value.api.listProjectionObligations()).obligations.filter(item => item.workObjectId === value.target.object.id && item.status !== "VERIFIED");
  if (obligations.length) {
    await value.api.deliverFormalProjection(obligations[0]!.commitId);
    throw new Error("该事项的投影义务正在统一交付；核对完成后可重新渲染。");
  }
  assertCommandScope(value.scope);
  const version = value.target.object.version;
  const projection = await expectedProjection(value.api, value.target);
  if (value.target.object.kind === "TASK" || value.target.object.kind === "MINI_PROJECT") {
    const source = logseqBlock(await pluginRuntime.inGraph(value.scope, () => logseq.Editor.getBlock(value.anchor.externalId)));
    if (source) {
      const sourceTitle = extractTitleFromSourceLine(source.content);
      if (sourceTitle === value.target.object.title) {
        const canonical = formatFormalSource(source.rawContent, {
          kind: value.target.object.kind,
          title: sourceTitle,
          lifecycle: value.target.object.lifecycle === "COMPLETED" ? "COMPLETED" : "OPEN",
          marker: value.target.object.lifecycle === "COMPLETED" ? "DONE" : taskMarkerFromContent(source.rawContent),
        });
        if (source.rawContent !== canonical) {
          await pluginRuntime.updateSource(value.graphId, source.uuid, canonical, value.scope);
        }
      }
    }
  }
  await value.adapter.rerenderManagedProjection({ graphId: value.graphId, sourceBlockUuid: value.anchor.externalId, expectedProjection: projection });
  const after = await value.api.showObject(value.target.object.id);
  assertCommandScope(value.scope);
  if (after.object.version !== version) throw new Error("RERENDER_DOMAIN_VERSION_CHANGED");
  await logseq.UI.showMsg("已按 Writing Language v1 重新渲染当前正式事项；Formal State 与版本未改变。", "success");
}

async function guarded(label: string, action: () => Promise<void>): Promise<void> {
  if (!taskUiActive) return;
  try { await action(); } catch (error) {
    console.error(label, error);
    const message = error instanceof PrivateWriteUnconfirmedError
      ? "未能确认本机恢复记录已保存。请保留当前笔记，检查本机存储后再查看提交结果。"
      : error instanceof Error ? error.message : String(error);
    await logseq.UI.showMsg(message, "error");
  }
}

export async function startTaskCenter(): Promise<() => Promise<void>> {
  if (taskUiActive && taskUiDispose) return taskUiDispose;
  taskUiActive = true; taskUiGeneration++;
  const timers: number[] = [];
  let unsubscribeIdentities: () => void = () => undefined;
  let unregisterOnlineDoneMarker: () => void = () => undefined;
  const dispose = async () => {
    if (!taskUiActive) return;
    taskUiActive = false; taskUiGeneration++;
    for (const timer of timers) window.clearTimeout(timer);
    unsubscribeIdentities(); unregisterOnlineDoneMarker();
    hostLayoutDispose?.(); hostLayoutDispose = null; panelKeydownDispose?.(); panelKeydownDispose = null;
    blockContextTrackerDispose?.(); blockContextTrackerDispose = null;
    formalMarkerHost?.dispose(); formalMarkerHost = null; unregisterContextMenuItems();
    closeDailyPanel();
    delete (window as unknown as { taskCopilotOpenDailyPanel?: () => void }).taskCopilotOpenDailyPanel;
    delete (window as unknown as { taskCopilotReconcileEngagementForBlock?: (uuid: string) => void }).taskCopilotReconcileEngagementForBlock;
    topDocument()?.body.classList.remove("tc-sidebar-docked", "tc-sidebar-compact", "tc-sidebar-resizing");
    await logseq.hideMainUI();
  };
  taskUiDispose = dispose;
  try {
  panels.register("tasks", () => closeDailyPanel(false));
  installPanelStyle();
  installHostLayoutStyle();
  logseq.provideModel({ taskCopilotToolbarToggle: () => { if (taskUiActive) toggleDailyPanel(); } });
  registerContextMenuItems({ kind: "ORDINARY" });
  blockContextTrackerDispose = installBlockContextTracker();
  ensureFormalMarkerHost();
  unsubscribeIdentities = pluginRuntime.onIdentitiesChanged(() => {
    if (!taskUiActive) return;
    formalMarkerHost?.rescan();
    if (contextMenuHoverUuid) void syncContextMenuForUuid(contextMenuHoverUuid);
  });
  timers.push(window.setTimeout(() => { if (taskUiActive) syncToolbarState(); }, 500));
  unregisterOnlineDoneMarker = registerOnlineDoneMarkerCommand(logseq.DB, completeFromObservedDone, (error) => { console.error("online-done-marker", error); void logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "error"); }, 150, () => { const scope = blockIdentityCache.scope(); return () => taskUiActive && blockIdentityCache.isCurrent(scope); });
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-connect", label: "Task Copilot vNext：连接 Kernel" }, () => void guarded("connect", async () => {
    const value = logseq.settings?.kernelDescriptorJson;
    if (typeof value !== "string" || !value.trim()) throw new Error("请在插件设置中填写 Kernel descriptor JSON，然后再次运行连接命令。");
    await pluginRuntime.connect(value); await logseq.UI.showMsg("Kernel 已连接；Plugin Graph descriptor 已复制到私有 FileStorage。", "success");
  }));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-formalize", label: "Task Copilot vNext：正式化当前记录为 Task" }, () => void guarded("formalize", () => formalizeCurrentRecord("TASK")));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-formalize-mini-project", label: "Task Copilot vNext：正式化当前记录为 MiniProject" }, () => void guarded("formalize-mini-project", () => formalizeCurrentRecord("MINI_PROJECT")));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-agent-focus", label: "Task Copilot vNext：让 Agent 更新当前推进" }, () => void guarded("agent-current-focus", letAgentUpdateCurrentFocus));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-agent-engagement", label: "Task Copilot vNext：让 Agent 对账可行动状态" }, () => void guarded("agent-engagement", letAgentReconcileEngagement));
  logseq.App.registerCommand("$commands$", { key: "task-copilot-vnext-agent-engagement", label: "Task Copilot vNext：让 Agent 对账可行动状态" }, () => void guarded("agent-engagement", letAgentReconcileEngagement));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-complete-task", label: "Task Copilot vNext：完成当前 Task" }, () => void guarded("complete-task", completeCurrentTask));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-cancel-task", label: "Task Copilot vNext：取消当前 Task" }, () => void guarded("cancel-task", cancelCurrentTask));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-reopen-task", label: "Task Copilot vNext：重新打开当前 Task" }, () => void guarded("reopen-task", reopenCurrentTask));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-show-closure", label: "Task Copilot vNext：查看当前 Task Closure" }, () => void guarded("show-closure", showCurrentClosure));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-amend-closure", label: "Task Copilot vNext：修订当前 Task Closure" }, () => void guarded("amend-closure", amendCurrentClosure));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-show-evidence", label: "Task Copilot vNext：查看最近一次 Agent 依据", keybinding: { binding: "mod+shift+e" } }, () => void guarded("show-evidence", showRecentEvidence));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-positive-feedback", label: "Task Copilot vNext：认可最近一次 Agent 调整" }, () => void guarded("strong-positive-feedback", markRecentAgentChangeStrongPositive));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-undo", label: "Task Copilot vNext：撤销最近一次提交", keybinding: { binding: "mod+shift+u" } }, () => void guarded("undo", undoRecent));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-recover", label: "Task Copilot vNext：恢复未完成提交" }, () => void guarded("recover", recoverIncomplete));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-rerender", label: "Task Copilot vNext：重新渲染当前正式事项" }, () => void guarded("rerender", rerenderCurrentFormalItem));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-correct-reality", label: "Task Copilot vNext：纠正当前事项的现实" }, () => void guarded("correct-reality", correctCurrentReality));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-respond-decision", label: "Task Copilot vNext：回应当前决策" }, () => void guarded("respond-decision", respondToDecisionPackage));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-organize-today", label: "Task Copilot vNext：整理今天" }, () => void guarded("organize-today", organizeTodayCommand));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-open-daily", label: "Task Copilot vNext：打开今天" }, () => void guarded("open-daily", dailyPanel));
  (window as unknown as { taskCopilotOpenDailyPanel?: () => void }).taskCopilotOpenDailyPanel = () => void guarded("open-daily", dailyPanel);
  (window as unknown as { taskCopilotOpenDailyPanel?: () => void; taskCopilotReconcileEngagementForBlock?: (blockUuid: string) => void }).taskCopilotReconcileEngagementForBlock = (blockUuid) => void guarded("agent-engagement-block", () => letAgentReconcileEngagement(blockUuid));
  return dispose;
  } catch (error) {
    try { await dispose(); } catch (cleanupError) { console.error("task-ui-cleanup", cleanupError); }
    throw error;
  }
}


export async function openTaskCenter(): Promise<void> { await dailyPanel(); }
