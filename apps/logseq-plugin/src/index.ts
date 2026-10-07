import { WorkspaceError, sameWorkScope, workRecord, type AgentWorkScope } from "@task-copilot/contracts";
import { LogseqContentAdapter } from "./features/content-writeback/logseq-adapter.ts";
import { pluginRuntime } from "./plugin-runtime.ts";
import { startTaskCenter, openTaskCenter } from "./features/task-center/controller.ts";
import { WorkView } from "./features/work-view/controller.ts";
import type { CaptureRequest } from "./features/materials/service.ts";
import { Materials } from "./features/materials/controller.ts";
import { installMaterialTransfers } from "./features/materials/install-transfer.ts";
import { installNavigation, installWorkbenchStyle } from "./host/panel-host.ts";
import { installReadingEntries } from "./host/reading-entry.ts";
import { panels } from "./workspace/context.ts";
import { installWorkspaceContext } from "./features/workspace-context/install.ts";
import { installContentWriteback, type ContentInstallation } from "./features/content-writeback/installer.ts";
import { installAgentWorkspace, workspaceBindingPort } from "./features/agent-workspace/installer.ts";
import { installStageWorkbench, type StageInstallation } from "./features/stage-workbench/installer.ts";
import { fileName } from "./features/materials/names.ts";
import { sameLensScope } from "./features/work-view/lens-source.ts";

