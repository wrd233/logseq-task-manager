import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { setTimeout as delay } from 'node:timers/promises';
import { KernelClient, FormalOutcomeUnknownError } from '@task-copilot/client/browser';
import { Kernel } from '@task-copilot/kernel';
import { SqliteStore } from '@task-copilot/sqlite';
import { loadCurrentFocusSkill, loadEngagementReconciliationSkill } from '@task-copilot/agent';
import { parseSemanticOperation } from '@task-copilot/contracts';
import { FakeGraphAdapter } from '../../../../packages/test-support/src/index.ts';
import { deferred } from '../fixtures/work-view.mjs';

const currentKey = 'task-copilot-vnext-current-work-object', recentKey = 'task-copilot-vnext-recent-commit';
async function until(condition) { for (let i = 0; i < 150; i++) { if (condition()) return; await delay(4); } assert.fail('command did not settle'); }
async function fixture() {
  const browser = new Window({ url: 'http://localhost/plugin/' });
  Object.assign(globalThis, { window: browser, document: browser.document, MutationObserver: browser.MutationObserver });
  const { pluginRuntime } = await import('../../src/plugin-runtime.ts');
  const { startTaskCenter } = await import('../../src/features/task-center/controller.ts');
  const at = '2026-10-02T00:00:00.000Z', key = 'a'.repeat(64), store = new SqliteStore(':memory:'), graph = new FakeGraphAdapter(() => at);
  const kernel = new Kernel(store, { now: () => at, graphSnapshotKey: key, currentFocusSkill: await loadCurrentFocusSkill(), engagementSkill: await loadEngagementReconciliationSkill() });
  const objects = [];
  for (const uuid of ['source-A', 'source-other']) {
    const source = graph.seedNaturalRecord('A:/A', uuid, `TODO ${uuid}`);
    const formal = kernel.commitFormal(parseSemanticOperation({ operationId: uuid, type: 'CREATE_WORK_OBJECT', actor: { type: 'USER', id: 'local-user' }, input: { kind: 'TASK', title: uuid, anchor: { graphId: 'A:/A', blockUuid: uuid, sourceContentHash: source.sourceContentHash } } }), source);
    kernel.verifyFormalProjection(formal.commit.id, await graph.applyGraphEffect(formal.graphEffect), graph.snapshot('A:/A', uuid)); objects.push(formal.commit.targetId);
  }
  const memory = new Map([[currentKey, objects[0]]]), commands = new Map(), messages = [], listeners = new Set(); let graphName = 'A', changed;
  let sdkRead = async () => ({ uuid: 'source-A', content: graph.naturalContent('A:/A', 'source-A'), properties: {}, children: [] });
  const descriptor = { schemaVersion: 1, baseUrl: 'http://127.0.0.1:1', token: 'fixture', pid: 1, startedAt: at, graphSnapshotKey: key, graphBridgeToken: 'b'.repeat(64) };
  const originalFetch = globalThis.fetch, originalAdapter = pluginRuntime.adapterForCurrentGraph;
  globalThis.fetch = async () => new Response(JSON.stringify({ request: null }));
  globalThis.logseq = {
    settings: { kernelDescriptorJson: JSON.stringify(descriptor) }, FileStorage: { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => memory.set(key, value) },
    App: { getCurrentGraph: async () => ({ name: graphName, url: `/${graphName}` }), onCurrentGraphChanged: fn => { changed = fn; return () => {}; }, registerCommandPalette: (command, handler) => commands.set(command.key, handler), registerCommand: () => {}, registerUIItem: () => {} },
    Editor: { getCurrentBlock: async () => sdkRead(), getBlock: async uuid => ({ uuid, content: graph.naturalContent('A:/A', uuid), properties: {}, children: [] }) },
    DB: { onChanged: fn => { listeners.add(fn); return () => listeners.delete(fn); } }, UI: { showMsg: async (message, type) => messages.push({ message, type }) },
    provideStyle: () => {}, provideModel: () => {}, hideMainUI: () => {}, showMainUI: () => {}, setMainUIAttrs: () => {}, setMainUIInlineStyle: () => {},
  };
  const overrides = {
    listObjectAnchorIndex: async () => ({ objects: store.listWorkObjects().map(object => ({ object, anchor: store.getAnchorForWorkObject(object.id) })) }),
    listProjectionObligations: async () => ({ obligations: store.listProjectionObligations() }), listRecovery: async () => ({ recovery: [] }),
    showObject: async id => { const object = store.getWorkObject(id); if (!object) throw Error('WORK_OBJECT_NOT_FOUND'); return { object, anchor: store.getAnchorForWorkObject(id) }; },
    showCommit: async id => ({ commit: store.getCommit(id) }), showClosure: async id => ({ closure: store.getClosureHistory(id) }), formalReceipt: async id => ({ receipt: kernel.formalReceipt(id) }),
    commitFormal: async (operation, snapshot) => kernel.commitFormal(operation, snapshot), undoFormal: async (commitId, input) => kernel.undoFormal({ ...input, commitId }, input.snapshot),
    applyProposalFormal: async (id, input) => store.getProposal(id).revision.operationType === 'CHANGE_ENGAGEMENT' ? kernel.applyEngagementProposalFormal({ ...input, proposalId: id }) : kernel.applyProposalFormal({ ...input, proposalId: id }),
    deliverFormalProjection: async id => { const obligation = store.getProjectionObligationForCommit(id); return { obligation: kernel.verifyFormalProjection(id, await graph.applyGraphEffect(store.getCommit(id).graphEffect), graph.snapshot(store.getCommit(id).graphEffect.graphId, store.getCommit(id).graphEffect.sourceBlockUuid)) }; },
    freezeEvidence: async input => ({ evidence: kernel.freezeEvidence(input) }),
    runCurrentFocusAgent: async input => { kernel.startExternalAgentRun({ ...input, purpose: 'CURRENT_FOCUS_MAINTENANCE', executorId: 'fixture' }); return kernel.finishExternalAgentRun({ runId: input.runId, result: { outcome: 'PROPOSAL', currentFocus: '继续处理', reasonCode: 'NEXT', rationaleSummary: 'next' } }); },
    runEngagementAgent: async input => { kernel.startExternalAgentRun({ ...input, purpose: 'ENGAGEMENT_RECONCILIATION', executorId: 'fixture' }); return kernel.finishExternalAgentRun({ runId: input.runId, result: { outcome: 'PROPOSAL', transition: { from: 'ACTIONABLE', to: 'WAITING', waiting: { description: '等待答复', reviewAt: null } }, reasonCode: 'WAIT', rationaleSummary: 'wait' } }); },
    prepare: async () => { throw Error('normal command used legacy prepare'); }, complete: async () => { throw Error('normal command used legacy complete'); }, applyProposal: async () => { throw Error('normal command used legacy proposal'); }, prepareUndo: async () => { throw Error('normal command used legacy Undo'); },
  };
  const originals = new Map(Object.keys(overrides).map(key => [key, KernelClient.prototype[key]])); Object.assign(KernelClient.prototype, overrides);
  await pluginRuntime.start();
  pluginRuntime.adapterForCurrentGraph = async () => { const scope = pluginRuntime.identities.scope(); return { graphId: scope.graphId, scope, adapter: { readGraphSnapshot: async input => graph.readGraphSnapshot(input), readEvidenceMaterial: async (input, proofKey) => graph.readEvidenceMaterial(input, proofKey) } }; };
  const dispose = await startTaskCenter();
  const command = async suffix => { const before = messages.length; commands.get(`task-copilot-vnext-${suffix}`)(); await until(() => messages.length > before); return messages.at(-1); };
  const prompt = async value => { await until(() => document.querySelector('[data-task-copilot-text-prompt] form')); document.querySelector('input').value = value; document.querySelector('form').dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })); await delay(0); };
  const select = id => memory.set(`${currentKey}:A%3A%2FA`, JSON.stringify({ value: id, session: 'fixture', generation: pluginRuntime.identities.scope().generation }));
  return { kernel, store, graph, objects, memory, messages, commands, listeners, command, prompt, select, setRead: fn => { sdkRead = fn; }, switchGraph: async name => { graphName = name; changed(); await until(() => pluginRuntime.identities.scope().graphId === `${name}:/${name}`); },
    cleanup: async () => { await dispose(); pluginRuntime.stop(); pluginRuntime.adapterForCurrentGraph = originalAdapter; for (const [key, value] of originals) KernelClient.prototype[key] = value; globalThis.fetch = originalFetch; store.close(); await browser.happyDOM.abort(); for (const key of ['logseq', 'window', 'document', 'MutationObserver']) delete globalThis[key]; } };
}

