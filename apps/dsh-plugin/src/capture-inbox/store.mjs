/* global structuredClone, process */
import { constants } from 'node:fs';
import { mkdir, open, readdir, realpath, lstat, link, unlink } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { encode, partition, checkOrigin } from './identity.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const MAX_TEXT = 1_000_000;
const MAX_RECORDS = 5000, MAX_VERSIONS = 10000, MAX_BYTES = 8_000_000;
const text = value => { if (typeof value !== 'string' || value.length > MAX_TEXT) throw Error('INVALID_TEXT'); return value; };
const key = value => { if (typeof value !== 'string' || !value || value.length > 256) throw Error('INVALID_REQUEST_KEY'); return value; };
const version = value => { if (!Number.isSafeInteger(value) || value < 1) throw Error('INVALID_VERSION'); return value; };
const id = value => { if (!/^[a-f0-9]{64}$/.test(value)) throw Error('INVALID_RECORD_ID'); return value; };
const missing = error => error?.code === 'ENOENT';
async function syncDirectory(path) { const handle = await open(path, constants.O_RDONLY); try { await handle.sync(); } finally { await handle.close(); } }

/** Single-device private storage. Host chooses an approved root; never expose root in RPC.
 * Immutable intents + hard-link CAS publication allow independent processes without a
 * stale lock timeout. Acknowledgement is fsync + exact readback, not a rename alone.
 * No cleanup removes historical evidence. Staged files are ignored on recovery.
 */
