import { WorkspaceError, sameWorkScope, workRecord, type AgentWorkScope } from "@task-copilot/contracts";
import { LogseqContentAdapter } from "./features/content-writeback/logseq-adapter.ts";
import { pluginRuntime } from "./plugin-runtime.ts";
import { startTaskCenter, openTaskCenter } from "./features/task-center/controller.ts";
import { WorkView } from "./features/work-view/controller.ts";
import type { CaptureRequest } from "./features/materials/service.ts";
import { Materials } from "./features/materials/controller.ts";
import { installMaterialTransfers } from "./features/materials/install-transfer.ts";
import { installNavigation, installWorkbenchStyle } from "./host/panel-host.ts";
import { panels } from "./workspace/context.ts";
import { installWorkspaceContext } from "./features/workspace-context/install.ts";
import { installContentWriteback, type ContentInstallation } from "./features/content-writeback/installer.ts";
import { installAgentWorkspace, workspaceBindingPort } from "./features/agent-workspace/installer.ts";
import { installStageWorkbench, type StageInstallation } from "./features/stage-workbench/installer.ts";

logseq.useSettingsSchema([
  { key: "kernelDescriptorJson", type: "string", default: "", title: "Kernel descriptor JSON", description: "连接正式任务管理使用的本地 Kernel。工作视图和材料可独立使用。" },
  { key: "agentWorkspaceDescriptor", type: "string", default: "", title: "Agent 工作连接", description: "workspace serve 返回的私有插件 descriptor 路径。选择工作块后使用“允许 agent 连接当前工作”；停止连接不影响本地阅读。" },
  { key: "workViewEnabled", type: "boolean", default: true, title: "启用工作视图", description: "从任意块进入工作范围，排列只保存在视图中。修改后重载插件。" },
  { key: "materialsEnabled", type: "boolean", default: true, title: "启用材料", description: "按工作收纳、关联和阅读材料，Markdown 按授权编辑。修改后重载插件。" },
  { key: "tasksEnabled", type: "boolean", default: true, title: "启用任务管理", description: "保留 vNext 的任务界面与正式操作，需要本地 Kernel。修改后重载插件。" },
  { key: "materialsDirectory", type: "string", default: "", title: "Graph 外的材料目录", description: "请选择独立的绝对目录，避免指向 Graph 的符号链接。没有绑定工作目录时，保存收纳文档、关联记录和历史。" },
  { key: "materialsAutoCapture", type: "boolean", default: false, title: "自动收纳长文本", description: "绑定工作目录或配置全局目录后接管外部长文本粘贴，保留原文与原生撤销。默认关闭。" },
  { key: "materialsMinChars", type: "number", default: 2000, title: "收纳字符阈值", description: "单次粘贴达到此长度时收纳。" },
  { key: "materialsMinLines", type: "number", default: 30, title: "收纳非空行阈值", description: "单次粘贴达到此行数时收纳。" },
]);

