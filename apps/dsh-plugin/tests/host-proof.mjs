/* global process, console, logseq, document, crypto, AbortController, Request */
// Requires DSH 0.2.0-rc.2 and Node 22.19+. Synthetic SDK and scripted model only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat, rename, realpath, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { startWorkspaceServer } from "../../task-copilot-cli/src/workspace-server.ts";
import { contentFixture } from "../../logseq-plugin/tests/fixtures/content-writeback.ts";
import * as plugin from "../src/index.mjs";
const repo = process.cwd();
await mkdir(join(repo, "tmp/dsh-research"), { recursive: true });
const f = await contentFixture();
const root = await realpath(await mkdtemp(join(tmpdir(), "dsh-logseq-proof-"))), directory = join(root, "work"), state = join(root, "state");
await mkdir(directory);
let server = await startWorkspaceServer({ stateDirectory: state });
let ctx;
try {
  f.browser.apis = { doAction: async (args) => {
    const [command, ...values] = args;
    if (command === "readFile")
      return readFile(String(values[0]), "utf8");
    if (command === "writeFile")
      return writeFile(String(values[1]), String(values[2]));
    if (command === "mkdir-recur")
      return mkdir(String(values[0]), { recursive: true });
    if (command === "rename")
      return rename(String(values[0]), String(values[1]));
    if (command === "stat") {
      try {
        const info = await stat(String(values[0]));
        return { mode: info.mode, size: info.size };
      } catch (error) {
        if (error.code === "ENOENT")
          return null;
        throw error;
      }
    }
    if (command === "listdir") {
      try {
        return (await readdir(String(values[0]))).map((name) => join(String(values[0]), name));
      } catch (error) {
        if (error.code === "ENOENT")
          return null;
        throw error;
      }
    }
    throw Error(`unsupported host action ${String(command)}`);
  }, openPath: async () => {
  } };
  logseq.settings = { disabled: false, tasksEnabled: false, materialsEnabled: true, workViewEnabled: true, materialsAutoCapture: false, agentWorkspaceDescriptor: server.pluginDescriptorPath };
  const insert = logseq.Editor.insertBlock.bind(logseq.Editor);
  logseq.Editor.insertBlock = ((target, text, options = {}) => {
    assert.equal(options.focus, false);
    return insert(target, text, { ...options, customUUID: options.customUUID ?? crypto.randomUUID() });
  });
  logseq.Editor.getPage = (async () => ({ id: 1, name: "synthetic page", originalName: "synthetic page" }));
  await import(`../../logseq-plugin/src/index.ts?dsh-research=${Date.now()}`);
  await f.boot();
  const api = f.browser.taskCopilotWorkbench;
  await api.workspace.bind({ scope: f.scope, directory });
  await f.commands.get("agent-workspace-read")();
  assert.equal(api.agentWorkspace.status().connected, true, JSON.stringify(f.messages));
  // A plain read grant must work before a collaboration scene is prepared.
  const { BindingStore, CompanionTransport, WorkbenchService } = await import('../src/service.mjs');
  const fallbackStore = new BindingStore(join(root, 'fallback-bindings')); await fallbackStore.load();
  const fallback = new WorkbenchService({ store: fallbackStore, transport: new CompanionTransport(state),
    inspectSession: async () => ({ meta: { cwd: directory } }), openPath: async () => ({ opened: true }) });
  await fallback.bind('fallback-session', directory);
  const fallbackView = await fallback.view('fallback-session');
  assert.equal(fallbackView.blocks.length, 3); fallback.dispose();
  await api.open(f.root);
  await writeFile(join(directory, "proposal.md"), "# Proposal\n\nA real file in the bound directory.\n");
  await f.commands.get("agent-workspace-collaboration")();
  const form = document.querySelector('[data-collaboration="true"]');
  const request = form.querySelector("textarea");
  request.value = "\u6838\u5BF9\u6750\u6599\u5E76\u8BBE\u8BA1\u9605\u8BFB\u65B9\u6848\uFF0C\u4FDD\u7559\u539F\u6587\u3002";
  request.dispatchEvent(new f.browser.Event("input"));
  Array.from(form.querySelectorAll("button")).find((b) => b.textContent === "\u8FDE\u63A5\u5E76\u51C6\u5907\u534F\u4F5C\u73B0\u573A").click();
  for (let i = 0; i < 500 && !form.textContent.includes("\u73B0\u573A\u5DF2\u6838\u9A8C\u5E76\u4FDD\u5B58"); i++) await delay(10);
  assert.match(form.textContent, /现场已核验并保存/);
  if (process.env.DSH_UI_PROOF === '1') {
    console.log(JSON.stringify({ directory, state }));
    await new Promise(resolve => process.once('SIGTERM', resolve));
  } else {
  const req = createRequire(join(process.env.DSH_PACKAGE_ROOT ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@deepseek-ai/dsh"), "package.json"));
  const mod = async (name) => import(req.resolve(name));
  const { Context } = await mod("@deepseek-ai/cordis");
  const { default: SystemPrompt } = await mod("@deepseek-ai/dsh-system-prompt");
  const { default: Tools } = await mod("@deepseek-ai/dsh-tools");
  ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(Tools, {});
  const routes = new Map();
  await ctx.plugin({ name: 'test-desktop-host', apply(host) {
    host.reflect.provide('connection', { fetch: { register(route) {
      assert.match(route.path, /^\/api\/logseq-workbench\//); routes.set(route.path, route);
      return host.effect(() => () => routes.delete(route.path));
    } } });
    host.reflect.provide('sessionController', {
      inspect: async () => ({ meta: { cwd: directory } }),
      openWorkspacePath: async input => { assert.equal(input.path, join(directory, 'proposal.md')); return { opened: true }; }
    });
  } });
  const fiber = await ctx.plugin(plugin, { workspaceStateDirectory: state, bindingStateDirectory: join(root, 'bindings') });
  await fiber.await();
  const rpc = async (method, payload) => {
    const envelope = { type: 'client-request', rpcId: crypto.randomUUID(), method: `logseq-workbench/${method}`, payload };
    const response = await routes.get(`/api/logseq-workbench/${method}`).fetch(new Request(`http://localhost/api/logseq-workbench/${method}`, { method: 'POST', body: JSON.stringify(envelope) }));
    assert.equal(response.status, 200);
    const answer = await response.json(); assert.equal(answer.rpcId, envelope.rpcId);
    const result = answer.result;
    assert.equal(result.ok, true, JSON.stringify(result)); return result.value;
  };
  const agent = { id: 'proof-session', session: { id: 'proof-session' }, ctx };
  const execute = async (name, args = {}, who = agent) => ctx.tools.execute({ name, arguments: args, agent: who, callId: crypto.randomUUID(), signal: new AbortController().signal });
  const value = async (name, args = {}, who = agent) => {
    const result = await execute(name, args, who); assert.equal(result.isError, false, JSON.stringify(result)); return result.value;
  };
  const checks = [];
  assert.equal((await execute('logseq_work_read')).isError, true);
  assert.equal((await rpc('status', { sessionId: 'proof-session' })).bound, false);
  await rpc('bind', { sessionId: 'proof-session', directory });
  const scene = await value('logseq_work_read');
  assert.equal(scene.savedSource.length, 3); assert.equal(scene.nativeDraft.included, false);
  const view = await rpc('read', { sessionId: 'proof-session' });
  assert.equal(view.blocks.length, 3); assert.ok(view.files.some(file => file.name === 'proposal.md'));
  assert.equal((await rpc('open', { sessionId: 'proof-session', key: 'file:proposal.md', reveal: false })).opened, true);
  const file = await value('logseq_file_read', { path: 'proposal.md' }); assert.match(file.content, /A real file/);
  checks.push({ check: 'Production plugin RPC, session binding, native tools, actual HTTP companion and external-opener adapter', ok: true });
  const context1 = await ctx.systemPrompt.assemble({ scope: agent });
  const first = JSON.parse(context1.contexts.find(c => c.name === 'logseq-workbench:current').text);
  f.blocks.get(f.a).content += '\nNew saved source after the first step.'; f.changed();
  const context2 = await ctx.systemPrompt.assemble({ scope: agent });
  const second = JSON.parse(context2.contexts.find(c => c.name === 'logseq-workbench:current').text);
  assert.notEqual(first.sourceBundleVersion, second.sourceBundleVersion);
  assert.match(JSON.stringify(second), /New saved source/);
  checks.push({ check: 'Production async context assembly refreshes saved Logseq changes', ok: true });
  const before = f.counts();
  const reading = await value('logseq_reading_request', { purpose: '连续阅读完整原句' });
  const source = reading.value.source;
  const plan = { schemaVersion: 1, requestId: reading.value.requestId, planId: 'production-proof-plan', name: 'DSH 连续阅读', scope: source.scope,
    structureVersion: source.structureVersion, sourceSetVersion: source.sourceSetVersion,
    sourceVersions: source.blocks.map(b => ({ sourceId: b.sourceId, contentVersion: b.contentVersion })),
    layout: [{ kind: 'paragraphs', key: 'body', sourceIds: source.blocks.map(b => b.sourceId) }] };
  await rpc('bind', { sessionId: 'other-session', directory });
  const foreign = await execute('logseq_reading_submit', { plan }, { id: 'other-session', session: { id: 'other-session' }, ctx });
  assert.equal(foreign.isError, true); assert.match(JSON.stringify(foreign), /READING_REQUEST_NOT_OWNED/);
  const accepted = await value('logseq_reading_submit', { plan }); assert.equal(accepted.value.status, 'selected');
  assert.equal(f.counts().writes, before.writes);
  checks.push({ check: 'Native reading plan is rendered by Logseq, session ownership holds, original text unchanged', ok: true });
  for (const name of ["dsh-llm", "dsh-session", "dsh-session-projection", "dsh-agent", "dsh-agent-loop"]) {
    const plugin = (await mod("@deepseek-ai/" + name)).default;
    await ctx.plugin(plugin, name === "dsh-agent-loop" ? { agents: [] } : void 0);
  }
  const { LlmAdapter, createUserMessage } = await mod("@deepseek-ai/dsh-llm");
  class ScriptedProvider extends LlmAdapter {
    requests = [];
    resolveModel(provider, model2) {
      return Promise.resolve({ provider, id: model2, name: model2 });
    }
    async *stream(options) {
      this.requests.push(options);
      if (this.requests.length === 1) {
        yield { type: "block-start", index: 0, blockType: "tool-call" };
        yield { type: "block-end", index: 0, block: { type: "tool-call", id: "model-read-file", name: "logseq_file_read", arguments: JSON.stringify({ path: "proposal.md" }) } };
        yield { type: "finish", reason: { kind: "tool-calls" } };
      } else {
        yield { type: "block-start", index: 0, blockType: "text" };
        yield { type: "text-delta", index: 0, text: "Read complete." };
        yield { type: "block-end", index: 0, block: { type: "text", text: "Read complete." } };
        yield { type: "finish", reason: { kind: "stop" } };
      }
    }
  }
  const model = new ScriptedProvider();
  ctx.llm.registerAdapter(["research-scripted"], model);
  const live = await ctx.agentLoop.create("dsh-loop-proof", { provider: "research-scripted", model: "scripted" });
  await rpc("bind", { sessionId: live.session.id, directory });
  live.followup(createUserMessage({ content: [{ type: "text", text: "Read proposal and the latest saved work." }], source: { kind: "user" } }));
  for (let i = 0; i < 1e3 && (model.requests.length < 2 || live.status !== "idle"); i++) await delay(10);
  assert.equal(model.requests.length, 2, JSON.stringify(live.session.snapshotEvents().slice(-6)));
  assert.equal(live.status, "idle");
  await writeFile(join(repo, "tmp/dsh-research/model-request-debug.json"), JSON.stringify(model.requests[0], null, 2));
  assert.ok(JSON.stringify(model.requests[0].messages).includes("New saved source"));
  assert.ok(JSON.stringify(model.requests[1].messages).includes("A real file in the bound directory"));
  const durable = live.session.snapshotEvents();
  assert.ok(durable.some((e) => e.type === "tool/result"));
  assert.ok(durable.some((e) => e.type === "user/message" && JSON.stringify(e.data).includes("New saved source")));
  checks.push({ check: "Production DSH AgentLoop sees refreshed Logseq context, calls a native file tool, and records context and results in the session log", ok: true, modelAttempts: 2 });
  f.blocks.get(f.a).content += "\nSecond user turn sees an external saved edit.";
  f.changed();
  live.followup(createUserMessage({ content: [{ type: "text", text: "Continue with the latest work." }], source: { kind: "user" } }));
  for (let i = 0; i < 1e3 && (model.requests.length < 3 || live.status !== "idle"); i++) await delay(10);
  assert.equal(model.requests.length, 3);
  assert.equal(live.status, "idle");
  assert.match(JSON.stringify(model.requests[2].messages), /Second user turn sees an external saved edit/);
  checks.push({ check: "Same DSH session automatically refreshes changed Logseq work on its next user turn", ok: true });
  f.graph('B'); await delay(200);
  assert.equal((await execute('logseq_work_read')).isError, true);
  const dead = await ctx.systemPrompt.assemble({ scope: agent });
  const unavailable = JSON.parse(dead.contexts.find(c => c.name === 'logseq-workbench:current').text);
  assert.equal(unavailable.connection, 'unavailable'); assert.equal(unavailable.savedSource, undefined);
  checks.push({ check: 'Graph invalidation clears current model context rather than reusing stale source', ok: true });
  await fiber.dispose();
  assert.equal(ctx.tools.schemas().some(t => t.name.startsWith('logseq_')), false);
  checks.push({ check: 'Production Cordis unload removes model-facing tools', ok: true });
  console.log(JSON.stringify({ dshVersion: '0.2.0-rc.2', logseq: 'Synthetic SDK with production plugin and HTTP companion', model: 'Native AgentLoop with local scripted model', checks }, null, 2));
  }
} finally {
  await ctx?.fiber.dispose(); await f.unload(); await server.close(); await f.cleanup(); await rm(root, { recursive: true, force: true });
}
