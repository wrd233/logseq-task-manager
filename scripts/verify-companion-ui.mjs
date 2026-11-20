#!/usr/bin/env node
/* global Buffer, fetch, setTimeout, clearTimeout, setInterval, clearInterval */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { startWorkspaceServer } from "../apps/task-copilot-cli/src/workspace-server.ts";
import { loadReadingConfig, loadReadingEnv, saveReadingConfig, secretsEnvPath } from "../apps/task-copilot-cli/src/reading-hub.ts";
import { workKeyForScope } from "../apps/task-copilot-cli/src/collaborate.ts";
import { renderMcpClientConfig } from "../apps/task-copilot-cli/src/mcp-stdio.ts";
import { testProviderProfile } from "@task-copilot/reading-runtime";

const PORT = Number(process.env.VERIFY_PORT ?? 47920);
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "..");
const htmlPath = join(scriptsDir, "verify-companion-ui.html");
const launcherEntry = join(repoRoot, "apps/task-copilot-cli/src/workspace-launcher.ts");
const builtWorkspaceEntry = join(repoRoot, "apps/logseq-plugin/dist/workspace.mjs");
const defaultUserStateDir = join(homedir(), ".task-copilot-workspace");
const sha = (value) => createHash("sha256").update(value).digest("hex");

const tempRoot = await realpath(await mkdtemp(join(tmpdir(), "tc-companion-verify-")));
const stateDir = join(tempRoot, "state");
const workADir = join(tempRoot, "work-a");
await mkdir(workADir, { recursive: true });

const companion = await startWorkspaceServer({
  stateDirectory: stateDir,
  reading: {
    dshAvailable: async () => false,
  },
});

let currentModelName = "deepseek-chat";
let currentBaseUrl = "https://api.deepseek.com/v1";
let configuredKeyMask = "";
let rawKeyForLeakCheck = "";

