/* global Request */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/index.mjs';

// Real production registration, host boundary and filesystem. Only DSH service
// injection is synthetic here; browser/desktop evidence is recorded separately.
test('registered Capture RPC survives host restart, rejects forged fields, and never creates Tasks or model tools', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'capture-rpc-')));
  const routes = new Map(), disposers = [], tools = [];
  const boot = async () => {
    const ctx = { connection: { fetch: { register: route => routes.set(route.path, route) } },
      sessionController: { inspect: async () => ({ meta: { cwd: root } }) },
      systemPrompt: { section() {}, context() {} }, tools: { register: tool => tools.push(tool.name) },
      on: (name, fn) => { if (name === 'dispose') disposers.push(fn); } };
    await apply(ctx, { bindingStateDirectory: join(root, 'bindings'), captureStateDirectory: join(root, 'captures'), workspaceStateDirectory: join(root, 'companion') });
  };
  const rpc = async (method, payload) => {
    const response = await routes.get(`/api/logseq-workbench/capture/${method}`).fetch(new Request('http://localhost/api', {
      method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'test-rpc', method: `logseq-workbench/capture/${method}`, payload }) }));
    assert.equal(response.status, 200); return (await response.json()).result;
  };
  try {
    await boot(); let info = (await rpc('context', { sessionId: 'test-session' })).value;
    assert.equal(info.context.binding, null);
    const payload = () => ({ sessionId: 'test-session', lease: info.lease });
    assert.equal((await rpc('list', { ...payload(), root: '/forged' })).ok, false);
    const command = { kind: 'create', requestKey: 'same-request', text: '真实文件 Capture', origin: info.origin };
    const first = await rpc('execute', { ...payload(), command }); assert.equal(first.value.status, 'saved');
    assert.equal((await rpc('execute', { ...payload(), command })).value.record.id, first.value.record.id);
    for (const dispose of disposers.splice(0)) dispose(); await boot();
    assert.equal((await rpc('list', payload())).ok, false);
    info = (await rpc('context', { sessionId: 'test-session' })).value;
    const records = (await rpc('list', payload())).value;
    assert.equal(records.length, 1); assert.equal(records[0].text, command.text);
    assert.equal(tools.some(name => /capture|inbox/i.test(name)), false);
  } finally { for (const dispose of disposers) dispose(); await rm(root, { recursive: true, force: true }); }
});

