import { installCatalogPublisher } from './features/agent-workspace/catalog-publisher.ts';
import { WorkCatalogView } from './features/agent-workspace/catalog-view.ts';
import { ensureDshWork } from "./features/agent-workspace/dsh-work.ts";
import { dshFormalTarget, setDshObjectEntry } from "./features/task-center/controller.ts";
import { WorkspaceError, sameWorkScope, workKey, workRecord, type AgentWorkScope } from "@task-copilot/contracts";
import type { StageWorkTarget } from "@task-copilot/stage-runtime";
import { GlobalStageOverlay } from "./features/stage/overlay.ts";
import { QuietFocusCapsule } from "./features/stage/focus-capsule.ts";
import { LogseqContentAdapter } from "./features/content-writeback/logseq-adapter.ts";
import { pluginRuntime } from "./plugin-runtime.ts";
import { startTaskCenter, openTaskCenter } from "./features/task-center/controller.ts";
import { WorkView } from "./features/work-view/controller.ts";
import type { CaptureRequest } from "./features/materials/service.ts";
import { Materials } from "./features/materials/controller.ts";
import { installMaterialTransfers } from "./features/materials/install-transfer.ts";
import { enterFullscreenMainUI, hostDocument, installNavigation, installWorkbenchStyle, isHostSidebarVisible, leaveFullscreenMainUI } from "./host/panel-host.ts";
import { installReadingEntries } from "./host/reading-entry.ts";
import { panels } from "./workspace/context.ts";
import { installWorkspaceContext } from "./features/workspace-context/install.ts";
import { installContentWriteback, type ContentInstallation } from "./features/content-writeback/installer.ts";
import { installAgentWorkspace, workspaceBindingPort } from "./features/agent-workspace/installer.ts";
import { installStageWorkbench, type StageInstallation } from "./features/stage-workbench/installer.ts";
import { fileName } from "./features/materials/names.ts";
import { sameLensScope } from "./features/work-view/lens-source.ts";
import { sha256,sourceAvailability,type SourceScope } from "./workspace/source-protocol.ts";
import type { ReadingMaterial } from "./features/work-view/reading-layout.ts";
import { previewFormat } from "./features/materials/preview/paths.ts";
import { copyMaterialLink } from "./host/clipboard.ts";
import type { CollaborateTargetId } from "./features/work-view/reading-ai.ts";

declare const __WORKBENCH_BUILD__: string;
const loadedBuild = typeof __WORKBENCH_BUILD__ === "string" ? __WORKBENCH_BUILD__ : "开发源码";

