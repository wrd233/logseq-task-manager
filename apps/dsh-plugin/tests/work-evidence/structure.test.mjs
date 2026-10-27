import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, sha256, sourceId } from '../../../logseq-plugin/src/workspace/source-protocol.ts';
import { captureStructure, structureComparison } from '../../src/work-evidence/structure.mjs';

const root = '00000000-0000-4000-8000-000000000001', a = '00000000-0000-4000-8000-000000000002', b = '00000000-0000-4000-8000-000000000003', c = '00000000-0000-4000-8000-000000000004';
const scope = { graphId: 'graph', rootUuid: root };
async function source(rows, sourceScope = scope) {
  return snapshot(sourceScope, await Promise.all(rows.map(async ([uuid, parentUuid, depth, order, content]) => ({ sourceId: sourceId(sourceScope.graphId, uuid), target: { kind: 'logseq-block', graphId: sourceScope.graphId, blockUuid: uuid }, parentUuid, depth, order, content, contentVersion: await sha256(content), availability: 'available' }))), '2026-10-27T00:00:00.000Z');
}
const initial = [[root, null, 0, 0, 'root'], [a, root, 1, 0, 'a'], [b, a, 2, 0, 'b'], [c, root, 1, 1, 'c']];
const moved = [[root, null, 0, 0, 'root'], [c, root, 1, 0, 'c'], [a, c, 2, 0, 'a changed'], [b, a, 3, 0, 'b']];
test('trusted snapshots compare ancestor moves, order, body and identity; unavailable and changed scopes stay unknown', async () => {
  const records = new Map([['first', await source(initial)], ['second', await source(moved)]]);
  const store = { observation: async (_scope, id) => ({ value: { sync: { fromObservationId: id === 'first' ? null : 'first' } } }), structure: async (_scope, id) => { if (!records.has(id)) throw Error(); return { value: { source: records.get(id) } }; } };
  assert.equal((await structureComparison(store, 'scope', 'first')).state, 'baseline');
  const comparison = await structureComparison(store, 'scope', 'second');
  assert.equal(comparison.state, 'comparable');
  assert.ok(comparison.changes.find(x => x.id === sourceId('graph', b)).kinds.includes('深度'));
  assert.ok(comparison.changes.find(x => x.id === sourceId('graph', a)).kinds.includes('归属'));
  assert.ok(comparison.changes.find(x => x.id === sourceId('graph', a)).kinds.includes('正文'));
  assert.ok(comparison.changes.find(x => x.id === sourceId('graph', c)).kinds.includes('顺序'));
  records.set('second', await source(initial.filter(row => row[0] !== b).concat([['00000000-0000-4000-8000-000000000005', c, 2, 0, 'new']])));
  const membership = await structureComparison(store, 'scope', 'second');
  assert.ok(membership.changes.some(x => x.kinds.includes('新增')));
  assert.ok(membership.changes.some(x => x.kinds.includes('删除')));
  records.delete('first'); assert.equal((await structureComparison(store, 'scope', 'second')).state, 'previous-unavailable');
  records.set('first', await source(initial, { ...scope, graphId: 'other' }));
  assert.equal((await structureComparison(store, 'scope', 'second')).state, 'scope-changed');
  records.delete('second'); assert.equal((await structureComparison(store, 'scope', 'second')).state, 'unavailable');
});
test('capture requires matching authorized current source and saves its actual snapshot', async () => {
  const binding = { scope, directory: '/tmp', organization: 'flat', provider: 'workspace', workspaceId: null }, saved = [];
  const packet = await source(initial); let allowed = true;
  const transport = { entry: async () => ({ directory: '/tmp', binding }), call: async (_entry, command) => { assert.equal(command, 'content.read'); if (!allowed) throw Error('READ_REVOKED'); return packet; } };
  const store = { saveStructure: async (...args) => saved.push(args) };
  const record = { directory: '/tmp', scopeId: 'scope', id: 'observation', state: 'changes', consistent: true, truncated: false, sync: { state: 'complete' } };
  await captureStructure(store, record, {}, transport); assert.equal(saved.length, 1);
  allowed = false;
  await assert.rejects(captureStructure(store, record, {}, transport)); assert.equal(saved.length, 1);
});

test('structure snapshot is stored with its observation and survives a store restart', async () => {
  const { mkdir, mkdtemp, rm } = await import('node:fs/promises');
  const { resolve, join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { EvidenceStore } = await import('../../../task-copilot-cli/src/work-evidence/store.ts');
  const base = resolve('tmp/work-evidence/structure-tests'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'case-'));
  try {
    const repo = join(dir, 'repo'); await mkdir(repo); execFileSync('git', ['init', '-q'], { cwd: repo });
    let store = new EvidenceStore(join(dir, 'state')); const selected = await store.select(repo);
    const first = (await store.observe(selected.id)).value; await store.saveStructure(selected.id, first.id, await source(initial));
    const second = (await store.observe(selected.id)).value; await store.saveStructure(selected.id, second.id, await source(moved));
    store = new EvidenceStore(join(dir, 'state'));
    const result = await structureComparison(store, selected.id, second.id);
    assert.equal(result.state, 'comparable'); assert.equal(result.beforeObservationId, first.id);
    assert.ok(result.changes.find(x => x.id === sourceId('graph', b)).kinds.includes('深度'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
