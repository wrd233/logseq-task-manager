import {readScopedPrivateItem,writeScopedPrivateItem} from '../../scoped-private-storage.ts';
import { extractObjectNavigationLabel } from '../../canonical-writing.ts';
import { currentGraphIsDb, ensurePersistentSourceIdentity } from '../../source-identity.ts';
import { parseWorkspaceDescriptor, type WorkspacePluginDescriptor, WorkspaceError } from '@task-copilot/contracts';
import { desktopBridge, desktopFiles } from '../../host/desktop-files.ts';
import { graphIdentity } from '../../graph-adapter.ts';
import {readSelectedPages, saveSelectedPages, resolveSelectedPage, selectPage} from './catalog-pages.ts';
import type {SourceScope} from '../../workspace/source-protocol.ts';
import { collectCatalog, type CatalogBlock, type CatalogFormal } from './work-catalog.ts';

/** Independent of the active body lease. Publishes navigation metadata only. */
export function installCatalogPublisher(formal: () => Promise<CatalogFormal[]>, resolveDirectory: (scope: SourceScope) => Promise<string | undefined>) {
  let disposed = false, generation = 0, busy = false, timer: number;
  const refresh = async () => {
    if (disposed || busy) return;
    busy = true;
    const epoch = generation;
    try {
      const graph = await logseq.App.getCurrentGraph();
      if (!graph) return;
      const graphId = graphIdentity(graph);
      const check = () => {if (disposed || epoch !== generation) throw new WorkspaceError('GRAPH_SCOPE_CHANGED');};
      let path = String(logseq.settings?.agentWorkspaceDescriptor ?? '').trim();
      if (!path) {
        const dot = await desktopBridge().doAction(['getLogseqDotDirRoot']); check();
        if (typeof dot === 'string' && dot.endsWith('/.logseq')) path = `${dot.slice(0,-8)}/.task-copilot-workspace/workspace-plugin.json`;
      }
      if (!path.startsWith('/')) return;
      const descriptor = parseWorkspaceDescriptor(JSON.parse(await desktopFiles(() => graphId).read(path)), true) as WorkspacePluginDescriptor; check();
      const selected = await readSelectedPages(graphId, check);
      // Narrow candidate query; text is used locally for existing object recognition only.
      const rows = await logseq.DB.datascriptQuery(String.raw`[:find (pull ?b [:block/uuid :block/content :block/properties :block/updated-at {:block/parent [:db/id :block/uuid]} {:block/page [:db/id :block/name :block/original-name]}]) :where [?b :block/content ?content] [(clojure.string/includes? ?content "[")]]`) as Array<[Record<string, unknown>]>; check();
      const blocks: CatalogBlock[] = rows.map(([row]) => ({...row, page: row.page ? {...row.page as object, originalName: (row.page as Record<string, unknown>)['original-name']} : undefined} as CatalogBlock));
      const isDbGraph = await currentGraphIsDb({getCurrentGraph: () => logseq.App.getCurrentGraph(), checkCurrentIsDbGraph: async () => {
        try {return await logseq.App.checkCurrentIsDbGraph();}
        catch (error) {throw new Error(error instanceof Error ? error.message : String((error as {message?: unknown})?.message ?? error), {cause:error});}
      }}); check();
      for (const block of blocks) if (!isDbGraph && extractObjectNavigationLabel(block.content) && (block as CatalogBlock & {properties?: {id?: string}}).properties?.id !== block.uuid) {
        await ensurePersistentSourceIdentity({getBlock: async uuid => {check(); const value = await logseq.Editor.getBlock(uuid); check(); return value;},
          upsertBlockProperty: async (uuid, key, value) => {check(); await logseq.Editor.upsertBlockProperty(uuid, key, value); check();}}, {...block, isDbGraph}); check();
      }
      const cachedFormal = await readScopedPrivateItem(logseq.FileStorage, 'work-catalog-formal-metadata', graphId, check);
      let objects: CatalogFormal[];
      try {
        objects = await formal(); check();
        const text = JSON.stringify(objects);
        if (cachedFormal !== text) await writeScopedPrivateItem(logseq.FileStorage, 'work-catalog-formal-metadata', graphId, text, check);
      } catch (error) {
        check();
        // A missing Kernel must not demote known formal sources to same-title natural work.
        if (typeof cachedFormal !== 'string') throw error;
        objects = JSON.parse(cachedFormal) as CatalogFormal[];
      }
      check();
      for (const item of objects) {
        const anchor = item.anchor as {graphId?: string; externalId?: string} | null;
        if (anchor?.graphId === graphId && anchor.externalId && !blocks.some(block => block.uuid === anchor.externalId)) {
          const block = await logseq.Editor.getBlock(anchor.externalId); check();
          if (block) blocks.push(block as CatalogBlock);
        }
      }
      const pages: Array<{uuid: string; title: string; sourceUuid?: string}> = [];
      for (const selectedPage of selected) {
        const page = await resolveSelectedPage(selectedPage, check);
        // Missing sources keep the explicit selection; no same-name replacement.
        pages.push(page ?? {uuid:selectedPage.uuid,title:selectedPage.title});
      }
      const snapshot = await collectCatalog({graphId, graphName: graph.name || graphId, blocks, pages, formal: objects, getBlock: id => logseq.Editor.getBlock(id), check});
      for (const work of snapshot.works) {
        let rootUuid: string | undefined;
        if (work.workRef.kind === 'logseq') rootUuid = work.workRef.sourceKind === 'page' ? work.pageSourceUuid : work.workRef.rootUuid;
        else {
          const objectId = work.workRef.objectId;
          const anchor = objects.find(item => item.object.id === objectId)?.anchor as {graphId?: string; externalId?: string} | null;
          if (anchor?.graphId === graphId) rootUuid = anchor.externalId;
        }
        if (!rootUuid) continue;
        const directory = await resolveDirectory({graphId, rootUuid, ...(work.objectType === '页面' ? {kind:'page',pageName:work.title} : {})}); check();
        if (directory) work.directory = directory;
      }
      if (graphIdentity(await logseq.App.getCurrentGraph()) !== graphId) throw new WorkspaceError('GRAPH_SCOPE_CHANGED'); check();
      const response = await fetch(`${descriptor.baseUrl}/plugin/catalog`, {method: 'POST', headers: {'content-type': 'application/json', 'x-workspace-plugin': descriptor.pluginToken, 'x-workspace-instance': descriptor.instanceId}, body: JSON.stringify(snapshot), signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('工作目录暂未发布');
    } finally {busy = false;}
  };
  const schedule = () => {window.clearTimeout(timer); if (!disposed) timer = window.setTimeout(() => void refresh().catch(() => {}), 700);};
  const graphOff = logseq.App.onCurrentGraphChanged(() => {generation++; schedule();});
  const dbOff = logseq.DB.onChanged(schedule);
  const heartbeat = window.setInterval(() => void refresh().catch(() => {}), 15000);
  let pageQueue = Promise.resolve();
  const commands = ([['add', '工作台：将当前页面加入工作搜索'], ['remove', '工作台：将当前页面移出工作搜索']] as const).map(([action, label]) => logseq.App.registerCommandPalette({key: `work-catalog-page-${action}`, label}, () => {
    const pending = pageQueue.then(async () => {
      const epoch = generation, graphId = graphIdentity(await logseq.App.getCurrentGraph());
      const check = () => {if (disposed || epoch !== generation) throw new WorkspaceError('GRAPH_SCOPE_CHANGED');};
      const page = await logseq.Editor.getCurrentPage(); check();
      if (!page?.uuid || !('name' in page)) throw new Error('请先打开要收录的页面。');
      const pages = await readSelectedPages(graphId, check), matching: string[] = [];
      for (const selected of pages) if ((await resolveSelectedPage(selected, check))?.sourceUuid === page.uuid) matching.push(selected.uuid);
      const kept = pages.filter(selected => !matching.includes(selected.uuid));
      if (action === 'add') kept.push(matching.length ? pages.find(selected => selected.uuid === matching[0])! : await selectPage({uuid:page.uuid,name:String(page.name),originalName:String(page.originalName ?? page.name)}, check));
      await saveSelectedPages(graphId, kept, check);
      await refresh();
      await logseq.UI.showMsg(action === 'add' ? '此页面已加入 DSH 工作搜索。' : '此页面已移出 DSH 工作搜索。', 'success');
    });
    pageQueue = pending.catch(error => {void logseq.UI.showMsg(String(error), 'warning');});
    return pageQueue;
  }));
  const refreshOff = logseq.App.registerCommandPalette({key: 'work-catalog-refresh', label: '工作台：刷新工作搜索目录'}, async () => {
    try {await refresh(); await logseq.UI.showMsg('工作搜索目录已同步。', 'success');}
    catch (error) {await logseq.UI.showMsg(`工作搜索目录未更新：${error instanceof Error ? error.message : JSON.stringify(error)}`, 'warning');}
  });
  schedule();
  return () => {disposed = true; generation++; window.clearTimeout(timer); window.clearInterval(heartbeat); graphOff(); dbOff(); if (typeof refreshOff === 'function') refreshOff(); for (const off of commands) if (typeof off === 'function') off();};
}
