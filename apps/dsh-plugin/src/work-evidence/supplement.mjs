/** One observation's local input. Saved observations never own or clear this mutable text. */
export class SupplementDraft {
  constructor(context, createId = () => globalThis.crypto.randomUUID()) {
    this.context = Object.freeze({ ...context }); this.createId = createId;
    this.state = Object.freeze({ text: '', revision: 0, status: 'idle', attempt: null, receipt: null });
    this.listeners = new Set();
  }
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  update(patch) { this.state = Object.freeze({ ...this.state, ...patch }); for (const listener of this.listeners) listener(); }
  edit(text) { this.update({ text, revision: this.state.revision + 1 }); }
  hasUnconfirmedInput() { return !!this.state.text || !!this.state.attempt; }
  async save(write) {
    if (this.state.status === 'saving' || !this.state.attempt && !this.state.text.trim()) return null;
    const attempt = this.state.attempt ?? Object.freeze({ ...this.context, text: this.state.text, requestId: this.createId(), revision: this.state.revision });
    this.update({ status: 'saving', attempt });
    try {
      const payload = { ...this.context, text: attempt.text, requestId: attempt.requestId };
      const receipt = await write(payload);
      if (receipt?.value?.id !== attempt.requestId || receipt.value.scopeId !== attempt.scopeId || receipt.value.observationId !== attempt.observationId || receipt.value.text !== attempt.text.trim() || typeof receipt.hash !== 'string') throw Error('INVALID_NOTE_RECEIPT');
      const newerInput = this.state.revision !== attempt.revision;
      this.update({ status: 'saved', attempt: null, receipt, ...(!newerInput ? { text: '' } : {}) });
      return { receipt, newerInput };
    } catch {
      // A request can have committed even when its receipt was lost. Keep the exact key and payload.
      this.update({ status: 'unknown', attempt }); return null;
    }
  }
}
