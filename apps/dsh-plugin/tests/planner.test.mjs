/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlannerStore } from '../src/planner-store.mjs';
import { visibleDates, offsetDate, dateKey } from '../src/planner-model.mjs';

test('calendar uses local dates, Monday weeks, leap days and year boundaries', () => {
  assert.equal(dateKey(new Date(2026, 9, 22, 0, 1)), '2026-10-22');
  assert.deepEqual(visibleDates('today', '2026-10-22'), ['2026-10-22']);
  assert.deepEqual(visibleDates('tomorrow', '2026-12-31'), ['2027-01-01']);
  assert.deepEqual(visibleDates('week', '2026-10-25'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(offsetDate('2024-02-28', 1), '2024-02-29');
});
test('durable CRUD, references, period removal and persistent undo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-planner-test-'));
  try {
    let store = new PlannerStore(root); await store.load();
    const mutate = value => store.change({ revision: store.read().revision, ...value });
    const reference = { graphId: 'synthetic', blockUuid: 'block', objectId: 'formal-task', kind: 'TASK', title: 'Existing task' };
    const original = structuredClone(reference);
    let state = await mutate({ action: 'save', entry: { title: '研究架构', date: '2026-10-22', slotId: 'slot-0', reference } });
    const id = state.entries[0].id;
    state = await mutate({ action: 'save', entry: { ...state.entries[0], title: '梳理架构', date: '2026-10-23', slotId: 'slot-1' } });
    assert.equal(state.entries.length, 1); assert.deepEqual(reference, original);
    store = new PlannerStore(root); await store.load();
    assert.equal(store.read().entries[0].date, '2026-10-23');
    state = await mutate({ action: 'slots', slots: [{ id: 'slot-0', name: '专注时间' }] });
    assert.equal(state.entries[0].slotId, 'slot-0');
    state = await mutate({ action: 'undo' }); assert.equal(state.entries[0].slotId, 'slot-1');
    state = await mutate({ action: 'delete', id }); assert.equal(state.entries.length, 0);
    store = new PlannerStore(root); await store.load();
    state = await mutate({ action: 'undo' }); assert.equal(state.entries[0].title, '梳理架构');
    state = await mutate({ action: 'undo' }); assert.equal(state.entries[0].title, '研究架构');
    assert.deepEqual(state.entries[0].reference, original);
    assert.equal(JSON.parse(await readFile(join(root, 'semantic-planner.json'), 'utf8')).revision, state.revision);
  } finally { await rm(root, { recursive: true }); }
});
test('stale windows and failed saves preserve the last successful state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-planner-test-'));
  try {
    const store = new PlannerStore(root); await store.load();
    const value = { revision: 0, action: 'save', entry: { title: 'One', date: '2026-10-22', slotId: 'slot-0' } };
    const [a, b] = await Promise.allSettled([store.change(value), store.change(value)]);
    assert.equal(a.status, 'fulfilled'); assert.equal(b.reason.code, 'PLANNER_CONFLICT');
    const previous = structuredClone(store.read());
    await assert.rejects(store.change({ revision: 1, action: 'slots', slots: [] }));
    assert.deepEqual(store.read(), previous);
    store.path = join(root, 'missing', 'cannot-save.json');
    await assert.rejects(store.change({ ...value, revision: 1 }));
    assert.deepEqual(store.read(), previous);
  } finally { await rm(root, { recursive: true }); }
});
