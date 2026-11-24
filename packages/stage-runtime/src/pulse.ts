import { workKey, type CatalogSnapshot } from "@task-copilot/contracts";
import { classifyInboxItem, enrichInboxThreads } from "./inbox-classifier.ts";
import type {
  ColdStartAreaDraft,
  StageArea,
  StageAreaDomain,
  StageCatalogEntry,
  StageFocusRole,
  StageInboxPocket,
  StageInboxRawItem,
  StageInboxViewItem,
  StagePoint,
  StageTone,
} from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
export const COOLED_INBOX_DAYS = 14;
export const MAIN_MISMATCH_DAYS = 7;

export function focusRoleLabel(role: StageFocusRole): string {
  switch (role) {
    case "main":
      return "本季主线";
    case "side":
      return "支线";
    case "maintenance":
      return "维护";
    case "parked":
      return "搁置";
  }
}

export function areaDomainLabel(domain: StageAreaDomain): string {
  return domain === "life" ? "生活" : "工作";
}
const STOP_WORDS = new Set([
  "的", "了", "和", "与", "在", "是", "把", "将", "给", "到", "从", "对", "为", "中", "里", "上", "下",
  "一个", "一些", "这个", "那个", "可以", "需要", "已经", "目前", "最近", "今天", "昨天", "明天", "顺便",
  "整理", "推进", "相关", "完成", "准备", "计划", "任务", "项目", "内容", "页面", "模板", "系统", "能力",
  "工作", "学习", "梳理", "方法", "一下", "进行", "部分", "当前", "结构", "关键", "结果", "具体", "事务",
  "the", "and", "for", "with", "this", "that", "from", "into", "todo", "done", "project", "task", "miniproject",
  "logseq", "file", "master", "sync", "daily", "note", "active", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
]);

