/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureInboxController, visibleRecords, quoteRecords } from '../src/capture-inbox/controller.mjs';

// Clearly synthetic Store/host fixtures; these cannot establish native DSH behavior.
const context = { scope: null, binding: null, workObject: null, sessionId: 'synthetic-session', generation: 1 };
const revision = { version: 1, text: '合成数据 原始正文', at: '2026-10-21T01:00:00Z', requestKey: 'synthetic' };
const row = { id: 'synthetic-record', original: revision.text, text: revision.text, version: 1, archived: false, createdAt: revision.at, origin: { sessionId: context.sessionId }, history: [revision] };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(overrides = {}, portOverrides = {}) {
  let draftVersion = 0, savedDraft = null;
  const calls = [], commands = [];
  const store = { list: async () => [structuredClone(row)], readDraft: async () => ({ version: draftVersion, draft: savedDraft }),
    saveDraft: async (_context, version, draft) => { assert.equal(version, draftVersion); savedDraft = structuredClone(draft); return { status: 'saved', version: ++draftVersion }; },
    execute: async (_context, command) => { commands.push(structuredClone(command)); return { status: 'saved', record: row }; }, ...overrides };
  const port = { context: () => context, insertDraft: async text => { calls.push(['insert', text]); return 'inserted'; }, returnFocus: () => calls.push(['focus']), ...portOverrides };
  const controller = new CaptureInboxController({ store, context, createPort: () => { calls.push(['capture']); return port; }, now: () => new Date('2026-10-21T05:00:00Z') });
  await controller.open('capture', port);
  return { controller, store, calls, commands, port, getDraft: () => savedDraft };
}
test('reliable save closes and returns focus; pin retains capture with empty text', async () => {
  const { controller, calls } = await fixture(); controller.actions.onText('合成记录');
  await controller.save(); assert.equal(controller.state.text, ''); assert.equal(controller.state.visible, false); assert.deepEqual(calls, [['focus']]);
  await controller.open(); controller.actions.onPin(true); controller.actions.onText('another'); await controller.save();
  assert.equal(controller.state.visible, true); assert.equal(controller.state.text, '');
});
test('continued typing survives asynchronous save and uses a new request key', async () => {
  const wait = deferred(); const { controller, getDraft } = await fixture({ execute: () => wait.promise });
  controller.actions.onText('first'); const originalKey = controller.state.requestKey;
  const saving = controller.save(); await controller.draftQueue;
  controller.actions.onText('first + later typing'); wait.resolve({ status: 'saved', record: row }); await saving;
  assert.equal(controller.state.text, 'first + later typing'); assert.notEqual(controller.state.requestKey, originalKey);
  assert.equal(controller.state.visible, true); assert.equal(getDraft().text, 'first + later typing');
});
for (const status of ['unknown', 'partial', 'failed', 'conflict']) test(`${status} does not clear or close, retry keeps original command despite later typing`, async () => {
  const commands = []; const { controller } = await fixture({ execute: async (_context, command) => { commands.push(command); return { status, problem: 'synthetic failure' }; } });
  controller.actions.onText('first'); await controller.save(); const key = controller.captureAttempt.requestKey;
  assert.equal(controller.state.text, 'first'); assert.equal(controller.state.visible, true);
  controller.actions.onText('later'); await controller.save(); assert.equal(commands[1].requestKey, key); assert.equal(commands[1].text, 'first'); assert.equal(controller.state.text, 'later');
});
test('durable draft failure blocks save and close; recovery safely reconciles own lost acknowledgement', async () => {
  let saved = null, calls = 0, execute = 0;
  const { controller } = await fixture({ saveDraft: async (_context, _version, draft) => { saved = draft; return calls++ ? { status: 'saved', version: calls } : { status: 'unknown' }; },
    readDraft: async () => ({ version: saved ? 1 : 0, draft: saved }), execute: async () => { execute++; return { status: 'saved', record: row }; } });
  controller.actions.onText('kept'); await controller.draftQueue;
  await controller.save(); assert.equal(execute, 0); assert.equal(await controller.close(), false); assert.equal(controller.state.visible, true);
  assert.equal(await controller.recoverDraft(), true); await controller.save(); assert.equal(execute, 1);
});
test('edit conflict retains body and requires explicit rebase before a fresh version request', async () => {
  const { controller } = await fixture({ execute: async () => ({ status: 'conflict', record: row, problem: 'VERSION_CONFLICT' }) });
  controller.edit(row.id); controller.editText('合成数据：我的未保存编辑'); await controller.saveEdit();
  assert.equal(controller.state.edit.text, '合成数据：我的未保存编辑'); const key = controller.editAttempt.requestKey;
  await controller.rebaseEdit(); assert.equal(controller.state.edit.text, '合成数据：我的未保存编辑'); assert.notEqual(controller.state.edit.requestKey, key);
});
test('search includes archived and old bodies; today and current-results selection are scoped', async () => {
  const rows = [row, { ...row, id: 'archived', archived: true, text: 'new', history: [revision, { ...revision, version: 2, text: 'new' }] }, { ...row, id: 'yesterday', createdAt: '2026-10-20T01:00:00Z' }];
  assert.equal(visibleRecords(rows, '', false).length, 2); assert.equal(visibleRecords(rows, '原始正文', false).length, 3);
  const { controller } = await fixture({ list: async () => rows }); controller.actions.onToday(); assert.deepEqual(controller.state.selected, [row.id]);
  controller.actions.onQuery('原始正文'); controller.actions.onSelectAll(); assert.equal(controller.state.selected.length, 3); controller.actions.onClearSelection(); assert.equal(controller.state.selected.length, 0);
});
for (const status of ['busy', 'stale', 'unavailable']) test(`native ${status} keeps exact quote; span captured before draft persistence`, async () => {
  const { controller, calls } = await fixture({}, { insertDraft: async () => status }); controller.actions.onSelect(row.id, true);
  await controller.quote(); assert.equal(calls[0][0], 'capture'); assert.equal(controller.state.quoteStatus, status); assert.equal(controller.state.quote, quoteRecords([row]));
  assert.ok(controller.state.quote.includes(row.original)); assert.ok(controller.state.quote.includes(context.sessionId));
});
test('session/generation change during async quote blocks insertion and retains quote in original partition', async () => {
  let active = context; const waiting = deferred(); let block = false;
  const { controller, calls } = await fixture({ saveDraft: async () => { if (block) await waiting.promise; return { status: 'saved', version: 1 }; } }, { context: () => active });
  controller.actions.onSelect(row.id, true); block = true; const quoting = controller.quote();
  active = { ...context, generation: 2 }; waiting.resolve(); await quoting;
  assert.equal(controller.state.quoteStatus, 'stale'); assert.equal(calls.some(call => call[0] === 'insert'), false); assert.ok(controller.state.quote);
});