test('registered TASK closures, compensation, Focus, Engagement and Online DONE update formal state and audit', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.command('complete-task')).type, 'success'); assert.equal(f.store.getWorkObject(f.objects[0]).lifecycle, 'COMPLETED');
    await f.command('undo'); assert.equal(f.store.getWorkObject(f.objects[0]).lifecycle, 'OPEN');
    let work = f.command('cancel-task'); await f.prompt('不再需要'); assert.equal((await work).type, 'success'); assert.equal(f.store.getWorkObject(f.objects[0]).lifecycle, 'CANCELLED');
    work = f.command('amend-closure'); await f.prompt('补充说明'); await f.prompt('原因已更新'); assert.equal((await work).type, 'success'); assert.equal(f.store.getClosureHistory(f.objects[0]).amendments.length, 1);
    await f.command('undo'); assert.equal(f.store.getClosureHistory(f.objects[0]).current.reason, '不再需要');
    work = f.command('reopen-task'); await f.prompt('继续处理'); assert.equal((await work).type, 'success'); assert.equal(f.store.getWorkObject(f.objects[0]).lifecycle, 'OPEN');
    await f.command('undo'); assert.equal(f.store.getWorkObject(f.objects[0]).lifecycle, 'CANCELLED');
    work = f.command('reopen-task'); await f.prompt('再次处理'); await work;
    await f.command('agent-focus'); await f.command('agent-engagement');
    assert.equal(f.store.getWorkObject(f.objects[0]).currentFocus, '继续处理'); assert.equal(f.store.getWorkObject(f.objects[0]).engagement, 'WAITING');
    assert.equal(f.store.listFeedback().filter(x => x.type === 'ACCEPTED').length, 2); assert.ok(f.store.listFeedback().every(x => f.store.getProposal(x.proposalId)?.proposal.status === 'APPLIED'));
    // Marker intent targets the changed block, even while another object is selected.
    f.select(f.objects[1]); f.graph.editMarker('A:/A', 'source-A', 'DONE'); const before = f.messages.length;
    for (const fn of f.listeners) fn({ blocks: [{ uuid: 'source-A', content: 'DONE source-A' }] });
    await until(() => f.messages.length > before); assert.equal(f.store.getWorkObject(f.objects[0]).lifecycle, 'COMPLETED'); assert.equal(f.store.getWorkObject(f.objects[1]).lifecycle, 'OPEN');
    assert.ok(f.store.listCommits().every(x => x.status === 'COMMITTED')); assert.ok(f.store.listProjectionObligations().every(x => x.status === 'VERIFIED'));
    assert.equal(f.store.listRecovery().length, 0);
  } finally { await f.cleanup(); }
});

