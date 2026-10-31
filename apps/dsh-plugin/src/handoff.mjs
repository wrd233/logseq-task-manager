import { sameBinding } from './service.mjs';
import { readFile, mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson } from '../../task-copilot-cli/src/workspace-files.ts';
import { readDshHandoff, handoffPath } from '../../task-copilot-cli/src/dsh-handoff.ts';
import { WorkspaceError, sameWorkScope, sameWorkRef, workRefFromBinding, workKey } from '@task-copilot/contracts';

const missing = error => /^(?:session\/not-found|SESSION_NOT_FOUND|ENOENT)$/.test(error.code ?? '');
/** Serialized native operations. No messages, drafts, model calls or runtime credentials are stored here. */
export class DshHandoffs {
  constructor({service, createSession, renameSession, archivedSessions, listSessionIds}) {
    Object.assign(this, {service, createSession, renameSession, archivedSessions, listSessionIds}); this.queue = Promise.resolve();
  }
  serial(operation) {
    const result = this.queue.then(operation); this.queue = result.catch(() => {}); return result;
  }
  async valid(sessionId, signal) {
    if ((await this.archivedSessions()).includes(sessionId)) return null;
    if (this.listSessionIds && !(await this.listSessionIds(signal)).includes(sessionId)) return null;
    try { return await this.service.inspectSession(sessionId, signal); }
    catch (error) { if (missing(error)) return null; throw error; }
  }
  async assertCwd(session, directory) {
    if (!session.meta?.cwd || await realpath(session.meta.cwd) !== await realpath(directory))
      throw new WorkspaceError('SESSION_CWD_MISMATCH');
  }
  async recentSession(workRef, directory, signal) {
    for (const row of this.service.store.recent(workRef)) {
      const session = await this.valid(row.sessionId, signal);
      if (!session) continue;
      const expected = directory ?? row.binding?.directory;
      if (expected) await this.assertCwd(session, expected);
      return row.sessionId;
    }
    return null;
  }
  opened(sessionId, signal) {
    return this.serial(async () => {
      if (!await this.valid(sessionId, signal)) throw new WorkspaceError('SESSION_NOT_FOUND');
      await this.service.store.opened(sessionId); return {sessionId};
    });
  }
  open(ticket, signal) { return this.serial(() => this.consume(ticket, signal)); }
  async consume(ticket, signal) {
    const {service} = this, state = service.transport.stateDirectory;
    const request = await readDshHandoff(state, ticket), entry = await service.transport.entry(request.entry.directory);
    // Stable identity chooses navigation; full binding and live connection authorize reads.
    if (entry.connectionId !== request.entry.connectionId || entry.instanceId !== request.entry.instanceId ||
        !sameBinding(entry.binding, request.entry.binding)) throw new WorkspaceError('CONNECTION_STALE');
    await service.transport.call(entry, 'status', {}, 'handoff', signal);
    const workRef = request.workRef ?? workRefFromBinding(entry.binding);
    let sessionId = request.sessionId;
    if (!sessionId && request.mode !== 'new') sessionId = await this.recentSession(workRef, entry.directory, signal);
    if (!sessionId) {
      // Reserve a native id before creation. An uncertain response is inspected on retry.
      sessionId = `session-${randomUUID()}`;
      await atomicJson(handoffPath(state, ticket), {...request, workRef, sessionId});
    }
    let session = await this.valid(sessionId, signal), createdNow = false;
    if (!session) {
      if ((await this.archivedSessions()).includes(sessionId)) throw new WorkspaceError('SESSION_ARCHIVED');
      const created = await this.createSession({cwd: entry.directory, title: request.title, sessionId});
      if (created.sessionId !== sessionId) throw new WorkspaceError('SESSION_CREATE_ID_MISMATCH');
      createdNow = true;
      session = await this.valid(sessionId, signal);
      if (!session) throw new WorkspaceError('SESSION_NOT_FOUND');
    }
    await this.assertCwd(session, entry.directory);
    if (!sameBinding(service.store.bindings.get(sessionId) ?? entry.binding, entry.binding) ||
        !service.store.bindings.has(sessionId) || !sameWorkRef(service.store.associations.get(sessionId)?.workRef, workRef))
      await service.bind(sessionId, entry.directory, signal, entry, workRef);
    const warnings = [];
    // Optional naming/reference never turns a usable native conversation into a failed entry.
    try { if (createdNow) await this.renameSession({sessionId, title: request.title}); } catch { warnings.push('SESSION_TITLE_PENDING'); }
    try { await service.command(sessionId, 'sessions.add', {platform: 'dsh', externalId: sessionId, description: request.title}, signal); }
    catch { warnings.push('SESSION_REFERENCE_PENDING'); }
    return {sessionId, title: request.title, warnings};
  }
  // The same native validity/recent-open rules, without a body connection or grant.
  enterCatalog(work, operationId, signal, mode = 'continue') {
    return this.serial(() => this.discover(work, operationId, signal, mode));
  }
  async discover(work, operationId, signal, mode) {
    signal?.throwIfAborted();
    const {service} = this, workRef = work.workRef;
    if (mode !== 'new') {
      const sessionId = await this.recentSession(workRef, work.directory, signal);
      if (sessionId) return {sessionId, bound: service.store.bindings.has(sessionId)};
    }
    if (!/^[0-9a-f-]{36}$/u.test(operationId)) throw new WorkspaceError('DSH_HANDOFF_INVALID');
    const directory = join(service.store.directory, 'discovery-operations');
    await mkdir(directory, {recursive: true, mode: 0o700});
    const path = join(directory, `${operationId}.json`);
    let operation;
    try {operation = JSON.parse(await readFile(path, 'utf8'));}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    if (operation && workKey(operation.workRef) !== workKey(workRef)) throw new WorkspaceError('SESSION_WORK_CONFLICT');
    if (!operation) {
      operation = {workRef, sessionId: `session-${randomUUID()}`};
      await atomicJson(path, operation);
    }
    const previous = service.store.recent(workRef).find(row => row.binding);
    const sessionId = operation.sessionId;
    let session = await this.valid(sessionId, signal);
    if (!session) {
      if ((await this.archivedSessions()).includes(sessionId)) throw new WorkspaceError('SESSION_ARCHIVED');
      const created = await this.createSession({sessionId, title: work.title, ...(work.directory || previous ? {cwd: work.directory ?? previous.binding.directory} : {})});
      if (created.sessionId !== sessionId) throw new WorkspaceError('SESSION_CREATE_ID_MISMATCH');
      session = await this.valid(sessionId, signal);
      if (!session) throw new WorkspaceError('SESSION_NOT_FOUND');
    }
    if (work.directory || previous) await this.assertCwd(session, work.directory ?? previous.binding.directory);
    // Association is navigation only: never copy a source binding or grant into a new conversation.
    await service.store.change(sessionId, null, () => signal?.throwIfAborted(), workRef);
    try {await this.renameSession({sessionId, title: work.title});} catch { /* Native chat is still usable. */ }
    return {sessionId, bound: false};
  }
  newWork(sessionId, operationId, signal, catalogWork) {
    return this.serial(async () => {
      const association = this.service.store.associations.get(sessionId);
      if (!association?.workRef) throw new WorkspaceError('SESSION_NOT_BOUND');
      if (!association.binding) return this.discover(catalogWork ?? {workRef: association.workRef, title: '新的工作对话'}, operationId, signal, 'new');
      const entry = await this.service.transport.entry(association.binding.directory);
      if (!sameWorkScope(entry.binding.scope, association.binding.scope)) throw new WorkspaceError('WORK_SCOPE_CHANGED');
      // Reuse the handoff journal for native-create recovery. A retry keeps the same operationId.
      const state = this.service.transport.stateDirectory, path = handoffPath(state, operationId);
      try { await readDshHandoff(state, operationId); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await atomicJson(path, {schemaVersion: 1, ticket: operationId, createdAt: Date.now(), mode: 'new',
          title: '新的工作对话', entry, workRef: association.workRef});
      }
      const request = await readDshHandoff(state, operationId);
      if (!sameWorkRef(request.workRef, association.workRef)) throw new WorkspaceError('SESSION_WORK_CONFLICT');
      return this.consume(operationId, signal);
    });
  }
  general(signal) {
    return this.serial(async () => {
      for (const row of this.service.store.recent(undefined)) if (await this.valid(row.sessionId, signal)) return {sessionId: row.sessionId};
      const created = await this.createSession({});
      await this.service.store.change(created.sessionId, null);
      return {sessionId: created.sessionId};
    });
  }
}
