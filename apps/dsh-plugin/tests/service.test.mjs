import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { mkdtemp, mkdir, realpath, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BindingStore, WorkbenchService, modelContext } from '../src/service.mjs';

const scope = { graphId: 'Lab:/private/graph', rootUuid: 'b7261007-0000-4000-8000-000000000001' };
const binding = directory => ({ scope, directory, provider: 'workspace', workspaceId: 'work-test', organization: 'flat' });
function fixture(root) {
  let work = binding(root), gate, offline = false;
  const opened = [], store = { bindings: new Map(), change: async (id, value) => value ? store.bindings.set(id, value) : store.bindings.delete(id) };
  const packet = () => ({ scene: { binding: work, savedSource: { capturedAt: '2026-10-11T00:00:00Z', sourceSetVersion: 'v1', blocks: [{ sourceId: 'source-one', content: 'A saved original paragraph', contentVersion: 'v1', depth: 0, availability: 'available' }] }, materials: [], guidance: { common: { text: '', version: 'g1' }, project: { text: '', version: 'g2' } }, sourceBundleVersion: 'v1', permissions: { read: true, bodyWrite: false } }, current: { sourceMatches: true, materialsMatch: true, guidanceMatches: true } });
  const transport = { entry: async () => ({ binding: work, directory: root }), call: async (_entry, command) => {
    if (offline) throw Object.assign(Error('offline'), { code: 'WORKSPACE_OFFLINE' });
    if (command === 'collaboration.read') { if (gate) await gate; return packet(); }
    if (command === 'files.list') return { observation: { files: [{ path: 'proposal.md', kind: 'file', availability: 'available', change: 'same-metadata', materialId: null, size: 5, modifiedAt: 'v1' }], truncated: [] } };
    return {};
  } };
  const service = new WorkbenchService({ store, transport, inspectSession: async id => { if (id === 'missing') throw Error('missing'); return { meta: { cwd: root } }; }, openPath: async path => { opened.push(path); return { opened: true }; } });
  return { service, store, opened, packet, scopeChange: () => { work = { ...work, scope: { ...scope, graphId: 'Other:/other' } }; }, offline: () => { offline = true; }, block: promise => { gate = promise; } };
}
test('binding persists privately and an unrelated session cannot inherit it', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-bindings-')));
  try {
    const store = new BindingStore(directory); await store.load(); await store.change('one', binding('/work'));
    const restored = new BindingStore(directory); await restored.load();
    assert.deepEqual(restored.bindings.get('one'), binding('/work'));
    assert.equal(restored.bindings.has('two'), false);
    const f = fixture('/work'); await assert.rejects(f.service.view('two'), { code: 'SESSION_NOT_BOUND' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('a superseded binding write rolls back and does not poison later changes', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-binding-race-')));
  try {
    const store = new BindingStore(root); await store.load(); await store.change('one', binding('/old'));
    let checks = 0;
    await assert.rejects(store.change('one', binding('/stale'), () => {
      if (++checks === 2) throw Object.assign(Error('superseded'), { code: 'BINDING_CHANGED' });
    }), { code: 'BINDING_CHANGED' });
    const disk = new BindingStore(root); await disk.load();
    assert.equal(disk.bindings.get('one').directory, '/old');
    await store.change('one', binding('/latest'));
    assert.equal(store.bindings.get('one').directory, '/latest');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('file opening rechecks authority and refuses arbitrary paths, symlinks and changed work', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-files-')));
  try {
    await writeFile(join(root, 'proposal.md'), 'hello');
    const f = fixture(root); await f.service.bind('one', root);
    const view = await f.service.view('one'); assert.equal(view.blocks[0].content, 'A saved original paragraph'); assert.match(view.logseqUrl, /graph\/Lab\?/);
    await f.service.open('one', 'file:proposal.md', false); assert.deepEqual(f.opened, [join(root, 'proposal.md')]);
    await assert.rejects(f.service.open('one', 'file:../../secret', false), { code: 'FILE_UNAVAILABLE' });
    await rm(join(root, 'proposal.md')); await symlink('/etc/hosts', join(root, 'proposal.md'));
    await assert.rejects(f.service.open('one', 'file:proposal.md', false), { code: 'SYMLINK_RESTRICTED' });
    assert.equal(f.opened.length, 1);
    f.scopeChange(); await assert.rejects(f.service.view('one'), { code: 'WORK_SCOPE_CHANGED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('late read after unbind is discarded and offline data cannot be opened', async () => {
  const f = fixture('/work'); await f.service.bind('one', '/work');
  let release; f.block(new Promise(resolve => { release = resolve; }));
  const reading = f.service.read('one'); await new Promise(resolve => setImmediate(resolve));
  await f.service.unbind('one'); release();
  await assert.rejects(reading, { code: 'BINDING_CHANGED' });
  const second = fixture('/work'); await second.service.bind('one', '/work'); second.offline();
  await assert.rejects(second.service.open('one', 'directory', false), { code: 'WORKSPACE_OFFLINE' });
  assert.deepEqual(second.opened, []);
});
test('model context stays bounded without breaking JSON or granting writes', async () => {
  const f = fixture('/work'), packet = f.packet();
  packet.scene.savedSource.blocks = Array.from({ length: 300 }, (_, index) => ({ sourceId: `source-${index}`, contentVersion: 'version', content: 'Long original '.repeat(1000) }));
  const text = modelContext(packet); assert.ok(text.length <= 24000);
  const context = JSON.parse(text); assert.equal(context.permissions.bodyWrite, false); assert.equal(context.nativeDraft.included, false); assert.equal(context.truncated, true); assert.ok(context.savedSource.length < 300);
});
test('external materials are resolved only from current Logseq material identities', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-linked-')));
  try {
    await mkdir(join(root, 'work')); await writeFile(join(root, 'linked.docx'), 'synthetic');
    const f = fixture(join(root, 'work')), original = f.packet;
    f.service.transport.call = async (_entry, command) => {
      if (command === 'collaboration.read') { const packet = original(); packet.scene.materials = [{ id: 'linked', filename: 'linked.docx', path: join(root, 'linked.docx'), availability: 'available', version: 'v1' }]; return packet; }
      if (command === 'files.list') return { observation: { files: [], truncated: [] } };
      return {};
    };
    await f.service.bind('one', join(root, 'work'));
    const view = await f.service.view('one'); assert.equal(view.files[0].key, 'material:linked');
    await f.service.open('one', 'material:linked', false); assert.equal(f.opened[0], join(root, 'linked.docx'));
    await assert.rejects(f.service.open('one', 'material:unrelated', false), { code: 'FILE_UNAVAILABLE' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
