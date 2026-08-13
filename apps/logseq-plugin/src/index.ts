import { KernelClient, parseKernelDescriptor } from "@task-copilot/client/browser";
import { parseSemanticOperation, stableHash, type GraphEffect, type GraphSnapshot, type ManagedProjection, type WorkObject } from "@task-copilot/contracts";
import { graphIdentity, LogseqGraphAdapter, logseqBlock } from "./graph-adapter.ts";
import { registerOnlineDoneMarkerCommand } from "./marker-command.ts";
import { requestTextPrompt } from "./text-prompt.ts";

const descriptorKey = "task-copilot-vnext-kernel-descriptor";
const recentCommitKey = "task-copilot-vnext-recent-commit";
const currentWorkObjectKey = "task-copilot-vnext-current-work-object";
const recentEvidenceIdKey = "task-copilot-vnext-recent-evidence-id";
const selfWrittenDoneMarkers = new Set<string>();

async function applyGraphEffect(adapter: LogseqGraphAdapter, effect: GraphEffect) {
  const writesDoneMarker = effect.type === "CHANGE_CLOSURE_FIELDS" && effect.expectedSourceMarker !== "DONE" && effect.resultingSourceMarker === "DONE";
  if (writesDoneMarker) selfWrittenDoneMarkers.add(effect.sourceBlockUuid);
  try { return await adapter.applyGraphEffect(effect); }
  finally {
    if (writesDoneMarker) window.setTimeout(() => selfWrittenDoneMarkers.delete(effect.sourceBlockUuid), 1_000);
  }
}

async function descriptor() {
  const stored = await logseq.FileStorage.getItem(descriptorKey);
  const configured = logseq.settings?.kernelDescriptorJson;
  const raw = typeof stored === "string" && stored.trim() ? stored : typeof configured === "string" ? configured : "";
  if (typeof raw !== "string" || !raw.trim()) throw new Error("请先运行“Task Copilot vNext：连接 Kernel”并导入 descriptor。");
  const descriptor = parseKernelDescriptor(JSON.parse(raw));
  if (raw !== stored) await logseq.FileStorage.setItem(descriptorKey, raw.trim());
  return descriptor;
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
    title: target.object.title,
    lifecycle: target.object.lifecycle,
    engagement: target.object.engagement,
    waitingCondition: target.object.waitingCondition,
    currentFocus: target.object.currentFocus,
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

async function formalizeCurrentRecord(): Promise<void> {
  const current = logseqBlock(await logseq.Editor.getCurrentBlock());
  if (!current) throw new Error("请先把光标放在一条自然记录上。");
  const api = await client(); const { adapter, graphId } = await adapterForCurrentGraph();
  const snapshot = await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: current.uuid });
  const title = current.content.split("\n")[0]!.replace(/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "");
  const operation = parseSemanticOperation({ operationId: `formalize-${crypto.randomUUID()}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title, anchor: { graphId, blockUuid: current.uuid, sourceContentHash: snapshot.sourceContentHash } } });
  const pending = await api.prepare(operation, snapshot);
  let result;
  try { result = await adapter.applyGraphEffect(pending.graphEffect as GraphEffect); }
  catch (error) {
    await api.failGraphApply(pending.commit.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
  const committed = await api.complete(pending.commit.id, result, await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: current.uuid }));
  await logseq.FileStorage.setItem(recentCommitKey, committed.commit.id);
  if (committed.commit.targetId) await logseq.FileStorage.setItem(currentWorkObjectKey, committed.commit.targetId);
  await logseq.UI.showMsg(`已正式化；Commit ${committed.commit.id}`, "success");
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
      if (["CREATE_WORK_OBJECT", "SET_CURRENT_FOCUS", "CHANGE_ENGAGEMENT", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE"].includes(completed.commit.operationType)) await logseq.FileStorage.setItem(recentCommitKey, completed.commit.id);
    } else if (item.action === "VERIFY_GRAPH") {
      if (!item.commit.targetId) throw new Error(`Commit ${item.commit.id} 缺少 WorkObject target。`);
      const target = await api.showObject(item.commit.targetId);
      const completed = await api.verifyRecoveredGraph(item.commit.id, await readTargetSnapshot(adapter, effect.graphId, api, target));
      if (["CREATE_WORK_OBJECT", "SET_CURRENT_FOCUS", "CHANGE_ENGAGEMENT", "COMPLETE_WORK_OBJECT", "CANCEL_WORK_OBJECT", "REOPEN_WORK_OBJECT", "AMEND_CLOSURE"].includes(completed.commit.operationType)) await logseq.FileStorage.setItem(recentCommitKey, completed.commit.id);
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
  logseq.beforeunload(async () => { unregisterOnlineDoneMarker(); await logseq.hideMainUI(); });
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-connect", label: "Task Copilot vNext：连接 Kernel" }, () => void guarded("connect", async () => {
    const value = logseq.settings?.kernelDescriptorJson;
    if (typeof value !== "string" || !value.trim()) throw new Error("请在插件设置中填写 Kernel descriptor JSON，然后再次运行连接命令。");
    parseKernelDescriptor(JSON.parse(value)); await logseq.FileStorage.setItem(descriptorKey, value.trim()); await logseq.UI.showMsg("Kernel 已连接；descriptor 已复制到 Plugin 私有 FileStorage。", "success");
  }));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-formalize", label: "Task Copilot vNext：正式化当前记录" }, () => void guarded("formalize", formalizeCurrentRecord));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-agent-focus", label: "Task Copilot vNext：让 Agent 更新当前推进" }, () => void guarded("agent-current-focus", letAgentUpdateCurrentFocus));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-agent-engagement", label: "Task Copilot vNext：让 Agent 对账可行动状态" }, () => void guarded("agent-engagement", letAgentReconcileEngagement));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-complete-task", label: "Task Copilot vNext：完成当前 Task" }, () => void guarded("complete-task", completeCurrentTask));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-cancel-task", label: "Task Copilot vNext：取消当前 Task" }, () => void guarded("cancel-task", cancelCurrentTask));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-reopen-task", label: "Task Copilot vNext：重新打开当前 Task" }, () => void guarded("reopen-task", reopenCurrentTask));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-show-closure", label: "Task Copilot vNext：查看当前 Task Closure" }, () => void guarded("show-closure", showCurrentClosure));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-amend-closure", label: "Task Copilot vNext：修订当前 Task Closure" }, () => void guarded("amend-closure", amendCurrentClosure));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-show-evidence", label: "Task Copilot vNext：查看最近一次 Agent 依据", keybinding: { binding: "mod+shift+e" } }, () => void guarded("show-evidence", showRecentEvidence));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-undo", label: "Task Copilot vNext：撤销最近一次提交", keybinding: { binding: "mod+shift+u" } }, () => void guarded("undo", undoRecent));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-recover", label: "Task Copilot vNext：恢复未完成提交" }, () => void guarded("recover", recoverIncomplete));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-rerender", label: "Task Copilot vNext：重新渲染当前正式事项" }, () => void guarded("rerender", rerenderCurrentFormalItem));
  await logseq.UI.showMsg("Task Copilot vNext 已就绪。", "success");
}

logseq.useSettingsSchema([{
  key: "kernelDescriptorJson",
  type: "string",
  default: "",
  title: "Kernel descriptor JSON",
  description: "从本机 kernel.json 复制；校验后写入 Plugin 私有 FileStorage，不进入 Graph 或日志。",
}]);
logseq.ready(main).catch((error) => console.error("Task Copilot vNext bootstrap failed", error));