export class FileCaptureStore {
  constructor(root, { fault = async () => {} } = {}) {
    if (!isAbsolute(root) || resolve(root) === '/') throw Error('PRIVATE_ROOT_REQUIRED');
    this.root = resolve(root); this.fault = fault;
  }
  async directory(path) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    await this.checkDirectory(path);
    // fsync ancestors too: a newly-created partition must survive a host restart.
    await syncDirectory(path);
    await syncDirectory(resolve(path, '..'));
  }
  async checkDirectory(path) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || (await realpath(path)) !== path || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw Error('UNSAFE_STORAGE_PATH');
  }
  async home(context) {
    const tenant = partition(context);
    await this.directory(this.root);
    const path = join(this.root, hash(tenant)); await this.directory(path); await syncDirectory(this.root);
    for (const name of ['requests', 'records', 'drafts']) { await this.directory(join(path, name)); }
    await syncDirectory(path); return path;
  }
  async read(path) {
    // Never follow a replaced/symlinked data file. Reads are bounded before parsing.
    await this.checkDirectory(resolve(path, '..'));
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw Error('INVALID_STORAGE_FILE');
      const raw = await handle.readFile('utf8'), envelope = JSON.parse(raw);
      if (envelope.schema !== 1 || envelope.digest !== hash(encode(envelope.value))) throw Error('CORRUPT_CAPTURE_DATA');
      return envelope.value;
    } finally { await handle.close(); }
  }
  async optional(path) { try { return await this.read(path); } catch (error) { if (missing(error)) return null; throw error; } }
  async publish(path, value) {
    await this.checkDirectory(resolve(path, '..'));
    const content = encode({ schema: 1, value, digest: hash(encode(value)) });
    if (Buffer.byteLength(content) > MAX_BYTES) throw Error('CAPTURE_FILE_SIZE_LIMIT');
    const staged = `${path}.${randomUUID()}.pending`;
    const handle = await open(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    try {
      await this.fault('before-publish', path);
      try { await link(staged, path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      await this.fault('after-publish', path);
      await syncDirectory(resolve(path, '..'));
      return await this.read(path);
    } finally { await unlink(staged).catch(() => {}); }
  }
  async revisions(path) {
    await this.checkDirectory(path);
    const all = await readdir(path);
    if (all.some(name => !/^\d+\.json$/.test(name) && !/^\d+\.json\.[a-f0-9-]{36}\.pending$/.test(name))) throw Error('FOREIGN_CAPTURE_FILE');
    const names = all.filter(name => /^\d+\.json$/.test(name)).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
    if (names.length > MAX_VERSIONS) throw Error('CAPTURE_HISTORY_LIMIT');
    const rows = [];
    for (let i = 0; i < names.length; i++) {
      if (names[i] !== `${i + 1}.json`) throw Error('CAPTURE_HISTORY_GAP');
      const row = await this.read(join(path, names[i]));
      if (row.version !== i + 1 || row.parent !== (i ? hash(encode(rows[i - 1])) : null)) throw Error('CORRUPT_CAPTURE_HISTORY');
      rows.push(row);
    }
    return rows;
  }
  async record(home, recordId) {
    const path = join(home, 'records', id(recordId));
    let rows; try { rows = await this.revisions(path); } catch (error) { if (missing(error)) return null; throw error; }
    return this.fromRows(recordId, rows);
  }
  fromRows(recordId, rows) {
    if (!rows.length) return null;
    const first = rows[0], last = rows.at(-1);
    if (first.kind !== 'create' || first.id !== recordId || rows.some(row => row.id !== recordId || typeof row.text !== 'string' || typeof row.archived !== 'boolean')) throw Error('CORRUPT_CAPTURE_RECORD');
    return { id: recordId, original: first.text, createdAt: first.at, origin: first.origin,
      version: last.version, text: last.text, archived: last.archived,
      history: rows.map(({ version, text, archived, at, requestKey, restoredFrom }) => ({ version, text, archived, at, requestKey, ...(restoredFrom ? { restoredFrom } : {}) })) };
  }
  async list(context) {
    const home = await this.home(context), result = [];
    const names = await readdir(join(home, 'records'));
    if (names.length > MAX_RECORDS) throw Error('CAPTURE_RECORD_LIMIT');
    for (const name of names) {
      if (!/^[a-f0-9]{64}$/.test(name)) throw Error('FOREIGN_CAPTURE_RECORD');
      const record = await this.record(home, name); if (record) { checkOrigin(record.origin, context); result.push(record); }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }
  validate(command, context) {
    key(command.requestKey);
    const allowed = { create: ['kind', 'requestKey', 'text', 'origin'], edit: ['kind', 'requestKey', 'id', 'expectedVersion', 'text'], archive: ['kind', 'requestKey', 'id', 'expectedVersion', 'archived'], restore: ['kind', 'requestKey', 'id', 'expectedVersion', 'restoreVersion'] }[command.kind];
    if (!allowed || Object.keys(command).some(field => !allowed.includes(field))) throw Error('INVALID_CAPTURE_COMMAND');
    if (command.kind === 'create') { text(command.text); if (!command.text.trim()) throw Error('EMPTY_CAPTURE'); checkOrigin(command.origin, context); }
    else { id(command.id); version(command.expectedVersion); }
    if (command.kind === 'edit') text(command.text);
    if (command.kind === 'archive' && typeof command.archived !== 'boolean') throw Error('INVALID_ARCHIVE');
    if (command.kind === 'restore') version(command.restoreVersion);
  }
  async execute(context, command) {
    // Snapshot before the first await; caller mutation cannot change an accepted intent.
    context = structuredClone(context); command = structuredClone(command);
    this.validate(command, context);
    let home;
    try {
      home = await this.home(context);
      const requestPath = join(home, 'requests', `${hash(command.requestKey)}.json`);
      const intent = await this.publish(requestPath, command);
      if (encode(intent) !== encode(command)) return { status: 'conflict', record: null, problem: 'REQUEST_KEY_REUSED' };
      const recordId = command.kind === 'create' ? hash(command.requestKey) : command.id;
      const expected = command.kind === 'create' ? 0 : command.expectedVersion;
      if (expected >= MAX_VERSIONS) throw Error('CAPTURE_HISTORY_LIMIT');
      if (command.kind === 'create' && (await readdir(join(home, 'records'))).length >= MAX_RECORDS && !await this.optional(join(home, 'records', recordId, '1.json'))) throw Error('CAPTURE_RECORD_LIMIT');
      const recordPath = join(home, 'records', recordId); await this.directory(recordPath); await syncDirectory(join(home, 'records'));
      const rows = await this.revisions(recordPath), existing = rows[expected];
      if (existing?.requestKey === command.requestKey) {
        await syncDirectory(recordPath);
        return { status: 'saved', record: this.fromRows(recordId, rows.slice(0, expected + 1)) };
      }
      // The compared current version and parent hash MUST come from one snapshot.
      // A second read could observe a concurrent revision without its parent rows.
      const current = this.fromRows(recordId, rows);
      await this.fault('after-history-read', recordPath);
      if ((current?.version ?? 0) !== expected) return { status: 'conflict', record: current, problem: 'VERSION_CONFLICT' };
      if (command.kind !== 'create' && !current) return { status: 'conflict', record: null, problem: 'RECORD_MISSING' };
      const restored = command.kind === 'restore' ? current.history.find(row => row.version === command.restoreVersion) : null;
      if (command.kind === 'restore' && !restored) return { status: 'conflict', record: current, problem: 'RESTORE_VERSION_MISSING' };
      const next = { id: recordId, kind: command.kind, version: expected + 1, parent: expected ? hash(encode(rows.at(-1))) : null,
        text: command.kind === 'create' || command.kind === 'edit' ? command.text : restored ? restored.text : current.text,
        archived: command.kind === 'create' ? false : command.kind === 'archive' ? command.archived : current.archived,
        at: new Date().toISOString(), requestKey: command.requestKey,
        ...(command.kind === 'create' ? { origin: command.origin } : {}), ...(restored ? { restoredFrom: restored.version } : {}) };
      const observed = await this.publish(join(recordPath, `${next.version}.json`), next);
      if (observed.requestKey !== command.requestKey) return { status: 'conflict', record: await this.record(home, recordId), problem: 'VERSION_CONFLICT' };
      await this.fault('before-receipt', recordPath);
      return { status: 'saved', record: this.fromRows(recordId, (await this.revisions(recordPath)).slice(0, next.version)) };
    } catch (error) { return { status: 'unknown', problem: `保存结果未确认；请保留输入并用原请求重试。${error.message}` }; }
  }
  async readDraft(context) {
    const home = await this.home(context), rows = await this.revisions(join(home, 'drafts'));
    for (const row of rows) this.validateDraft(row.draft, context);
    return { version: rows.length, draft: rows.at(-1)?.draft ?? null };
  }
  validateDraft(draft, context) {
    if (!draft || Object.keys(draft).some(field => !['text', 'requestKey', 'quote', 'edit', 'captureAttempt', 'editAttempt'].includes(field))) throw Error('INVALID_DRAFT');
    text(draft.text); key(draft.requestKey); text(draft.quote);
    if (draft.edit) { id(draft.edit.id); version(draft.edit.expectedVersion); text(draft.edit.text); key(draft.edit.requestKey); }
    if (draft.captureAttempt) this.validate(draft.captureAttempt, context);
    if (draft.editAttempt) this.validate(draft.editAttempt, context);
    if (draft.captureAttempt && draft.captureAttempt.kind !== 'create' || draft.editAttempt?.kind === 'create') throw Error('INVALID_DRAFT_ATTEMPT');
  }
  async saveDraft(context, expectedVersion, draft) {
    context = structuredClone(context); draft = structuredClone(draft); partition(context);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw Error('INVALID_VERSION');
    this.validateDraft(draft, context);
    try {
      const home = await this.home(context), path = join(home, 'drafts'), rows = await this.revisions(path);
      if (rows.length >= MAX_VERSIONS) throw Error('CAPTURE_DRAFT_HISTORY_LIMIT');
      if (rows.length !== expectedVersion) return { status: 'conflict', problem: 'DRAFT_VERSION_CONFLICT' };
      const next = { version: expectedVersion + 1, parent: expectedVersion ? hash(encode(rows.at(-1))) : null, draft };
      const observed = await this.publish(join(path, `${next.version}.json`), next);
      return encode(observed) === encode(next) ? { status: 'saved', version: next.version } : { status: 'conflict', problem: 'DRAFT_VERSION_CONFLICT' };
    } catch (error) { return { status: 'unknown', problem: error.message }; }
  }
}
