import { access, appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  callProviderTurn,
  isProfileConfigured,
  type FetchLike,
} from "@task-copilot/reading-runtime";
import {
  classifyInboxItem,
  dateKeyFromMs,
  type StageInboxAiHint,
  type StageInboxPocket,
  type StageInboxViewItem,
} from "@task-copilot/stage-runtime";
import { loadReadingConfig, loadReadingEnv } from "./reading-hub.ts";
import { atomicJson } from "./workspace-files.ts";

export interface JournalInboxSignalRecord {
  blockUuid: string;
  journalDate: string;
  pageName: string;
  text: string;
  links?: string[];
  updatedAt: number;
}

export interface JournalSignalsFile {
  schemaVersion: 1;
  graphId: string;
  graphName: string;
  graphPath?: string;
  updatedAt: number;
  signals: JournalInboxSignalRecord[];
}

export interface PendingJournalCapture {
  graphId?: string;
  captureId: string;
  text: string;
  formattedLine: string;
  sourceAgent: string;
  contextTitle?: string;
  contextWorkKey?: string;
  pocketHint?: StageInboxPocket;
  journalDate: string;
  createdAt: number;
}

interface PendingJournalFile {
  schemaVersion: 1;
  captures: PendingJournalCapture[];
  updatedAt: number;
}

const journalSignalsPath = (stateDir: string): string => join(stateDir, "stage-journal-signals.json");
const pendingJournalPath = (stateDir: string): string => join(stateDir, "stage-pending-journal.json");

export async function readJournalSignals(stateDir: string): Promise<JournalSignalsFile | null> {
  try {
    const raw = JSON.parse(await readFile(journalSignalsPath(stateDir), "utf8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1 || !Array.isArray(raw.signals)) {
      return null;
    }
    const signals: JournalInboxSignalRecord[] = [];
    for (const item of raw.signals) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.blockUuid !== "string" || !rec.blockUuid || typeof rec.text !== "string" || !rec.text.trim()) {
        continue;
      }
      signals.push({
        blockUuid: rec.blockUuid.slice(0, 128),
        journalDate: typeof rec.journalDate === "string" ? rec.journalDate.slice(0, 16) : "",
        pageName: typeof rec.pageName === "string" ? rec.pageName.slice(0, 128) : "",
        text: rec.text.replace(/\s+/gu, " ").trim().slice(0, 400),
        ...(Array.isArray(rec.links)
          ? { links: rec.links.filter((l): l is string => typeof l === "string" && l.length > 0).slice(0, 12) }
          : {}),
        updatedAt: typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : Date.now(),
      });
    }
    return {
      schemaVersion: 1,
      graphId: typeof raw.graphId === "string" ? raw.graphId : "",
      graphName: typeof raw.graphName === "string" ? raw.graphName : "",
      ...(typeof raw.graphPath === "string" && raw.graphPath.startsWith("/") ? { graphPath: raw.graphPath } : {}),
      updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
      signals,
    };
  } catch {
    return null;
  }
}

export async function writeJournalSignals(stateDir: string, data: JournalSignalsFile): Promise<void> {
  await atomicJson(journalSignalsPath(stateDir), data);
}

