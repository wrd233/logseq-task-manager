/* global Buffer, document, fetch, logseq, setTimeout, clearTimeout */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import process from "node:process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startWorkspaceServer } from "../../../task-copilot-cli/src/workspace-server.ts";
import { workspaceEntry } from "../../../task-copilot-cli/src/workspace-cli.ts";
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

test("Phase 3 end-to-end: in-place left note tidying with anchors/FLIP/tweak, safe undo vs post-edit snapshot protection, auto-copy handoff, and external MCP writeback review loop", async () => {
  const f = await contentFixture();
  const root = await realpath(await mkdtemp(join(tmpdir(), "logseq-phase3-tidy-")));
  const workDir = join(root, "work-a");
  const stateDir = join(root, "state");
  await mkdir(workDir, { recursive: true });

  // Local OpenAI-compatible mock model server for POST /plugin/note-tidy
  let modelCallCount = 0;
  const modelServer = createServer(async (req, res) => {
    modelCallCount++;
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const userMsg = body.messages.find((m) => m.role === "user");
    const payload = JSON.parse(userMsg.content);

    const editable = payload.blocks.filter((b) => !b.protected);
    const edits = editable.map((b) => {
      if (b.text.includes("冷启动白屏")) {
        // Keep [[缓存方案对比]], ((uuid)), 80%, QPA-9472; intentionally omit 120ms on first call to exercise omitted-anchor warning!
        return {
          blockId: b.blockId,
          afterText:
            modelCallCount === 1
              ? "冷启动白屏优化：参考 [[缓存方案对比]] 与 ((00000000-0000-4000-8000-000000000099))，首屏耗时已降低 80%（关联 QPA-9472），待压测复现低端机偶发抖动。"
              : "冷启动白屏优化：参考 [[缓存方案对比]] 与 ((00000000-0000-4000-8000-000000000099))，首屏耗时降低 80%（QPA-9472），低端机偶发抖动 120ms 待压测复现。",
        };
      }
      return {
        blockId: b.blockId,
        afterText: `${b.text.trim()}（表达已梳理）`,
      };
    });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                summary: "保留原思路与链接，顺滑收拢冷启动白屏排查表述。",
                edits,
                structuralChanges: [
                  {
                    kind: "group",
                    description: "保持原有层级，仅收拢口语重复句式并显式标出核心定位项",
                  },
                ],
                anchors: [
                  {
                    label: "冷启动白屏",
                    category: "term",
                    before: { blockId: editable[0].blockId, exactText: "冷启动白屏" },
                    after: { blockId: editable[0].blockId, exactText: "冷启动白屏" },
                  },
                ],
              }),
            },
          },
        ],
      })
    );
  });
  await new Promise((resolveListen) => modelServer.listen(0, "127.0.0.1", resolveListen));
  const modelPort = modelServer.address().port;

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    reading: {
      env: { DEEPSEEK_API_KEY: "phase3-test-secret" },
      dshAvailable: async () => false,
    },
  });

  await writeFile(
    join(stateDir, "providers.json"),
    JSON.stringify({
      schemaVersion: 1,
      routes: { fast: "deepseek-chat", deep: "deepseek-chat", local: null },
      budget: { maxStepsPerRun: 8, timeoutMs: 30000, backgroundMaxPerHour: 12, backgroundMaxPerDay: 60 },
      profiles: {
        "deepseek-chat": {
          label: "DeepSeek 默认",
          kind: "openai-compatible",
          baseUrl: `http://127.0.0.1:${modelPort}/v1`,
          model: "deepseek-chat",
          apiKey: "env:DEEPSEEK_API_KEY",
          locality: "remote",
        },
      },
    }),
    { mode: 0o600 }
  );

  let mcp = null;
  const previousNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = f.browser.NodeFilter;

  try {
    const copiedTexts = [];
    // Ensure copyMaterialLink routes through navigator.clipboard.writeText so we can assert auto-copy
    document.execCommand = () => false;
    Object.defineProperty(f.browser.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          copiedTexts.push(text);
        },
      },
    });

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

    // Prepare realistic Work A blocks: formal root + messy ordinary block A + child B + protected TODO block
    const originalBlockA =
      "排查冷启动白屏问题，其实主要是参考了 [[缓存方案对比]] 和 ((00000000-0000-4000-8000-000000000099))，首屏耗时降了 80%，关联单号 QPA-9472，低端机还有 120ms 偶发抖动待复现";
    const originalBlockB = "需要确认回归压测脚本是否覆盖低端机型，关联方案 [[缓存方案对比]]";
    const originalTodo = "TODO 联系测试同学补充低端机压测脚本";

    f.blocks.get(f.root).content = "**[MiniProject]** 启动优化专项";
    f.blocks.get(f.a).content = originalBlockA;
    f.blocks.get(f.b).content = originalBlockB;
    const todoUuid = f.add(originalTodo).uuid;

    // Work B for switching back and forth
    const workBRoot = f.add("**[MiniProject]** 工作 B（对照工作）", "").uuid;

    await import(`../../src/index.ts?phase3-tidy=${Date.now()}`);
    await f.boot();
    const api = f.browser.taskCopilotWorkbench;

    await api.workspace.bind({
      scope: f.scope,
      directory: workDir,
      organization: "flat",
    });

    await api.open(f.root);
    const originalRoot = f.blocks.get(f.root).content;
    const aiRoot = document.querySelector(".wb-reading-ai");
    assert.ok(aiRoot);

    // 1. Trigger subtree tidying via block context menu ("工作台：整理此段笔记") on block A
    const blockMenuHandler = f.menus.get("工作台：整理此段笔记");
    assert.equal(typeof blockMenuHandler, "function", "block context menu '工作台：整理此段笔记' must be registered");
    await blockMenuHandler({ uuid: f.a });

    const dialog = document.querySelector(".wb-tidy-dialog");
    assert.ok(dialog && !dialog.hidden, "tidy preview overlay must open");
    assert.equal(dialog.dataset.tidyMode, "plan");

    const bodyEl = dialog.querySelector(".wb-tidy-body");
    assert.equal(bodyEl.dataset.view, "after", "must default to clean tidied draft ('after')");

    // Verify high-prior anchors are highlighted with color slots and omitted anchor warning is displayed (120ms omitted on call 1)
    const afterAnchors = Array.from(bodyEl.querySelectorAll("[data-tidy-anchor-id]"));
    assert.ok(afterAnchors.length >= 4, `expected >= 4 highlighted anchors, got ${afterAnchors.length}`);
    assert.ok(afterAnchors.some((el) => el.textContent === "[[缓存方案对比]]"));
    assert.ok(afterAnchors.some((el) => el.textContent === "80%"));
    assert.ok(afterAnchors.some((el) => el.textContent === "QPA-9472"));
    for (const el of afterAnchors) {
      assert.match(el.dataset.slot, /^[0-4]$/);
    }
    assert.match(dialog.querySelector(".wb-tidy-meta").textContent, /未带入.*120ms/);
    assert.match(dialog.querySelector(".wb-tidy-struct-note").textContent, /结构调整说明/);

    // Switch to "整理前（原文）" and verify omitted anchor highlight + matching anchor IDs
    const beforeToggle = dialog.querySelector('button[data-tidy-view="before"]');
    const afterToggle = dialog.querySelector('button[data-tidy-view="after"]');
    beforeToggle.click();
    assert.equal(bodyEl.dataset.view, "before");
    const omittedSpans = Array.from(bodyEl.querySelectorAll(".wb-tidy-anchor-omitted"));
    assert.ok(omittedSpans.some((el) => el.textContent === "120ms"), "omitted anchor '120ms' must be highlighted in before view");

    // Verify Space shortcut flips back to 'after'
    dialog.dispatchEvent(new f.browser.KeyboardEvent("keydown", { key: " ", bubbles: true }));
    assert.equal(bodyEl.dataset.view, "after");
    assert.equal(afterToggle.getAttribute("aria-pressed"), "true");

    // Inline tweak before applying
    const tweakBtn = bodyEl.querySelector(".wb-tidy-tweak");
    assert.ok(tweakBtn);
    tweakBtn.click();
    const editBox = bodyEl.querySelector(".wb-tidy-edit-box");
    assert.ok(editBox);
    editBox.value = `${editBox.value}（人工微调确认）`;
    const finishTweakBtn = Array.from(bodyEl.querySelectorAll("button")).find((b) => b.textContent === "完成微调");
    finishTweakBtn.click();

    // Apply to left side
    const applyBtn = Array.from(dialog.querySelectorAll(".wb-tidy-head button")).find((b) => b.textContent === "应用到左侧");
    assert.ok(applyBtn && !applyBtn.disabled);
    applyBtn.click();
    for (let i = 0; i < 80 && !dialog.hidden; i++) await delay(20);
    assert.equal(dialog.hidden, true, "overlay closes after successful apply");

    // Verify raw block A updated with user's tweak, while protected formal root and TODO block are 100% untouched!
    assert.match(f.blocks.get(f.a).content, /冷启动白屏优化.*（人工微调确认）/);
    assert.equal(f.blocks.get(f.root).content, originalRoot, "formal root block must never be modified");
    assert.equal(f.blocks.get(todoUuid).content, originalTodo, "protected TODO block must never be modified");

    // 2. Verify quiet undo bar appears and 1-click Undo restores 100% verbatim when untouched
    const undoBar = aiRoot.querySelector(".wb-ai-undo-bar");
    assert.ok(undoBar && !undoBar.hidden);
    const undoBtn = Array.from(undoBar.querySelectorAll("button")).find((b) => b.textContent === "撤销整理");
    assert.ok(undoBtn);
    undoBtn.click();
    for (let i = 0; i < 80 && f.blocks.get(f.a).content !== originalBlockA; i++) await delay(20);
    assert.equal(f.blocks.get(f.a).content, originalBlockA, "1-click undo must restore original text verbatim");

    // 3. Re-trigger full-work "整理左侧笔记" via AI panel -> apply -> simulate user continuing to write -> Undo refuses overwrite & opens read-only snapshot!
    const toggleBtn = aiRoot.querySelector(".wb-ai-bar > button");
    toggleBtn.click();
    const tidyLeftBtn = Array.from(aiRoot.querySelectorAll("button")).find((b) => b.textContent === "整理左侧笔记");
    assert.ok(tidyLeftBtn);
    tidyLeftBtn.click();
    for (let i = 0; i < 80 && dialog.hidden; i++) await delay(20);
    assert.equal(dialog.hidden, false);
    // Call 2 preserves 120ms, so 0 omitted anchors!
    assert.match(dialog.querySelector(".wb-tidy-meta").textContent, /关键信息 .* 已保留/);
    const applyBtn2 = Array.from(dialog.querySelectorAll(".wb-tidy-head button")).find((b) => b.textContent === "应用到左侧");
    applyBtn2.click();
    for (let i = 0; i < 80 && !dialog.hidden; i++) await delay(20);
    assert.equal(dialog.hidden, true);
    assert.match(f.blocks.get(f.a).content, /120ms 待压测复现/);
    assert.equal(f.blocks.get(todoUuid).content, originalTodo);

    // User continues typing directly on the tidied block
    const userContinuedText = `${f.blocks.get(f.a).content}\n补记：今晚 8 点补充实测曲线`;
    f.blocks.get(f.a).content = userContinuedText;

    // Attempt Undo -> must REFUSE overwriting user's new text and open read-only snapshot viewer
    const undoBtn2 = Array.from(aiRoot.querySelectorAll(".wb-ai-undo-bar button")).find((b) => b.textContent === "撤销整理");
    assert.ok(undoBtn2);
    undoBtn2.click();
    for (let i = 0; i < 80 && dialog.hidden; i++) await delay(20);
    assert.equal(dialog.hidden, false, "read-only snapshot overlay must open when undo is blocked by subsequent edits");
    assert.equal(dialog.dataset.tidyMode, "snapshots");
    assert.match(dialog.textContent, /已续写 · 仅只读查看/);
    assert.ok(dialog.textContent.includes(originalBlockA), "snapshot viewer must display verbatim pre-tidy text");
    assert.equal(f.blocks.get(f.a).content, userContinuedText, "user's continued writing must NEVER be overwritten by undo");
    const closeSnapBtn = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "关闭");
    closeSnapBtn.click();
    assert.equal(dialog.hidden, true);

    // 4. Switch collaborate target to Codex -> click "在 Codex 继续" -> auto-copies handoff prompt in 1 click, connection remains read-only
    const targetSelect = aiRoot.querySelector(".wb-ai-target");
    for (let i = 0; i < 60 && targetSelect.hidden; i++) await delay(20);
    targetSelect.value = "codex";
    targetSelect.dispatchEvent(new f.browser.Event("change"));
    const handoffBtn = aiRoot.querySelector(".wb-ai-handoff");
    for (let i = 0; i < 60 && handoffBtn.textContent !== "在 Codex 继续"; i++) await delay(20);

    const copiesBefore = copiedTexts.length;
    handoffBtn.click();
    const receiptBar = aiRoot.querySelector(".wb-ai-handoff-ready");
    for (let i = 0; i < 120 && receiptBar.hidden; i++) await delay(25);
    assert.equal(receiptBar.hidden, false);
    assert.ok(copiedTexts.length > copiesBefore, "clicking '在 Codex 继续' must auto-copy handoff prompt in 1 click");
    assert.match(copiedTexts.at(-1), /workbench_get_active_work/);
    assert.match(aiRoot.querySelector(".wb-ai-status").textContent, /自动复制指令/);
    const connStatus = api.agentWorkspace.status();
    assert.equal(connStatus.permissions.bodyWrite, false, "handoff must never escalate write permissions");

    // 5. Real external stdio MCP process (Codex) proposes an in-place content-proposal writeback -> Logseq surfaces separate "待审原文改动（1）" -> unified FLIP review -> apply & consume!
    mcp = createStdioMcpClient(stateDir, "codex");
    await mcp.request("initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "codex", version: "1.0" }, capabilities: {} });
    const active = await mcp.callTool("workbench_get_active_work", {});
    assert.equal(active.isError, false);
    const blockBItem = active.data.sources.items.find((b) => b.blockUuid === f.b);
    assert.ok(blockBItem);
    const beforeProposalB = f.blocks.get(f.b).content;

    const proposedBlockBText = "回归压测确认：已核对低端机型覆盖清单，关联方案 [[缓存方案对比]]（Codex 协作补充）";
    const proposeRes = await mcp.callTool("workbench_propose_writeback", {
      kind: "content-proposal",
      sourceSetVersion: active.data.versions.sourceSetVersion,
      structureVersion: active.data.versions.structureVersion,
      summary: "Codex 建议补充压测清单结论并保留方案链接",
      structuralChanges: [{ kind: "group", description: "原地润色表达，保留原有大纲层级" }],
      operations: [
        {
          operationId: "codex-tidy-b",
          type: "replace-text",
          sourceId: blockBItem.sourceId,
          expectedContentVersion: blockBItem.contentVersion,
          text: proposedBlockBText,
        },
      ],
    });
    assert.equal(proposeRes.isError, false);
    assert.equal(proposeRes.data.writesSource, false);
    assert.ok(proposeRes.data.proposal.plan.anchors.length >= 1, "MCP proposal must carry auto-extracted high-prior anchors");
    assert.equal(f.blocks.get(f.b).content, beforeProposalB, "MCP proposal must never silently rewrite raw block");

    // Switch away to Work B and return to Work A -> quiet "待审原文改动（1）" appears separately from hidden "待采用修订"
    await api.open(workBRoot);
    await api.open(f.root);
    const writebackBtn = aiRoot.querySelector(".wb-ai-writeback");
    for (let i = 0; i < 120 && writebackBtn.hidden; i++) await delay(25);
    assert.equal(writebackBtn.hidden, false, "'待审原文改动（1）' must surface automatically on return");
    assert.equal(writebackBtn.textContent, "待审原文改动（1）");
    const candBtn = Array.from(aiRoot.querySelectorAll("button")).find((b) => b.textContent === "待采用修订");
    assert.equal(candBtn.hidden, true, "reading candidate entry must remain strictly separate from writeback proposal entry");

    // Wave P0: Companion /dsh/navigate-logseq (review-writeback) opens FLIP overlay directly inside Logseq without logseq://
    const prevSkipActivate = process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
    process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = "1";
    try {
      const entry = await workspaceEntry(workDir);
      const navRes = await fetch(`${server.descriptor.baseUrl}/dsh/navigate-logseq`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${server.descriptor.token}`,
          "x-workspace-instance": server.descriptor.instanceId,
        },
        body: JSON.stringify({
          connectionId: entry.connectionId,
          scope: entry.binding.scope,
          intent: "review-writeback",
          proposalId: proposeRes.data.proposal.proposalId,
          clientId: "dsh:phase3-test",
        }),
      });
      const navBody = await navRes.json();
      assert.equal(navRes.ok, true, JSON.stringify(navBody));
      assert.equal(navBody.value.navigated, true);
      assert.equal(navBody.value.openedReview, true);
      assert.equal(dialog.hidden, false, "workbench.navigate(review-writeback) must open FLIP preview overlay directly");
      dialog.dispatchEvent(new f.browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert.equal(dialog.hidden, true);
    } finally {
      if (prevSkipActivate === undefined) delete process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
      else process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = prevSkipActivate;
    }

    // Click "待审原文改动（1）" -> opens unified FLIP overlay with external-mcp title & anchors -> click "应用到左侧"
    writebackBtn.click();
    assert.equal(dialog.hidden, false);
    assert.match(dialog.querySelector(".wb-tidy-head").textContent, /外部原文改动提案/);
    assert.ok(dialog.querySelectorAll("[data-tidy-anchor-id]").length >= 1);

    const applyMcpBtn = Array.from(dialog.querySelectorAll(".wb-tidy-head button")).find((b) => b.textContent === "应用到左侧");
    applyMcpBtn.click();
    for (let i = 0; i < 80 && !dialog.hidden; i++) await delay(20);
    assert.equal(dialog.hidden, true);
    assert.equal(f.blocks.get(f.b).content, proposedBlockBText, "applying MCP proposal must write cleanly to left raw block");
    assert.equal(writebackBtn.hidden, true, "applied proposal must be consumed and button hidden");

    // Switch away and back again -> consumed proposal must NOT resurface
    await api.open(workBRoot);
    await api.open(f.root);
    await delay(120);
    assert.equal(writebackBtn.hidden, true, "consumed MCP proposal must stay consumed across work switches");
  } finally {
    if (previousNodeFilter === undefined) delete globalThis.NodeFilter;
    else globalThis.NodeFilter = previousNodeFilter;
    if (mcp) await mcp.close();
    await f.unload();
    await server.close();
    await new Promise((resolveClose) => modelServer.close(resolveClose));
    await f.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});

test("NoteTidyPreviewOverlay mounts in-place over target left Logseq block inside #main-content-container, hides id:: clutter, and restores DOM cleanly on close", async () => {
  const f = await contentFixture();
  try {
    const { NoteTidyPreviewOverlay } = await import("../../src/features/note-tidy/preview-ui.ts");
    const main = document.createElement("div");
    main.id = "main-content-container";
    const nativeBlock = document.createElement("div");
    nativeBlock.className = "ls-block";
    nativeBlock.setAttribute("blockid", "673e1111-1111-4111-8111-000000000001");
    main.append(nativeBlock);
    document.body.append(main);

    const overlay = new NoteTidyPreviewOverlay({
      onApply: async () => {},
      onUndoSnapshot: async () => ({ restored: true }),
      getBlock: async () => null,
    });
    document.body.append(overlay.root);

    overlay.openPlan({
      schemaVersion: 1,
      summary: "原地梳理两段普通笔记，保持原有层级不变。",
      sourceSetVersion: "ss-1",
      structureVersion: "sv-1",
      hasExistingStructure: true,
      structuralChanges: [],
      operations: [
        {
          operationId: "op-1",
          type: "replace-text",
          sourceId: "s-2",
          blockUuid: "b-2",
          expectedContentVersion: "v-2",
          beforeText: "原句包含 [[缓存方案对比]] 和 80%",
          afterText: "整理后包含 [[缓存方案对比]]，进度 80%",
        },
      ],
      beforeBlocks: [
        {
          id: "s-1",
          sourceId: "s-1",
          blockUuid: "673e1111-1111-4111-8111-000000000001",
          parentId: null,
          depth: 0,
          content: "**[MiniProject]** 启动优化专项\nid:: 673e1111-1111-4111-8111-000000000001",
          protected: true,
          changed: false,
        },
        {
          id: "s-2",
          sourceId: "s-2",
          blockUuid: "b-2",
          parentId: "s-1",
          depth: 1,
          content: "原句包含 [[缓存方案对比]] 和 80%",
          protected: false,
          changed: true,
        },
      ],
      afterBlocks: [
        {
          id: "s-1",
          sourceId: "s-1",
          blockUuid: "673e1111-1111-4111-8111-000000000001",
          parentId: null,
          depth: 0,
          content: "**[MiniProject]** 启动优化专项\nid:: 673e1111-1111-4111-8111-000000000001",
          protected: true,
          changed: false,
        },
        {
          id: "s-2",
          sourceId: "s-2",
          blockUuid: "b-2",
          parentId: "s-1",
          depth: 1,
          content: "整理后包含 [[缓存方案对比]]，进度 80%",
          protected: false,
          changed: true,
        },
      ],
      anchors: [
        {
          id: "a-1",
          label: "[[缓存方案对比]]",
          category: "link",
          colorSlot: 0,
          before: { sourceId: "s-2", exactText: "[[缓存方案对比]]" },
          after: { targetId: "s-2", exactText: "[[缓存方案对比]]" },
        },
      ],
      omittedAnchorIds: [],
      protectedBlockCount: 1,
      meta: { origin: "local-model" },
    });

    // Must mount inside #main-content-container, keep right fallback hidden, mask target native block
    assert.equal(overlay.root.hidden, true, "right sidebar fallback must stay hidden when mounted in left pane");
    const hostSheet = main.querySelector(".wb-host-tidy");
    assert.ok(hostSheet, "overlay must mount inside #main-content-container");
    assert.equal(hostSheet.dataset.placement, "inline");
    assert.equal(nativeBlock.getAttribute("data-wb-tidy-masked"), "true");
    assert.equal(hostSheet.textContent.includes("id:: 673e1111"), false, "technical id:: line must be hidden in preview");
    assert.equal(hostSheet.textContent.includes("[MiniProject] 启动优化专项"), true);

    // Space toggles to before view on host document; Escape closes and unmasks cleanly
    document.dispatchEvent(new f.browser.KeyboardEvent("keydown", { key: " ", bubbles: true }));
    assert.equal(overlay.currentView, "before");
    // Escape closes and unmasks cleanly
    document.dispatchEvent(new f.browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(overlay.open, false);
    assert.equal(main.querySelector(".wb-host-tidy"), null);
    assert.equal(nativeBlock.getAttribute("data-wb-tidy-masked"), null);

    // DSH-originated writeback proposal renders dedicated DSH title
    overlay.openPlan({
      schemaVersion: 1,
      summary: "来自 DSH 对话的整理提案",
      sourceSetVersion: "s-v1",
      structureVersion: "st-v1",
      hasExistingStructure: true,
      structuralChanges: [],
      operations: [],
      beforeBlocks: [{ id: "s-2", sourceId: "s-2", blockUuid: "b-2", parentId: "s-1", depth: 1, content: "原文", protected: false, changed: true }],
      afterBlocks: [{ id: "s-2", sourceId: "s-2", blockUuid: "b-2", parentId: "s-1", depth: 1, content: "整理后", protected: false, changed: true }],
      anchors: [],
      omittedAnchorIds: [],
      protectedBlockCount: 0,
      meta: { origin: "external-mcp", providerId: "dsh:sess-1", proposalId: "prop-dsh-1" },
    });
    assert.equal(main.querySelector(".wb-host-tidy")?.textContent.includes("来自 DSH 的原文改动提案"), true);
    overlay.close();

    overlay.dispose();
    assert.equal(document.head.querySelector("style[data-wb-host-tidy-style]"), null);
  } finally {
    await f.cleanup();
  }
});

test("Phase 3: applyNoteTidyPlan tolerates unrelated background Journal checkEditing UUID while blocking active edits on affected blocks", async () => {
  const f = await contentFixture();
  try {
    const { applyNoteTidyPlan } = await import("../../src/features/note-tidy/executor.ts");
    const { sha256 } = await import("../../src/workspace/source-protocol.ts");
    const targetUuid = f.a;
    const original = f.blocks.get(targetUuid).content;
    const originalVersion = await sha256(original);
    const makePlan = (afterText) => ({
      schemaVersion: 1,
      sourceSetVersion: "ss-1",
      structureVersion: "sv-1",
      summary: "测试无关块编辑态放行与受影响块拦截",
      structuralChanges: [],
      operations: [
        {
          operationId: "op-check-editing",
          type: "replace-text",
          sourceId: targetUuid,
          blockUuid: targetUuid,
          expectedContentVersion: originalVersion,
          beforeText: original,
          afterText,
        },
      ],
      beforeBlocks: [],
      afterBlocks: [],
      anchors: [],
      omittedAnchorIds: [],
      protectedBlockCount: 0,
      meta: { origin: "local-model" },
    });

    // 1. Active edit on the affected target block itself -> MUST refuse
    f.editing(targetUuid);
    await assert.rejects(
      () =>
        applyNoteTidyPlan({
          workKey: "test-work-editing",
          scope: f.scope,
          plan: makePlan("不应落盘"),
          checkActive: async () => {},
        }),
      /请先结束原生编辑输入/
    );
    assert.equal(f.blocks.get(targetUuid).content, original);

    // 2. Boolean true (unknown editing block) -> MUST refuse (fail closed)
    f.editing(true);
    await assert.rejects(
      () =>
        applyNoteTidyPlan({
          workKey: "test-work-editing",
          scope: f.scope,
          plan: makePlan("不应落盘"),
          checkActive: async () => {},
        }),
      /请先结束原生编辑输入/
    );
    assert.equal(f.blocks.get(targetUuid).content, original);

    // 3. Stale/unrelated background Journal block UUID -> MUST allow clean apply!
    f.editing("00000000-0000-4000-8000-999999999999");
    const applied = await applyNoteTidyPlan({
      workKey: "test-work-editing",
      scope: f.scope,
      plan: makePlan("整理后顺畅句子，原链接保留"),
      checkActive: async () => {},
    });
    assert.equal(applied.appliedCount, 1);
    assert.equal(f.blocks.get(targetUuid).content, "整理后顺畅句子，原链接保留");
  } finally {
    await f.cleanup();
  }
});