test('registered commands pin targets across prompts and reject A to B to A generations before Agent SDK or writes', async () => {
  const f = await fixture();
  try {
    let work = f.command('cancel-task'); await until(() => document.querySelector('form')); f.select(f.objects[1]); await f.prompt('取消原对象'); await work;
    assert.equal(f.store.getWorkObject(f.objects[0]).lifecycle, 'CANCELLED'); assert.equal(f.store.getWorkObject(f.objects[1]).lifecycle, 'OPEN');
    const before = f.store.listCommits().length;
    work = f.command('cancel-task'); await until(() => document.querySelector('form')); await f.switchGraph('B'); await f.switchGraph('A'); await f.prompt('旧作用域');
    assert.match((await work).message, /GRAPH_SCOPE_CHANGED/u); assert.equal(f.store.listCommits().length, before);
    f.select(f.objects[1]); const gate = deferred(), started = deferred(); f.setRead(async () => { started.resolve(); return gate.promise; });
    work = f.command('agent-focus'); await started.promise; await f.switchGraph('B'); await f.switchGraph('A'); gate.resolve({ uuid: 'source-other', content: 'evidence', children: [], properties: {} });
    assert.match((await work).message, /GRAPH_SCOPE_CHANGED/u); assert.equal(f.store.listEvidence().length, 0); assert.equal(f.store.listCommits().length, before);
  } finally { await f.cleanup(); }
});

test('registered completion retries an uncertain result under the same operation and retains a late accepted receipt without overwriting recent state', async () => {
  const f = await fixture();
  try {
    const real = KernelClient.prototype.commitFormal; let operationId;
    KernelClient.prototype.commitFormal = async (operation, snapshot) => { operationId = operation.operationId; f.kernel.commitFormal(operation, snapshot); throw new FormalOutcomeUnknownError(operationId, Error('lost response and receipt unavailable')); };
    assert.match((await f.command('complete-task')).message, /尚未确定/u); const count = f.store.listCommits().length;
    KernelClient.prototype.commitFormal = real;
    assert.equal((await f.command('complete-task')).type, 'success'); assert.equal(f.store.listCommits().length, count); assert.equal(f.kernel.formalReceipt(operationId).commit.status, 'COMMITTED');
    f.select(f.objects[1]); const gate = deferred(), accepted = deferred(); let commitId;
    KernelClient.prototype.commitFormal = async (operation, snapshot) => { const formal = f.kernel.commitFormal(operation, snapshot); commitId = formal.commit.id; accepted.resolve(); await gate.promise; return formal; };
    const work = f.command('complete-task'); await accepted.promise; const oldRecent = f.memory.get(`${recentKey}:A%3A%2FA`); await f.switchGraph('B'); await f.switchGraph('A'); gate.resolve();
    assert.match((await work).message, new RegExp(`正式提交已成功.*${commitId}`, 'u')); assert.equal(f.memory.get(`${recentKey}:A%3A%2FA`), oldRecent);
    assert.equal(f.store.getCommit(commitId).status, 'COMMITTED'); assert.equal(f.store.getProjectionObligationForCommit(commitId).status, 'PENDING');
  } finally { await f.cleanup(); }
});