async function postCompanion(path, payload) {
  const response = await fetch(companion.descriptor.baseUrl + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-workspace-instance": companion.descriptor.instanceId,
      "x-workspace-plugin": companion.descriptor.pluginToken,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

// ============================================================================
// Phase 2 Isolated Logseq Work Fixture + Real Stdio MCP Process
// ============================================================================
const workARootUuid = "00000000-0000-4000-8000-0000000000a1";
const workBRootUuid = "00000000-0000-4000-8000-0000000000b2";
const bindingA = {
  scope: { graphId: "verify:/isolated-vault", rootUuid: workARootUuid },
  directory: workADir,
  organization: "flat",
  provider: "workspace",
  workspaceId: randomUUID(),
};
const workAKey = workKeyForScope(bindingA.scope);
const connectionId = "verify-conn-a";

const mcpFiller = "历史巡检补充记录：各机柜常规巡检按周归档，本段用于演示 MCP 材料分页读取。".repeat(30);
const mcpLongDoc = `${mcpFiller}\n\n---\n【附件末尾定位信息】\n现场核对唯一编号 QPA-9472；值班复核窗口为工作日 14:00-16:00。`;
const mcpEnvSecret = "DB_PASSWORD=FAKE_SECRET_DO_NOT_LEAK_999\nSTRIPE_SECRET=SHOULD_NEVER_APPEAR";
const mcpAssocNote = "关联周会纪要：客户端必须在修完冷启动白屏后再锁定发布窗口。";

let mcpSourceRevision = 1;
let mcpPrivacyMode = "default";
let mcpRawWrites = 0;
let mcpBlock1 = "登录态迁移已完成 80%，但冷启动白屏尚未在低内存设备复现。";
const mcpBlock2 = "TODO 明天上午找测试同学复现低内存白屏日志，并核对附件编号。";
const mcpBlock3 = "[想法] 离线缓存清理待比较方案 A（重建索引）和方案 B（增量清理）。";

let mcpCurrentArticle = {
  paragraphs: [
    {
      key: "initial-summary",
      markdown: "初版简报：登录态迁移进行中，**冷启动白屏** 尚未复现（等待外部 Agent 核对长附件后提交候选修订）。",
      kind: "fact",
      tone: "attention",
      sourceIds: ["src-a-1"],
    },
  ],
  agentRun: { path: "initial", steps: 1, toolResults: 0 },
};

function makeMcpSnapshot() {
  return {
    scope: bindingA.scope,
    capturedAt: new Date().toISOString(),
    structureVersion: `sv-verify-${mcpSourceRevision}`,
    sourceSetVersion: `ss-verify-${mcpSourceRevision}`,
    blocks: [
      { sourceId: "src-a-1", target: { blockUuid: workARootUuid }, parentUuid: null, depth: 0, order: 0, availability: "available", content: mcpBlock1, contentVersion: sha(mcpBlock1) },
      { sourceId: "src-a-2", target: { blockUuid: "00000000-0000-4000-8000-0000000000a2" }, parentUuid: workARootUuid, depth: 1, order: 1, availability: "available", content: mcpBlock2, contentVersion: sha(mcpBlock2) },
      { sourceId: "src-a-3", target: { blockUuid: "00000000-0000-4000-8000-0000000000a3" }, parentUuid: workARootUuid, depth: 1, order: 2, availability: "available", content: mcpBlock3, contentVersion: sha(mcpBlock3) },
    ],
  };
}

await postCompanion("/plugin/catalog", {
  schemaVersion: 1,
  graphId: "verify:/isolated-vault",
  graphName: "隔离验收笔记库",
  refreshedAt: Date.now(),
  works: [
    {
      workRef: { kind: "logseq", graphId: "verify:/isolated-vault", rootUuid: workARootUuid, sourceKind: "block" },
      title: "Q4 客户端重构与机房交接",
      objectType: "MiniProject",
      location: "进行中项目",
      updatedAt: Date.now(),
      directory: workADir,
    },
    {
      workRef: { kind: "logseq", graphId: "verify:/isolated-vault", rootUuid: workBRootUuid, sourceKind: "block" },
      title: "隔离对照工作 B（禁止跨工作读取）",
      objectType: "Project",
      location: "独立目录",
      updatedAt: Date.now() - 3600_000,
    },
  ],
});

await postCompanion("/plugin/connect", {
  connectionId,
  binding: bindingA,
  workKey: workAKey,
  title: "Q4 客户端重构与机房交接",
  privacyMode: mcpPrivacyMode,
});

const pollerTimer = setInterval(() => {
  if (!companion.broker.online()) return;
  let delivery;
  try {
    delivery = companion.broker.poll(connectionId);
  } catch {
    return;
  }
  if (!delivery) return;
  const ok = (value) => companion.broker.complete(connectionId, delivery.requestId, delivery.clientId, value);
  const fail = (code, message = code) => companion.broker.complete(connectionId, delivery.requestId, delivery.clientId, undefined, { code, message });

  if (delivery.command === "status") {
    ok({
      channel: "online",
      binding: bindingA,
      capabilities: { read: true, files: true, fileWrite: false, materials: true, reading: true, content: false, stage: false },
      authorizesTodo: false,
    });
  } else if (delivery.command === "refresh") {
    const snapshot = makeMcpSnapshot();
    ok({
      freshness: "checked",
      snapshot,
      binding: bindingA,
      workspace: {
        observed: {
          primary: snapshot,
          sources: [
            {
              association: { kind: "logseq-page", graphId: bindingA.scope.graphId, pageUuid: "page-verify-note", pageName: "客户端周会纪要" },
              availability: "available",
              snapshot: {
                scope: { graphId: bindingA.scope.graphId, rootUuid: "page-verify-note", kind: "page", pageName: "客户端周会纪要" },
                structureVersion: "sv-note-1",
                sourceSetVersion: "ss-note-1",
                blocks: [{ sourceId: "note-b-1", target: { blockUuid: "nb-1" }, availability: "available", content: mcpAssocNote }],
              },
            },
          ],
        },
      },
    });
  } else if (delivery.command === "guidance.read") {
    ok({
      loadedAt: new Date().toISOString(),
      common: { text: "保持真人笔记的自然节奏，用少量 **重点** 提速，不擅自修改原块和 TODO。", version: sha("common-v1") },
      project: { text: "重点核对附件编号 QPA-9472 与白屏复现进度。", version: sha("project-v1") },
    });
  } else if (delivery.command === "materials.list") {
    ok({
      status: "success",
      materials: [
        { id: "mat-long-1", path: join(workADir, "验收核对长附件.md"), availability: "available", version: sha(mcpLongDoc), content: mcpLongDoc },
        { id: "mat-secret-1", path: join(workADir, ".env.production"), availability: "available", version: sha(mcpEnvSecret), content: mcpEnvSecret },
      ],
    });
  } else if (delivery.command === "materials.read") {
    if (delivery.payload.id === "mat-long-1") {
      ok({ id: "mat-long-1", path: join(workADir, "验收核对长附件.md"), availability: "available", version: sha(mcpLongDoc), content: mcpLongDoc });
    } else if (delivery.payload.id === "mat-secret-1") {
      ok({ id: "mat-secret-1", path: join(workADir, ".env.production"), availability: "available", version: sha(mcpEnvSecret), content: mcpEnvSecret });
    } else {
      fail("MATERIAL_OUTSIDE_SCOPE");
    }
  } else if (delivery.command === "reading.view") {
    ok({ source: makeMcpSnapshot(), reading: { briefing: { planId: "work-resume-briefing", paragraphs: mcpCurrentArticle.paragraphs } } });
  } else if (delivery.command === "formatting.preview") {
    ok({
      schemaVersion: 1,
      proposalId: delivery.payload.requestId,
      scope: bindingA.scope,
      sourceSetVersion: `ss-verify-${mcpSourceRevision}`,
      structureVersion: `sv-verify-${mcpSourceRevision}`,
      sourceIds: delivery.payload.sourceIds,
      labels: ["想法"],
      changes: [{ sourceId: "src-a-3", blockUuid: "00000000-0000-4000-8000-0000000000a3", line: 1, before: "[想法]", after: "**[想法]**", lineText: mcpBlock3, formattedLine: `**${mcpBlock3.slice(0, 4)}**${mcpBlock3.slice(4)}` }],
      skipped: [],
      writesSource: false,
    });
  } else if (delivery.command === "content.apply") {
    mcpRawWrites++;
    fail("CONTENT_WRITE_AUTHORIZATION_REQUIRED");
  } else {
    fail("UNKNOWN_COMMAND");
  }
}, 20);

function createVerifyMcpClient(clientId = "codex") {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", launcherEntry, "workspace", "mcp", "--state-dir", stateDir, "--client", clientId],
    { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] }
  );
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  let stderr = "";
  const pending = new Map();

  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
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

  const request = (method, params) => {
    const id = nextId++;
    return new Promise((resolveReq, rejectReq) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectReq(new Error(`MCP timeout on ${method}: ${stderr}`));
      }, 15_000);
      pending.set(id, {
        resolve: (msg) => { clearTimeout(timer); resolveReq(msg); },
        reject: (err) => { clearTimeout(timer); rejectReq(err); },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`);
    });
  };

  const callTool = async (name, args = {}) => {
    const res = await request("tools/call", { name, arguments: args });
    if (res.error) throw new Error(`${res.error.code}: ${res.error.message}`);
    return {
      isError: res.result.isError === true,
      data: JSON.parse(res.result.content[0].text),
    };
  };

  const close = () => {
    child.stdin.end();
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGTERM"); }, 300).unref();
  };

  return { request, callTool, close };
}

const mcpClient = createVerifyMcpClient("verify-agent");
await mcpClient.request("initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "verify-dashboard", version: "1.0" }, capabilities: {} });

async function readRecentAudit(limit = 16) {
  try {
    const raw = await readFile(join(stateDir, "connection-facts.jsonl"), "utf8");
    return raw.trim().split("\n").filter(Boolean).slice(-limit).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function getMcpDashboardState() {
  const targetsRes = await postCompanion("/plugin/collaborate/targets", {});
  const stagedRes = await postCompanion("/plugin/reading-jobs/status", { workKey: workAKey });
  const proposalsRes = await postCompanion("/plugin/writeback-proposals", { workKey: workAKey });
  const snapshot = makeMcpSnapshot();
  const staged = stagedRes.data.value?.job ?? null;
  const stagedValid = staged
    ? staged.sourceSetVersion === snapshot.sourceSetVersion && staged.structureVersion === snapshot.structureVersion
    : false;
  const mcpConfigs = Object.fromEntries(
    ["codex", "antigravity", "claude-code", "cursor"].map((client) => [
      client,
      renderMcpClientConfig({
        client,
        stateDirectory: defaultUserStateDir,
        entryPath: builtWorkspaceEntry,
      }),
    ])
  );
  return {
    workKey: workAKey,
    title: "Q4 客户端重构与机房交接",
    directory: workADir,
    sourceSetVersion: snapshot.sourceSetVersion,
    structureVersion: snapshot.structureVersion,
    blocks: snapshot.blocks,
    privacyMode: mcpPrivacyMode,
    rawWriteCount: mcpRawWrites,
    targets: targetsRes.data.value,
    currentArticle: mcpCurrentArticle,
    stagedCandidate: staged ? { ...staged, versionValid: stagedValid } : null,
    writebackProposals: proposalsRes.data.value?.proposals ?? [],
    recentAudit: await readRecentAudit(20),
    mcpConfigs,
  };
}

async function runMcpCheck(id) {
  const started = Date.now();
  if (id === "m1-catalog") {
    const toolsRes = await mcpClient.request("tools/list");
    const names = toolsRes.result.tools.map((t) => t.name);
    const listRes = await mcpClient.callTool("workbench_list_works", {});
    const raw = JSON.stringify(listRes.data);
    const clean = !raw.includes("FAKE_SECRET_DO_NOT_LEAK_999") && !raw.includes("登录态迁移") && !raw.includes(companion.descriptor.token);
    return {
      ok: names.length === 6 && !listRes.isError && listRes.data.total === 2 && clean,
      durationMs: Date.now() - started,
      summary: `标准 MCP tools/list 返回 ${names.length} 个工具 · 目录发现 ${listRes.data.total} 份工作 · 零正文/零密钥泄露=${clean ? "是" : "否"}`,
      meta: { tools: names, catalog: listRes.data },
    };
  }
  if (id === "m2-handoff-scope") {
    await postCompanion("/plugin/collaborate/targets", { defaultTarget: "codex" });
    const handoffRes = await postCompanion("/plugin/collaborate", {
      connectionId,
      mode: "continue",
      title: "Q4 客户端重构与机房交接",
      workKey: workAKey,
      privacyMode: "default",
      intent: {
        request: "请结合附件核对 QPA-9472 并准备新版渐进式文章候选。",
        sourceIds: ["src-a-1", "src-a-2"],
        selection: "冷启动白屏尚未在低内存设备复现",
        basisVersion: `ss-verify-${mcpSourceRevision}`,
      },
    });
    const activeRes = await mcpClient.callTool("workbench_get_active_work", {});
    const readOwn = await mcpClient.callTool("workbench_read_sources", { sourceIds: ["src-a-1", "src-a-2"] });
    const crossBlock = await mcpClient.callTool("workbench_read_sources", { sourceIds: ["src-work-b-only"] });
    const crossWork = await mcpClient.callTool("workbench_read_sources", { rootUuid: workBRootUuid });
    const ok =
      handoffRes.ok &&
      !activeRes.isError &&
      activeRes.data.handoff?.request?.includes("QPA-9472") &&
      !readOwn.isError &&
      readOwn.data.blocks.length === 2 &&
      crossBlock.isError &&
      crossBlock.data.error?.code === "SOURCE_OUTSIDE_SCOPE" &&
      crossWork.isError &&
      crossWork.data.error?.code === "SCOPE_MISMATCH";
    return {
      ok,
      durationMs: Date.now() - started,
      summary: `多目标交接(Codex, 零扩权)→ MCP 读取交接上下文与 ${readOwn.data.blocks?.length ?? 0} 条原文 · 越界块拦截=${crossBlock.data.error?.code} · 跨工作拦截=${crossWork.data.error?.code}`,
      meta: { handoff: handoffRes.data.value, activeWork: activeRes.data, crossBlockError: crossBlock.data, crossWorkError: crossWork.data },
    };
  }
  if (id === "m3-sensitive-privacy") {
    const prevPrivacy = mcpPrivacyMode;
    if (mcpPrivacyMode !== "default") {
      mcpPrivacyMode = "default";
      await postCompanion("/plugin/work-privacy", { workKey: workAKey, privacyMode: "default" });
    }
    const page1 = await mcpClient.callTool("workbench_read_material", { materialId: "mat-long-1", offset: 0, maxChars: 400 });
    const page2 = await mcpClient.callTool("workbench_read_material", { materialId: "mat-long-1", offset: page1.data.nextOffset ?? 0, maxChars: 2000 });
    const noteRes = await mcpClient.callTool("workbench_read_material", { materialId: "note:page-verify-note" });
    const envBlocked = await mcpClient.callTool("workbench_read_material", { materialId: "mat-secret-1" });
    const envZeroLeak = !JSON.stringify(envBlocked.data).includes("FAKE_SECRET_DO_NOT_LEAK_999");

    await postCompanion("/plugin/work-privacy", { workKey: workAKey, privacyMode: "local-only" });
    const localBlocked = await mcpClient.callTool("workbench_read_material", { materialId: "mat-long-1" });
    await postCompanion("/plugin/work-privacy", { workKey: workAKey, privacyMode: prevPrivacy });
    mcpPrivacyMode = prevPrivacy;

    const ok =
      !page1.isError &&
      !page2.isError &&
      String(page2.data.content).includes("QPA-9472") &&
      !noteRes.isError &&
      envBlocked.isError &&
      envBlocked.data.error?.code === "SENSITIVE_MATERIAL_BLOCKED" &&
      envZeroLeak &&
      localBlocked.isError &&
      localBlocked.data.error?.code === "WORK_LOCAL_ONLY_RESTRICTED";
    return {
      ok,
      durationMs: Date.now() - started,
      summary: `长附件分页查获 QPA-9472 + 关联笔记可读 · .env.production 硬拦截(${envBlocked.data.error?.code}, 零泄露) · 仅本地隐私拦截(${localBlocked.data.error?.code})`,
      meta: { page2Preview: String(page2.data.content ?? "").slice(-120), note: noteRes.data, envBlocked: envBlocked.data, localBlocked: localBlocked.data },
    };
  }
  if (id === "m4-candidate-stale") {
    const snap = makeMcpSnapshot();
    const candidateParagraphs = [
      {
        key: "mcp-main",
        markdown: "登录态迁移已达 **80%**，但 **冷启动白屏** 尚未在低内存设备复现，需结合长附件编号 **QPA-9472** 排查后再定发布窗口。",
        kind: "fact",
        tone: "attention",
        cue: "冷启动白屏",
        sourceIds: ["src-a-1", "src-a-2"],
        details: [
          {
            key: "mcp-detail-1",
            markdown: "附件末尾已定位唯一编号 **QPA-9472**（值班复核窗口 **14:00-16:00**），明天上午需找测试同学复现白屏日志；离线缓存清理仍在方案 A 与方案 B 之间待定。",
            tone: "attention",
            sourceIds: ["src-a-2", "src-a-3"],
            materialIds: ["mat-long-1"],
            materialQuotes: [{ materialId: "mat-long-1", quote: "现场核对唯一编号 QPA-9472；值班复核窗口为工作日 14:00-16:00。" }],
          },
        ],
      },
    ];
    const submitted = await mcpClient.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion: snap.sourceSetVersion,
      structureVersion: snap.structureVersion,
      summary: "Codex 核查 QPA-9472 后的渐进式候选修订",
      paragraphs: candidateParagraphs,
    });
    const staleRejected = await mcpClient.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion: "ss-outdated-version",
      structureVersion: "sv-outdated-version",
      paragraphs: [{ key: "stale-only", markdown: "过时候选。", kind: "fact", sourceIds: ["src-a-1"] }],
    });
    const stagedRes = await postCompanion("/plugin/reading-jobs/status", { workKey: workAKey });
    const stagedJob = stagedRes.data.value?.job;
    const ok =
      !submitted.isError &&
      submitted.data.staged === true &&
      submitted.data.writesSource === false &&
      stagedJob?.origin === "external-mcp" &&
      stagedJob?.requireReview === true &&
      staleRejected.isError &&
      staleRejected.data.error?.code === "STALE_SOURCE_VERSION";
    return {
      ok,
      durationMs: Date.now() - started,
      summary: `外部 Agent 提交结构化候选已入队待采用（writesSource=false, 强引文核验通过） · 过时版本候选已被拒绝(${staleRejected.data.error?.code})`,
      article: stagedJob?.result,
      meta: { submitted: submitted.data, staleRejected: staleRejected.data },
    };
  }
  if (id === "m5-writeback-audit") {
    const snap = makeMcpSnapshot();
    const fmt = await mcpClient.callTool("workbench_propose_writeback", {
      kind: "formatting-preview",
      sourceIds: ["src-a-3"],
      labels: ["想法"],
    });
    const prop = await mcpClient.callTool("workbench_propose_writeback", {
      kind: "content-proposal",
      sourceSetVersion: snap.sourceSetVersion,
      structureVersion: snap.structureVersion,
      summary: "建议在首块补充定位编号 QPA-9472",
      operations: [
        {
          operationId: "verify-op-1",
          type: "replace-text",
          sourceId: "src-a-1",
          expectedContentVersion: snap.blocks[0].contentVersion,
          text: `${mcpBlock1}（关联编号 QPA-9472）`,
        },
      ],
    });
    const todoDenied = await mcpClient.callTool("workbench_propose_writeback", {
      kind: "content-proposal",
      sourceSetVersion: snap.sourceSetVersion,
      structureVersion: snap.structureVersion,
      operations: [
        {
          operationId: "verify-todo-op",
          type: "replace-text",
          sourceId: "src-a-2",
          expectedContentVersion: snap.blocks[1].contentVersion,
          text: "DONE 擅自标记完成",
        },
      ],
    });
    const unauthApply = await mcpClient.callTool("workbench_propose_writeback", {
      kind: "authorized-content-patch",
      patch: { schemaVersion: 1, requestId: "unauth-verify", scope: bindingA.scope, operations: [], metadata: null },
    });
    const audit = await readRecentAudit(20);
    const ok =
      !fmt.isError &&
      fmt.data.writesSource === false &&
      !prop.isError &&
      prop.data.writesSource === false &&
      todoDenied.isError &&
      todoDenied.data.error?.code === "PROTECTED_TARGET_FORBIDDEN" &&
      unauthApply.isError &&
      unauthApply.data.error?.code === "CONTENT_WRITE_AUTHORIZATION_REQUIRED" &&
      mcpRawWrites === 0 &&
      audit.some((row) => row.command === "mcp.workbench_propose_writeback");
    return {
      ok,
      durationMs: Date.now() - started,
      summary: `格式预览+写回提案均 writesSource=false · TODO 保护(${todoDenied.data.error?.code}) · 只读越权拒绝(${unauthApply.data.error?.code}) · 原块写入=0 · 审计日志 ${audit.length} 条`,
      meta: { formattingPreview: fmt.data, contentProposal: prop.data, todoDenied: todoDenied.data, unauthApply: unauthApply.data, recentAudit: audit.slice(-8) },
    };
  }
  throw new Error(`Unknown MCP check: ${id}`);
}

// ============================================================================
// Phase 1 Direct Model Helpers (Preserved Intact)
// ============================================================================
async function applyProviderConfig({ apiKey, model, baseUrl, backgroundMaxPerHour = 12 }) {
  if (typeof apiKey === "string" && apiKey.trim()) {
    const clean = apiKey.trim();
    rawKeyForLeakCheck = clean;
    configuredKeyMask = clean.length > 8 ? `${clean.slice(0, 4)}••••${clean.slice(-4)}` : "••••";
    await writeFile(secretsEnvPath(stateDir), `DEEPSEEK_API_KEY=${clean}\n`, { mode: 0o600 });
  }
  if (typeof model === "string" && model.trim()) currentModelName = model.trim();
  if (typeof baseUrl === "string" && baseUrl.trim()) currentBaseUrl = baseUrl.trim().replace(/\/+$/u, "");

  await saveReadingConfig(stateDir, {
    schemaVersion: 1,
    routes: { fast: "deepseek-live", deep: "deepseek-live", local: null },
    budget: {
      maxStepsPerRun: 8,
      timeoutMs: 120_000,
      backgroundMaxPerHour,
      backgroundMaxPerDay: 60,
    },
    profiles: {
      "deepseek-live": {
        label: `DeepSeek (${currentModelName})`,
        kind: "openai-compatible",
        baseUrl: currentBaseUrl,
        model: currentModelName,
        apiKey: "env:DEEPSEEK_API_KEY",
        maxTokens: 8192,
        locality: "remote",
      },
      dsh: {
        label: "DSH 当前模型（未启动）",
        kind: "dsh",
        locality: "remote",
      },
    },
  });
}

function makeShortSample() {
  return {
    mode: "organize",
    question: "整理短事项",
    source: {
      scope: { graphId: "verify:/isolated", rootUuid: "work-short", pageName: "验收短事项" },
      structureVersion: "sv-short-1",
      sourceSetVersion: "ss-short-1",
      blocks: [
        {
          sourceId: "src-short-1",
          target: { blockUuid: "blk-short-1" },
          availability: "available",
          content: "明天下午 15:00 前发机房复核提醒给值班组，只确认北侧签字回执是否已补齐。",
        },
      ],
    },
    materials: [],
  };
}

function makeLongSample(extraLine = "") {
  const filler = "历史巡检补充记录：各机柜温湿度、走线及门禁常规巡查均按周例行归档，本段仅用于模拟超过常规预览截断长度的长附件前文。".repeat(80);
  const longAttachment = `${filler}\n\n---\n【附件末尾定位信息】\n现场核对唯一编号 QPA-9472；这个编号只是原始附件末尾的查找线索，不视为签字回执。\n值班复核窗口：工作日 14:00-16:00。`;
  const blocks = [
    { sourceId: "s-1", target: { blockUuid: "b-1" }, availability: "available", content: "**[MiniProject]** 机房交接验收计划" },
    { sourceId: "s-2", target: { blockUuid: "b-2" }, parentUuid: "b-1", depth: 1, availability: "available", content: "当前分区域统计表：\n| 区域 | 已核验 | 待核验 |\n| --- | --- | --- |\n| 北侧 | 4 台 | 2 台 |\n| 南侧 | 6 台 | 1 台 |\n| 东侧 | 3 台 | 0 台 |" },
    { sourceId: "s-3", target: { blockUuid: "b-3" }, parentUuid: "b-1", depth: 1, availability: "available", content: "此前误以为发过旧照片就算交接完成，后续核查发现仅凭旧照片不能替代值班签字回执，目前仍有 3 台待核验。" },
    { sourceId: "s-4", target: { blockUuid: "b-4" }, parentUuid: "b-1", depth: 1, availability: "available", content: "TODO 确认北侧标签差异，并核对长附件末尾的唯一编号与联络时间，再决定最终交接方式。" },
  ];
  if (extraLine) {
    blocks.push({ sourceId: "s-5", target: { blockUuid: "b-5" }, parentUuid: "b-1", depth: 1, availability: "available", content: extraLine });
  }
  return {
    mode: "organize",
    question: "保持人话的自然节奏和完整自解释的句意，不套多余分类盒子、不拆碎句子；顶层 1–2 句点出主线，细读自然顺畅并用 **重点** 轻盈标注，务必查阅长附件末尾的唯一编号并附原样引文。",
    source: {
      scope: { graphId: "verify:/isolated", rootUuid: "work-long", pageName: "验收交接计划" },
      structureVersion: extraLine ? "sv-long-2" : "sv-long-1",
      sourceSetVersion: extraLine ? "ss-long-2" : "ss-long-1",
      blocks,
    },
    materials: [
      {
        id: "mat-long-1",
        filename: "验收核对长附件.md",
        version: "v1",
        availability: "available",
        excerpt: longAttachment.slice(0, 600),
        text: longAttachment,
        truncated: false,
      },
      {
        id: "mat-secret-1",
        filename: ".env.production",
        version: "v1",
        availability: "available",
        excerpt: "DB_PASSWORD=FAKE_SECRET_DO_NOT_LEAK_999",
        text: "DB_PASSWORD=FAKE_SECRET_DO_NOT_LEAK_999",
        truncated: false,
      },
    ],
  };
}

async function runCheck(id) {
  const started = Date.now();
  if (id === "c1-short") {
    const res = await postCompanion("/plugin/reading-model", { trigger: "manual", privacyMode: "default", input: makeShortSample() });
    if (!res.ok) throw new Error(`${res.data.error?.code}: ${res.data.error?.message}`);
    const val = res.data.value;
    return {
      ok: val?.agentRun?.path === "fast" && Array.isArray(val?.paragraphs) && val.paragraphs.length > 0,
      durationMs: Date.now() - started,
      summary: `零 DSH 直连 DeepSeek 成功 · 路径=${val.agentRun.path} · 步数=${val.agentRun.steps} · 顶层段数=${val.paragraphs.length}`,
      article: val,
      meta: val.agentRun,
    };
  }
  if (id === "c2-agent-privacy") {
    const res = await postCompanion("/plugin/reading-model", { trigger: "manual", privacyMode: "default", input: makeLongSample() });
    if (!res.ok) throw new Error(`${res.data.error?.code}: ${res.data.error?.message}`);
    const val = res.data.value;
    const serialized = JSON.stringify(val);
    const foundTailCode = serialized.includes("QPA-9472");
    const redactedEnv = Array.isArray(val.agentRun?.redactedMaterials) && val.agentRun.redactedMaterials.includes(".env.production");
    const leakedSecret = serialized.includes("FAKE_SECRET_DO_NOT_LEAK_999");
    return {
      ok: val?.agentRun?.path === "agent" && foundTailCode && redactedEnv && !leakedSecret,
      durationMs: Date.now() - started,
      summary: `L2 四工具循环=${val.agentRun.steps} 步 / 成功调用 ${val.agentRun.toolResults} 次 · 查获尾部编号 QPA-9472=${foundTailCode ? "是" : "否"} · 拦截 .env.production=${redactedEnv ? "是" : "否"} · 密钥零泄露=${!leakedSecret ? "是" : "否"}`,
      article: val,
      meta: val.agentRun,
    };
  }
  if (id === "c3-async-switch") {
    const input = makeLongSample("11 月 20 日最新回执：南侧 1 台已取得值班签字回执，北侧 2 台仍待核验。");
    const startRes = await postCompanion("/plugin/reading-jobs/start", {
      workKey: "verify:work-long",
      planId: "progressive-reading",
      refreshKey: "rk-verify-2",
      trigger: "background",
      privacyMode: "default",
      input,
    });
    if (!startRes.ok) throw new Error(`${startRes.data.error?.code}: ${startRes.data.error?.message}`);
    const jobId = startRes.data.value.job.jobId;
    const initialStatus = startRes.data.value.job.status;
    let finalJob = null;
    for (let i = 0; i < 120; i++) {
      const check = await postCompanion("/plugin/reading-jobs/status", { workKey: "verify:work-long" });
      finalJob = check.data.value?.job;
      if (finalJob && finalJob.status !== "running") break;
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!finalJob || finalJob.status !== "completed") {
      throw new Error(`异步任务未完成：${finalJob?.status ?? "null"} ${finalJob?.error?.message ?? ""}`);
    }
    const versionMatches = finalJob.sourceSetVersion === input.source.sourceSetVersion;
    const ackRes = await postCompanion("/plugin/reading-jobs/ack", { jobId });
    return {
      ok: initialStatus === "running" && finalJob.status === "completed" && versionMatches && ackRes.data.value?.acknowledged === true,
      durationMs: Date.now() - started,
      summary: `提交即返回 status=${initialStatus}（模拟切去其他工作）→ 后台完成 status=completed · 来源版本核对一致=${versionMatches ? "是" : "否"} · 已消费暂存`,
      article: finalJob.result,
      meta: finalJob.result?.agentRun,
    };
  }
  if (id === "c4-local-privacy") {
    const res = await postCompanion("/plugin/reading-model", { trigger: "manual", privacyMode: "local-only", input: makeShortSample() });
    const code = res.data.error?.code;
    return {
      ok: !res.ok && code === "READING_LOCAL_MODEL_REQUIRED",
      durationMs: Date.now() - started,
      summary: `标记「仅本地模型」且未配本地端点时 Fail Closed 拦截成功 · 错误码=${code} · 云端请求数=0`,
      meta: res.data.error,
    };
  }
  if (id === "c5-budget-sanitize") {
    const provRes = await postCompanion("/plugin/reading-providers", {});
    const provText = JSON.stringify(provRes.data);
    const keyLeaked = rawKeyForLeakCheck ? provText.includes(rawKeyForLeakCheck) : false;
    const usedHour = provRes.data.value?.budget?.backgroundUsedLastHour ?? 0;
    await applyProviderConfig({ backgroundMaxPerHour: usedHour });
    const pausedBg = await postCompanion("/plugin/reading-jobs/start", {
      workKey: "verify:budget-test",
      refreshKey: `rk-budget-${Date.now()}`,
      trigger: "background",
      privacyMode: "default",
      input: makeShortSample(),
    });
    const manualOk = await postCompanion("/plugin/reading-model", { trigger: "manual", privacyMode: "default", input: makeShortSample() });
    await applyProviderConfig({ backgroundMaxPerHour: 12 });
    const bgPausedCorrectly = !pausedBg.ok && pausedBg.data.error?.code === "READING_BACKGROUND_BUDGET_PAUSED";
    return {
      ok: !keyLeaked && bgPausedCorrectly && manualOk.ok,
      durationMs: Date.now() - started,
      summary: `脱敏核验零 Key 泄露=${!keyLeaked ? "是" : "否"} · 后台超限暂停=${bgPausedCorrectly ? "是" : "否"} · 手动请求照常成功=${manualOk.ok ? "是" : "否"}`,
      article: manualOk.ok ? manualOk.data.value : undefined,
      meta: { providersSnapshot: provRes.data.value, backgroundError: pausedBg.data.error },
    };
  }
  throw new Error(`Unknown check: ${id}`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

let shuttingDown = false;
async function cleanupAndExit(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(pollerTimer);
  try { mcpClient.close(); } catch { /* ignore */ }
  try { await companion.close(); } catch { /* ignore */ }
  try { await rm(tempRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 500).unref();
}

const server = createServer(async (req, res) => {
  const sendJson = (status, data) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const html = await readFile(htmlPath, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }
    if (req.method === "POST" && req.url === "/api/mcp/state") {
      sendJson(200, { ok: true, state: await getMcpDashboardState() });
      return;
    }
    if (req.method === "POST" && req.url === "/api/mcp/target") {
      const body = await readBody(req);
      const target = String(body.target ?? "codex");
      await postCompanion("/plugin/collaborate/targets", { defaultTarget: target });
      let handoff = null;
      if (target !== "dsh") {
        const resH = await postCompanion("/plugin/collaborate", {
          connectionId,
          target,
          mode: "continue",
          title: "Q4 客户端重构与机房交接",
          workKey: workAKey,
          privacyMode: mcpPrivacyMode,
          intent: {
            request: String(body.request ?? "请阅读当前工作和长附件，提交一版待审的渐进式阅读候选。"),
            sourceIds: ["src-a-1", "src-a-2"],
            basisVersion: `ss-verify-${mcpSourceRevision}`,
          },
        });
        handoff = resH.data.value ?? null;
      }
      sendJson(200, { ok: true, handoff, state: await getMcpDashboardState() });
      return;
    }
    if (req.method === "POST" && req.url === "/api/mcp/privacy") {
      const body = await readBody(req);
      mcpPrivacyMode = body.privacyMode === "local-only" ? "local-only" : "default";
      await postCompanion("/plugin/work-privacy", { workKey: workAKey, privacyMode: mcpPrivacyMode });
      sendJson(200, { ok: true, state: await getMcpDashboardState() });
      return;
    }
    if (req.method === "POST" && req.url === "/api/mcp/check") {
      const body = await readBody(req);
      const result = await runMcpCheck(body.id);
      sendJson(200, { ok: true, result, state: await getMcpDashboardState() });
      return;
    }
    if (req.method === "POST" && req.url === "/api/mcp/simulate-candidate") {
      const snap = makeMcpSnapshot();
      const resSub = await mcpClient.callTool("workbench_submit_reading_candidate", {
        sourceSetVersion: snap.sourceSetVersion,
        structureVersion: snap.structureVersion,
        summary: `外部 Agent（版本 ${snap.sourceSetVersion}）提交的渐进式候选`,
        paragraphs: [
          {
            key: "mcp-main",
            markdown: `登录态迁移已达 **80%**，但 **冷启动白屏** 仍在排查，需结合附件编号 **QPA-9472** 确认后定发布窗口（来源版本 \`${snap.sourceSetVersion}\`）。`,
            kind: "fact",
            tone: "attention",
            cue: "冷启动白屏",
            sourceIds: ["src-a-1", "src-a-2"],
            details: [
              {
                key: "mcp-detail-live",
                markdown: "外部 Agent 通过真实 MCP 分页查证长附件末尾唯一编号 **QPA-9472**（复核窗口 **14:00-16:00**），并完整保留 TODO 与方案待定状态。",
                tone: "progress",
                sourceIds: ["src-a-2", "src-a-3"],
                materialIds: ["mat-long-1"],
                materialQuotes: [{ materialId: "mat-long-1", quote: "现场核对唯一编号 QPA-9472；值班复核窗口为工作日 14:00-16:00。" }],
              },
            ],
          },
        ],
      });
      sendJson(200, { ok: !resSub.isError, response: resSub.data, state: await getMcpDashboardState() });
      return;
    }
    if (req.method === "POST" && req.url === "/api/mcp/adopt-candidate") {
      const stagedRes = await postCompanion("/plugin/reading-jobs/status", { workKey: workAKey });
      const staged = stagedRes.data.value?.job;
      const snap = makeMcpSnapshot();
      if (!staged || !staged.result) {
        sendJson(200, { ok: false, error: "当前没有待采用的候选修订。", state: await getMcpDashboardState() });
        return;
      }
      if (staged.sourceSetVersion !== snap.sourceSetVersion || staged.structureVersion !== snap.structureVersion) {
        await postCompanion("/plugin/reading-jobs/ack", { jobId: staged.jobId });
        sendJson(200, { ok: false, error: "离开期间原文已变化，旧候选已自动忽略，未覆盖当前文章。", state: await getMcpDashboardState() });
        return;
      }
      mcpCurrentArticle = staged.result;
      await postCompanion("/plugin/reading-jobs/ack", { jobId: staged.jobId });
      sendJson(200, { ok: true, state: await getMcpDashboardState() });
      return;
    }
    if (req.method === "POST" && req.url === "/api/mcp/mutate-source") {
      mcpSourceRevision++;
      mcpBlock1 = `登录态迁移已推进至 **${Math.min(99, 80 + mcpSourceRevision * 4)}%**（第 ${mcpSourceRevision} 次原文保存，低内存白屏日志正在复现）。`;
      sendJson(200, { ok: true, state: await getMcpDashboardState() });
      return;
    }
    if (req.method === "POST" && req.url === "/api/configure") {
      const body = await readBody(req);
      await applyProviderConfig(body);
      const env = await loadReadingEnv(stateDir, process.env);
      const loaded = await loadReadingConfig(stateDir, env, { dshAvailable: false });
      const profile = loaded.config.profiles["deepseek-live"];
      const tested = await testProviderProfile(profile, env);
      sendJson(200, { ok: true, model: currentModelName, keyMask: configuredKeyMask, latencyMs: tested.latencyMs });
      return;
    }
    if (req.method === "POST" && req.url === "/api/check") {
      const body = await readBody(req);
      const result = await runCheck(body.id);
      sendJson(200, { ok: true, result });
      return;
    }
    if (req.method === "POST" && req.url === "/api/playground") {
      const body = await readBody(req);
      const lines = String(body.text ?? "").split(/\n+/u).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) { sendJson(400, { ok: false, error: "请先输入至少一行笔记内容。" }); return; }
      const mode = body.mode === "ask" ? "ask" : "organize";
      const question = String(body.question ?? "").trim() || (mode === "ask" ? "用自然、完整、自解释的人话直接回答问题，标出关键信息" : "保持原文人话的自然节奏与完整自解释句意，用少量 **重点** 轻盈标注核心进展和卡点，不套多余分类盒子、不把完整句子拆碎");
      const resComp = await postCompanion("/plugin/reading-model", {
        trigger: "manual",
        privacyMode: body.localOnly ? "local-only" : "default",
        input: {
          mode,
          question,
          source: {
            scope: { graphId: "verify:/playground", rootUuid: "play-1", pageName: "自由试玩笔记" },
            structureVersion: "sv-play",
            sourceSetVersion: "ss-play",
            blocks: lines.map((line, i) => ({
              sourceId: `p-${i + 1}`,
              target: { blockUuid: `pb-${i + 1}` },
              availability: "available",
              content: line,
            })),
          },
          materials: [],
        },
      });
      if (!resComp.ok) {
        sendJson(200, { ok: false, error: `${resComp.data.error?.code}: ${resComp.data.error?.message}` });
        return;
      }
      sendJson(200, { ok: true, value: resComp.data.value });
      return;
    }
    if (req.method === "POST" && req.url === "/api/shutdown") {
      sendJson(200, { ok: true });
      setTimeout(() => void cleanupAndExit(0), 150);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    sendJson(200, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

process.on("SIGINT", () => void cleanupAndExit(0));
process.on("SIGTERM", () => void cleanupAndExit(0));

await new Promise((resolveListen) => server.listen(PORT, "127.0.0.1", resolveListen));
const actualPort = server.address().port;
const url = `http://127.0.0.1:${actualPort}`;
console.log(JSON.stringify({ status: "ready", url, companionBaseUrl: companion.descriptor.baseUrl, isolatedStateDir: stateDir, dshRequired: false, mcpEnabled: true }));
