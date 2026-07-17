import "@logseq/libs";

import {
  DeterministicDemoProvider,
  NoAgentProvider,
  TaskCopilot,
  type AgentProvider,
  type ProjectReentryView,
} from "@task-copilot/application";
import type { ConditionKind, ManagedObject, ObjectType } from "@task-copilot/domain";
import {
  LogseqContentPort,
  LogseqFileStorageBlobStore,
  type LogseqFacade,
} from "@task-copilot/logseq-adapter";
import {
  VersionedStateRepository,
  exportRecoveryBundle,
  restoreRecoveryBundle,
  type RecoveryBundle,
} from "@task-copilot/persistence";

import { renderApp, type UiModel, type Workspace } from "./ui.ts";

const queriedAppRoot = document.querySelector<HTMLElement>("#app");
if (!queriedAppRoot) throw new Error("Task Copilot root element #app is unavailable.");
const appRoot: HTMLElement = queriedAppRoot;

const facade = logseq as unknown as LogseqFacade;
const blobStore = new LogseqFileStorageBlobStore(facade.FileStorage);
const repository = new VersionedStateRepository(blobStore);
const contentPort = new LogseqContentPort(facade);
let taskCopilot: TaskCopilot;
let workspace: Workspace = "inbox";
let selectedObjectId: string | undefined;
let selectedProjectId: string | undefined;
let message: string | undefined;
let latestError: string | undefined;
let recoveryReport: string | undefined;

function currentProvider(): AgentProvider {
  const mode = (logseq.settings as { agentMode?: unknown } | undefined)?.agentMode;
  return mode === "demo" ? new DeterministicDemoProvider() : new NoAgentProvider();
}

function rebuildApplication(): void {
  taskCopilot = new TaskCopilot({ store: repository, content: contentPort, provider: currentProvider() });
}

