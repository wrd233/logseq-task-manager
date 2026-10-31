import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCatalogSnapshot, type CatalogSnapshot } from '@task-copilot/contracts';
import { atomicJson } from './workspace-files.ts';

/** One derived JSON snapshot per Graph in the existing private companion directory. */
export async function readCatalog(state: string): Promise<CatalogSnapshot[]> {
  try {
    const value = JSON.parse(await readFile(join(state, 'work-catalog.json'), 'utf8')) as {graphs: unknown[]};
    return value.graphs.map(parseCatalogSnapshot);
  } catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error;}
}
export async function publishCatalog(state: string, input: unknown): Promise<void> {
  const snapshot = parseCatalogSnapshot(input), graphs = await readCatalog(state);
  await atomicJson(join(state, 'work-catalog.json'), {schemaVersion: 1, graphs: [...graphs.filter(graph => graph.graphId !== snapshot.graphId), snapshot]});
}