export function flattenCatalog(snapshots: readonly CatalogSnapshot[]): StageCatalogEntry[] {
  const seen = new Map<string, StageCatalogEntry>();
  for (const snap of snapshots) {
    for (const work of snap.works) {
      const key = workKey(work.workRef);
      const existing = seen.get(key);
      if (!existing || work.updatedAt >= existing.updatedAt) {
        seen.set(key, {
          ...work,
          workKey: key,
          graphId: snap.graphId,
          graphName: snap.graphName,
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}

export function recencyDays(updatedAt: number, now: number): number {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 999;
  const diff = Math.max(0, now - updatedAt);
  return Math.floor(diff / DAY_MS);
}

export function formatRecencyLabel(days: number, recentCount = 0): string {
  if (recentCount > 1 && days <= 7) return `近 7 天 ${recentCount} 项推进`;
  if (days === 0) return "今天有推进";
  if (days === 1) return "昨天有推进";
  if (days <= 7) return `${days} 天前有推进`;
  if (days >= 999) return "尚无更新记录";
  return `${days} 天未动`;
}

export function computeTone(input: {
  recencyDays: number;
  inboxMatchCount: number;
  parked?: boolean;
  focusRole?: StageFocusRole;
  hasActiveAdvancement?: boolean;
  mainMismatch?: boolean;
  inboxHighlightActive?: boolean;
}): { tone: StageTone; signalLabel: string } {
  if (input.parked || input.focusRole === "parked") {
    return { tone: "mist", signalLabel: "主动搁置" };
  }
  // Highest priority: real main-line mismatch (declared main idle >= 7d while other areas stay active)
  if (input.focusRole === "main" && input.mainMismatch) {
    return {
      tone: "mismatch",
      signalLabel: input.recencyDays >= 999 ? "主线错配 · 尚无推进" : `主线错配 · ${input.recencyDays} 天未动`,
    };
  }
  // Warm amber only highlights when actively triaging / selecting an Inbox item (never steals default focus)
  if (input.inboxHighlightActive && input.inboxMatchCount > 0) {
    return {
      tone: "amber",
      signalLabel: input.inboxMatchCount === 1 ? "Inbox 共振" : `Inbox ${input.inboxMatchCount} 条共振`,
    };
  }
  // Maintenance areas stay quiet and never emit cold/anxiety warnings
  if (input.focusRole === "maintenance") {
    return {
      tone: "none",
      signalLabel: input.recencyDays <= 7 || input.hasActiveAdvancement ? "维护正常" : "维护模式",
    };
  }
  if (input.focusRole === "main") {
    if (input.recencyDays <= 3 || input.hasActiveAdvancement) {
      return { tone: "teal", signalLabel: "主线推进中" };
    }
    if (input.recencyDays >= MAIN_MISMATCH_DAYS && input.recencyDays < 999) {
      return { tone: "mist", signalLabel: `主线 ${input.recencyDays} 天未动` };
    }
    return { tone: "none", signalLabel: "" };
  }
  if (input.recencyDays <= 3 || input.hasActiveAdvancement) {
    return {
      tone: "teal",
      signalLabel: input.recencyDays <= 1 ? "近期活跃" : "可顺手推进",
    };
  }
  if (input.recencyDays >= 10 && input.recencyDays < 999) {
    return { tone: "mist", signalLabel: `静默 ${input.recencyDays} 天` };
  }
  return { tone: "none", signalLabel: "" };
}

/** Fast 0ms local tokenizer: extracts Latin/digit terms + CJK 2-grams without external libs or cloud calls. */
export function extractSemanticTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const normalized = text.toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ");
  const asciiMatches = normalized.match(/[a-z0-9]{2,}/g) ?? [];
  for (const term of asciiMatches) {
    if (!STOP_WORDS.has(term)) tokens.add(term);
  }
  const cjkRuns = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length === 1) continue;
    if (run.length <= 4 && !STOP_WORDS.has(run)) tokens.add(run);
    for (let i = 0; i < run.length - 1; i++) {
      const bi = run.slice(i, i + 2);
      if (!STOP_WORDS.has(bi)) tokens.add(bi);
    }
  }
  return tokens;
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let score = 0;
  for (const token of a) {
    if (b.has(token)) {
      score += token.length >= 3 ? 2.5 : 1.5;
    }
  }
  return score;
}

function cleanSemanticLocation(entry: StageCatalogEntry): string {
  const parts = entry.location
    .split(/[/／›|]|\s+>\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== entry.graphName.trim() && !isJournalLikeSegment(s) && !/^##\s*/.test(s));
  return parts.slice(0, 2).join(" ");
}

export function matchInboxLocally(
  inboxItems: readonly StageInboxRawItem[],
  areas: readonly StageArea[],
  catalogByKey: ReadonlyMap<string, StageCatalogEntry>,
  now = Date.now(),
  trackOverrides?: Readonly<Record<string, StageInboxPocket>>,
): StageInboxViewItem[] {
  const areaTokenMap = new Map<string, Set<string>>();
  const projTokenMap = new Map<string, { areaId: string; tokens: Set<string> }>();

  for (const area of areas) {
    const bag = extractSemanticTokens(area.name);
    for (const key of area.workKeys) {
      const entry = catalogByKey.get(key);
      if (!entry) continue;
      const pTokens = extractSemanticTokens(`${entry.title} ${cleanSemanticLocation(entry)}`);
      projTokenMap.set(key, { areaId: area.id, tokens: pTokens });
      for (const tok of pTokens) bag.add(tok);
    }
    areaTokenMap.set(area.id, bag);
  }

  const mapped: StageInboxViewItem[] = inboxItems
    .filter((item) => item.status !== "archived" && item.status !== "deleted")
    .map((item) => {
      const itemTokens = extractSemanticTokens(item.text);
      const areaScores: Array<{ id: string; score: number }> = [];
      for (const area of areas) {
        if (area.parked || area.focusRole === "parked") continue;
        const base = overlapScore(itemTokens, areaTokenMap.get(area.id) ?? new Set());
        const nameBoost = overlapScore(itemTokens, extractSemanticTokens(area.name)) * 1.4;
        const total = base + nameBoost;
        if (total >= 2.0) areaScores.push({ id: area.id, score: total });
      }
      areaScores.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));

      const projScores: Array<{ key: string; score: number }> = [];
      for (const [pKey, meta] of projTokenMap) {
        const s = overlapScore(itemTokens, meta.tokens);
        if (s >= 2.0) projScores.push({ key: pKey, score: s });
      }
      projScores.sort((x, y) => y.score - x.score || x.key.localeCompare(y.key));

      const matchAreaIds = areaScores.slice(0, 2).map((x) => x.id);
      const matchProjectWorkKeys = projScores.slice(0, 2).map((x) => x.key);

      // Ensure matched project's parent area is also surfaced in L0 resonance
      for (const pKey of matchProjectWorkKeys) {
        const parentArea = projTokenMap.get(pKey)?.areaId;
        if (parentArea && !matchAreaIds.includes(parentArea) && matchAreaIds.length < 2) {
          matchAreaIds.push(parentArea);
        }
      }

      const ageDays = recencyDays(item.updatedAt || item.createdAt, now);
      const cls = classifyInboxItem(item, trackOverrides?.[item.id]);
      const cooled = !cls.immuneToCooling && ageDays >= COOLED_INBOX_DAYS;
      return {
        id: item.id,
        text: item.text,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sourceType: item.sourceType ?? "manual",
        sourceLabel: item.sourceLabel ?? "Inbox",
        ageDays,
        cooled,
        matchAreaIds,
        matchProjectWorkKeys,
        pocket: cls.pocket,
        pocketLabel: cls.pocketLabel,
        routingReason: cls.routingReason,
        ...(cls.prefixDetected ? { prefixDetected: cls.prefixDetected } : {}),
        ...(cls.failSafe ? { failSafe: true } : {}),
        immuneToCooling: cls.immuneToCooling,
        ...(cls.isFeed ? { isFeed: true } : {}),
        ...(item.carryoverDays ? { carryoverDays: item.carryoverDays } : {}),
        ...(item.pendingJournalFlush ? { pendingJournalFlush: true } : {}),
        ...(item.blockUuid ? { blockUuid: item.blockUuid } : {}),
        ...(item.journalDate ? { journalDate: item.journalDate } : {}),
        ...(item.originRef ? { originRef: item.originRef } : {}),
        ...(item.aiHint ? { aiHint: item.aiHint } : {}),
      };
    });

  return enrichInboxThreads(mapped, COOLED_INBOX_DAYS);
}

export function defaultAreaPosition(index: number): StagePoint {
  const cols = 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: 20 + col * 310,
    y: 20 + row * 296,
  };
}

