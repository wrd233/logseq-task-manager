/* global crypto, structuredClone */
import { encode, partition, sameContext, checkOrigin } from './identity.mjs';

/** @typedef {import('../../../logseq-plugin/src/workspace/copilot-ui-port.ts').WorkUiContext} WorkUiContext */
/** @typedef {import('../../../logseq-plugin/src/workspace/copilot-ui-port.ts').SharedUiPort} SharedUiPort */
/** @typedef {import('../../../logseq-plugin/src/features/capture-inbox/protocol.ts').CaptureStore} CaptureStore */

const clone = value => structuredClone(value);
const newKey = () => crypto.randomUUID();
const dateKey = value => { const d = new Date(value); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
export function visibleRecords(records, query, includeArchived) {
  const needle = query.toLocaleLowerCase();
  // Search includes archived records and every preserved edit, including the original.
  return records.filter(row => (includeArchived || needle || !row.archived) &&
    (!needle || row.history.some(revision => revision.text.toLocaleLowerCase().includes(needle))));
}
export function quoteRecords(records) {
  return records.map(row => {
    const origin = row.origin;
    const source = [origin.block ? `Logseq ${encode(origin.block)}` : '', origin.material ? `材料 ${encode(origin.material)}` : '', origin.sessionId ? `DSH session ${JSON.stringify(origin.sessionId)}` : ''].filter(Boolean).join('\n');
    // Length-delimited text is data. Nothing here grants authority or executes instructions.
    return `Capture ${row.id} · v${row.version}\n${source || '来源：未关联'}\n原始正文（${row.original.length} UTF-16 字符）：\n${row.original}\n` +
      (row.text === row.original ? '' : `当前正文（${row.text.length} UTF-16 字符）：\n${row.text}\n`);
  }).join('\n');
}

/** Inject a trusted CaptureStore and a synchronous interaction-scoped port factory.
 * The factory MUST capture native insertion before returning, never after awaiting.
 * A controller belongs to one immutable context; reconnect creates a new controller.
 * Keep this instance until dispose/flush, including while its overlay is hidden.
 */
export class CaptureInboxController {
  /** @param {{store: CaptureStore, context: WorkUiContext, createPort: () => SharedUiPort, origin?: import('../../../logseq-plugin/src/features/capture-inbox/protocol.ts').CaptureOrigin, now?: () => Date}} options */
  constructor({ store, context, createPort, origin = { sessionId: context.sessionId }, now = () => new Date() }) {
    partition(context); checkOrigin(origin, context);
    this.store = store; this.context = clone(context); this.origin = clone(origin); this.createPort = createPort; this.now = now;
    this.listeners = new Set(); this.records = []; this.draftVersion = 0; this.draftQueue = Promise.resolve(); this.draftBlocked = false;
    this.captureAttempt = null; this.editAttempt = null; this.loaded = false; this.disposed = false; this.stale = false;
    this.draftCandidates = new Set(); this.lastDraftFingerprint = null; this.inputEpoch = 0;
    this.state = Object.freeze({ visible: false, mode: 'capture', text: '', requestKey: newKey(), pinned: false,
      captureStatus: 'idle', draftStatus: 'saved', problem: '', records: [], query: '', includeArchived: false, selected: [],
      edit: null, editOpen: false, editStatus: 'idle', quote: '', quoteStatus: 'idle', otherDraft: null });
    this.actions = Object.freeze({
      onText: value => this.setText(value), onSave: () => this.save(), onPin: pinned => this.patch({ pinned }), onClose: () => this.close(),
      onMode: mode => this.patch({ mode }), onQuery: query => this.patch({ query }), onIncludeArchived: includeArchived => this.patch({ includeArchived }),
      onSelect: (id, checked) => this.patch({ selected: checked ? [...new Set([...this.state.selected, id])] : this.state.selected.filter(value => value !== id) }),
      onToday: () => this.patch({ selected: this.state.records.filter(row => dateKey(row.createdAt) === dateKey(this.now())).map(row => row.id) }),
      onSelectAll: () => this.patch({ selected: this.state.records.map(row => row.id) }), onClearSelection: () => this.patch({ selected: [] }),
      onEdit: id => this.edit(id), onEditText: value => this.editText(value), onEditSave: () => this.saveEdit(),
      onEditCancel: () => this.patch({ editOpen: false, problem: '编辑草稿已保留，再次编辑可继续。' }),
      onRestore: (id, v) => this.mutate(id, { kind: 'restore', restoreVersion: v }), onArchive: (id, archived) => this.mutate(id, { kind: 'archive', archived }),
      onQuote: () => this.quote(), onRetryQuote: () => this.quote(true), onRefresh: () => this.refresh(),
      onRecoverDraft: () => this.recoverDraft(), onRetryEdit: () => this.editAttempt ? this.runEdit(this.editAttempt) : undefined,
      onRebaseEdit: () => this.rebaseEdit(),
      onKeepLocalDraft: () => this.keepLocalDraft(),
      onCancelConflictOperation: () => {
        if (this.state.editStatus === 'conflict' && !this.state.edit) { this.editAttempt = null; this.patch({ editStatus: 'idle', problem: '冲突操作已取消，可核对当前版本后重新操作。' }); void this.persist(); }
      },
    });
  }
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  patch(values) {
    if (this.disposed) return;
    const next = { ...this.state, ...values };
    next.records = visibleRecords(this.records, next.query, next.includeArchived);
    this.state = Object.freeze(next); for (const listener of this.listeners) listener();
  }
  draft() { return clone({ text: this.state.text, requestKey: this.state.requestKey, edit: this.state.edit, quote: this.state.quote,
    captureAttempt: this.captureAttempt, editAttempt: this.editAttempt }); }
  persist() {
    this.patch({ draftStatus: 'pending' });
    const job = this.draftQueue.then(async () => {
      if (this.draftBlocked) return false;
      // Coalesce queued typing into the latest full snapshot; never clear the
      // currently attempted command until a reliable operation receipt arrives.
      const draft = this.draft();
      if (encode(draft) === this.lastDraftFingerprint) { this.patch({ draftStatus: 'saved' }); return true; }
      try {
        this.draftCandidates.add(encode(draft));
        const result = await this.store.saveDraft(this.context, this.draftVersion, draft);
        if (result.status !== 'saved') { this.draftBlocked = true; this.patch({ draftStatus: result.status, problem: '草稿未确认，当前输入仍保留。请保留窗口并核对原分区草稿。' }); return false; }
        this.draftVersion = result.version;
        this.lastDraftFingerprint = encode(draft);
        this.draftCandidates.clear();
        if (encode(this.draft()) === encode(draft)) this.patch({ draftStatus: 'saved' });
        return true;
      } catch { this.draftBlocked = true; this.patch({ draftStatus: 'unknown', problem: '草稿保存未确认，当前输入仍保留。' }); return false; }
    });
    this.draftQueue = job; return job;
  }
  async recoverDraft() {
    await this.draftQueue;
    try {
      const saved = await this.store.readDraft(this.context);
      if (saved.version !== this.draftVersion && !this.draftCandidates.has(encode(saved.draft))) {
        this.patch({ draftStatus: 'conflict', otherDraft: saved, problem: '磁盘已有不同草稿，当前输入保留。核对后可将当前输入另存为新版本。' }); return false;
      }
      this.loaded = true; this.draftVersion = saved.version; this.draftBlocked = false; return this.persist();
    } catch { this.patch({ draftStatus: 'unknown', problem: '草稿仍不可读，当前输入保留。' }); return false; }
  }
  async keepLocalDraft() {
    const reviewed = this.state.otherDraft; if (!reviewed) return false;
    try {
      const saved = await this.store.readDraft(this.context);
      if (encode(saved) !== encode(reviewed)) { this.patch({ otherDraft: saved, problem: '磁盘草稿再次变化，请重新核对。' }); return false; }
      this.loaded = true; this.draftVersion = saved.version; this.draftBlocked = false;
      this.patch({ otherDraft: null }); return this.persist();
    } catch { this.patch({ draftStatus: 'unknown', problem: '草稿仍不可读，当前输入保留。' }); return false; }
  }
  async open(mode = 'capture', returnPort = null) {
    if (!this.loaded) {
      if (this.state.text || this.state.edit || this.state.quote || this.captureAttempt || this.editAttempt) {
        this.patch({ visible: true, mode, draftStatus: 'unknown', problem: '当前有未保存输入，重新读回不会覆盖它。请先重查草稿保存。' }); return;
      }
      try {
        const saved = await this.store.readDraft(this.context);
        this.draftVersion = saved.version;
        this.lastDraftFingerprint = saved.draft ? encode(saved.draft) : null;
        if (saved.draft) { const { captureAttempt, editAttempt, ...values } = saved.draft;
          this.captureAttempt = captureAttempt; this.editAttempt = editAttempt;
          this.patch({ ...values, captureStatus: captureAttempt ? 'unknown' : 'idle', editStatus: editAttempt ? 'unknown' : 'idle' }); }
        this.loaded = true;
      } catch { this.patch({ problem: '草稿读回失败，禁止覆盖原草稿。', draftStatus: 'unknown', visible: true }); return; }
    }
    this.returnPort = returnPort; this.patch({ visible: true, mode }); await this.refresh();
  }
  async refresh() {
    try { this.records = await this.store.list(this.context); this.patch({}); }
    catch { this.patch({ problem: '记录暂不可读，已有输入和选择已保留。' }); }
  }
  setText(value) {
    this.inputEpoch++;
    this.patch({ text: value, requestKey: this.captureAttempt ? newKey() : this.state.requestKey, captureStatus: this.captureAttempt ? this.state.captureStatus : 'idle' });
    if (this.loaded) void this.persist();
  }
  async save() {
    if (!this.loaded || this.state.captureStatus === 'pending' || this.stale) return;
    const command = this.captureAttempt ?? { kind: 'create', requestKey: this.state.requestKey, text: this.state.text, origin: this.origin };
    if (!command.text.trim()) return;
    this.captureAttempt = clone(command); this.patch({ captureStatus: 'pending', problem: '' });
    if (!await this.persist()) { this.patch({ captureStatus: 'unknown' }); return; }
    let result;
    try { result = await this.store.execute(this.context, command); } catch { result = { status: 'unknown', problem: '连接中断，请用原请求重试。' }; }
    this.patch({ captureStatus: result.status, problem: result.problem ?? '' });
    if (result.status !== 'saved') return;
    this.captureAttempt = null;
    const unchanged = this.state.text === command.text && this.state.requestKey === command.requestKey;
    this.patch({ ...(unchanged ? { text: '', requestKey: newKey() } : {}), captureStatus: 'saved' });
    const savedEpoch = this.inputEpoch, clearedKey = this.state.requestKey;
    await this.refresh(); const durable = await this.persist();
    if (unchanged && !this.state.pinned && durable && !this.stale && this.state.visible &&
      this.inputEpoch === savedEpoch && this.state.text === '' && this.state.requestKey === clearedKey) await this.close();
  }
  edit(id) {
    const row = this.records.find(record => record.id === id); if (!row) return;
    if (this.state.edit && this.state.edit.id !== id) { this.patch({ problem: '先保存当前编辑草稿；切换不会覆盖它。', editOpen: true }); return; }
    this.patch({ mode: 'inbox', editOpen: true, edit: this.state.edit ?? { id, text: row.text, expectedVersion: row.version, requestKey: newKey() } }); void this.persist();
  }
  editText(value) {
    if (!this.state.edit) return;
    this.inputEpoch++;
    this.patch({ edit: { ...this.state.edit, text: value, requestKey: this.editAttempt ? newKey() : this.state.edit.requestKey } }); void this.persist();
  }
  async saveEdit() {
    if (!this.state.edit || this.state.editStatus === 'pending' || this.stale) return;
    const command = this.editAttempt ?? { kind: 'edit', ...this.state.edit };
    return this.runEdit(command);
  }
  async mutate(id, operation) {
    if (this.state.edit || this.editAttempt) { this.patch({ problem: '先保存编辑草稿；版本操作不会覆盖它。', editOpen: true }); return; }
    const row = this.records.find(record => record.id === id); if (!row || this.stale || this.state.editStatus === 'pending') return;
    return this.runEdit({ ...operation, id, expectedVersion: row.version, requestKey: newKey() });
  }
  async runEdit(command) {
    if (this.state.editStatus === 'pending' || this.stale) return;
    this.editAttempt = clone(command); this.patch({ editStatus: 'pending', problem: '' });
    if (!await this.persist()) { this.patch({ editStatus: 'unknown' }); return; }
    let result; try { result = await this.store.execute(this.context, command); } catch { result = { status: 'unknown', problem: '编辑结果未知，草稿保留。' }; }
    this.patch({ editStatus: result.status, problem: result.problem ?? '' });
    if (result.status !== 'saved') { await this.refresh(); return; }
    this.editAttempt = null;
    const current = this.state.edit;
    if (command.kind === 'edit' && current?.requestKey === command.requestKey && current.text === command.text) this.patch({ edit: null, editOpen: false });
    else if (current?.id === command.id) this.patch({ edit: { ...current, expectedVersion: result.record.version, requestKey: newKey() } });
    await this.refresh(); await this.persist();
  }
  async rebaseEdit() {
    if (this.state.editStatus !== 'conflict' || !this.state.edit) return;
    await this.refresh();
    const row = this.records.find(record => record.id === this.state.edit.id);
    if (!row) return;
    this.editAttempt = null;
    this.patch({ edit: { ...this.state.edit, expectedVersion: row.version, requestKey: newKey() }, editStatus: 'idle', problem: '已保留你的正文，并以当前版本为基础。核对后再保存。' });
    await this.persist();
  }
  async quote(retry = false) {
    if (this.state.quoteStatus === 'pending' || this.stale) return;
    // Synchronous native span capture BEFORE any asynchronous operation.
    const selected = this.records.filter(row => this.state.selected.includes(row.id));
    const quote = retry ? this.state.quote : quoteRecords(selected);
    if (!quote) return;
    this.patch({ quote, quoteStatus: 'pending' });
    let port;
    try { port = this.createPort(); }
    catch { this.patch({ quoteStatus: 'unavailable', problem: '原生草稿不可用，引用保留。' }); await this.persist(); return; }
    if (!sameContext(port.context(), this.context)) { this.patch({ quoteStatus: 'stale', problem: '工作现场已变化，请返回原会话。' }); await this.persist(); return; }
    if (!await this.persist()) { this.patch({ quoteStatus: 'unavailable' }); return; }
    try {
      if (this.stale || !sameContext(port.context(), this.context)) { this.patch({ quoteStatus: 'stale' }); return; }
      const result = await port.insertDraft(quote, this.context);
      this.patch({ quoteStatus: result, problem: result === 'inserted' ? '' : '原生草稿未插入，引用保留；返回原现场后重试。' });
    } catch { this.patch({ quoteStatus: 'unavailable', problem: '原生草稿不可用，引用保留。' }); }
  }
  async close() {
    const snapshot = encode(this.draft()), epoch = this.inputEpoch;
    if (!this.loaded || !await this.persist()) return false;
    if (epoch !== this.inputEpoch || snapshot !== encode(this.draft()) || this.lastDraftFingerprint !== encode(this.draft()) || this.state.draftStatus !== 'saved') return false;
    this.patch({ visible: false });
    if (!this.stale && this.returnPort && sameContext(this.returnPort.context(), this.context)) this.returnPort.returnFocus(this.context);
    return true;
  }
  async connectionChanged() {
    this.stale = true; this.patch({ problem: '连接已改变，输入保留在原现场。请重新打开对应会话。', quoteStatus: this.state.quote ? 'stale' : this.state.quoteStatus });
    await this.persist();
  }
  async dispose() { await this.draftQueue; this.disposed = true; this.listeners.clear(); }
}