logseq.useSettingsSchema([
  { key: "kernelDescriptorJson", type: "string", default: "", title: "Kernel descriptor JSON", description: "连接正式任务管理使用的本地 Kernel。工作视图和材料可独立使用。" },
  { key: "agentWorkspaceDescriptor", type: "string", default: "", title: "Agent 工作连接", description: "workspace serve 返回的私有插件 descriptor 路径。选择工作块后使用“允许 agent 连接当前工作”；停止连接不影响本地阅读。" },
  { key: "workViewEnabled", type: "boolean", default: true, title: "启用工作视图", description: "从任意块进入工作范围，排列只保存在视图中。修改后重载插件。" },
  { key: "materialsEnabled", type: "boolean", default: true, title: "启用材料", description: "按工作收纳、关联和阅读材料，Markdown 按授权编辑。修改后重载插件。" },
  { key: "tasksEnabled", type: "boolean", default: false, title: "启用任务管理", description: "按需启用正式任务，需要本地 Kernel。已有配置继续保留。" },
  { key: "materialsDirectory", type: "string", default: "", title: "默认材料根目录", description: "留空时自动准备 Graph 外目录。未绑定目录的工作在此拥有独立文件夹；可在材料的目录页添加其他位置。" },
  { key: "materialsAutoCapture", type: "boolean", default: false, title: "粘贴长文本时询问收纳", description: "达到阈值时填写文件名并选择收纳，或保留原文。已有开启状态继续有效，默认关闭。" },
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
  let removeReadingEntries: () => void = () => undefined;
  let removeNavigation: () => void = () => undefined;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    materials?.setWorkChrome(null); agentWorkspace?.dispose(); stages?.dispose(); workspace.dispose(); content?.dispose(); work?.dispose(); materials?.dispose(); pluginRuntime.stop(); removeNavigation(); removeReadingEntries();
    if (host.taskCopilotWorkbench === publishedApi) delete host.taskCopilotWorkbench;
    await stopTasks?.();
  };
  logseq.beforeunload(dispose);
  const report = (error: unknown) => void logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "warning");
  const currentWorkRoot = () => (work?.snapshot() as {root?: string} | undefined)?.root ?? null;
  if (logseq.settings?.materialsEnabled !== false) {
    try { materials = new Materials(async uuid => { if (work) await work.returnToBody(uuid); }, currentWorkRoot, workspace.materialBindings); } catch (error) { report(error); }
  }
  if (logseq.settings?.workViewEnabled !== false) {
    try { work = new WorkView((content, uuid) => {
      if (materials) return materials.library(uuid, content);
      throw new Error("材料模块未启用。");
    }, {source: workspace.source}); } catch (error) { report(error); }
  }
  const activateTasks = async () => {
    if (stopTasks || disposed) return;
    await pluginRuntime.start();
    if (disposed) {pluginRuntime.stop();return;}
    stopTasks=await startTaskCenter();if(disposed)await stopTasks();
  };
  if (logseq.settings?.tasksEnabled !== false && await pluginRuntime.configured()) {
    try {await activateTasks();} catch(error){pluginRuntime.stop();report(error);}
  }
  logseq.provideStyle("body.tc-sidebar-docked #main-content-container{margin-right:var(--tc-sidebar-width)}body.tc-sidebar-compact #main-content-container{opacity:0;pointer-events:none}");
  if (materials && work) materials.setWorkChrome((surface, scope) => work!.mountMaterialChrome(surface, scope), scope => work!.rememberMaterials(scope), uuid => work!.materialContext(uuid));
  const actions: Record<string, () => void> = {};
  if (work) actions["阅读当前工作或继续阅读"] = () => void work?.openToolbar().catch(report);
  if (work) actions["打开当前块的工作"] = () => void work?.openCurrentWork().catch(report);
  if (materials) actions["查找全部材料"] = () => void materials?.library(null).catch(report);
  actions["正式任务"] = () => { void (async()=>{
    if (!stopTasks && !await pluginRuntime.configured()){logseq.showSettingsUI();return;}
    if(logseq.settings?.tasksEnabled===false)logseq.updateSettings({tasksEnabled:true});
    await activateTasks();await openTaskCenter();
  })().catch(report); };
  actions["插件设置"] = () => void panels.closeActive().then(() => logseq.showSettingsUI()).catch(report);
  if (disposed) return;
  removeNavigation = installNavigation(actions);
  logseq.provideModel({ workbenchOpen: () => { if (disposed) return; if (work) void work.openToolbar().catch(report); else if (materials) void materials.library().catch(report); else void openTaskCenter().catch(report); } });
  logseq.App.registerUIItem("toolbar", { key: "workbench-toolbar", template: '<a class="button" style="font-size:13px;line-height:1.5;width:auto;padding:4px 8px" data-workbench-toolbar="true" data-on-click="workbenchOpen" title="打开工作台" aria-label="打开工作台">工作台</a>' });
  if(work){const entries=installReadingEntries(uuid=>work!.open(uuid),()=>work!.openPage(),report);removeReadingEntries=entries.dispose;}
  const requireActive = () => { if (disposed) throw new Error("工作台已关闭。"); };
  const requireMaterials = () => { requireActive(); if (!materials) throw new Error("材料模块未启用。"); return materials; };
  if(work&&materials)work.setReadingMaterials({
    list:async scope=>{
      const valid=workspace.service.observeScope(scope),module=requireMaterials();
      const list=await module.listMaterials(scope.rootUuid,"");
      const binding=scope.kind==="page"?null:await workspace.service.resolve(scope);
      for(const association of binding?.manifest.associations??[])if(association.kind==="material"&&!list.materials.some(view=>view.id===association.id))list.materials.push(await module.readMaterial(association.id));
      if(!valid())throw new Error("READING_MATERIAL_SCOPE_CHANGED");
      return list.materials.map(view=>({id:view.id,filename:fileName(view.path),reference:view.reference,availability:view.availability}));
    },open:async(id,scope)=>{
      requireActive();const actual=work?.readingAPI.read().scope;if(actual&&sameLensScope(actual,scope))await requireMaterials().openDoc(id,scope.rootUuid);
      else throw new Error("READING_MATERIAL_SCOPE_CHANGED");
    }
  });
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
  stages.setCollaboration({status:agentWorkspace.api.status,connect:agentWorkspace.local.connect,stop:agentWorkspace.local.stop});
  work?.setContextActions(() => {
    const root = currentWorkRoot(), scope = root ? { graphId: (work!.snapshot() as {graph: string}).graph, rootUuid: root } : null;
    if (!root || !scope) return [];
    const connection = agentWorkspace?.api.status();
    const connected = !!connection?.connected && !!connection.binding && sameWorkScope(connection.binding.scope, scope);
    return [
      { group: "工作目录", label: "关联工作目录", description: "复用已有目录；正文仍在 Logseq", run: () => workspace.local.bind(root) },
      { group: "工作目录", label: "打开工作读取入口", description: "打开目录中已有的读取入口", run: () => workspace.local.open(scope) },
      { group: "工作目录", label: "重新关联移动后的目录", run: () => workspace.local.rebind(root) },
      { group: "外部连接与恢复", label: connected ? "停止 agent 工作连接" : "允许 agent 连接这份工作", description: connected ? "通道已连接；这不表示 agent 正在工作" : "先运行随包协作启动器并关联工作目录", run: () => connected ? agentWorkspace!.local.stop() : agentWorkspace!.local.connect(root) },
      { group: "外部连接与恢复", label: "允许润色并整理原块", description: "明确授予此工作内的结构维护许可", run: () => agentWorkspace!.local.connect(root, true) },
      { group: "外部连接与恢复", label: "查看写回冲突与恢复", description: "核对未知结果和原请求；不盲目重放", run: () => content!.local.recovery(root) },
    ];
  });
  const api = {
    read: () => disposed ? null : work?.snapshot() ?? null,
    open: async (uuid?: string) => { requireActive(); await work?.open(uuid); },
    openPage: async (name?: string) => {requireActive();await work?.openPage(name);},
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
      import: (input: {path: string; requestKey: string; sourceUuid: string}) => requireMaterials().importMaterial(input),
      associate: (input: {id?: string; path?: string; sourceUuid: string}) => requireMaterials().associateMaterial(input),
      save: (input: {id: string; expectedVersion: string; expectedContent: string; next: string}) => requireMaterials().saveMaterial(input.id, input.expectedVersion, input.expectedContent, input.next),
    },
    readMaterials: async (content: string) => { requireActive(); return materials?.linkedContext(content) ?? []; },
    lenses: work?.lensesAPI ?? null,
    report: work?.reportAPI ?? null,
    reading: work?.readingAPI ?? null,
  };
  publishedApi = api;
  host.taskCopilotWorkbench = api;
  await work?.restoreReadingSession();
}

logseq.ready(main).catch(error => console.error("Workbench bootstrap failed", error));
