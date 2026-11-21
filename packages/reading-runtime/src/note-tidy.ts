import { WorkspaceError } from "@task-copilot/contracts";
import {
  isProfileConfigured,
  type ReadingPrivacyMode,
  type ReadingRole,
  type ReadingRuntimeConfig,
} from "./config.ts";
import { callProviderTurn, type FetchLike } from "./providers.ts";
import { resolveSelectedProfile } from "./runner.ts";

export type NoteTidyAnchorCategory = "link" | "metric" | "blocker" | "decision" | "todo" | "term";

export interface NoteTidySourceBlock {
  sourceId: string;
  blockUuid: string;
  parentUuid: string | null;
  depth: number;
  content: string;
  contentVersion: string;
  protected?: boolean;
  protectedReason?: string;
}

export interface NoteTidyInput {
  scope: { graphId: string; rootUuid: string; kind?: "page"; pageName?: string };
  structureVersion: string;
  sourceSetVersion: string;
  instruction?: string;
  targetRootUuid?: string;
  hasExistingStructure?: boolean;
  blocks: NoteTidySourceBlock[];
}

export interface NoteTidyAnchor {
  id: string;
  label: string;
  category: NoteTidyAnchorCategory;
  colorSlot: 0 | 1 | 2 | 3 | 4;
  before: { sourceId: string; exactText: string };
  after: { targetId: string; exactText: string } | null;
}

export interface NoteTidyStructuralChange {
  kind: "group" | "reorder" | "merge" | "insert";
  description: string;
  sourceIds: string[];
}

export type NoteTidyOperation =
  | {
      operationId: string;
      type: "replace-text";
      sourceId: string;
      blockUuid: string;
      expectedContentVersion: string;
      beforeText: string;
      afterText: string;
      range?: { start: number; end: number };
    }
  | {
      operationId: string;
      type: "insert-child";
      parentSourceId: string;
      parentBlockUuid: string;
      expectedParentContentVersion: string;
      afterText: string;
    };

export interface NoteTidyPreviewBlock {
  id: string;
  sourceId: string | null;
  blockUuid: string | null;
  parentId: string | null;
  depth: number;
  content: string;
  protected: boolean;
  changed: boolean;
}

export interface NoteTidyPlan {
  schemaVersion: 1;
  summary: string;
  sourceSetVersion: string;
  structureVersion: string;
  hasExistingStructure: boolean;
  structuralChanges: NoteTidyStructuralChange[];
  operations: NoteTidyOperation[];
  beforeBlocks: NoteTidyPreviewBlock[];
  afterBlocks: NoteTidyPreviewBlock[];
  anchors: NoteTidyAnchor[];
  omittedAnchorIds: string[];
  protectedBlockCount: number;
  meta: {
    origin: "local-model" | "external-mcp";
    providerId?: string;
    model?: string | null;
    proposalId?: string;
  };
}

export interface NoteTidyRunOptions {
  input: NoteTidyInput;
  config: ReadingRuntimeConfig;
  env?: Record<string, string | undefined>;
  privacyMode?: ReadingPrivacyMode;
  role?: ReadingRole;
  profileId?: string;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  dshAvailable?: boolean;
}

const TODO_LINE_PATTERN = /^\s*(?:[-*+]\s+)?(?:TODO|DOING|DONE|LATER|NOW|WAITING|CANCELED|CANCELLED)\b|^\s*[-*+]\s+\[[ xX]\]/mu;
const FORMAL_PATTERN = /(?:\*\*\[(?:任务|事务|Project|MiniProject|Area)\]\*\*|^\s*\[(?:任务|事务|Project|MiniProject|Area)\])/mu;
const MANAGED_PATTERN = /(?:^|\n)\s*task-copilot[\w-]*::|^\s*>\s*\[Task Copilot\]/imu;
const PROPERTY_LINE_PATTERN = /^\s*[^\s:]+::/mu;

