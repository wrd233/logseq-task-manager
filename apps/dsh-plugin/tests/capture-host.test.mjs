/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureHost } from '../src/capture-host.mjs';

const scope = { graphId: 'synthetic-graph', rootUuid: 'b7261007-0000-4000-8000-000000000001' };
const binding = { scope, directory: '/synthetic-work', organization: 'flat', provider: 'workspace', workspaceId: 'synthetic-workspace' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture() {
  let bound = false, offline = false, connectionId = 'connection-one';
  const calls = [], generations = new Map(), commands = [];
  const workbench = { generations,
    status: async sessionId => { if (sessionId === 'missing') throw Error('missing session'); return { binding: bound ? binding : null }; },
    binding: async () => { if (offline) throw Object.assign(Error('offline'), { code: 'WORKSPACE_OFFLINE' }); return { instanceId: 'instance-one', connectionId }; },
    check: (sessionId, generation) => { if ((generations.get(sessionId) ?? 0) !== generation) throw Object.assign(Error('changed'), { code: 'BINDING_CHANGED' }); },
    command: async (_sessionId, command) => { commands.push(command); return { source: null, materials: [] }; },
  };
  const store = {
    list: async context => { calls.push(['list', structuredClone(context)]); return []; },
    readDraft: async context => { calls.push(['readDraft', structuredClone(context)]); return { version: 0, draft: null }; },
    execute: async (context, command) => { calls.push(['execute', structuredClone(context), command]); return { status: 'saved', record: { text: command.text } }; },
    saveDraft: async (context, version) => { calls.push(['saveDraft', structuredClone(context)]); return { status: 'saved', version: version + 1 }; },
  };
  const host = new CaptureHost({ store, workbench }), packet = await host.context({ sessionId: 'one' });
  return { host, packet, store, workbench, calls, commands,
    bind: () => { bound = true; }, offline: () => { offline = true; }, reconnect: () => { offline = false; connectionId = 'connection-two'; } };
}
test('unbound private capture uses only host context without any project or model read', async () => {
  const f = await fixture();
  await f.host.call('execute', { sessionId: 'one', lease: f.packet.lease, command: { kind: 'create', requestKey: 'request', text: 'synthetic', origin: { sessionId: 'one' } } });
  assert.deepEqual(f.calls[0][1], f.packet.context); assert.equal(f.calls[0][1].scope, null);
  assert.deepEqual(f.commands, []); assert.equal(f.packet.context.workObject, null);
});
test('root, context, guessed lease and wrong session are rejected before Store access', async () => {
  const f = await fixture();
  for (const input of [
    { sessionId: 'one', lease: f.packet.lease, root: '/outside' },
    { sessionId: 'one', lease: f.packet.lease, context: f.packet.context },
    { sessionId: 'one', lease: 'guessed' }, { sessionId: 'two', lease: f.packet.lease },
  ]) await assert.rejects(f.host.call('list', input));
  assert.deepEqual(f.calls, []);
  await assert.rejects(f.host.context({ sessionId: 'missing' }));
});
test('binding, connection and host restart invalidate old leases without migrating private data', async () => {
  const f = await fixture(); f.bind();
  await assert.rejects(f.host.call('list', { sessionId: 'one', lease: f.packet.lease }), { code: 'CAPTURE_CONTEXT_STALE' });
  const bound = await f.host.context({ sessionId: 'one' }); assert.deepEqual(bound.context.scope, scope);
  f.reconnect(); await assert.rejects(f.host.call('list', { sessionId: 'one', lease: bound.lease }), { code: 'CAPTURE_CONTEXT_STALE' });
  const replacement = new CaptureHost({ store: f.store, workbench: f.workbench });
  await assert.rejects(replacement.call('list', { sessionId: 'one', lease: bound.lease }), { code: 'CAPTURE_CONTEXT_STALE' });
  assert.deepEqual(f.calls, []);
});
test('remembered bound work permits private capture offline and reconnect preserves its partition identity', async () => {
  const f = await fixture(); f.bind(); f.offline();
  const old = await f.host.context({ sessionId: 'one' }); assert.equal(old.availability, 'offline');
  await f.host.call('list', { sessionId: 'one', lease: old.lease });
  f.reconnect(); const fresh = await f.host.context({ sessionId: 'one' });
  assert.deepEqual(fresh.context.binding, old.context.binding); assert.notEqual(fresh.context.generation, old.context.generation);
});
test('client source metadata is verified against an authorized host read, never trusted by shape', async () => {
  const f = await fixture(); f.bind(); const packet = await f.host.context({ sessionId: 'one' });
  const command = { kind: 'create', requestKey: 'request', text: 'synthetic', origin: { sessionId: 'one', block: { sourceId: 'invented', target: { kind: 'logseq-block', graphId: scope.graphId, blockUuid: scope.rootUuid }, contentVersion: null } } };
  await assert.rejects(f.host.call('execute', { sessionId: 'one', lease: packet.lease, command }), { code: 'CAPTURE_SOURCE_NOT_VERIFIED' });
  assert.deepEqual(f.calls, []); assert.deepEqual(f.commands, ['source.read']);
});
test('an offline private draft keeps pending source input without reading or authorizing the source', async () => {
  const f = await fixture(); f.bind(); f.offline(); const packet = await f.host.context({ sessionId: 'one' });
  const command = { kind: 'create', requestKey: 'request', text: 'synthetic', origin: { sessionId: 'one', block: { sourceId: 'pending-source', target: { kind: 'logseq-block', graphId: scope.graphId, blockUuid: scope.rootUuid }, contentVersion: null } } };
  const draft = { text: 'synthetic', requestKey: 'request', edit: null, quote: '', captureAttempt: command, editAttempt: null };
  assert.equal((await f.host.call('saveDraft', { sessionId: 'one', lease: packet.lease, expectedVersion: 0, draft })).status, 'saved');
  assert.deepEqual(f.commands, []);
  await assert.rejects(f.host.call('execute', { sessionId: 'one', lease: packet.lease, command }), { code: 'CAPTURE_SOURCE_UNAVAILABLE' });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'saveDraft');
});
test('a late reply after connection replacement is discarded and never retargeted', async () => {
  const f = await fixture(), gate = deferred(), started = deferred();
  f.store.execute = async context => { f.calls.push(['original', structuredClone(context)]); started.resolve(); await gate.promise; return { status: 'saved', record: {} }; };
  const saving = f.host.call('execute', { sessionId: 'one', lease: f.packet.lease, command: { kind: 'create', requestKey: 'key', text: 'text', origin: { sessionId: 'one' } } });
  await started.promise; f.bind(); gate.resolve();
  await assert.rejects(saving, { code: 'CAPTURE_CONTEXT_STALE' });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1].binding, null);
});
test('private filesystem diagnostics are not returned through Capture receipts', async () => {
  const f = await fixture(); f.store.execute = async () => ({ status: 'unknown', problem: 'EACCES /private/capture-root/file' });
  const result = await f.host.call('execute', { sessionId: 'one', lease: f.packet.lease, command: { kind: 'create', requestKey: 'key', text: 'text', origin: { sessionId: 'one' } } });
  assert.equal(result.status, 'unknown'); assert.equal(JSON.stringify(result).includes('/private/'), false);
});
test('host disposal prevents all subsequent context and Store operations', async () => {
  const f = await fixture(); f.host.dispose();
  await assert.rejects(f.host.context({ sessionId: 'one' }), { code: 'CAPTURE_HOST_STOPPED' });
  await assert.rejects(f.host.call('list', { sessionId: 'one', lease: f.packet.lease }));
  assert.deepEqual(f.calls, []);
});
