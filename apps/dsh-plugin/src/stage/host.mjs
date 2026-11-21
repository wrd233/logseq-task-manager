/* global AbortSignal, fetch, setTimeout, clearTimeout */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  StageEngine,
  compactGazeSummary,
  parseStageRegistry,
} from '@task-copilot/stage-runtime';
import { readCatalog } from '../../../task-copilot-cli/src/work-catalog.ts';
import { privateDescriptor } from '../../../task-copilot-cli/src/workspace-cli.ts';
import { atomicJson } from '../../../task-copilot-cli/src/workspace-files.ts';
import { blockUrl } from '../reader-model.mjs';

const SOURCE_LABELS = {
  manual: '手动捕获',
  flomo: 'Flomo',
  logseq: 'Logseq',
  dsh: 'DSH 对话',
  browser: '网页摘录',
  other: '其他',
};

const STAGE_TOOL_SPECS = [
  ['stage_get_view', 'Read the user\'s live Shared Stage floating canvas viewport (L0-L3 zoom level, focused Area/Project, selected Inbox item, pending Ghost proposals). Wide-and-shallow gaze only; never exposes private files.', {}, []],
  ['stage_get_pulse', 'Read global Areas, dormant Areas, recent activity pulse, unassigned works, and active Inbox resonance list.', {}, []],
  ['stage_highlight', 'Highlight Area/Project node(s) in the live floating Stage. Out-of-viewport targets automatically become a non-intrusive Edge Radar pill (never hijacks camera).', {
    targetIds: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
    tone: { type: 'string', enum: ['primary', 'amber', 'teal'] },
  }, ['targetIds', 'reason']],
  ['stage_annotate', 'Attach or clear a concise Agent insight note on an Area or Project node.', {
    targetId: { type: 'string' },
    insight: { type: ['string', 'null'] },
  }, ['targetId', 'insight']],
  ['stage_propose_areas', 'Generate or propose an initial cold-start Ghost Area constellation (hard-capped at 4-7 top-level Areas; one-offs remain unassigned).', {
    areas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, workKeys: { type: 'array', items: { type: 'string' } } },
        required: ['name', 'workKeys'],
        additionalProperties: false,
      },
    },
    unassignedWorkKeys: { type: 'array', items: { type: 'string' } },
  }, []],
  ['stage_sprout_branches', 'Sprout staggered Ghost advancement branches under the focused Project or Area on the live Stage with rationale and optional Inbox link.', {
    areaId: { type: 'string' },
    projectWorkKey: { type: 'string' },
    branches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
          sourceInboxId: { type: 'string' },
          sourceInboxText: { type: 'string' },
        },
        required: ['title', 'reason'],
        additionalProperties: false,
      },
    },
  }, ['branches']],
  ['stage_propose_move', 'Preview moving a work item or triaging an Inbox item to a target Area/Project as a Ghost proposal.', {
    targetAreaId: { type: 'string' },
    targetProjectWorkKey: { type: 'string' },
    moveWorkKey: { type: 'string' },
    sourceInboxId: { type: 'string' },
    sourceInboxText: { type: 'string' },
    title: { type: 'string' },
    reason: { type: 'string' },
  }, ['targetAreaId', 'title', 'reason']],
  ['stage_resolve_proposals', 'Apply user-confirmed accept/dismiss decisions to Ghost proposals (commits accepted branches into Plan A lightweight operational state with 1-step Undo).', {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          action: { type: 'string', enum: ['accept', 'dismiss'] },
          title: { type: 'string' },
        },
        required: ['proposalId', 'action'],
        additionalProperties: false,
      },
    },
  }, ['decisions']],
];

/**
 * DSH host integration for the independent Floating Semantic-Zoom Shared Stage.
 * Proxies to Companion /stage/* & /mcp/call when online; fails open to local StageEngine when offline.
 */
