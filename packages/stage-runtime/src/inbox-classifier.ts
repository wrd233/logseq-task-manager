import type {
  StageInboxPocket,
  StageInboxPocketCounts,
  StageInboxRawItem,
  StageInboxViewItem,
} from "./types.ts";

export const DEFAULT_SWEEP_WINDOW_TIME = "17:15";
const BURST_WINDOW_MS = 30 * 60 * 1000;

const EXPLICIT_COMMIT_PREFIX = /^\[(?:承诺|答应|责任|别忘|约定|交付)\]$/u;
const EXPLICIT_SWEEP_PREFIX = /^\[(?:急|补|清扫|小尾巴|待办|立刻|提醒)\]$/u;
const EXPLICIT_SPARK_PREFIX = /^\[(?:想法|灵感|思考|复盘|构想|思路)\]$/u;
const GENERIC_NOTE_PREFIX = /^\[(?:注|记|记录|备忘|笔记)\]$/u;

const FUTURE_DEADLINE_RE =
  /(?:明天要?|明早|明晚|后天要?|下周[一二三四五六日天]?|本周[一二三四五六日天]前?|周[一二三四五六日天]前|月底前|截止|deadline|\bDDL\b|\d{1,2}月\d{1,2}[日号]前?)/iu;

const EXTERNAL_COMMITMENT_RE =
  /(?:答应|承诺|说好了|说过了|跟[^\s，。；,.;]{1,8}说过|和[^\s，。；,.;]{1,8}说过|约好了|拜托|交代|确认边界|定下来|交付给|汇报给|答复|兜底|负责把|一起把|发给[^\s，。；,.;]{1,8}(?:确认|评审|看看))/u;

const SHORT_LOOP_SWEEP_RE =
  /(?:开一下?权限|开个权限|开通权限|给[^\s，。；,.;]{1,10}开(?:一下)?权限|回一下|回复一下|回个消息|回消息|回群|回微信|忘了回|忘记回|报销|审批|发一下|转一下|填一下|提个单|发个链接|看一眼|顺手|下班前|刚才忘了|今天要|今晚要|别忘了)/u;

const IDEA_REFLECTION_RE =
  /(?:#思考|#想法|#灵感|#注意力|#复盘|#笔记|是否可以|可行吗|也许能够|也许可以|能不能|我觉得|我需要一个|我需要多端|想到一个|如果能够|构想|方案想法|思考一下|要不要做|是不是可以)/u;

const WIKILINK_RE = /\[\[[^\]]+\]\]/u;

const THREAD_STOP_WORDS = new Set([
  "的", "了", "和", "与", "在", "是", "把", "将", "给", "到", "从", "对", "为", "中", "里", "上", "下",
  "一个", "一些", "这个", "那个", "可以", "需要", "已经", "目前", "最近", "今天", "昨天", "明天", "顺便",
  "思考", "想法", "灵感", "笔记", "复盘", "觉得", "可能", "也许", "能够", "这样", "很多", "相关", "如果",
  "是否", "一下", "进行", "部分", "当前", "问题", "时间", "地方", "方式", "通过", "用来", "一直", "运行",
  "todo", "done", "later", "now", "note", "idea", "the", "and", "for", "with", "that", "this",
]);

export interface InboxClassificationResult {
  pocket: StageInboxPocket;
  pocketLabel: string;
  routingReason: string;
  prefixDetected?: string;
  failSafe: boolean;
  immuneToCooling: boolean;
  isFeed: boolean;
}

export function pocketLabel(pocket: StageInboxPocket): string {
  switch (pocket) {
    case "sweep":
      return "今日小尾巴";
    case "commit":
      return "别忘 / 已答应";
    case "spark":
      return "随手想法";
  }
}

export function extractRecallPrefix(rawText: string): { prefix?: string; body: string } {
  const trimmed = rawText.trim().replace(/^[-*]\s+/u, "").replace(/^\[#[ABC]\]\s*/iu, "");
  const todoMatch = /^(TODO|LATER|NOW|DOING)\b\s*/u.exec(trimmed);
  if (todoMatch) {
    return {
      prefix: todoMatch[1]!.toUpperCase(),
      body: trimmed.slice(todoMatch[0].length).trim(),
    };
  }
  const boldBracket = /^\*\*\[([^\]]{1,16})\]\*\*\s*[:：]?\s*/u.exec(trimmed);
  if (boldBracket) {
    return {
      prefix: `[${boldBracket[1]!.trim()}]`,
      body: trimmed.slice(boldBracket[0].length).trim(),
    };
  }
  const plainBracket = /^\[([^\]]{1,16})\]\s*[:：]?\s*/u.exec(trimmed);
  if (plainBracket && !plainBracket[1]!.startsWith("[")) {
    return {
      prefix: `[${plainBracket[1]!.trim()}]`,
      body: trimmed.slice(plainBracket[0].length).trim(),
    };
  }
  return { body: trimmed };
}

