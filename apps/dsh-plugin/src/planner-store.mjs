import { parseWorkRef } from '@task-copilot/contracts';
/* global structuredClone */
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson } from '../../task-copilot-cli/src/workspace-files.ts';
import { moveEntries, reorderEntries, validDate, validDueAt } from './planner-model.mjs';

const fail = code => { throw Object.assign(Error(code), { code }); };
const text = (value, max = 300) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : fail('PLANNER_INVALID');
const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const minutes = value => {
  if (value === null || value === undefined || value === '') return null;
  if (!Number.isInteger(value) || value < 0 || value > 1440) fail('PLANNER_INVALID');
  return value;
};

const reference = value => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) fail('PLANNER_INVALID');
  if (!['PROJECT', 'MINI_PROJECT', 'TASK'].includes(value.kind)) fail('PLANNER_INVALID');
  return {
    ...(value.workRef ? {workRef: parseWorkRef(value.workRef)} : {}),
    graphId: text(value.graphId, 2048),
    blockUuid: text(value.blockUuid, 200),
    objectId: value.objectId === null || value.objectId === undefined ? null : text(value.objectId, 200),
    kind: value.kind,
    title: text(value.title, 300),
  };
};

const slot = (value, used = new Set()) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PLANNER_INVALID');
  const id = typeof value.id === 'string' && value.id.trim() ? text(value.id, 200) : randomUUID();
  if (used.has(id)) fail('PLANNER_INVALID');
  used.add(id);
  const start = value.start ? value.start : null, end = value.end ? value.end : null;
  if ((start && !validTime(start)) || (end && !validTime(end))) fail('PLANNER_INVALID');
  if (Boolean(start) !== Boolean(end)) fail('PLANNER_INVALID');
  if (start && end && end <= start) fail('PLANNER_INVALID');
  return { id, name: text(value.name, 40), start, end };
};

const entry = (value, slots) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PLANNER_INVALID');
  const schedule = value.schedule ?? 'flexible';
  if (schedule !== 'flexible' && schedule !== 'fixed') fail('PLANNER_INVALID');
  const fixed = schedule === 'fixed', startAt = value.startAt, endAt = value.endAt;
  if (fixed && (!startAt || !endAt || !validDueAt(startAt) || !validDueAt(endAt) || startAt >= endAt)) fail('PLANNER_INVALID');
  if (!fixed && (startAt != null || endAt != null)) fail('PLANNER_INVALID');
  const date = fixed ? startAt.slice(0, 10) : value.date;
  const slotId = fixed ? null : text(value.slotId, 200);
  if (!fixed && (!validDate(date) || !slots.some(item => item.id === slotId))) fail('PLANNER_INVALID');
  if (!validDueAt(value.dueAt ?? null)) fail('PLANNER_INVALID');
  return {
    id: typeof value.id === 'string' && value.id.trim() ? text(value.id, 200) : randomUUID(),
    title: text(value.title, 300),
    schedule,
    ...(fixed ? {startAt, endAt} : {}),
    date,
    slotId,
    reference: reference(value.reference),
    plannedMinutes: minutes(value.plannedMinutes),
    actualMinutes: minutes(value.actualMinutes),
    dueAt: value.dueAt || null,
  };
};

const legacySlots = (value, used = new Set()) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PLANNER_CORRUPT');
  const id = typeof value.id === 'string' && value.id ? value.id : randomUUID();
  if (used.has(id)) fail('PLANNER_CORRUPT');
  used.add(id);
  return { id, name: typeof value.name === 'string' ? value.name.slice(0, 40) : '时段', start: null, end: null };
};

const legacyEntries = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PLANNER_CORRUPT');
  return { ...value, plannedMinutes: value.plannedMinutes ?? null, actualMinutes: value.actualMinutes ?? null, dueAt: value.dueAt ?? null };
};

export const defaultSlots = () => [
  { id: 'slot-morning', name: '上午核心时间', start: '09:00', end: '12:00' },
  { id: 'slot-afternoon', name: '午休后', start: '14:00', end: '16:00' },
  { id: 'slot-evening', name: '晚间自由时间', start: '20:00', end: '22:00' },
  { id: 'slot-flex', name: '临时碎片时间', start: null, end: null },
];

