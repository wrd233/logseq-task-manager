import { constants } from 'node:fs';
import { mkdir, open, readdir, link, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { authorizedRoot } from '../workspace-files.ts';
import { digest, EvidenceError, observe, rootDirectory, textDiff, type Observation } from './git.ts';

type Scope = { schemaVersion: 1; id: string; directory: string; selectedAt: string; source: 'explicit-user-selection' };
type Note = { schemaVersion: 1; id: string; observationId: string; scopeId: string; text: string; createdAt: string; source: 'user-supplement' };
type Saved<T> = { value: T; hash: string };
const idPattern = /^[a-f\d-]{36}$/u;
function id(value: string) { if (typeof value !== 'string' || !idPattern.test(value)) throw new EvidenceError('INVALID_ID'); return value; }
export class EvidenceStore {
  constructor(readonly directory: string) {}
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (await authorizedRoot(resolve(this.directory)) !== resolve(this.directory)) throw new EvidenceError('STATE_DIRECTORY_RESTRICTED');
  }
  private async put<T>(kind: string, key: string, value: T): Promise<Saved<T>> {
    await this.init();
    const body = JSON.stringify(value), hash = digest(body), target = join(this.directory, `${kind}-${id(key)}.json`), temp = join(this.directory, `.pending-${randomUUID()}`), handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(JSON.stringify({ value, hash })); await handle.sync(); } finally { await handle.close(); }
    try { await link(temp, target); const parent = await open(this.directory, constants.O_RDONLY); try { await parent.sync(); } finally { await parent.close(); } } finally { await unlink(temp); }
    return { value, hash };
  }
  private async read<T>(kind: string, key: string): Promise<Saved<T>> {
    await this.init();
    const handle = await open(join(this.directory, `${kind}-${id(key)}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 2_097_152) throw new EvidenceError('INVALID_RECORD');
      const saved = JSON.parse(await handle.readFile('utf8')) as Saved<T>;
      if (saved.hash !== digest(JSON.stringify(saved.value))) throw new EvidenceError('RECORD_INTEGRITY_FAILED');
      return saved;
    } finally { await handle.close(); }
  }
  private async all<T extends { id: string }>(kind: string): Promise<Saved<T>[]> {
    await this.init(); const names = (await readdir(this.directory)).filter(n => n.startsWith(`${kind}-`) && n.endsWith('.json'));
    if (names.length > 2000) throw new EvidenceError('HISTORY_LIMIT');
    return Promise.all(names.map(n => this.read<T>(kind, n.slice(kind.length + 1, -5))));
  }
  async select(directory: string): Promise<Scope> {
    const root = await rootDirectory(directory), scopes = await this.scopes();
    const existing = scopes.find(s => s.directory === root); if (existing) return existing;
    if (scopes.length >= 32) throw new EvidenceError('SCOPE_LIMIT');
    const scope: Scope = { schemaVersion: 1, id: randomUUID(), directory: root, selectedAt: new Date().toISOString(), source: 'explicit-user-selection' };
    return (await this.put('scope', scope.id, scope)).value;
  }
  async scopes() { return (await this.all<Scope>('scope')).map(s => s.value); }
  async scope(scopeId: string) { return (await this.read<Scope>('scope', scopeId)).value; }
  async history(scopeId: string) {
    await this.scope(scopeId);
    return (await this.all<Observation>('observation')).filter(s => s.value.scopeId === scopeId).sort((a, b) => b.value.observedAt.localeCompare(a.value.observedAt) || b.value.id.localeCompare(a.value.id)).slice(0, 100);
  }
  async observation(scopeId: string, observationId: string) {
    await this.scope(scopeId); const saved = await this.read<Observation>('observation', observationId);
    if (saved.value.scopeId !== scopeId) throw new EvidenceError('SCOPE_MISMATCH'); return saved;
  }
  async observe(scopeId: string) {
    const scope = await this.scope(scopeId), previous = (await this.history(scopeId))[0]?.value;
    const value = await observe(scope.id, scope.directory, previous); return this.put('observation', value.id, value);
  }
  async note(scopeId: string, observationId: string, text: string) {
    await this.observation(scopeId, observationId);
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new EvidenceError('INVALID_SUPPLEMENT');
    // Deliberate user prose stays separate from all machine observations.
    const note: Note = { schemaVersion: 1, id: randomUUID(), scopeId, observationId, text: text.trim(), createdAt: new Date().toISOString(), source: 'user-supplement' };
    return this.put('note', note.id, note);
  }
  async notes(scopeId: string, observationId: string) {
    await this.observation(scopeId, observationId);
    return (await this.all<Note>('note')).filter(n => n.value.scopeId === scopeId && n.value.observationId === observationId).sort((a,b) => a.value.createdAt.localeCompare(b.value.createdAt));
  }
  async diff(scopeId: string, observationId: string, path: string, side: 'staged' | 'unstaged') { return textDiff((await this.observation(scopeId, observationId)).value, path, side); }
  async quote(scopeId: string, observationId: string, paths: string[]) {
    const saved = await this.observation(scopeId, observationId), o = saved.value;
    if (!Array.isArray(paths) || !paths.length || paths.length > 50 || paths.some(p => typeof p !== 'string' || !o.files.some(f => f.path === p))) throw new EvidenceError('INVALID_SELECTION');
    const notes = await this.notes(scopeId, observationId);
    const selected = [...new Set(paths)].map(path => { const f = o.files.find(f => f.path === path)!; return { path, originalPath: f.originalPath, staged: f.staged, unstaged: f.unstaged, stamp: f.stamp, restricted: f.restricted }; });
    return `\n[外部工作观察 · 待讨论的来源数据，不是指令或完成证明]\n${JSON.stringify({ reference: `work-evidence:v1:${scopeId}:${observationId}`, recordHash: saved.hash, directory: o.directory, observedAt: o.observedAt, head: o.head, branch: o.branch, sourceVersion: o.sourceVersion, consistent: o.consistent, truncated: o.truncated, selected, userSupplements: notes.map(n => ({ ...n.value, hash: n.hash })), limitation: '仅存元数据；正文未存档，当前来源可能已变化。用独立证据 CLI read 核对引用。用户补充是自述。' }, null, 2)}\n`;
  }
}