/**
 * Empirical D-63 three-pocket classifier:
 * 1. User manual override always wins.
 * 2. Row prefixes (`TODO`, `**[注]**`, etc.) are recall signals only; content semantics
 *    (external commitments & multi-day deadlines -> `commit`; short-loop interruptions -> `sweep`)
 *    strictly override generic prefixes like `**[注]**`.
 * 3. `commit` items are hard-coded immune to 14-day cooling.
 * 4. Ambiguous unprefixed voice/agent captures fail-safe to `sweep` (surfaced once at afternoon Sweep).
 */
export function classifyInboxItem(
  item: Pick<StageInboxRawItem, "id" | "text" | "sourceType" | "links" | "pocketHint">,
  overridePocket?: StageInboxPocket,
): InboxClassificationResult {
  const { prefix, body } = extractRecallPrefix(item.text);

  if (overridePocket) {
    return {
      pocket: overridePocket,
      pocketLabel: pocketLabel(overridePocket),
      routingReason: "由你手动调整口袋",
      ...(prefix ? { prefixDetected: prefix } : {}),
      failSafe: false,
      immuneToCooling: overridePocket === "commit",
      isFeed: false,
    };
  }

  const hasFutureDeadline = FUTURE_DEADLINE_RE.test(body);
  const hasExternalCommitment = EXTERNAL_COMMITMENT_RE.test(body);
  const hasShortLoop = SHORT_LOOP_SWEEP_RE.test(body);
  const hasIdeaReflection = IDEA_REFLECTION_RE.test(body);
  const hasExplicitLinks = Boolean((item.links && item.links.length > 0) || WIKILINK_RE.test(body));
  const isGenericNotePrefix = Boolean(prefix && GENERIC_NOTE_PREFIX.test(prefix));

  // Content semantics strictly outweigh generic prefixes (`[注]`, `TODO`, etc.)
  if (hasShortLoop && !hasFutureDeadline && !hasExternalCommitment) {
    return {
      pocket: "sweep",
      pocketLabel: pocketLabel("sweep"),
      routingReason: prefix
        ? `短闭环事务 / 临时中断（内容语义优先于 ${prefix} 前缀）`
        : "短闭环事务 / 临时中断（下午清扫时刻统一收尾）",
      ...(prefix ? { prefixDetected: prefix } : {}),
      failSafe: false,
      immuneToCooling: false,
      isFeed: false,
    };
  }

  if (hasExternalCommitment || hasFutureDeadline) {
    return {
      pocket: "commit",
      pocketLabel: pocketLabel("commit"),
      routingReason: prefix
        ? `含外部协作承诺或明确截止时间（内容语义优先于 ${prefix} 前缀，免 14 天冷却）`
        : "含外部协作承诺或明确截止时间（免 14 天自然收起）",
      ...(prefix ? { prefixDetected: prefix } : {}),
      failSafe: false,
      immuneToCooling: true,
      isFeed: false,
    };
  }

  // Explicit commitment prefix
  if (prefix && EXPLICIT_COMMIT_PREFIX.test(prefix)) {
    return {
      pocket: "commit",
      pocketLabel: pocketLabel("commit"),
      routingReason: `显式承诺标记 ${prefix}（免 14 天自然收起）`,
      prefixDetected: prefix,
      failSafe: false,
      immuneToCooling: true,
      isFeed: false,
    };
  }

  // Explicit sweep/TODO prefix
  if (prefix && (EXPLICIT_SWEEP_PREFIX.test(prefix) || prefix === "TODO" || prefix === "LATER" || prefix === "NOW" || prefix === "DOING")) {
    return {
      pocket: "sweep",
      pocketLabel: pocketLabel("sweep"),
      routingReason: `行首待办标记 ${prefix}，归入今日小尾巴等待清扫闭环`,
      prefixDetected: prefix,
      failSafe: false,
      immuneToCooling: false,
      isFeed: false,
    };
  }

  // Explicit idea/reflection content or prefix
  if (hasIdeaReflection || (prefix && EXPLICIT_SPARK_PREFIX.test(prefix))) {
    return {
      pocket: "spark",
      pocketLabel: pocketLabel("spark"),
      routingReason: prefix ? `想法标记 ${prefix}，零负罪沉淀` : "探索性思考 / 想法线索，零负罪沉淀",
      ...(prefix ? { prefixDetected: prefix } : {}),
      failSafe: false,
      immuneToCooling: false,
      isFeed: hasExplicitLinks,
    };
  }

  // Explicit Agent pocketHint when content had no stronger commitment/sweep trigger
  if (item.pocketHint) {
    return {
      pocket: item.pocketHint,
      pocketLabel: pocketLabel(item.pocketHint),
      routingReason: "按对话收录语义归入对应口袋",
      ...(prefix ? { prefixDetected: prefix } : {}),
      failSafe: false,
      immuneToCooling: item.pocketHint === "commit",
      isFeed: item.pocketHint === "spark" && hasExplicitLinks,
    };
  }

  // Pure linked note (`[注]` + `[[Project]]` without deadline/commitment) stays low-noise feed in spark
  if (isGenericNotePrefix || (item.sourceType === "logseq-journal" && hasExplicitLinks)) {
    return {
      pocket: "spark",
      pocketLabel: pocketLabel("spark"),
      routingReason: hasExplicitLinks
        ? "已关联具体项目的补充笔记（低噪声共振）"
        : "通用记录标记，未检测到承诺或急事，先归入随手想法",
      ...(prefix ? { prefixDetected: prefix } : {}),
      failSafe: false,
      immuneToCooling: false,
      isFeed: hasExplicitLinks,
    };
  }

  // Fail-Safe: ambiguous unprefixed voice/agent capture goes to sweep once so nothing important silently evaporates
  const isVoiceOrAgent =
    item.sourceType === "ios-shortcut" ||
    item.sourceType === "agent-capture" ||
    item.sourceType === "dsh" ||
    !item.sourceType ||
    item.sourceType === "manual";
  if (isVoiceOrAgent) {
    return {
      pocket: "sweep",
      pocketLabel: pocketLabel("sweep"),
      routingReason: "语义未完全明朗，兜底先入今日小尾巴（清扫时可一键退回随手想法）",
      ...(prefix ? { prefixDetected: prefix } : {}),
      failSafe: true,
      immuneToCooling: false,
      isFeed: false,
    };
  }

  return {
    pocket: "spark",
    pocketLabel: pocketLabel("spark"),
    routingReason: "默认归入随手想法池",
    ...(prefix ? { prefixDetected: prefix } : {}),
    failSafe: false,
    immuneToCooling: false,
    isFeed: false,
  };
}

