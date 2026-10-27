import { structure } from './model.mjs';
import { annotations } from '../../../logseq-plugin/src/features/structure-history/annotations.ts';
import { sourceId } from '../../../logseq-plugin/src/workspace/source-protocol.ts';

/** Adapts a validated Logseq snapshot, preserving the existing source identity. */
export function sourceStructure(source) {
  const ids = new Set(source.blocks.map(b => b.target.blockUuid));
  return { track: `logseq:${JSON.stringify(source.scope)}`, ...structure({ coverage: source.blocks.every(b => b.availability === 'available') ? 'complete' : 'partial',
    nodes: source.blocks.map(b => ({ id: b.sourceId, title: b.content?.split('\n')[0].slice(0, 512) ?? '原文当时不可用', body: b.content ?? '',
      parentId: ids.has(b.parentUuid) ? sourceId(source.scope.graphId, b.parentUuid) : null, order: b.order,
      status: annotations(b).status, dependencies: annotations(b).dependencies.map(uuid => sourceId(source.scope.graphId, uuid)),
      availability: b.availability, sources: [{ kind: 'logseq', ref: b.sourceId, version: b.contentVersion, excerpt: '' }] })) }),
    scope: source.scope, sourceSetVersion: source.sourceSetVersion, structureVersion: source.structureVersion, capturedAt: source.capturedAt, origin: 'observed' };
}
