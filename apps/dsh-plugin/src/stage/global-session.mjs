/* global AbortController */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { WorkspaceError } from '@task-copilot/contracts';
import { atomicJson } from '../../../task-copilot-cli/src/workspace-files.ts';

/** ISO week of the machine's local calendar date, including the ISO week-year. */
export function isoWeekKey(now = new Date()) {
  const thursday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function sameStageDirectory(cwd, directory) {
  return typeof cwd === 'string' && isAbsolute(cwd) && resolve(cwd) === directory;
}

/** Weekly global conversations use their own index, with no single-work association or grant. */
export class GlobalStageSessions {
  constructor({ ctx, service, indexDirectory, resolveWorkspace, now = () => new Date() }) {
    this.ctx = ctx;
    this.service = service;
    this.indexDirectory = indexDirectory;
    this.indexPath = join(indexDirectory, 'stage-sessions.json');
    this.resolveWorkspace = resolveWorkspace;
    this.now = now;
    this.queue = Promise.resolve();
  }

  async readIndex() {
    try {
      const stat = await lstat(this.indexPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new WorkspaceError('STAGE_SESSION_INDEX_INVALID');
      const index = JSON.parse(await readFile(this.indexPath, 'utf8'));
      if (index.schemaVersion !== 1 || !Array.isArray(index.sessions)) throw new WorkspaceError('STAGE_SESSION_INDEX_INVALID');
      return index.sessions;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveIndex(sessions) {
    await mkdir(this.indexDirectory, { recursive: true, mode: 0o700 });
    await atomicJson(this.indexPath, { schemaVersion: 1, sessions });
  }

  async ownsSession(sessionId) {
    return (await this.readIndex()).some(row => row.sessionId === sessionId);
  }

  hasWorkAssociation(sessionId) {
    return this.service.store?.associations?.has(sessionId) || this.service.store?.bindings?.has(sessionId);
  }

  async sessionCwd(sessionId, signal) {
    try { return (await this.ctx.sessionController.inspect(sessionId, signal))?.meta?.cwd; }
    catch (error) {
      if (['session/not-found', 'SESSION_NOT_FOUND', 'ENOENT'].includes(error.code)) return null;
      throw error;
    }
  }

  async isInDirectory(sessionId, directory, signal) {
    const workRef = this.service.store?.associations?.get(sessionId)?.workRef;
    return Boolean(sessionId && !workRef && !this.service.store?.bindings?.has(sessionId) &&
      sameStageDirectory(await this.sessionCwd(sessionId, signal), directory));
  }

  enter(signal) {
    const pending = this.queue.then(() => this.enterCurrentWeek(signal ?? new AbortController().signal));
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  async nameWorkspace(workspaceId, directory) {
    try {
      await this.ctx.workspaceController.rename({ workspaceId, title: '全局导航台' });
    } catch (error) {
      if (error.code !== 'workspace/name-conflict') throw error;
      // DSH's rename API requires unique titles. Keep the previous Graph's
      // workspace and use a directory-specific title for the new one.
      const parent = dirname(directory);
      const label = basename(parent) === 'pages' && basename(directory) === 'stage-reviews'
        ? basename(dirname(parent)) : basename(directory);
      const title = `全局导航台 · ${label}`;
      const names = new Set(this.ctx.workspaceRegistry.list().map(workspace => workspace.title));
      let available = title;
      for (let suffix = 2; names.has(available); suffix++) available = `${title} (${suffix})`;
      await this.ctx.workspaceController.rename({ workspaceId, title: available });
    }
  }

  async enterCurrentWeek(signal) {
    signal.throwIfAborted();
    const { stageWorkspaceDir: directory } = await this.resolveWorkspace(signal);
    const weekKey = isoWeekKey(this.now());
    const sessions = await this.readIndex();
    signal.throwIfAborted();
    const workspace = await this.ctx.workspaceController.create({ path: directory });
    const workspaceId = workspace.workspace.workspaceId;
    if (workspace.created) await this.nameWorkspace(workspaceId, directory);
    const previous = sessions.findLast(row => row.weekKey === weekKey);
    let reservation;
    if (previous?.directory === directory && !this.hasWorkAssociation(previous.sessionId) &&
        !this.ctx.workspaceRegistry.archivedSessionIds.includes(previous.sessionId)) {
      const { items } = await this.ctx.sessionController.list({}, signal);
      const listed = items.some(row => row.sessionId === previous.sessionId);
      if (listed && await this.isInDirectory(previous.sessionId, directory, signal)) {
        if (previous.pending) {
          await this.ctx.sessionController.rename({ sessionId: previous.sessionId, title: `${weekKey} · 全局导航` });
          delete previous.pending;
          await this.saveIndex(sessions);
        }
        return { sessionId: previous.sessionId, weekKey, directory, created: false };
      }
      // A lost create reply can be retried using its reserved native ID.
      if (!listed && previous.pending) reservation = previous;
    }

    signal.throwIfAborted();
    if (!reservation) {
      reservation = { sessionId: `session-${randomUUID()}`, weekKey, directory, pending: true };
      // Keep superseded IDs in the independent history so opening an old global
      // conversation never registers it as a general or single-work Session.
      sessions.push(reservation);
      await this.saveIndex(sessions);
    }
    const { sessionId } = reservation;
    const created = await this.ctx.sessionController.create({ workspaceId, sessionId });
    if (created.sessionId !== sessionId) throw new WorkspaceError('SESSION_CREATE_ID_MISMATCH');
    if (!await this.isInDirectory(sessionId, directory, signal)) throw new WorkspaceError('SESSION_CWD_MISMATCH');
    await this.ctx.sessionController.rename({ sessionId, title: `${weekKey} · 全局导航` });
    delete reservation.pending;
    await this.saveIndex(sessions);
    return { sessionId, weekKey, directory, created: true };
  }
}
