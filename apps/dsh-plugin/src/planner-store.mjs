/* global structuredClone */
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson } from '../../task-copilot-cli/src/workspace-files.ts';

const fail = code => { throw Object.assign(Error(code), { code }); };
const text = (value, max = 500) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail('PLANNER_INVALID');
export const defaultSlots = () => ['上午核心时间', '午休后', '晚上', '临时碎片时间'].map((name, i) => ({ id: `slot-${i}`, name }));
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) fail('PLANNER_INVALID');
  return value;
}
/** One personal planner per configured DSH data directory. Serialized atomic commits; UI never claims an unsaved edit. */
export class PlannerStore {
  constructor(directory) { this.path = join(directory, 'semantic-planner.json'); this.directory = directory; this.queue = Promise.resolve(); }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { this.state = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.state = { version: 1, revision: 0, slots: defaultSlots(), entries: [], undo: [] }; }
    if (this.state.version !== 1) fail('PLANNER_VERSION');
  }
  read() { const { undo, ...state } = this.state; return { ...state, canUndo: undo.length > 0 }; }
  change(input) {
    const operation = this.queue.then(async () => {
      if (input.revision !== this.state.revision) fail('PLANNER_CONFLICT');
      const previous = this.state, next = structuredClone(previous);
      if (input.action === 'undo') {
        const saved = next.undo.pop(); if (!saved) return this.read();
        next.slots = saved.slots; next.entries = saved.entries;
      } else {
        next.undo.push({ slots: previous.slots, entries: previous.entries }); next.undo = next.undo.slice(-20);
        if (input.action === 'save') {
          const item = input.entry;
          const entry = { id: item.id ?? randomUUID(), title: text(item.title), date: validDate(item.date), slotId: item.slotId, reference: item.reference ?? null };
          if (!next.slots.some(s => s.id === entry.slotId)) fail('PLANNER_INVALID');
          const index = next.entries.findIndex(e => e.id === entry.id);
          if (item.id && index < 0) fail('PLANNER_MISSING');
          if (index < 0) next.entries.push(entry); else next.entries[index] = entry;
        } else if (input.action === 'delete') {
          next.entries = next.entries.filter(e => e.id !== input.id);
        } else if (input.action === 'slots') {
          if (!Array.isArray(input.slots) || !input.slots.length || input.slots.length > 12) fail('PLANNER_INVALID');
          next.slots = input.slots.map(s => ({ id: s.id ?? randomUUID(), name: text(s.name, 40) }));
          if (new Set(next.slots.map(s => s.id)).size !== next.slots.length) fail('PLANNER_INVALID');
          // Keep plans when removing a period; the UI explains that they move to the first period.
          next.entries.forEach(e => { if (!next.slots.some(s => s.id === e.slotId)) e.slotId = next.slots[0].id; });
        } else fail('PLANNER_INVALID');
      }
      next.revision++;
      await atomicJson(this.path, next);
      this.state = next;
      return this.read();
    });
    this.queue = operation.catch(() => {}); return operation;
  }
}