export function installStageHost(ctx, { service, inboxStore }) {
  const stateDir = service.transport.stateDirectory;
  const registryPath = join(stateDir, 'stage-areas.json');
  const localEngine = new StageEngine();
  const localWaiters = new Set();
  let localLoaded = false;
  let stageOpen = false;
  let lastGazeText = '';

  async function ensureLocalLoaded() {
    if (localLoaded) return;
    localLoaded = true;
    try {
      const raw = JSON.parse(await readFile(registryPath, 'utf8'));
      localEngine.replaceRegistry(parseStageRegistry(raw));
    } catch {
      // Missing or unreadable registry starts cleanly empty.
    }
  }

  async function listInboxRaw() {
    if (!inboxStore) return [];
    try {
      const { items } = await inboxStore.list({});
      return items
        .filter(item => item.status !== 'archived' && item.status !== 'resolved')
        .map(item => ({
          id: item.id,
          text: String(item.content ?? item.originalContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 400),
          status: item.status,
          createdAt: Date.parse(item.createdAt) || Date.now(),
          updatedAt: Date.parse(item.updatedAt) || Date.now(),
          sourceLabel: SOURCE_LABELS[item.source?.type] ?? 'Inbox',
        }))
        .filter(item => item.text.length > 0);
    } catch {
      return [];
    }
  }

  async function archiveInDshInbox(ids) {
    if (!inboxStore || !Array.isArray(ids) || ids.length === 0) return;
    for (const id of ids) {
      try {
        const current = await inboxStore.get(id);
        if (current && current.status !== 'archived') {
          await inboxStore.change({ id, revision: current.revision, action: 'archive' });
        }
      } catch {
        // Ignore already-archived, missing, or non-UUID synthetic IDs.
      }
    }
  }

  async function companionPost(path, payload, signal, timeoutMs = 15000) {
    let descriptor;
    try {
      descriptor = await privateDescriptor(join(stateDir, 'workspace.json'));
    } catch {
      return null;
    }
    const cancellation = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetch(`${descriptor.baseUrl}${path}`, {
        method: 'POST',
        redirect: 'error',
        signal: cancellation,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${descriptor.token}`,
          'x-workspace-instance': descriptor.instanceId,
        },
        body: JSON.stringify(payload ?? {}),
      });
      const json = await response.json();
      if (!response.ok) throw Object.assign(Error(json?.error?.message ?? 'STAGE_COMPANION_FAILED'), { code: json?.error?.code ?? 'STAGE_COMPANION_FAILED' });
      return json.value;
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'INVALID_INPUT') throw error;
      // Companion unreachable -> fail open to local engine.
      return null;
    }
  }

  async function notifyLocalWaiters() {
    const snap = await localSnapshot();
    for (const waiter of [...localWaiters]) {
      if (snap.version > waiter.sinceVersion) {
        clearTimeout(waiter.timer);
        localWaiters.delete(waiter);
        waiter.resolve(snap);
      }
    }
  }

  async function localSnapshot() {
    await ensureLocalLoaded();
    const [catalog, inbox] = await Promise.all([readCatalog(stateDir), listInboxRaw()]);
    const snap = localEngine.buildSnapshot(catalog, inbox, Date.now());
    lastGazeText = compactGazeSummary(snap);
    return snap;
  }

  async function readState(signal) {
    const remote = await companionPost('/stage/state', {}, signal);
    if (remote) {
      lastGazeText = compactGazeSummary(remote);
      return { snapshot: remote, mode: 'companion' };
    }
    return { snapshot: await localSnapshot(), mode: 'local' };
  }

  async function runAction(action, signal) {
    const remote = await companionPost('/stage/action', { action }, signal);
    if (remote?.snapshot) {
      await archiveInDshInbox(remote.archivedInboxIds);
      lastGazeText = compactGazeSummary(remote.snapshot);
      return { snapshot: remote.snapshot, archivedInboxIds: remote.archivedInboxIds ?? [], mode: 'companion' };
    }
    await ensureLocalLoaded();
    const [catalog, inbox] = await Promise.all([readCatalog(stateDir), listInboxRaw()]);
    const result = localEngine.applyUserAction(action, { catalog, inbox, now: Date.now() });
    if (result.mutatedRegistry) {
      await atomicJson(registryPath, localEngine.getRegistry());
    }
    await archiveInDshInbox(result.archivedInboxIds);
    await notifyLocalWaiters();
    return { snapshot: await localSnapshot(), archivedInboxIds: result.archivedInboxIds, mode: 'local' };
  }

  async function waitUpdate(sinceVersion, signal) {
    const remote = await companionPost('/stage/wait', { sinceVersion, timeoutMs: 22000 }, signal, 26000);
    if (remote) {
      lastGazeText = compactGazeSummary(remote);
      return { snapshot: remote, mode: 'companion' };
    }
    const current = await localSnapshot();
    if (current.version > sinceVersion) return { snapshot: current, mode: 'local' };
    const snap = await new Promise(resolveWait => {
      const waiter = {
        sinceVersion,
        resolve: resolveWait,
        timer: setTimeout(() => {
          localWaiters.delete(waiter);
          void localSnapshot().then(resolveWait);
        }, 12000),
      };
      localWaiters.add(waiter);
      signal?.addEventListener('abort', () => {
        if (localWaiters.delete(waiter)) {
          clearTimeout(waiter.timer);
          resolveWait(current);
        }
      }, { once: true });
    });
    return { snapshot: snap, mode: 'local' };
  }

  async function executeStageTool(toolName, args, exec) {
    const clientId = `dsh:${exec?.agent?.session?.id ?? 'session'}`;
    const remote = await companionPost('/mcp/call', { name: toolName, arguments: args ?? {}, clientId }, exec?.signal);
    if (remote !== null) {
      if (toolName === 'stage_resolve_proposals' && Array.isArray(remote?.archivedInboxIds)) {
        await archiveInDshInbox(remote.archivedInboxIds);
      }
      return remote;
    }

    // Fail-open local StageEngine fallback when Companion is not running
    await ensureLocalLoaded();
    const [catalog, inbox] = await Promise.all([readCatalog(stateDir), listInboxRaw()]);
    const now = Date.now();
    if (toolName === 'stage_get_view') {
      const snap = localEngine.buildSnapshot(catalog, inbox, now);
      return { gazeSummary: compactGazeSummary(snap), viewport: snap.viewport, areas: snap.areas.length, inbox: snap.inbox, pendingGhostProposals: snap.ghostProposals, needsColdStart: snap.needsColdStart };
    }
    if (toolName === 'stage_get_pulse') {
      const snap = localEngine.buildSnapshot(catalog, inbox, now);
      return { version: snap.version, gazeSummary: compactGazeSummary(snap), areas: snap.areas, dormantAreas: snap.dormantAreas, unassignedWorks: snap.unassignedWorks.slice(0, 30), inbox: snap.inbox, pendingGhostProposals: snap.ghostProposals };
    }
    if (toolName === 'stage_highlight') {
      const out = localEngine.highlight({ targetIds: args.targetIds, reason: args.reason, ...(args.tone ? { tone: args.tone } : {}), agent: clientId }, now);
      await notifyLocalWaiters();
      return out;
    }
    if (toolName === 'stage_annotate') {
      const out = localEngine.annotate({ targetId: args.targetId, insight: args.insight }, now);
      if (out.persisted) await atomicJson(registryPath, localEngine.getRegistry());
      await notifyLocalWaiters();
      return out;
    }
    if (toolName === 'stage_propose_areas') {
      const proposal = localEngine.proposeAreas({ agent: clientId, catalog, ...(args.areas ? { areas: args.areas } : {}), ...(args.unassignedWorkKeys ? { unassignedWorkKeys: args.unassignedWorkKeys } : {}) }, now);
      await notifyLocalWaiters();
      return { proposal, writesFormalState: false };
    }
    if (toolName === 'stage_sprout_branches') {
      const proposals = localEngine.sproutBranches({ agent: clientId, ...(args.areaId ? { areaId: args.areaId } : {}), ...(args.projectWorkKey ? { projectWorkKey: args.projectWorkKey } : {}), branches: args.branches }, now);
      await notifyLocalWaiters();
      return { proposals, writesFormalState: false };
    }
    if (toolName === 'stage_propose_move') {
      const proposal = localEngine.proposeMove({ agent: clientId, ...args }, now);
      await notifyLocalWaiters();
      return { proposal, writesFormalState: false };
    }
    if (toolName === 'stage_resolve_proposals') {
      const result = localEngine.resolveProposals(args.decisions, now);
      if (result.committedIds.length > 0) await atomicJson(registryPath, localEngine.getRegistry());
      await archiveInDshInbox(result.archivedInboxIds);
      await notifyLocalWaiters();
      return { ...result, operationalLayer: 'local-plan-a' };
    }
    throw Error(`UNKNOWN_STAGE_TOOL:${toolName}`);
  }

  // Register 8 stage_* tools directly in DSH native Agent runtime
  if (ctx?.tools?.register) {
    for (const [toolName, description, properties, required] of STAGE_TOOL_SPECS) {
      ctx.tools.register({
        name: toolName,
        description,
        parameters: { type: 'object', properties, required, additionalProperties: false },
        output: {
          schema: {},
          render: (_args, value) => {
            const text = JSON.stringify(value);
            return [{ type: 'text', text: text.length <= 24000 ? text : text.slice(0, 24000) + '\n[Truncated]' }];
          },
        },
        execute: (args, exec) => executeStageTool(toolName, args, exec),
      });
    }
  }

  // Live Shared Gaze context injection (only when floating Stage window is open!)
  if (ctx?.systemPrompt?.context) {
    ctx.systemPrompt.context({
      name: 'logseq-stage:viewport',
      order: 310,
      required: false,
      interpolate: false,
      text: () => {
        if (!stageOpen || !lastGazeText) return '';
        return `[全局共视活画布已打开] 用户当前视角：${lastGazeText}。可用 stage_get_view / stage_get_pulse 读取当前画布，用 stage_highlight 点亮节点（视野外自动转为边缘雷达不抢镜头），用 stage_sprout_branches 长出虚态衍生分支，经用户拍板后用 stage_resolve_proposals 凝固落盘。`;
      },
    });
  }

  const routes = {
    'stage-state': async (_input, signal) => readState(signal),
    'stage-action': async (input, signal) => {
      if (!input || typeof input !== 'object' || !input.action) throw Object.assign(Error('INVALID_STAGE_ACTION'), { code: 'INVALID_INPUT' });
      return runAction(input.action, signal);
    },
    'stage-wait': async (input, signal) => {
      const sinceVersion = typeof input?.sinceVersion === 'number' ? input.sinceVersion : 0;
      return waitUpdate(sinceVersion, signal);
    },
    'stage-visibility': async input => {
      stageOpen = Boolean(input?.open);
      if (stageOpen) {
        try { await readState(); } catch { /* ignore */ }
      }
      return { open: stageOpen };
    },
    'stage-open-logseq': async input => {
      const ref = input?.workRef;
      if (ref?.kind === 'logseq' && ref.graphId && ref.rootUuid) {
        return { url: blockUrl(ref.graphId, ref.rootUuid) };
      }
      return { url: null };
    },
  };

  const dispose = () => {
    for (const w of localWaiters) clearTimeout(w.timer);
    localWaiters.clear();
  };

  return { routes, dispose, executeStageTool };
}
