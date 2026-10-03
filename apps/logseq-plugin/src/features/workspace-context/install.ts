import { graphIdentity } from "../../graph-adapter.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import { desktopBridge, desktopFiles } from "../../host/desktop-files.ts";
import { button, element, FeaturePanel } from "../../host/panel-host.ts";
import { panels } from "../../workspace/context.ts";
import { MaterialDirectories, type MaterialBindingCommands } from "../../workspace/material-context.ts";
import { WorkspaceRegistry, type BindRequest } from "../../workspace/registry.ts";
import { WorkspaceContextService, type ContextReading } from "../../workspace/context-service.ts";
import { SourceReader, ScopeExpired } from "../../workspace/source-reader.ts";
import { identifier, object, scopeOf, type SourceScope } from "../../workspace/source-protocol.ts";

/** Always installed, including tasksEnabled=false. Owns only local commands and known-source observation. */
export function installWorkspaceContext(readMaterial: (id: string) => Promise<unknown>) {
  let disposed = false, graphPath = "", uiEpoch = 0;
  const directories = new MaterialDirectories(localStorage), off: Array<() => void> = [];
  const current = async () => {
    const graph = await logseq.App.getCurrentGraph();
    if (!graph) throw new Error("Logseq Graph 暂不可用，读取已有目录副本。");
    graphPath = graph.path ?? "";
    return {graphId: graphIdentity(graph), materialGraph: graph.path ?? graphIdentity(graph)};
  };
  const service = new WorkspaceContextService(new WorkspaceRegistry(desktopFiles(() => graphPath), directories, localStorage), new SourceReader({
    graphId: async () => (await current()).graphId,
    getBlock: (uuid, options) => logseq.Editor.getBlock(uuid, options),
    getPage: name => logseq.Editor.getPage(name), getPageBlocksTree: name => logseq.Editor.getPageBlocksTree(name),
  }), {
    current, readMaterial,
    persistRoot: async (scope, valid) => {
      const check = async () => { if (!valid() || (await current()).graphId !== scope.graphId || !valid()) throw new ScopeExpired(); };
      await check();
      if (await logseq.Editor.checkEditing()) throw new Error("请先结束块编辑，再关联目录。");
      const block = await logseq.Editor.getBlock(scope.rootUuid); await check();
      if (!block) throw new Error("工作入口暂不可读。");
      const body = object(block), content = typeof body.content === "string" ? body.content : body.title;
      if (typeof content !== "string") throw new Error("工作入口暂不可读。");
      const isDbGraph = await currentGraphIsDb(logseq.App); await check();
      await ensurePersistentSourceIdentity({
        getBlock: async uuid => { await check(); const result = await logseq.Editor.getBlock(uuid); await check(); return result; },
        upsertBlockProperty: async (uuid, key, value) => { await check(); await logseq.Editor.upsertBlockProperty(uuid, key, value); await check(); },
      }, {uuid: scope.rootUuid, content, isDbGraph}); await check();
    },
  });
  const panel = new FeaturePanel("workspace", "工作目录"), body = element("div", "", "wb-scroll"); panel.root.append(body);
  const userProblem = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    if (/WORKSPACE_.*(?:LARGE|LINES)/u.test(text)) return "来源范围超过本地读取上限，旧副本已保留。";
    return text.includes("WORKSPACE_") ? "工作记录或输入未通过校验，请核对目录与来源后重试。" : text;
  };
  const report = (error: unknown) => { if (!disposed && !(error instanceof ScopeExpired)) void logseq.UI.showMsg(userProblem(error), "warning"); };
  const pending = new Map<string, SourceScope>(); let timer: ReturnType<typeof setTimeout> | null = null, pumping = false;
  const pump = async () => {
    timer = null; if (pumping || disposed) return; pumping = true;
    const batch = [...pending.values()]; pending.clear();
    try {
      for (const scope of batch) {
        if (disposed) break;
        try { await service.refresh(scope); } catch (error) { if (!(error instanceof ScopeExpired)) console.warn("Workspace mirror refresh failed", error); }
      }
    } finally { pumping = false; if (pending.size && !disposed && !timer) timer = setTimeout(() => void pump(), 100); }
  };
  const schedule = (scopes: SourceScope[]) => {
    for (const scope of scopes) pending.set(JSON.stringify(scope), scope);
    if (pending.size && !timer && !pumping && !disposed) timer = setTimeout(() => void pump(), 100);
  };
  const restore = async () => { const ticket = uiEpoch; const scopes = await service.restoreKnown(); if (!disposed && ticket === uiEpoch) schedule(scopes); };
  off.push(logseq.DB.onChanged(() => schedule(service.changed())));
  off.push(logseq.App.onCurrentGraphChanged(() => {
    uiEpoch++; service.invalidate(); pending.clear(); if (timer) clearTimeout(timer); timer = null;
    void panel.close(); void restore().catch(report);
  }));
  const poll = setInterval(() => { if (!disposed) schedule(service.registeredScopes()); }, 5000);
  void restore().catch(report);
  const activeScope = async (uuid?: string): Promise<SourceScope> => {
    const ticket = uiEpoch, graph = await current(), block = uuid ? await logseq.Editor.getBlock(identifier(uuid)) : await logseq.Editor.getCurrentBlock();
    if (disposed || ticket !== uiEpoch) throw new ScopeExpired();
    if (!block) throw new Error("请先选择工作块。"); return {graphId: graph.graphId, rootUuid: block.uuid};
  };
  const showResult = (result: ContextReading) => {
    const text = result.freshness === "checked" ? "工作记录已刷新。" : "关联已保存；当前读取为最后已知副本，请检查 Logseq 或目录。";
    void logseq.UI.showMsg(result.problem ? userProblem(result.problem) : text, result.freshness === "checked" ? "success" : "warning");
  };
  const openEntry = async (scope: SourceScope) => {
    const binding = await service.resolve(scope); if (!binding) throw new Error("请先关联工作目录。");
    await desktopBridge().openPath(binding.entryPath);
  };
  const promptBinding = async (uuid?: string, rebind = false, create = false) => {
    const scope = await activeScope(uuid), ticket = ++uiEpoch, navigation = panels.reserve();
    const binding = await service.resolve(scope); if (disposed || ticket !== uiEpoch) return;
    const block = await logseq.Editor.getBlock(scope.rootUuid); if (disposed || ticket !== uiEpoch) return;
    const path = element("input"); path.value = binding?.directory ?? ""; path.placeholder = "Graph 外的绝对目录"; path.setAttribute("aria-label", "工作目录路径");
    const project = /\*\*\[(MiniProject|Project|项目|小项目)\]\*\*/iu.test(block?.content ?? "");
    const organization = element("select"); organization.setAttribute("aria-label", "目录组织");
    for (const [value, label] of [["flat", "平铺"], ["project", "按需使用材料、工作记录、成果目录"]]) { const option = element("option", label); option.value = value!; organization.append(option); }
    organization.value = binding?.manifest.organization ?? (project ? "project" : "flat");
    const status = element("p");
    const save = button(create ? "新建并关联" : rebind ? "重新关联" : "关联", () => {
      if (disposed || ticket !== uiEpoch) return;
      if (!path.value.trim()) { status.textContent = "请输入工作目录的绝对路径。"; path.focus(); return; }
      save.disabled = true;
      void service.bind({scope, directory: path.value.trim(), organization: organization.value as "flat" | "project", rebind, create}).then(result => {
        if (disposed || ticket !== uiEpoch) return;
        status.textContent = result.problem ? userProblem(result.problem) : (result.freshness === "checked" ? "已关联并保存原文副本。" : "已关联，来源暂不可用，保留旧副本。");
        body.append(button("打开读取入口", () => void openEntry(scope).catch(report)));
      }).catch(error => { if (!disposed && ticket === uiEpoch) status.textContent = userProblem(error); }).finally(() => { save.disabled = false; });
    });
    const form = element("div"); form.style.display = "grid"; form.style.gap = "8px";
    const pathLabel = element("label", "工作目录"), organizationLabel = element("label", "收纳方式");
    path.style.display = "block"; path.style.width = "100%"; organization.style.display = "block";
    pathLabel.append(path); organizationLabel.append(organization);
    const actions = element("div"); actions.append(save, button("关闭", () => void panel.close())); form.append(pathLabel, organizationLabel, actions);
    body.replaceChildren(element("strong", create ? "新建工作目录" : rebind ? "重新关联工作目录" : "关联工作目录"), element("p", (block?.content ?? "").split("\n")[0]!.slice(0, 120)), element("p", "正文继续在 Logseq 编辑。目录保存读取副本和可恢复身份；已有文件不会搬动。"), form, status);
    if (await panel.open(navigation)) path.focus();
  };
  const commands: Array<[string, string, (uuid?: string) => Promise<unknown>]> = [
    ["bind", "关联工作目录", uuid => promptBinding(uuid)],
    ["create", "新建并关联工作目录", uuid => promptBinding(uuid, false, true)],
    ["rebind", "重新关联工作目录", uuid => promptBinding(uuid, true)],
    ["refresh", "刷新工作记录", async uuid => showResult(await service.refresh(await activeScope(uuid)))],
    ["open", "打开工作读取入口", async uuid => openEntry(await activeScope(uuid))],
    ["unbind", "解除工作目录关联", async uuid => { await service.unbind(await activeScope(uuid)); if (!disposed) void logseq.UI.showMsg("已停止该目录的机械更新，笔记和已有文件保留。", "success"); }],
  ];
  for (const [key, label, action] of commands) {
    const palette = logseq.App.registerCommandPalette({key: `workbench-workspace-${key}`, label: `工作台：${label}`}, async () => { if (!disposed) await action().catch(report); });
    const menu = logseq.Editor.registerBlockContextMenuItem(`工作台：${label}`, async event => { if (!disposed) await action(event.uuid).catch(report); });
    if (typeof palette === "function") off.push(palette); if (typeof menu === "function") off.push(menu);
  }
  const materialBindings: MaterialBindingCommands = {directories, bind: async context => {
    const graph = await current();
    if (graph.materialGraph !== context.graph || !context.sourceUuid) throw new ScopeExpired();
    const scope = {graphId: graph.graphId, rootUuid: context.sourceUuid};
    if (context.directory === null) await service.unbind(scope);
    else { const result = await service.bind({scope, directory: context.directory, organization: context.organization, rebind: true}); if (result.freshness !== "checked") report(new Error(result.problem ?? "目录已关联，原文刷新暂未完成。")); }
  }};
  const api = {
    bind: (value: unknown) => {
      const data = object(value); scopeOf(data.scope); identifier(data.directory);
      for (const key of ["create", "rebind"]) if (data[key] !== undefined && typeof data[key] !== "boolean") throw new Error("WORKSPACE_INVALID_BIND_INPUT");
      if (data.organization !== undefined && data.organization !== "flat" && data.organization !== "project") throw new Error("WORKSPACE_INVALID_ORGANIZATION");
      const request: BindRequest = {scope: scopeOf(data.scope), directory: identifier(data.directory), ...(data.organization ? {organization: data.organization as "flat" | "project"} : {}), ...(data.create !== undefined ? {create: data.create as boolean} : {}), ...(data.rebind !== undefined ? {rebind: data.rebind as boolean} : {})};
      return service.bind(request);
    },
    resolve: (scope: SourceScope) => service.resolve(scope), refresh: (scope: SourceScope) => service.refresh(scope),
    read: (scope: SourceScope) => service.read(scope), unbind: (scope: SourceScope) => service.unbind(scope),
    associate: (input: {scope: SourceScope; source: unknown}) => service.associate(input),
  };
  return {api, materialBindings, service, source: {read: (scope: SourceScope, valid: () => boolean) => service.readSource(scope, valid), version: (scope: SourceScope) => service.sourceVersion(scope)}, dispose: () => {
    if (disposed) return; disposed = true; uiEpoch++; service.dispose(); pending.clear();
    if (timer) clearTimeout(timer); clearInterval(poll); for (const remove of off) remove(); void panel.close(); panel.root.remove();
  }};
}
