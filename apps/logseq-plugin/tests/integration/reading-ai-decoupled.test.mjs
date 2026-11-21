/* global Buffer, fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from '../fixtures/work-view.mjs';
import { startWorkspaceServer } from '../../../task-copilot-cli/src/workspace-server.ts';

test('WorkReadingAI works without DSH via Companion API, keeps running across work switch, reconciles candidate on return, and enforces local-only privacy', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'logseq-decoupled-ai-')));
  const stateDir = join(root, 'state');
  let holdSecondCall = false;
  let releaseSecond = () => {};
  let modelCallCount = 0;

  const modelServer = createServer(async (req, res) => {
    modelCallCount++;
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (holdSecondCall) {
      await new Promise((resolve) => { releaseSecond = resolve; });
      holdSecondCall = false;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (Array.isArray(body.tools) && body.tools.length) {
      const hasToolMsg = body.messages.some((m) => m.role === 'tool');
      if (!hasToolMsg) {
        res.end(JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'tc-1', type: 'function', function: { name: 'logseq_source_read', arguments: JSON.stringify({ sourceIds: ['s1'] }) } }],
            },
          }],
        }));
        return;
      }
      res.end(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'tc-2',
              type: 'function',
              function: {
                name: 'logseq_reading_submit',
                arguments: JSON.stringify({
                  paragraphs: [{
                    key: 'main',
                    markdown: `来自 ${body.model} 的整理（第 ${modelCallCount} 次）`,
                    kind: 'fact',
                    sourceIds: ['s1'],
                  }],
                }),
              },
            }],
          },
        }],
      }));
      return;
    }
    res.end(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            paragraphs: [{
              key: 'main',
              markdown: `来自 ${body.model} 的整理（第 ${modelCallCount} 次）`,
              kind: 'fact',
              sourceIds: ['s1'],
            }],
          }),
        },
      }],
    }));
  });
  await new Promise((resolve) => modelServer.listen(0, '127.0.0.1', resolve));
  const modelPort = modelServer.address().port;

  const companion = await startWorkspaceServer({
    stateDirectory: stateDir,
    reading: {
      env: { DEEPSEEK_API_KEY: 'live-secret-should-not-appear-in-dom' },
      dshAvailable: async () => false,
    },
  });

  await writeFile(join(stateDir, 'providers.json'), JSON.stringify({
    schemaVersion: 1,
    routes: { fast: 'deepseek-flash', deep: 'deepseek-flash', local: null },
    budget: { maxStepsPerRun: 8, timeoutMs: 30000, backgroundMaxPerHour: 12, backgroundMaxPerDay: 60 },
    profiles: {
      'deepseek-flash': {
        label: 'DeepSeek 默认',
        kind: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        model: 'deepseek-chat',
        apiKey: 'env:DEEPSEEK_API_KEY',
        locality: 'remote',
      },
      'deepseek-reasoner': {
        label: 'DeepSeek 深度',
        kind: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        model: 'deepseek-reasoner',
        apiKey: 'env:DEEPSEEK_API_KEY',
        locality: 'remote',
      },
    },
  }), { mode: 0o600 });

  const postCompanion = async (path, input) => {
    const response = await fetch(companion.descriptor.baseUrl + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-instance': companion.descriptor.instanceId,
        'x-workspace-plugin': companion.descriptor.pluginToken,
      },
      body: JSON.stringify(input),
    });
    const parsed = await response.json();
    if (!response.ok) {
      const err = new Error(parsed.error?.message ?? 'FAILED');
      err.code = parsed.error?.code;
      throw err;
    }
    return parsed.value;
  };

  const f = await fixture(null, 1, { initialReadingMode: 'report' });
  // Add a second work B so we can switch between A ('root') and B ('work-b')
  const workB = { uuid: 'work-b', content: '**[MiniProject]** 工作 B', parent: { id: 'page' }, page: { id: 'page' }, children: [] };
  f.blocks.set('work-b', workB);

  try {
    f.work.setReadingAI({
      complete: (input, signal) => postCompanion('/plugin/reading-model', input, signal),
      handoff: async () => {},
      startJob: (input) => postCompanion('/plugin/reading-jobs/start', input),
      jobStatus: (query) => postCompanion('/plugin/reading-jobs/status', query),
      ackJob: (jobId) => postCompanion('/plugin/reading-jobs/ack', { jobId }).then(() => undefined),
      cancelJob: (query) => postCompanion('/plugin/reading-jobs/cancel', query).then(() => undefined),
      providers: () => postCompanion('/plugin/reading-providers', {}),
      selectRoute: (route) => postCompanion('/plugin/reading-providers/route', route),
    });

    await f.work.open('root');
    const aiRoot = f.work.panel.root.querySelector('.wb-reading-ai');
    assert.ok(aiRoot);

    // 1. Open AI Assistant -> loads sanitized providers list (no secret leak!)
    const toggleBtn = aiRoot.querySelector('.wb-ai-bar > button');
    toggleBtn.click();
    for (let i = 0; i < 40 && aiRoot.querySelector('.wb-ai-provider').hidden; i++) await delay(15);
    assert.equal(aiRoot.querySelector('.wb-ai-provider').hidden, false);
    assert.equal(aiRoot.outerHTML.includes('live-secret-should-not-appear-in-dom'), false);

    // 2. First organize runs without DSH and selects the generated article
    const organizeBtn = aiRoot.querySelector('.wb-ai-tools > button');
    organizeBtn.click();
    for (let i = 0; i < 120 && !f.work.readingAPI.read().briefing; i++) await delay(25);
    assert.ok(f.work.readingAPI.read().briefing);
    assert.match(f.work.readingAPI.read().briefing.paragraphs[0].markdown, /deepseek-chat/);

    // 3. Hot-switch provider via UI select to deepseek-reasoner, then start an update, switch AWAY to Work B while running!
    toggleBtn.click();
    const select = aiRoot.querySelector('.wb-ai-provider');
    select.value = 'deepseek-reasoner';
    select.dispatchEvent(new f.browser.Event('change'));
    await delay(40);

    holdSecondCall = true;
    organizeBtn.click();
    await delay(60);

    // Switch away to Work B while Work A's job is still running in Companion!
    await f.work.open('work-b');
    assert.equal(f.work.snapshot().root, 'work-b');

    // Finish Work A's model call while user is reading Work B
    releaseSecond();
    await delay(100);

    // Return to Work A -> staged candidate is reconciled automatically!
    await f.work.open('root');
    for (let i = 0; i < 120 && !f.work.readingAPI.read().candidate; i++) await delay(25);
    const afterReturn = f.work.readingAPI.read();
    assert.equal(afterReturn.candidate?.status, 'ready');
    assert.match(afterReturn.candidate.paragraphs[0].markdown, /deepseek-reasoner/);

    // 4. Enable per-work local-only privacy -> fails closed because routes.local is null
    if (aiRoot.querySelector('.wb-ai-form').hidden) toggleBtn.click();
    const checkboxes = aiRoot.querySelectorAll('.wb-ai-options input[type="checkbox"]');
    const localCheckbox = checkboxes[1];
    localCheckbox.checked = true;
    localCheckbox.dispatchEvent(new f.browser.Event('change'));
    organizeBtn.click();
    for (let i = 0; i < 40 && !aiRoot.querySelector('.wb-ai-status').textContent.includes('仅本地模型'); i++) await delay(20);
    assert.match(aiRoot.querySelector('.wb-ai-status').textContent, /仅本地模型/);
  } finally {
    await f.close();
    await companion.close();
    await new Promise((resolve) => modelServer.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
