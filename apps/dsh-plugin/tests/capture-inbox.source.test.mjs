import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encode } from '../src/capture-inbox/identity.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CaptureHost } from '../src/capture-host.mjs';
import { FileCaptureStore } from '../src/capture-inbox/store.mjs';
import { CaptureInboxController, quoteRecords } from '../src/capture-inbox/controller.mjs';
const scope = { graphId: 'synthetic-source-graph', rootUuid: 'b7261007-0000-4000-8000-000000000001' };
const block = { sourceId: JSON.stringify(['logseq', scope.graphId, scope.rootUuid]), target: { kind: 'logseq-block', graphId: scope.graphId, blockUuid: scope.rootUuid }, contentVersion: 'a'.repeat(64) };
const material = { materialId: 'b7261007-0000-4000-8000-000000000002', version: 'material-v1', reference: 'longdoc://b7261007-0000-4000-8000-000000000002' };
// Production host + real files; authorized workbench provider is explicitly synthetic.
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'capture-source-'))); t.after(() => rm(root, { recursive: true, force: true }));
  let changed = false, offline = false, lost = false;
  const workbench = { generations: new Map(), status: async () => ({ binding: { scope, directory: root, provider: 'workspace', organization: 'flat', workspaceId: 'test-work' } }),
    binding: async () => { if (offline) throw Object.assign(Error(), { code: 'WORKSPACE_OFFLINE' }); return { instanceId: 'i', connectionId: 'c' }; }, check() {},
    command: async (_session, command) => {
      if (command === 'source.read') return { freshness: 'checked', source: { ...block, contentVersion: changed ? 'b'.repeat(64) : block.contentVersion, content: '合成块原文', availability: 'available' } };
      const value = { id: material.materialId, version: changed ? 'v2' : material.version, reference: material.reference, content: '合成材料原文', availability: 'available' };
      return command === 'materials.list' ? { materials: [value] } : value;
    } };
  const store = new FileCaptureStore(root, { fault: async stage => { if (lost && stage === 'before-receipt') throw Error('lost receipt'); } });
  let host = new CaptureHost({ store, workbench });
  return { store, get host() { return host; }, change: () => { changed = true; }, offline: () => { offline = true; }, lose: () => { lost = true; },
    restart: () => { host.dispose(); host = new CaptureHost({ store: new FileCaptureStore(root), workbench }); } };
}
for (const selection of [{ block }, { material }]) test(`verified ${Object.keys(selection)[0]} seed, durable draft and restart receipt after source version changes`, async t => {
  const f = await fixture(t); let info = await f.host.context({ sessionId: 's' });
  info = await f.host.context({ sessionId: 's', selection, lease: info.lease });
  assert.match(info.text, /原文/); assert.deepEqual(info.origin, { sessionId: 's', ...selection });
  const call = (method, payload = {}) => f.host.call(method, { sessionId: 's', lease: info.lease, ...payload });
  const store = { list: () => call('list'), readDraft: () => call('readDraft'), saveDraft: (_c, expectedVersion, draft) => call('saveDraft', { expectedVersion, draft }), execute: (_c, command) => call('execute', { command }) };
  const controller = new CaptureInboxController({ context: info.context, store, createPort: () => null });
  await controller.open(); assert.equal(await controller.seedSource(info), true);
  await controller.draftQueue;
  const reopened = new CaptureInboxController({ context: info.context, store, createPort: () => null }); await reopened.open();
  assert.deepEqual(reopened.origin, info.origin); assert.equal(reopened.state.text, info.text);
  assert.equal(await reopened.seedSource(info), false); assert.equal(reopened.state.text, info.text);
  f.lose(); await reopened.save(); assert.equal(reopened.state.captureStatus, 'unknown');
  const command = reopened.captureAttempt; f.change(); f.restart(); info = await f.host.context({ sessionId: 's' });
  const receipt = await call('execute', { command }); assert.equal(receipt.status, 'saved');
  assert.equal((await call('list')).length, 1); assert.match(quoteRecords([receipt.record]), /原文/);
  assert.ok(quoteRecords([receipt.record]).includes(selection.block ? block.contentVersion : material.version));
  await assert.rejects(call('execute', { command: { ...command, requestKey: 'new-key' } }), { code: 'CAPTURE_SOURCE_NOT_VERIFIED' });
  assert.equal((await call('execute', { command: { ...command, text: 'forged retry' } })).status, 'conflict');
});
test('draft aggregate capacity failure keeps input and previous durable draft without deleting history', async t => {
  const f = await fixture(t), info = await f.host.context({ sessionId: 's' });
  const controller = new CaptureInboxController({ context: info.context, store: f.store, createPort: () => null }); await controller.open();
  controller.setText('原草稿'); await controller.draftQueue;
  const before = await f.store.readDraft(info.context), huge = '汉'.repeat(1_000_000);
  controller.patch({ quote: huge, edit: { id: 'a'.repeat(64), expectedVersion: 1, text: huge, requestKey: 'edit' } });
  controller.setText(huge); await controller.draftQueue;
  assert.equal(controller.state.draftStatus, 'unknown'); assert.match(controller.state.problem, /容量/);
  assert.equal(controller.state.text, huge); assert.equal(await controller.close(), false);
  assert.deepEqual(await f.store.readDraft(info.context), before);
});
test('unavailable, forged and changed source selections never seed trusted text', async t => {
  const f = await fixture(t), info = await f.host.context({ sessionId: 's' });
  await assert.rejects(f.host.context({ sessionId: 's', lease: info.lease, selection: { block, material } }));
  await assert.rejects(f.host.context({ sessionId: 's', lease: info.lease, selection: { material: { ...material, reference: 'forged' } } }), { code: 'CAPTURE_SOURCE_NOT_VERIFIED' });
  f.change(); await assert.rejects(f.host.context({ sessionId: 's', lease: info.lease, selection: { block } }), { code: 'CAPTURE_SOURCE_NOT_VERIFIED' });
  f.offline(); await assert.rejects(f.host.context({ sessionId: 's', lease: info.lease, selection: { material } }), { code: 'CAPTURE_CONTEXT_STALE' });
});


test('10000 real draft versions reject the next write without removing history or local input', async t => {
  const f = await fixture(t), info = await f.host.context({ sessionId: 's' });
  const path = join(await f.store.home(info.context), 'drafts');
  const hash = text => createHash('sha256').update(text).digest('hex');
  let parent = null, batch = [];
  // Construct a hash-valid synthetic capacity fixture, not simulated Store calls.
  for (let version = 1; version <= 10000; version++) {
    const value = { version, parent, draft: { text: '旧草稿', requestKey: 'capacity', edit: null, quote: '', captureAttempt: null, editAttempt: null } };
    const digest = hash(encode(value)); parent = digest;
    batch.push(writeFile(join(path, `${version}.json`), encode({ schema: 1, digest, value }), { mode: 0o600 }));
    if (batch.length === 100) { await Promise.all(batch); batch = []; }
  }
  const before = await readFile(join(path, '10000.json'), 'utf8');
  const controller = new CaptureInboxController({ context: info.context, store: f.store, createPort: () => null });
  await controller.open(); controller.setText('达到容量后的新输入'); await controller.draftQueue;
  assert.equal(controller.state.text, '达到容量后的新输入'); assert.match(controller.state.problem, /10000/);
  assert.equal(controller.state.draftStatus, 'unknown'); assert.equal(await controller.close(), false);
  assert.equal((await readdir(path)).length, 10000);
  assert.equal(await readFile(join(path, '10000.json'), 'utf8'), before);
});
