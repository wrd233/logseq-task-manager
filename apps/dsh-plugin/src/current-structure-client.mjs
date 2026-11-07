/* global AbortController, setInterval, clearInterval */

/** One foreground projection per mounted view. Call refresh after a saved source write. */
export function observeCurrentStructure(rpc, {sessionId, focusUuid}, onEvent, intervalMs = 5000) {
  const controller = new AbortController();
  let active = false, queued = false, version = null;
  async function refresh() {
    if (controller.signal.aborted) return;
    if (active) { queued = true; return; }
    active = true;
    try {
      const value = await rpc('currentStructure', {sessionId, ...(focusUuid ? {focusUuid} : {})}, controller.signal);
      const next = JSON.stringify([value.sourceSetVersion, value.structureVersion, value.path, value.root, value.children, value.content]);
      if (!controller.signal.aborted && next !== version) {
        version = next;
        onEvent({type: 'currentStructure.changed', value});
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        version = null;
        onEvent({type: 'currentStructure.unavailable', error});
      }
    } finally {
      active = false;
      if (queued) { queued = false; void refresh(); }
    }
  }
  const timer = setInterval(refresh, intervalMs);
  void refresh();
  return {refresh, dispose() { clearInterval(timer); controller.abort(); }};
}