export function detectBlockProtection(content: string): { protected: boolean; reason?: string } {
  if (MANAGED_PATTERN.test(content)) return { protected: true, reason: "managed" };
  if (FORMAL_PATTERN.test(content)) return { protected: true, reason: "formal" };
  if (TODO_LINE_PATTERN.test(content)) return { protected: true, reason: "todo" };
  if (PROPERTY_LINE_PATTERN.test(content)) return { protected: true, reason: "property" };
  return { protected: false };
}

export function detectExistingStructure(blocks: readonly NoteTidySourceBlock[]): boolean {
  if (blocks.length <= 2) return false;
  const depths = new Set(blocks.map((b) => b.depth));
  if (depths.size >= 3) return true;
  const parents = new Set(blocks.map((b) => b.parentUuid).filter((p): p is string => Boolean(p)));
  if (parents.size >= 2) return true;
  const headingCount = blocks.filter((b) => /^\s*(?:#{1,4}\s|\*\*[^*\n]{2,40}\*\*)/u.test(b.content)).length;
  return headingCount >= 2;
}

export const noteTidyInstructions = `你是 Logseq 左侧原生笔记的「原地整理编辑」，职责与右侧摘要完全不同：
1. **活的写作现场（严禁写成摘要、严禁套一层 AI 外壳）**：
   - 用户会直接在整理后的左侧原块上继续写作和修改。
   - 必须保留作者原本的上下文、因果、语气、细节、数字、备选方案与未决条件；只清理重复、零散碎句、语病和混乱节奏，绝不删减真实信息量。
2. **硬保护边界（绝对不可违反）**：
   - 任何标记为 protected: true 的块（TODO、正式对象标题、属性块等）绝不可出现在 edits 中，也不可删除或篡改。
   - 任何普通块的整理结果和新增子块（inserts）中，严禁凭空注入 TODO/DOING/DONE、**[任务]**、**[Project]** 或 key:: value 属性行。
   - 原文中的所有 [[页面链接]]、((块引用)) 以及 Markdown 链接 [文本](路径) 必须逐字原样保留，绝不丢失或改坏。
3. **结构尊重先验**：
   - 当 hasExistingStructure 为 true 时，优先保持现有块结构与层级，只在各普通块内部润色理顺；
   - 当 hasExistingStructure 为 false（零散平铺草稿）时，可轻度梳理脉络并在必要时用少量 inserts 补清条理；
   - 只要做了合并冗余、重排逻辑或新增子块等结构调整，必须在 structuralChanges 里用自然人话诚实说明原因（严禁在 summary 或 description 中出现 b1、b2、b3 等内部 blockId 代号；内部代号只能写在 blockIds 字段里）。
4. **关键信息锚点标注（供前端做同色高亮与前后平移动效）**：
   - 从原文挑出 3–8 处最值得一眼确认没漏掉的关键信息（数字、编号、核心卡点、未决条件、关键链接或结论），在 anchors 数组中给出整理前（beforeBlockId + beforeText）和整理后（afterBlockId + afterText）的精确原样短语（必须逐字存在于对应块中）。
5. **输出严格 JSON（不要代码围栏，不要多余解释）**：
   {
     "summary": "用自然语言一句话说明理顺了什么（不出现 b1/b2 等代号）",
     "structuralChanges": [{ "kind": "group|reorder|merge|insert", "description": "给用户看的自然语言说明（严禁出现 b1/b2 等代号）", "blockIds": ["b1"] }],
     "edits": [{ "blockId": "b1", "afterText": "整理后的完整块文本" }],
     "inserts": [{ "parentBlockId": "b1", "afterText": "新增的普通子块文本" }],
     "anchors": [{ "label": "简短标签", "category": "link|metric|blocker|decision|term", "beforeBlockId": "b1", "beforeText": "原文精确短语", "afterBlockId": "b1", "afterText": "整理后精确短语（若未带入写 null）" }]
   }`;

interface ExtractedAnchorCandidate {
  sourceId: string;
  exactText: string;
  label: string;
  category: NoteTidyAnchorCategory;
  priority: number;
}

const LINK_PATTERNS: RegExp[] = [
  /\[\[[^\]\n]{1,120}\]\]/gu,
  /\(\([0-9a-f-]{8,64}\)\)/giu,
  /\[[^\]\n]{1,100}\]\([^)\n]{1,400}\)/gu,
];

