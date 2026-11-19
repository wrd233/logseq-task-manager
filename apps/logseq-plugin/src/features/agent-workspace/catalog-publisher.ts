import { readScopedPrivateItem, writeScopedPrivateItem } from "../../scoped-private-storage.ts";
import { extractObjectNavigationLabel } from "../../canonical-writing.ts";
import { currentGraphIsDb, ensurePersistentSourceIdentity } from "../../source-identity.ts";
import { parseWorkspaceDescriptor, type CatalogWork, type WorkspacePluginDescriptor, WorkspaceError } from "@task-copilot/contracts";
import { desktopBridge, desktopFiles } from "../../host/desktop-files.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { readSelectedPages, saveSelectedPages, resolveSelectedPage } from "./catalog-pages.ts";
import type { SourceScope } from "../../workspace/source-protocol.ts";
import { collectCatalog, type CatalogBlock, type CatalogFormal } from "./work-catalog.ts";
import { catalogChoiceKeys, catalogContext, explainBlockWork, isIncluded, readCatalogBlocks, readCatalogPages, readDiscovery, selectedPageFor, writeDiscovery } from "./catalog-local.ts";

/** The local index works independently of the optional DSH metadata publisher. */
export function installCatalogPublisher(formal: () => Promise<CatalogFormal[]>, resolveDirectory: (scope: SourceScope) => Promise<string | undefined>) {
  let disposed = false, generation = 0, publishing = false, publishAgain = false, timer: number;
  let preferencesQueue = Promise.resolve();
  const listeners = new Set<() => void>();
  const context = () => {
    const epoch = generation;
    return catalogContext(() => { if (disposed || epoch !== generation) throw new WorkspaceError("GRAPH_SCOPE_CHANGED"); });
  };
  type Context = Awaited<ReturnType<typeof context>>;
  const notes = async (scope: Context, forDsh = false) => {
    const preferences = await readDiscovery(scope);
    const blocks = preferences.enabled || forDsh ? await readCatalogBlocks(scope.check) : [];
    const pages = await readCatalogPages(scope, preferences.enabled);
    return { preferences, blocks, pages };
  };
  const read = async () => {
    const scope = await context();
    const { preferences, blocks, pages } = await notes(scope);
    const snapshot = await collectCatalog({ ...scope, blocks, pages, formal: [], getBlock: id => logseq.Editor.getBlock(id) });
    const markById = new Map(blocks.map(block => [block.uuid, block]));
    const works = snapshot.works.filter(work => isIncluded(work, preferences)).map(work =>
      work.workRef.kind === "logseq" && work.workRef.sourceKind === "block" ? explainBlockWork(work, markById.get(work.workRef.rootUuid)) : work);
    return { ...snapshot, works, enabled: preferences.enabled };
  };

  const publish = async () => {
    if (!await logseq.App.getCurrentGraph()) return;
    const scope = await context();
    const { graphId, check } = scope;
    let path = String(logseq.settings?.agentWorkspaceDescriptor ?? "").trim();
    if (!path) {
      const dot = await desktopBridge().doAction(["getLogseqDotDirRoot"]); check();
      if (typeof dot === "string" && dot.endsWith("/.logseq")) path = `${dot.slice(0,-8)}/.task-copilot-workspace/workspace-plugin.json`;
    }
    if (!path.startsWith("/")) return;
    const descriptor = parseWorkspaceDescriptor(JSON.parse(await desktopFiles(() => graphId).read(path)), true) as WorkspacePluginDescriptor; check();
    const { preferences, blocks, pages } = await notes(scope, true);
    // Legacy DSH discovery had already established native IDs for marked
    // blocks. The opt-in local discovery mode indexes only existing IDs.
    if (!preferences.enabled && blocks.some(block => extractObjectNavigationLabel(block.content) && block.properties?.id !== block.uuid)) {
      const isDbGraph = await currentGraphIsDb({getCurrentGraph: () => logseq.App.getCurrentGraph(), checkCurrentIsDbGraph: () => logseq.App.checkCurrentIsDbGraph()}); check();
      if (!isDbGraph) {
        for (const block of blocks) {
          if (!extractObjectNavigationLabel(block.content) || block.properties?.id === block.uuid || !isIncluded({ workRef: { kind: "logseq", graphId, rootUuid: block.uuid, sourceKind: "block" } }, preferences)) continue;
          // The discovery switch may be saved while an earlier publish is running.
          if ((await readDiscovery(scope)).enabled) return;
          await ensurePersistentSourceIdentity({getBlock: async uuid => {check(); const value = await logseq.Editor.getBlock(uuid); check(); return value;},
            upsertBlockProperty: async (uuid, key, value) => {check(); await logseq.Editor.upsertBlockProperty(uuid, key, value); check();}}, {...block, isDbGraph}); check();
        }
      }
    }
    const cachedFormal = await readScopedPrivateItem(logseq.FileStorage, "work-catalog-formal-metadata", graphId, check);
    let objects: CatalogFormal[];
    try {
      objects = await formal(); check();
      const text = JSON.stringify(objects);
      if (cachedFormal !== text) await writeScopedPrivateItem(logseq.FileStorage, "work-catalog-formal-metadata", graphId, text, check);
    } catch (error) {
      check();
      if (typeof cachedFormal !== "string") throw error;
      objects = JSON.parse(cachedFormal) as CatalogFormal[];
    }
    check();
    const byUuid = new Map(blocks.map(block => [block.uuid, block]));
    for (const item of objects) {
      const anchor = item.anchor as {graphId?: string; externalId?: string} | null;
      if (anchor?.graphId === graphId && anchor.externalId && !byUuid.has(anchor.externalId)) {
        const block = await logseq.Editor.getBlock(anchor.externalId); check();
        if (block) { blocks.push(block as CatalogBlock); byUuid.set(anchor.externalId, block as CatalogBlock); }
      }
    }
    const snapshot = await collectCatalog({ ...scope, blocks, pages, formal: objects, getBlock: id => logseq.Editor.getBlock(id) });
    snapshot.works = snapshot.works.filter(work => isIncluded(work, preferences)).map(work =>
      preferences.enabled && work.workRef.kind === "logseq" && work.workRef.sourceKind === "block" ? explainBlockWork(work, byUuid.get(work.workRef.rootUuid)) : work);
    for (const work of snapshot.works) {
      let rootUuid: string | undefined;
      if (work.workRef.kind === "logseq") rootUuid = work.workRef.sourceKind === "page" ? work.pageSourceUuid : work.workRef.rootUuid;
      else {
        const objectId = work.workRef.objectId;
        const anchor = objects.find(item => item.object.id === objectId)?.anchor as {graphId?: string; externalId?: string} | null;
        if (anchor?.graphId === graphId) rootUuid = anchor.externalId;
      }
      if (!rootUuid) continue;
      const directory = await resolveDirectory({graphId, rootUuid, ...(work.objectType === "页面" ? {kind:"page",pageName:work.title} : {})}); check();
      if (directory) work.directory = directory;
    }
    if (graphIdentity(await logseq.App.getCurrentGraph()) !== graphId) throw new WorkspaceError("GRAPH_SCOPE_CHANGED");
    check();
    const works = snapshot.works.map(({ reason, ...work }) => ({
      ...work, location: preferences.enabled && reason ? `${work.location} · ${reason}`.slice(0,2000) : work.location,
    }));
    const response = await fetch(`${descriptor.baseUrl}/plugin/catalog`, {method: "POST", headers: {"content-type": "application/json", "x-workspace-plugin": descriptor.pluginToken, "x-workspace-instance": descriptor.instanceId}, body: JSON.stringify({ ...snapshot, works }), signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error("工作目录暂未发布");
  };
  const refresh = async () => {
    if (disposed) return;
    if (publishing) { publishAgain = true; return; }
    publishing = true;
    try { await publish(); }
    finally {
      publishing = false;
      if (publishAgain) { publishAgain = false; schedule(); }
    }
  };
  function schedule() {
    window.clearTimeout(timer);
    if (!disposed) timer = window.setTimeout(() => {
      for (const listener of listeners) listener();
      void refresh().catch(() => {});
    }, 700);
  }
  const graphOff = logseq.App.onCurrentGraphChanged(() => {
    generation++;
    for (const listener of listeners) listener();
    schedule();
  });
  const dbOff = logseq.DB.onChanged(schedule);
  const heartbeat = window.setInterval(() => void refresh().catch(() => {}), 15000);

  const change = (operation: (scope: Context) => Promise<void>) => {
    const opening = context(), pending = preferencesQueue.then(async () => {
      const scope = await opening;
      scope.check();
      await operation(scope);
      schedule();
    });
    // Observe the scoped lookup even if another write is still in progress.
    void opening.catch(() => {});
    preferencesQueue = pending.catch(() => {});
    return pending;
  };
  const setEnabled = (enabled: boolean) => change(async scope => {
    await writeDiscovery(scope, { ...await readDiscovery(scope), enabled });
  });
  const setExcluded = (work: CatalogWork, excluded: boolean) => change(async scope => {
    if (work.workRef.kind !== "logseq" || work.workRef.graphId !== scope.graphId) throw new WorkspaceError("GRAPH_SCOPE_CHANGED");
    const preferences = await readDiscovery(scope), keys = catalogChoiceKeys(work);
    const rest = preferences.excluded.filter(key => !keys.includes(key));
    await writeDiscovery(scope, { ...preferences, excluded: excluded ? [...rest, ...keys] : rest });
  });
  const selectCurrentPage = (remove = false, missing?: CatalogWork) => change(async scope => {
    const page = await logseq.Editor.getCurrentPage(); scope.check();
    if (!page?.uuid || typeof page.name !== "string") throw new Error("请先打开要收录的页面。");
    const selection = { uuid: page.uuid, name: String(page.originalName ?? page.name) };
    const previous = await readSelectedPages(scope.graphId, scope.check);
    const matching = [];
    for (const selected of previous) if ((await resolveSelectedPage(selected, scope.check))?.sourceUuid === page.uuid) matching.push(selected);
    let chosen = matching[0];
    if (missing) {
      const ref = missing.workRef;
      if (ref.kind !== "logseq" || ref.graphId !== scope.graphId) throw new WorkspaceError("GRAPH_SCOPE_CHANGED");
      const old = previous.find(selected => selected.uuid === ref.rootUuid);
      if (!old || await resolveSelectedPage(old, scope.check)) throw new Error("原笔记已可读取，请刷新后打开。");
      if (chosen) throw new Error("当前页已在工作搜索中，请打开对应的原笔记再关联。");
      chosen = selectedPageFor(selection, old);
    }
    chosen ??= selectedPageFor(selection);
    if (!remove && !matching.length) {
      await saveSelectedPages(scope.graphId, [...previous.filter(selected => selected.uuid !== chosen.uuid), chosen], scope.check);
    }
    const preferences = await readDiscovery(scope);
    const keys = catalogChoiceKeys({ workRef: { kind: "logseq", graphId: scope.graphId, rootUuid: chosen.uuid, sourceKind: "page" }, pageSourceUuid: page.uuid });
    const rest = preferences.excluded.filter(key => !keys.includes(key));
    await writeDiscovery(scope, { ...preferences, excluded: remove ? [...rest, ...keys] : rest });
  });
  const resolve = async (work: CatalogWork) => {
    const scope = await context(), ref = work.workRef;
    if (ref.kind !== "logseq" || ref.graphId !== scope.graphId) throw new WorkspaceError("GRAPH_SCOPE_CHANGED");
    if (ref.sourceKind === "page") {
      const page = work.pageSourceUuid ? await logseq.Editor.getPage(work.pageSourceUuid) : null; scope.check();
      return page ? { kind: "page" as const, name: page.originalName ?? page.name, uuid: page.uuid } : null;
    }
    const block = await logseq.Editor.getBlock(ref.rootUuid); scope.check();
    const page = block && await logseq.Editor.getPage(block.page.id); scope.check();
    return block && page ? { kind: "block" as const, name: page.originalName ?? page.name, uuid: block.uuid } : null;
  };
  const commands = ([
    ["add", "工作台：将当前页面加入工作搜索", false],
    ["remove", "工作台：将当前页面移出工作搜索", true],
  ] as const).map(([action, label, remove]) => logseq.App.registerCommandPalette({key: `work-catalog-page-${action}`, label}, () =>
    selectCurrentPage(remove).then(() => logseq.UI.showMsg(remove ? "此页面已移出工作搜索。" : "此页面已加入工作搜索。", "success"))
      .catch(error => logseq.UI.showMsg(String(error), "warning"))));
  const refreshOff = logseq.App.registerCommandPalette({key: "work-catalog-refresh", label: "工作台：刷新工作搜索目录"}, async () => {
    try {
      await read();
      for (const listener of listeners) listener();
      void refresh().catch(() => {});
      await logseq.UI.showMsg("工作搜索目录已更新。", "success");
    } catch (error) { await logseq.UI.showMsg(`工作搜索目录未更新：${String(error)}`, "warning"); }
  });
  const settingsOff = logseq.onSettingsChanged?.((next, previous) => {
    if (next.workCatalogProjectTags !== previous.workCatalogProjectTags) schedule();
  });
  schedule();
  return {
    read, resolve, setEnabled, setExcluded, selectCurrentPage,
    subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    dispose() {
      disposed = true; generation++; window.clearTimeout(timer); window.clearInterval(heartbeat);
      listeners.clear(); graphOff(); dbOff(); settingsOff?.();
      if (typeof refreshOff === "function") refreshOff();
      for (const off of commands) if (typeof off === "function") off();
    },
  };
}
