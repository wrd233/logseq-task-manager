/* global structuredClone */
import { captureIssue } from './capture-inbox/problems.mjs';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { WorkspaceError, parseWorkBinding, workRecord, workText } from '@task-copilot/contracts';
import { sameWorkUiContext } from '../../logseq-plugin/src/workspace/copilot-ui-port.ts';

const fields = {
  list: ['sessionId', 'lease'], execute: ['sessionId', 'lease', 'command'],
  readDraft: ['sessionId', 'lease'], saveDraft: ['sessionId', 'lease', 'expectedVersion', 'draft'],
};
const commandFields = {
  create: ['kind', 'requestKey', 'text', 'origin'], edit: ['kind', 'requestKey', 'id', 'expectedVersion', 'text'],
  archive: ['kind', 'requestKey', 'id', 'expectedVersion', 'archived'], restore: ['kind', 'requestKey', 'id', 'expectedVersion', 'restoreVersion'],
};
const fail = code => { throw new WorkspaceError(code); };
const publicReceipt = result => {
  if (!result || result.status === 'saved') return result;
  const known = ['REQUEST_KEY_REUSED', 'VERSION_CONFLICT', 'RECORD_MISSING', 'RESTORE_VERSION_MISSING', 'DRAFT_VERSION_CONFLICT'];
  return { ...result, problem: known.includes(result.problem) ? result.problem : captureIssue(result.problem, '本机保存尚未确认，请保留输入并重试同一请求。') };
};

/** Authenticated UI-only boundary. Store roots, contexts and leases are host owned.
 * The injected store is feature-local; this service imports neither feature's
 * implementation and never registers a model tool or reads native chat drafts.
 */