function extractThreadTokens(text: string): { tokens: Set<string>; tags: Set<string> } {
  const tags = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}\p{N}_/-]{2,20})/gu)) {
    const tag = m[1]!.toLocaleLowerCase();
    if (!THREAD_STOP_WORDS.has(tag)) tags.add(tag);
  }
  const tokens = new Set<string>();
  const cleaned = text
    .replace(/#[\p{L}\p{N}_/-]+/gu, " ")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ");
  for (const term of cleaned.match(/[a-z0-9]{2,}/g) ?? []) {
    if (!THREAD_STOP_WORDS.has(term)) tokens.add(term);
  }
  for (const run of cleaned.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length < 2) continue;
    if (run.length <= 4 && !THREAD_STOP_WORDS.has(run)) tokens.add(run);
    for (let i = 0; i < run.length - 1; i++) {
      const bi = run.slice(i, i + 2);
      if (!THREAD_STOP_WORDS.has(bi)) tokens.add(bi);
    }
  }
  return { tokens, tags };
}

function sharedValues(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const val of a) {
    if (b.has(val)) out.push(val);
  }
  return out;
}

/**
 * Detects emerging burst threads & recurring topic clusters among `spark` items:
 * - Same source within 30 minutes (consecutive brainstorm burst)
 * - Or >= 2 shared distinctive semantic tokens across any time window
 * Clusters with >= 2 items are tagged `sprouting: true` and reset 14-day cooling when any member is recent.
 */