logseq.useSettingsSchema([
  { key: "workbenchBuildInfo", type: "heading", default: null, title: "当前加载版本", description: loadedBuild },
  { key: "workCatalogProjectTags", type: "string", default: "", title: "已有项目标签", description: "自动发现会识别页面的「项目」和「Project」标签。可补充你已经在用的标签，用逗号分隔。" },
  { key: "kernelDescriptorJson", type: "string", default: "", title: "Kernel descriptor JSON", description: "连接正式任务管理使用的本地 Kernel。工作视图和材料可独立使用。" },
  { key: "agentWorkspaceDescriptor", type: "string", default: "", title: "DSH 协作连接", description: "仅在需要配置协作服务时填写。通过「在 DSH 继续」连接当前工作，阅读不依赖此设置。" },
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
  const workspace = installWorkspaceContext(id => { if (!materials) throw new Error("材料模块未启用。"); return materials.readMaterial(id); },()=>work?.readingAPI.read().scope??null);
  let stopTasks: (() => Promise<void>) | null = null;
  let content: ContentInstallation | null = null;
  let agentWorkspace: ReturnType<typeof installAgentWorkspace> | null = null;
  let stages: StageInstallation | null = null;
  let removeCatalog: () => void = () => undefined;
  let workSearch: WorkCatalogView | null = null;
  let globalStage: GlobalStageOverlay | null = null;
  let focusCapsule: QuietFocusCapsule | null = null;
  let removeStageCommand: () => void = () => undefined;
  let disposed = false;
  const host = window as Window & {taskCopilotWorkbench?: unknown};
  let publishedApi: unknown = null;
  let removeReadingEntries: () => void = () => undefined;
  let removeNavigation: () => void = () => undefined;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    focusCapsule?.dispose(); globalStage?.dispose(); removeStageCommand(); workSearch?.dispose(); removeCatalog(); setDshObjectEntry(null); materials?.setWorkChrome(null); agentWorkspace?.dispose(); stages?.dispose(); workspace.dispose(); content?.dispose(); work?.dispose(); materials?.dispose(); pluginRuntime.stop(); removeNavigation(); removeReadingEntries();
    if (host.taskCopilotWorkbench === publishedApi) delete host.taskCopilotWorkbench;
    await stopTasks?.();
  };
  logseq.beforeunload(dispose);
  const report = (error: unknown) => void logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "warning");
  const currentWorkRoot = () => work?.readingAPI.read().scope?.rootUuid ?? null;
  const currentAnchorKey = (): string | null => {
    const scope = work?.readingAPI.read().scope;
    if (!scope) return null;
    try {
      return workKey({
        kind: "logseq",
        graphId: scope.graphId,
        rootUuid: scope.rootUuid,
        sourceKind: scope.kind === "page" ? "page" : "block",
      });
    } catch {
      return null;
    }
  };
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
  logseq.provideStyle("body.tc-sidebar-docked #main-content-container{margin-right:var(--tc-sidebar-width)}body.tc-sidebar-docked .ui__notifications{right:var(--tc-sidebar-width)!important;width:auto!important;max-width:calc(100vw - var(--tc-sidebar-width))!important}body.tc-sidebar-compact #main-content-container{opacity:0;pointer-events:none}");
  if (materials && work) materials.setWorkChrome((surface, scope) => work!.mountMaterialChrome(surface, scope), scope => work!.rememberMaterials(scope), uuid => work!.materialContext(uuid));
  const actions: Record<string, () => void> = {};
  if (work) actions["找工作"] = () => void workSearch?.open().catch(report);
  if (work) actions["当前工作"] = () => void work?.openToolbar().then(() => work?.focusReading()).catch(report);
  actions["全局星图"] = () => void globalStage?.open(currentAnchorKey()).catch(report);
  if (materials) actions["全部材料"] = () => void materials?.library(null).catch(report);
  actions["正式任务"] = () => { void (async()=>{
    if (!stopTasks && !await pluginRuntime.configured()){logseq.showSettingsUI();return;}
    if(logseq.settings?.tasksEnabled===false)logseq.updateSettings({tasksEnabled:true});
    await activateTasks();await openTaskCenter();
  })().catch(report); };
  actions["插件设置"] = () => void panels.closeActive().then(() => logseq.showSettingsUI()).catch(report);
  if (disposed) return;
  removeNavigation = installNavigation(actions);
  logseq.provideModel({ workbenchOpen: () => { if (disposed) return; if (work) void work.openToolbar().catch(report); else if (materials) void materials.library().catch(report); else void openTaskCenter().catch(report); } });
  logseq.App.registerUIItem("toolbar", { key: "workbench-toolbar", template: '<button type="button" class="button" style="font-size:13px;line-height:1.5;width:auto;padding:4px 8px" data-workbench-toolbar="true" data-on-click="workbenchOpen" title="打开工作台" aria-label="打开工作台">工作台</button>' });
  if(work){const entries=installReadingEntries(uuid=>work!.open(uuid),()=>work!.openPage(),report);removeReadingEntries=entries.dispose;}
  const requireActive = () => { if (disposed) throw new Error("工作台已关闭。"); };
  const requireMaterials = () => { requireActive(); if (!materials) throw new Error("材料模块未启用。"); return materials; };
  if(work&&materials){
  const readingPort={
    list:async (scope:SourceScope)=>{
      const valid=workspace.service.observeScope(scope),module=requireMaterials();
      const list=await module.listMaterials(scope.rootUuid,"");
      const binding=await workspace.service.resolve(scope);
      for(const association of binding?.manifest.associations??[])if(association.kind==="material"&&!list.materials.some(view=>view.id===association.id))list.materials.push(await module.readMaterial(association.id));
      if(!valid())throw new Error("READING_MATERIAL_SCOPE_CHANGED");
      const reading:ReadingMaterial[]=list.materials.map(view=>({id:view.id,filename:fileName(view.path),reference:view.reference,availability:view.availability,version:view.version,...(view.content?{excerpt:view.content.slice(0,4000),text:view.content.slice(0,64000),truncated:view.content.length>64000}:{})}));
      for(const view of list.materials.filter(item=>item.availability==="available"&&previewFormat(item.path)==="image")){
        const item=reading.find(material=>material.id===view.id)!;item.media="image";
        try{const preview=await module.readingImage(view.id,scope.rootUuid);if(preview)Object.assign(item,preview);}catch{ /* An unpreviewable image still has its original material entry. */ }
      }
      for(const association of binding?.manifest.associations??[]){
        if(association.kind==="material"||association.graphId!==scope.graphId)continue;
        const saved:SourceScope=association.kind==="logseq-page"?{graphId:association.graphId,rootUuid:association.pageUuid,kind:"page",pageName:association.pageName}:{graphId:association.graphId,rootUuid:association.blockUuid};
        const note=await workspace.service.currentPageScope(saved,true)??saved,id=`note:${saved.rootUuid}`;
        if(sameLensScope(note,scope)||reading.some(item=>item.id===id))continue;
        const snapshot=await workspace.service.readSource(note,valid),content=snapshot.blocks.map(block=>block.content??"").join("\n\n");
        const filename=note.pageName??snapshot.blocks[0]?.content?.split("\n")[0]?.slice(0,80)??"关联笔记";
        reading.push({id,filename,reference:note.kind==="page"?`[[${filename}]]`:`((${note.rootUuid}))`,note,
          availability:sourceAvailability(snapshot)==="available"?"available":"unavailable",version:await sha256(JSON.stringify([snapshot.page?.availability,snapshot.blocks.map(block=>[block.depth,block.order,block.contentVersion,block.availability])])),excerpt:content.slice(0,4000),text:content.slice(0,64000),truncated:content.length>64000});
      }
      if(!valid())throw new Error("READING_MATERIAL_SCOPE_CHANGED");
      return reading;
    },delegateFileClick:(event:MouseEvent,scope:SourceScope)=>requireMaterials().delegateFileClick(event,scope.rootUuid),open:async(id:string,scope:SourceScope)=>{
      requireActive();const actual=work?.readingAPI.read().scope;if(actual&&sameLensScope(actual,scope))await requireMaterials().openDoc(id,scope.rootUuid);
      else throw new Error("READING_MATERIAL_SCOPE_CHANGED");
    }
  };
  work.setReadingMaterials(readingPort);
  materials.setAssociatedSources(async root=>{
    const scope=work!.readingAPI.read().scope;
    if(!scope||scope.rootUuid!==root)return {materialIds:[],notes:[]};
    const binding=await workspace.service.resolve(scope);
    return {materialIds:(binding?.manifest.associations??[]).flatMap(a=>a.kind==="material"?[a.id]:[]),
      notes:(binding?.manifest.associations??[]).flatMap(a=>a.kind==="material"?[]:[{id:`note:${a.kind==="logseq-page"?a.pageUuid:a.blockUuid}`,title:a.kind==="logseq-page"?a.pageName:"关联笔记块"}])};
  },id=>work!.openAssociatedNote(id));
  }
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
  agentWorkspace = installAgentWorkspace({content,materials,work,binding:workspaceBindingPort(workspace.service),source:workspace.api,
    formalTarget:dshFormalTarget,
    ensureDshWork:(scope,check)=>ensureDshWork(scope,{resolve:workspace.api.resolve,directory:scope=>requireMaterials().prepareWorkDirectory(scope),bind:workspace.api.bind,check}),stage:{
    history:async binding=>{requireStageScope(binding.scope);const history=await stageApi.history();requireStageScope(binding.scope);return history;},
    read:async (input,binding)=>{
      requireStageScope(binding.scope);
      const value = workRecord(input,["stageId"]);
      if (value.stageId !== undefined) return stageApi.read(value);
      const history = await stageApi.history();
      requireStageScope(binding.scope);
      return history.current ? stageApi.read({stageId:history.current}) : {status:"unavailable",reason:"STAGE_CURRENT_UNAVAILABLE"};
    },
    submit:async (input,binding,origin)=>{requireStageScope(binding.scope);return origin?stages.trustedSubmit(input,origin):stageApi.submit(input);},
  }});
  const catalog = installCatalogPublisher(async () => await pluginRuntime.configured() ? (await (await pluginRuntime.client()).listObjectAnchorIndex()).objects : [], async scope => (await workspace.api.resolve(scope))?.directory);
  removeCatalog = catalog.dispose;
  interface PreFocusScene {
    leftSidebarOpen: boolean;
    rightSidebarOpen: boolean;
    workbenchPanel: string | null;
    page:
      | { kind: "home" }
      | { kind: "page"; name: string }
      | { kind: "block"; uuid: string }
      | null;
    navigatedByFocus: boolean;
  }
  let preFocusScene: PreFocusScene | null = null;
  let pendingEnterFocus: Promise<void> | null = null;
  let enteredFocusSessionId: string | null = null;

  const captureCurrentPage = async (): Promise<PreFocusScene["page"]> => {
    try {
      const current = await logseq.Editor.getCurrentPage();
      if (!current) return { kind: "home" };
      const pageLike = current as { originalName?: unknown; name?: unknown; uuid?: unknown };
      if (typeof pageLike.originalName === "string" && pageLike.originalName.trim()) {
        return { kind: "page", name: pageLike.originalName };
      }
      if (typeof pageLike.name === "string" && pageLike.name.trim()) {
        return { kind: "page", name: pageLike.name };
      }
      if (typeof pageLike.uuid === "string" && pageLike.uuid.trim()) {
        return { kind: "block", uuid: pageLike.uuid };
      }
    } catch {
      // Fail open if Logseq page API is temporarily unavailable.
    }
    return null;
  };

  const applyZenDistractionHide = async (enabled: boolean) => {
    if (enabled) {
      if (panels.active) await panels.closeActive().catch(() => undefined);
      try { logseq.App.setLeftSidebarVisible(false); } catch { /* ignore */ }
      try { logseq.App.setRightSidebarVisible(false); } catch { /* ignore */ }
      return;
    }
    if (preFocusScene) {
      try { logseq.App.setLeftSidebarVisible(preFocusScene.leftSidebarOpen); } catch { /* ignore */ }
      try { logseq.App.setRightSidebarVisible(preFocusScene.rightSidebarOpen); } catch { /* ignore */ }
    }
  };

  const enterFocusMode = (session: { id: string }): Promise<void> => {
    if (enteredFocusSessionId === session.id && pendingEnterFocus) return pendingEnterFocus;
    enteredFocusSessionId = session.id;
    const task = (async () => {
      if (!preFocusScene) {
        const doc = hostDocument();
        const leftSidebarOpen =
          isHostSidebarVisible("#left-sidebar") ||
          Boolean(doc?.querySelector("#main-container.is-left-sidebar-open"));
        const rightSidebarOpen = isHostSidebarVisible(".cp__right-sidebar");
        const workbenchPanel = panels.active;
        const page = await captureCurrentPage();
        preFocusScene = {
          leftSidebarOpen,
          rightSidebarOpen,
          workbenchPanel,
          page,
          navigatedByFocus: false,
        };
      }
      await applyZenDistractionHide(true);
    })();
    pendingEnterFocus = task;
    return task;
  };

  const restorePreFocusScene = async () => {
    if (pendingEnterFocus) await pendingEnterFocus.catch(() => undefined);
    pendingEnterFocus = null;
    enteredFocusSessionId = null;
    const scene = preFocusScene;
    preFocusScene = null;
    if (!scene || disposed) return;
    try { logseq.App.setLeftSidebarVisible(scene.leftSidebarOpen); } catch { /* ignore */ }
    try { logseq.App.setRightSidebarVisible(scene.rightSidebarOpen); } catch { /* ignore */ }
    if (scene.navigatedByFocus && scene.page) {
      try {
        if (scene.page.kind === "home") {
          logseq.App.pushState("home");
        } else if (scene.page.kind === "page") {
          logseq.App.pushState("page", { name: scene.page.name });
        } else {
          logseq.App.pushState("page", { name: scene.page.uuid });
        }
      } catch {
        // ignore navigation failure on exit
      }
    }
    if (!globalStage?.isOpen && scene.workbenchPanel) {
      try {
        if (scene.workbenchPanel === "work") await work?.openToolbar();
        else if (scene.workbenchPanel === "search") await workSearch?.open();
        else if (scene.workbenchPanel === "materials") await materials?.library(null);
        else if (scene.workbenchPanel === "tasks") await openTaskCenter();
      } catch {
        // ignore panel reopen error
      }
    }
  };

  const navigateFocusWork = async (session: { id: string; workRef?: { kind: string; rootUuid?: string; sourceKind?: string } | null; title: string }) => {
    await enterFocusMode(session);
    if (session.workRef?.kind !== "logseq" || !session.workRef.rootUuid) return;
    if (preFocusScene) preFocusScene.navigatedByFocus = true;
    try {
      if (session.workRef.sourceKind === "page") {
        logseq.App.pushState("page", { name: session.title });
        return;
      }
      const blk = await logseq.Editor.getBlock(session.workRef.rootUuid);
      const pageEntity = blk?.page?.id ? await logseq.Editor.getPage(blk.page.id) : null;
      const pageName =
        (pageEntity as { originalName?: string; name?: string } | null)?.originalName ??
        (pageEntity as { name?: string } | null)?.name;
      if (pageName) {
        logseq.Editor.scrollToBlockInPage(pageName, session.workRef.rootUuid);
      } else {
        logseq.App.pushState("page", { name: session.workRef.rootUuid });
      }
    } catch {
      // Fallback gracefully if block cannot be navigated natively
    }
  };
  focusCapsule = new QuietFocusCapsule({
    fetchSnapshot: async () => {
      try {
        return await agentWorkspace!.local.stageState();
      } catch {
        return null;
      }
    },
    dispatch: async action => {
      const out = await agentWorkspace!.local.stageAction(action);
      return out.snapshot;
    },
    onOpenStage: () => {
      if (!disposed) void globalStage?.open(currentAnchorKey()).catch(report);
    },
    onNavigateWork: async session => {
      await navigateFocusWork(session);
    },
    onEnterFocusMode: async session => {
      await enterFocusMode(session);
    },
    onZenModeChange: async enabled => {
      await applyZenDistractionHide(enabled);
    },
    onExitFocusMode: async () => {
      await restorePreFocusScene();
    },
    notify: (message, status) => {
      void logseq.UI.showMsg(message, status ?? "success");
    },
  });
  const resolveStageTargetScope = async (target: StageWorkTarget): Promise<SourceScope> => {
    if (target.workRef.kind !== "logseq") {
      throw new Error("该工作对象暂不支持直接从 Logseq 跳入 DSH。");
    }
    if (target.workRef.sourceKind === "page") {
      const page = await logseq.Editor.getPage(target.title);
      const pageName = String(page?.originalName ?? page?.name ?? target.title);
      return {
        graphId: target.workRef.graphId,
        rootUuid: page?.uuid ?? target.workRef.rootUuid,
        kind: "page",
        pageName,
      };
    }
    return {
      graphId: target.workRef.graphId,
      rootUuid: target.workRef.rootUuid,
    };
  };
  const openStageTargetInDsh = async (target: StageWorkTarget): Promise<void> => {
    const scope = await resolveStageTargetScope(target);
    await agentWorkspace!.local.openWork(scope, "continue", false, undefined, "dsh");
  };
  const openStageTargetInLogseq = async (target: StageWorkTarget): Promise<void> => {
    if (!work) return;
    if (target.workRef.kind === "logseq") {
      if (target.workRef.sourceKind === "page") await work.openPage(target.title);
      else await work.open(target.workRef.rootUuid);
      return;
    }
    await work.openPage(target.title);
  };
  globalStage = new GlobalStageOverlay({
    remote: {
      stageState: () => agentWorkspace!.local.stageState(),
      stageAction: action => agentWorkspace!.local.stageAction(action),
      stageAnchor: key => agentWorkspace!.local.stageAnchor(key),
    },
    readLocalCatalog: async () => {
      const snap = await catalog.read();
      return {
        schemaVersion: 1,
        graphId: snap.graphId,
        graphName: snap.graphName,
        refreshedAt: snap.refreshedAt,
        works: snap.works,
      };
    },
    openProject: async project => {
      await openStageTargetInLogseq({ workRef: project.workRef, workKey: project.workKey, title: project.title });
    },
    openInDsh: async target => {
      await openStageTargetInDsh(target);
    },
    openTargetInLogseq: async target => {
      await openStageTargetInLogseq(target);
    },
    discussInDsh: async (summary) => {
      try {
        const res = await agentWorkspace!.local.stageOpenDsh();
        if (res.url) {
          await logseq.App.openExternalLink(res.url);
          return;
        }
      } catch (err) {
        await copyMaterialLink(summary).catch(() => undefined);
        const detail = err instanceof Error ? err.message : "请确认 Companion 与 DSH 已启动";
        throw new Error(`未能直连 DSH（${detail}），已复制当前画面摘要到剪贴板。`, { cause: err });
      }
      await copyMaterialLink(summary).catch(() => undefined);
      throw new Error("未能取得 DSH 入口，已复制当前画面摘要到剪贴板。");
    },
    openFocusWork: async session => {
      await navigateFocusWork(session);
    },
    onSnapshot: snap => {
      focusCapsule?.syncFromSnapshot(snap);
    },
    promoteTodo: async (item, project) => {
      const text = `TODO ${item.title}`;
      if (project?.workRef.kind === "logseq") {
        if (project.workRef.sourceKind === "page") {
          await logseq.Editor.appendBlockInPage(project.title, text);
          return;
        }
        await logseq.Editor.insertBlock(project.workRef.rootUuid, text, { sibling: false });
        return;
      }
      const root = currentWorkRoot();
      if (root) {
        await logseq.Editor.insertBlock(root, text, { sibling: false });
        return;
      }
      throw new Error("请先在 Logseq 打开目标项目页或块后再写入 TODO。");
    },
    openExternalUrl: async url => {
      await logseq.App.openExternalLink(url);
    },
    onOpenSurface: () => {
      enterFullscreenMainUI();
    },
    onCloseSurface: () => {
      leaveFullscreenMainUI();
    },
    notify: (message, status) => {
      void logseq.UI.showMsg(message, status ?? "success");
    },
  });
  const stageCmd = logseq.App.registerCommandPalette(
    { key: "workbench-global-stage", label: "工作台：拉远到全局星图" },
    () => { if (!disposed) void globalStage?.open(currentAnchorKey()).catch(report); },
  );
  if (typeof stageCmd === "function") removeStageCommand = stageCmd;
  if (work) {
    workSearch = new WorkCatalogView(catalog, work);
    work.setWorkSearch(actions["找工作"]!);
    work.setGlobalStage(() => { void globalStage?.open(currentAnchorKey()).catch(report); });
    work.setReadingAI({
      complete:(input,signal)=>agentWorkspace!.local.generateReading(input,signal),
      handoff:(scope,intent,target)=>agentWorkspace!.local.openWork(scope,"continue",false,intent,target),
      startJob:input=>agentWorkspace!.local.startReadingJob(input),
      jobStatus:query=>agentWorkspace!.local.readingJobStatus(query),
      ackJob:jobId=>agentWorkspace!.local.ackReadingJob(jobId),
      cancelJob:query=>agentWorkspace!.local.cancelReadingJob(query),
      providers:()=>agentWorkspace!.local.readingProviders(),
      selectRoute:route=>agentWorkspace!.local.selectReadingRoute(route),
      collaborateTargets:()=>agentWorkspace!.local.collaborateTargets(),
      selectCollaborateTarget:target=>agentWorkspace!.local.selectCollaborateTarget(target),
      setWorkPrivacy:(workKey,privacyMode,scope)=>agentWorkspace!.local.setWorkPrivacy(workKey,privacyMode,scope),
      noteTidy:(input,signal)=>agentWorkspace!.local.runNoteTidy(input,signal),
      listWritebackProposals:workKey=>agentWorkspace!.local.listWritebackProposals(workKey),
      consumeWritebackProposal:(proposalId,action)=>agentWorkspace!.local.consumeWritebackProposal(proposalId,action),
    });
  }
  setDshObjectEntry(async scope=>{await agentWorkspace!.local.openWork(scope,"continue",false,undefined,"dsh");});
  stages.setCollaboration({status:agentWorkspace.api.status,connect:agentWorkspace.local.connect,stop:agentWorkspace.local.stop});
  const collaborateFromMenu = async (scope: SourceScope, target: CollaborateTargetId) => {
    const result = await agentWorkspace!.local.openWork(scope, "continue", false, undefined, target);
    if (result.target !== "dsh") {
      if (result.handoffPrompt) await copyMaterialLink(result.handoffPrompt).catch(() => undefined);
      await logseq.UI.showMsg(`已暂存 ${result.targetLabel} 交接上下文并复制交接指令。`, "success");
    }
  };
  work?.setContextActions(() => {
    const scope=work!.readingAPI.read().scope,root=scope?.rootUuid;
    if (!root || !scope) return [];
    const connection = agentWorkspace?.api.status();
    const connected = !!connection?.connected && !!connection.binding && sameWorkScope(connection.binding.scope, scope);
    const page=scope.kind==="page";
    return [
      {group:"外部协作",label:"在 Codex 继续",run:()=>collaborateFromMenu(scope,"codex")},
      {group:"外部协作",label:"在 Antigravity 继续",run:()=>collaborateFromMenu(scope,"antigravity")},
      {group:"外部协作",label:"在 Claude Code 继续",run:()=>collaborateFromMenu(scope,"claude-code")},
      {group:"外部协作",label:"新建 DSH 对话",run:()=>agentWorkspace!.local.openWork(scope,"new",false,undefined,"dsh")},
      {group:"外部协作",label:"共同指导与项目差异",run:()=>agentWorkspace!.local.guidance(scope)},
      {group:"工作目录",label:"关联已有目录",run:()=>workspace.local.bind(scope)},
      {group:"工作目录",label:"打开目录读取入口",run:()=>workspace.local.open(scope)},
      {group:"工作目录",label:"重新关联移动后的目录",run:()=>workspace.local.rebind(scope)},
      ...(!connected?[{group:"授权与恢复",label:"建立只读连接",run:()=>agentWorkspace!.local.connectRead(scope)}]:[]),
      ...(!page&&(!connected||!connection.permissions.bodyWrite)?[{group:"授权与恢复",label:"允许维护当前工作正文",run:()=>agentWorkspace!.local.connect(root)}]:[]),
      ...(connected&&!connection.permissions.fileWrite?[{group:"授权与恢复",label:"允许写工作文件",run:()=>agentWorkspace!.local.allowFiles()}]:[]),
      ...(!page&&connected?[{group:"授权与恢复",label:"允许维护普通 TODO",run:()=>agentWorkspace!.local.allowTodo()}]:[]),
      ...(!page?[{group:"授权与恢复",label:"允许润色并整理原块",run:()=>agentWorkspace!.local.connect(root,true)},
        {group:"授权与恢复",label:"检查写回冲突",run:()=>content!.local.recovery(root)},
        {group:"维护",label:"查看整理前原文快照",run:()=>work!.openTidySnapshots()},
        {group:"维护",label:"核对行首格式",run:()=>agentWorkspace!.local.format(root)}]:[
        {group:"维护",label:"查看整理前原文快照",run:()=>work!.openTidySnapshots()}]),
      ...(connected?[{group:"授权与恢复",label:"停止本次连接",run:()=>agentWorkspace!.local.stop()}]:[]),
    ];
  });
  const api = {
    read: () => disposed ? null : work?.snapshot() ?? null,
    open: async (uuid?: string) => { requireActive(); await work?.open(uuid); },
    openPage: async (name?: string) => {requireActive();await work?.openPage(name);},
    openMaterial: async (id: string) => { requireActive(); await materials?.openDoc(id, currentWorkRoot()); },
    tidyNotes: async (targetRootUuid?: string) => { requireActive(); await work?.tidyNotes(targetRootUuid); },
    openTidySnapshots: async () => { requireActive(); await work?.openTidySnapshots(); },
    close: async () => { if (!disposed) await panels.closeActive(); },
    apply: (operation: unknown) => disposed ? {ok: false, reason: "workbench-disposed"} : work?.apply(operation) ?? {ok: false, reason: "work-view-disabled"},
    workspace: workspace.api,
    content: content.api,
    agentWorkspace: agentWorkspace.api,
    dsh: {open:(target?: string | AgentWorkScope, mode: "continue" | "new" = "continue")=>agentWorkspace!.local.openWork(target,mode,false,undefined,"dsh")},
    collaborate: {
      open:(target?: string | AgentWorkScope, targetAgent?: CollaborateTargetId, mode: "continue" | "new" = "continue")=>agentWorkspace!.local.openWork(target,mode,false,undefined,targetAgent),
      targets:()=>agentWorkspace!.local.collaborateTargets(),
      selectTarget:(targetAgent: CollaborateTargetId)=>agentWorkspace!.local.selectCollaborateTarget(targetAgent),
    },
    stages: stages.api,
    globalStage: {
      open: async (anchorKey?: string) => { requireActive(); await globalStage?.open(anchorKey ?? currentAnchorKey()); },
      close: () => { globalStage?.close(); },
    },
    materials: {
      list: (input: {sourceUuid?: string; query?: string} = {}) => requireMaterials().listMaterials(input.sourceUuid ?? null, input.query ?? ""),
      read: (id: string) => requireMaterials().readMaterial(id),
      capture: (request: CaptureRequest) => requireMaterials().capture(request),
      import: (input: {path: string; requestKey: string; sourceUuid: string}) => requireMaterials().importMaterial(input),
      associate: (input: {id?: string; path?: string; sourceUuid: string}) => requireMaterials().associateMaterial(input),
      resolveFile: (input: {path: string; sourceUuid?: string}) => requireMaterials().resolveDirectoryFile(input.path, input.sourceUuid ?? currentWorkRoot()),
      openLink: (href: string, sourceUuid?: string) => requireMaterials().openPreviewLink(href, sourceUuid ?? currentWorkRoot()),
      delegateFileClick: (event: MouseEvent, sourceUuid: string | null, sourcePath?: string) => requireMaterials().delegateFileClick(event, sourceUuid, sourcePath),
      save: (input: {id: string; expectedVersion: string; expectedContent: string; next: string}) => requireMaterials().saveMaterial(input.id, input.expectedVersion, input.expectedContent, input.next),
    },
    readMaterials: async (content: string) => { requireActive(); return materials?.linkedContext(content) ?? []; },
    lenses: work?.lensesAPI ?? null,
    report: work?.reportAPI ?? null,
    reading: work?.readingAPI ?? null,
  };
  publishedApi = api;
  host.taskCopilotWorkbench = api;
  focusCapsule.start();
  await work?.restoreReadingSession();
}

logseq.ready(main).catch(error => console.error("Workbench bootstrap failed", error));