export class CaptureHost {
  constructor({ store, workbench }) { this.store = store; this.workbench = workbench; this.sessions = new Map(); this.stopped = false; }
  alive(signal) { signal?.throwIfAborted(); if (this.stopped) fail('CAPTURE_HOST_STOPPED'); }
  dispose() { this.stopped = true; this.sessions.clear(); }
  async current(sessionId, signal) {
    this.alive(signal); workText(sessionId);
    const workGeneration = this.workbench.generations.get(sessionId) ?? 0;
    const status = await this.workbench.status(sessionId, signal);
    const binding = status.binding === null ? null : parseWorkBinding(status.binding);
    let connection = null, availability = 'unbound';
    if (binding) {
      try {
        const entry = await this.workbench.binding(sessionId, signal);
        connection = [entry.instanceId ?? null, entry.connectionId ?? null]; availability = 'connected';
      } catch (error) {
        this.alive(signal);
        if (error.code === 'BINDING_CHANGED') throw error;
        // Private capture can retain a remembered work identity offline. This
        // metadata grants no Graph/file reads, and reconnect changes the lease.
        connection = ['offline', error.code ?? 'WORKSPACE_UNAVAILABLE']; availability = 'offline';
      }
    }
    this.workbench.check(sessionId, workGeneration, signal); this.alive(signal);
    const fingerprint = JSON.stringify([workGeneration, binding, connection]);
    let row = this.sessions.get(sessionId);
    if (!row || row.fingerprint !== fingerprint) {
      row = { fingerprint, lease: randomUUID(), availability,
        context: { scope: binding?.scope ?? null, binding, workObject: null, sessionId, generation: row ? row.context.generation + 1 : 0 } };
      this.sessions.delete(sessionId); this.sessions.set(sessionId, row);
      if (this.sessions.size > 256) this.sessions.delete(this.sessions.keys().next().value);
    }
    return row;
  }
  async context(input, signal) {
    const value = workRecord(input, ['sessionId', 'selection', 'lease']), row = await this.current(workText(value.sessionId), signal);
    const origin = { sessionId: row.context.sessionId, ...(value.selection ?? {}) };
    let text;
    if (value.selection !== undefined) {
      if (value.lease !== row.lease) fail('CAPTURE_CONTEXT_STALE');
      workRecord(value.selection, ['block', 'material']);
      if (Boolean(value.selection.block) === Boolean(value.selection.material)) fail('INVALID_CAPTURE_SELECTION');
      text = await this.verifyCommand({ kind: 'create', requestKey: 'selection', text: '', origin }, row, signal, true, true);
      await this.authorized(row.context.sessionId, row.lease, row.context, signal);
    }
    return structuredClone({ context: row.context, lease: row.lease, availability: row.availability, origin, ...(text === undefined ? {} : { text }) });
  }
  async authorized(sessionId, lease, expected, signal) {
    this.alive(signal);
    const row = await this.current(sessionId, signal);
    if (row.lease !== lease || expected && !sameWorkUiContext(expected, row.context)) fail('CAPTURE_CONTEXT_STALE');
    return row;
  }
  async verifyCommand(command, row, signal, verifySources = true, readText = false) {
    const allowed = commandFields[command?.kind];
    if (!allowed) fail('INVALID_CAPTURE_COMMAND');
    workRecord(command, allowed);
    if (command.kind !== 'create') return;
    const origin = workRecord(command.origin, ['sessionId', 'block', 'material']);
    if (origin.sessionId !== row.context.sessionId) fail('CAPTURE_SOURCE_SESSION_MISMATCH');
    // Draft attempts remain untrusted input until execute. Keeping a private
    // draft offline must not require a new Graph read or fabricate provenance.
    if (!verifySources) return;
    if ((origin.block || origin.material) && row.availability !== 'connected') fail('CAPTURE_SOURCE_UNAVAILABLE');
    let body;
    if (origin.block) {
      const selected = workRecord(origin.block, ['sourceId', 'target', 'contentVersion']);
      const target = workRecord(selected.target, ['kind', 'graphId', 'blockUuid']);
      const packet = await this.workbench.command(row.context.sessionId, 'source.read', { sourceId: workText(selected.sourceId, 4096) }, signal);
      const source = packet?.source;
      if (!selected.contentVersion || packet?.freshness !== 'checked' || source?.availability !== 'available' || !source || source.sourceId !== selected.sourceId || source.contentVersion !== selected.contentVersion ||
        source.target?.kind !== target.kind || source.target.graphId !== target.graphId || source.target.blockUuid !== target.blockUuid) fail('CAPTURE_SOURCE_NOT_VERIFIED');
      body = source.content;
    }
    if (origin.material) {
      const selected = workRecord(origin.material, ['materialId', 'version', 'reference']);
      const list = await this.workbench.command(row.context.sessionId, 'materials.list', {}, signal);
      if (!selected.version || !list?.materials?.some(material => material.id === selected.materialId && material.version === selected.version && material.reference === selected.reference && material.availability === 'available')) fail('CAPTURE_SOURCE_NOT_VERIFIED');
      if (readText) {
        const material = await this.workbench.command(row.context.sessionId, 'materials.read', { id: selected.materialId }, signal);
        if (material?.id !== selected.materialId || material.version !== selected.version || material.reference !== selected.reference || material.availability !== 'available') fail('CAPTURE_SOURCE_NOT_VERIFIED');
        body = material.content;
      }
    }
    if (readText) { if (typeof body !== 'string') fail('CAPTURE_SOURCE_TEXT_UNAVAILABLE'); if (body.length > 1_000_000) fail('CAPTURE_TEXT_LIMIT'); return body; }
  }
  async call(method, input, signal) {
    if (!fields[method]) fail('UNKNOWN_CAPTURE_ROUTE');
    const value = structuredClone(workRecord(input, fields[method]));
    if (Buffer.byteLength(JSON.stringify(value)) > 8_000_000) fail('CAPTURE_INPUT_TOO_LARGE');
    const sessionId = workText(value.sessionId), lease = workText(value.lease);
    // Never create a lease from a caller's context or a guessed generation.
    if (this.sessions.get(sessionId)?.lease !== lease) fail('CAPTURE_CONTEXT_STALE');
    const row = await this.authorized(sessionId, lease, null, signal), context = structuredClone(row.context);
    if (method === 'execute') {
      await this.verifyCommand(value.command, row, signal, false);
      const replay = await this.store.replay?.(context, value.command);
      if (replay) { await this.authorized(sessionId, lease, context, signal); return publicReceipt(replay); }
      await this.verifyCommand(value.command, row, signal);
    }
    if (method === 'saveDraft') {
      workRecord(value.draft, ['text', 'requestKey', 'edit', 'quote', 'captureAttempt', 'editAttempt', 'origin']);
      if (value.draft.captureAttempt) await this.verifyCommand(value.draft.captureAttempt, row, signal, false);
      if (value.draft.editAttempt) await this.verifyCommand(value.draft.editAttempt, row, signal, false);
    }
    await this.authorized(sessionId, lease, context, signal);
    let result;
    if (method === 'list') result = await this.store.list(context);
    if (method === 'readDraft') result = await this.store.readDraft(context);
    if (method === 'execute') result = publicReceipt(await this.store.execute(context, value.command));
    if (method === 'saveDraft') result = publicReceipt(await this.store.saveDraft(context, value.expectedVersion, value.draft));
    // A late operation may have reached its original private partition. Discard
    // its stale reply; same-key recovery must occur in that original partition.
    await this.authorized(sessionId, lease, context, signal);
    return result;
  }
}
