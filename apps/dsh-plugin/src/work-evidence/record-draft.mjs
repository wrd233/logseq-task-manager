/** Mutable browser draft + immutable request. A failed/lost receipt retries the exact payload. */
export class RecordDraft {
  constructor(key, backup, createId = () => globalThis.crypto.randomUUID()) {
    this.key = key; this.backup = backup; this.createId = createId; this.listeners = new Set();
    this.state = { text: '', meta: {}, revision: 0, attempt: null, status: 'idle', backupFailed: false };
    try { const prior = backup?.read(); if (prior?.key === key && typeof prior.text === 'string' && prior.text.length <= 24000) this.state = { ...this.state, ...prior, status: prior.attempt ? 'unknown' : 'idle' }; }
    catch { this.state.backupFailed = true; }
  }
  subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getSnapshot = () => this.state;
  update(patch) {
    const next = { ...this.state, ...patch };
    try { this.backup?.write({ ...next, key: this.key }); next.backupFailed = false; } catch { next.backupFailed = true; }
    this.state = next; for (const fn of this.listeners) fn();
  }
  edit(text, meta = this.state.meta) { this.update({ text, meta, revision: this.state.revision + 1 }); }
  hasInput() { return !!this.state.text || !!this.state.attempt; }
  async save(payload, write) {
    if (this.state.status === 'saving') return null;
    const attempt = this.state.attempt ?? { payload: { ...payload, text: payload.text ?? this.state.text, requestId: this.createId() }, revision: this.state.revision };
    this.update({ attempt, status: 'saving' });
    try {
      const receipt = await write(attempt.payload);
      if (!receipt?.hash || receipt.value?.id !== attempt.payload.requestId || Object.entries(attempt.payload).some(([key,value]) => key !== 'requestId' && JSON.stringify(receipt.value[key]) !== JSON.stringify(value))) throw Error('INVALID_WORK_RECEIPT');
      const newer = this.state.revision !== attempt.revision || this.state.text !== attempt.payload.text;
      this.update({ attempt: null, status: 'saved', ...(!newer ? { text: '', meta: {} } : Array.isArray(attempt.payload.sourceEventIds) ? { meta: { ...this.state.meta, supersedesId: receipt.value.id } } : {}) });
      return receipt;
    } catch (error) {
      // The server explicitly refused this version before writing; let the retained answer target the new explanation.
      this.update(error.code === 'INTERPRETATION_CHANGED' ? { status: 'rejected', attempt: null } : { status: 'unknown', attempt }); throw error;
    }
  }
}
