/* global structuredClone */
import process from 'node:process';
import {homedir} from 'node:os';
import {join, isAbsolute} from 'node:path';
import {mkdir, readdir, readFile, open, rename, rm, stat} from 'node:fs/promises';
import {randomUUID, createHash} from 'node:crypto';
import {fail, uuid, text, source, validateItem, patchItem, project, filterItems} from './model.mjs';

// DSH's storageDomain backend root is composition configurable (including per profile).
// Use its documented application home instead; never use ctx profile/workspace/session paths.
export function personalInboxDirectory(env = process.env, home = homedir()) {
  const configured = env.PERSONAL_INBOX_HOME ?? join(env.DSH_HOME ?? join(home, '.dsh'), 'personal-data', 'inbox-v1');
  const root = configured === '~' ? home : configured.startsWith('~/') || configured.startsWith('~\\') ? join(home, configured.slice(2)) : configured;
  if (!isAbsolute(root)) fail('INBOX_ABSOLUTE_PATH_REQUIRED');
  return root;
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const projection = record => {
  const pending = Object.entries(record.operations).find(([, operation]) => operation.status === 'pending');
  return {...project(record.item, Boolean(record.previous) && !pending), pendingConversion: pending ? {
    operationId:pending[0], kind:pending[1].kind, parameters:pending[1].parameters, resolve:pending[1].resolve} : null};
};
async function durableJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try {await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync();} finally {await file.close();}
    await rename(temp, path);
  } finally {await rm(temp, {force: true});}
}

