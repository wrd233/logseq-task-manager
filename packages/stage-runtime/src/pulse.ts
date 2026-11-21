import { workKey, type CatalogSnapshot } from "@task-copilot/contracts";
import type {
  ColdStartAreaDraft,
  StageArea,
  StageAreaDomain,
  StageCatalogEntry,
  StageFocusRole,
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
  "the", "and", "for", "with", "this", "that", "from", "into", "todo", "done", "project", "task", "miniproject",
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

export function matchInboxLocally(
  inboxItems: readonly StageInboxRawItem[],
  areas: readonly StageArea[],
  catalogByKey: ReadonlyMap<string, StageCatalogEntry>,
  now = Date.now(),
): StageInboxViewItem[] {
  const areaTokenMap = new Map<string, Set<string>>();
  const projTokenMap = new Map<string, { areaId: string; tokens: Set<string> }>();

  for (const area of areas) {
    const bag = extractSemanticTokens(area.name);
    for (const key of area.workKeys) {
      const entry = catalogByKey.get(key);
      if (!entry) continue;
      const pTokens = extractSemanticTokens(`${entry.title} ${entry.location}`);
      projTokenMap.set(key, { areaId: area.id, tokens: pTokens });
      for (const tok of pTokens) bag.add(tok);
    }
    areaTokenMap.set(area.id, bag);
  }

  return inboxItems
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
      return {
        id: item.id,
        text: item.text,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sourceType: item.sourceType ?? "manual",
        sourceLabel: item.sourceLabel ?? "Inbox",
        ageDays,
        cooled: ageDays >= COOLED_INBOX_DAYS,
        matchAreaIds,
        matchProjectWorkKeys,
      };
    });
}

export function defaultAreaPosition(index: number): StagePoint {
  const cols = 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  // Staggered breathing slots for up to 7 areas without overlapping
  if (index === 4) return { x: 168, y: 404 };
  if (index === 5) return { x: 472, y: 404 };
  if (index === 6) return { x: 168, y: 596 };
  return {
    x: 20 + col * 308,
    y: 16 + row * 194,
  };
}

export function defaultAreaPositionForRole(index: number, focusRole?: StageFocusRole, hasMainArea = false): StagePoint {
  if (focusRole === "main") {
    return { x: 174, y: 16 };
  }
  if (!hasMainArea) {
    return defaultAreaPosition(index);
  }
  const cols = 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: 20 + col * 308,
    y: 224 + row * 194,
  };
}

function deriveBucketName(entry: StageCatalogEntry): string | null {
  // 1. Prefer explicit namespace/folder prefix in location (e.g. "监控平台 / 告警升级" or "ops/zabbix")
  const loc = entry.location.trim();
  if (loc) {
    const slashParts = loc.split(/[/／>›|]/).map((s) => s.trim()).filter(Boolean);
    if (slashParts.length >= 2 && slashParts[0] && slashParts[0].length <= 24 && !/^\d{4}[-_]\d{2}/.test(slashParts[0])) {
      return slashParts[0];
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

/**
 * Cold-start anti-clutter constellation builder (D-53):
 * - Hard cap: 4–7 top-level Areas (never > 7; fewer only if catalog itself has fewer distinct clusters)
 * - Skeleton-first: prioritizes Project/Area/namespaced groups and shared themes
 * - Unrelated one-off works stay in unassignedWorkKeys (never force-fitted)
 */
export function buildColdStartAreaDrafts(
  entries: readonly StageCatalogEntry[],
  maxAreas = 7,
): { areas: ColdStartAreaDraft[]; unassignedWorkKeys: string[]; unassignedTitles: string[] } {
  const cap = Math.max(1, Math.min(7, maxAreas));
  const buckets = new Map<string, StageCatalogEntry[]>();
  const remaining: StageCatalogEntry[] = [];

  // Pass 1: explicit skeleton buckets (namespace / Project / Area)
  for (const entry of entries) {
    const bucket = deriveBucketName(entry);
    if (bucket) {
      const list = buckets.get(bucket) ?? [];
      list.push(entry);
      buckets.set(bucket, list);
    } else {
      remaining.push(entry);
    }
  }

  // Pass 2: attach remaining entries to existing buckets only if strong token overlap
  const unassigned: StageCatalogEntry[] = [];
  const bucketTokens = new Map<string, Set<string>>();
  for (const [name, list] of buckets) {
    const bag = extractSemanticTokens(name);
    for (const item of list) {
      for (const tok of extractSemanticTokens(`${item.title} ${item.location}`)) bag.add(tok);
    }
    bucketTokens.set(name, bag);
  }

  for (const entry of remaining) {
    const tokens = extractSemanticTokens(`${entry.title} ${entry.location}`);
    let bestName: string | null = null;
    let bestScore = 0;
    for (const [name, bag] of bucketTokens) {
      const score = overlapScore(tokens, bag);
      if (score > bestScore) {
        bestScore = score;
        bestName = name;
      }
    }
    if (bestName && bestScore >= 2.5) {
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
    unassignedWorkKeys: unassigned.map((e) => e.workKey),
    unassignedTitles: unassigned.slice(0, 8).map((e) => e.title),
  };
}