test('production RPC resolves block/material selections and recovers exact receipts on real Store after restart', async t => {
  const { CompanionTransport } = await import('../src/service.mjs');
  const { FileCaptureStore } = await import('../src/capture-inbox/store.mjs');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'capture-source-rpc-')));
  const scope = { graphId: 'synthetic-rpc-graph', rootUuid: 'b7261007-0000-4000-8000-000000000001' };
  const binding = { scope, directory: root, provider: 'workspace', organization: 'flat', workspaceId: 'rpc-work' };
  const block = { sourceId: JSON.stringify(['logseq', scope.graphId, scope.rootUuid]), target: { kind: 'logseq-block', graphId: scope.graphId, blockUuid: scope.rootUuid }, contentVersion: 'a'.repeat(64) };
  const material = { materialId: 'b7261007-0000-4000-8000-000000000002', version: 'm1', reference: 'longdoc://b7261007-0000-4000-8000-000000000002' };
  const originalEntry = CompanionTransport.prototype.entry, originalCall = CompanionTransport.prototype.call, originalExecute = FileCaptureStore.prototype.execute;
  let changed = false, lose = false;
  // Only the companion transport is synthetic. Routes, WorkbenchService,
  // CaptureHost, lease validation and FileCaptureStore are production code.
  CompanionTransport.prototype.entry = async () => ({ binding, instanceId: 'rpc-i', connectionId: 'rpc-c' });
  CompanionTransport.prototype.call = async (_entry, command) => {
    if (command === 'source.read') return { freshness: 'checked', source: { ...block, contentVersion: changed ? 'b'.repeat(64) : block.contentVersion, content: 'RPC 块正文', availability: 'available' } };
    const value = { id: material.materialId, version: changed ? 'm2' : material.version, reference: material.reference, availability: 'available', content: 'RPC 材料正文' };
    return command === 'materials.list' ? { materials: [value] } : command === 'materials.read' ? value : {};
  };
  FileCaptureStore.prototype.execute = async function(...args) { const receipt = await originalExecute.apply(this, args); return lose ? { status: 'unknown', problem: 'lost synthetic reply' } : receipt; };
  const routes = new Map(), disposers = [];
  const boot = async () => apply({ connection: { fetch: { register: route => routes.set(route.path, route) } }, sessionController: { inspect: async () => ({ meta: { cwd: root } }) }, systemPrompt: { section() {}, context() {} }, tools: { register() {} }, on: (name, fn) => { if (name === 'dispose') disposers.push(fn); } }, { bindingStateDirectory: join(root, 'bindings'), captureStateDirectory: join(root, 'captures') });
  const rpc = async (method, payload) => {
    const response = await routes.get(`/api/logseq-workbench/${method}`).fetch(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'source-rpc', method: `logseq-workbench/${method}`, payload }) }));
    return (await response.json()).result;
  };
  t.after(async () => { for (const dispose of disposers) dispose(); CompanionTransport.prototype.entry = originalEntry; CompanionTransport.prototype.call = originalCall; FileCaptureStore.prototype.execute = originalExecute; await rm(root, { recursive: true, force: true }); });
  await boot(); assert.equal((await rpc('bind', { sessionId: 's', directory: root })).ok, true);
  let info = (await rpc('capture/context', { sessionId: 's' })).value;
  assert.equal((await rpc('capture/context', { sessionId: 's', lease: 'stale', selection: { block } })).error.code, 'CAPTURE_CONTEXT_STALE');
  assert.equal((await rpc('capture/context', { sessionId: 's', lease: info.lease, selection: { material: { ...material, reference: 'forged' } } })).error.code, 'CAPTURE_SOURCE_NOT_VERIFIED');
  const oversizedDraft = { text: 'x'.repeat(1_000_001), requestKey: 'oversized', edit: null, quote: '', captureAttempt: null, editAttempt: null };
  assert.equal((await rpc('capture/saveDraft', { sessionId: 's', lease: info.lease, expectedVersion: 0, draft: oversizedDraft })).error.code, 'CAPTURE_TEXT_LIMIT');
  const commands = [];
  for (const selection of [{ block }, { material }]) {
    const selected = await rpc('capture/context', { sessionId: 's', lease: info.lease, selection }); assert.equal(selected.ok, true);
    assert.match(selected.value.text, /RPC/);
    const command = { kind: 'create', requestKey: Object.keys(selection)[0], text: selected.value.text, origin: selected.value.origin }; commands.push(command);
    lose = true;
    assert.equal((await rpc('capture/execute', { sessionId: 's', lease: info.lease, command })).value.status, 'unknown');
    lose = false;
  }
  for (const dispose of disposers.splice(0)) dispose(); await boot(); changed = true;
  info = (await rpc('capture/context', { sessionId: 's' })).value;
  for (const command of commands) {
    assert.equal((await rpc('capture/execute', { sessionId: 's', lease: info.lease, command })).value.status, 'saved');
    const rejected = await rpc('capture/execute', { sessionId: 's', lease: info.lease, command: { ...command, requestKey: command.requestKey + '-new' } });
    assert.equal(rejected.error.code, 'CAPTURE_SOURCE_NOT_VERIFIED');
  }
  const list = (await rpc('capture/list', { sessionId: 's', lease: info.lease })).value;
  assert.equal(list.length, 2);
  assert.equal((await rpc('capture/execute', { sessionId: 's', lease: info.lease, command: { kind: 'edit', id: list[0].id, expectedVersion: 99, text: 'stale edit', requestKey: 'stale-edit' } })).value.problem, 'VERSION_CONFLICT');
});
