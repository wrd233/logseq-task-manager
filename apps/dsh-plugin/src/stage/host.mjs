/* global AbortSignal, fetch, setTimeout, clearTimeout */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { workRecord, workText } from '@task-copilot/contracts';
import {
  StageEngine,
  TimeEngine,
  compactGazeSummary,
  parseStageRegistry,
  parseTimeRegistry,
} from '@task-copilot/stage-runtime';
import { readCatalog } from '../../../task-copilot-cli/src/work-catalog.ts';
import { privateDescriptor } from '../../../task-copilot-cli/src/workspace-cli.ts';
import { atomicJson } from '../../../task-copilot-cli/src/workspace-files.ts';
import { ensureStageWorkspaceDirectory, resolveStageWorkspace } from '../../../task-copilot-cli/src/stage-workspace.ts';
import { blockUrl } from '../reader-model.mjs';
import { GlobalStageSessions } from './global-session.mjs';

const SOURCE_LABELS = {
  'ios-shortcut': 'iPhone 随口记',
  manual: '手动捕获',
  flomo: 'Flomo',
  logseq: 'Logseq',
  dsh: 'DSH 对话',
  browser: '网页摘录',
  other: '其他',
};

const STAGE_TOOL_SPECS = [
  ['stage_get_view', 'Read the user\'s live Shared Stage floating canvas viewport (L0-L3 zoom level, focused Area/Project with structured subtitle/directory/parentArea/secondaryAreas/childWorks, four-state focusRole/domain, main-line mismatch alerts, selected Inbox item, cooled Inbox count, active Edge Radar, and pending Ghost proposals). Supports projectLimit/projectOffset pagination; never exposes private files.', {
    projectLimit: { type: 'integer', minimum: 1, maximum: 50 },
    projectOffset: { type: 'integer', minimum: 0 },
  }, []],
  ['stage_get_pulse', 'Read global Areas with four-state focusRole/domain/goals, main-line mismatch facts, dormant Areas, recent activity pulse, unassigned works, active/cooled Inbox list, and iCloud diagnostics. Returns compact project previews (default 8 per Area) so all Areas fit without truncation; pass areaId + projectLimit/projectOffset to paginate a single Area in full.', {
    areaId: { type: 'string' },
    projectLimit: { type: 'integer', minimum: 1, maximum: 50 },
    projectOffset: { type: 'integer', minimum: 0 },
    unassignedLimit: { type: 'integer', minimum: 0, maximum: 50 },
    inboxLimit: { type: 'integer', minimum: 0, maximum: 50 },
  }, []],
  ['stage_highlight', 'Highlight Area/Project node(s) in the live floating Stage, or pass { clear: true } to dismiss active highlights and any Edge Radar pill. Out-of-viewport targets automatically become a 90s Edge Radar pill (never hijacks camera).', {
    clear: { type: 'boolean' },
    targetIds: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
    tone: { type: 'string', enum: ['primary', 'amber', 'teal'] },
  }, []],
  ['stage_annotate', 'Attach or clear a concise Agent insight note on an Area or Project node.', {
    targetId: { type: 'string' },
    insight: { type: ['string', 'null'] },
  }, ['targetId', 'insight']],
  ['stage_propose_areas', 'Generate or propose a Ghost Area constellation (hard-capped at 4-7 top-level Areas, at most 1 main focusRole; supports four-state focusRole, work/life domain, quarterGoal, antiGoal, and weeklyMinimum; one-offs remain unassigned).', {
    areas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          workKeys: { type: 'array', items: { type: 'string' } },
          focusRole: { type: 'string', enum: ['main', 'side', 'maintenance', 'parked'] },
          domain: { type: 'string', enum: ['work', 'life'] },
          quarterGoal: { type: 'string' },
          antiGoal: { type: 'string' },
          weeklyMinimum: { type: 'string' },
        },
        required: ['name', 'workKeys'],
        additionalProperties: false,
      },
    },
    unassignedWorkKeys: { type: 'array', items: { type: 'string' } },
  }, []],
  ['stage_propose_area_role', 'Propose updating an existing Area\'s four-state focusRole (main/side/maintenance/parked), domain (work/life), quarterGoal, antiGoal, or weeklyMinimum as a Ghost proposal on the live Stage. Enforces single-main replacement; remains Ghost until confirmed.', {
    areaId: { type: 'string' },
    focusRole: { type: 'string', enum: ['main', 'side', 'maintenance', 'parked'] },
    domain: { type: 'string', enum: ['work', 'life'] },
    quarterGoal: { type: ['string', 'null'] },
    antiGoal: { type: ['string', 'null'] },
    weeklyMinimum: { type: ['string', 'null'] },
    demoteCurrentMainTo: { type: 'string', enum: ['side', 'maintenance', 'parked'] },
    reason: { type: 'string' },
  }, ['areaId', 'reason']],
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
  ['stage_resolve_proposals', 'Apply user-confirmed accept/dismiss decisions to Ghost proposals, or pass { undoLast: true } on explicit user request to roll back the single most recent Plan A commit. Rejects nonexistent proposalIds.', {
    undoLast: { type: 'boolean' },
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
  }, []],
  ['time_get_overview', 'Read-only snapshot of pure semantic time containers: current week container (3-5 moves, dynamic capacity from Apple Calendar), today\'s 3 semantic slots with remaining space, carryover tray (>=3 repeat flags), active focus, and Apple Calendar diagnostics.', {}, []],
  ['time_propose_plan', 'Stage Ghost proposals for semantic time containers (week-add-move, day-place-item, carryover-triage, day-rescue) with automatic soft-cap friction warnings. Remains Ghost until user confirms via time_resolve_proposals.', {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['week-add-move', 'day-place-item', 'carryover-triage', 'day-rescue'] },
          title: { type: 'string' },
          reason: { type: 'string' },
          weekKey: { type: 'string' },
          date: { type: 'string' },
          slotId: { type: 'string', enum: ['morning', 'afternoon', 'evening'] },
          areaId: { type: ['string', 'null'] },
          projectWorkKey: { type: ['string', 'null'] },
          weekMoveId: { type: ['string', 'null'] },
          dayItemId: { type: ['string', 'null'] },
          replaceItemId: { type: ['string', 'null'] },
          triageAction: { type: 'string', enum: ['to-today', 'to-week', 'drop'] },
        },
        required: ['kind', 'title', 'reason'],
        additionalProperties: false,
      },
    },
  }, ['proposals']],
  ['time_resolve_proposals', 'Apply user-confirmed accept/dismiss decisions to pending Ghost time proposals, or pass { undoLast: true } on explicit user request to roll back the single most recent Time commit. Rejects nonexistent proposalIds.', {
    undoLast: { type: 'boolean' },
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
  }, []],
  ['time_focus_control', 'Explicit user-triggered focus session control (start/pause/resume/finish with optional stopNote & footprint) or single-click morning main-line Apple Calendar shield creation (create_shield).', {
    command: { type: 'string', enum: ['start', 'pause', 'resume', 'finish', 'create_shield'] },
    dayItemId: { type: 'string' },
    weekMoveId: { type: 'string' },
    title: { type: 'string' },
    slotId: { type: 'string', enum: ['morning', 'afternoon', 'evening'] },
    areaId: { type: ['string', 'null'] },
    projectWorkKey: { type: ['string', 'null'] },
    focusRole: { type: 'string', enum: ['main', 'side', 'maintenance', 'parked'] },
    stopNote: { type: 'string' },
    markDayItemDone: { type: 'boolean' },
    writeFootprint: { type: 'boolean' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
  }, ['command']],
];