const METRIC_PATTERNS: RegExp[] = [
  /\b[A-Z]{2,10}-\d{2,8}\b/gu,
  /\b\d{1,4}(?:\.\d+)?%/gu,
  /\b\d{1,2}:\d{2}(?:\s*[-–~]\s*\d{1,2}:\d{2})?\b/gu,
  /\d{4}[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?/gu,
  /\b\d+(?:\.\d+)?\s*(?:台|项|条|个|份|天|周|小时|分钟|ms|s|KB|MB|GB)\b/giu,
];

const BLOCKER_PATTERNS: RegExp[] = [
  /(?:冷启动白屏|白屏|阻塞|卡点|未复现|未定|待核验|待确认|风险|冲突|方案\s*[A-Z1-9]|备选方案|发布窗口|签字回执)/gu,
];

const CATEGORY_COLOR_SLOT: Record<NoteTidyAnchorCategory, 0 | 1 | 2 | 3 | 4> = {
  link: 2,
  metric: 0,
  blocker: 1,
  decision: 3,
  todo: 1,
  term: 4,
};

function findExactMatchInBlocks(
  text: string,
  blocks: readonly NoteTidyPreviewBlock[],
  preferredId?: string | null
): { targetId: string; exactText: string } | null {
  if (!text) return null;
  if (preferredId) {
    const preferred = blocks.find((b) => b.id === preferredId);
    if (preferred && preferred.content.includes(text)) {
      return { targetId: preferred.id, exactText: text };
    }
  }
  for (const block of blocks) {
    if (block.content.includes(text)) {
      return { targetId: block.id, exactText: text };
    }
  }
  return null;
}

export function extractHighPriorAnchors(
  beforeBlocks: readonly NoteTidyPreviewBlock[],
  afterBlocks: readonly NoteTidyPreviewBlock[],
  provided: readonly NoteTidyAnchor[] = [],
  maxAnchors = 10
): { anchors: NoteTidyAnchor[]; omittedAnchorIds: string[] } {
  const anchors: NoteTidyAnchor[] = [];
  const seenBefore = new Set<string>();
  const changedSourceIds = new Set(afterBlocks.filter((b) => b.changed && b.sourceId).map((b) => b.sourceId!));

  const pushAnchor = (
    category: NoteTidyAnchorCategory,
    label: string,
    beforeSourceId: string,
    beforeText: string,
    afterMatch: { targetId: string; exactText: string } | null
  ) => {
    const dedupeKey = `${beforeSourceId}::${beforeText}`;
    if (!beforeText.trim() || seenBefore.has(dedupeKey)) return;
    const beforeBlock = beforeBlocks.find((b) => b.id === beforeSourceId);
    if (!beforeBlock || !beforeBlock.content.includes(beforeText)) return;
    seenBefore.add(dedupeKey);
    const id = `anchor-${anchors.length + 1}`;
    const slot = ((CATEGORY_COLOR_SLOT[category] + anchors.length) % 5) as 0 | 1 | 2 | 3 | 4;
    anchors.push({
      id,
      label: label.slice(0, 40),
      category,
      colorSlot: category === "blocker" ? 1 : category === "link" ? 2 : slot,
      before: { sourceId: beforeSourceId, exactText: beforeText },
      after: afterMatch,
    });
  };

  // 1. Always enforce ALL high-prior verbatim links ([[...]], ((...)), [..](..)) from changed blocks first so link loss can never hide!
  const candidates: ExtractedAnchorCandidate[] = [];
  for (const block of beforeBlocks) {
    const isChanged = changedSourceIds.has(block.id);
    if (!isChanged && block.protected) continue;
    for (const pattern of LINK_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(block.content)) !== null) {
        candidates.push({
          sourceId: block.id,
          exactText: match[0],
          label: match[0],
          category: "link",
          priority: isChanged ? 100 : 75,
        });
      }
    }
    for (const pattern of METRIC_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(block.content)) !== null) {
        candidates.push({
          sourceId: block.id,
          exactText: match[0],
          label: match[0],
          category: "metric",
          priority: isChanged ? 90 : 60,
        });
      }
    }
    for (const pattern of BLOCKER_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(block.content)) !== null) {
        candidates.push({
          sourceId: block.id,
          exactText: match[0],
          label: match[0],
          category: "blocker",
          priority: isChanged ? 85 : 55,
        });
      }
    }
  }

  // Always add ALL links first (never silently dropped even if maxAnchors is tight)
  for (const item of candidates.filter((c) => c.category === "link").sort((a, b) => b.priority - a.priority)) {
    const afterMatch = findExactMatchInBlocks(item.exactText, afterBlocks, item.sourceId);
    pushAnchor(item.category, item.label, item.sourceId, item.exactText, afterMatch);
  }

  // 2. Add verified model-provided anchors
  for (const item of provided) {
    if (anchors.length >= maxAnchors) break;
    const beforeBlock = beforeBlocks.find((b) => b.id === item.before.sourceId);
    if (!beforeBlock || !beforeBlock.content.includes(item.before.exactText)) continue;
    let verifiedAfter: { targetId: string; exactText: string } | null = null;
    if (item.after) {
      const targetBlock = afterBlocks.find((b) => b.id === item.after!.targetId);
      if (targetBlock && targetBlock.content.includes(item.after.exactText)) {
        verifiedAfter = { targetId: targetBlock.id, exactText: item.after.exactText };
      }
    }
    if (!verifiedAfter) {
      verifiedAfter = findExactMatchInBlocks(item.before.exactText, afterBlocks, item.before.sourceId);
    }
    pushAnchor(item.category, item.label, item.before.sourceId, item.before.exactText, verifiedAfter);
  }

  // 3. Fill remaining slots with deterministic high-prior metrics & blockers
  const rest = candidates
    .filter((c) => c.category !== "link")
    .sort((a, b) => b.priority - a.priority);
  for (const item of rest) {
    if (anchors.length >= maxAnchors) break;
    const afterMatch = findExactMatchInBlocks(item.exactText, afterBlocks, item.sourceId);
    pushAnchor(item.category, item.label, item.sourceId, item.exactText, afterMatch);
  }

  // 4. Fallback: if still < 3 anchors and there are changed blocks, extract shared meaningful clauses/phrases (4-14 chars)
  if (anchors.length < 3) {
    for (const block of beforeBlocks) {
      if (anchors.length >= Math.min(maxAnchors, 5)) break;
      if (block.protected) continue;
      const afterBlock = afterBlocks.find((b) => b.id === block.id);
      if (!afterBlock) continue;
      const tokens = block.content
        .split(/[，。；、！？\n\r\t（）()【】[\]：:]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && t.length <= 24);
      for (const token of tokens) {
        if (anchors.length >= Math.min(maxAnchors, 5)) break;
        const snippet = token.slice(0, 12);
        const match = findExactMatchInBlocks(snippet, afterBlocks, block.id);
        if (match) {
          pushAnchor("term", snippet, block.id, snippet, match);
        }
      }
    }
  }

  const omittedAnchorIds = anchors.filter((a) => a.after === null).map((a) => a.id);
  return { anchors, omittedAnchorIds };
}

