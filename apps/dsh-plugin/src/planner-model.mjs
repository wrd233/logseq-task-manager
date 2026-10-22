export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function offsetDate(key, days) { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + days); return dateKey(d); }
export function visibleDates(mode, today) {
  if (mode === 'tomorrow') return [offsetDate(today, 1)];
  if (mode === 'week') { const day = new Date(`${today}T12:00:00`).getDay(); const monday = offsetDate(today, -(day + 6) % 7); return Array.from({ length: 7 }, (_, i) => offsetDate(monday, i)); }
  return [today];
}
export const dateLabel = key => new Date(`${key}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