/**
 * DSH host integration for the independent Floating Semantic-Zoom Shared Stage.
 * Proxies to Companion /stage/* & /mcp/call when online; fails open to local StageEngine when offline.
 */
export function installStageHost(ctx, { service, inboxStore, now }) {
  const stateDir = service.transport.stateDirectory;
  const registryPath = join(stateDir, 'stage-areas.json');
  const timeRegistryPath = join(stateDir, 'time-stage.json');
  const localEngine = new StageEngine();
  const localTimeEngine = new TimeEngine();
  const localWaiters = new Set();
  let localLoaded = false;
  let stageOpen = false;
  let lastGazeText = '';
  let lastViewportCtx = null;
  const globalSessions = new GlobalStageSessions({
    ctx,
    service,
    indexDirectory: service.store?.directory ?? join(homedir(), '.dsh', 'logseq-workbench'),
    resolveWorkspace: signal => stageWorkspace(signal),
    now,
  });

  function extractViewportContext(snap) {
    if (!snap?.viewport) return null;
    const {
      activeTab = 'season',
      zoomLevel = 0,
      areaId = null,
      projectWorkKey = null,
      taskId = null,
      selectedInboxId = null,
    } = snap.viewport;
    const area = areaId ? snap.areas?.find(a => a.id === areaId) : null;
    const proj = projectWorkKey
      ? (area?.projects?.find(p => p.workKey === projectWorkKey) ??
        snap.areas?.flatMap(a => a.projects ?? []).find(p => p.workKey === projectWorkKey))
      : null;
    const task = taskId && proj ? proj.advancements?.find(t => t.id === taskId) : null;
    let layer = 'L0 季节星区';
    let focusObject;
    if (activeTab === 'week') {
      layer = '本周容器（Week）';
      const openMoves = snap.time?.weekMoves?.filter(m => m.state === 'open') ?? [];
      focusObject = openMoves.length > 0
        ? `本周已排 ${openMoves.length} 块：${openMoves.slice(0, 5).map(m => m.title).join('；')}`
        : '本周容器暂无排入项';
    } else if (activeTab === 'today') {
      layer = '今日容器（Today）';
      focusObject = snap.time?.activeFocus
        ? `正在专注「${snap.time.activeFocus.title}」`
        : `今日 ${snap.time?.today ?? ''}（昨日遗留 ${snap.time?.carryoverItems?.length ?? 0} 项）`;
    } else if (zoomLevel === 1) {
      layer = 'L1 领域切面';
      focusObject = area
        ? `领域「${area.name}」（areaId=${area.id}，角色=${area.focusRole}，域=${area.domain}，项目=${area.projects?.length ?? 0}，跨领域关联=${area.crossAreaProjects?.length ?? 0}${area.areaDirectory ? `，目录=${area.areaDirectory}` : ''}）`
        : `areaId=${areaId ?? '未知'}`;
    } else if (zoomLevel === 2) {
      layer = 'L2 项目结构树';
      focusObject = proj
        ? `项目「${proj.title}」（projectWorkKey=${proj.workKey}，主领域=${area?.name ?? areaId ?? '未知'}${proj.directory ? `，目录=${proj.directory}` : ''}，嵌套子对象=${proj.childWorks?.length ?? 0}，推进项=${proj.advancements?.length ?? 0}）`
        : `projectWorkKey=${projectWorkKey ?? '未知'}`;
    } else if (zoomLevel === 3) {
      layer = 'L3 执行入口';
      focusObject = `${proj ? `项目「${proj.title}」` : '当前项目'}${task ? ` / 推进项「${task.title}」` : ''}`;
    } else {
      const areaNames = (snap.areas ?? []).map(a => `${a.name}(${a.id}/${a.focusRole})`).slice(0, 8).join('、');
      focusObject = areaNames ? `活跃领域：${areaNames}` : '尚未生成初始星图';
    }
    return { activeTab, zoomLevel, areaId, projectWorkKey, taskId, selectedInboxId, layer, focusObject };
  }

  function rememberSnapshot(snap) {
    if (!snap) return;
    lastGazeText = compactGazeSummary(snap);
    lastViewportCtx = extractViewportContext(snap);
  }

  function formatViewportPrompt() {
    if (!stageOpen || !lastGazeText) return '';
    const detail = lastViewportCtx
      ? `当前层次：${lastViewportCtx.layer}；当前焦点对象：${lastViewportCtx.focusObject}。`
      : '';
    return `[全局共视活画布已打开] 用户当前视角：${lastGazeText}。${detail}当你回答用户关于「当前画面 / 这个领域 / 这个项目 / 这一层」的问题时，直接基于上述层次与对象回答；需要更多细节时可用 stage_get_view / stage_get_pulse / time_get_overview，用 stage_highlight 点亮节点（视野外自动转为边缘雷达不抢镜头），用 stage_propose_area_role / stage_sprout_branches / time_propose_plan 生成虚态提议，经用户拍板后用 stage_resolve_proposals / time_resolve_proposals 凝固落盘。`;
  }

  function formatGlobalPrompt(directory) {
    return [
      '[全局导航台] 当前会话是独立的全局注意力导航与复盘现场。',
      `当前复盘目录为 ${JSON.stringify(directory)}。经用户确认后，在此目录内沉淀 Logseq Page。`,
      '周复盘文件使用 复盘___YYYY-Www.md（ISO 自然周），季度星图使用 季度星图___YYYY-Qq.md（自然季度）；命名中的三个下划线对应 Logseq 命名空间。',
      '正文使用标准 "- " 大纲体，可自然使用 [[Area/...]] 与 [[项目名]] 双链。不得添加 PARA:: [[PARA/Area]] 或 PARA:: [[PARA/Project]] 等 PARA:: 标记。',
      '每次更新之前先从磁盘读取最新内容，保留用户已有记录并合并；若期间发现并发更新，重新读取后再写，禁止覆盖新内容。',
      '文件读写仅限当前复盘目录内的上述复盘与季度星图 Page，禁止越界读取或修改 Graph 内其他 Markdown 文件，禁止读取敏感凭据或仅本地（禁止上云）工作的正文。深入具体项目正文或文件时，引导用户点击星图卡片切换至对应专属工作区。',
    ].join('\n');
  }

  async function ensureLocalLoaded() {
    if (localLoaded) return;
    localLoaded = true;
    try {
      const raw = JSON.parse(await readFile(registryPath, 'utf8'));
      localEngine.replaceRegistry(parseStageRegistry(raw));
    } catch {
      // Missing or unreadable registry starts cleanly empty.
    }
    try {
      const rawTime = JSON.parse(await readFile(timeRegistryPath, 'utf8'));
      localTimeEngine.replaceRegistry(parseTimeRegistry(rawTime));
    } catch {
      // Missing or unreadable time registry starts cleanly empty.
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
          sourceType: item.source?.type ?? 'manual',
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
      if (!response.ok) {
        throw Object.assign(Error(json?.error?.message ?? 'STAGE_COMPANION_FAILED'), {
          code: json?.error?.code ?? 'STAGE_COMPANION_FAILED',
          fromCompanion: response.status >= 400 && response.status < 500 && response.status !== 401,
        });
      }
      return json.value;
    } catch (error) {
      if (error?.name === 'AbortError' || error?.fromCompanion) throw error;
      // Companion unreachable -> fail open to local engine.
      return null;
    }
  }

  async function stageWorkspace(signal, timeoutMs = 1500) {
    let remote;
    try {
      remote = await companionPost('/stage/workspace', {}, signal, timeoutMs);
    } catch (error) {
      if (error.code !== 'UNKNOWN_ROUTE') throw error;
    }
    signal?.throwIfAborted();
    if (remote) {
      const stageWorkspaceDir = await ensureStageWorkspaceDirectory(remote.stageWorkspaceDir, stateDir);
      return { stageWorkspaceDir, source: remote.source };
    }
    return resolveStageWorkspace(stateDir);
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
    const now = Date.now();
    const [catalog, inbox] = await Promise.all([readCatalog(stateDir), listInboxRaw()]);
    const timeSnap = localTimeEngine.buildSnapshot(now);
    const snap = localEngine.buildSnapshot(catalog, inbox, now, undefined, undefined, timeSnap);
    rememberSnapshot(snap);
    return snap;
  }

  async function readState(signal) {
    const remote = await companionPost('/stage/state', {}, signal);
    if (remote) {
      rememberSnapshot(remote);
      return { snapshot: remote, mode: 'companion' };
    }
    return { snapshot: await localSnapshot(), mode: 'local' };
  }

  async function runAction(action, signal) {
    const remote = await companionPost('/stage/action', { action }, signal);
    if (remote?.snapshot) {
      await archiveInDshInbox(remote.archivedInboxIds);
      rememberSnapshot(remote.snapshot);
      return {
        snapshot: remote.snapshot,
        archivedInboxIds: remote.archivedInboxIds ?? [],
        ...(remote.warning ? { warning: remote.warning } : {}),
        mode: 'companion',
      };
    }
    await ensureLocalLoaded();
    const now = Date.now();
    if (action?.type === 'time' && action.action) {
      const res = localTimeEngine.applyAction(action.action, now);
      if (res.mutatedRegistry) {
        await atomicJson(timeRegistryPath, localTimeEngine.getRegistry());
      }
      localEngine.touchVersion();
      await notifyLocalWaiters();
      return { snapshot: await localSnapshot(), archivedInboxIds: [], mode: 'local' };
    }
    const [catalog, inbox] = await Promise.all([readCatalog(stateDir), listInboxRaw()]);
    const result = localEngine.applyUserAction(action, { catalog, inbox, now });
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
      rememberSnapshot(remote);
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
      return {
        gazeSummary: compactGazeSummary(snap),
        viewport: snap.viewport,
        areas: snap.areas.length,
        mismatchSignals: snap.mismatchSignals,
        cooledInboxCount: snap.cooledInboxCount,
        inbox: snap.inbox,
        pendingGhostProposals: snap.ghostProposals,
        needsColdStart: snap.needsColdStart,
      };
    }
    if (toolName === 'stage_get_pulse') {
      const snap = localEngine.buildSnapshot(catalog, inbox, now);
      return {
        version: snap.version,
        gazeSummary: compactGazeSummary(snap),
        mismatchSignals: snap.mismatchSignals,
        areas: snap.areas,
        dormantAreas: snap.dormantAreas,
        unassignedWorks: snap.unassignedWorks.slice(0, 30),
        inbox: snap.inbox,
        cooledInboxCount: snap.cooledInboxCount,
        pendingGhostProposals: snap.ghostProposals,
      };
    }
    if (toolName === 'stage_highlight') {
      if (args?.clear === true) {
        const out = localEngine.clearHighlightsAndRadar();
        await notifyLocalWaiters();
        return out;
      }
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
    if (toolName === 'stage_propose_area_role') {
      let proposal;
      try {
        proposal = localEngine.proposeAreaRole({ agent: clientId, ...args }, now);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('MAIN_ROLE_CONFLICT:')) {
          throw Object.assign(Error('四态护栏：已有待确认的本季主线提议，同一轮最多只能提议 1 个主线；请先确认或驳回原提议。'), { code: 'INVALID_INPUT' });
        }
        throw error;
      }
      if (!proposal) throw Object.assign(Error(`未找到目标领域：${args?.areaId ?? ''}`), { code: 'INVALID_INPUT' });
      await notifyLocalWaiters();
      return { proposal, writesFormalState: false };
    }
    if (toolName === 'stage_sprout_branches') {
      if (args?.areaId && localEngine.hasAreas() && !localEngine.hasArea(args.areaId)) {
        throw Object.assign(Error(`未找到目标领域：${args.areaId}`), { code: 'INVALID_INPUT' });
      }
      const proposals = localEngine.sproutBranches({ agent: clientId, ...(args.areaId ? { areaId: args.areaId } : {}), ...(args.projectWorkKey ? { projectWorkKey: args.projectWorkKey } : {}), branches: args.branches }, now);
      await notifyLocalWaiters();
      return { proposals, writesFormalState: false };
    }
    if (toolName === 'stage_propose_move') {
      const proposal = localEngine.proposeMove({ agent: clientId, ...args }, now);
      if (!proposal) throw Object.assign(Error(`未找到目标领域：${args?.targetAreaId ?? ''}`), { code: 'INVALID_INPUT' });
      await notifyLocalWaiters();
      return { proposal, writesFormalState: false };
    }
    if (toolName === 'stage_resolve_proposals') {
      if (args?.undoLast === true) {
        if (!localEngine.canUndo()) throw Object.assign(Error('当前没有可撤销的上一步领域层凝固操作。'), { code: 'NOTHING_TO_UNDO' });
        localEngine.undoLastCommit();
        await atomicJson(registryPath, localEngine.getRegistry());
        await notifyLocalWaiters();
        return { undone: true, canUndo: false, operationalLayer: 'local-plan-a' };
      }
      const missing = localEngine.findMissingProposalIds(args.decisions ?? []);
      if (missing.length > 0) throw Object.assign(Error(`未找到待确认的虚态提议：${missing.join(', ')}`), { code: 'PROPOSAL_NOT_FOUND' });
      const result = localEngine.resolveProposals(args.decisions, now);
      if (result.committedIds.length > 0) await atomicJson(registryPath, localEngine.getRegistry());
      await archiveInDshInbox(result.archivedInboxIds);
      await notifyLocalWaiters();
      return { ...result, operationalLayer: 'local-plan-a' };
    }
    if (toolName === 'time_get_overview') {
      return localTimeEngine.buildSnapshot(now);
    }
    if (toolName === 'time_propose_plan') {
      const proposals = localTimeEngine.proposeTimePlan({ agent: clientId, proposals: args.proposals ?? [] }, now);
      localEngine.touchVersion();
      await notifyLocalWaiters();
      return { proposals, writesFormalState: false };
    }
    if (toolName === 'time_resolve_proposals') {
      if (args?.undoLast === true) {
        if (!localTimeEngine.canUndo()) throw Object.assign(Error('当前没有可撤销的上一步时间层凝固操作。'), { code: 'NOTHING_TO_UNDO' });
        localTimeEngine.undoLastCommit();
        await atomicJson(timeRegistryPath, localTimeEngine.getRegistry());
        localEngine.touchVersion();
        await notifyLocalWaiters();
        return { undone: true, canUndo: false, operationalLayer: 'local-time-stage' };
      }
      const missing = localTimeEngine.findMissingProposalIds(args.decisions ?? []);
      if (missing.length > 0) throw Object.assign(Error(`未找到待确认的时间虚态提议：${missing.join(', ')}`), { code: 'PROPOSAL_NOT_FOUND' });
      const result = localTimeEngine.resolveTimeProposals(args.decisions ?? [], now);
      if (result.committedIds.length > 0) await atomicJson(timeRegistryPath, localTimeEngine.getRegistry());
      localEngine.touchVersion();
      await notifyLocalWaiters();
      return { ...result, operationalLayer: 'local-time-stage' };
    }
    if (toolName === 'time_focus_control') {
      const cmd = args?.command;
      if ((cmd === 'pause' || cmd === 'resume' || cmd === 'finish') && !localTimeEngine.getActiveFocus()) {
        throw Object.assign(Error('当前没有进行中的专注会话。'), { code: 'NO_ACTIVE_FOCUS' });
      }
      const actionMap = {
        start: { type: 'start-focus', ...args },
        pause: { type: 'pause-focus' },
        resume: { type: 'resume-focus' },
        finish: { type: 'finish-focus', ...(args?.stopNote ? { stopNote: args.stopNote } : {}), ...(args?.markDayItemDone ? { markDayItemDone: true } : {}) },
      };
      if (!actionMap[cmd]) throw Object.assign(Error(`OFFLINE_UNSUPPORTED_COMMAND:${cmd}`), { code: 'INVALID_INPUT' });
      const res = localTimeEngine.applyAction(actionMap[cmd], now);
      if (res.mutatedRegistry) await atomicJson(timeRegistryPath, localTimeEngine.getRegistry());
      localEngine.touchVersion();
      await notifyLocalWaiters();
      return { command: cmd, overview: localTimeEngine.buildSnapshot(now), ...res };
    }
    throw Error(`UNKNOWN_STAGE_TOOL:${toolName}`);
  }

  // Register 9 stage_* + 4 time_* tools directly in DSH native Agent runtime
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
            return [{ type: 'text', text: text.length <= 48000 ? text : text.slice(0, 48000) + '\n[Truncated]' }];
          },
        },
        execute: (args, exec) => executeStageTool(toolName, args, exec),
      });
    }
  }

  // Live Shared Gaze context injection (only when floating/peek Stage window is active!)
  if (ctx?.systemPrompt?.context) {
    ctx.systemPrompt.context({
      name: 'logseq-stage:viewport',
      order: 310,
      required: false,
      interpolate: false,
      text: () => formatViewportPrompt(),
    });
  }
  if (typeof ctx?.on === 'function') {
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      let globalPrompt = '';
      if (stageOpen) {
        try {
          const remote = await companionPost('/stage/state', {}, undefined, 800);
          if (remote) rememberSnapshot(remote);
        } catch {
          // Keep last known snapshot on timeout or offline fallback.
        }
        const sessionId = context.scope?.session?.id;
        if (sessionId) {
          try {
            const { stageWorkspaceDir } = await stageWorkspace(context.signal, 800);
            if (await globalSessions.isInDirectory(sessionId, stageWorkspaceDir, context.signal)) globalPrompt = formatGlobalPrompt(stageWorkspaceDir);
          } catch {
            // A directory that cannot be verified must not grant review-file access.
          }
        }
      }
      const formed = await next();
      const text = [formatViewportPrompt(), stageOpen ? globalPrompt : ''].filter(Boolean).join('\n');
      const others = (formed.contexts ?? []).filter(c => c.name !== 'logseq-stage:viewport');
      return text
        ? { ...formed, contexts: [...others, { name: 'logseq-stage:viewport', text, interpolate: false }] }
        : { ...formed, contexts: others };
    });
  }

  const routes = {
    'stage-state': async (_input, signal) => readState(signal),
    'stage-workspace': async (input, signal) => {
      const raw = workRecord(input, ['sessionId']);
      const sessionId = raw.sessionId === undefined ? undefined : workText(raw.sessionId);
      const workspace = await stageWorkspace(signal);
      return { ...workspace, active: await globalSessions.isInDirectory(sessionId, workspace.stageWorkspaceDir, signal) };
    },
    'stage-enter-global': (input, signal) => {
      workRecord(input, []);
      return globalSessions.enter(signal);
    },
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

  return { routes, dispose, executeStageTool, ownsSession: sessionId => globalSessions.ownsSession(sessionId) };
}
