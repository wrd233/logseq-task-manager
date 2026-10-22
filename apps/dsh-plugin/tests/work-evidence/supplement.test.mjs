import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SupplementDraft } from '../../src/work-evidence/supplement.mjs';
import { EvidenceStore } from '../../../task-copilot-cli/src/work-evidence/store.ts';
const output = fileURLToPath(new URL('../../../../tmp/work-evidence/reliability-tests', import.meta.url));
async function fixture() {
  await mkdir(output, { recursive: true }); const root = await mkdtemp(join(output, 'supplement-')), repo = join(root, 'repo'); await mkdir(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo }); await writeFile(join(repo, 'work.txt'), 'work');
  const store = new EvidenceStore(join(root, 'state')), scope = await store.select(repo), o = await store.observe(scope.id);
  const draft = new SupplementDraft({ scopeId: scope.id, observationId: o.value.id });
  const write = payload => store.note(payload.scopeId, payload.observationId, payload.text, payload.requestId);
  return { store, scope, o, draft, write };
}
test('delayed real-store receipt never clears later input; another save persists that input separately', async () => {
  const f = await fixture(); f.draft.edit('first intent'); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const saved = f.draft.save(async payload => { await gate; return f.write(payload); });
  f.draft.edit('first intent plus later input'); assert.equal(await f.draft.save(f.write), null);
  release(); const receipt = await saved;
  assert.equal(receipt.newerInput, true); assert.equal(f.draft.getSnapshot().text, 'first intent plus later input');
  assert.deepEqual((await f.store.notes(f.scope.id, f.o.value.id)).map(note => note.value.text), ['first intent']);
  await f.draft.save(f.write); assert.equal(f.draft.getSnapshot().text, ''); assert.equal((await f.store.notes(f.scope.id, f.o.value.id)).length, 2);
  assert.deepEqual(await f.store.observation(f.scope.id, f.o.value.id), f.o);
});
test('lost receipt retries the original immutable payload and key, retaining new input across retry and host restart', async () => {
  const f = await fixture(); f.draft.edit('original intent'); let original;
  assert.equal(await f.draft.save(async payload => { original = { ...payload }; await f.write(payload); throw Error('receipt lost'); }), null);
  assert.equal(f.draft.getSnapshot().status, 'unknown'); f.draft.edit('new input after unknown receipt');
  const restarted = new EvidenceStore(f.store.directory);
  await f.draft.save(async payload => { assert.deepEqual(payload, original); return restarted.note(payload.scopeId, payload.observationId, payload.text, payload.requestId); });
  assert.equal(f.draft.getSnapshot().text, 'new input after unknown receipt'); assert.equal((await restarted.notes(f.scope.id, f.o.value.id)).length, 1);
  assert.equal(f.draft.getSnapshot().attempt, null);
});
test('revision fencing also retains input edited away and back, and malformed receipts never clear it', async () => {
  const f = await fixture(); f.draft.edit('same text');
  await f.draft.save(async payload => { f.draft.edit('different'); f.draft.edit('same text'); return f.write(payload); });
  assert.equal(f.draft.getSnapshot().text, 'same text');
  const bad = await f.draft.save(async () => ({ value: { id: 'wrong' }, hash: 'wrong' }));
  assert.equal(bad, null); assert.equal(f.draft.getSnapshot().status, 'unknown'); assert.equal(f.draft.hasUnconfirmedInput(), true);
});

test('browser backup restores an unknown request and later typing; retry retains exact identity', async () => {
  let backup, release;
  const port = { read: () => backup, write: value => { backup = globalThis.structuredClone(value); } };
  const context = { scopeId: 'scope', observationId: 'observation' };
  const first = new SupplementDraft(context, () => '11111111-1111-4111-8111-111111111111', port);
  first.edit('submitted');
  const pending = first.save(payload => new Promise(resolve => { release = () => resolve({ value: { ...payload, id: payload.requestId }, hash: 'hash' }); }));
  first.edit('later text');
  const restored = new SupplementDraft(context, undefined, port);
  assert.equal(restored.getSnapshot().status, 'unknown');
  assert.equal(restored.cancel(), false);
  const saved = await restored.save(async payload => ({ value: { ...payload, id: payload.requestId }, hash: 'hash' }));
  assert.equal(saved.receipt.value.id, '11111111-1111-4111-8111-111111111111');
  assert.equal(restored.getSnapshot().text, 'later text');
  release(); await pending;
});

test('intent edit and explicit cancel cannot overwrite pending input; failed backup is visible', () => {
  const draft = new SupplementDraft({ scopeId: 'scope', observationId: 'observation' }, undefined, { read() { throw Error('storage blocked'); }, write() { throw Error('storage blocked'); } });
  assert.equal(draft.beginEdit({ id: 'old-note', text: 'old text' }), true);
  draft.edit('new unsaved text'); assert.equal(draft.getSnapshot().backupFailed, true);
  assert.equal(draft.beginEdit({ id: 'other', text: 'must not overwrite' }), false);
  assert.equal(draft.getSnapshot().text, 'new unsaved text'); assert.equal(draft.cancel(), true);
  assert.equal(draft.getSnapshot().text, ''); assert.equal(draft.getSnapshot().editingId, null);
});