function assertNonProtectedTextSafe(text: string): void {
  if (typeof text !== "string" || !text.trim() || text.includes("\0") || text.length > 24_000) {
    throw new WorkspaceError("NOTE_TIDY_OUTPUT_INVALID", "整理后的块文本无效或超出长度限制。");
  }
  const detected = detectBlockProtection(text);
  if (detected.protected) {
    throw new WorkspaceError(
      "PROTECTED_TARGET_FORBIDDEN",
      `原地整理禁止在普通块中注入受保护标记（${detected.reason}）。`
    );
  }
}

export function buildNoteTidyPlanFromOperations(options: {
  sourceSetVersion: string;
  structureVersion: string;
  summary: string;
  blocks: readonly NoteTidySourceBlock[];
  operations: readonly NoteTidyOperation[];
  structuralChanges?: readonly NoteTidyStructuralChange[];
  providedAnchors?: readonly NoteTidyAnchor[];
  origin: "local-model" | "external-mcp";
  providerId?: string;
  model?: string | null;
  proposalId?: string;
  hasExistingStructure?: boolean;
}): NoteTidyPlan {
  if (!options.blocks.length) {
    throw new WorkspaceError("NOTE_TIDY_SOURCE_REQUIRED", "当前范围内没有可整理的笔记块。");
  }
  const normalizedBlocks = options.blocks.map((block) => {
    const detected = detectBlockProtection(block.content);
    const isProtected = block.protected === true || detected.protected;
    return { ...block, protected: isProtected };
  });
  const bySource = new Map(normalizedBlocks.map((b) => [b.sourceId, b]));
  const byUuid = new Map(normalizedBlocks.map((b) => [b.blockUuid, b]));

  const beforeBlocks: NoteTidyPreviewBlock[] = normalizedBlocks.map((b) => ({
    id: b.sourceId,
    sourceId: b.sourceId,
    blockUuid: b.blockUuid,
    parentId: b.parentUuid ? (byUuid.get(b.parentUuid)?.sourceId ?? null) : null,
    depth: b.depth,
    content: b.content,
    protected: b.protected,
    changed: false,
  }));

  const afterBlocks: NoteTidyPreviewBlock[] = beforeBlocks.map((b) => ({ ...b }));
  const validatedOps: NoteTidyOperation[] = [];
  const structuralChanges: NoteTidyStructuralChange[] = [...(options.structuralChanges ?? [])];

  for (const op of options.operations) {
    if (op.type === "replace-text") {
      const target = bySource.get(op.sourceId);
      if (!target) {
        throw new WorkspaceError("SOURCE_OUTSIDE_SCOPE", `目标块 ${op.sourceId} 不在当前整理范围内。`);
      }
      if (target.protected) {
        throw new WorkspaceError("PROTECTED_TARGET_FORBIDDEN", "禁止修改受保护的 TODO、正式对象或属性块。");
      }
      if (op.expectedContentVersion !== target.contentVersion) {
        throw new WorkspaceError("STALE_CONTENT_VERSION", `块 ${op.sourceId} 的内容版本不一致。`);
      }
      assertNonProtectedTextSafe(op.afterText);
      if (op.afterText === target.content) continue;
      validatedOps.push({
        ...op,
        blockUuid: target.blockUuid,
        beforeText: target.content,
      });
      const previewTarget = afterBlocks.find((b) => b.id === target.sourceId);
      if (previewTarget) {
        previewTarget.content = op.afterText;
        previewTarget.changed = true;
      }
    } else if (op.type === "insert-child") {
      const parent = bySource.get(op.parentSourceId);
      if (!parent) {
        throw new WorkspaceError("SOURCE_OUTSIDE_SCOPE", `父块 ${op.parentSourceId} 不在当前整理范围内。`);
      }
      if (op.expectedParentContentVersion !== parent.contentVersion) {
        throw new WorkspaceError("STALE_CONTENT_VERSION", `父块 ${op.parentSourceId} 版本不一致。`);
      }
      assertNonProtectedTextSafe(op.afterText);
      validatedOps.push({
        ...op,
        parentBlockUuid: parent.blockUuid,
      });
      const insertId = `new:${op.operationId}`;
      const parentIdx = afterBlocks.findIndex((b) => b.id === parent.sourceId);
      const inserted: NoteTidyPreviewBlock = {
        id: insertId,
        sourceId: null,
        blockUuid: null,
        parentId: parent.sourceId,
        depth: parent.depth + 1,
        content: op.afterText,
        protected: false,
        changed: true,
      };
      if (parentIdx >= 0) afterBlocks.splice(parentIdx + 1, 0, inserted);
      else afterBlocks.push(inserted);
      if (!structuralChanges.some((c) => c.kind === "insert" && c.sourceIds.includes(parent.sourceId))) {
        structuralChanges.push({
          kind: "insert",
          description: "在原有大纲下补充了整理后的子块（未删除任何旧块）。",
          sourceIds: [parent.sourceId],
        });
      }
    }
  }

  const { anchors, omittedAnchorIds } = extractHighPriorAnchors(
    beforeBlocks,
    afterBlocks,
    options.providedAnchors ?? []
  );

  return {
    schemaVersion: 1,
    summary: options.summary.trim() || "已原地整理当前普通笔记块并保留关键上下文。",
    sourceSetVersion: options.sourceSetVersion,
    structureVersion: options.structureVersion,
    hasExistingStructure: options.hasExistingStructure ?? detectExistingStructure(normalizedBlocks),
    structuralChanges,
    operations: validatedOps,
    beforeBlocks,
    afterBlocks,
    anchors,
    omittedAnchorIds,
    protectedBlockCount: normalizedBlocks.filter((b) => b.protected).length,
    meta: {
      origin: options.origin,
      ...(options.providerId ? { providerId: options.providerId } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.proposalId ? { proposalId: options.proposalId } : {}),
    },
  };
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return fenced ? fenced[1]!.trim() : trimmed;
}

