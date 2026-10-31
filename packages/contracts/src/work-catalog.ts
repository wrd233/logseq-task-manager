import { parseWorkRef, type WorkRef } from './work-ref.ts';
import { workRecord, workText, WorkspaceError } from './workspace-agent.ts';

/** Discovery metadata only. No source text, binding, lease or credential. */
export interface CatalogWork {
  workRef: WorkRef; title: string; objectType: string; location: string; updatedAt: number; pageSourceUuid?: string; directory?: string;
}
export interface CatalogSnapshot {schemaVersion: 1; graphId: string; graphName: string; refreshedAt: number; works: CatalogWork[]}
export const workKey = (ref: WorkRef): string => JSON.stringify(parseWorkRef(ref));
export function parseCatalogSnapshot(input: unknown): CatalogSnapshot {
  const value = workRecord(input, ['schemaVersion', 'graphId', 'graphName', 'refreshedAt', 'works']);
  const graphId = workText(value.graphId, 2048);
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.refreshedAt) || Number(value.refreshedAt) < 0 || !Array.isArray(value.works) || value.works.length > 20000) throw new WorkspaceError('CATALOG_INVALID');
  const seen = new Set<string>();
  const works = value.works.map(input => {
    const row = workRecord(input, ['workRef', 'title', 'objectType', 'location', 'updatedAt', 'pageSourceUuid', 'directory']);
    const workRef = parseWorkRef(row.workRef), key = workKey(workRef);
    if (seen.has(key) || workRef.kind === 'logseq' && workRef.graphId !== graphId || !Number.isSafeInteger(row.updatedAt) || Number(row.updatedAt) < 0) throw new WorkspaceError('CATALOG_INVALID');
    seen.add(key);
    return {workRef, title: workText(row.title, 800), objectType: workText(row.objectType, 80), location: workText(row.location, 2000), updatedAt: Number(row.updatedAt), ...(row.directory ? {directory: workText(row.directory, 4096)} : {}), ...(row.pageSourceUuid ? {pageSourceUuid: workText(row.pageSourceUuid)} : {})};
  });
  return {schemaVersion: 1, graphId, graphName: workText(value.graphName, 800), refreshedAt: Number(value.refreshedAt), works};
}
