import { extractObjectNavigationLabel } from '../../canonical-writing.ts';
import { type CatalogWork, type CatalogSnapshot, workKey } from '@task-copilot/contracts';

export interface CatalogBlock {uuid: string; content: string; parent?: {id?: number; uuid?: string}; page?: {id?: number; name?: string; originalName?: string}; 'updated-at'?: number}
export interface CatalogFormal {object: {id: string; title: string; kind: string; updatedAt: string}; anchor: unknown}
/** Reuses navigation recognition; no TODO or prose fallback. */
export async function collectCatalog(input: {
  graphId: string; graphName: string; blocks: CatalogBlock[]; pages: Array<{uuid: string; title: string; sourceUuid?: string}>; formal: CatalogFormal[];
  getBlock(id: string | number): Promise<{content?: string; parent?: {id?: number; uuid?: string}; page?: {id?: number}} | null>;
  check(): void;
}): Promise<CatalogSnapshot> {
  const works = new Map<string, CatalogWork>(), now = Date.now();
  const formal = new Map(input.formal.flatMap(item => {
    const anchor = item.anchor as {graphId?: string; externalId?: string} | null;
    return anchor?.graphId === input.graphId && anchor.externalId ? [[anchor.externalId, item] as const] : [];
  }));
  for (const block of input.blocks) {
    input.check();
    const object = formal.get(block.uuid), label = extractObjectNavigationLabel(block.content);
    if (!object && !label) continue;
    const parents: string[] = [], seen = new Set<string | number>();
    let id = block.parent?.id ?? block.parent?.uuid;
    while (id && id !== block.page?.id && !seen.has(id) && parents.length < 16) {
      seen.add(id); const parent = await input.getBlock(id); input.check();
      if (!parent || typeof parent.content !== 'string') break;
      parents.unshift(parent.content.split('\n')[0]!.slice(0, 100)); id = parent.parent?.id ?? parent.parent?.uuid;
    }
    const workRef = object ? {kind: 'kernel' as const, objectId: object.object.id} : {kind: 'logseq' as const, graphId: input.graphId, rootUuid: block.uuid, sourceKind: 'block' as const};
    works.set(workKey(workRef), {workRef, title: (object?.object.title ?? label!.title).slice(0,800),
      objectType: object ? `正式 ${object.object.kind}` : /\[(事务|事项|任务)\]/u.exec(block.content.split('\n')[0]!)?.[1] ?? (label!.kind === 'PROJECT' ? 'Project' : 'MiniProject'),
      location: [input.graphName, block.page?.originalName ?? block.page?.name, ...parents].filter(Boolean).join(' / ').slice(0,2000),
      updatedAt: object ? Date.parse(object.object.updatedAt) || now : block['updated-at'] ?? now});
  }
  // Kernel identities are authoritative, including objects without a current Graph anchor.
  for (const item of input.formal) {
    const workRef = {kind: 'kernel' as const, objectId: item.object.id}, key = workKey(workRef);
    if (!works.has(key)) works.set(key, {workRef, title: item.object.title, objectType: `正式 ${item.object.kind}`, location: `${(item.anchor as {graphId?: string} | null)?.graphId ?? 'Kernel'} / 正式对象`, updatedAt: Date.parse(item.object.updatedAt) || now});
  }
  for (const page of input.pages) {
    const workRef = {kind: 'logseq' as const, graphId: input.graphId, rootUuid: page.uuid, sourceKind: 'page' as const};
    works.set(workKey(workRef), {workRef, title: page.title, objectType: '页面', location: `${input.graphName} / ${page.title}`, updatedAt: now, ...(page.sourceUuid ? {pageSourceUuid: page.sourceUuid} : {})});
  }
  input.check();
  return {schemaVersion: 1, graphId: input.graphId, graphName: input.graphName, refreshedAt: now, works: [...works.values()]};
}