export function defaultAreaPositionForRole(index: number, focusRole?: StageFocusRole, hasMainArea = false): StagePoint {
  if (focusRole === "main") {
    return { x: 174, y: 20 };
  }
  if (!hasMainArea) {
    return defaultAreaPosition(index);
  }
  const cols = 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: 20 + col * 310,
    y: 340 + row * 296,
  };
}

function isTemplatePlaceholderTitle(title: string): boolean {
  const clean = title.trim();
  return /^<[^>]{1,40}>$/.test(clean) || /^(?:project|miniproject|task|项目|小项目|任务|事务|事项)$/iu.test(clean);
}

function isJournalLikeSegment(seg: string): boolean {
  return (
    /^\d{4}[-_]\d{2}/.test(seg) ||
    /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4}$/i.test(seg)
  );
}

function deriveBucketName(entry: StageCatalogEntry): string | null {
  if (isTemplatePlaceholderTitle(entry.title)) return null;
  // 1. Prefer explicit namespace/folder prefix in location (stripping leading graphName if present)
  const loc = entry.location.trim();
  if (loc) {
    let slashParts = loc.split(/[/／>›|]/).map((s) => s.trim()).filter(Boolean);
    if (slashParts.length >= 2 && entry.graphName && slashParts[0] === entry.graphName.trim()) {
      slashParts = slashParts.slice(1);
    }
    const candidate = slashParts[0];
    if (
      slashParts.length >= 2 &&
      candidate &&
      candidate.length <= 24 &&
      !isJournalLikeSegment(candidate)
    ) {
      return candidate;
    }
  }
  // 2. If entry itself is a Project or Area object, it anchors its own skeleton
  const kind = entry.objectType.toLowerCase();
  if (kind === "area" || kind === "project") {
    const clean = entry.title.replace(/^\[[^\]]+\]\s*/, "").trim();
    if (clean.length >= 2) return clean.slice(0, 18);
  }
  return null;
}

