import {readScopedPrivateItem, writeScopedPrivateItem} from '../../scoped-private-storage.ts';
import type {WorkRef} from '@task-copilot/contracts';

const key = 'work-catalog-pages';
export interface SelectedPage {uuid: string; title: string; anchorUuid?: string; sourceUuid?: string}
export async function readSelectedPages(graphId: string, check: () => void): Promise<SelectedPage[]> {
  const raw = await readScopedPrivateItem(logseq.FileStorage, key, graphId, check);
  return raw ? (JSON.parse(String(raw)) as Array<string | SelectedPage>).map(page => typeof page === 'string' ? {uuid:page,title:'已收录页面'} : page) : [];
}
export const saveSelectedPages = (graphId: string, pages: SelectedPage[], check: () => void) => writeScopedPrivateItem(logseq.FileStorage, key, graphId, JSON.stringify(pages), check);
/** A durable native block witness retains explicit selection across file-Graph reindex/rename.
 * WorkRef uses that block's UUID in the page namespace; SourceScope always uses the real current page UUID. */
export async function resolveSelectedPage(page: SelectedPage, check: () => void) {
  if (page.anchorUuid) {
    const anchor = await logseq.Editor.getBlock(page.anchorUuid); check();
    if (!anchor?.page?.id) return null;
    const current = await logseq.Editor.getPage(anchor.page.id); check();
    return current ? {uuid:page.uuid,title:String(current.originalName ?? current.name),sourceUuid:current.uuid} : null;
  }
  const current = await logseq.Editor.getPage(page.sourceUuid ?? page.uuid); check();
  return current ? {uuid:page.uuid,title:String(current.originalName ?? current.name),sourceUuid:current.uuid} : null;
}
export async function pageWorkRef(graphId: string, pageUuid: string, check: () => void): Promise<WorkRef> {
  for (const page of await readSelectedPages(graphId, check)) {
    const resolved = await resolveSelectedPage(page, check);
    if (resolved?.sourceUuid === pageUuid) return {kind:'logseq',graphId,rootUuid:page.uuid,sourceKind:'page'};
  }
  return {kind:'logseq',graphId,rootUuid:pageUuid,sourceKind:'page'};
}
