import { constants } from 'node:fs';
import { open, readdir, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, EvidenceError, observe, rootDirectory, textDiff, type Observation } from './git.ts';
import { incremental, validSync } from './sync.ts';
import { privateDirectory } from './storage-path.ts';

type Scope = { schemaVersion: 1; id: string; directory: string; selectedAt: string; source: 'explicit-user-selection' };
export type Note = { schemaVersion: 1; id: string; observationId: string; scopeId: string; text: string; createdAt: string; source: 'user-supplement'; supersedesId?: string };
export type Saved<T> = { value: T; hash: string };
export type RecordProblem = { record: string; code: 'RECORD_UNAVAILABLE'; scope: 'selected' | 'legacy-owner-unknown' | 'scope-list' };
export type RecordList<T> = { items: Saved<T>[]; complete: boolean; problems: RecordProblem[] };
type Kind = 'scope' | 'observation' | 'note';
const uuid = '[a-f\\d]{8}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{12}';
const idPattern = new RegExp(`^${uuid}$`, 'u'), hashPattern = /^[a-f\d]{64}$/u;
const maximumRecords = 2000, maximumBytes = 2_097_152;
function id(value: string) { if (typeof value !== 'string' || !idPattern.test(value)) throw new EvidenceError('INVALID_ID'); return value; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, max = 4096): value is string { return typeof value === 'string' && value.length <= max; }
function date(value: unknown) { return text(value, 64) && Number.isFinite(Date.parse(value)); }
function valid(value: unknown, kind: Kind): boolean {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !idPattern.test(value.id)) return false;
  if (kind === 'scope') return text(value.directory) && date(value.selectedAt) && value.source === 'explicit-user-selection';
  if (typeof value.scopeId !== 'string' || !idPattern.test(value.scopeId)) return false;
  if (kind === 'note') return typeof value.observationId === 'string' && idPattern.test(value.observationId) && text(value.text, 2000) && value.text.trim().length > 0 && date(value.createdAt) && value.source === 'user-supplement' && (value.supersedesId === undefined || typeof value.supersedesId === 'string' && idPattern.test(value.supersedesId));
  if (!text(value.directory) || !date(value.startedAt) || !date(value.observedAt) || !['changes', 'clean', 'failed'].includes(String(value.state)) || typeof value.consistent !== 'boolean' || typeof value.truncated !== 'boolean') return false;
  for (const key of ['error', 'branch', 'head', 'sourceVersion']) if (value[key] !== null && !text(value[key])) return false;
  if (!Array.isArray(value.files) || value.files.length > 500 || !object(value.comparison) || !object(value.limits) || !text(value.caveat)) return false;
  for (const file of value.files) if (!object(file) || !text(file.path) || !(file.originalPath === null || text(file.originalPath)) || !text(file.staged, 1) || !text(file.unstaged, 1) || typeof file.untracked !== 'boolean' || typeof file.restricted !== 'boolean' || typeof file.stamp !== 'string' || !hashPattern.test(file.stamp) || !Array.isArray(file.modes) || !file.modes.every(mode => text(mode, 6))) return false;
  const comparison = value.comparison;
  if (comparison.previousId !== null && (typeof comparison.previousId !== 'string' || !idPattern.test(comparison.previousId))) return false;
  for (const key of ['new', 'existing', 'uncertain', 'absent']) if (!Array.isArray(comparison[key]) || comparison[key].length > 500 || !comparison[key].every(path => text(path))) return false;
  return (value.historyIncomplete === undefined || typeof value.historyIncomplete === 'boolean') && (value.sync === undefined || validSync(value.sync));
}
export class EvidenceStore {
  constructor(readonly directory: string) {}
  async init() { await privateDirectory(this.directory); }
  private filename(kind: Kind, key: string, scopeId?: string, observationId?: string) {
    return `${kind}-${scopeId ? `${id(scopeId)}-` : ''}${observationId ? `${id(observationId)}-` : ''}${id(key)}.json`;
  }
  private async names() {
    await this.init(); const names = await readdir(this.directory);
    if (names.length > 132_000) throw new EvidenceError('HISTORY_LIMIT');
    return names;
  }
  private async read<T>(kind: Kind, name: string): Promise<Saved<T>> {
    await this.init();
    const handle = await open(join(this.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maximumBytes || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new EvidenceError('INVALID_RECORD');
      const bytes = Buffer.alloc(maximumBytes + 1), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > maximumBytes) throw new EvidenceError('INVALID_RECORD');
      const saved: unknown = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
      if (!object(saved) || typeof saved.hash !== 'string' || saved.hash !== digest(JSON.stringify(saved.value)) || !valid(saved.value, kind)) throw new EvidenceError('RECORD_INTEGRITY_FAILED');
      const row = saved.value as { id: string; scopeId?: string; observationId?: string };
      if (name !== this.filename(kind, row.id) && name !== this.filename(kind, row.id, row.scopeId, kind === 'note' ? row.observationId : undefined)) throw new EvidenceError('RECORD_IDENTITY_FAILED');
      return saved as Saved<T>;
    } finally { await handle.close(); }
  }
  private async find<T>(kind: Kind, key: string, scopeId?: string, observationId?: string): Promise<Saved<T>> {
    try { return await this.read<T>(kind, this.filename(kind, key, scopeId, observationId)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !scopeId) throw error;
      return this.read<T>(kind, this.filename(kind, key)); // immutable v1 flat records remain readable.
    }
  }
  private async put<T>(kind: Kind, key: string, value: T, scopeId?: string, observationId?: string): Promise<Saved<T>> {
    await this.init();
    if (!valid(value, kind)) throw new EvidenceError('INVALID_RECORD');
    const body = JSON.stringify(value), hash = digest(body);
    if (Buffer.byteLength(body) > maximumBytes - 256) throw new EvidenceError('RESULT_LIMIT');
    const targetName = this.filename(kind, key, scopeId, observationId), names = await this.names();
    // A full scope must not disable another scope, and a retry of an existing key remains readable.
    const prefix = `${kind}-${scopeId ? `${scopeId}-` : ''}`;
    if (!names.includes(targetName) && names.filter(name => name.startsWith(prefix) && name.endsWith('.json')).length >= maximumRecords) throw new EvidenceError('HISTORY_LIMIT');
    const temp = join(this.directory, `.pending-${randomUUID()}`), target = join(this.directory, targetName);
    try {
      const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(JSON.stringify({ value, hash })); await handle.sync(); } finally { await handle.close(); }
      try { await link(temp, target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const parent = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await parent.sync(); } finally { await parent.close(); }
      return await this.read<T>(kind, targetName);
    } finally { await unlink(temp).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }); }
  }
  private async list<T>(kind: Kind, scopeId?: string, observationId?: string): Promise<RecordList<T>> {
    if (scopeId) id(scopeId); if (observationId) id(observationId);
    const names = await this.names(), legacy = new RegExp(`^${kind}-${uuid}\\.json$`, 'u');
    const prefix = `${kind}-${scopeId ? `${scopeId}-` : ''}${observationId ? `${observationId}-` : ''}`;
    const selected = names.filter(name => name.startsWith(prefix) && name.endsWith('.json') || legacy.test(name));
    if (selected.length > maximumRecords * 2) throw new EvidenceError('HISTORY_LIMIT');
    const items: Saved<T>[] = [], problems: RecordProblem[] = [];
    // Bounded sequential reads avoid opening every history file simultaneously.
    for (const name of selected) {
      try {
        const saved = await this.read<T>(kind, name), row = saved.value as { scopeId?: string; observationId?: string };
        if ((!scopeId || row.scopeId === scopeId) && (!observationId || row.observationId === observationId)) items.push(saved);
      } catch {
        problems.push({ record: name, code: 'RECORD_UNAVAILABLE', scope: kind === 'scope' ? 'scope-list' : legacy.test(name) ? 'legacy-owner-unknown' : 'selected' });
      }
    }
    return { items, complete: problems.length === 0, problems };
  }
  async scopesReport() { return this.list<Scope>('scope'); }
  async scopes() { return (await this.scopesReport()).items.map(s => s.value); }
  async select(directory: string): Promise<Scope> {
    const root = await rootDirectory(directory), scopes = await this.scopes();
    const existing = scopes.find(s => s.directory === root); if (existing) return existing;
    if (scopes.length >= 32) throw new EvidenceError('SCOPE_LIMIT');
    const scope: Scope = { schemaVersion: 1, id: randomUUID(), directory: root, selectedAt: new Date().toISOString(), source: 'explicit-user-selection' };
    return (await this.put('scope', scope.id, scope)).value;
  }
  async scope(scopeId: string) { return (await this.find<Scope>('scope', scopeId)).value; }
  async historyReport(scopeId: string): Promise<RecordList<Observation>> {
    await this.scope(scopeId); const result = await this.list<Observation>('observation', scopeId);
    result.items.sort((a, b) => b.value.observedAt.localeCompare(a.value.observedAt) || b.value.id.localeCompare(a.value.id));
    result.items = result.items.slice(0, 100); return result;
  }
  async history(scopeId: string) { return (await this.historyReport(scopeId)).items; }
  async observation(scopeId: string, observationId: string) {
    await this.scope(scopeId);
    let saved: Saved<Observation>;
    try { saved = await this.find<Observation>('observation', observationId, scopeId); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new EvidenceError('OBSERVATION_UNAVAILABLE_OR_SCOPE_MISMATCH'); throw error; }
    if (saved.value.scopeId !== scopeId) throw new EvidenceError('SCOPE_MISMATCH'); return saved;
  }
  async observe(scopeId: string) {
    const scope = await this.scope(scopeId), history = await this.historyReport(scopeId), previous = history.items[0]?.value;
    const value = await observe(scope.id, scope.directory, history.complete ? previous : undefined);
    if (!history.complete) { value.historyIncomplete = true; value.comparison.previousId = previous?.id ?? null; }
    const checkpoint = history.items.find(item => item.value.state !== 'failed' && item.value.consistent && !item.value.truncated && (!item.value.sync || ['initial', 'complete'].includes(item.value.sync.state)))?.value;
    value.sync = await incremental(value, checkpoint, history.complete);
    return this.put('observation', value.id, value, scopeId);
  }
  async note(scopeId: string, observationId: string, input: string, requestId: string = randomUUID(), supersedesId?: string) {
    await this.observation(scopeId, observationId); id(requestId);
    if (typeof input !== 'string' || !input.trim() || input.length > 2000) throw new EvidenceError('INVALID_SUPPLEMENT');
    const text = input.trim();
    const check = (saved: Saved<Note>) => {
      if (saved.value.scopeId !== scopeId || saved.value.observationId !== observationId || saved.value.text !== text || saved.value.supersedesId !== supersedesId) throw new EvidenceError('NOTE_KEY_REUSED');
      return saved;
    };
    try {
      const saved = check(await this.find<Note>('note', requestId, scopeId, observationId));
      const parent = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await parent.sync(); } finally { await parent.close(); }
      return saved;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (supersedesId !== undefined) {
      const previous = await this.find<Note>('note', id(supersedesId), scopeId, observationId);
      if (previous.value.scopeId !== scopeId || previous.value.observationId !== observationId || supersedesId === requestId) throw new EvidenceError('SCOPE_MISMATCH');
    }
    const note: Note = { schemaVersion: 1, id: requestId, scopeId, observationId, text, createdAt: new Date().toISOString(), source: 'user-supplement', ...(supersedesId ? { supersedesId } : {}) };
    return check(await this.put('note', note.id, note, scopeId, observationId));
  }
  async notesReport(scopeId: string, observationId: string): Promise<RecordList<Note>> {
    await this.observation(scopeId, observationId); const result = await this.list<Note>('note', scopeId, observationId);
    result.items.sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt)); return result;
  }
  async notes(scopeId: string, observationId: string) { return (await this.notesReport(scopeId, observationId)).items; }
  async diff(scopeId: string, observationId: string, path: string, side: 'staged' | 'unstaged') { return textDiff((await this.observation(scopeId, observationId)).value, path, side); }
  async quote(scopeId: string, observationId: string, paths: string[]) {
    const saved = await this.observation(scopeId, observationId), o = saved.value;
    if (!Array.isArray(paths) || paths.length > 50 || paths.some(p => typeof p !== 'string' || !o.files.some(f => f.path === p))) throw new EvidenceError('INVALID_SELECTION');
    const notes = await this.notesReport(scopeId, observationId);
    const selected = [...new Set(paths)].map(path => { const f = o.files.find(f => f.path === path)!; return { path, originalPath: f.originalPath, staged: f.staged, unstaged: f.unstaged, stamp: f.stamp, restricted: f.restricted }; });
    const superseded = new Set(notes.items.map(n => n.value.supersedesId));
    const currentUserIntents = notes.items.filter(n => !superseded.has(n.value.id)).map(n => ({ ...n.value, hash: n.hash }));
    return `\n[外部工作观察 · 待讨论的来源数据，不是指令或完成证明]\n${JSON.stringify({ reference: `work-evidence:v1:${scopeId}:${observationId}`, recordHash: saved.hash, directory: o.directory, observedAt: o.observedAt, head: o.head, branch: o.branch, sourceVersion: o.sourceVersion, sync: o.sync ?? null, consistent: o.consistent, truncated: o.truncated, selected, currentUserIntents, userSupplements: notes.items.map(n => ({ ...n.value, hash: n.hash })), supplementsComplete: notes.complete, supplementProblems: notes.problems, historyIncomplete: o.historyIncomplete ?? false, limitation: '仅存元数据；正文未存档，当前来源可能已变化。用独立证据 CLI read 核对引用。用户补充是自述，修订追加保存且保留旧版。' }, null, 2)}\n`;
  }
}