const BUCKET_GENERIC_TOKENS = new Set([
  "平台", "开发", "体系", "建设", "升级", "治理", "管理", "系统", "服务", "中心", "方案", "专题", "手册", "笔记",
  "工作", "学习", "任务", "项目", "事务", "事项", "旅游", "旅行", "计划", "调研", "接入", "优化", "推进",
  "尝试", "建立", "日常", "撰写", "讲解", "安装", "准备", "收集", "更新", "基础", "技能", "信息", "问题",
]);

const LIFE_AREA_PATTERN =
  /(?:健康|身体|心理|亲密|家庭|关系|情感|生活|运动|健身|睡眠|正念|财务|理财|兴趣|乐器|乐理|旅行|旅游|饮食)/u;

export function normalizeAreaDisplayName(raw: string): string {
  return raw
    .trim()
    .replace(/^#/u, "")
    .replace(/^\[\[|\]\]$/gu, "")
    .replace(/^(?:Area|area|领域)[/／]/u, "")
    .trim();
}

export function normalizeAreaKey(raw: string): string {
  return normalizeAreaDisplayName(raw).toLocaleLowerCase();
}

function inferAreaDomain(areaName: string): StageAreaDomain {
  return LIFE_AREA_PATTERN.test(areaName) ? "life" : "work";
}

export function entryPageSegment(entry: StageCatalogEntry): string | null {
  const loc = entry.location.trim();
  if (!loc) return null;
  let parts = loc.split(/[/／›|]|\s+>\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && entry.graphName && parts[0] === entry.graphName.trim()) {
    parts = parts.slice(1);
  }
  return parts[0] ?? null;
}

const BOILERPLATE_SEGMENT_PATTERNS: readonly RegExp[] = [
  /^旧项目内容/u,
  /^原.+项目页面/u,
  /^资源列表$/u,
  /^具体事务$/u,
  /^具体目标$/u,
  /^推进结构$/u,
  /^关键结果$/u,
  /^当前推进$/u,
  /^项目进度规划$/u,
  /^相关模板$/u,
  /^未分类$/u,
  /^年度重要工作对象整理$/u,
  /^方面$/u,
  /^daily\s*note$/iu,
  /^(?:上午|下午|晚上|早晨|中午)$/u,
  /^(?:整理一下|待继续整理)/u,
];

function cleanLocationSegment(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^#+\s*/u, "");
  s = s.replace(/^(?:TODO|DONE|DOING|NOW|LATER|WAITING|CANCELED|CANCELLED)\s+/u, "");
  s = s.replace(/^\[#[ABC]\]\s*/iu, "");
  // Strip Logseq inline color highlights like [[$blue]]==text== -> text
  s = s.replace(/\[\[\$[a-z]+\]\]==([^=]+)==/giu, "$1");
  // Strip bold semantic prefixes like **[阶段]** / **[子阶段]** / **[KR]** [active]
  s = s.replace(/\*\*\[[^\]]+\]\*\*\s*[:：]?\s*/gu, "");
  s = s.replace(/^\[(?:active|pending|done|KR|阶段|子阶段|事件|方向|方面|旧项目内容|资源列表|具体事务|推进结构|关键结果|当前推进|项目|任务|事务|MiniProject|Project)\]\s*/giu, "");
  // Strip <placeholder hints>
  s = s.replace(/<[^>]{1,60}>/gu, "");
  // Unwrap [[wikilinks]] and strip inline #tags
  s = s.replace(/\[\[([^\]]+)\]\]/gu, "$1");
  s = s.replace(/#[\p{L}\p{N}_/-]+/gu, "");
  s = s.replace(/\*\*/gu, "");
  s = s.replace(/\s*\([^)]*重组前内容[^)]*\)/gu, "");
  s = s.replace(/\s*（[^）]*重组前内容[^）]*）/gu, "");
  s = s.replace(/^[:：\-—·\s]+|[:：\-—·\s]+$/gu, "");
  s = s.replace(/\s+/gu, " ").trim();
  return s;
}

export function formatLifecycleLabel(state?: string): string | null {
  if (!state) return null;
  const norm = state.trim().toLocaleLowerCase();
  if (norm === "active") return "进行中";
  if (norm === "paused") return "暂停中";
  if (norm === "archived") return "已归档";
  return null;
}

