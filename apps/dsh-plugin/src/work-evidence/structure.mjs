/* global AbortSignal */
import { realpath } from 'node:fs/promises';
import { validateSnapshot } from '../../../logseq-plugin/src/workspace/source-protocol.ts';
import { annotations } from '../../../logseq-plugin/src/features/structure-history/annotations.ts';
import { structure, compare } from '../structure-history/model.mjs';
import { CompanionTransport } from '../service.mjs';

// Block content.read uses the existing scoped source reader without publishing a workspace mirror.
export async function captureStructure(store, record, config = {}, transport = new CompanionTransport(config.workspaceStateDirectory)) {
  if (record.state === 'failed' || !record.consistent || record.truncated || !['initial', 'complete'].includes(record.sync?.state)) return;
  const entry = await transport.entry(record.directory);
  if (await realpath(entry.directory) !== await realpath(record.directory)) throw Error('LOGSEQ_SCOPE_MISMATCH');
  // The page version of content.read refreshes the workspace mirror, so it is not used here.
  if (entry.binding.scope.kind === 'page') throw Error('LOGSEQ_PAGE_READ_UNAVAILABLE');
  const source = await validateSnapshot(await transport.call(entry, 'content.read', {}, 'work-evidence', AbortSignal.timeout(5000)));
  if (JSON.stringify(source.scope) !== JSON.stringify(entry.binding.scope) || source.blocks.length > 5000 || source.blocks.some(b => b.availability !== 'available') || source.page && source.page.availability !== 'available') throw Error('LOGSEQ_STRUCTURE_INCOMPLETE');
  await store.saveStructure(record.scopeId, record.id, source);
}
function projection(source) {
  const ids = new Set(source.blocks.map(b => b.target.blockUuid));
  const nodes = source.blocks.map(b => ({ id: b.sourceId, title: b.content.split('\n')[0].slice(0, 512), body: b.content,
    parentId: ids.has(b.parentUuid) ? JSON.stringify(['logseq', source.scope.graphId, b.parentUuid]) : null,
    order: b.order, status: annotations(b).status, dependencies: annotations(b).dependencies.map(id => JSON.stringify(['logseq', source.scope.graphId, id])),
    availability: b.availability, sources: [{ kind: 'logseq', ref: b.sourceId, version: b.contentVersion, excerpt: '' }] }));
  return { track: `logseq:${JSON.stringify(source.scope)}`, ...structure({ nodes, coverage: 'complete' }), capturedAt: source.capturedAt,
    sourceSetVersion: source.sourceSetVersion, structureVersion: source.structureVersion, scope: source.scope };
}
export async function structureComparison(store, scopeId, observationId, beforeObservationId) {
  const observation = (await store.observation(scopeId, observationId)).value;
  let after;
  try { after = (await store.structure(scopeId, observationId)).value.source; }
  catch { return { state: 'unavailable' }; }
  const current = projection(after), previousId = beforeObservationId || observation.sync?.fromObservationId;
  if (!previousId) return { state: 'baseline', after: current };
  let previousObservation;
  try { previousObservation = (await store.observation(scopeId, previousId)).value; }
  catch { return { state: 'previous-unavailable', after: current }; }
  if (previousId === observationId || previousObservation.observedAt > observation.observedAt) return { state: 'invalid-time', after: current };
  let before;
  try { before = (await store.structure(scopeId, previousId)).value.source; }
  catch { return { state: 'previous-unavailable', after: current }; }
  if (JSON.stringify(before.scope) !== JSON.stringify(after.scope)) return { state: 'scope-changed', after: current };
  const baseline = projection(before);
  return { state: 'comparable', before: baseline, after: current, changes: compare(baseline, current), beforeObservationId: previousId };
}
export async function checkStructureSource(store, scopeId, observationId, nodeId, config = {}) {
  const observation = (await store.observation(scopeId, observationId)).value;
  const saved = (await store.structure(scopeId, observationId)).value.source;
  const block = saved.blocks.find(item => item.sourceId === nodeId);
  if (!block) throw Error('HISTORY_SOURCE_MISSING');
  const transport = new CompanionTransport(config.workspaceStateDirectory), entry = await transport.entry(observation.directory);
  if (await realpath(entry.directory) !== await realpath(observation.directory) || JSON.stringify(entry.binding.scope) !== JSON.stringify(saved.scope)) throw Error('LOGSEQ_SCOPE_MISMATCH');
  if (entry.binding.scope.kind === 'page') throw Error('LOGSEQ_PAGE_READ_UNAVAILABLE');
  const current = await validateSnapshot(await transport.call(entry, 'content.read', {}, 'work-evidence', AbortSignal.timeout(5000)));
  if (JSON.stringify(current.scope) !== JSON.stringify(saved.scope)) throw Error('LOGSEQ_SCOPE_MISMATCH');
  const source = current.blocks.find(item => item.sourceId === block.sourceId);
  if (!source) throw Error('HISTORY_SOURCE_MISSING');
  return { content: source.content, version: source.contentVersion, availability: source.availability,
    matches: source.availability === 'available' && source.contentVersion === block.contentVersion };
}