export async function readPendingJournalCaptures(stateDir: string): Promise<PendingJournalCapture[]> {
  try {
    const raw = JSON.parse(await readFile(pendingJournalPath(stateDir), "utf8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1 || !Array.isArray(raw.captures)) {
      return [];
    }
    const out: PendingJournalCapture[] = [];
    for (const item of raw.captures) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      if (
        typeof rec.captureId !== "string" ||
        !rec.captureId ||
        typeof rec.text !== "string" ||
        !rec.text.trim() ||
        typeof rec.formattedLine !== "string" ||
        typeof rec.journalDate !== "string"
      ) {
        continue;
      }
      const pocketHint =
        rec.pocketHint === "sweep" || rec.pocketHint === "commit" || rec.pocketHint === "spark"
          ? rec.pocketHint
          : undefined;
      out.push({
        captureId: rec.captureId,
        ...(typeof rec.graphId === "string" ? { graphId: rec.graphId } : {}),
        text: rec.captureId.startsWith("evening:") ? rec.text : rec.text.slice(0, 400),
        formattedLine: rec.formattedLine.slice(0, 500),
        sourceAgent: typeof rec.sourceAgent === "string" && rec.sourceAgent ? rec.sourceAgent.slice(0, 64) : "agent",
        ...(typeof rec.contextTitle === "string" && rec.contextTitle ? { contextTitle: rec.contextTitle.slice(0, 120) } : {}),
        ...(typeof rec.contextWorkKey === "string" && rec.contextWorkKey ? { contextWorkKey: rec.contextWorkKey.slice(0, 512) } : {}),
        ...(pocketHint ? { pocketHint } : {}),
        journalDate: rec.journalDate.slice(0, 16),
        createdAt: typeof rec.createdAt === "number" && Number.isFinite(rec.createdAt) ? rec.createdAt : Date.now(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function writePendingJournalCaptures(stateDir: string, captures: readonly PendingJournalCapture[]): Promise<void> {
  const payload: PendingJournalFile = {
    schemaVersion: 1,
    captures: [...captures],
    updatedAt: Date.now(),
  };
  await atomicJson(pendingJournalPath(stateDir), payload);
}

export function formatJournalCaptureLine(input: {
  text: string;
  sourceAgent: string;
  contextTitle?: string;
  pocketHint?: StageInboxPocket;
  prefixHint?: "想法" | "注" | "急" | "承诺";
}): string {
  const clean = input.text.replace(/\s+/gu, " ").trim().slice(0, 360);
  const hasLeadingMarker =
    /^(?:TODO|LATER|NOW|DOING)\b/u.test(clean) || /^\*\*\[[^\]]+\]\*\*/u.test(clean) || /^\[[^\]]+\]/u.test(clean);

  let prefix = "";
  if (!hasLeadingMarker) {
    if (input.prefixHint) {
      prefix = `**[${input.prefixHint}]** `;
    } else {
      const cls = classifyInboxItem({
        id: "preview",
        text: clean,
        sourceType: "agent-capture",
        ...(input.pocketHint ? { pocketHint: input.pocketHint } : {}),
      });
      const tag = cls.pocket === "commit" ? "承诺" : cls.pocket === "sweep" ? "急" : "想法";
      prefix = `**[${tag}]** `;
    }
  }

  const originTag = input.contextTitle
    ? `（来自 ${input.sourceAgent} · ${input.contextTitle.slice(0, 48)}）`
    : `（来自 ${input.sourceAgent}）`;
  return `${prefix}${clean} ${originTag}`.trim();
}

export function isoWeekKeyFromMs(ms: number): string {
  const d = new Date(ms);
  // ISO 8601 week calculation in local date
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function isReadableDir(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function resolveStageReviewsDirectory(options: {
  stateDirectory: string;
  graphPath?: string | undefined;
  configuredDir?: string | undefined;
}): Promise<string> {
  const configured = options.configuredDir?.trim() || process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR?.trim();
  const home = homedir();
  if (configured) {
    const expanded =
      configured === "~"
        ? home
        : configured.startsWith("~/") || configured.startsWith("~\\")
          ? join(home, configured.slice(2))
          : resolve(configured);
    await mkdir(expanded, { recursive: true });
    return expanded;
  }

  if (options.graphPath && options.graphPath.startsWith("/") && (await isReadableDir(options.graphPath))) {
    const pagesDir = join(options.graphPath, "pages");
    if (await isReadableDir(pagesDir)) {
      const reviewsDir = join(pagesDir, "stage-reviews");
      await mkdir(reviewsDir, { recursive: true });
      return reviewsDir;
    }
  }

  const fallback = join(resolve(options.stateDirectory), "stage-workspace");
  await mkdir(fallback, { recursive: true });
  return fallback;
}

export async function appendToWeeklyReview(options: {
  stateDirectory: string;
  graphPath?: string | undefined;
  configuredDir?: string | undefined;
  summary: string;
  sourceLabel: string;
  areaName?: string | undefined;
  projectTitle?: string | undefined;
  now?: number;
}): Promise<{ filePath: string; weekKey: string; pageTitle: string }> {
  const now = options.now ?? Date.now();
  const dir = await resolveStageReviewsDirectory({
    stateDirectory: options.stateDirectory,
    graphPath: options.graphPath,
    configuredDir: options.configuredDir,
  });
  const weekKey = isoWeekKeyFromMs(now);
  const filePath = join(dir, `复盘___${weekKey}.md`);
  const pageTitle = `复盘/${weekKey}`;
  const dateStr = dateKeyFromMs(now);

  let exists = true;
  try {
    await access(filePath);
  } catch {
    exists = false;
  }

  const links: string[] = [];
  if (options.areaName) links.push(`[[Area/${options.areaName.replace(/[[\]]/gu, "")}]]`);
  if (options.projectTitle) links.push(`[[${options.projectTitle.replace(/[[\]]/gu, "")}]]`);
  const cleanSummary = options.summary.replace(/\r?\n/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 280);
  const line = `- ${cleanSummary}${links.length > 0 ? ` ${links.join(" ")}` : ""}（来源：${options.sourceLabel}，${dateStr}）\n`;

  if (!exists) {
    const header = `type:: 周复盘\nweek:: ${weekKey}\n\n- ## 本周随想沉淀\n  ${line}`;
    await appendFile(filePath, header, "utf8");
  } else {
    await appendFile(filePath, `  ${line}`, "utf8");
  }

  return { filePath, weekKey, pageTitle };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function refineInboxItemsWithFastModel(options: {
  stateDirectory: string;
  items: readonly StageInboxViewItem[];
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  now?: number;
}): Promise<{ hints: Record<string, StageInboxAiHint>; model: string; count: number } | { error: string }> {
  const now = options.now ?? Date.now();
  const targets = options.items.filter((i) => !i.cooled).slice(0, 15);
  if (targets.length === 0) {
    return { error: "当前没有需要 AI 轻梳理的活跃条目。" };
  }

  const env = await loadReadingEnv(options.stateDirectory, options.env ?? process.env);
  const { config } = await loadReadingConfig(options.stateDirectory, env, { dshAvailable: false });
  const preferredId = config.routes.fast ?? config.routes.deep ?? config.routes.local;
  const preferredProfile = preferredId ? config.profiles[preferredId] : undefined;
  const profile =
    (preferredProfile && preferredProfile.kind !== "dsh" && isProfileConfigured(preferredProfile, env, false).configured
      ? preferredProfile
      : undefined) ??
    Object.values(config.profiles).find((p) => p.kind !== "dsh" && isProfileConfigured(p, env, false).configured);

  if (!profile || profile.kind === "dsh" || !isProfileConfigured(profile, env, false).configured) {
    return { error: "尚未配置可用的直连轻模型（如 deepseek-flash），请先配置 providers.json。" };
  }

  const promptItems = targets.map((item) => ({
    id: item.id,
    source: item.sourceLabel,
    currentPocket: item.pocket,
    text: item.text.slice(0, 260),
    threadId: item.threadId ?? null,
  }));

  const system = [
    "你是个人随想收件箱的轻量整理助手。严禁使用任何 emoji，严禁编造未提供的事实。",
    "三个口袋定义：",
    "- sweep（今日小尾巴）：<=15分钟短闭环杂事、临时中断、当天需回消息/开权限/审批。",
    "- commit（别忘 / 已答应）：外部协作承诺、明确跨日截止时间（明天/下周等），绝对不可丢失。",
    "- spark（随手想法）：灵感、探索性思考、项目补充笔记。",
    "注意：行首标记如 [注] 只是召回信号，内容语义（如明天截止/和某人说过）优先级高于 [注]。",
    "只返回严格 JSON，格式：",
    '{"items":[{"id":"...","suggestedPocket":"sweep|commit|spark","summary":"<=20字极简概括","splitCandidates":["仅当原句包含2个及以上明显不同意图时拆分，否则省略"],"threadTitle":"若属连续思考簇给<=10字簇标题","reason":"<=24字简短理由"}]}',
  ].join("\n");

  try {
    const turn = await callProviderTurn(
      profile,
      env,
      {
        system,
        messages: [{ role: "user", content: JSON.stringify({ items: promptItems }) }],
        maxTokens: 1200,
        signal: AbortSignal.timeout(25_000),
      },
      options.fetchImpl ?? fetch,
    );

    const parsed = extractJsonObject(turn.text);
    const rawList = Array.isArray(parsed?.items) ? parsed.items : [];
    const validIds = new Set(targets.map((t) => t.id));
    const hints: Record<string, StageInboxAiHint> = {};

    for (const raw of rawList) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const rec = raw as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : "";
      if (!id || !validIds.has(id)) continue;
      const suggestedPocket =
        rec.suggestedPocket === "sweep" || rec.suggestedPocket === "commit" || rec.suggestedPocket === "spark"
          ? rec.suggestedPocket
          : undefined;
      const summary = typeof rec.summary === "string" && rec.summary.trim() ? rec.summary.trim().slice(0, 48) : undefined;
      const reason = typeof rec.reason === "string" && rec.reason.trim() ? rec.reason.trim().slice(0, 80) : undefined;
      const threadTitle =
        typeof rec.threadTitle === "string" && rec.threadTitle.trim() ? rec.threadTitle.trim().slice(0, 24) : undefined;
      const splitCandidates = Array.isArray(rec.splitCandidates)
        ? rec.splitCandidates
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 120))
            .slice(0, 4)
        : undefined;

      hints[id] = {
        ...(suggestedPocket ? { suggestedPocket } : {}),
        ...(summary ? { summary } : {}),
        ...(reason ? { reason } : {}),
        ...(threadTitle ? { threadTitle } : {}),
        ...(splitCandidates && splitCandidates.length >= 2 ? { splitCandidates } : {}),
        model: profile.model ?? "fast-model",
        updatedAt: now,
      };
    }

    return {
      hints,
      model: profile.model ?? "fast-model",
      count: Object.keys(hints).length,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message.slice(0, 200) : "调用轻模型整理失败，已保持本地规则结果。",
    };
  }
}
