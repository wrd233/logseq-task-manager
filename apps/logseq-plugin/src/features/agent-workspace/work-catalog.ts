import { extractObjectNavigationLabel } from '../../canonical-writing.ts';
import { type CatalogWork, type CatalogSnapshot, workKey } from '@task-copilot/contracts';
export interface CatalogPage {
  uuid: string;
  title: string;
  sourceUuid?: string;
  reason?: string;
  updatedAt?: number;
  objectType?: string;
  parentAreas?: string[];
  lifecycleState?: string;
}
export interface CatalogPageMeta {
  archived?: boolean;
  parentAreas?: string[];
  lifecycleState?: string;
}
export type NoteCatalogWork = CatalogWork & { reason?: string };

export interface CatalogBlock {uuid: string; content: string; parent?: {id?: number; uuid?: string}; page?: {id?: number; name?: string; originalName?: string}; 'updated-at'?: number; properties?: Record<string, unknown>}
export interface CatalogFormal {object: {id: string; title: string; kind: string; updatedAt: string}; anchor: unknown}

function extractBlockAreas(properties?: Record<string, unknown>): string[] {
  if (!properties) return [];
  const raw = properties.areas ?? properties.area;
  if (!raw) return [];
  const items: string[] = [];
  const add = (text: string) => {
    const clean = text.trim().replace(/^#/u, "").replace(/^\[\[|\]\]$/gu, "").trim();
    if (!clean || clean.includes("::") || /^(?:na|none|null|-)$/iu.test(clean)) return;
    if (!items.includes(clean)) items.push(clean);
  };
  if (Array.isArray(raw)) {
    for (const v of raw) if (typeof v === "string") add(v);
  } else if (typeof raw === "string") {
    const wiki = [...raw.matchAll(/\[\[([^\]]+)\]\]/gu)].map((m) => m[1] ?? "");
    if (wiki.length > 0) {
      for (const w of wiki) add(w);
    } else {
      for (const part of raw.split(/[,，、]/u)) add(part);
    }
  }
  return items.slice(0, 16);
}

/** Reuses navigation recognition; no TODO or prose fallback. */
export async function collectCatalog(input: {
  graphId: string; graphName: string; blocks: CatalogBlock[]; pages: CatalogPage[]; formal: CatalogFormal[];
  pageMeta?: ReadonlyMap<string, CatalogPageMeta>;
  getBlock(id: string | number): Promise<{content?: string; parent?: {id?: number; uuid?: string}; page?: {id?: number}} | null>;
  check(): void;
}): Promise<Omit<CatalogSnapshot, "works"> & { works: NoteCatalogWork[] }> {
  const works = new Map<string, NoteCatalogWork>(), now = Date.now();
  const formal = new Map(input.formal.flatMap(item => {
    const anchor = item.anchor as {graphId?: string; externalId?: string} | null;
    return anchor?.graphId === input.graphId && anchor.externalId ? [[anchor.externalId, item] as const] : [];
  }));
  for (const block of input.blocks) {
    input.check();
    const object = formal.get(block.uuid), label = extractObjectNavigationLabel(block.content);
    if (!object && !label) continue;
    const pageName = (block.page?.originalName ?? block.page?.name ?? "").trim();
    const meta = pageName ? input.pageMeta?.get(pageName.toLocaleLowerCase()) : undefined;
    if (!object && meta?.archived) continue;
    const parents: string[] = [], seen = new Set<string | number>();
    let id = block.parent?.id ?? block.parent?.uuid;
    while (id && id !== block.page?.id && !seen.has(id) && parents.length < 16) {
      seen.add(id); const parent = await input.getBlock(id); input.check();
      if (!parent || typeof parent.content !== 'string') break;
      parents.unshift(parent.content.split('\n')[0]!.slice(0, 100)); id = parent.parent?.id ?? parent.parent?.uuid;
    }
    const blockAreas = extractBlockAreas(block.properties);
    const parentAreas = [...new Set([...blockAreas, ...(meta?.parentAreas ?? [])])].slice(0, 16);
    const workRef = object ? {kind: 'kernel' as const, objectId: object.object.id} : {kind: 'logseq' as const, graphId: input.graphId, rootUuid: block.uuid, sourceKind: 'block' as const};
    works.set(workKey(workRef), {
      workRef,
      title: (object?.object.title ?? label!.title).slice(0,800),
      objectType: object ? `正式 ${object.object.kind}` : /\[(事务|事项|任务)\]/u.exec(block.content.split('\n')[0]!)?.[1] ?? (label!.kind === 'PROJECT' ? 'Project' : 'MiniProject'),
      location: [input.graphName, pageName, ...parents].filter(Boolean).join(' / ').slice(0,2000),
      updatedAt: object ? Date.parse(object.object.updatedAt) || now : block['updated-at'] ?? now,
      ...(parentAreas.length > 0 ? {parentAreas} : {}),
      ...(meta?.lifecycleState ? {lifecycleState: meta.lifecycleState} : {}),
    });
  }
  // Kernel identities are authoritative, including objects without a current Graph anchor.
  for (const item of input.formal) {
    const workRef = {kind: 'kernel' as const, objectId: item.object.id}, key = workKey(workRef);
    if (!works.has(key)) works.set(key, {workRef, title: item.object.title, objectType: `正式 ${item.object.kind}`, location: `${(item.anchor as {graphId?: string} | null)?.graphId ?? 'Kernel'} / 正式对象`, updatedAt: Date.parse(item.object.updatedAt) || now});
  }
  for (const page of input.pages) {
    const workRef = {kind: 'logseq' as const, graphId: input.graphId, rootUuid: page.uuid, sourceKind: 'page' as const};
    works.set(workKey(workRef), {
      workRef,
      title: page.title.slice(0,800),
      objectType: (page.objectType ?? '页面').slice(0, 80),
      location: `${input.graphName} / ${page.title}`.slice(0,2000),
      updatedAt: page.updatedAt ?? now,
      ...(page.sourceUuid ? {pageSourceUuid: page.sourceUuid} : {}),
      ...(page.reason ? {reason: page.reason.slice(0,240)} : {}),
      ...(page.parentAreas && page.parentAreas.length > 0 ? {parentAreas: page.parentAreas.slice(0, 16)} : {}),
      ...(page.lifecycleState ? {lifecycleState: page.lifecycleState.slice(0, 40)} : {}),
    });
  }
  input.check();
  return {schemaVersion: 1, graphId: input.graphId, graphName: input.graphName, refreshedAt: now, works: [...works.values()]};
}