function explain(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function model(): Promise<UiModel> {
  const [inbox, now, objects, proposals, commits, events, auditProjection] = await Promise.all([
    taskCopilot.listInbox(),
    taskCopilot.queryNowWork(),
    taskCopilot.listObjects(),
    taskCopilot.listProposals(),
    taskCopilot.listCommits(),
    taskCopilot.getAuditTrail(),
    taskCopilot.getAuditProjection(),
  ]);
  const selectedObject = selectedObjectId ? objects.find((object) => object.objectId === selectedObjectId) : undefined;
  const selectedObjectDetail = selectedObject ? await taskCopilot.getObjectDetail(selectedObject.objectId) : undefined;
  const signalsByObject = Object.fromEntries(await Promise.all(objects.map(async (object) => [object.objectId, await taskCopilot.getObjectSignals(object.objectId)] as const)));
  const proposalImpacts = Object.fromEntries(
    await Promise.all(proposals.filter((proposal) => proposal.status === "OPEN").map(async (proposal) => [proposal.proposalId, await taskCopilot.getProposalImpact(proposal.proposalId)] as const)),
  );
  const reentryProjects = objects.filter((object) => object.objectType === "PROJECT");
  const project = reentryProjects.find((object) => object.objectId === selectedProjectId) ?? reentryProjects[0];
  if (project) selectedProjectId = project.objectId;
  let reentry: ProjectReentryView | undefined;
  if (project) reentry = await taskCopilot.getProjectReentry(project.objectId);
  return {
    workspace,
    agent: taskCopilot.agentStatus(),
    inbox,
    now,
    objects,
    proposals,
    commits,
    events,
    auditProjection,
    reentryProjects,
    ...(selectedProjectId ? { selectedReentryProjectId: selectedProjectId } : {}),
    signalsByObject,
    proposalImpacts,
    ...(selectedObjectDetail ? { selectedObjectDetail } : {}),
    ...(reentry ? { reentry } : {}),
    ...(message ? { message } : {}),
    ...(latestError ? { error: latestError } : {}),
    ...(recoveryReport ? { recoveryReport } : {}),
  };
}

async function refresh(): Promise<void> {
  appRoot.innerHTML = renderApp(await model());
}

async function run(action: () => Promise<void>, success?: string): Promise<void> {
  latestError = undefined;
  message = undefined;
  try {
    await action();
    if (success) message = success;
  } catch (error) {
    latestError = explain(error);
  }
  await refresh();
}

function promptRequired(label: string, initial = ""): string | undefined {
  const value = window.prompt(label, initial)?.trim();
  return value ? value : undefined;
}

function workObjectType(): ObjectType | undefined {
  const raw = window.prompt("对象类型：TASK / MINI_PROJECT / PROJECT / AREA", "TASK")?.trim().toUpperCase();
  return raw && ["TASK", "MINI_PROJECT", "PROJECT", "AREA"].includes(raw) ? (raw as ObjectType) : undefined;
}

function objectChoices(objects: readonly ManagedObject[], excludeId?: string): string {
  return objects
    .filter((object) => object.objectId !== excludeId)
    .map((object) => `${object.objectId} · ${object.objectType} · ${object.text}`)
    .join("\n");
}

async function handleAction(action: string, value?: string): Promise<void> {
  if (action === "view" && value) {
    workspace = value as Workspace;
    await refresh();
    return;
  }
  if (action === "close") {
    logseq.hideMainUI();
    return;
  }
  if (action === "capture") {
    await run(async () => {
      await taskCopilot.captureCurrentBlock();
      workspace = "inbox";
    }, "已捕获当前 Block；正文未移动，也未自动创建 Task。");
    return;
  }
  if (action === "formalize" && value) {
    const state = await taskCopilot.exportState();
    const capture = state.captures.find((candidate) => candidate.captureId === value);
    const objectType = workObjectType();
    if (!objectType) return;
    const text = promptRequired(`${objectType} 正文`, capture?.originalText ?? "");
    if (!text) return;
    let completionCriteria: string | undefined;
    let nextAction: string | undefined;
    let purpose: string | undefined;
    let targetOutcome: string | undefined;
    let scopeIn: string | undefined;
    if (objectType === "TASK") {
      completionCriteria = promptRequired("可判断的完成标准");
      nextAction = promptRequired("下一步行动", text);
      if (!completionCriteria || !nextAction) return;
    } else if (objectType === "MINI_PROJECT") {
      targetOutcome = promptRequired("目标结果");
      completionCriteria = promptRequired("完成判据");
      nextAction = promptRequired("当前推进");
      if (!targetOutcome || !completionCriteria || !nextAction) return;
    } else if (objectType === "PROJECT") {
      purpose = promptRequired("项目目的");
      targetOutcome = promptRequired("目标结果");
      scopeIn = promptRequired("范围内边界");
      completionCriteria = promptRequired("完成判据");
      nextAction = promptRequired("当前推进");
      if (!purpose || !targetOutcome || !scopeIn || !completionCriteria || !nextAction) return;
    } else {
      purpose = promptRequired("Area 的持续责任或目的");
      if (!purpose) return;
    }
    await run(async () => {
      await taskCopilot.createManualFormalizationProposal(value, {
        objectType,
        text,
        ...(completionCriteria ? { completionCriteria } : {}),
        ...(nextAction ? { nextAction } : {}),
        ...(purpose ? { purpose } : {}),
        ...(targetOutcome ? { targetOutcome } : {}),
        ...(scopeIn ? { scopeIn } : {}),
      });
      workspace = "review";
    }, "手工正式化 Proposal 已创建；对象、正文和 Capture 尚未改变，请逐项审查后提交。");
    return;
  }
  if (action === "generate-proposal" && value) {
    await run(async () => {
      await taskCopilot.generateProposal(value);
      workspace = "review";
    }, "Demo Proposal 已生成；它仍不是正式事实。");
    return;
  }
  if (action === "manual-proposal" && value) {
    const state = await taskCopilot.exportState();
    const capture = state.captures.find((candidate) => candidate.captureId === value);
    const suggestedText = promptRequired("输入希望审查的正式正文", capture?.originalText ?? "");
    if (!suggestedText) return;
    await run(async () => {
      await taskCopilot.createManualProposal(value, suggestedText);
      workspace = "review";
    }, "手工 Proposal 已创建；正文尚未改变，需逐项审查后提交。");
    return;
  }
  if (action === "dismiss-capture" && value) {
    await run(async () => void (await taskCopilot.dismissCapture(value)), "Capture 已标记为无需行动。");
    return;
  }
  if (action === "open-capture" && value) {
    await run(async () => taskCopilot.openCaptureSource(value));
    return;
  }
  if (action === "defer-capture" && value) {
    const deferredUntil = promptRequired("暂缓至（ISO，例如 2026-07-20T09:00:00+08:00）");
    if (!deferredUntil) return;
    await run(async () => void (await taskCopilot.deferCapture(value, deferredUntil)), `Capture 已暂缓至 ${deferredUntil}。`);
    return;
  }
  if (action === "associate-capture" && value) {
    const objects = await taskCopilot.listObjects();
    const objectId = promptRequired(`输入要关联的对象 ID：\n${objectChoices(objects)}`);
    if (!objectId) return;
    await run(async () => void (await taskCopilot.associateCapture(value, objectId)), "Capture 已关联现有对象，来源 Anchor 已保留。");
    return;
  }
  if ((action === "review-accept" || action === "review-reject") && value) {
    const [proposalId, operationId, risk] = value.split("|");
    if (!proposalId || !operationId) return;
    if (action === "review-accept" && risk === "HIGH" && !window.confirm("这是高影响操作。确认单独接受？提交前仍会进行确定性校验。")) return;
    await run(async () => {
      await taskCopilot.reviewProposal(proposalId, {
        [operationId]: action === "review-accept"
          ? { status: "ACCEPTED", highImpactConfirmed: risk === "HIGH" }
          : "REJECTED",
      });
    });
    return;
  }
  if (action === "review-edit" && value) {
    const [proposalId, operationId] = value.split("|");
    if (!proposalId || !operationId) return;
    const proposal = (await taskCopilot.listProposals()).find((candidate) => candidate.proposalId === proposalId);
    const operation = proposal?.operations.find((candidate) => candidate.operationId === operationId);
    if (!operation) return;
    const raw = window.prompt("编辑最终 operation payload（JSON）", JSON.stringify(operation.payload, null, 2));
    if (raw === null) return;
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload 必须是 JSON object");
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      latestError = explain(error);
      await refresh();
      return;
    }
    const editedHighImpact = (await taskCopilot.getEditedOperationRisk(proposalId, operationId, payload)) === "HIGH";
    if (editedHighImpact && !window.confirm("编辑后的 payload 属于高影响操作。确认最终版本？")) return;
    await run(async () => void (await taskCopilot.reviewProposal(proposalId, {
      [operationId]: { status: "EDITED", payload, highImpactConfirmed: editedHighImpact },
    })), "已保存用户确认版本；Agent 原建议仍在审计字段中保留。");
    return;
  }
  if (action === "review-defer" && value) {
    const [proposalId, operationId] = value.split("|");
    if (!proposalId || !operationId) return;
    const deferredUntil = promptRequired("复查时间（ISO）");
    const reason = promptRequired("暂缓原因");
    if (!deferredUntil || !reason) return;
    await run(async () => void (await taskCopilot.deferProposalOperation(proposalId, operationId, deferredUntil, reason)), "操作已暂缓；Proposal 保持待审查，Capture 未被解决。");
    return;
  }
  if (action === "reject-proposal" && value) {
    if (!window.confirm("确认拒绝该 Proposal 的全部未提交操作？原始 Capture 会回到 Inbox。")) return;
    const reason = promptRequired("全部拒绝原因", "当前建议不适用");
    if (!reason) return;
    await run(async () => {
      const proposal = await taskCopilot.rejectProposal(value, reason);
      message = proposal.status === "COMMITTED"
        ? "其余操作已拒绝；此前已经提交的正式变化保持不变。"
        : "Proposal 已全部拒绝；没有正式正文或领域变化。";
    });
    return;
  }
  if (action === "commit-proposal" && value) {
    await run(async () => {
      const commit = await taskCopilot.commitProposal(value);
      if (commit.status !== "COMPLETED") throw new Error(`SemanticCommit ${commit.status}：${commit.error?.message ?? "请在审计与恢复中处理"}`);
      workspace = "audit";
    }, "SemanticCommit 已完成；结果和撤销入口已记录。");
    return;
  }
  if (action === "select-object" && value) {
    selectedObjectId = value;
    workspace = "objects";
    await refresh();
    return;
  }
  if (action === "select-reentry-project" && value) {
    selectedProjectId = value;
    workspace = "reentry";
    await refresh();
    return;
  }
  if (action === "edit-object" && value) {
    const object = await taskCopilot.getObject(value);
    const text = window.prompt("对象正文（取消则保留）", object.text);
    if (text === null) return;
    const completionCriteria = window.prompt("完成标准（允许留空）", object.completionCriteria ?? "");
    if (completionCriteria === null) return;
    const nextAction = window.prompt("下一步/当前推进（允许留空）", object.nextAction ?? "");
    if (nextAction === null) return;
    const currentSummary = window.prompt("当前状态摘要（允许留空）", object.currentSummary ?? "");
    if (currentSummary === null) return;
    const purpose = window.prompt("目的/持续责任（允许留空）", object.purpose ?? "");
    if (purpose === null) return;
    const targetOutcome = window.prompt("目标结果（允许留空）", object.targetOutcome ?? "");
    if (targetOutcome === null) return;
    const scopeIn = window.prompt("范围内边界（允许留空）", object.scopeIn ?? "");
    if (scopeIn === null) return;
    const dueAt = window.prompt("due 时间（ISO，允许留空）", object.dueAt ?? "");
    if (dueAt === null) return;
    const reviewAt = window.prompt("review 时间（ISO，允许留空）", object.reviewAt ?? "");
    if (reviewAt === null) return;
    await run(
      async () => {
        await taskCopilot.createManualObjectEditProposal(value, {
          text: text.trim(), completionCriteria: completionCriteria.trim(), nextAction: nextAction.trim(), currentSummary: currentSummary.trim(),
          purpose: purpose.trim(), targetOutcome: targetOutcome.trim(), scopeIn: scopeIn.trim(), dueAt: dueAt.trim(), reviewAt: reviewAt.trim(),
        });
        workspace = "review";
      },
      "对象编辑 Proposal 已创建；Logseq 正文和 Domain State 尚未改变。",
    );
    return;
  }
  if (action === "open-object" && value) {
    await run(async () => taskCopilot.openObjectText(value));
    return;
  }
  if (action === "set-owner" && value) {
    const objects = await taskCopilot.listObjects();
    const ownerObjectId = promptRequired(`输入主归属对象 ID：\n${objectChoices(objects, value)}`);
    if (!ownerObjectId) return;
    await run(async () => {
      await taskCopilot.createManualOwnershipProposal(value, ownerObjectId);
      workspace = "review";
    }, "主归属 Proposal 已创建；接受时会要求高影响确认，正文不会移动。");
    return;
  }
  if (action === "view-audit") {
    workspace = "audit";
    await refresh();
    return;
  }
  if (action.startsWith("condition-") && value) {
    const kind = action.slice("condition-".length).toUpperCase() as ConditionKind;
    const evidence: Record<string, string> = {};
    if (kind === "WAITING") {
      const waitingFor = promptRequired("在等谁或什么？");
      const expectedResult = promptRequired("期待什么结果？");
      const reviewAt = promptRequired("复查时间（ISO，例如 2026-07-20T09:00:00+08:00）");
      if (!waitingFor || !expectedResult || !reviewAt) return;
      Object.assign(evidence, { waitingFor, expectedResult, reviewAt });
    } else if (kind === "BLOCKED" || kind === "PAUSED") {
      const reason = promptRequired(kind === "BLOCKED" ? "阻塞说明" : "暂停原因");
      if (!reason) return;
      evidence.reason = reason;
    }
    await run(async () => {
      await taskCopilot.createManualConditionProposal(value, kind, evidence);
      workspace = "review";
    }, `Condition ${kind} Proposal 已创建；状态尚未改变。`);
    return;
  }
  if (action === "advance-phase" && value) {
    const object = await taskCopilot.getObject(value);
    const available = await taskCopilot.getAvailableObjectPhases(value);
    const chosen = window.prompt(`选择合法目标 Phase：${available.join(" / ")}`, available[0] ?? "")?.trim().toUpperCase();
    const phase = available.find((candidate) => candidate === chosen);
    if (!phase) {
      latestError = available.length > 0 ? `请选择合法 Phase：${available.join(" / ")}` : `当前 ${object.phase} 没有合法后续流转。`;
      await refresh();
      return;
    }
    if (object.objectType === "PROJECT" && phase === "COMPLETED" && !window.confirm("已检查目标达成、下层对象、等待项、成果和归档入口？")) return;
    const reason = object.phase === "COMPLETED" && phase === "ACTIVE" ? promptRequired("重新打开原因") : undefined;
    if (object.phase === "COMPLETED" && phase === "ACTIVE" && !reason) return;
    await run(
      async () => {
        await taskCopilot.createManualPhaseProposal(value, phase, {
          ...(object.objectType === "PROJECT" && phase === "COMPLETED" ? { completionChecksPassed: true } : {}),
          ...(reason ? { reason } : {}),
        });
        workspace = "review";
      },
      `Phase ${phase} Proposal 已创建；状态尚未改变。`,
    );
    return;
  }
  if (action === "rebind-anchor" && value) {
    if (!window.confirm("将当前选中 Block 设为该对象新的主正文 Anchor？旧 Anchor 会保留为 replaced。")) return;
    await run(async () => void (await taskCopilot.rebindPrimaryAnchor(value)), "Anchor 已重新绑定。");
    return;
  }
  if (action === "open-anchor" && value) {
    await run(async () => taskCopilot.openAnchor(value));
    return;
  }
  if (action === "undo-commit" && value) {
    if (!window.confirm("撤销会先校验正文没有被二次编辑。确认继续？")) return;
    await run(async () => {
      const commit = await taskCopilot.undoCommit(value);
      if (commit.status !== "COMPLETED") throw new Error(`Undo SemanticCommit ${commit.status}：${commit.error?.message ?? "请在审计与恢复中处理"}`);
    }, "已创建逆向 SemanticCommit；旧历史未被改写。");
    return;
  }
  if (action === "recover-pending") {
    await run(async () => {
      const result = await taskCopilot.recoverPendingCommits();
      recoveryReport = `已安全恢复：${result.recovered.length}；仍需人工处理：${result.recoveryRequired.length}`;
    });
    return;
  }
  if (action === "scan-anchors") {
    await run(async () => {
      const result = await taskCopilot.scanAnchors();
      recoveryReport = `Anchor 扫描：active ${result.active}；missing ${result.missing}；conflict ${result.conflict}；其他 Graph ${result.unavailable}。`;
    });
    return;
  }
  if (action === "export-backup") {
    await run(async () => {
      const bundle = exportRecoveryBundle(await taskCopilot.exportState());
      await blobStore.set("task-copilot/backups/latest.json", JSON.stringify(bundle));
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `task-copilot-recovery-${bundle.createdAt.replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      recoveryReport = `恢复包已写入插件私有备份槽并下载。文件数：${Object.keys(bundle.files).length}`;
    });
    return;
  }
  if (action === "verify-backup") {
    await run(async () => {
      const raw = await blobStore.get("task-copilot/backups/latest.json");
      if (!raw) throw new Error("尚无恢复包，请先创建备份。");
      const result = restoreRecoveryBundle(JSON.parse(raw) as RecoveryBundle);
      recoveryReport = `临时 Store 恢复校验完成：对象 ${result.state.objects.length}，关系 ${result.state.relations.length}，事件 ${result.state.events.length}，Missing Anchor ${result.anchorReport.missing.length}，差异 ${result.differences.length}。`;
    });
  }
}

appRoot.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!target) return;
  void handleAction(target.dataset.action ?? "", target.dataset.value);
});

async function showTaskCopilot(): Promise<void> {
  logseq.showMainUI({ autoFocus: true });
  await refresh();
}

async function captureFromCommand(): Promise<void> {
  await taskCopilot.captureCurrentBlock();
  workspace = "inbox";
  await showTaskCopilot();
}

async function main(): Promise<void> {
  logseq.useSettingsSchema([
    {
      key: "agentMode",
      type: "enum",
      title: "Agent 模式",
      description: "No Agent 保持基础系统完整可用；Demo 只生成确定性本地 Proposal。",
      default: "none",
      enumChoices: ["none", "demo"],
      enumPicker: "radio",
    },
  ]);
  rebuildApplication();
  const recovery = await taskCopilot.initialize();
  if (recovery.recovered.length || recovery.recoveryRequired.length) {
    recoveryReport = `启动扫描：已恢复 ${recovery.recovered.length}，需人工处理 ${recovery.recoveryRequired.length}。`;
  }
  logseq.setMainUIInlineStyle({ position: "fixed", inset: "0", zIndex: 12, background: "rgb(11 24 18 / 30%)" });
  logseq.provideModel({ showTaskCopilot, captureFromCommand });
  logseq.App.registerUIItem("toolbar", {
    key: "task-copilot-toolbar",
    template: '<a class="button" data-on-click="showTaskCopilot" title="Task Copilot" aria-label="打开 Task Copilot">◉</a>',
  });
  logseq.App.registerCommandPalette({ key: "task-copilot-open", label: "Task Copilot：打开工作区" }, showTaskCopilot);
  logseq.App.registerCommandPalette({ key: "task-copilot-capture", label: "Task Copilot：捕获当前块" }, captureFromCommand);
  logseq.Editor.registerSlashCommand("Task Copilot：捕获当前块", captureFromCommand);
  logseq.onSettingsChanged(() => {
    rebuildApplication();
    message = "Agent 模式已切换；正式领域状态与历史未受影响。";
    void refresh();
  });
  console.info("[task-copilot] ready; pending recovery scan completed");
}

logseq.ready(main).catch((error: unknown) => console.error("[task-copilot] startup failed", error));
