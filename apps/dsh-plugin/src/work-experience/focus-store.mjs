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
