import "@logseq/libs";

import {
  DeterministicDemoProvider,
  NoAgentProvider,
  TaskCopilot,
  type AgentProvider,
  type ProjectReentryView,
} from "@task-copilot/application";
import type { ConditionKind, ManagedObject, Phase } from "@task-copilot/domain";
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
  const [inbox, now, objects, proposals, commits, events] = await Promise.all([
    taskCopilot.listInbox(),
    taskCopilot.queryNowWork(),
    taskCopilot.listObjects(),
    taskCopilot.listProposals(),
    taskCopilot.listCommits(),
    taskCopilot.getAuditTrail(),
  ]);
  const selectedObject = selectedObjectId ? objects.find((object) => object.objectId === selectedObjectId) : undefined;
  const project = objects.find((object) => object.objectType === "PROJECT");
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
    ...(selectedObject ? { selectedObject } : {}),
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

const nextPhase: Partial<Record<ManagedObject["objectType"], Partial<Record<Phase, Phase>>>> = {
  TASK: { CLARIFY: "READY", READY: "ACTIVE", ACTIVE: "COMPLETED", COMPLETED: "ARCHIVED", CANCELLED: "ARCHIVED" },
  MINI_PROJECT: { DEFINING: "READY", READY: "ACTIVE", ACTIVE: "CLOSING", CLOSING: "COMPLETED", COMPLETED: "ARCHIVED", CANCELLED: "ARCHIVED" },
  PROJECT: { IDEA: "DEFINING", DEFINING: "PLANNED", PLANNED: "ACTIVE", ACTIVE: "CLOSING", CLOSING: "COMPLETED", COMPLETED: "ARCHIVED", CANCELLED: "ARCHIVED" },
  AREA: { ACTIVE: "DORMANT", DORMANT: "ACTIVE" },
};

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
    const text = promptRequired("正式 Task 正文", capture?.originalText ?? "");
    const completionCriteria = promptRequired("可判断的完成标准");
    if (!text || !completionCriteria) return;
    await run(async () => {
      const object = await taskCopilot.formalizeCapture(value, { objectType: "TASK", text, completionCriteria, nextAction: text });
      selectedObjectId = object.objectId;
      workspace = "objects";
    }, "Capture 已手工正式化；领域状态独立保存，正文保持可读。");
    return;
  }
  if (action === "generate-proposal" && value) {
    await run(async () => {
      await taskCopilot.generateProposal(value);
      workspace = "review";
    }, "Demo Proposal 已生成；它仍不是正式事实。");
    return;
  }
  if (action === "dismiss-capture" && value) {
    await run(async () => void (await taskCopilot.dismissCapture(value)), "Capture 已标记为无需行动。");
    return;
  }
  if ((action === "review-accept" || action === "review-reject") && value) {
    const [proposalId, operationId, risk] = value.split("|");
    if (!proposalId || !operationId) return;
    if (action === "review-accept" && risk === "HIGH" && !window.confirm("这是高影响操作。确认单独接受？提交前仍会进行确定性校验。")) return;
    await run(async () => {
      await taskCopilot.reviewProposal(proposalId, { [operationId]: action === "review-accept" ? "ACCEPTED" : "REJECTED" });
    });
    return;
  }
  if (action === "commit-proposal" && value) {
    await run(async () => {
      await taskCopilot.commitProposal(value);
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
    await run(async () => void (await taskCopilot.changeObjectCondition(value, kind, evidence)), `Condition 已更新为 ${kind}。`);
    return;
  }
  if (action === "advance-phase" && value) {
    const object = await taskCopilot.getObject(value);
    const phase = nextPhase[object.objectType]?.[object.phase];
    if (!phase) {
      latestError = `当前 ${object.phase} 没有默认前进流转。`;
      await refresh();
      return;
    }
    if (["COMPLETED", "CANCELLED", "ARCHIVED", "RETIRED"].includes(phase) && !window.confirm(`确认高影响流转到 ${phase}？`)) return;
    await run(async () => void (await taskCopilot.changeObjectPhase(value, phase)), `Phase 已更新为 ${phase}。`);
    return;
  }
  if (action === "rebind-anchor" && value) {
    if (!window.confirm("将当前选中 Block 设为该对象新的主正文 Anchor？旧 Anchor 会保留为 replaced。")) return;
    await run(async () => void (await taskCopilot.rebindPrimaryAnchor(value)), "Anchor 已重新绑定。");
    return;
  }
  if (action === "open-anchor" && value) {
    await run(async () => contentPort.open(value));
    return;
  }
  if (action === "undo-commit" && value) {
    if (!window.confirm("撤销会先校验正文没有被二次编辑。确认继续？")) return;
    await run(async () => void (await taskCopilot.undoCommit(value)), "已创建逆向 SemanticCommit；旧历史未被改写。");
    return;
  }
  if (action === "recover-pending") {
    await run(async () => {
      const result = await taskCopilot.recoverPendingCommits();
      recoveryReport = `已安全恢复：${result.recovered.length}；仍需人工处理：${result.recoveryRequired.length}`;
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
