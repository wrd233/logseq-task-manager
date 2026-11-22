import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workKey } from '@task-copilot/contracts';
import { publishCatalog } from '../../task-copilot-cli/src/work-catalog.ts';
import { startWorkspaceServer } from '../../task-copilot-cli/src/workspace-server.ts';
import { PersonalInboxStore } from '../src/personal-inbox/store.mjs';
import { installStageHost } from '../src/stage/host.mjs';

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
