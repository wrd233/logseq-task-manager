/** One observation's local input. Saved observations never own or clear this mutable text. */
export class SupplementDraft {
  constructor(context, createId = () => globalThis.crypto.randomUUID(), backup) {
    this.context = Object.freeze({ ...context }); this.createId = createId; this.backup = backup;
    this.state = Object.freeze({ text: '', revision: 0, status: 'idle', attempt: null, receipt: null, editingId: null, backupFailed: false });
    this.listeners = new Set();
    try {
      const saved = backup?.read();
      if (saved && typeof saved.text === 'string' && saved.text.length <= 2000 && Number.isSafeInteger(saved.revision) && (saved.editingId === null || typeof saved.editingId === 'string')) {
        const a = saved.attempt;
        const attempt = a && a.scopeId === context.scopeId && a.observationId === context.observationId && typeof a.text === 'string' && a.text.length <= 2000 && /^[a-f\d-]{36}$/u.test(a.requestId) && Number.isSafeInteger(a.revision) ? Object.freeze(a) : null;
        this.state = Object.freeze({ ...this.state, text: saved.text, revision: saved.revision, editingId: saved.editingId, attempt, status: attempt ? 'unknown' : 'idle' });
      }
    } catch { this.state = Object.freeze({ ...this.state, backupFailed: true }); }
  }
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  update(patch) {
    let next = { ...this.state, ...patch };
    try { this.backup?.write({ text: next.text, revision: next.revision, attempt: next.attempt, editingId: next.editingId }); next.backupFailed = false; }
    catch { next.backupFailed = true; }
    this.state = Object.freeze(next); for (const listener of this.listeners) listener();
  }
  edit(text) { this.update({ text, revision: this.state.revision + 1 }); }
  beginEdit(note) {
    if (this.hasUnconfirmedInput()) return false;
    this.update({ text: note.text, editingId: note.id, revision: this.state.revision + 1, status: 'idle' }); return true;
  }
  cancel() {
    if (this.state.attempt) return false;
    this.update({ text: '', editingId: null, revision: this.state.revision + 1, status: 'idle' }); return true;
  }
  hasUnconfirmedInput() { return !!this.state.text || !!this.state.attempt; }
  async save(write) {
    if (this.state.status === 'saving' || !this.state.attempt && !this.state.text.trim()) return null;
    const attempt = this.state.attempt ?? Object.freeze({ ...this.context, text: this.state.text, requestId: this.createId(), revision: this.state.revision, ...(this.state.editingId ? { supersedesId: this.state.editingId } : {}) });
    this.update({ status: 'saving', attempt });
    try {
      const payload = { ...this.context, text: attempt.text, requestId: attempt.requestId, ...(attempt.supersedesId ? { supersedesId: attempt.supersedesId } : {}) };
      const receipt = await write(payload);
      if (receipt?.value?.id !== attempt.requestId || receipt.value.scopeId !== attempt.scopeId || receipt.value.observationId !== attempt.observationId || receipt.value.text !== attempt.text.trim() || receipt.value.supersedesId !== attempt.supersedesId || typeof receipt.hash !== 'string') throw Error('INVALID_NOTE_RECEIPT');
      const newerInput = this.state.revision !== attempt.revision;
      this.update({ status: 'saved', attempt: null, receipt, editingId: newerInput && attempt.supersedesId ? receipt.value.id : null, ...(!newerInput ? { text: '' } : {}) });
      return { receipt, newerInput };
    } catch {
      // The write may have committed even when the receipt was lost. Retry the exact key and payload.
      this.update({ status: 'unknown', attempt }); return null;
    }
  }
}