/**
 * Produces a clean, human-readable 1-line subtitle for L1/L2 Stage cards,
 * replacing noisy raw Logseq ancestor chains and markdown templates.
 */
export function formatWorkSubtitle(
  entry: Pick<StageCatalogEntry, "workRef" | "title" | "objectType" | "location" | "graphName" | "directory" | "lifecycleState">,
  options?: { childCount?: number; omitPageTitle?: string },
): string {
  const isPage = entry.workRef.kind === "logseq" && entry.workRef.sourceKind === "page";
  const childCount = options?.childCount ?? 0;

  if (isPage) {
    const parts: string[] = [];
    const stateLabel = formatLifecycleLabel(entry.lifecycleState);
    if (stateLabel) parts.push(stateLabel);
    if (childCount > 0) parts.push(`含 ${childCount} 项子事务`);
    if (entry.directory) parts.push("已绑定目录");
    if (parts.length === 0) {
      parts.push(entry.objectType.toLowerCase() === "area" ? "领域页" : "项目页");
    }
    return parts.join(" · ");
  }

  const rawSegments = entry.location
    .split(/[/／›|]|\s+>\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const withoutGraph =
    rawSegments.length > 0 && entry.graphName && rawSegments[0] === entry.graphName.trim()
      ? rawSegments.slice(1)
      : rawSegments;

  let journalDate: string | null = null;
  const meaningful: string[] = [];
  const normTitle = entry.title.trim().toLocaleLowerCase();
  const normOmit = options?.omitPageTitle?.trim().toLocaleLowerCase() ?? "";

  for (const seg of withoutGraph) {
    if (isJournalLikeSegment(seg)) {
      if (!journalDate) journalDate = seg;
      continue;
    }
    const cleaned = cleanLocationSegment(seg);
    if (!cleaned || cleaned.length <= 1) continue;
    if (BOILERPLATE_SEGMENT_PATTERNS.some((re) => re.test(cleaned))) continue;
    const lower = cleaned.toLocaleLowerCase();
    if (lower === normTitle || (normOmit && lower === normOmit)) continue;
    if (!meaningful.includes(cleaned)) meaningful.push(cleaned);
  }

  const parts: string[] = [];
  if (meaningful.length > 0) {
    const compact =
      meaningful.length <= 2
        ? meaningful
        : [meaningful[0]!, meaningful[meaningful.length - 1]!];
    parts.push(compact.map((s) => (s.length > 26 ? `${s.slice(0, 25)}…` : s)).join(" › "));
  } else if (journalDate) {
    parts.push(`日记 · ${journalDate}`);
  }
  if (entry.directory) parts.push("已绑定目录");
  if (parts.length === 0) {
    parts.push(entry.objectType || "工作项");
  }
  return parts.join(" · ");
}

function extractDistinctiveBucketTokens(bucketName: string): Set<string> {
  // Strip common prefix like "项目-" / "任务-" / "学习-" before tokenizing
  const stripped = bucketName.replace(/^(?:项目|任务|学习|英语|旅游|专题|日常|创造|阶段|Area\/|领域\/)[-－—_:\s]*/u, "").trim() || bucketName;
  const raw = extractSemanticTokens(stripped);
  const filtered = new Set<string>();
  for (const tok of raw) {
    if (!BUCKET_GENERIC_TOKENS.has(tok)) filtered.add(tok);
  }
  return filtered;
}

function buildExplicitAreaColdStart(
  entries: readonly StageCatalogEntry[],
  cap: number,
): {
  areas: ColdStartAreaDraft[];
  dormantAreas: ColdStartAreaDraft[];
  unassignedWorkKeys: string[];
  unassignedTitles: string[];
} {
  interface ExplicitAreaBucket {
    key: string;
    name: string;
    domain: StageAreaDomain;
    areaEntry: StageCatalogEntry | null;
    members: StageCatalogEntry[];
  }

  const areaBuckets = new Map<string, ExplicitAreaBucket>();
  const ensureBucket = (rawName: string, areaEntry?: StageCatalogEntry): ExplicitAreaBucket | null => {
    const display = normalizeAreaDisplayName(rawName);
    if (!display || /^(?:na|none|null|-)$/iu.test(display)) return null;
    const key = display.toLocaleLowerCase();
    let bucket = areaBuckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        name: display.slice(0, 24),
        domain: inferAreaDomain(display),
        areaEntry: areaEntry ?? null,
        members: [],
      };
      areaBuckets.set(key, bucket);
    } else if (areaEntry && !bucket.areaEntry) {
      bucket.areaEntry = areaEntry;
    }
    return bucket;
  };

  // 1. Collect explicit Area pages & Project page index
  const projectPageByLowerTitle = new Map<string, StageCatalogEntry>();
  const nonAreaEntries: StageCatalogEntry[] = [];
  for (const entry of entries) {
    const kind = entry.objectType.toLowerCase();
    if (kind === "area") {
      ensureBucket(entry.title, entry);
      continue;
    }
    if (entry.workRef.kind === "logseq" && entry.workRef.sourceKind === "page" && kind === "project") {
      projectPageByLowerTitle.set(entry.title.trim().toLocaleLowerCase(), entry);
    }
    nonAreaEntries.push(entry);
  }

  // 2. Propagate child-block recency to owning Project page & skip child-block flooding when parent Project page exists
  const effectiveUpdatedAt = new Map<string, number>();
  const candidates: StageCatalogEntry[] = [];
  const templateNoise: StageCatalogEntry[] = [];
  for (const entry of nonAreaEntries) {
    if (isTemplatePlaceholderTitle(entry.title)) {
      templateNoise.push(entry);
      continue;
    }
    if (entry.workRef.kind === "logseq" && entry.workRef.sourceKind === "block") {
      const seg = entryPageSegment(entry);
      const owningProject = seg ? projectPageByLowerTitle.get(seg.toLocaleLowerCase()) : undefined;
      if (owningProject) {
        const prevTs = effectiveUpdatedAt.get(owningProject.workKey) ?? owningProject.updatedAt;
        if (entry.updatedAt > prevTs) effectiveUpdatedAt.set(owningProject.workKey, entry.updatedAt);
        continue;
      }
    }
    candidates.push(entry);
  }

  // 3. Pass 1: attach entries with explicit parentAreas (primary ownership = first declared Area)
  const remaining: StageCatalogEntry[] = [];
  for (const entry of candidates) {
    const declared = (entry.parentAreas ?? []).map((a) => normalizeAreaKey(a)).filter(Boolean);
    if (declared.length > 0) {
      const primaryRaw = entry.parentAreas![0]!;
      const target =
        declared.map((k) => areaBuckets.get(k)).find((b): b is ExplicitAreaBucket => Boolean(b)) ??
        ensureBucket(primaryRaw);
      if (target) {
        target.members.push(entry);
        continue;
      }
    }
    remaining.push(entry);
  }

  // 4. Pass 2: attach remaining standalone works ONLY if their title directly matches a bucket's distinctive name
  //    or one of its ACTIVE member Project page's distinctive names
  const bucketTokens = new Map<string, { areaBag: Set<string>; projectBag: Set<string> }>();
  for (const [key, bucket] of areaBuckets) {
    const areaBag = extractDistinctiveBucketTokens(bucket.name);
    const projectBag = new Set<string>();
    for (const member of bucket.members) {
      if (
        member.workRef.kind === "logseq" &&
        member.workRef.sourceKind === "page" &&
        member.lifecycleState !== "paused"
      ) {
        for (const tok of extractDistinctiveBucketTokens(member.title)) projectBag.add(tok);
      }
    }
    if (areaBag.size > 0 || projectBag.size > 0) bucketTokens.set(key, { areaBag, projectBag });
  }

  const unassigned: StageCatalogEntry[] = [];
  for (const entry of remaining) {
    const tokens = extractSemanticTokens(entry.title);
    let bestKey: string | null = null;
    let bestScore = 0;
    for (const [key, bags] of bucketTokens) {
      const score = overlapScore(tokens, bags.areaBag) * 1.5 + overlapScore(tokens, bags.projectBag);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    if (bestKey && bestScore >= 1.5) {
      areaBuckets.get(bestKey)!.members.push(entry);
    } else {
      unassigned.push(entry);
    }
  }
  unassigned.push(...templateNoise);

  // 5. Rank Areas: active projects first, then active Areas with projects (life maintenance gently included), then empty active Areas
  const scoreBucket = (b: ExplicitAreaBucket) => {
    const activeProjects = b.members.filter((m) => m.lifecycleState === "active").length;
    const totalProjects = b.members.length;
    const areaActive = b.areaEntry?.lifecycleState === "active" ? 1 : 0;
    const lifeWithMembers = b.domain === "life" && areaActive && totalProjects > 0 ? 1 : 0;
    const latestTs = Math.max(
      b.areaEntry?.updatedAt ?? 0,
      ...b.members.map((m) => effectiveUpdatedAt.get(m.workKey) ?? m.updatedAt),
    );
    return { activeProjects, totalProjects, areaActive, lifeWithMembers, latestTs };
  };

  const ranked = [...areaBuckets.values()].sort((a, b) => {
    const sa = scoreBucket(a);
    const sb = scoreBucket(b);
    if ((sa.activeProjects > 0) !== (sb.activeProjects > 0)) return sa.activeProjects > 0 ? -1 : 1;
    if (sa.activeProjects !== sb.activeProjects) return sb.activeProjects - sa.activeProjects;
    if (sa.lifeWithMembers !== sb.lifeWithMembers) return sb.lifeWithMembers - sa.lifeWithMembers;
    if ((sa.totalProjects > 0) !== (sb.totalProjects > 0)) return sa.totalProjects > 0 ? -1 : 1;
    if (sa.areaActive !== sb.areaActive) return sb.areaActive - sa.areaActive;
    if (sa.totalProjects !== sb.totalProjects) return sb.totalProjects - sa.totalProjects;
    if (sa.latestTs !== sb.latestTs) return sb.latestTs - sa.latestTs;
    return a.name.localeCompare(b.name);
  });

  const toDraft = (b: ExplicitAreaBucket, index: number, parked: boolean): ColdStartAreaDraft => {
    const sorted = [...b.members].sort((x, y) => {
      const xa = x.lifecycleState === "active" ? 1 : 0;
      const ya = y.lifecycleState === "active" ? 1 : 0;
      if (xa !== ya) return ya - xa;
      const xt = effectiveUpdatedAt.get(x.workKey) ?? x.updatedAt;
      const yt = effectiveUpdatedAt.get(y.workKey) ?? y.updatedAt;
      return yt - xt || x.title.localeCompare(y.title);
    });
    const keys = sorted.length > 0 ? sorted.map((m) => m.workKey) : b.areaEntry ? [b.areaEntry.workKey] : [];
    const anchors =
      sorted.length > 0
        ? sorted.slice(0, 3).map((m) => m.title)
        : b.areaEntry
          ? [b.areaEntry.title]
          : [];
    const focusRole: StageFocusRole = parked ? "parked" : b.domain === "life" ? "maintenance" : "side";
    return {
      id: `area-draft-${index + 1}`,
      name: b.name,
      workKeys: keys,
      anchorTitles: anchors,
      pos: defaultAreaPosition(index),
      focusRole,
      domain: b.domain,
    };
  };

  const kept = ranked.slice(0, cap).map((b, i) => toDraft(b, i, false));
  const dormant = ranked.slice(cap).map((b, i) => toDraft(b, cap + i, true));

  return {
    areas: kept,
    dormantAreas: dormant,
    unassignedWorkKeys: unassigned.map((e) => e.workKey),
    unassignedTitles: unassigned.slice(0, 8).map((e) => e.title),
  };
}