async function main(): Promise<void> {
  installWorkbenchStyle();
  let materials: Materials | null = null, work: WorkView | null = null;
  const workspace = installWorkspaceContext(id => { if (!materials) throw new Error("材料模块未启用。"); return materials.readMaterial(id); });
  let stopTasks: (() => Promise<void>) | null = null;
  let content: ContentInstallation | null = null;
  let agentWorkspace: ReturnType<typeof installAgentWorkspace> | null = null;
  let stages: StageInstallation | null = null;
  let disposed = false;
  const host = window as Window & {taskCopilotWorkbench?: unknown};
  let publishedApi: unknown = null;
  let removeNavigation: () => void = () => undefined;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    agentWorkspace?.dispose(); stages?.dispose(); workspace.dispose(); content?.dispose(); work?.dispose(); materials?.dispose(); pluginRuntime.stop(); removeNavigation();
    if (host.taskCopilotWorkbench === publishedApi) delete host.taskCopilotWorkbench;
    await stopTasks?.();
  };
  logseq.beforeunload(dispose);
  const report = (error: unknown) => void logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "warning");
  const currentWorkRoot = () => (work?.snapshot() as {root?: string} | undefined)?.root ?? null;
  if (logseq.settings?.materialsEnabled !== false) {
    try { materials = new Materials(async uuid => { if (work) await work.open(uuid); }, currentWorkRoot, workspace.materialBindings); } catch (error) { report(error); }
  }
  if (logseq.settings?.workViewEnabled !== false) {
    try { work = new WorkView((content, uuid) => {
      if (materials) return materials.library(uuid, content);
      throw new Error("材料模块未启用。");
    }, {source: workspace.source}); } catch (error) { report(error); }
  }
  if (logseq.settings?.tasksEnabled !== false) {
    try { await pluginRuntime.start(); if (disposed) { pluginRuntime.stop(); return; } stopTasks = await startTaskCenter(); if (disposed) { await stopTasks(); return; } } catch (error) { pluginRuntime.stop(); report(error); }
  } else {
    logseq.provideStyle("body.tc-sidebar-docked #main-content-container{margin-right:var(--tc-sidebar-width)}body.tc-sidebar-compact #main-content-container{visibility:hidden}");
  }
  const actions: Record<string, () => void> = {};
  if (work) actions["工作视图"] = () => void work?.open().catch(report);
  if (materials) actions["材料"] = () => void materials?.library().catch(report);
  if (logseq.settings?.tasksEnabled !== false) actions["任务"] = () => void openTaskCenter().catch(report);
  if (disposed) return;
  removeNavigation = installNavigation(actions);
  logseq.provideModel({ workbenchOpen: () => { if (disposed) return; if (work) void work.open().catch(report); else if (materials) void materials.library().catch(report); else void openTaskCenter().catch(report); } });
  logseq.App.registerUIItem("toolbar", { key: "workbench-toolbar", template: '<a class="button" data-on-click="workbenchOpen" title="打开工作台" aria-label="打开工作台">工作台</a>' });
  const requireActive = () => { if (disposed) throw new Error("工作台已关闭。"); };
  const requireMaterials = () => { requireActive(); if (!materials) throw new Error("材料模块未启用。"); return materials; };
  content = installContentWriteback({adapter: new LogseqContentAdapter(null, workspace.sourceReader)});
  if (materials) installMaterialTransfers(materials, content, workspace.source, work);
  stages = installStageWorkbench({content,work,source:workspace.source,materials:{
    read:id=>requireMaterials().readMaterial(id),
    open:id=>requireMaterials().openDoc(id,currentWorkRoot()),
    list:async scope=>(await requireMaterials().listMaterials(scope.rootUuid,"")).materials,
  }});
  const stageApi = stages.api;
  const requireStageScope = (scope: AgentWorkScope) => {
    requireActive();
    const selected = stageApi.scope();
    if (!selected || !sameWorkScope(selected, scope)) throw new WorkspaceError("SCOPE_MISMATCH");
  };
  agentWorkspace = installAgentWorkspace({content,materials,work,binding:workspaceBindingPort(workspace.service),source:workspace.api,stage:{
    read:async (input,binding)=>{
      requireStageScope(binding.scope);
      const value = workRecord(input,["stageId"]);
      if (value.stageId !== undefined) return stageApi.read(value);
      const history = await stageApi.history();
      requireStageScope(binding.scope);
      return history.current ? stageApi.read({stageId:history.current}) : {status:"unavailable",reason:"STAGE_CURRENT_UNAVAILABLE"};
    },
    submit:async (input,binding)=>{requireStageScope(binding.scope);return stageApi.submit(input);},
  }});
  const api = {
    read: () => disposed ? null : work?.snapshot() ?? null,
    open: async (uuid?: string) => { requireActive(); await work?.open(uuid); },
    openMaterial: async (id: string) => { requireActive(); await materials?.openDoc(id, currentWorkRoot()); },
    close: async () => { if (!disposed) await panels.closeActive(); },
    apply: (operation: unknown) => disposed ? {ok: false, reason: "workbench-disposed"} : work?.apply(operation) ?? {ok: false, reason: "work-view-disabled"},
    workspace: workspace.api,
    content: content.api,
    agentWorkspace: agentWorkspace.api,
    stages: stages.api,
    materials: {
      list: (input: {sourceUuid?: string; query?: string} = {}) => requireMaterials().listMaterials(input.sourceUuid ?? null, input.query ?? ""),
      read: (id: string) => requireMaterials().readMaterial(id),
      capture: (request: CaptureRequest) => requireMaterials().capture(request),
      associate: (input: {id?: string; path?: string; sourceUuid: string}) => requireMaterials().associateMaterial(input),
      save: (input: {id: string; expectedVersion: string; expectedContent: string; next: string}) => requireMaterials().saveMaterial(input.id, input.expectedVersion, input.expectedContent, input.next),
    },
    readMaterials: async (content: string) => { requireActive(); return materials?.linkedContext(content) ?? []; },
    lenses: work?.lensesAPI ?? null,
    report: work?.reportAPI ?? null,
  };
  publishedApi = api;
  host.taskCopilotWorkbench = api;
}

logseq.ready(main).catch(error => console.error("Workbench bootstrap failed", error));
