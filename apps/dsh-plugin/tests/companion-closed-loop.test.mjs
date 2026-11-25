/* global fetch, setTimeout, AbortController, Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { apply } from '../src/index.mjs';
import { readingModel } from '../src/reading-model.mjs';
import { startWorkspaceServer } from '../../task-copilot-cli/src/workspace-server.ts';
import { workKeyForScope } from '../../task-copilot-cli/src/collaborate.ts';

const sha = value => createHash('sha256').update(value).digest('hex');

async function pluginPost(descriptor, route, payload) {
  const res = await fetch(`${descriptor.baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workspace-plugin': descriptor.pluginToken,
      'x-workspace-instance': descriptor.instanceId,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(Error(body.error?.message ?? route), { code: body.error?.code });
  return body;
}

function startLogseqResponder(descriptor, connectionId, handler) {
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        const polled = await pluginPost(descriptor, '/plugin/poll', { connectionId, busy: false });
        const delivery = polled.delivery;
        if (delivery) {
          try {
            const value = await handler(delivery);
            await pluginPost(descriptor, '/plugin/complete', {
              connectionId,
              requestId: delivery.requestId,
              clientId: delivery.clientId,
              value,
            });
          } catch (error) {
            await pluginPost(descriptor, '/plugin/complete', {
              connectionId,
              requestId: delivery.requestId,
              clientId: delivery.clientId,
              error: { code: error.code ?? 'PLUGIN_ERROR', message: error.message ?? 'error' },
            });
          }
          continue;
        }
      } catch {
        if (stopped) break;
      }
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  })();
  return {
    async stop() {
      stopped = true;
      await loop.catch(() => {});
    },
  };
}

function createFakeDshHost(sessionsById) {
  const routes = new Map();
  const tools = new Map();
  const disposeHandlers = [];
  const promptAssemblers = [];
  const promptContexts = new Map();
  const workspaces = new Map();
  let promptInstructions = '';
  const ctx = {
    connection: {
      fetch: {
        register(spec) {
          routes.set(spec.path, spec.fetch);
          return () => routes.delete(spec.path);
        },
      },
    },
    sessionController: {
      async inspect(sessionId) {
        const found = sessionsById.get(sessionId);
        if (!found) throw Object.assign(Error('missing'), { code: 'SESSION_NOT_FOUND' });
        return found;
      },
      async list() {
        return { items: [...sessionsById.keys()].map(sessionId => ({ sessionId })) };
      },
      async openWorkspacePath() { return { opened: true }; },
      async create({ workspaceId, sessionId }) {
        const id = sessionId ?? 'sess-new';
        sessionsById.set(id, { sessionId: id, meta: { cwd: workspaces.get(workspaceId).path } });
        return { sessionId: id, workspaceId };
      },
      async rename({ sessionId, title }) { sessionsById.get(sessionId).title = title; },
    },
    workspaceController: {
      async create({ path }) {
        const workspaceId = `ws:${path}`, created = !workspaces.has(workspaceId);
        if (created) workspaces.set(workspaceId, { workspaceId, path });
        return { workspace: workspaces.get(workspaceId), created };
      },
      async initializeDefault() { return { workspace: { workspaceId: 'ws:default' }, created: false }; },
      async rename({ workspaceId, title }) { workspaces.get(workspaceId).title = title; },
    },
    workspaceRegistry: {
      archivedSessionIds: [],
      list() { return []; },
    },
    tools: {
      register(spec) {
        tools.set(spec.name, spec);
      },
    },
    systemPrompt: {
      section(spec) {
        if (spec.name === 'logseq-workbench:instructions') promptInstructions = spec.text;
      },
      context(spec) {
        promptContexts.set(spec.name, spec.text);
      },
    },
    get() { return null; },
    effect(fn) {
      const cleanup = fn();
      if (typeof cleanup === 'function') disposeHandlers.push(cleanup);
    },
    on(event, fn) {
      if (event === 'dispose') disposeHandlers.push(fn);
      if (event === 'system-prompt/assemble') promptAssemblers.push(fn);
    },
  };
  async function rpc(endpoint, payload) {
    const handler = routes.get(`/api/logseq-workbench/${endpoint}`);
    assert.ok(handler, `missing route ${endpoint}`);
    const response = await handler({
      json: async () => ({ type: 'client-request', method: `logseq-workbench/${endpoint}`, rpcId: 'rpc-1', payload }),
      signal: new AbortController().signal,
    });
    const envelope = await response.json();
    return envelope.result;
  }
  async function invokeTool(name, args, sessionId) {
    const tool = tools.get(name);
    assert.ok(tool, `missing tool ${name}`);
    return tool.execute(args, { agent: { session: { id: sessionId } }, signal: new AbortController().signal });
  }
  async function assemblePrompt(sessionId, agent = { session: { id: sessionId } }) {
    agent.session.id = sessionId;
    const context = { scope: agent };
    const initial = { contexts: [...promptContexts].map(([name, provider]) => ({ name, text: provider(context) })).filter(c => c.text) };
    const assemble = index => promptAssemblers[index]
      ? promptAssemblers[index](initial, context, () => assemble(index + 1))
      : Promise.resolve(initial);
    const result = await assemble(0);
    const entry = result.contexts.find(c => c.name === 'logseq-workbench:current');
    return { text: entry?.text ?? '', instructions: promptInstructions, contexts: result.contexts };
  }
  async function dispose() {
    for (const fn of disposeHandlers.splice(0)) await fn();
  }
  return { ctx, rpc, invokeTool, assemblePrompt, dispose, tools };
}

test('DSH closed loop: D-41 privacy & sensitive blocking, writeback FLIP proposal, reading candidate, and ReadingJobHub start', async t => {
  const previousSkip = process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
  process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = '1';
  t.after(() => {
    if (previousSkip === undefined) delete process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
    else process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = previousSkip;
  });
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-closed-loop-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previousInbox = process.env.PERSONAL_INBOX_HOME;
  const previousStageDirectory = process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
  process.env.PERSONAL_INBOX_HOME = join(root, 'inbox');
  delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
  t.after(() => {
    if (previousInbox === undefined) delete process.env.PERSONAL_INBOX_HOME;
    else process.env.PERSONAL_INBOX_HOME = previousInbox;
    if (previousStageDirectory === undefined) delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
    else process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR = previousStageDirectory;
  });

  const stateDir = join(root, 'companion-state');
  const bindingDir = join(root, 'dsh-bindings');
  const workDir = join(root, 'work-a');
  const workDirB = join(root, 'work-b');
  await mkdir(workDir, { recursive: true });
  await mkdir(workDirB, { recursive: true });
  await writeFile(join(workDir, 'design.md'), '# Architecture\nNormal design doc.');
  await writeFile(join(workDir, '.env.local'), 'SECRET_TOKEN=super-secret-value\n');
  await writeFile(join(workDir, 'prod-secret.pem'), '-----BEGIN PRIVATE KEY-----\nTOPSECRET\n');

  let providerCalls = 0;
  const providerPayloads = [];
  const fakeFetch = async (_url, init) => {
    providerCalls++;
    const bodyText = typeof init?.body === 'string' ? init.body : '';
    providerPayloads.push(bodyText);
    if (providerCalls === 1) {
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              tool_calls: [{ id: 'tc-1', type: 'function', function: { name: 'logseq_reading_request', arguments: '{}' } }],
            },
          }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (providerCalls === 2) {
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              tool_calls: [{ id: 'tc-2', type: 'function', function: { name: 'logseq_source_read', arguments: JSON.stringify({ sourceIds: ['s1'] }) } }],
            },
          }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{
              id: 'tc-3',
              type: 'function',
              function: {
                name: 'logseq_reading_submit',
                arguments: JSON.stringify({
                  paragraphs: [
                    {
                      key: 'overview',
                      markdown: '当前正在推进 DSH 与 Companion 的双向闭环联调。',
                      kind: 'fact',
                      sourceIds: ['s1'],
                    },
                  ],
                }),
              },
            }],
          },
        }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: join(root, 'inbox'),
    icloudInboxDirectory: join(root, 'icloud'),
    watchIcloud: false,
    appleCalendar: { disabled: true },
    offlineMs: 60_000,
    reading: {
      env: { DEEPSEEK_API_KEY: 'sk-test-dsh-closed-loop' },
      fetchImpl: fakeFetch,
      dshAvailable: async () => false,
    },
  });
  t.after(() => server.close());

  const scopeA = { graphId: 'Lab:/private/graph', rootUuid: 'aaaa1111-0000-4000-8000-000000000001', kind: 'page', pageName: 'DSH 闭环推进' };
  const settledWorkKeyA = JSON.stringify([scopeA.graphId, 'page:dsh-closed-loop', 'page']);
  const bindingA = { scope: scopeA, directory: workDir, provider: 'workspace', workspaceId: 'ws-a', organization: 'flat' };
  const connectionIdA = 'conn-a-1';

  await mkdir(join(workDir, '.task-workspace'), { recursive: true });
  await writeFile(join(workDir, 'WORKSPACE.md'), '# DSH 闭环推进\n');
  await writeFile(join(workDir, '.task-workspace', 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    workspaceId: 'ws-a',
    primarySource: scopeA,
    organization: 'flat',
    entryFile: 'WORKSPACE.md',
  }));

  const block1Text = '推进 DSH 与 Companion 双向闭环，确保 [[隐私策略]] 和 120ms 超时阈值都被核验。';
  const block2Text = 'TODO 不可由提案静默修改的任务';
  const block1Version = sha(block1Text);
  const block2Version = sha(block2Text);
  const snapshotA = {
    scope: scopeA,
    capturedAt: '2026-11-21T06:00:00Z',
    structureVersion: 'struct-v1',
    sourceSetVersion: 'src-v1',
    blocks: [
      { sourceId: 'src-1', target: { kind: 'logseq-block', graphId: scopeA.graphId, blockUuid: '11111111-1111-4111-8111-111111111111' }, parentUuid: null, depth: 0, order: 0, availability: 'available', content: block1Text, contentVersion: block1Version },
      { sourceId: 'src-2', target: { kind: 'logseq-block', graphId: scopeA.graphId, blockUuid: '22222222-2222-4222-8222-222222222222' }, parentUuid: '11111111-1111-4111-8111-111111111111', depth: 1, order: 1, availability: 'available', content: block2Text, contentVersion: block2Version },
    ],
  };

  await pluginPost(server.descriptor, '/plugin/connect', {
    connectionId: connectionIdA,
    binding: bindingA,
    workKey: settledWorkKeyA,
    title: 'DSH 闭环推进',
  });

  const materialsA = [
    { id: 'mat-design', filename: 'design.md', path: join(workDir, 'design.md'), availability: 'available', version: 'm1' },
    { id: 'mat-pem', filename: 'prod-secret.pem', path: join(workDir, 'prod-secret.pem'), availability: 'available', version: 'm2' },
  ];

  const navDeliveries = [];
  const responderA = startLogseqResponder(server.descriptor, connectionIdA, async delivery => {
    if (delivery.command === 'status') return { capabilities: { read: true, content: false, fileWrite: false } };
    if (delivery.command === 'refresh') return { freshness: 'checked', snapshot: snapshotA, binding: bindingA, workspace: {} };
    if (delivery.command === 'reading.view') return { source: snapshotA, reading: null, warnings: [] };
    if (delivery.command === 'reading.read') return { mode: 'report', activePlanId: null, plans: [] };
    if (delivery.command === 'structure.current') return { source: snapshotA, objects: [] };
    if (delivery.command === 'guidance.read') return { common: { version: 'g1', text: '保持清晰' }, project: { version: 'g2', text: '严守边界' } };
    if (delivery.command === 'materials.list') return { materials: materialsA };
    if (delivery.command === 'materials.read') {
      const m = materialsA.find(item => item.id === delivery.payload.id);
      assert.ok(m, `unexpected material ${delivery.payload.id}`);
      return { ...m, content: await readFile(m.path, 'utf8') };
    }
    if (delivery.command === 'source.read') {
      const b = snapshotA.blocks.find(item => item.sourceId === delivery.payload.sourceId);
      return { freshness: 'checked', source: b };
    }
    if (delivery.command === 'workbench.navigate') {
      navDeliveries.push(delivery.payload);
      return { navigated: true, intent: delivery.payload.intent, openedReview: delivery.payload.intent !== 'open-block' };
    }
    return {};
  });
  t.after(() => responderA.stop());

  const sessions = new Map([['sess-a', { sessionId: 'sess-a', meta: { cwd: workDir } }]]);
  const host = createFakeDshHost(sessions);
  await apply(host.ctx, { workspaceStateDirectory: stateDir, bindingStateDirectory: bindingDir });
  t.after(() => host.dispose());

  // Bind session A to work A
  const bound = await host.rpc('bind', { sessionId: 'sess-a', directory: workDir });
  assert.equal(bound.ok, true, JSON.stringify(bound));

  // --- M1: Sensitive file blocking ---
  const listed = await host.invokeTool('logseq_files_list', {}, 'sess-a');
  const envFile = listed.files.find(f => f.relativePath === '.env.local');
  const pemFile = listed.files.find(f => f.name === 'prod-secret.pem');
  const designFile = listed.files.find(f => f.relativePath === 'design.md');
  assert.equal(envFile?.sensitiveBlocked, true);
  assert.equal(pemFile?.sensitiveBlocked, true);
  assert.equal(designFile?.sensitiveBlocked, false);

  await assert.rejects(
    host.invokeTool('logseq_file_read', { path: '.env.local' }, 'sess-a'),
    { code: 'SENSITIVE_MATERIAL_BLOCKED' }
  );
  await assert.rejects(
    host.invokeTool('logseq_file_read', { materialId: 'mat-pem' }, 'sess-a'),
    { code: 'SENSITIVE_MATERIAL_BLOCKED' }
  );
  const okDesign = await host.invokeTool('logseq_file_read', { path: 'design.md' }, 'sess-a');
  assert.match(okDesign.content, /Normal design doc/);

  // --- M1: local-only Fail Closed in DSH model paths while local UI reading remains usable ---
  await pluginPost(server.descriptor, '/plugin/work-privacy', {
    workKey: settledWorkKeyA,
    scope: scopeA,
    privacyMode: 'local-only',
  });

  const hubLocalOnly = await host.rpc('hub-status', { sessionId: 'sess-a' });
  assert.equal(hubLocalOnly.ok, true);
  assert.equal(hubLocalOnly.value.privacyMode, 'local-only');

  const promptLocalOnly = await host.assemblePrompt('sess-a');
  const parsedPrompt = JSON.parse(promptLocalOnly.text);
  assert.equal(parsedPrompt.privacy.mode, 'local-only');
  assert.equal(parsedPrompt.privacy.remoteContentBlocked, true);
  assert.deepEqual(parsedPrompt.savedSource, []);
  assert.equal(parsedPrompt.guidance.common.text, '');
  assert.equal(parsedPrompt.guidance.project.text, '');
  assert.equal(promptLocalOnly.text.includes('120ms'), false);

  await assert.rejects(
    host.invokeTool('logseq_source_read', { sourceId: 'src-1' }, 'sess-a'),
    { code: 'WORK_LOCAL_ONLY_RESTRICTED' }
  );
  await assert.rejects(
    host.invokeTool('logseq_file_read', { path: 'design.md' }, 'sess-a'),
    { code: 'WORK_LOCAL_ONLY_RESTRICTED' }
  );
  await assert.rejects(
    host.invokeTool('logseq_writeback_propose', {
      kind: 'content-proposal',
      sourceSetVersion: 'src-v1',
      structureVersion: 'struct-v1',
      operations: [{ operationId: 'op-1', type: 'replace-text', sourceId: 'src-1', expectedContentVersion: block1Version, text: 'edited' }],
    }, 'sess-a'),
    { code: 'WORK_LOCAL_ONLY_RESTRICTED' }
  );

  // Local right-sidebar reading is still usable in local-only mode!
  const localRead = await host.rpc('read', { sessionId: 'sess-a' });
  assert.equal(localRead.ok, true);
  assert.match(localRead.value.blocks[0].content, /120ms/);

  // Companion reading-start also fails closed without local profile
  const localOnlyStart = await host.rpc('reading-start', { sessionId: 'sess-a' });
  assert.equal(localOnlyStart.ok, false);
  assert.equal(localOnlyStart.error.code, 'READING_LOCAL_MODEL_REQUIRED');

  // --- M2: Restore default privacy -> Writeback Proposal + FLIP plan + Logseq reconciliation + Dismiss ---
  await pluginPost(server.descriptor, '/plugin/work-privacy', {
    workKey: settledWorkKeyA,
    scope: scopeA,
    privacyMode: 'default',
  });

  // D-62: the global conversation must never inherit the old project's binding or model context.
  const graphPath = join(root, 'graph');
  await mkdir(graphPath);
  await pluginPost(server.descriptor, '/plugin/stage/graph', { graphId: scopeA.graphId, graphPath });
  const stageDirectory = join(graphPath, 'pages', 'stage-reviews');
  const beforeGlobal = await readFile(join(bindingDir, 'bindings.json'), 'utf8');
  const sharedAgent = { session: { id: 'sess-a' } };
  const projectPrompt = await host.assemblePrompt('sess-a', sharedAgent);
  assert.match(projectPrompt.text, /120ms/);
  const globalEntry = await host.rpc('stage-enter-global', {});
  assert.equal(globalEntry.ok, true, JSON.stringify(globalEntry));
  const { sessionId: globalId } = globalEntry.value;
  assert.notEqual(globalId, 'sess-a');
  assert.equal(globalEntry.value.directory, stageDirectory);
  assert.equal((await host.rpc('opened', { sessionId: globalId })).ok, true);
  assert.equal((await host.rpc('status', { sessionId: globalId })).value.bound, false);
  assert.equal((await host.rpc('bind', { sessionId: globalId })).error.code, 'STAGE_SESSION_UNBOUND');
  assert.equal((await host.rpc('unbind', { sessionId: globalId })).error.code, 'STAGE_SESSION_UNBOUND');
  assert.equal(await readFile(join(bindingDir, 'bindings.json'), 'utf8'), beforeGlobal);
  assert.equal((await host.rpc('stage-workspace', { sessionId: globalId })).value.active, true);
  assert.equal((await host.rpc('stage-workspace', { sessionId: 'sess-a' })).value.active, false);

  await host.rpc('stage-visibility', { open: true });
  const globalPrompt = await host.assemblePrompt(globalId, sharedAgent);
  assert.equal(globalPrompt.contexts.some(c => c.name === 'logseq-workbench:current'), false);
  const stageContext = globalPrompt.contexts.find(c => c.name === 'logseq-stage:viewport').text;
  assert.ok(stageContext.includes(stageDirectory));
  for (const phrase of ['全局导航台', '复盘___YYYY-Www.md', '季度星图___YYYY-Qq.md', '"- "', '[[Area/...]]', '[[项目名]]',
    'PARA:: [[PARA/Area]]', 'PARA:: [[PARA/Project]]', '禁止越界', '星图卡片', '磁盘读取最新内容']) {
    assert.ok(stageContext.includes(phrase), phrase);
  }
  assert.doesNotMatch(stageContext, /120ms|super-secret-value|TOPSECRET/u);
  assert.doesNotMatch(stageContext, /[\p{Extended_Pictographic}\u2190-\u21ff]/u);
  await assert.rejects(host.invokeTool('logseq_source_read', { sourceId: 'src-1' }, globalId), { code: 'SESSION_NOT_BOUND' });
  await assert.rejects(host.invokeTool('logseq_file_read', { path: '../design.md' }, globalId), { code: 'SESSION_NOT_BOUND' });
  const projectAgain = await host.assemblePrompt('sess-a', sharedAgent);
  assert.match(projectAgain.text, /120ms/);
  assert.doesNotMatch(projectAgain.contexts.find(c => c.name === 'logseq-stage:viewport').text, /复盘___|全局导航台/);
  await host.rpc('stage-visibility', { open: false });
  const closedGlobal = await host.assemblePrompt(globalId, sharedAgent);
  assert.equal(closedGlobal.contexts.some(c => c.name === 'logseq-stage:viewport' || c.name === 'logseq-workbench:current'), false);

  // D-60 cards continue to enter the exact registered Area, Project and child directories.
  const diveWorks = await Promise.all(['Area', 'Project', 'MiniProject'].map(async (objectType, index) => {
    const directory = join(root, `dive-${index}`);
    await mkdir(directory);
    return {
      workRef: { kind: 'logseq', graphId: scopeA.graphId, rootUuid: randomUUID(), sourceKind: index === 2 ? 'block' : 'page' },
      title: `直跳工作 ${index}`, objectType, directory, location: '测试图谱', updatedAt: Date.now(),
    };
  }));
  await pluginPost(server.descriptor, '/plugin/catalog', {
    schemaVersion: 1, graphId: scopeA.graphId, graphName: '测试图谱', refreshedAt: Date.now(), works: diveWorks,
  });
  for (const work of diveWorks) {
    const dive = await host.rpc('enterWork', { workRef: work.workRef, operationId: randomUUID() });
    assert.equal(dive.ok, true, JSON.stringify(dive));
    assert.equal(sessions.get(dive.value.sessionId).meta.cwd, work.directory);
    assert.notEqual(dive.value.sessionId, globalId);
    assert.equal((await host.rpc('opened', { sessionId: dive.value.sessionId })).ok, true);
  }
  assert.equal(JSON.parse(await readFile(join(bindingDir, 'bindings.json'), 'utf8')).bindings.some(row => row.sessionId === globalId), false);

  // Protected target (TODO) rejected
  await assert.rejects(
    host.invokeTool('logseq_writeback_propose', {
      kind: 'content-proposal',
      summary: '误碰 TODO',
      sourceSetVersion: 'src-v1',
      structureVersion: 'struct-v1',
      operations: [{ operationId: 'op-todo', type: 'replace-text', sourceId: 'src-2', expectedContentVersion: block2Version, text: 'DONE 静默完成' }],
    }, 'sess-a'),
    { code: 'PROTECTED_TARGET_FORBIDDEN' }
  );

  // Direct write channel forbidden in DSH tool
  await assert.rejects(
    host.invokeTool('logseq_writeback_propose', {
      kind: 'authorized-content-patch',
      patch: { scope: scopeA },
    }, 'sess-a'),
    { code: 'WRITEBACK_KIND_FORBIDDEN' }
  );

  // Stale version rejected
  await assert.rejects(
    host.invokeTool('logseq_writeback_propose', {
      kind: 'content-proposal',
      summary: '过期版本',
      sourceSetVersion: 'src-old',
      structureVersion: 'struct-v1',
      operations: [{ operationId: 'op-stale', type: 'replace-text', sourceId: 'src-1', expectedContentVersion: block1Version, text: '整理后正文' }],
    }, 'sess-a'),
    { code: 'STALE_SOURCE_VERSION' }
  );

  // Valid content-proposal -> stages into Companion & builds anchor NoteTidyPlan
  const proposed = await host.invokeTool('logseq_writeback_propose', {
    kind: 'content-proposal',
    requestId: 'dsh-prop-1',
    summary: '整理双向闭环要点并保留 [[隐私策略]] 与 120ms',
    sourceSetVersion: 'src-v1',
    structureVersion: 'struct-v1',
    operations: [
      {
        operationId: 'op-tidy-1',
        type: 'replace-text',
        sourceId: 'src-1',
        expectedContentVersion: block1Version,
        text: '完成 DSH 与 Companion 双向闭环：核验 [[隐私策略]] 及 120ms 超时阈值。',
      },
      {
        operationId: 'op-child-1',
        type: 'insert-child',
        sourceId: 'src-1',
        expectedContentVersion: block1Version,
        text: '补充：已通过 DSH 写回提案通道送回 Logseq 预览。',
      },
    ],
  }, 'sess-a');

  assert.equal(proposed.kind, 'content-proposal');
  assert.equal(proposed.status, 'pending-review');
  assert.equal(proposed.writesSource, false);
  assert.equal(proposed.proposal.workKey, settledWorkKeyA);
  assert.equal(proposed.proposal.clientId, 'dsh:sess-a');
  assert.equal(proposed.proposal.plan.meta.providerId, 'dsh:sess-a');
  assert.ok(proposed.proposal.plan.anchors.some(a => a.before.exactText === '[[隐私策略]]' && a.after?.exactText === '[[隐私策略]]'));
  assert.ok(proposed.proposal.plan.anchors.some(a => a.before.exactText === '120ms' && a.after?.exactText === '120ms'));

  // Logseq reconciles exact same workKey and sees the DSH proposal
  const logseqProposals = await pluginPost(server.descriptor, '/plugin/writeback-proposals', {
    action: 'list',
    workKey: settledWorkKeyA,
  });
  assert.equal(logseqProposals.value.proposals.length, 1);
  assert.equal(logseqProposals.value.proposals[0].proposalId, 'dsh-prop-1');

  // DSH hub-status sees the staged proposal for its receipt bar
  const hubWithProposal = await host.rpc('hub-status', { sessionId: 'sess-a' });
  assert.equal(hubWithProposal.ok, true);
  assert.equal(hubWithProposal.value.proposals.length, 1);
  assert.equal(hubWithProposal.value.proposals[0].proposalId, 'dsh-prop-1');
  assert.equal(hubWithProposal.value.proposals[0].operationCount, 2);

  // Wave P0: navigate-logseq sends context-aware workbench.navigate over Companion (review-writeback + open-block)
  const navReview = await host.rpc('navigate-logseq', { sessionId: 'sess-a', intent: 'review-writeback', proposalId: 'dsh-prop-1' });
  assert.equal(navReview.ok, true, JSON.stringify(navReview));
  assert.equal(navReview.value.navigated, true);
  assert.equal(navReview.value.openedReview, true);
  assert.deepEqual(navDeliveries.at(-1), { intent: 'review-writeback', proposalId: 'dsh-prop-1' });

  const navBlock = await host.rpc('navigate-logseq', { sessionId: 'sess-a', intent: 'open-block', blockUuid: '11111111-1111-4111-8111-111111111111' });
  assert.equal(navBlock.ok, true, JSON.stringify(navBlock));
  assert.deepEqual(navDeliveries.at(-1), { intent: 'open-block', blockUuid: '11111111-1111-4111-8111-111111111111' });

  // DSH can dismiss its own staged proposal
  const dismissed = await host.rpc('writeback-dismiss', { sessionId: 'sess-a', proposalId: 'dsh-prop-1' });
  assert.equal(dismissed.ok, true);
  assert.equal(dismissed.value.dismissed, true);
  const afterDismiss = await pluginPost(server.descriptor, '/plugin/writeback-proposals', {
    action: 'list',
    workKey: settledWorkKeyA,
  });
  assert.equal(afterDismiss.value.proposals.length, 0);

  // --- M2: DSH reading candidate submission -> Companion ReadingJobHub -> Logseq ---
  const candidate = await host.invokeTool('logseq_reading_candidate_submit', {
    sourceSetVersion: 'src-v1',
    structureVersion: 'struct-v1',
    summary: 'DSH 讨论后整理的进展简报',
    paragraphs: [
      {
        key: 'dsh-summary',
        markdown: 'DSH 侧已确认 [[隐私策略]] 与 404 校验闭环。',
        kind: 'fact',
        sourceIds: ['src-1'],
      },
    ],
  }, 'sess-a');
  assert.equal(candidate.staged, true);
  assert.equal(candidate.status, 'pending-adoption');
  assert.equal(candidate.writesSource, false);

  const logseqJob = await pluginPost(server.descriptor, '/plugin/reading-jobs/status', { workKey: settledWorkKeyA });
  assert.equal(logseqJob.value.job.status, 'completed');
  assert.equal(logseqJob.value.job.requireReview, true);
  assert.equal(logseqJob.value.job.result.agentRun.providerId, 'dsh:sess-a');

  // --- M3: DSH triggers neutral Companion ReadingJobHub start ---
  const started = await host.rpc('reading-start', { sessionId: 'sess-a', question: '生成当前工作阅读简报' });
  assert.equal(started.ok, true);
  assert.equal(started.value.job.requireReview, true);
  const startedJobId = started.value.job.jobId;

  let finishedHub = null, lastPolled = null;
  for (let i = 0; i < 40; i++) {
    const polled = await host.rpc('hub-status', { sessionId: 'sess-a' });
    lastPolled = polled;
    if (polled.ok && polled.value.readingJob?.jobId === startedJobId && polled.value.readingJob.status === 'completed') {
      finishedHub = polled.value;
      break;
    }
    if (polled.ok && polled.value.readingJob?.jobId === startedJobId && polled.value.readingJob.status === 'failed') {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(finishedHub, `expected Companion reading job started from DSH to complete: ${JSON.stringify(lastPolled)}`);
  assert.equal(finishedHub.readingJob.requireReview, true);
  assert.equal(providerCalls, 3);
  assert.equal(providerPayloads.join('\n').includes('TOPSECRET'), false);
  assert.equal(providerPayloads.join('\n').includes('super-secret-value'), false);

  // --- Cross-work isolation: switching Logseq to Work B fails closed for Session A ---
  await responderA.stop();
  const scopeB = { graphId: 'Lab:/private/graph', rootUuid: 'bbbb2222-0000-4000-8000-000000000002' };
  const bindingB = { scope: scopeB, directory: workDirB, provider: 'workspace', workspaceId: 'ws-b', organization: 'flat' };
  await pluginPost(server.descriptor, '/plugin/connect', {
    connectionId: 'conn-b-1',
    binding: bindingB,
    workKey: workKeyForScope(scopeB),
    title: '另一件工作 B',
  });
  await assert.rejects(
    host.invokeTool('logseq_writeback_propose', {
      kind: 'content-proposal',
      sourceSetVersion: 'src-v1',
      structureVersion: 'struct-v1',
      operations: [{ operationId: 'op-cross', type: 'replace-text', sourceId: 'src-1', expectedContentVersion: block1Version, text: '跨工作写入' }],
    }, 'sess-a'),
    { code: 'CONNECTION_STALE' }
  );
  const crossNav = await host.rpc('navigate-logseq', { sessionId: 'sess-a', intent: 'open-work' });
  assert.equal(crossNav.ok, false);
  assert.equal(crossNav.error.code, 'CONNECTION_STALE');

  // Audit log recorded DSH bridge activity
  const auditLines = (await readFile(join(stateDir, 'connection-facts.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(auditLines.some(row => row.command === 'mcp.workbench_propose_writeback' && row.clientId === 'dsh:sess-a' && row.outcome === 'returned'));
  assert.ok(auditLines.some(row => row.command === 'dsh.writeback.dismiss' && row.clientId === 'dsh:sess-a'));
  assert.ok(auditLines.some(row => row.command === 'dsh.reading.start' && row.clientId === 'dsh:sess-a'));
  assert.ok(auditLines.some(row => row.command === 'dsh.navigate.logseq' && row.clientId === 'dsh:sess-a' && row.outcome === 'returned'));
});

test('DSH readingModel defense-in-depth blocks local-only and strips sensitive materials', async () => {
  const captured = [];
  const model = readingModel({
    agentDefaultModel: { currentSelection: () => ({ provider: 'fixture', model: 'fixture' }) },
    llm: {
      async *stream(req) {
        captured.push(req);
        yield { type: 'text-delta', text: JSON.stringify({ answer: '正常回答', sourceIds: ['s1'] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    },
  });

  await assert.rejects(
    model({
      mode: 'ask',
      question: '总结',
      privacyMode: 'local-only',
      source: { blocks: [{ sourceId: 'source-1', target: { blockUuid: 'b1' }, availability: 'available', content: '私密正文' }] },
      materials: [],
    }),
    { code: 'READING_LOCAL_MODEL_REQUIRED' }
  );

  await model({
    mode: 'ask',
    question: '查看材料',
    source: { blocks: [{ sourceId: 'source-1', target: { blockUuid: 'b1' }, availability: 'available', content: '普通正文' }] },
    materials: [
      { id: 'm-secret', filename: '.env.production', availability: 'available', excerpt: 'DB_PASSWORD=top-secret', text: 'DB_PASSWORD=top-secret' },
      { id: 'm-ok', filename: 'notes.md', availability: 'available', excerpt: '公开摘要' },
    ],
  });
  assert.equal(captured.length, 1);
  const sent = JSON.stringify(captured[0]);
  assert.equal(sent.includes('DB_PASSWORD'), false);
  assert.equal(sent.includes('top-secret'), false);
  assert.equal(sent.includes('公开摘要'), true);
});
