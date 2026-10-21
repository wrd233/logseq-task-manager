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
