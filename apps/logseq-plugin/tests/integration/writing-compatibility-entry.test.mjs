import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { setTimeout as delay } from 'node:timers/promises';
import { KernelClient } from '@task-copilot/client/browser';
import { Kernel } from '@task-copilot/kernel';
import { SqliteStore } from '@task-copilot/sqlite';
import { LogseqGraphAdapter } from '../../src/graph-adapter.ts';

// Actual registered commands, Kernel and Graph adapter; only the Desktop SDK
// and HTTP delivery are synthetic. No direct store mutation formalizes roots.
test('registered formalization, completion, Undo and normalization preserve affair/task spelling, multiline properties and block identity', async () => {
  const browser = new Window({ url: 'http://localhost/plugin/' });
  Object.assign(globalThis, { window: browser, document: browser.document, MutationObserver: browser.MutationObserver });
  const { pluginRuntime } = await import('../../src/plugin-runtime.ts');
  const { startTaskCenter } = await import('../../src/features/task-center/controller.ts');
  const store = new SqliteStore(':memory:'), key = 'a'.repeat(64), graphId = 'Writing:/writing-fixture';
  const kernel = new Kernel(store, { now: () => '2026-10-04T00:00:00.000Z', graphSnapshotKey: key });
  const nodes = new Map(), commands = new Map(), messages = [], memory = new Map();
  let current, writes = 0, ids = 0;
  const tree = uuid => { const node = nodes.get(uuid); return node ? { ...node, children: node.children.map(tree) } : null; };
  const host = {
    getBlock: async uuid => tree(uuid),
    updateBlock: async (uuid, content) => { writes++; nodes.get(uuid).content = content; return tree(uuid); },
    insertBlock: async (target, content, options) => {
      const parent = options.sibling ? nodes.get(target).parent : target;
      const uuid = options.customUUID;
      nodes.set(uuid, { uuid, content: `${content}\nid:: ${uuid}`, properties: { id: uuid }, children: [], parent });
      const siblings = nodes.get(parent).children;
      if (options.sibling) siblings.splice(siblings.indexOf(target) + (options.before ? 0 : 1), 0, uuid);
      else siblings.splice(options.before ? 0 : siblings.length, 0, uuid);
      return tree(uuid);
    },
    removeBlock: async uuid => { const node = nodes.get(uuid); if (node?.parent) nodes.get(node.parent).children = nodes.get(node.parent).children.filter(id => id !== uuid); nodes.delete(uuid); },
  };
  const adapter = new LogseqGraphAdapter(host, graphId);
  const overrides = {
    listObjectAnchorIndex: async () => ({ objects: store.listWorkObjects().map(object => ({ object, anchor: store.getAnchorForWorkObject(object.id) })) }),
    listProjectionObligations: async () => ({ obligations: store.listProjectionObligations() }), listRecovery: async () => ({ recovery: [] }),
    showObject: async id => ({ object: store.getWorkObject(id), anchor: store.getAnchorForWorkObject(id) }),
    showClosure: async id => ({ closure: store.getClosureHistory(id) }), showCommit: async id => ({ commit: store.getCommit(id) }),
    commitFormal: async (operation, snapshot) => kernel.commitFormal(operation, snapshot),
    undoFormal: async (commitId, input) => kernel.undoFormal({ ...input, commitId }, input.snapshot),
    deliverFormalProjection: async id => {
      const effect = store.getCommit(id).graphEffect, result = await adapter.applyGraphEffect(effect);
      const obligation = kernel.verifyFormalProjection(id, result, await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: effect.sourceBlockUuid }));
      return { obligation };
    },
  };
  const originals = new Map(Object.keys(overrides).map(key => [key, KernelClient.prototype[key]])), originalFetch = globalThis.fetch;
  Object.assign(KernelClient.prototype, overrides);
  globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ request: null }));
  globalThis.logseq = {
    settings: { kernelDescriptorJson: JSON.stringify({ schemaVersion: 1, baseUrl: 'http://127.0.0.1:1', token: 'fixture', pid: 1, startedAt: 'now', graphSnapshotKey: key, graphBridgeToken: 'b'.repeat(64) }) },
    FileStorage: { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => memory.set(key, value) },
    App: { getCurrentGraph: async () => ({ name: 'Writing', url: '/writing-fixture', path: '/writing-fixture' }), onCurrentGraphChanged: () => () => {}, registerCommandPalette: (command, handler) => commands.set(command.key, handler), registerCommand: () => {}, registerUIItem: () => {} },
    Editor: { ...host, getCurrentBlock: async () => tree(current), upsertBlockProperty: async (uuid, key, value) => { ids++; const node = nodes.get(uuid); node.properties[key] = value; node.content += `\n${key}:: ${value}`; } },
    DB: { onChanged: () => () => {} }, UI: { showMsg: async (message, type) => messages.push({ message, type }) },
    provideStyle: () => {}, provideModel: () => {}, hideMainUI: () => {},
  };
  let dispose;
  const command = async suffix => {
    const before = messages.length; commands.get(`task-copilot-vnext-${suffix}`)();
    for (let i = 0; i < 200 && messages.length === before; i++) await delay(5);
    const result = messages.at(-1); assert.equal(messages.length, before + 1); assert.equal(result.type, 'success', result.message);
  };
  try {
    await pluginRuntime.start(); dispose = await startTaskCenter();
    assert.equal(store.listWorkObjects().length, 0); assert.equal(writes, 0); assert.equal(ids, 0);
    for (const label of ['事务', '任务', 'MiniProject']) {
      current = crypto.randomUUID();
      const title = '核对 **重点** [资料](longdoc://stable-id)';
      const first = label === 'MiniProject' ? `**[MiniProject]** ${title} #MiniProject` : `TODO **[${label}]** ${title}`;
      const tail = '\n[注] 保留口吻\n[目标] 原有限制\n[想法] 待核验\n普通条件 😀\nTODO 局部待办\ncustom:: value';
      const child = crypto.randomUUID(), nested = crypto.randomUUID();
      nodes.set(current, { uuid: current, content: first + tail, properties: { custom: 'value' }, children: [child, nested], parent: null });
      nodes.set(child, { uuid: child, content: 'TODO 普通内部待办', properties: {}, children: [], parent: current });
      nodes.set(nested, { uuid: nested, content: `TODO **[事务]** ${title}`, properties: {}, children: [], parent: current });
      const count = store.listWorkObjects().length;
      await command(label === 'MiniProject' ? 'formalize-mini-project' : 'formalize');
      assert.equal(store.listWorkObjects().length, count + 1);
      const object = store.listWorkObjects().find(object => store.getAnchorForWorkObject(object.id).externalId === current);
      assert.equal(object.title, title); assert.equal(object.kind, label === 'MiniProject' ? 'MINI_PROJECT' : 'TASK');
      const original = `${first}${tail}\nid:: ${current}`;
      assert.equal(nodes.get(current).content, original);
      const before = store.listCommits().length;
      await command('rerender'); assert.equal(store.listCommits().length, before); assert.equal(nodes.get(current).content, original);
      if (label !== 'MiniProject') {
        await command('complete-task'); assert.equal(store.getWorkObject(object.id).lifecycle, 'COMPLETED');
        assert.equal(nodes.get(current).content, original.replace(/^TODO/, 'DONE'));
        await command('undo'); assert.equal(store.getWorkObject(object.id).lifecycle, 'OPEN'); assert.equal(nodes.get(current).content, original);
      }
      assert.deepEqual(nodes.get(current).children, [child, nested]);
      assert.equal(nodes.get(child).content, 'TODO 普通内部待办'); assert.equal(store.getAnchorForWorkObject(object.id).externalId, current);
      assert.ok(!store.listWorkObjects().some(object => store.getAnchorForWorkObject(object.id).externalId === nested));
    }
    assert.ok(store.listCommits().every(commit => commit.status === 'COMMITTED'));
    assert.ok(store.listProjectionObligations().every(item => item.status === 'VERIFIED'));
  } finally {
    await dispose?.(); pluginRuntime.stop(); for (const [key, value] of originals) KernelClient.prototype[key] = value;
    globalThis.fetch = originalFetch; store.close(); await browser.happyDOM.abort();
    for (const key of ['logseq', 'window', 'document', 'MutationObserver']) delete globalThis[key];
  }
});
