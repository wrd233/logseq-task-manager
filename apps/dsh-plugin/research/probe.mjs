/* global process, console, logseq, document, crypto, AbortController */
// Requires DSH 0.2.0-rc.2 and Node 22.19+. Synthetic SDK and scripted model only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat, rename, realpath, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { startWorkspaceServer } from "../../task-copilot-cli/src/workspace-server.ts";
import { workspaceEntry, privateDescriptor, workspaceHttp } from "../../task-copilot-cli/src/workspace-cli.ts";
import { contentFixture } from "../../logseq-plugin/tests/fixtures/content-writeback.ts";
import * as adapter from "./native-host-adapter.mjs";
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
  const req = createRequire(join(process.env.DSH_PACKAGE_ROOT ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@deepseek-ai/dsh"), "package.json"));
  const mod = async (name) => import(req.resolve(name));
  const { Context } = await mod("@deepseek-ai/cordis");
  const { default: SystemPrompt } = await mod("@deepseek-ai/dsh-system-prompt");
  const { default: Tools } = await mod("@deepseek-ai/dsh-tools");
  ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(Tools, {});
  const entry = await workspaceEntry(directory), descriptor = await privateDescriptor(join(state, "workspace.json"));
  const transport = async (command, payload, client, signal) => {
    signal?.throwIfAborted();
    const value2 = await workspaceHttp(descriptor, {
      schemaVersion: 1,
      instanceId: descriptor.instanceId,
      connectionId: entry.connectionId,
      clientId: `dsh:${client}`,
      requestId: crypto.randomUUID(),
      command,
      payload
    });
    signal?.throwIfAborted();
    return value2;
  };
  const fiber = await ctx.plugin(adapter, { transport });
  const agent = { id: "proof-session", session: { id: "proof-session" }, ctx };
  const execute = async (name, args = {}, who = agent) => ctx.tools.execute({ name, arguments: args, agent: who, callId: crypto.randomUUID(), signal: new AbortController().signal });
  const value = async (name, args = {}, who = agent) => {
    const result = await execute(name, args, who);
    assert.equal(result.isError, false, JSON.stringify(result));
    return result.value;
  };
  const checks = [];
  const scene = await value("logseq_work_read");
  assert.equal(scene.scene.savedSource.blocks.length, 3);
  assert.equal(scene.scene.nativeDraft.included, false);
  checks.push({ check: "Native DSH tool reads production collaboration scene", ok: true, blocks: scene.scene.savedSource.blocks.length });
  const files = await value("logseq_files_list");
  assert.ok(files.observation.files.some((x) => x.path.endsWith("proposal.md")));
  const file = await value("logseq_file_read", { path: "proposal.md" });
  assert.match(file.content, /A real file/);
  checks.push({ check: "Native DSH tools discover and read an actual bound-directory file", ok: true });
  const context1 = await ctx.systemPrompt.assemble({ scope: agent });
  const snapshot1 = context1.contexts.find((c) => c.name === "logseq-workbench:current");
  assert.ok(snapshot1);
  assert.match(snapshot1.text, /核对材料/);
  const firstVersion = JSON.parse(snapshot1.text).sourceBundleVersion;
  f.blocks.get(f.a).content += "\nNew saved source after the first step.";
  f.changed();
  const context2 = await ctx.systemPrompt.assemble({ scope: agent });
  const snapshot2 = context2.contexts.find((c) => c.name === "logseq-workbench:current");
  assert.notEqual(JSON.parse(snapshot2.text).sourceBundleVersion, firstVersion);
  assert.match(snapshot2.text, /New saved source/);
  checks.push({ check: "Async prompt-assembly hook detects changed source, refreshes scene and contributes required runtime context", ok: true });
  const before = f.counts();
  const reading = await value("logseq_reading_request", { purpose: "\u8FDE\u7EED\u9605\u8BFB\u5B8C\u6574\u539F\u53E5" });
  assert.equal(reading.ok, true);
  const source = reading.value.source;
  const plan = {
    schemaVersion: 1,
    requestId: reading.value.requestId,
    planId: "dsh-proof-plan",
    name: "DSH \u8FDE\u7EED\u9605\u8BFB",
    scope: source.scope,
    structureVersion: source.structureVersion,
    sourceSetVersion: source.sourceSetVersion,
    sourceVersions: source.blocks.map((b) => ({ sourceId: b.sourceId, contentVersion: b.contentVersion })),
    layout: [{ kind: "paragraphs", key: "body", sourceIds: source.blocks.map((b) => b.sourceId) }]
  };
  const foreign = await execute("logseq_reading_submit", { plan }, { id: "other-session", session: { id: "other-session" }, ctx });
  assert.equal(foreign.isError, true);
  assert.match(JSON.stringify(foreign), /READING_REQUEST_NOT_OWNED/);
  const accepted = await value("logseq_reading_submit", { plan });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.status, "selected");
  assert.equal(f.browser.document.querySelectorAll(".wb-reading-paragraphs").length, 1);
  assert.equal(f.counts().writes, before.writes);
  checks.push({ check: "Stable DSH session identity submits rendered reading plan without body writes; another identity is rejected", ok: true });
  const denied = await execute("logseq_body_apply", { patch: f.patch([await f.text(f.a, "Alpha", "UNAUTHORIZED")]) });
  assert.equal(denied.isError, true);
  assert.match(JSON.stringify(denied), /CONTENT_WRITE_AUTHORIZATION_REQUIRED/);
  assert.equal(f.counts().writes, before.writes);
  checks.push({ check: "Read-only connection rejects a native DSH body-write tool", ok: true });
  await value("logseq_session_add", { platform: "dsh", externalId: "proof-session", url: null, description: "Isolated validation session" });
  assert.equal((await transport("sessions.list", {}, "proof-session")).references[0].externalId, "proof-session");
  checks.push({ check: "DSH session reference is associated with the same formal work identity", ok: true });
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
  f.graph("B");
  await delay(200);
  const stale = await execute("logseq_work_read");
  assert.equal(stale.isError, true);
  checks.push({ check: "Changing Graph invalidates the old DSH connection", ok: true });
  await fiber.dispose();
  assert.equal(ctx.tools.schemas().some((t) => t.name.startsWith("logseq_")), false);
  checks.push({ check: "Cordis plugin unload removes its tools", ok: true });
  const report = {
    testedAt: (/* @__PURE__ */ new Date()).toISOString(),
    dshVersion: JSON.parse(await readFile("/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json", "utf8")).version,
    levels: { dsh: "Installed native Cordis and tool execution pipeline", bridge: "Production HTTP workspace service", logseq: "Plugin installer and DOM with synthetic SDK host, not actual Desktop", model: "Production AgentLoop with a scripted local model adapter; no remote model call" },
    checks
  };
  await writeFile(join(repo, "tmp/dsh-research/probe-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await ctx?.fiber.dispose();
  await f.unload();
  await server.close();
  await f.cleanup();
  await rm(root, { recursive: true, force: true });
}