/**
 * Cold-start anti-clutter constellation builder (D-53):
 * - When catalog contains explicit Logseq Areas (objectType="Area") or parentAreas links, builds Area-first L0!
 * - Hard cap: 4–7 top-level active Areas (extra declared Areas preserved in dormantAreas for 1-click wake)
 * - Unrelated one-off works stay in unassignedWorkKeys (never force-fitted)
 */
export function buildColdStartAreaDrafts(
  entries: readonly StageCatalogEntry[],
  maxAreas = 7,
): {
  areas: ColdStartAreaDraft[];
  dormantAreas: ColdStartAreaDraft[];
  unassignedWorkKeys: string[];
  unassignedTitles: string[];
} {
  const cap = Math.max(1, Math.min(7, maxAreas));
  const hasExplicitAreas = entries.some(
    (e) => e.objectType.toLowerCase() === "area" || Boolean(e.parentAreas && e.parentAreas.length > 0),
  );
  if (hasExplicitAreas) {
    return buildExplicitAreaColdStart(entries, cap);
  }
  const buckets = new Map<string, StageCatalogEntry[]>();
  const remaining: StageCatalogEntry[] = [];
  const templateNoise: StageCatalogEntry[] = [];

  // Pass 1: explicit skeleton buckets (namespace / Project / Area)
  for (const entry of entries) {
    if (isTemplatePlaceholderTitle(entry.title)) {
      templateNoise.push(entry);
      continue;
    }
    const bucket = deriveBucketName(entry);
    if (bucket) {
      const list = buckets.get(bucket) ?? [];
      list.push(entry);
      buckets.set(bucket, list);
    } else {
      remaining.push(entry);
    }
  }

  // Pass 2: attach remaining entries ONLY when their title directly names a bucket's distinctive theme
  // (never via shared graphName, journal dates, or generic words like "整理"/"平台"/"调研")
  const unassigned: StageCatalogEntry[] = [];
  const bucketTokens = new Map<string, Set<string>>();
  for (const name of buckets.keys()) {
    const distinctive = extractDistinctiveBucketTokens(name);
    if (distinctive.size > 0) {
      bucketTokens.set(name, distinctive);
    }
  }

  for (const entry of remaining) {
    const tokens = extractSemanticTokens(entry.title);
    let bestName: string | null = null;
    let bestScore = 0;
    for (const [name, bag] of bucketTokens) {
      const score = overlapScore(tokens, bag);
      if (score > bestScore) {
        bestScore = score;
        bestName = name;
      }
    }
    if (bestName && bestScore >= 1.5) {
      buckets.get(bestName)!.push(entry);
    } else {
      unassigned.push(entry);
    }
  }

  // Pass 3: if fewer than 4 buckets, cluster remaining by shared frequent 2-char/keyword themes (at least 2 items)
  if (buckets.size < 4 && unassigned.length >= 2) {
    const tokenMembers = new Map<string, StageCatalogEntry[]>();
    for (const entry of unassigned) {
      for (const tok of extractSemanticTokens(entry.title)) {
        const arr = tokenMembers.get(tok) ?? [];
        arr.push(entry);
        tokenMembers.set(tok, arr);
      }
    }
    const candidates = [...tokenMembers.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .sort((a, b) => b[1].length - a[1].length || b[0].length - a[0].length);
    const claimed = new Set<string>();
    for (const [tok, arr] of candidates) {
      if (buckets.size >= Math.min(cap, 6)) break;
      const fresh = arr.filter((e) => !claimed.has(e.workKey));
      if (fresh.length < 2) continue;
      buckets.set(`${tok}相关`, fresh);
      for (const e of fresh) claimed.add(e.workKey);
    }
    const stillUnassigned = unassigned.filter((e) => !claimed.has(e.workKey));
    unassigned.length = 0;
    unassigned.push(...stillUnassigned);
  }

  // Enforce hard cap (<= 7): rank by member count + recency; overflow goes to unassigned pool (no messy clutter)
  const ranked = [...buckets.entries()].sort((a, b) => {
    const recA = Math.max(...a[1].map((e) => e.updatedAt));
    const recB = Math.max(...b[1].map((e) => e.updatedAt));
    return b[1].length - a[1].length || recB - recA || a[0].localeCompare(b[0]);
  });

  const kept = ranked.slice(0, cap);
  for (const [, overflowEntries] of ranked.slice(cap)) {
    unassigned.push(...overflowEntries);
  }
  unassigned.push(...templateNoise);

  const areas: ColdStartAreaDraft[] = kept.map(([name, list], index) => {
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      id: `area-draft-${index + 1}`,
      name,
      workKeys: sorted.map((e) => e.workKey),
      anchorTitles: sorted.slice(0, 3).map((e) => e.title),
      pos: defaultAreaPosition(index),
    };
  });

  return {
    areas,
    dormantAreas: [],
    unassignedWorkKeys: unassigned.map((e) => e.workKey),
    unassignedTitles: unassigned.slice(0, 8).map((e) => e.title),
  };
}
