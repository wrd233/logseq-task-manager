import { KernelClient, parsePluginKernelDescriptor } from "@task-copilot/client/browser";
import { parseSemanticOperation, stableHash, type GraphEffect, type GraphSnapshot, type ManagedProjection, type WorkMapNode, type WorkObject } from "@task-copilot/contracts";
import { graphIdentity, LogseqGraphAdapter, logseqBlock } from "./graph-adapter.ts";
import { startGraphGatewayWorker, type GraphGatewayReadHost } from "./graph-gateway-worker.ts";
import { registerOnlineDoneMarkerCommand } from "./marker-command.ts";
import { readRecoveryVerificationSnapshot } from "./recovery-verification.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "./source-identity.ts";
import { startSourceChangeObserver } from "./source-change-observer.ts";
import { requestTextPrompt } from "./text-prompt.ts";

const descriptorKey = "task-copilot-vnext-kernel-descriptor";
const recentCommitKey = "task-copilot-vnext-recent-commit";
const currentWorkObjectKey = "task-copilot-vnext-current-work-object";
const recentEvidenceIdKey = "task-copilot-vnext-recent-evidence-id";
const selfWrittenDoneMarkers = new Set<string>();
const selfWrittenSourceUuids = new Set<string>();

async function applyGraphEffect(adapter: LogseqGraphAdapter, effect: GraphEffect) {
  const writesDoneMarker = effect.type === "CHANGE_CLOSURE_FIELDS" && effect.expectedSourceMarker !== "DONE" && effect.resultingSourceMarker === "DONE";
  if (writesDoneMarker) selfWrittenDoneMarkers.add(effect.sourceBlockUuid);
  selfWrittenSourceUuids.add(effect.sourceBlockUuid);
  try { return await adapter.applyGraphEffect(effect); }
  finally {
    if (writesDoneMarker) window.setTimeout(() => selfWrittenDoneMarkers.delete(effect.sourceBlockUuid), 1_000);
    window.setTimeout(() => selfWrittenSourceUuids.delete(effect.sourceBlockUuid), 1_000);
  }
}

async function descriptor() {
  const stored = await logseq.FileStorage.getItem(descriptorKey);
  const configured = logseq.settings?.kernelDescriptorJson;
  const raw = typeof stored === "string" && stored.trim() ? stored : typeof configured === "string" ? configured : "";
  if (typeof raw !== "string" || !raw.trim()) throw new Error("请先运行“Task Copilot vNext：连接 Kernel”并导入 descriptor。");
  const descriptor = parsePluginKernelDescriptor(JSON.parse(raw));
  if (raw !== stored) await logseq.FileStorage.setItem(descriptorKey, raw.trim());
  return descriptor;
}

async function markRecentAgentChangeStrongPositive(): Promise<void> {
  const commitId = await logseq.FileStorage.getItem(recentCommitKey);
  if (typeof commitId !== "string" || !commitId) throw new Error("没有可反馈的最近 Commit。");
  await (await client()).recordStrongPositive(commitId, { type: "USER", id: "local-user" });
  await logseq.UI.showMsg("已记录明确正向反馈；不会自动修改或激活 Taste。", "success");
}


async function client(): Promise<KernelClient> { return new KernelClient(await descriptor()); }

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
  const closure = !current ? null : current.type === "COMPLETED"
    ? { type: "COMPLETED" as const, recordId: current.record.id, outcomeSummary: current.outcomeSummary }
    : { type: "CANCELLED" as const, recordId: current.record.id, reason: current.reason };
  const base = {
    containerUuid: anchor.projectionContainerUuid,
    titleUuid: anchor.projectionTitleUuid,
    stateUuid: anchor.projectionStateUuid,
    focusUuid: anchor.projectionFocusUuid,
    waitingUuid: anchor.projectionWaitingUuid,
    outcomeUuid: anchor.projectionOutcomeUuid,
    completionUuid: anchor.projectionCompletionUuid,
    title: target.object.title,
    lifecycle: target.object.lifecycle,
    engagement: target.object.engagement,
    waitingCondition: target.object.waitingCondition,
    currentFocus: target.object.currentFocus,
    desiredOutcome: target.object.desiredOutcome,
    completionChecks: target.object.completionChecks,
  };
  const core = closure ? { ...base, closure } : base;
  return { ...core, projectionHash: stableHash(core) };
}

async function readTargetSnapshot(adapter: LogseqGraphAdapter, graphId: string, api: KernelClient, target: TargetView): Promise<GraphSnapshot> {
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  return adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId, expectedProjection: await expectedProjection(api, target) });
}

async function adapterForCurrentGraph(): Promise<{ adapter: LogseqGraphAdapter; graphId: string }> {
  const graphId = graphIdentity(await logseq.App.getCurrentGraph());
  return { graphId, adapter: new LogseqGraphAdapter({
    getBlock: (uuid, options) => logseq.Editor.getBlock(uuid, options),
    insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
    updateBlock: (uuid, content) => logseq.Editor.updateBlock(uuid, content),
    removeBlock: (uuid) => logseq.Editor.removeBlock(uuid),
  }, graphId) };
}

