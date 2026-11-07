/* Shared, host-neutral planner language: local calendar dates, durations, slot ranges and DSH handoff text. */

export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function offsetDate(key, days) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function visibleDates(mode, today) {
  if (mode === 'tomorrow') return [offsetDate(today, 1)];
  if (mode === 'week') {
    const day = new Date(`${today}T12:00:00`).getDay();
    const monday = offsetDate(today, -((day + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => offsetDate(monday, index));
  }
  return [today];
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function validDueAt(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10)) &&
    date.getHours() === Number(value.slice(11, 13)) && date.getMinutes() === Number(value.slice(14, 16));
}

const weekday = key => new Date(`${key}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' });
const monthDay = key => new Date(`${key}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });

export function dateLabel(key) { return `${monthDay(key)} ${weekday(key)}`; }

export function shortDateLabel(key) { return monthDay(key); }

export function relativeDateLabel(key, today) {
  if (key === today) return '今天';
  if (key === offsetDate(today, 1)) return '明天';
  if (key === offsetDate(today, -1)) return '昨天';
  return weekday(key);
}

export function durationLabel(minutes) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

export function compactMinutes(minutes) {
  if (minutes === null || minutes === undefined || minutes === 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, '0')}m` : `${hours}h`;
}

export function slotRangeLabel(slot) {
  return slot?.start && slot?.end ? `${slot.start}–${slot.end}` : '';
}

export function dueLabel(dueAt, today) {
  if (!dueAt) return '';
  const key = dueAt.slice(0, 10), time = dueAt.slice(11, 16);
  const day = key === today ? '今天' : key === offsetDate(today, 1) ? '明天' : monthDay(key);
  return `${day} ${time}`;
}

export const referenceKindLabel = kind => kind === 'PROJECT' ? 'Project' : kind === 'MINI_PROJECT' ? 'MiniProject' : kind === 'TASK' ? 'Task' : '工作';

/** Text placed in the native DSH composer. Human-meaningful only: no planner store, Graph path or formal-write instruction. */
export function handoffText(entry, slot, today) {
  const range = slotRangeLabel(slot);
  const lines = [`【时间规划】${dateLabel(entry.date)} · ${slot?.name ?? '未分时段'}${range ? `（${range}）` : ''}`, entry.title];
  if (entry.plannedMinutes !== null && entry.plannedMinutes !== undefined) lines.push(`计划投入 ${durationLabel(entry.plannedMinutes)}`);
  if (entry.actualMinutes) lines.push(`实际投入 ${durationLabel(entry.actualMinutes)}`);
  if (entry.dueAt) lines.push(`截止时间 ${dueLabel(entry.dueAt, today)}`);
  if (entry.reference) lines.push(`关联工作：${referenceKindLabel(entry.reference.kind)}「${entry.reference.title}」`);
  return `${lines.join('\n')}\n`;
}

/** Canonical entry order is the array order. Move removes first, then inserts before the requested card. */
export function moveEntries(entries, { id, date, slotId, beforeId }) {
  const entry = entries.find(item => item.id === id);
  if (!entry) return entries;
  const next = entries.filter(item => item.id !== id);
  const moved = { ...entry, date, slotId };
  let index = beforeId ? next.findIndex(item => item.id === beforeId) : -1;
  if (index < 0) {
    let last = -1;
    next.forEach((item, position) => { if (item.date === date && item.slotId === slotId) last = position; });
    index = last >= 0 ? last + 1 : next.length;
  }
  next.splice(index, 0, moved);
  return next;
}

export function reorderEntries(entries, id, direction) {
  const entry = entries.find(item => item.id === id);
  if (!entry) return entries;
  const group = entries.filter(item => item.date === entry.date && item.slotId === entry.slotId);
  const position = group.findIndex(item => item.id === id);
  const neighbour = group[position + direction];
  if (!neighbour) return entries;
  const next = [...entries];
  const from = next.findIndex(item => item.id === id), to = next.findIndex(item => item.id === neighbour.id);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function dayTotals(entries) {
  let planned = 0, actual = 0;
  for (const entry of entries) { planned += entry.plannedMinutes ?? 0; actual += entry.actualMinutes ?? 0; }
  return { planned, actual, count: entries.length };
}

/** Insert after the captured selection so existing draft text and chips stay intact. */
export function insertPlanDraft(inputActions, entry, slot, today) {
  const captured = inputActions.captureInsertion();
  const span = { ...captured, start: captured.end };
  return inputActions.insertText((span.start > 0 ? '\n' : '') + handoffText(entry, slot, today), span);
}