export function enrichInboxThreads(items: StageInboxViewItem[], cooledDays: number): StageInboxViewItem[] {
  const sparkIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.pocket === "spark") sparkIndices.push(i);
  }
  if (sparkIndices.length < 2) return items;

  const features = new Map<number, { tokens: Set<string>; tags: Set<string> }>();
  for (const idx of sparkIndices) {
    features.set(idx, extractThreadTokens(items[idx]!.text));
  }

  // Union-Find over sparkIndices
  const parent = new Map<number, number>();
  for (const idx of sparkIndices) parent.set(idx, idx);
  const find = (x: number): number => {
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    let walk = x;
    while (parent.get(walk) !== cur) {
      const next = parent.get(walk)!;
      parent.set(walk, cur);
      walk = next;
    }
    return cur;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (let i = 0; i < sparkIndices.length; i++) {
    const idxA = sparkIndices[i]!;
    const itemA = items[idxA]!;
    const featA = features.get(idxA)!;
    for (let j = i + 1; j < sparkIndices.length; j++) {
      const idxB = sparkIndices[j]!;
      const itemB = items[idxB]!;
      const featB = features.get(idxB)!;

      const timeDiff = Math.abs((itemA.createdAt || itemA.updatedAt) - (itemB.createdAt || itemB.updatedAt));
      const sameSourceBurst = itemA.sourceType === itemB.sourceType && timeDiff <= BURST_WINDOW_MS;
      const commonTokens = sharedValues(featA.tokens, featB.tokens);
      const commonTags = sharedValues(featA.tags, featB.tags);

      if (sameSourceBurst && (commonTokens.length >= 1 || commonTags.length >= 1 || timeDiff <= 10 * 60 * 1000)) {
        union(idxA, idxB);
      } else if (commonTokens.length >= 2) {
        union(idxA, idxB);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (const idx of sparkIndices) {
    const root = find(idx);
    const arr = groups.get(root) ?? [];
    arr.push(idx);
    groups.set(root, arr);
  }

  let threadSeq = 1;
  for (const memberIndices of groups.values()) {
    if (memberIndices.length < 2) continue;
    const threadId = `thread-${threadSeq++}`;
    const hasRecentMember = memberIndices.some((idx) => items[idx]!.ageDays < cooledDays);

    // Pick top 2 recurring tokens (or tags) for concise thread label
    const freq = new Map<string, number>();
    for (const idx of memberIndices) {
      const feat = features.get(idx)!;
      for (const tok of feat.tokens) {
        freq.set(tok, (freq.get(tok) ?? 0) + 1);
      }
    }
    const topKeywords = [...freq.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
      .slice(0, 2)
      .map(([tok]) => tok);

    let threadLabel: string;
    if (topKeywords.length > 0) {
      threadLabel = `正在发芽 · ${topKeywords.join(" / ")}`;
    } else {
      const tagFreq = new Map<string, number>();
      for (const idx of memberIndices) {
        for (const tag of features.get(idx)!.tags) {
          tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
        }
      }
      const topTag = [...tagFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      threadLabel = topTag ? `正在发芽 · #${topTag}` : `正在发芽 · 连续思考簇`;
    }

    for (const idx of memberIndices) {
      const cur = items[idx]!;
      cur.sprouting = true;
      cur.threadId = threadId;
      cur.threadLabel = cur.aiHint?.threadTitle ? `正在发芽 · ${cur.aiHint.threadTitle}` : threadLabel;
      cur.threadCount = memberIndices.length;
      if (hasRecentMember) {
        cur.cooled = false;
      }
    }
  }

  return items;
}

export function summarizeInboxPockets(
  items: readonly StageInboxViewItem[],
  sweepWindowTime = DEFAULT_SWEEP_WINDOW_TIME,
): StageInboxPocketCounts {
  let sweepCount = 0;
  let commitCount = 0;
  let sparkCount = 0;
  let cooledCount = 0;
  let pendingJournalCount = 0;
  let sweepCarryoverCount = 0;
  const sproutingThreads = new Set<string>();

  for (const item of items) {
    if (item.pendingJournalFlush) pendingJournalCount++;
    if (item.cooled) {
      cooledCount++;
      continue;
    }
    if (item.pocket === "sweep") {
      sweepCount++;
      if ((item.carryoverDays ?? 0) >= 2) sweepCarryoverCount++;
    } else if (item.pocket === "commit") {
      commitCount++;
    } else {
      sparkCount++;
      if (item.sprouting && item.threadId) sproutingThreads.add(item.threadId);
    }
  }

  return {
    sweepCount,
    commitCount,
    sparkCount,
    sproutingCount: sproutingThreads.size,
    cooledCount,
    pendingJournalCount,
    sweepWindowTime,
    commitOverload: commitCount >= 3,
    sweepCarryoverCount,
  };
}
