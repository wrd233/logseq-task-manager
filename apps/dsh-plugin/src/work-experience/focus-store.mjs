/* One in-page work focus request. It changes the current Work tab's root; it never creates a Session. */
const requests = new Map(), listeners = new Set();
export const workFocus = {
  request(sessionId, uuid) {
    requests.set(sessionId, uuid);
    for (const listener of listeners) listener();
  },
  peek(sessionId) { return requests.get(sessionId); },
  take(sessionId) { const value = requests.get(sessionId); requests.delete(sessionId); return value; },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  dispose() { requests.clear(); listeners.clear(); },
};

const focusKey = sessionId => `task-copilot:work-focus:${sessionId}`;
export function readWorkFocus(sessionId, storage = globalThis.sessionStorage) {
  try { return storage?.getItem(focusKey(sessionId)) || null; } catch { return null; }
}
export function saveWorkFocus(sessionId, uuid, storage = globalThis.sessionStorage) {
  try {
    if (uuid) storage?.setItem(focusKey(sessionId), uuid);
    else storage?.removeItem(focusKey(sessionId));
  } catch { /* Location persistence is optional when browser storage is unavailable. */ }
}