const VALID_ANCHOR_CATEGORIES = new Set<NoteTidyAnchorCategory>(["link", "metric", "blocker", "decision", "todo", "term"]);
const VALID_STRUCT_KINDS = new Set<NoteTidyStructuralChange["kind"]>(["group", "reorder", "merge", "insert"]);

export async function runNoteTidyTask(options: NoteTidyRunOptions): Promise<NoteTidyPlan> {
  const { input, config } = options;
  const env = options.env ?? {};
  const privacyMode: ReadingPrivacyMode = options.privacyMode ?? "default";
  const fetchImpl = options.fetchImpl ?? fetch;
  const dshAvailable = options.dshAvailable ?? false;

  if (!Array.isArray(input?.blocks) || !input.blocks.length) {
    throw new WorkspaceError("NOTE_TIDY_SOURCE_REQUIRED", "当前范围内没有可整理的笔记块。");
  }

  const normalizedBlocks = input.blocks.map((block) => {
    const detected = detectBlockProtection(block.content);
    return {
      ...block,
      protected: block.protected === true || detected.protected,
      ...(detected.reason && !block.protectedReason ? { protectedReason: detected.reason } : {}),
    };
  });

  if (normalizedBlocks.every((b) => b.protected)) {
    throw new WorkspaceError(
      "PROTECTED_TARGET_FORBIDDEN",
      "当前所选范围内全部为受保护块（TODO、正式对象或属性块），无可原地整理的普通文本块。"
    );
  }

  const { profileId, profile } = resolveSelectedProfile(config, {
    input: {
      mode: "organize",
      question: input.instruction ?? "原地整理当前笔记",
      source: {
        scope: input.scope,
        structureVersion: input.structureVersion,
        sourceSetVersion: input.sourceSetVersion,
        blocks: normalizedBlocks.map((b) => ({
          sourceId: b.sourceId,
          target: { blockUuid: b.blockUuid },
          parentUuid: b.parentUuid,
          depth: b.depth,
          availability: "available",
          content: b.content,
        })),
      },
    },
    trigger: "manual",
    privacyMode,
    role: options.role ?? "deep",
    ...(options.profileId ? { profileId: options.profileId } : {}),
  });

  const status = isProfileConfigured(profile, env, dshAvailable);
  if (!status.configured) {
    if (privacyMode === "local-only") {
      throw new WorkspaceError("READING_LOCAL_MODEL_REQUIRED", "此工作已设为仅本地模型，请先配置本地模型 Profile（如 Ollama）。");
    }
    throw new WorkspaceError("READING_MODEL_NOT_CONFIGURED", "尚未配置可用的直连模型 Profile，请先配置 DEEPSEEK_API_KEY 或 providers.json。");
  }
  if (profile.kind === "dsh") {
    throw new WorkspaceError(
      "NOTE_TIDY_DIRECT_MODEL_REQUIRED",
      "原地整理左侧笔记需要直连模型 Profile（如 DeepSeek 或本地 Ollama），请切换模型或在外部 Agent 交互后通过 MCP 回流。"
    );
  }

  const hasExistingStructure = input.hasExistingStructure ?? detectExistingStructure(normalizedBlocks);
  const aliasBySource = new Map(normalizedBlocks.map((b, i) => [b.sourceId, `b${i + 1}`]));
  const sourceByAlias = new Map([...aliasBySource].map(([sourceId, alias]) => [alias, sourceId]));
  const aliasByUuid = new Map(normalizedBlocks.map((b) => [b.blockUuid, aliasBySource.get(b.sourceId)!]));

  const payload = {
    instruction: input.instruction?.trim() || "保留上下文、思路和全部细节，把零散或重复表达原地整理顺，让我能直接接着往下记录。",
    hasExistingStructure,
    blocks: normalizedBlocks.map((b) => ({
      blockId: aliasBySource.get(b.sourceId)!,
      parentBlockId: b.parentUuid ? (aliasByUuid.get(b.parentUuid) ?? null) : null,
      depth: b.depth,
      protected: b.protected,
      ...(b.protectedReason ? { protectedReason: b.protectedReason } : {}),
      text: b.content,
    })),
  };

  const payloadText = JSON.stringify(payload);
  if (payloadText.length > 100_000) {
    throw new WorkspaceError("READING_MODEL_CONTEXT_LIMIT", "所选笔记范围过长，请先选中某个子块范围再原地整理。");
  }

  const timeoutSignal = AbortSignal.timeout(config.budget.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  let turn;
  try {
    turn = await callProviderTurn(
      profile,
      env,
      {
        system: noteTidyInstructions,
        messages: [{ role: "user", content: payloadText }],
        maxTokens: profile.maxTokens ?? 8192,
        signal,
      },
      fetchImpl
    );
  } catch (error) {
    if (options.signal?.aborted || timeoutSignal.aborted) {
      throw new WorkspaceError("READING_MODEL_INTERRUPTED");
    }
    throw error;
  }

  if (turn.finishReason === "length") throw new WorkspaceError("READING_MODEL_INCOMPLETE");
  if (turn.finishReason === "error") throw new WorkspaceError("READING_MODEL_PROVIDER_FAILED");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(turn.text));
  } catch {
    throw new WorkspaceError("NOTE_TIDY_OUTPUT_INVALID", "模型返回的原地整理结果不是有效 JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkspaceError("NOTE_TIDY_OUTPUT_INVALID");
  }
  const raw = parsed as Record<string, unknown>;
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim().slice(0, 400) : "已原地整理当前普通笔记块。";

  const bySource = new Map(normalizedBlocks.map((b) => [b.sourceId, b]));
  const operations: NoteTidyOperation[] = [];
  const editedSources = new Set<string>();
  const rawEdits = Array.isArray(raw.edits) ? raw.edits : [];
  for (let i = 0; i < rawEdits.length; i++) {
    const item = rawEdits[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const sourceId = typeof rec.blockId === "string" ? sourceByAlias.get(rec.blockId) : undefined;
    if (!sourceId || editedSources.has(sourceId)) {
      throw new WorkspaceError("NOTE_TIDY_OUTPUT_INVALID", "模型引用了不存在或重复的 blockId。");
    }
    const block = bySource.get(sourceId)!;
    if (block.protected) {
      throw new WorkspaceError("PROTECTED_TARGET_FORBIDDEN", "模型试图修改受保护的 TODO/正式对象/属性块，已拦截。");
    }
    if (typeof rec.afterText !== "string") {
      throw new WorkspaceError("NOTE_TIDY_OUTPUT_INVALID");
    }
    editedSources.add(sourceId);
    operations.push({
      operationId: `tidy-edit-${i + 1}`,
      type: "replace-text",
      sourceId: block.sourceId,
      blockUuid: block.blockUuid,
      expectedContentVersion: block.contentVersion,
      beforeText: block.content,
      afterText: rec.afterText,
    });
  }

  const rawInserts = Array.isArray(raw.inserts) ? raw.inserts : [];
  const insertIdByIndex = new Map<number, string>();
  for (let i = 0; i < rawInserts.length; i++) {
    const item = rawInserts[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const parentSourceId = typeof rec.parentBlockId === "string" ? sourceByAlias.get(rec.parentBlockId) : undefined;
    if (!parentSourceId || typeof rec.afterText !== "string") {
      throw new WorkspaceError("NOTE_TIDY_OUTPUT_INVALID", "模型新增子块的 parentBlockId 或文本无效。");
    }
    const parent = bySource.get(parentSourceId)!;
    const operationId = `tidy-insert-${i + 1}`;
    insertIdByIndex.set(i, `new:${operationId}`);
    operations.push({
      operationId,
      type: "insert-child",
      parentSourceId: parent.sourceId,
      parentBlockUuid: parent.blockUuid,
      expectedParentContentVersion: parent.contentVersion,
      afterText: rec.afterText,
    });
  }

  const structuralChanges: NoteTidyStructuralChange[] = [];
  if (Array.isArray(raw.structuralChanges)) {
    for (const item of raw.structuralChanges) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const kind = typeof rec.kind === "string" && VALID_STRUCT_KINDS.has(rec.kind as NoteTidyStructuralChange["kind"])
        ? (rec.kind as NoteTidyStructuralChange["kind"])
        : "group";
      const description = typeof rec.description === "string" && rec.description.trim() ? rec.description.trim().slice(0, 240) : "";
      if (!description) continue;
      const sourceIds = Array.isArray(rec.blockIds)
        ? rec.blockIds.flatMap((alias) => (typeof alias === "string" && sourceByAlias.has(alias) ? [sourceByAlias.get(alias)!] : []))
        : [];
      structuralChanges.push({ kind, description, sourceIds });
    }
  }

  const providedAnchors: NoteTidyAnchor[] = [];
  if (Array.isArray(raw.anchors)) {
    for (const item of raw.anchors) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const beforeSourceId = typeof rec.beforeBlockId === "string" ? sourceByAlias.get(rec.beforeBlockId) : undefined;
      const beforeText = typeof rec.beforeText === "string" ? rec.beforeText : "";
      if (!beforeSourceId || !beforeText.trim()) continue;
      const category: NoteTidyAnchorCategory =
        typeof rec.category === "string" && VALID_ANCHOR_CATEGORIES.has(rec.category as NoteTidyAnchorCategory)
          ? (rec.category as NoteTidyAnchorCategory)
          : "term";
      const label = typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : beforeText;
      let after: { targetId: string; exactText: string } | null = null;
      if (typeof rec.afterText === "string" && rec.afterText.trim()) {
        const mappedAfter = typeof rec.afterBlockId === "string" ? sourceByAlias.get(rec.afterBlockId) : undefined;
        const targetId = mappedAfter ?? (typeof rec.afterInsertIndex === "number" ? insertIdByIndex.get(rec.afterInsertIndex) : undefined) ?? beforeSourceId;
        after = { targetId, exactText: rec.afterText };
      }
      providedAnchors.push({
        id: `model-${providedAnchors.length + 1}`,
        label,
        category,
        colorSlot: CATEGORY_COLOR_SLOT[category],
        before: { sourceId: beforeSourceId, exactText: beforeText },
        after,
      });
    }
  }

  return buildNoteTidyPlanFromOperations({
    sourceSetVersion: input.sourceSetVersion,
    structureVersion: input.structureVersion,
    summary,
    blocks: normalizedBlocks,
    operations,
    structuralChanges,
    providedAnchors,
    hasExistingStructure,
    origin: "local-model",
    providerId: profileId,
    model: profile.model ?? null,
  });
}
