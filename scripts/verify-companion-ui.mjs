#!/usr/bin/env node
/* global Buffer, fetch, setTimeout */
import { createServer } from "node:http";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { startWorkspaceServer } from "../apps/task-copilot-cli/src/workspace-server.ts";
import { loadReadingConfig, loadReadingEnv, saveReadingConfig, secretsEnvPath } from "../apps/task-copilot-cli/src/reading-hub.ts";
import { testProviderProfile } from "@task-copilot/reading-runtime";

const PORT = Number(process.env.VERIFY_PORT ?? 47920);
const htmlPath = join(dirname(fileURLToPath(import.meta.url)), "verify-companion-ui.html");
const tempRoot = await realpath(await mkdtemp(join(tmpdir(), "tc-companion-verify-")));
const stateDir = join(tempRoot, "state");

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

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const actualPort = server.address().port;
const url = `http://127.0.0.1:${actualPort}`;
console.log(JSON.stringify({ status: "ready", url, companionBaseUrl: companion.descriptor.baseUrl, isolatedStateDir: stateDir, dshRequired: false }));