/** One personal planner per configured DSH data directory. Serialized atomic commits; UI never claims an unsaved edit. */
export class PlannerStore {
  constructor(directory) { this.path = join(directory, 'semantic-planner.json'); this.directory = directory; this.queue = Promise.resolve(); }

  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let saved;
    try { saved = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') fail('PLANNER_CORRUPT');
      this.state = this.#fresh(); return;
    }
    if (!saved || typeof saved !== 'object' || !Array.isArray(saved.slots) || !Array.isArray(saved.entries)) fail('PLANNER_CORRUPT');
    if (saved.version === 1) {
      const used = new Set(), slots = saved.slots.map(item => legacySlots(item, used));
      this.state = { version: 2, revision: Number.isInteger(saved.revision) ? saved.revision : 0, slots,
        entries: saved.entries.map(legacyEntries),
        undo: (Array.isArray(saved.undo) ? saved.undo : []).slice(-30).map(snapshot => {
          const seen = new Set();
          return { label: typeof snapshot?.label === 'string' ? snapshot.label : '旧版本操作',
            slots: (snapshot?.slots ?? []).map(item => legacySlots(item, seen)), entries: (snapshot?.entries ?? []).map(legacyEntries) };
        }) };
      return;
    }
    if (saved.version !== 2) fail('PLANNER_VERSION');
    this.state = { version: 2, revision: Number.isInteger(saved.revision) ? saved.revision : 0,
      slots: saved.slots, entries: saved.entries, undo: Array.isArray(saved.undo) ? saved.undo : [] };
  }

  #fresh() { return { version: 2, revision: 0, slots: defaultSlots(), entries: [], undo: [] }; }

  read() {
    const undo = this.state.undo.at(-1);
    return { version: this.state.version, revision: this.state.revision, slots: this.state.slots, entries: this.state.entries.map(item => ({schedule: 'flexible', ...item})),
      canUndo: this.state.undo.length > 0, undoLabel: undo?.label ?? '' };
  }

  change(input) {
    const operation = this.queue.then(async () => {
      if (!input || input.revision !== this.state.revision) fail('PLANNER_CONFLICT');
      const previous = this.state, next = structuredClone(previous);
      let label = '', undoneLabel = '';
      if (input.action === 'undo') {
        const saved = next.undo.pop();
        if (!saved) return this.read();
        next.slots = saved.slots; next.entries = saved.entries; undoneLabel = saved.label;
      } else {
        if (input.action === 'save') {
          const current = next.entries.find(item => item.id === input.entry?.id);
          const previousTiming = current?.schedule === 'fixed' && input.entry.schedule === undefined
            ? {schedule: current.schedule, startAt: current.startAt, endAt: current.endAt} : {};
          const value = entry({ ...input.entry, ...previousTiming }, next.slots);
          if (input.entry.id && !current) fail('PLANNER_MISSING');
          if (current && next.entries.some(item => item.id === value.id && item !== current)) fail('PLANNER_INVALID');
          if (current) {
            if (value.schedule === 'flexible' && (current.date !== value.date || current.slotId !== value.slotId)) {
              next.entries = moveEntries(next.entries, { id: value.id, date: value.date, slotId: value.slotId, beforeId: null });
            }
            next.entries[next.entries.findIndex(item => item.id === value.id)] = value;
            label = `调整「${value.title}」`;
          } else { next.entries.push(value); label = `添加「${value.title}」`; }
        } else if (input.action === 'move') {
          const current = next.entries.find(item => item.id === input.id);
          if (!current) fail('PLANNER_MISSING');
          if (current.schedule === 'fixed') fail('PLANNER_FIXED_EDIT_REQUIRED');
          if (!validDate(input.date) || !next.slots.some(item => item.id === input.slotId)) fail('PLANNER_INVALID');
          next.entries = moveEntries(next.entries, { id: input.id, date: input.date, slotId: input.slotId, beforeId: input.beforeId ?? null });
          label = `移动「${current.title}」`;
        } else if (input.action === 'reorder') {
          const current = next.entries.find(item => item.id === input.id);
          if (!current) fail('PLANNER_MISSING');
          if (current.schedule === 'fixed') fail('PLANNER_FIXED_EDIT_REQUIRED');
          if (input.direction !== -1 && input.direction !== 1) fail('PLANNER_INVALID');
          next.entries = reorderEntries(next.entries, input.id, input.direction);
          label = `调整「${current.title}」顺序`;
        } else if (input.action === 'delete') {
          const current = next.entries.find(item => item.id === input.id);
          if (!current) fail('PLANNER_MISSING');
          next.entries = next.entries.filter(item => item.id !== input.id);
          label = `删除「${current.title}」`;
        } else if (input.action === 'record') {
          const current = next.entries.find(item => item.id === input.id);
          if (!current) fail('PLANNER_MISSING');
          if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) fail('PLANNER_INVALID');
          current.actualMinutes = Math.min(1440, (current.actualMinutes ?? 0) + input.minutes);
          label = `记录「${current.title}」实际投入`;
        } else if (input.action === 'slots') {
          if (!Array.isArray(input.slots) || input.slots.length < 1 || input.slots.length > 12) fail('PLANNER_INVALID');
          const used = new Set();
          next.slots = input.slots.map(value => slot(value, used));
          // Keep plans when a period is removed: move them to the first period. The UI says so before saving.
          for (const item of next.entries) if (item.schedule !== 'fixed' && !next.slots.some(value => value.id === item.slotId)) item.slotId = next.slots[0].id;
          label = '更新时间段';
        } else fail('PLANNER_INVALID');
        next.undo.push({ label, slots: previous.slots, entries: previous.entries });
        next.undo = next.undo.slice(-30);
      }
      next.version = 2;
      next.revision++;
      await atomicJson(this.path, next);
      this.state = next;
      return { ...this.read(), ...(undoneLabel ? { undoneLabel } : {}) };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