function gatewayBlock(value: unknown, fallbackPage: string | null = null): { uuid: string; content: string; pageName: string | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>; const content = typeof item.title === "string" ? item.title : typeof item.content === "string" ? item.content : null;
  if (typeof item.uuid !== "string" || content === null) return null;
  const page = item.page && typeof item.page === "object" && !Array.isArray(item.page) ? item.page as Record<string, unknown> : null;
  return { uuid: item.uuid, content, pageName: typeof page?.name === "string" ? page.name : fallbackPage };
}

function graphGatewayReadHost(): GraphGatewayReadHost {
  return {
    search: async (query, limit) => {
      const rows = await logseq.DB.datascriptQuery(`[:find ?uuid ?content ?page-name :where [?b :block/uuid ?uuid] [?b :block/content ?content] [?b :block/page ?p] [?p :block/name ?page-name]]`) as unknown;
      if (!Array.isArray(rows)) return [];
      const needle = query.toLocaleLowerCase(); const matches: Array<{ uuid: string; content: string; pageName: string | null }> = [];
      for (const row of rows) {
        if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[1] !== "string") continue;
        if (!row[1].toLocaleLowerCase().includes(needle)) continue;
        matches.push({ uuid: row[0], content: row[1], pageName: typeof row[2] === "string" ? row[2] : null });
        if (matches.length >= limit) break;
      }
      return matches;
    },
    readBlock: async (uuid) => gatewayBlock(await logseq.Editor.getBlock(uuid, { includeChildren: true })),
    readPage: async (pageName) => {
      const roots = await logseq.Editor.getPageBlocksTree(pageName); if (!roots) return null;
      const values: Array<{ uuid: string; content: string; pageName: string | null }> = [];
      const visit = (candidate: unknown) => {
        const item = gatewayBlock(candidate, pageName); if (item) values.push(item);
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          const children = (candidate as Record<string, unknown>).children; if (Array.isArray(children)) for (const child of children) visit(child);
        }
      };
      for (const root of roots) visit(root); return values;
    },
  };
}