/** Per-item records, one previous edit, serialized durable writes. No Session ownership. */
export class PersonalInboxStore {
  constructor(directory = personalInboxDirectory()) {this.directory = directory; this.queue = Promise.resolve();}
  async load() {await mkdir(this.directory, {recursive: true, mode: 0o700});}
  path(id) {return join(this.directory, `${uuid(id)}.json`);}
  async record(id) {
    let record;
    try {record = JSON.parse(await readFile(this.path(id), 'utf8'));}
    catch(error) {if (error.code === 'ENOENT') fail('INBOX_MISSING'); if (error instanceof SyntaxError) fail('INBOX_CORRUPT'); throw error;}
    try {validateItem(record.item); if (record.item.id !== id || !record.operations || typeof record.operations !== 'object') fail('INBOX_CORRUPT');}
    catch {fail('INBOX_CORRUPT');}
    return record;
  }
  async get(id) {return projection(await this.record(id));}
  serial(fn) {
    const task = this.queue.then(async () => {
      await this.load();
      const lock = join(this.directory, '.write-lock');
      try {await mkdir(lock, {mode: 0o700});}
      catch(error) {
        if (error.code !== 'EEXIST') throw error;
        // Recover only an abandoned process lock; an active second host receives BUSY.
        let owner;
        try {owner = JSON.parse(await readFile(join(lock, 'owner.json'), 'utf8'));}
        catch {if (Date.now() - (await stat(lock)).mtimeMs < 30000) fail('INBOX_BUSY');}
        if (Number.isInteger(owner?.pid)) {
          try {process.kill(owner.pid, 0); fail('INBOX_BUSY');}
          catch(e) {if (e.code !== 'ESRCH') throw e;}
        }
        await rm(lock, {recursive:true, force:true});
        try {await mkdir(lock, {mode:0o700});} catch {fail('INBOX_BUSY');}
      }
      try {await durableJson(join(lock, 'owner.json'), {pid:process.pid}); return await fn();}
      finally {await rm(lock, {recursive:true, force:true});}
    });
    this.queue = task.catch(() => {}); return task;
  }
  async save(record) {
    validateItem(record.item);
    await durableJson(this.path(record.item.id), record);
    if (process.platform !== 'win32') {const dir = await open(this.directory, 'r'); try {await dir.sync();} finally {await dir.close();}}
    return projection(record);
  }
  create(input) {
    const id = uuid(input.id), originalContent = text(input.originalContent), origin = source(input.source);
    return this.serial(async () => {
      let existing;
      try {existing = await this.record(id);} catch(e) {if(e.code !== 'INBOX_MISSING') throw e;}
      if (existing) {
        if (existing.item.originalContent !== originalContent || digest(existing.item.source) !== digest(origin)) fail('INBOX_ID_REUSED');
        return projection(existing);
      }
      const now = new Date().toISOString();
      return this.save({item: {schemaVersion:1, id, revision:1, originalContent, editedContent:null, context:'', source:origin,
        materials:[], workRef:null, status:'open', archivedFrom:null, createdAt:now, updatedAt:now, outcomes:[]}, previous:null, operations:{}});
    });
  }
  change({id, revision, action, patch, content, confirmed}) {
    return this.serial(async () => {
      const record = await this.record(id), item = record.item;
      if (item.revision !== revision) fail('INBOX_CONFLICT');
      if (Object.values(record.operations).some(op => op.status === 'pending')) fail('INBOX_CONVERSION_PENDING');
      const before = structuredClone(item);
      if (action === 'update') patchItem(item, patch);
      else if (action === 'edit') {if (confirmed !== true) fail('INBOX_CONFIRM_REQUIRED'); item.editedContent = text(content);}
      else if (action === 'archive') {if (item.status === 'archived') return projection(record); item.archivedFrom = item.status; item.status = 'archived';}
      else if (action === 'restore') {if(item.status !== 'archived') fail('INBOX_NOT_ARCHIVED'); item.status = item.archivedFrom; item.archivedFrom = null;}
      else if (action === 'undo') {
        if (!record.previous) fail('INBOX_UNDO_MISSING');
        record.item = {...record.previous, revision:item.revision, outcomes:item.outcomes}; record.previous = null;
      } else fail('INBOX_INVALID');
      if (action !== 'undo') record.previous = before;
      record.item.revision++; record.item.updatedAt = new Date().toISOString();
      return this.save(record);
    });
  }
  async list(query = {}) {
    await this.load(); const items = [], problems = [];
    for (const name of await readdir(this.directory)) {
      if (!/^[\da-f-]{36}\.json$/iu.test(name)) continue;
      try {items.push(await this.get(name.slice(0,-5)));} catch(e) {problems.push({id:name.slice(0,-5), code:e.code ?? 'INBOX_CORRUPT'});}
    }
    return {items:filterItems(items, query), problems};
  }
  async export() {
    // Same lock as writes so an export is one consistent snapshot.
    return this.serial(async () => {
      const {items, problems} = await this.list({status:'all'});
      if (problems.length) fail('INBOX_BACKUP_INCOMPLETE');
      const records = [];
      for (const item of items) records.push(await this.record(item.id));
      if (records.some(row => Object.values(row.operations).some(op => op.status === 'pending'))) fail('INBOX_CONVERSION_PENDING');
      return {schemaVersion:1, exportedAt:new Date().toISOString(), items:records.map(row => row.item)};
    });
  }
  import(backup) {
    if (backup?.schemaVersion !== 1 || !Array.isArray(backup.items) || backup.items.length > 10000) fail('INBOX_INVALID_BACKUP');
    const items = structuredClone(backup.items); const seen = new Set();
    for (const item of items) {validateItem(item); if(seen.has(item.id)) fail('INBOX_INVALID_BACKUP'); seen.add(item.id);}
    return this.serial(async () => {
      const result = {imported:[], skipped:[], conflicts:[]};
      for (const item of items) {
        let old;
        try {old = await this.record(item.id);} catch(e) {if (e.code !== 'INBOX_MISSING') {result.conflicts.push(item.id); continue;}}
        if (old) {(digest(old.item) === digest(item) ? result.skipped : result.conflicts).push(item.id); continue;}
        await this.save({item, previous:null, operations:{}}); result.imported.push(item.id);
      }
      return result;
    });
  }
  convert(input, execute) {
    return this.serial(async () => {
      if (input.confirmed !== true) fail('INBOX_CONFIRM_REQUIRED');
      const record = await this.record(input.id), operationId = uuid(input.operationId);
      const payload = {kind:input.kind, resolve:input.resolve === true, parameters:input.parameters};
      if (!['work', 'planner', 'formal-task'].includes(payload.kind)) fail('INBOX_INVALID');
      let operation = record.operations[operationId];
      if (operation && operation.digest !== digest(payload)) fail('INBOX_OPERATION_REUSED');
      if (operation?.status === 'done') return projection(record);
      // Restored backups retain target receipts even though local pending intents are excluded.
      const outcome = record.item.outcomes.find(row => row.operationId === operationId);
      if (outcome) {
        if (outcome.kind !== payload.kind) fail('INBOX_OPERATION_REUSED');
        return projection(record);
      }
      if (Object.entries(record.operations).some(([id, op]) => id !== operationId && op.status === 'pending')) fail('INBOX_CONVERSION_PENDING');
      if(record.item.status === 'archived') fail('INBOX_RESTORE_REQUIRED');
      if(operation?.status === 'rejected' && record.item.revision !== input.revision) fail('INBOX_CONFLICT');
      if (!operation) {
        if (record.item.revision !== input.revision) fail('INBOX_CONFLICT');
        operation = {status:'pending', digest:digest(payload), ...payload}; record.operations[operationId] = operation;
        record.previous = null; record.item.revision++; record.item.updatedAt = new Date().toISOString();
        await this.save(record); // Intent survives a lost reply; target adapters must recover by operationId.
      }
      if (operation.status === 'rejected') {operation.status = 'pending'; await this.save(record);}
      let reference;
      try {reference = await execute({item:structuredClone(record.item), operationId, ...operation});}
      catch(error) {
        // Known rejections happened before a target commit; edits may continue. Uncertain
        // responses keep the intent pending and must be retried with the same operation ID.
        if (error.code === 'PLANNER_INVALID' || error.code === 'INBOX_KERNEL_UNAVAILABLE' ||
            error.code === 'INBOX_KERNEL_USER_CHANNEL_REQUIRED' || error.status >= 400 && error.status < 500) {
          operation.status = 'rejected'; await this.save(record);
        }
        throw error;
      }
      record.item.outcomes.push({kind:operation.kind, operationId, inboxId:record.item.id, createdAt:new Date().toISOString(), reference});
      if (operation.kind === 'work') record.item.workRef = reference.workRef;
      if (operation.resolve) record.item.status = 'resolved';
      operation.status = 'done'; record.item.revision++; record.item.updatedAt = new Date().toISOString();
      return this.save(record);
    });
  }
}
