import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workKey } from '@task-copilot/contracts';
import { publishCatalog } from '../../task-copilot-cli/src/work-catalog.ts';
import { startWorkspaceServer } from '../../task-copilot-cli/src/workspace-server.ts';
import { PersonalInboxStore } from '../src/personal-inbox/store.mjs';
import { installStageHost } from '../src/stage/host.mjs';
import { isoWeekKey } from '../src/stage/global-session.mjs';
import { BindingStore } from '../src/service.mjs';
import process from 'node:process';

test('DSH stage host registers 13 stage_*/time_* tools, injects gaze only when window is open, and syncs PersonalInboxStore', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tc-dsh-stage-')));
  const stateDir = join(root, 'state');
  const inboxDir = join(root, 'inbox');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await mkdir(inboxDir, { recursive: true, mode: 0o700 });

  const inboxStore = new PersonalInboxStore(inboxDir);
  await inboxStore.load();
  const createdInbox = await inboxStore.create({
    id: '22222222-2222-4222-8222-222222222222',
    originalContent: '核心告警降噪升级中补充维护窗口抑制规则',
    source: { type: 'manual' },
  });

  const workRef = { kind: 'logseq', graphId: 'graph:/dsh-test', rootUuid: 'blk-1', sourceKind: 'block' };
  await publishCatalog(stateDir, {
    schemaVersion: 1,
    graphId: 'graph:/dsh-test',
    graphName: 'DSH Test',
    refreshedAt: Date.now(),
    works: [
      { workRef, title: '核心告警降噪升级', objectType: 'MiniProject', location: '监控平台 / 告警', updatedAt: Date.now() - 1000 },
      { workRef: { kind: 'logseq', graphId: 'graph:/dsh-test', rootUuid: 'blk-2', sourceKind: 'block' }, title: '网络割接演练', objectType: 'Project', location: '基础设施 / 网络', updatedAt: Date.now() - 1000 },
    ],
  });

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: inboxDir,
    icloudInboxDirectory: join(root, 'icloud-empty'),
    watchIcloud: false,
    appleCalendar: { disabled: true },
  });
  const registeredTools = new Map();
  let gazeProvider = null;
  let assembleHook = null;
  const fakeCtx = {
    tools: { register: spec => registeredTools.set(spec.name, spec) },
    systemPrompt: { context: spec => { if (spec.name === 'logseq-stage:viewport') gazeProvider = spec.text; } },
    on: (event, fn) => { if (event === 'system-prompt/assemble') assembleHook = fn; },
  };
  const stage = installStageHost(fakeCtx, {
    service: { transport: { stateDirectory: stateDir } },
    inboxStore,
  });

  try {
    assert.equal(registeredTools.size, 13);
    assert.ok(registeredTools.has('stage_get_view'));
    assert.ok(registeredTools.has('stage_propose_area_role'));
    assert.ok(registeredTools.has('stage_sprout_branches'));
    assert.ok(registeredTools.has('time_get_overview'));
    assert.ok(registeredTools.has('time_propose_plan'));
    assert.ok(registeredTools.has('time_resolve_proposals'));
    assert.ok(registeredTools.has('time_focus_control'));

    // Closed window injects empty gaze string
    assert.equal(gazeProvider(), '');

    // Opening floating window activates live gaze injection
    await stage.routes['stage-visibility']({ open: true });
    assert.match(gazeProvider(), /全局共视活画布已打开/);

    // DSH native tool calls proxy straight through Companion
    const proposed = await registeredTools.get('stage_propose_areas').execute({}, { agent: { session: { id: 'sess-1' } } });
    const draftId = proposed.proposal.id;
    await registeredTools.get('stage_resolve_proposals').execute(
      { decisions: [{ proposalId: draftId, action: 'accept' }] },
      { agent: { session: { id: 'sess-1' } } },
    );

    const pulseAfterCold = await registeredTools.get('stage_get_pulse').execute({}, { agent: { session: { id: 'sess-1' } } });
    const firstAreaId = pulseAfterCold.areas[0].id;
    const roleProp = await registeredTools.get('stage_propose_area_role').execute(
      { areaId: firstAreaId, focusRole: 'main', domain: 'work', reason: '锁定主线领域' },
      { agent: { session: { id: 'sess-1' } } },
    );
    await registeredTools.get('stage_resolve_proposals').execute(
      { decisions: [{ proposalId: roleProp.proposal.id, action: 'accept' }] },
      { agent: { session: { id: 'sess-1' } } },
    );
    const pulseAfterRole = await registeredTools.get('stage_get_pulse').execute({}, { agent: { session: { id: 'sess-1' } } });
    assert.equal(pulseAfterRole.areas.find(a => a.id === firstAreaId).focusRole, 'main');

    // Navigating viewport in Companion (e.g. from Logseq) is picked up on system-prompt/assemble with exact layer & object!
    await server.stageHub.applyAction({
      type: 'set-viewport',
      source: 'logseq',
      viewport: { activeTab: 'season', zoomLevel: 2, areaId: firstAreaId, projectWorkKey: workKey(workRef), taskId: null },
    });
    assert.ok(assembleHook, 'system-prompt/assemble hook should be registered');
    const assembled = await assembleHook({}, {}, async () => ({ contexts: [] }));
    const stageCtx = assembled.contexts.find(c => c.name === 'logseq-stage:viewport');
    assert.ok(stageCtx, 'assembled system prompt must contain live logseq-stage:viewport');
    assert.match(stageCtx.text, /当前层次：L2 项目结构树/);
    assert.match(stageCtx.text, /核心告警降噪升级/);

    // Time tools proxy cleanly through Companion
    const timeProposed = await registeredTools.get('time_propose_plan').execute(
      { proposals: [{ kind: 'week-add-move', title: '完成核心告警降噪闭环', areaId: firstAreaId, reason: '本周主线块' }] },
      { agent: { session: { id: 'sess-1' } } },
    );
    await registeredTools.get('time_resolve_proposals').execute(
      { decisions: [{ proposalId: timeProposed.proposals[0].id, action: 'accept' }] },
      { agent: { session: { id: 'sess-1' } } },
    );
    const timeOverview = await registeredTools.get('time_get_overview').execute({}, { agent: { session: { id: 'sess-1' } } });
    assert.equal(timeOverview.weekMoves.length, 1);

    // Companion 400 validation errors propagate directly instead of falling back to offline local engine
    await assert.rejects(
      () => registeredTools.get('stage_resolve_proposals').execute(
        { decisions: [{ proposalId: 'ghost-missing', action: 'accept' }] },
        { agent: { session: { id: 'sess-1' } } },
      ),
      { code: 'PROPOSAL_NOT_FOUND' },
    );
    await assert.rejects(
      () => registeredTools.get('time_focus_control').execute(
        { command: 'finish' },
        { agent: { session: { id: 'sess-1' } } },
      ),
      { code: 'NO_ACTIVE_FOCUS' },
    );

    const sprouted = await registeredTools.get('stage_sprout_branches').execute(
      {
        projectWorkKey: workKey(workRef),
        branches: [{ title: '维护窗口抑制规则落地', reason: '承接 Inbox 线索', sourceInboxId: createdInbox.id }],
      },
      { agent: { session: { id: 'sess-1' } } },
    );
    const ghostId = sprouted.proposals[0].id;

    // Resolving via DSH route solidifies in Companion AND archives the real DSH PersonalInboxStore item!
    const res = await stage.routes['stage-action']({
      action: { type: 'resolve-proposals', decisions: [{ proposalId: ghostId, action: 'accept' }] },
    });
    assert.equal(res.mode, 'companion');
    assert.deepEqual(res.archivedInboxIds, [createdInbox.id]);

    const afterInbox = await inboxStore.get(createdInbox.id);
    assert.equal(afterInbox.status, 'archived', 'Consumed Inbox item should be archived cleanly in PersonalInboxStore');

    // Closing window suppresses prompt gaze injection again
    await stage.routes['stage-visibility']({ open: false });
    assert.equal(gazeProvider(), '');
  } finally {
    stage.dispose();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('ISO weekly conversations use local calendar dates including the ISO week-year boundary', () => {
  const dates = [
    [new Date(2020, 11, 28), '2020-W53'],
    [new Date(2021, 0, 3, 23, 59, 59), '2020-W53'],
    [new Date(2021, 0, 4), '2021-W01'],
    [new Date(2024, 11, 29, 23, 59, 59), '2024-W52'],
    [new Date(2024, 11, 30), '2025-W01'],
    [new Date(2026, 10, 22), '2026-W47'],
    [new Date(2026, 10, 23), '2026-W48'],
  ];
  for (const [date, key] of dates) assert.equal(isoWeekKey(date), key);
});

test('stage-enter-global serializes weekly native sessions, recovers invalid entries, and remains independent of BindingStore', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tc-stage-sessions-')));
  const stateDir = join(root, 'state'), graph = join(root, 'graph'), graphB = join(root, 'graph-b');
  const graphDirectory = join(graph, 'pages', 'stage-reviews'), graphDirectoryB = join(graphB, 'pages', 'stage-reviews');
  await Promise.all([mkdir(graph), mkdir(graphB)]);
  const store = new BindingStore(join(root, 'bindings'));
  await store.load();
  const workspaces = new Map(), sessions = new Map(), archivedSessionIds = [];
  let now = new Date(2020, 11, 31), creates = 0, loseReply = false;
  const ctx = {
    workspaceController: {
      async create({ path }) {
        const workspaceId = path, created = !workspaces.has(path);
        if (created) workspaces.set(path, { workspaceId, path });
        return { workspace: workspaces.get(path), created };
      },
      async rename({ workspaceId, title }) {
        if ([...workspaces.values()].some(workspace => workspace.workspaceId !== workspaceId && workspace.title === title)) {
          throw Object.assign(Error('duplicate native workspace title'), { code: 'workspace/name-conflict' });
        }
        workspaces.get(workspaceId).title = title;
      },
    },
    workspaceRegistry: { archivedSessionIds, list: () => [...workspaces.values()] },
    sessionController: {
      async list() { return { items: [...sessions].map(([sessionId, session]) => ({ sessionId, cwd: session.meta.cwd })) }; },
      async inspect(id) {
        if (!sessions.has(id)) throw Object.assign(Error('missing'), { code: 'SESSION_NOT_FOUND' });
        return sessions.get(id);
      },
      async create({ workspaceId, sessionId }) {
        creates++;
        sessions.set(sessionId, { meta: { cwd: workspaces.get(workspaceId).path } });
        if (loseReply) { loseReply = false; throw Error('lost native reply'); }
        return { sessionId };
      },
      async rename({ sessionId, title }) { sessions.get(sessionId).title = title; },
    },
  };
  const server = await startWorkspaceServer({
    stateDirectory: stateDir, inboxDirectory: join(root, 'inbox'), icloudInboxDirectory: join(root, 'icloud'),
    watchIcloud: false, appleCalendar: { disabled: true },
  });
  const oldOverride = process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
  delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
  const stage = installStageHost(ctx, { service: { transport: { stateDirectory: stateDir }, store }, now: () => now });
  const enter = () => stage.routes['stage-enter-global']({});
  let stopped = false;
  try {
    await server.stageHub.reportActiveGraph({ graphId: 'g', graphPath: graph });
    const [first, parallel] = await Promise.all([enter(), enter()]);
    assert.equal(first.created, true);
    assert.deepEqual(parallel, { ...first, created: false });
    assert.equal(creates, 1);
    assert.equal(first.directory, graphDirectory);
    assert.equal(workspaces.get(graphDirectory).title, '全局导航台');
    assert.equal(sessions.get(first.sessionId).title, '2020-W53 · 全局导航');
    workspaces.delete(graphDirectory);
    assert.equal((await enter()).sessionId, first.sessionId, 'recreate a deleted workspace registration without losing its valid weekly session');
    assert.equal(workspaces.get(graphDirectory).title, '全局导航台');
    now = new Date(2021, 0, 3, 23, 59);
    assert.equal((await enter()).sessionId, first.sessionId);

    now = new Date(2021, 0, 4);
    const nextWeek = await enter();
    assert.equal(nextWeek.weekKey, '2021-W01');
    assert.notEqual(nextWeek.sessionId, first.sessionId);
    archivedSessionIds.push(nextWeek.sessionId);
    const afterArchive = await enter();
    assert.notEqual(afterArchive.sessionId, nextWeek.sessionId);
    sessions.delete(afterArchive.sessionId);
    const afterDelete = await enter();
    assert.notEqual(afterDelete.sessionId, afterArchive.sessionId);
    sessions.get(afterDelete.sessionId).meta.cwd = root;
    const afterCwdChange = await enter();
    assert.notEqual(afterCwdChange.sessionId, afterDelete.sessionId);
    assert.equal(sessions.get(afterCwdChange.sessionId).meta.cwd, graphDirectory);

    await server.stageHub.reportActiveGraph({ graphId: 'g-b', graphPath: graphB });
    const afterGraphChange = await enter();
    assert.notEqual(afterGraphChange.sessionId, afterCwdChange.sessionId);
    assert.equal(afterGraphChange.directory, graphDirectoryB);
    assert.equal(workspaces.get(graphDirectoryB).title, '全局导航台 · graph-b');
    assert.equal(workspaces.get(graphDirectory).title, '全局导航台');
    assert.equal(await stage.ownsSession(first.sessionId), true);
    assert.equal(await stage.ownsSession(afterCwdChange.sessionId), true);

    // Restart the plugin (read index from disk) and reuse without consulting any binding.
    const restarted = installStageHost(ctx, { service: { transport: { stateDirectory: stateDir }, store }, now: () => now });
    assert.equal((await restarted.routes['stage-enter-global']({})).sessionId, afterGraphChange.sessionId);
    restarted.dispose();

    now = new Date(2021, 0, 11);
    loseReply = true;
    await assert.rejects(enter(), /lost native reply/);
    const countAfterLostReply = creates;
    const recovered = await enter();
    assert.equal(creates, countAfterLostReply);
    assert.equal(sessions.get(recovered.sessionId).title, '2021-W02 · 全局导航');

    // Companion is authoritative when reachable, including its configured override.
    const override = join(root, 'override');
    process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR = override;
    assert.equal((await enter()).directory, override);
    await server.close(); stopped = true;
    const companionOverride = join(root, 'companion-reviews');
    const configuredServer = await startWorkspaceServer({
      stateDirectory: stateDir, stageWorkspaceDirectory: companionOverride, inboxDirectory: join(root, 'inbox'),
      icloudInboxDirectory: join(root, 'icloud'), watchIcloud: false, appleCalendar: { disabled: true },
    });
    try {
      assert.equal((await enter()).directory, companionOverride, 'the live Companion takes precedence over the DSH environment');
    } finally { await configuredServer.close(); }
    assert.equal((await enter()).directory, override);
    delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
    const offline = await enter();
    assert.equal(offline.directory, join(stateDir, 'stage-workspace'));
    assert.ok((await lstat(offline.directory)).isDirectory());
    assert.equal(store.bindings.size, 0);
    assert.equal(store.associations.size, 0);
    await assert.rejects(lstat(join(store.directory, 'bindings.json')), { code: 'ENOENT' });
    const persisted = JSON.parse(await readFile(join(store.directory, 'stage-sessions.json'), 'utf8'));
    assert.equal(persisted.sessions.at(-1).sessionId, offline.sessionId);
    assert.ok(persisted.sessions.every(row => !row.pending && !row.workRef && !row.binding));
  } finally {
    stage.dispose();
    if (!stopped) await server.close();
    if (oldOverride === undefined) delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
    else process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR = oldOverride;
    await rm(root, { recursive: true, force: true });
  }
});
