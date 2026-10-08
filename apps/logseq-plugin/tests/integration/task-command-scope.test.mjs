import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { setTimeout as delay } from 'node:timers/promises';
import { KernelClient } from '@task-copilot/client/browser';
import { deferred } from '../fixtures/work-view.mjs';

test('registered formalize command captures Graph before reading and rollback preserves a newer user edit', async () => {
  const browser = new Window({ url: 'http://localhost/plugin/' });
  globalThis.window = browser; globalThis.document = browser.document; globalThis.MutationObserver = browser.MutationObserver;
  const { pluginRuntime } = await import('../../src/plugin-runtime.ts');
  const { startTaskCenter } = await import('../../src/features/task-center/controller.ts');
  const methods = ['listObjectAnchorIndex', 'listProjectionObligations', 'listRecovery', 'commitFormal'];
  const originals = methods.map(key => KernelClient.prototype[key]), fetch = globalThis.fetch;
  KernelClient.prototype.listObjectAnchorIndex = async () => ({ objects: [] }); KernelClient.prototype.listProjectionObligations = async () => ({ obligations: [] }); KernelClient.prototype.listRecovery = async () => ({ recovery: [] });
  const block = { uuid: crypto.randomUUID(), content: 'natural note', children: [], properties: {} };
  const commands = new Map(), messages = [],privateState=new Map(); let graph = 'A', changed, read, writes = 0, commits = 0;
  const descriptor = { schemaVersion: 1, baseUrl: 'http://127.0.0.1:1', token: 'fixture', pid: 1, startedAt: 'now', graphSnapshotKey: 'a'.repeat(64), graphBridgeToken: 'b'.repeat(64) };
  globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ request: null }));
  globalThis.logseq = {
    settings: { kernelDescriptorJson: JSON.stringify(descriptor) },
    FileStorage: { getItem: async key => privateState.get(key)??null, setItem: async (key,value) => {privateState.set(key,value);} },
    App: { getCurrentGraph: async () => ({ name: graph, url: `/${graph}`, path: `/${graph}` }), onCurrentGraphChanged: fn => { changed = fn; return () => {}; }, registerCommandPalette: (command, handler) => { commands.set(command.key, handler); }, registerCommand: () => {}, registerUIItem: () => {} },
    Editor: { getCurrentBlock: async () => read ? await read() : block, getBlock: async () => block, upsertBlockProperty: async (_uuid, key, value) => { writes++; block.properties[key] = value; }, updateBlock: async (_uuid, text) => { writes++; block.content = text; } },
    DB: { onChanged: () => () => {} }, UI: { showMsg: async message => { messages.push(message); } },
    provideStyle: () => {}, provideModel: () => {}, hideMainUI: () => {},
  };
  KernelClient.prototype.commitFormal = async () => { commits++; block.content = 'new user edit'; throw Error('fixture commit rejected'); };
  let dispose;
  try {
    await pluginRuntime.start(); dispose = await startTaskCenter();
    const gate = deferred(), started = deferred(); read = async () => { started.resolve(); return gate.promise; };
    commands.get('task-copilot-vnext-formalize')(); await started.promise; graph = 'B'; changed(); gate.resolve(block);
    for (let i = 0; i < 30 && !messages.length; i++) await delay(2);
    assert.equal(writes, 0); assert.equal(commits, 0); assert.ok(messages.some(message => message.includes('GRAPH_SCOPE_CHANGED')));
    graph = 'A'; changed(); await delay(5); read = null; messages.length = 0;
    commands.get('task-copilot-vnext-formalize')();
    for (let i = 0; i < 50 && !messages.length; i++) await delay(2);
    assert.equal(commits, 1); assert.equal(writes, 2); // durable id + canonical source, no rollback over newer text
    assert.equal(block.content, 'new user edit'); assert.ok(messages.some(message => message.includes('fixture commit rejected')));
    // A different source avoids the earlier uncertain intent. A silent SDK loss
    // must stop before dispatch and restore only this source's canonical edit.
    block.uuid=crypto.randomUUID();block.content='另一条可能的自然记录';block.properties={};messages.length=0;
    const original=block.content,save=globalThis.logseq.FileStorage.setItem,beforeCommits=commits;
    globalThis.logseq.FileStorage.setItem=async(key,value)=>{if(!key.startsWith('task-copilot-scoped-v1-'))await save(key,value);};
    commands.get('task-copilot-vnext-formalize')();for(let i=0;i<100&&!messages.length;i++)await delay(2);
    assert.ok(messages.some(message=>message.includes('未能确认本机恢复记录已保存')));assert.equal(commits,beforeCommits);assert.equal(block.content,original);
  } finally {
    await dispose?.(); pluginRuntime.stop(); methods.forEach((key, index) => { KernelClient.prototype[key] = originals[index]; }); globalThis.fetch = fetch;
    await browser.happyDOM.abort(); delete globalThis.logseq; delete globalThis.window; delete globalThis.document; delete globalThis.MutationObserver;
  }
});
