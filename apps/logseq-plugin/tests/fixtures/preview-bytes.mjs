/** Test-only stock XHR byte transport. Callers provide actual filesystem bytes or
 * the byte representation stored in their synthetic filesystem, never a production fallback. */
export function installPreviewBytes(read) {
  const previous = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = class {
    status = 200; response = null; aborted = false;
    open(method, url) {if (method !== 'GET' || !url.startsWith('assets://')) throw Error('fixture only serves local original bytes'); this.path = decodeURIComponent(url.slice('assets://'.length));}
    send() {void Promise.resolve().then(() => read(this.path)).then(value => {if (this.aborted) return; const bytes = typeof value === 'string' ? new globalThis.TextEncoder().encode(value) : value; this.response = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice().buffer; this.onload?.();}).catch(() => {if (!this.aborted) this.onerror?.();});}
    abort() {this.aborted = true; this.onabort?.();}
  };
  return () => {if (previous) globalThis.XMLHttpRequest = previous; else delete globalThis.XMLHttpRequest;};
}