async function formalizeCurrentRecord(kind: "TASK" | "MINI_PROJECT" = "TASK"): Promise<void> {
  const current = logseqBlock(await logseq.Editor.getCurrentBlock());
  if (!current) throw new Error("请先把光标放在一条自然记录上。");
  const stable = await ensurePersistentSourceIdentity({
    getBlock: (uuid) => logseq.Editor.getBlock(uuid),
    upsertBlockProperty: (uuid, key, value) => logseq.Editor.upsertBlockProperty(uuid, key, value),
  }, { uuid: current.uuid, content: current.content, isDbGraph: await currentGraphIsDb(logseq.App) });
  const api = await client(); const { adapter, graphId } = await adapterForCurrentGraph();
  const snapshot = await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: stable.uuid });
  const title = stable.content.split("\n")[0]!.replace(/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "");
  const operation = parseSemanticOperation({ operationId: `formalize-${crypto.randomUUID()}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind, title, anchor: { graphId, blockUuid: stable.uuid, sourceContentHash: snapshot.sourceContentHash } } });
  const formal = await api.commitFormal(operation, snapshot);
  let result;
  try { result = await adapter.applyGraphEffect(formal.graphEffect); }
  catch (error) {
    await api.graphProjectionFailed(formal.commit.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
  await api.verifyFormalProjection(formal.commit.id, result, await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: stable.uuid }));
  await logseq.FileStorage.setItem(recentCommitKey, formal.commit.id);
  if (formal.commit.targetId) await logseq.FileStorage.setItem(currentWorkObjectKey, formal.commit.targetId);
  await logseq.UI.showMsg(`已正式化；Commit ${formal.commit.id}`, "success");
}

async function letAgentUpdateCurrentFocus(): Promise<void> {
  const workObjectId = await logseq.FileStorage.getItem(currentWorkObjectKey);
  if (typeof workObjectId !== "string" || !workObjectId) throw new Error("没有明确的当前 WorkObject；请先正式化当前记录。");
  const selected = logseqBlock(await logseq.Editor.getCurrentBlock());
  if (!selected) throw new Error("请把光标放在要冻结为 Evidence 的 Logseq block 上。");
  const api = await client();
  const target = await api.showObject(workObjectId);
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  const { adapter, graphId } = await adapterForCurrentGraph();
  if (graphId !== anchor.graphId) throw new Error("当前 Graph 不是目标 WorkObject 的 Primary Anchor Graph。");
  const evidenceId = `evidence-${crypto.randomUUID()}`;
  const connection = await descriptor();
  const evidenceMaterial = await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey);
  const frozen = await api.freezeEvidence({ evidenceId, workObjectId, snapshot: evidenceMaterial });
  const targetSnapshot = await readTargetSnapshot(adapter, graphId, api, target);
  const run = await api.runCurrentFocusAgent({ runId: `agent-run-${crypto.randomUUID()}`, workObjectId, evidenceIds: [frozen.evidence.id], snapshot: targetSnapshot });
  if (!run.proposal) {
    await logseq.UI.showMsg(`Fake Agent 未提出变更；${run.run.reasonCode}；AgentRun ${run.run.id}`, "success");
    return;
  }
  const fresh = await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey);
  const pending = await api.applyProposal(run.proposal.id, {
    operationId: `apply-focus-${crypto.randomUUID()}`,
    snapshot: await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId }),
    evidence: [{ evidenceId, ...fresh }],
  });
  let result;
  try { result = await adapter.applyGraphEffect(pending.graphEffect as GraphEffect); }
  catch (error) {
    await api.failGraphApply(pending.commit.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
  const committed = await api.complete(pending.commit.id, result, await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId }));
  await logseq.FileStorage.setItem(recentCommitKey, committed.commit.id);
  await logseq.FileStorage.setItem(recentEvidenceIdKey, evidenceId);
  await logseq.UI.showMsg(`Fake Agent 已更新当前推进；Commit ${committed.commit.id}；Evidence ${evidenceId}；可用“撤销最近一次提交”恢复。`, "success");
}

async function letAgentReconcileEngagement(): Promise<void> {
  const workObjectId = await logseq.FileStorage.getItem(currentWorkObjectKey);
  if (typeof workObjectId !== "string" || !workObjectId) throw new Error("没有明确的当前 WorkObject；请先正式化当前记录。");
  const selected = logseqBlock(await logseq.Editor.getCurrentBlock());
  if (!selected) throw new Error("请把光标放在要冻结为 Evidence 的 Logseq block 上。");
  const api = await client();
  const target = await api.showObject(workObjectId);
  const anchor = target.anchor as AnchorView | null;
  if (!anchor) throw new Error("当前 WorkObject 没有 Primary Anchor。");
  const { adapter, graphId } = await adapterForCurrentGraph();
  if (graphId !== anchor.graphId) throw new Error("当前 Graph 不是目标 WorkObject 的 Primary Anchor Graph。");
  const connection = await descriptor();
  const evidenceId = `evidence-${crypto.randomUUID()}`;
  const frozen = await api.freezeEvidence({ evidenceId, workObjectId, snapshot: await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey) });
  const run = await api.runEngagementAgent({ runId: `agent-run-${crypto.randomUUID()}`, workObjectId, evidenceIds: [frozen.evidence.id], snapshot: await readTargetSnapshot(adapter, graphId, api, target) });
  if (!run.proposal || !run.revision) {
    await logseq.UI.showMsg(`Engagement 未变化；${run.run.reasonCode}；AgentRun ${run.run.id}`, "warning");
    return;
  }
  const pending = await api.applyProposal(run.proposal.id, { operationId: `apply-engagement-${crypto.randomUUID()}`, snapshot: await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId }), evidence: [{ evidenceId, ...await adapter.readEvidenceMaterial({ graphId, blockUuid: selected.uuid }, connection.graphSnapshotKey) }] });
  let result;
  try { result = await adapter.applyGraphEffect(pending.graphEffect as GraphEffect); }
  catch (error) { await api.failGraphApply(pending.commit.id, error instanceof Error ? error.message : String(error)); throw error; }
  const committed = await api.complete(pending.commit.id, result, await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: anchor.externalId }));
  await logseq.FileStorage.setItem(recentCommitKey, committed.commit.id);
  await logseq.FileStorage.setItem(recentEvidenceIdKey, evidenceId);
  const transition = run.revision.transition;
  const waiting = transition.waiting?.description ? `\n等待：${transition.waiting.description}` : "\n原等待条件已满足并清除。";
  await logseq.UI.showMsg(`Task Copilot：事项状态已变化\n${target.object.title}\n${transition.from} → ${transition.to}${waiting}\n依据：当前记录（Evidence ${evidenceId}）\n查看依据：运行“Task Copilot vNext：查看最近一次 Agent 依据”\n撤销：Cmd+Shift+U`, "warning", { timeout: 12000 });
}

async function organizeTodayCommand(): Promise<void> {
  const api = await client();
  const result = await api.organizeToday();
  const pending = result.maturePackages.length;
  const suffix = pending > 0 ? `\n有 ${pending} 个成熟候选已生成决策包；运行“Task Copilot vNext：回应当前决策”处理。` : "";
  await logseq.UI.showMsg(`Task Copilot：整理今天\n${result.summaryText}${suffix}`, pending > 0 ? "warning" : "success", { timeout: 12000 });
}

async function acceptDecisionPackage(packageId: string): Promise<boolean> {
  const api = await client();
  const pkg = (await api.listDecisionPackages("OPEN")).packages.find((item) => item.id === packageId);
  if (!pkg) { await logseq.UI.showMsg("这条建议已经不在待确认列表里了。", "warning"); return false; }
  const event = await api.createTrustedUserEvent({ exactUserUtterance: "确认", packageId: pkg.id, presentationRevision: pkg.presentationRevision });
  const compiled = await api.compileUserDecision({ trustedUserEventId: event.event.id });
  if (compiled.kind !== "AUTHORIZED_DECISION") {
    await logseq.UI.showMsg(compiled.kind === "STALE" ? "这个建议刚刚发生了变化，请重新看一下。" : "这条确认没有形成授权，没有执行任何正式变化。", "warning");
    return false;
  }
  const executed = await api.executeUserDecision(compiled.decision.id);
  await logseq.FileStorage.setItem(recentCommitKey, executed.commit.id);
  await logseq.UI.showMsg("已按你的授权执行。", "success");
  return true;
}

async function deferDecisionPackage(packageId: string): Promise<void> {
  const api = await client();
  await api.deferDecisionPackage(packageId);
  await logseq.UI.showMsg("已暂不处理；不会改变候选或 Taste，之后整理时还可以重新出现。", "success");
}

async function respondToDecisionPackage(packageId?: string): Promise<void> {
  const api = await client();
  const open = (await api.listDecisionPackages("OPEN")).packages;
  if (!open.length) throw new Error("当前没有待回应的决策。");
  if (packageId) { await acceptDecisionPackage(packageId); return; }
  const pkg = open[0] ?? null;
  if (!pkg) throw new Error("没有选中有效的 Decision Package。");
  const utterance = await requestTextPrompt({ title: `回应当前决策：${pkg.summary}`, label: "你的回应（同意 / 好的 / 确认 …）", initialValue: "同意", confirmLabel: "提交回应" });
  if (!utterance) return;
  const event = await api.createTrustedUserEvent({ exactUserUtterance: utterance, packageId: pkg.id, presentationRevision: pkg.presentationRevision });
  const compiled = await api.compileUserDecision({ trustedUserEventId: event.event.id });
  if (compiled.kind !== "AUTHORIZED_DECISION") {
    await logseq.UI.showMsg(`未执行：${compiled.kind === "NEEDS_CLARIFICATION" ? "回应不明确" : compiled.kind === "STALE" ? "决策已过期" : "未获得授权"}`, "warning");
    return;
  }
  const executed = await api.executeUserDecision(compiled.decision.id);
  await logseq.FileStorage.setItem(recentCommitKey, executed.commit.id);
  await logseq.UI.showMsg(`已按你的授权执行；Commit ${executed.commit.id}`, "success");
}

async function dailyPanel(): Promise<void> {
  const api = await client();
  const [now, confirmations, workMap, system] = await Promise.all([api.nowProjection(), api.confirmationProjection(), api.workMapProjection(), api.systemProjection()]);
  const root = document.createElement("div");
  root.dataset.taskCopilotDailyPanel = "true";
  root.style.cssText = "box-sizing:border-box;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.32);font-family:var(--ls-font-family,system-ui,sans-serif);";
  const panel = document.createElement("div");
  panel.style.cssText = "box-sizing:border-box;width:min(720px,100%);max-height:92vh;overflow:auto;padding:20px;border-radius:12px;background:var(--ls-primary-background-color,#fff);color:var(--ls-primary-text-color,#222);box-shadow:0 20px 60px rgba(0,0,0,.3);";
  const close = document.createElement("button"); close.textContent = "关闭"; close.style.cssText = "float:right;border:1px solid #ccc;border-radius:6px;background:transparent;padding:4px 10px;cursor:pointer;color:inherit;"; close.onclick = () => { root.remove(); void logseq.hideMainUI({ restoreEditingCursor: true }); };
  const tabs = document.createElement("div"); tabs.style.cssText = "display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;";
  const view = document.createElement("div");
  const render = (name: string) => {
    tabs.querySelectorAll("button").forEach((button) => { (button as HTMLButtonElement).disabled = false; button.style.fontWeight = "600"; button.style.opacity = "0.75"; });
    const active = tabs.querySelector(`[data-tab="${name}"]`) as HTMLButtonElement | null;
    if (active) { active.disabled = true; active.style.opacity = "1"; active.style.fontWeight = "700"; }
    if (name === "now") {
      view.replaceChildren();
      const title = document.createElement("h2"); title.textContent = "现在"; title.style.cssText = "margin:0 0 10px;font-size:22px;";
      view.append(title);
      if (!now.items.length) { const empty = document.createElement("p"); empty.textContent = "目前没有特别需要你恢复的工作。"; empty.style.cssText = "color:#777;"; view.append(empty); }
      for (const item of now.items) {
        const card = document.createElement("section"); card.style.cssText = "border:1px solid #e3e3e3;border-radius:10px;padding:12px;margin-bottom:10px;";
        const h = document.createElement("h3"); h.textContent = item.title; h.style.cssText = "margin:0 0 4px;font-size:17px;";
        const why = document.createElement("p"); why.textContent = item.whyNow; why.style.cssText = "margin:0 0 4px;font-size:13px;color:#555;";
        const reality = document.createElement("p"); reality.textContent = item.currentReality; reality.style.cssText = "margin:0 0 4px;font-size:14px;";
        const cont = document.createElement("p"); cont.textContent = `继续：${item.continuationPoint}`; cont.style.cssText = "margin:0 0 8px;font-size:13px;color:#333;";
        card.append(h, why, reality, cont);
        if (item.workObjectId) {
          const open = document.createElement("button"); open.textContent = "打开 Logseq 原文"; open.style.cssText = "border:1px solid #bbb;border-radius:6px;background:transparent;padding:5px 10px;cursor:pointer;color:inherit;margin-right:6px;";
          open.onclick = () => { void openObjectAnchor(api, item.workObjectId!); };
          const discuss = document.createElement("button"); discuss.textContent = "和 Agent 讨论"; discuss.style.cssText = "border:1px solid #bbb;border-radius:6px;background:var(--ls-link-text-color,#4f74b8);color:#fff;padding:5px 10px;cursor:pointer;";
          discuss.onclick = () => { void openObjectConversation(api, item.workObjectId!, item.title); };
          card.append(open, discuss);
        }
        view.append(card);
      }
    } else if (name === "confirm") {
      view.replaceChildren();
      const h = document.createElement("h2"); h.textContent = "待我确认"; h.style.cssText = "margin:0 0 10px;font-size:22px;";
      view.append(h);
      if (!confirmations.items.length) { const empty = document.createElement("p"); empty.textContent = "现在没有需要你确认的边界决定。"; empty.style.cssText = "color:#777;"; view.append(empty); }
      for (const item of confirmations.items) {
        const card = document.createElement("section"); card.style.cssText = "border:1px solid #e3e3e3;border-radius:10px;padding:12px;margin-bottom:10px;";
        const title = document.createElement("h3"); title.textContent = item.title; title.style.cssText = "margin:0 0 6px;font-size:17px;";
        const impact = document.createElement("p"); impact.textContent = item.impact; impact.style.cssText = "margin:0 0 4px;font-size:14px;color:#222;";
        const why = document.createElement("p"); why.textContent = item.whyNow; why.style.cssText = "margin:0 0 10px;font-size:13px;color:#555;";
        const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
        const accept = document.createElement("button"); accept.textContent = "确认"; accept.disabled = item.status === "STALE"; accept.style.cssText = "border:1px solid #bbb;border-radius:6px;background:var(--ls-link-text-color,#4f74b8);color:#fff;padding:6px 14px;cursor:pointer;";
        accept.onclick = () => { root.remove(); void logseq.hideMainUI({ restoreEditingCursor: true }); void guarded("accept-decision", async () => { if (await acceptDecisionPackage(item.packageId)) await dailyPanel(); }); };
        const defer = document.createElement("button"); defer.textContent = "暂不"; defer.style.cssText = "border:1px solid #bbb;border-radius:6px;background:transparent;padding:6px 14px;cursor:pointer;color:inherit;";
        defer.onclick = () => { root.remove(); void logseq.hideMainUI({ restoreEditingCursor: true }); void guarded("defer-decision", () => deferDecisionPackage(item.packageId)); };
        actions.append(accept, defer); card.append(title, impact, why, actions); view.append(card);
      }
    } else if (name === "projects") {
      view.replaceChildren();
      const h = document.createElement("h2"); h.textContent = "项目"; h.style.cssText = "margin:0 0 10px;font-size:22px;";
      view.append(h);
      const renderNode = (node: WorkMapNode, depth: number) => {
        const row = document.createElement("div"); row.style.cssText = `margin-left:${depth * 14}px;padding:5px 0;font-size:14px;`;
        const kindLabel = node.kind === "PROJECT" ? "项目" : node.kind === "MINI_PROJECT" ? "子项目" : "任务";
        const statusText = node.engagement === "WAITING" ? " · 等待" : node.currentFocus ? ` · ${node.currentFocus}` : "";
        const label = document.createElement("span"); label.textContent = `${node.title}${statusText}`;
        const kind = document.createElement("span"); kind.textContent = kindLabel; kind.style.cssText = "margin-left:6px;font-size:11px;color:#888;";
        const open = document.createElement("button"); open.textContent = "打开"; open.style.cssText = "margin-left:8px;border:none;background:transparent;color:var(--ls-link-text-color,#4f74b8);cursor:pointer;";
        open.onclick = () => { void openObjectAnchor(api, node.workObjectId); };
        row.append(label, kind, open); view.append(row);
        for (const child of node.children) renderNode(child, depth + 1);
      };
      for (const node of workMap.roots) renderNode(node, 0);
    } else {
      view.replaceChildren();
      const h = document.createElement("h2"); h.textContent = "更多"; h.style.cssText = "margin:0 0 10px;font-size:22px;";
      const rows = [
        `图连接：${system.graphAvailable ? "正常" : "离线"}`,
        `后台维护：${system.maintenancePaused ? "已暂停" : "运行中"}`,
        `笔记同步待处理：${system.projectionBacklog}`,
        `系统恢复项：${system.recoveryCount}`,
        system.lastDiscovery ? `最近整理：${system.lastDiscovery.summaryText}` : "最近整理：还没有运行",
      ];
      for (const text of rows) { const p = document.createElement("p"); p.textContent = text; p.style.cssText = "margin:0 0 6px;font-size:14px;color:#444;"; view.append(p); }
      const organize = document.createElement("button"); organize.textContent = "运行整理今天"; organize.style.cssText = "border:1px solid #bbb;border-radius:6px;background:var(--ls-link-text-color,#4f74b8);color:#fff;padding:6px 12px;cursor:pointer;";
      organize.onclick = () => { root.remove(); void logseq.hideMainUI({ restoreEditingCursor: true }); void guarded("organize-today", organizeTodayCommand); };
      view.append(organize);
    }
  };
  for (const [key, label] of [["now", "现在"], ["confirm", "待我确认"], ["projects", "项目"], ["more", "更多"]] as const) {
    const button = document.createElement("button"); button.dataset.tab = key; button.textContent = label; button.style.cssText = "border:1px solid #ccc;border-radius:6px;background:transparent;padding:5px 10px;cursor:pointer;color:inherit;";
    button.onclick = () => render(key); tabs.append(button);
  }
  panel.append(close, tabs, view); root.append(panel);
  document.body.replaceChildren(root);
  logseq.setMainUIAttrs({ draggable: true, resizable: true });
  logseq.setMainUIInlineStyle({ position: "fixed", inset: "0", zIndex: 10000, pointerEvents: "auto", background: "transparent" });
  logseq.showMainUI({ autoFocus: true });
  render("now");
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

async function currentTaskContext() {
  const workObjectId = await logseq.FileStorage.getItem(currentWorkObjectKey);
  if (typeof workObjectId !== "string" || !workObjectId) throw new Error("没有明确的当前 WorkObject；请先正式化当前记录。");
  const api = await client(); const target = await api.showObject(workObjectId);
  if (target.object.kind !== "TASK") throw new Error("Phase 5 仅支持 Task Closure；MiniProject / Project 仍明确拒绝。");
  const anchor = target.anchor as AnchorView | null; if (!anchor) throw new Error("当前 Task 没有 Primary Anchor。");
  const { adapter, graphId } = await adapterForCurrentGraph(); if (graphId !== anchor.graphId) throw new Error("当前 Graph 不是目标 Task 的 Primary Anchor Graph。");
  return { api, target, anchor, adapter, graphId };
}

async function executeClosureOperation(type: "COMPLETE_WORK_OBJECT" | "CANCEL_WORK_OBJECT" | "REOPEN_WORK_OBJECT" | "AMEND_CLOSURE", input: Record<string, unknown>): Promise<{ commitId: string; title: string }> {
  const value = await currentTaskContext(); const snapshot = await readTargetSnapshot(value.adapter, value.graphId, value.api, value.target);
  if (!snapshot.projection) throw new Error("当前 Task 缺少 managed projection。");
  const operation = parseSemanticOperation({ operationId: `closure-${crypto.randomUUID()}`, type, actor: { type: "USER", id: "local-user" }, target: { workObjectId: value.target.object.id, expectedVersion: value.target.object.version, expectedProjectionHash: snapshot.projection.projectionHash }, input });
  const pending = await value.api.prepare(operation, snapshot);
  let result; try { result = await applyGraphEffect(value.adapter, pending.graphEffect as GraphEffect); } catch (error) { await value.api.failGraphApply(pending.commit.id, error instanceof Error ? error.message : String(error)); throw error; }
  const committed = await value.api.complete(pending.commit.id, result, await value.adapter.readGraphSnapshot({ graphId: value.graphId, sourceBlockUuid: value.anchor.externalId }));
  await logseq.FileStorage.setItem(recentCommitKey, committed.commit.id); return { commitId: committed.commit.id, title: value.target.object.title };
}

async function completeCurrentTask(): Promise<void> {
  const value = await currentTaskContext();
  if (value.target.object.lifecycle !== "OPEN") throw new Error("只有 OPEN Task 可以完成。");
  const completed = await executeClosureOperation("COMPLETE_WORK_OBJECT", { outcomeSummary: value.target.object.title, evidenceIds: [] });
  await logseq.UI.showMsg(`已完成「${completed.title}」\n结果：${completed.title}\n撤销：Cmd+Shift+U`, "success", { timeout: 8000 });
}

async function completeFromObservedDone(blockUuid: string): Promise<void> {
  if (selfWrittenDoneMarkers.has(blockUuid)) return;
  const value = await currentTaskContext();
  if (value.anchor.externalId !== blockUuid || value.target.object.lifecycle !== "OPEN") return;
  const completed = await executeClosureOperation("COMPLETE_WORK_OBJECT", { outcomeSummary: value.target.object.title, evidenceIds: [] });
  await logseq.UI.showMsg(`已从 TODO → DONE 正式完成「${completed.title}」\n撤销：Cmd+Shift+U`, "success", { timeout: 8000 });
}

async function cancelCurrentTask(): Promise<void> {
  const reason = await requestTextPrompt({ title: "取消当前 Task", label: "取消原因", initialValue: "已不再需要", confirmLabel: "确认取消" }); if (!reason) return;
  const cancelled = await executeClosureOperation("CANCEL_WORK_OBJECT", { reason, replacementWorkObjectId: null, remainingWorkNote: null, evidenceIds: [] });
  await logseq.UI.showMsg(`已取消「${cancelled.title}」\n原因：${reason}\n撤销：Cmd+Shift+U`, "success", { timeout: 8000 });
}

async function reopenCurrentTask(): Promise<void> {
  const reason = await requestTextPrompt({ title: "重新打开当前 Task", label: "重新打开原因", confirmLabel: "确认重新打开" }); if (!reason) return;
  const reopened = await executeClosureOperation("REOPEN_WORK_OBJECT", { reason });
  await logseq.UI.showMsg(`已重新打开「${reopened.title}」\n原因：${reason}`, "success", { timeout: 8000 });
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
  const amended = await executeClosureOperation("AMEND_CLOSURE", { targetClosureRecordId: history.current.record.id, reason, replacementOutcomeSummary: history.current.type === "COMPLETED" ? replacement : null, replacementCancellationReason: history.current.type === "CANCELLED" ? replacement : null, addEvidenceIds: [] });
  await logseq.UI.showMsg(`已修订「${amended.title}」的结算说明；原记录保持不变。`, "success");
}

async function showRecentEvidence(): Promise<void> {
  const evidenceId = await logseq.FileStorage.getItem(recentEvidenceIdKey);
  if (typeof evidenceId !== "string" || !evidenceId) throw new Error("没有最近一次 Agent Evidence。请先运行 Agent 对账命令。");
  const { evidence } = await (await client()).showEvidence(evidenceId);
  await logseq.UI.showMsg(`Task Copilot Frozen Evidence\nID：${evidence.id}\n冻结内容：${evidence.frozenContent}\nSHA-256：${evidence.contentHash}\n冻结时间：${evidence.frozenAt}`, "warning", { timeout: 30000 });
}

async function undoRecent(): Promise<void> {
  const commitId = await logseq.FileStorage.getItem(recentCommitKey);
  if (typeof commitId !== "string" || !commitId) throw new Error("没有可撤销的最近 Commit。");
  const api = await client(); const original = (await api.showCommit(commitId)).commit;
  if (!original.targetId) throw new Error("Commit 没有 WorkObject target。");
  const target = await api.showObject(original.targetId); const anchor = target.anchor as AnchorView;
  const { adapter } = await adapterForCurrentGraph();
  const snapshot = await readTargetSnapshot(adapter, anchor.graphId, api, target);
  const pending = await api.prepareUndo(commitId, { operationId: `undo-${crypto.randomUUID()}`, actor: { type: "USER", id: "local-user" }, snapshot });
  const result = await adapter.applyGraphEffect(pending.graphEffect as GraphEffect);
  const committed = await api.complete(pending.commit.id, result, await adapter.readGraphSnapshot({ graphId: anchor.graphId, sourceBlockUuid: anchor.externalId }));
  await logseq.UI.showMsg(`已安全撤销；补偿 Commit ${committed.commit.id}`, "success");
}

async function recoverIncomplete(): Promise<void> {
  const api = await client(); const recovery = (await api.listRecovery()).recovery;
  if (!recovery.length) { await logseq.UI.showMsg("没有需要恢复的 Commit。", "success"); return; }
  const { adapter } = await adapterForCurrentGraph();
  for (const item of recovery) {
    const effect = item.commit.graphEffect as GraphEffect;
    if (item.action === "ABORT_PREPARED") await api.abortPrepared(item.commit.id);
    else if (item.action === "RESUME_GRAPH_APPLY") {
      const result = await applyGraphEffect(adapter, effect);
      const completed = await api.complete(item.commit.id, result, await adapter.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid }));
      if (["CREATE_WORK_OBJECT", "SET_CURRENT_FOCUS", "UPDATE_WORK_INTENT", "CHANGE_ENGAGEMENT", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE"].includes(completed.commit.operationType)) await logseq.FileStorage.setItem(recentCommitKey, completed.commit.id);
    } else if (item.action === "VERIFY_GRAPH") {
      const actual = await readRecoveryVerificationSnapshot(effect, item.commit.targetId, {
        readAbsentProjection: (remove) => adapter.readRemovedProjectionSnapshot({ graphId: remove.graphId, sourceBlockUuid: remove.sourceBlockUuid, expectedProjection: remove.expectedProjection }),
        readTargetProjection: async (targetId) => readTargetSnapshot(adapter, effect.graphId, api, await api.showObject(targetId)),
      });
      const completed = await api.verifyRecoveredGraph(item.commit.id, actual);
      if (["CREATE_WORK_OBJECT", "SET_CURRENT_FOCUS", "UPDATE_WORK_INTENT", "CHANGE_ENGAGEMENT", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE"].includes(completed.commit.operationType)) await logseq.FileStorage.setItem(recentCommitKey, completed.commit.id);
    } else throw new Error(`Commit ${item.commit.id} 需要人工协调，未自动覆盖 Graph。`);
  }
  await logseq.UI.showMsg(`已处理 ${recovery.length} 个恢复项。`, "success");
}

async function rerenderCurrentFormalItem(): Promise<void> {
  const value = await currentTaskContext();
  const recovery = (await value.api.listRecovery()).recovery;
  if (recovery.length) throw new Error("存在未完成 Commit；请先运行“恢复未完成提交”。");
  const version = value.target.object.version;
  const projection = await expectedProjection(value.api, value.target);
  await value.adapter.rerenderManagedProjection({ graphId: value.graphId, sourceBlockUuid: value.anchor.externalId, expectedProjection: projection });
  const after = await value.api.showObject(value.target.object.id);
  if (after.object.version !== version) throw new Error("RERENDER_DOMAIN_VERSION_CHANGED");
  await logseq.UI.showMsg("已按 Writing Language v1 重新渲染当前正式事项；Formal State 与版本未改变。", "success");
}

async function guarded(label: string, action: () => Promise<void>): Promise<void> {
  try { await action(); } catch (error) { console.error(label, error); await logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "error"); }
}

async function main(): Promise<void> {
  const unregisterOnlineDoneMarker = registerOnlineDoneMarkerCommand(logseq.DB, completeFromObservedDone, (error) => { console.error("online-done-marker", error); void logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "error"); });
  const stopGraphWorker = startGraphGatewayWorker({
    connection: async () => { const connection = await descriptor(); const value = await adapterForCurrentGraph(); return { descriptor: connection, ...value, readHost: graphGatewayReadHost() }; },
    onError: (error) => { if (error instanceof Error && !/请先运行|GRAPH_BRIDGE_TOKEN_MISSING/u.test(error.message)) console.warn("graph-gateway-worker", error); },
  });
  const stopSourceObserver = startSourceChangeObserver({
    onChanged: (callback) => logseq.DB.onChanged(callback),
    getCurrentGraph: () => logseq.App.getCurrentGraph(),
    getBlockContext: async (uuid) => {
      const block = logseqBlock(await logseq.Editor.getBlock(uuid));
      if (!block) return null;
      const page = (await logseq.Editor.getBlock(uuid)) as { page?: { name?: unknown } } | null;
      return { pageName: typeof page?.page?.name === "string" ? page.page.name : null, content: block.content };
    },
    getPageBlocksTree: async (pageName) => {
      const tree = await logseq.Editor.getPageBlocksTree(pageName);
      return tree as Array<{ uuid: string; content?: string; children?: unknown[] }> | null;
    },
  }, {
    client: () => client(),
    isSelfWritten: (uuid) => selfWrittenSourceUuids.has(uuid),
    onError: (error) => { if (error instanceof Error && !/请先运行|DESCRIPTOR_INVALID/u.test(error.message)) console.warn("source-change-observer", error); },
  });
  logseq.beforeunload(async () => { stopSourceObserver(); stopGraphWorker(); unregisterOnlineDoneMarker(); await logseq.hideMainUI(); });
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-connect", label: "Task Copilot vNext：连接 Kernel" }, () => void guarded("connect", async () => {
    const value = logseq.settings?.kernelDescriptorJson;
    if (typeof value !== "string" || !value.trim()) throw new Error("请在插件设置中填写 Kernel descriptor JSON，然后再次运行连接命令。");
    parsePluginKernelDescriptor(JSON.parse(value)); await logseq.FileStorage.setItem(descriptorKey, value.trim()); await logseq.UI.showMsg("Kernel 已连接；Plugin Graph descriptor 已复制到私有 FileStorage。", "success");
  }));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-formalize", label: "Task Copilot vNext：正式化当前记录为 Task" }, () => void guarded("formalize", () => formalizeCurrentRecord("TASK")));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-formalize-mini-project", label: "Task Copilot vNext：正式化当前记录为 MiniProject" }, () => void guarded("formalize-mini-project", () => formalizeCurrentRecord("MINI_PROJECT")));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-agent-focus", label: "Task Copilot vNext：让 Agent 更新当前推进" }, () => void guarded("agent-current-focus", letAgentUpdateCurrentFocus));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-agent-engagement", label: "Task Copilot vNext：让 Agent 对账可行动状态" }, () => void guarded("agent-engagement", letAgentReconcileEngagement));
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
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-respond-decision", label: "Task Copilot vNext：回应当前决策" }, () => void guarded("respond-decision", respondToDecisionPackage));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-organize-today", label: "Task Copilot vNext：整理今天" }, () => void guarded("organize-today", organizeTodayCommand));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-open-daily", label: "Task Copilot vNext：打开今天" }, () => void guarded("open-daily", dailyPanel));
  (window as unknown as { taskCopilotOpenDailyPanel?: () => void }).taskCopilotOpenDailyPanel = () => void guarded("open-daily", dailyPanel);
  await logseq.UI.showMsg("Task Copilot vNext 已就绪。", "success");
}

logseq.useSettingsSchema([{
  key: "kernelDescriptorJson",
  type: "string",
  default: "",
  title: "Plugin Graph descriptor JSON",
  description: "从本机 graph-adapter.json 复制；校验后写入 Plugin 私有 FileStorage，不进入 Graph 或日志。",
}]);
logseq.ready(main).catch((error) => console.error("Task Copilot vNext bootstrap failed", error));
