/* global Buffer, document, logseq, setTimeout, clearTimeout */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startWorkspaceServer } from "../../../task-copilot-cli/src/workspace-server.ts";
import { contentFixture } from "../fixtures/content-writeback.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const launcherEntry = join(repoRoot, "apps/task-copilot-cli/src/workspace-launcher.ts");

function createStdioMcpClient(stateDir, clientId = "codex") {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", launcherEntry, "workspace", "mcp", "--state-dir", stateDir, "--client", clientId],
    { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] }
  );
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  let stderr = "";
  const pending = new Map();

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  child.stdout.on("data", (chunk) => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : Buffer.from(chunk);
    let nl = buffer.indexOf(0x0a);
    while (nl !== -1) {
      const line = buffer.subarray(0, nl).toString("utf8").trim();
      buffer = buffer.subarray(nl + 1);
      if (line) {
        const msg = JSON.parse(line);
        if (typeof msg.id === "number" && pending.has(msg.id)) {
          const waiter = pending.get(msg.id);
          pending.delete(msg.id);
          waiter.resolve(msg);
        }
      }
      nl = buffer.indexOf(0x0a);
    }
  });
  child.once("exit", (code) => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`MCP exited (${code}): ${stderr}`));
    }
    pending.clear();
  });

  const request = (method, params) => {
    const id = nextId++;
    return new Promise((resolveReq, rejectReq) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectReq(new Error(`MCP timeout on ${method}: ${stderr}`));
      }, 20_000);
      pending.set(id, {
        resolve: (msg) => { clearTimeout(timer); resolveReq(msg); },
        reject: (err) => { clearTimeout(timer); rejectReq(err); },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`);
    });
  };

  const callTool = async (name, args = {}) => {
    const res = await request("tools/call", { name, arguments: args });
    assert.equal(res.error, undefined, `Unexpected JSON-RPC error: ${JSON.stringify(res.error)}`);
    return {
      isError: res.result.isError === true,
      data: JSON.parse(res.result.content[0].text),
    };
  };

  const close = async () => {
    child.stdin.end();
    await new Promise((resolveClose) => {
      if (child.exitCode !== null) { resolveClose(); return; }
      const timer = setTimeout(() => { child.kill("SIGTERM"); resolveClose(); }, 2000);
      child.once("exit", () => { clearTimeout(timer); resolveClose(); });
    });
  };

  return { request, callTool, close };
}

test("Logseq multi-target collaboration handoff integrates with real stdio MCP, reconciles external candidates without silent writes, and rejects stale revisions", async () => {
  const f = await contentFixture();
  const root = await realpath(await mkdtemp(join(tmpdir(), "logseq-mcp-collab-")));
  const workDir = join(root, "work-a");
  const stateDir = join(root, "state");
  await mkdir(workDir, { recursive: true });
  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    reading: { dshAvailable: async () => false },
  });
  let mcp = null;
  const previousNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = f.browser.NodeFilter;

  try {
    f.browser.apis = {
      doAction: async (args) => {
        const [command, ...values] = args;
        if (command === "readFile") return readFile(String(values[0]), "utf8");
        if (command === "writeFile") return writeFile(String(values[1]), String(values[2]));
        if (command === "mkdir-recur") return mkdir(String(values[0]), { recursive: true });
        if (command === "rename") return rename(String(values[0]), String(values[1]));
        if (command === "stat") {
          try {
            const info = await stat(String(values[0]));
            return { mode: info.mode, size: info.size };
          } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
          }
        }
        if (command === "listdir") {
          try {
            return (await readdir(String(values[0]))).map((name) => join(String(values[0]), name));
          } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
          }
        }
        throw new Error(`unsupported host action ${String(command)}`);
      },
      openPath: async () => {},
    };

    logseq.settings = {
      disabled: false,
      tasksEnabled: false,
      materialsEnabled: true,
      workViewEnabled: true,
      materialsAutoCapture: false,
      agentWorkspaceDescriptor: server.pluginDescriptorPath,
    };
    const origInsert = logseq.Editor.insertBlock.bind(logseq.Editor);
    logseq.Editor.insertBlock = (target, text, options = {}) =>
      origInsert(target, text, { ...options, customUUID: options.customUUID ?? crypto.randomUUID() });
    logseq.Editor.getPage = async () => ({ id: 1, name: "synthetic page", originalName: "synthetic page" });
    logseq.App.openExternalLink = async () => {};

    // Add a second separate work B so we can switch between A and B
    const workBRoot = "00000000-0000-4000-8000-0000000000b9";
    f.blocks.set(workBRoot, {
      uuid: workBRoot,
      content: "**[MiniProject]** 工作 B（独立范围）",
      parent: { id: 1 },
      page: { id: 1 },
      children: [],
    });

    await import(`../../src/index.ts?mcp-collab=${Date.now()}`);
    await f.boot();
    const api = f.browser.taskCopilotWorkbench;

    // Bind Work A directory and prepare normal + sensitive files
    await api.workspace.bind({
      scope: f.scope,
      directory: workDir,
      organization: "flat",
    });
    const noteFilePath = join(workDir, "brief-notes.md");
    const envFilePath = join(workDir, ".env.production");
    await writeFile(noteFilePath, "复核记录：定位编号 QPA-9472 已确认无误，等待值班组签字。");
    await writeFile(envFilePath, "SECRET_TOKEN=DO_NOT_EXPOSE_999");
    await api.materials.associate({ path: noteFilePath, sourceUuid: f.root });
    await api.materials.associate({ path: envFilePath, sourceUuid: f.root });

    await api.open(f.root);
    const aiRoot = document.querySelector(".wb-reading-ai");
    assert.ok(aiRoot);

    // 1. Quiet Notebook invariant: strictly ONE primary handoff button in main bar
    assert.equal(document.querySelectorAll(".wb-reading-ai .wb-ai-handoff").length, 1);
    const handoffBtn = aiRoot.querySelector(".wb-ai-handoff");
    assert.equal(handoffBtn.textContent, "在 DSH 继续");

    // 2. Open AI Assistant -> target select loads -> switch default target to Codex -> button adapts
    const toggleBtn = aiRoot.querySelector(".wb-ai-bar > button");
    toggleBtn.click();
    const targetSelect = aiRoot.querySelector(".wb-ai-target");
    for (let i = 0; i < 60 && targetSelect.hidden; i++) await delay(20);
    assert.equal(targetSelect.hidden, false);

    targetSelect.value = "antigravity";
    targetSelect.dispatchEvent(new f.browser.Event("change"));
    for (let i = 0; i < 60 && handoffBtn.textContent !== "在 Antigravity 继续"; i++) await delay(20);
    assert.equal(handoffBtn.textContent, "在 Antigravity 继续");

    targetSelect.value = "codex";
    targetSelect.dispatchEvent(new f.browser.Event("change"));
    for (let i = 0; i < 60 && handoffBtn.textContent !== "在 Codex 继续"; i++) await delay(20);
    assert.equal(handoffBtn.textContent, "在 Codex 继续");

    // 3. Click "在 Codex 继续" with a request -> establishes read-only connection, zero write escalation, shows quiet receipt bar
    const inputBox = aiRoot.querySelector("textarea");
    inputBox.value = "请结合 brief-notes.md 准备一版渐进式阅读候选。";
    inputBox.dispatchEvent(new f.browser.Event("input"));

    const writesBeforeHandoff = f.counts().writes;
    handoffBtn.click();
    const receiptBar = aiRoot.querySelector(".wb-ai-handoff-ready");
    for (let i = 0; i < 120 && receiptBar.hidden; i++) await delay(25);
    assert.equal(receiptBar.hidden, false);
    assert.match(receiptBar.textContent, /Codex/);
    assert.ok(Array.from(receiptBar.querySelectorAll("button")).some((b) => b.textContent === "复制交接指令"));
    assert.ok(Array.from(receiptBar.querySelectorAll("button")).some((b) => b.textContent === "打开工作目录"));

    const connStatus = api.agentWorkspace.status();
    assert.equal(connStatus.connected, true);
    assert.equal(connStatus.permissions.read, true);
    assert.equal(connStatus.permissions.bodyWrite, false);
    assert.equal(connStatus.permissions.fileWrite, false);
    assert.equal(connStatus.permissions.ordinaryTodo, false);
    assert.equal(f.counts().writes, writesBeforeHandoff);

    // 4. Real external stdio MCP process (Codex) reads active work, sources, materials (blocked on .env), and submits reading candidate
    mcp = createStdioMcpClient(stateDir, "codex");
    const initRes = await mcp.request("initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "codex", version: "1.0" }, capabilities: {} });
    assert.equal(initRes.result.serverInfo.name, "task-copilot-workbench");

    const active = await mcp.callTool("workbench_get_active_work", {});
    assert.equal(active.isError, false);
    assert.equal(active.data.handoff.request, "请结合 brief-notes.md 准备一版渐进式阅读候选。");
    const { structureVersion, sourceSetVersion } = active.data.versions;
    const sourceItems = active.data.sources.items;
    assert.ok(sourceItems.length >= 2);
    const normalMat = active.data.materials.find((m) => m.filename === "brief-notes.md");
    const envMat = active.data.materials.find((m) => m.filename === ".env.production");
    assert.ok(normalMat);
    assert.equal(normalMat.sensitiveBlocked, false);
    assert.ok(envMat);
    assert.equal(envMat.sensitiveBlocked, true);

    // Verify cross-work source read rejected & .env material blocked
    const crossDenied = await mcp.callTool("workbench_read_sources", { rootUuid: workBRoot });
    assert.equal(crossDenied.isError, true);
    assert.equal(crossDenied.data.error.code, "SCOPE_MISMATCH");

    const envDenied = await mcp.callTool("workbench_read_material", { materialId: envMat.id });
    assert.equal(envDenied.isError, true);
    assert.equal(envDenied.data.error.code, "SENSITIVE_MATERIAL_BLOCKED");
    assert.equal(JSON.stringify(envDenied.data).includes("DO_NOT_EXPOSE_999"), false);

    const matRead = await mcp.callTool("workbench_read_material", { materialId: normalMat.id });
    assert.equal(matRead.isError, false);
    assert.match(matRead.data.content, /QPA-9472/);

    // Submit structured progressive reading candidate via MCP
    const submitRes = await mcp.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion,
      structureVersion,
      summary: "Codex 结合复核记录整理的候选文章",
      paragraphs: [
        {
          key: "codex-summary",
          markdown: "当前工作已核对复核记录中的 **QPA-9472**，等待值班组签字回执后收口。",
          kind: "fact",
          cue: "QPA-9472",
          sourceIds: [sourceItems[0].sourceId, sourceItems[1].sourceId],
          details: [
            {
              key: "codex-detail-1",
              markdown: "外部附件已确认定位编号 **QPA-9472** 无误，原块记录保留完整未改动。",
              sourceIds: [sourceItems[1].sourceId],
              materialIds: [normalMat.id],
              materialQuotes: [{ materialId: normalMat.id, quote: "定位编号 QPA-9472 已确认无误" }],
            },
          ],
        },
      ],
    });
    assert.equal(submitRes.isError, false);
    assert.equal(submitRes.data.staged, true);
    assert.equal(submitRes.data.writesSource, false);

    // 5. Switch to Work B and return to Work A -> Logseq automatically detects "待采用修订" without silently replacing!
    await api.open(workBRoot);
    await api.open(f.root);
    for (let i = 0; i < 120 && !api.reading.read().candidate; i++) await delay(25);
    const beforeAdopt = api.reading.read();
    assert.equal(beforeAdopt.candidate?.status, "ready");
    assert.equal(beforeAdopt.activePlan?.briefing, undefined, "external candidate must wait for explicit adoption");
    assert.equal(f.counts().writes, writesBeforeHandoff, "staging external candidate must never write raw blocks");

    // Open candidate review dialog and click "采用修订"
    const candBtn = Array.from(aiRoot.querySelectorAll("button")).find((b) => b.textContent === "待采用修订");
    assert.ok(candBtn && !candBtn.hidden);
    candBtn.click();
    const adoptBtn = Array.from(aiRoot.querySelectorAll(".wb-ai-candidate button")).find((b) => b.textContent === "采用修订");
    assert.ok(adoptBtn && !adoptBtn.disabled);
    adoptBtn.click();
    for (let i = 0; i < 120 && !api.reading.read().activePlan?.briefing; i++) await delay(25);
    assert.match(api.reading.read().activePlan.briefing.paragraphs[0].markdown, /QPA-9472/);
    assert.equal(f.counts().writes, writesBeforeHandoff, "adopting reading candidate must never rewrite raw blocks");

    // 6. Stage a candidate BEFORE a raw source mutation, then mutate raw block in Logseq -> stale candidate is rejected both on MCP submit and on Logseq return!
    const preEditSubmit = await mcp.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion,
      structureVersion,
      summary: "编辑前提交的旧候选",
      paragraphs: [
        {
          key: "codex-summary",
          markdown: "旧版本候选，原文变化后绝不应覆盖。",
          kind: "fact",
          sourceIds: [sourceItems[0].sourceId],
        },
      ],
    });
    assert.equal(preEditSubmit.isError, false);

    // Mutate raw block directly in Logseq fixture
    f.blocks.get(f.a).content = "Alpha 原文已更新（新增签字回执）";
    const staleMcpSubmit = await mcp.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion,
      structureVersion,
      paragraphs: [{ key: "stale-direct", markdown: "直接提交过时版本。", kind: "fact", sourceIds: [sourceItems[0].sourceId] }],
    });
    assert.equal(staleMcpSubmit.isError, true);
    assert.equal(staleMcpSubmit.data.error.code, "STALE_SOURCE_VERSION");

    // Switch away and back to Work A -> previously staged old candidate is discarded as stale, existing article preserved!
    await api.open(workBRoot);
    await api.open(f.root);
    for (let i = 0; i < 120 && !aiRoot.querySelector(".wb-ai-status").textContent.includes("旧候选已忽略"); i++) await delay(25);
    assert.match(aiRoot.querySelector(".wb-ai-status").textContent, /旧候选已忽略/);
    assert.equal(api.reading.read().candidate, null);
    assert.match(api.reading.read().activePlan.briefing.paragraphs[0].markdown, /QPA-9472/);

    // 7. Writeback proposal via MCP never silently rewrites raw blocks on read-only connection
    const refreshedActive = await mcp.callTool("workbench_get_active_work", {});
    assert.equal(refreshedActive.isError, false);
    const freshBlockA = refreshedActive.data.sources.items.find((b) => b.blockUuid === f.a);
    const proposalRes = await mcp.callTool("workbench_propose_writeback", {
      kind: "content-proposal",
      sourceSetVersion: refreshedActive.data.versions.sourceSetVersion,
      structureVersion: refreshedActive.data.versions.structureVersion,
      summary: "建议补充复核时间",
      operations: [
        {
          operationId: "prop-1",
          type: "replace-text",
          sourceId: freshBlockA.sourceId,
          expectedContentVersion: freshBlockA.contentVersion,
          text: "Alpha 原文已更新（新增签字回执 · 15:00）",
        },
      ],
    });
    assert.equal(proposalRes.isError, false);
    assert.equal(proposalRes.data.writesSource, false);
    assert.equal(proposalRes.data.status, "pending-review");

    const unauthPatch = await mcp.callTool("workbench_propose_writeback", {
      kind: "authorized-content-patch",
      patch: { schemaVersion: 1, requestId: "unauth-1", scope: f.scope, operations: [], metadata: null },
    });
    assert.equal(unauthPatch.isError, true);
    assert.equal(unauthPatch.data.error.code, "CONTENT_WRITE_AUTHORIZATION_REQUIRED");
    assert.equal(f.counts().writes, writesBeforeHandoff);
  } finally {
    if (previousNodeFilter === undefined) delete globalThis.NodeFilter;
    else globalThis.NodeFilter = previousNodeFilter;
    if (mcp) await mcp.close();
    await f.unload();
    await server.close();
    await f.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});
