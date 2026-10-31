/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlannerStore } from '../src/planner-store.mjs';
import { visibleDates, offsetDate, dateKey, handoffText, durationLabel, dueLabel, moveEntries, dayTotals } from '../src/planner-model.mjs';

const withStore = async run => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-planner-ux-'));
  try { const store = new PlannerStore(root); await store.load(); return await run(store, root); }
  finally { await rm(root, { recursive: true, force: true }); }
};
const mutate = (store, input) => store.change({ revision: store.read().revision, ...input });

test('local calendar, Monday weeks, leap days and duration language', () => {
  assert.equal(dateKey(new Date(2026, 9, 31, 0, 1)), '2026-10-31');
  assert.deepEqual(visibleDates('today', '2026-10-31'), ['2026-10-31']);
  assert.deepEqual(visibleDates('tomorrow', '2026-12-31'), ['2027-01-01']);
  assert.deepEqual(visibleDates('week', '2026-11-01'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(offsetDate('2024-02-28', 1), '2024-02-29');
  assert.equal(durationLabel(0), '0 分钟');
  assert.equal(durationLabel(60), '1 小时');
  assert.equal(durationLabel(95), '1 小时 35 分');
  assert.equal(dueLabel('2026-11-01T18:30', '2026-10-31'), '明天 18:30');
  assert.equal(dueLabel('2026-10-31T09:00', '2026-10-31'), '今天 09:00');
});

test('plan, actual and deadline stay distinct; order is a direct-manipulation array', () => {
  const slot = { id: 's', name: '上午核心时间', start: '09:00', end: '12:00' };
  const entry = { id: 'a', title: '研究架构', date: '2026-10-31', slotId: 's', reference: null, plannedMinutes: 60, actualMinutes: 25, dueAt: '2026-11-02T18:00' };
  assert.deepEqual(dayTotals([entry]), { planned: 60, actual: 25, count: 1 });
  const text = handoffText(entry, slot, '2026-10-31');
  assert.match(text, /上午核心时间（09:00–12:00）/);
  assert.match(text, /计划投入 1 小时/);
  assert.match(text, /实际投入 25 分钟/);
  assert.match(text, /截止时间 11月2日 18:00/);
  assert.doesNotMatch(text, /graphId|blockUuid|semantic-planner/);
  const rows = [entry, { ...entry, id: 'b' }, { ...entry, id: 'c' }];
  assert.deepEqual(moveEntries(rows, { id: 'c', date: '2026-10-31', slotId: 's', beforeId: 'a' }).map(item => item.id), ['c', 'a', 'b']);
  assert.deepEqual(moveEntries(rows, { id: 'a', date: '2026-11-01', slotId: 's' }).map(item => item.id), ['b', 'c', 'a']);
});

test('durable create, edit, move, reorder, record, delete, undo and reload', async () => withStore(async (store, root) => {
  const reference = { graphId: 'graph:1', blockUuid: 'block-a', objectId: 'formal-task', kind: 'TASK', title: '已有任务' };
  const original = structuredClone(reference);
  let state = await mutate(store, { action: 'save', entry: { title: '自由活动', date: '2026-10-31', slotId: 'slot-morning', plannedMinutes: 45 } });
  const free = state.entries[0].id;
  state = await mutate(store, { action: 'save', entry: { title: '梳理架构', date: '2026-10-31', slotId: 'slot-morning', plannedMinutes: 90, reference } });
  const work = state.entries[1].id;
  assert.equal(state.entries.length, 2);
  assert.deepEqual(state.entries[1].reference, original);
  reference.title = '客户端偷偷改名'; assert.equal(store.read().entries[1].reference.title, '已有任务');

  state = await mutate(store, { action: 'reorder', id: work, direction: -1 });
  assert.deepEqual(state.entries.map(item => item.id), [work, free]);
  state = await mutate(store, { action: 'move', id: work, date: '2026-10-31', slotId: 'slot-afternoon', beforeId: null });
  assert.equal(state.entries.find(item => item.id === work).slotId, 'slot-afternoon');

  state = await mutate(store, { action: 'save', entry: { ...state.entries.find(item => item.id === free), plannedMinutes: 60, dueAt: '2026-11-03T18:00' } });
  const plan = structuredClone(state.entries.find(item => item.id === free));
  await mutate(store, { action: 'record', id: free, minutes: 30 });
  state = await mutate(store, { action: 'record', id: free, minutes: 15 });
  const recorded = state.entries.find(item => item.id === free);
  assert.equal(recorded.actualMinutes, 45); assert.equal(recorded.plannedMinutes, 60); assert.equal(recorded.dueAt, plan.dueAt);
  state = await mutate(store, { action: 'move', id: free, date: '2026-11-01', slotId: 'slot-evening', beforeId: null });
  assert.equal(state.entries.find(item => item.id === free).dueAt, plan.dueAt);

  state = await mutate(store, { action: 'delete', id: free });
  assert.equal(state.entries.length, 1);
  state = await mutate(store, { action: 'undo' });
  assert.equal(state.entries.find(item => item.id === free).title, '自由活动');
  assert.equal(state.undoneLabel, '删除「自由活动」');

  const reloaded = new PlannerStore(root); await reloaded.load();
  assert.deepEqual(reloaded.read().entries.map(item => item.id), state.entries.map(item => item.id));
  const saved = JSON.parse(await readFile(join(root, 'semantic-planner.json'), 'utf8'));
  assert.equal(saved.revision, state.revision);
  assert.equal(saved.version, 2);
}));

test('semantic slots edit names, order and optional ranges without losing plans', async () => withStore(async store => {
  let state = await mutate(store, { action: 'save', entry: { title: '晚间散步', date: '2026-10-31', slotId: 'slot-evening' } });
  assert.equal(state.slots.find(item => item.id === 'slot-evening').start, '20:00');
  state = await mutate(store, { action: 'slots', slots: [
    { id: 'focus', name: '清晨专注', start: '06:30', end: '08:30' },
    { id: 'loose', name: '午后杂事' },
  ] });
  assert.equal(state.slots.length, 2);
  assert.equal(state.entries[0].slotId, 'focus');
  assert.equal(state.slots[1].start, null);
  await assert.rejects(mutate(store, { action: 'slots', slots: [{ id: 'bad', name: '坏范围', start: '12:00', end: '09:00' }] }), error => error.code === 'PLANNER_INVALID');
  await assert.rejects(mutate(store, { action: 'slots', slots: [] }), error => error.code === 'PLANNER_INVALID');
  const previous = structuredClone(store.read());
  await assert.rejects(mutate(store, { action: 'slots', slots: [{ id: 'x', name: '只有开始', start: '09:00' }] }));
  assert.deepEqual(store.read(), previous);
}));

test('stale revisions and failed writes preserve the last successful state', async () => withStore(async (store, root) => {
  const value = { revision: 0, action: 'save', entry: { title: 'One', date: '2026-10-31', slotId: 'slot-morning' } };
  const [first, second] = await Promise.allSettled([store.change(value), store.change(value)]);
  assert.equal(first.status, 'fulfilled'); assert.equal(second.reason.code, 'PLANNER_CONFLICT');
  const previous = structuredClone(store.read());
  await assert.rejects(store.change({ ...value, revision: store.read().revision, entry: { title: '', date: '2026-10-31', slotId: 'slot-morning' } }));
  assert.deepEqual(store.read(), previous);
  store.path = join(root, 'missing', 'cannot-save.json');
  await assert.rejects(store.change({ revision: store.read().revision, action: 'save', entry: { title: 'Two', date: '2026-10-31', slotId: 'slot-morning' } }));
  assert.deepEqual(store.read(), previous);
}));

test('a damaged planner file stays untouched and does not disable the host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-planner-damaged-'));
  try {
    const path = join(root, 'semantic-planner.json');
    await writeFile(path, '{damaged');
    const { installPlannerHost } = await import('../src/planner-host.mjs');
    const host = await installPlannerHost({ sessionController: { inspect: async () => ({}) } },
      { command: async () => [{ graphId: 'g', blockUuid: 'b', objectId: null, kind: 'TASK', title: '工作' }] }, root);
    assert.ok(host.store);
    await assert.rejects(host.routes['planner-read']({ sessionId: 's' }), error => error.code === 'PLANNER_CORRUPT');
    assert.equal((await host.routes['planner-references']({ sessionId: 's' })).length, 1);
    assert.equal(await readFile(path, 'utf8'), '{damaged');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an existing version 1 planner file keeps its plans and undo history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-planner-migrate-'));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'semantic-planner.json'), JSON.stringify({ version: 1, revision: 4,
      slots: [{ id: 'slot-0', name: '上午' }, { id: 'slot-1', name: '晚上' }],
      entries: [{ id: 'old', title: '旧安排', date: '2026-10-30', slotId: 'slot-1', reference: null }],
      undo: [{ slots: [{ id: 'slot-0', name: '上午' }], entries: [] }] }));
    const store = new PlannerStore(root); await store.load();
    const state = store.read();
    assert.equal(state.version, 2);
    assert.equal(state.entries[0].plannedMinutes, null);
    assert.equal(state.entries[0].actualMinutes, null);
    assert.equal(state.entries[0].dueAt, null);
    assert.equal(state.slots[0].start, null);
    assert.equal(state.canUndo, true);
    const undone = await store.change({ revision: 4, action: 'undo' });
    assert.equal(undone.slots.length, 1);
    assert.equal(undone.slots[0].start, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
