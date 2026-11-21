import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
  WorkspaceError,
  sameWorkScope,
  workRecord,
  workText,
  type AgentWorkBinding,
  type WorkspaceCall,
  type WorkspaceCommand,
  type WorkRef,
} from "@task-copilot/contracts";
import {
  buildNoteTidyPlanFromOperations,
  filterReadingMaterialsForLocality,
  isSensitiveMaterialName,
  readingTask,
  type NoteTidyOperation,
  type NoteTidySourceBlock,
  type NoteTidyStructuralChange,
  type ReadingMaterialInput,
  type ReadingModelInput,
  type ReadingOrganizeOutput,
  type ReadingPrivacyMode,
} from "@task-copilot/reading-runtime";
import {
  addWritebackProposal,
  readActiveHandoff,
  resolveWorkPrivacy,
  workKeyForScope,
  type StagedWritebackProposal,
} from "./collaborate.ts";
import type { ReadingJobHub } from "./reading-hub.ts";
import { readCatalog } from "./work-catalog.ts";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const paragraphDetailSchema = {
  type: "object",
  properties: {
    key: { type: "string", description: "Unique key across the entire article." },
    markdown: { type: "string", description: "Natural, self-explanatory prose with minimal **bold** highlights." },
    sourceIds: { type: "array", items: { type: "string" }, description: "Verified sourceId values from the active work." },
    heading: { type: "string" },
    kind: { type: "string", enum: ["fact", "inference", "suggestion"] },
    tone: { type: "string", enum: ["progress", "attention"] },
    display: { type: "string", enum: ["quote", "table", "chart"] },
    materialIds: { type: "array", items: { type: "string" } },
    materialQuotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          materialId: { type: "string" },
          quote: { type: "string" },
        },
        required: ["materialId", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["key", "markdown", "sourceIds"],
  additionalProperties: false,
};

const paragraphSchema = {
  type: "object",
  properties: {
    key: { type: "string", description: "Unique key across the entire article." },
    markdown: { type: "string", description: "Top-level summary sentence(s) in natural prose." },
    kind: { type: "string", enum: ["fact", "inference", "suggestion"] },
    sourceIds: { type: "array", items: { type: "string" } },
    cue: { type: "string", description: "Optional exact plain phrase inside markdown to expand details." },
    tone: { type: "string", enum: ["progress", "attention"] },
    details: { type: "array", items: paragraphDetailSchema },
  },
  required: ["key", "markdown", "kind", "sourceIds"],
  additionalProperties: false,
};

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "workbench_list_works",
    description:
      "Read-only directory discovery of known Logseq works (title, type, recent update time, directory association status). Never returns source text or credentials.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional case-insensitive filter on title, type, or location." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "workbench_get_active_work",
    description:
      "Inspect the single currently connected/handed-off Logseq work: identity, latest verified structureVersion/sourceSetVersion, shared guidance, associated materials manifest (marking sensitive-blocked files), permissions, and active handoff context.",
    inputSchema: {
      type: "object",
      properties: {
        includeBriefing: { type: "boolean", default: true, description: "Include existing briefing summary if available." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "workbench_read_sources",
    description:
      "Paginated read of saved source blocks belonging strictly to the currently bound single Logseq work. Fails closed if offline, cross-work, or marked local-only.",
    inputSchema: {
      type: "object",
      properties: {
        workKey: { type: "string", description: "Optional active workKey assertion; mismatch fails closed." },
        rootUuid: { type: "string", description: "Optional active work rootUuid assertion; mismatch fails closed." },
        sourceIds: {
          type: "array",
          items: { type: "string" },
          description: "Specific sourceIds from the active work to read (up to 30). Omit to paginate all active work blocks.",
        },
        offset: { type: "integer", minimum: 0, default: 0 },
        limit: { type: "integer", minimum: 1, maximum: 30, default: 20 },
        maxChars: { type: "integer", minimum: 256, maximum: 32000, default: 16000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "workbench_read_material",
    description:
      "Paginated read of an explicitly associated material or associated note of the currently bound work. Automatically blocks sensitive files (.env*, *.key, *.pem, etc.) and respects per-work local-only privacy.",
    inputSchema: {
      type: "object",
      properties: {
        materialId: { type: "string", description: "Explicit material ID or associated note ID (note:...) from workbench_get_active_work." },
        workKey: { type: "string", description: "Optional active workKey assertion; mismatch fails closed." },
        rootUuid: { type: "string", description: "Optional active work rootUuid assertion; mismatch fails closed." },
        offset: { type: "integer", minimum: 0, default: 0 },
        maxChars: { type: "integer", minimum: 256, maximum: 32000, default: 16000 },
      },
      required: ["materialId"],
      additionalProperties: false,
    },
  },
  {
    name: "workbench_submit_reading_candidate",
    description:
      "Submit a structured progressive reading candidate for the currently bound work. Validates exact sourceSetVersion/structureVersion and strong source/material references, then stages in Companion for user review in Logseq (never silently overwrites current article or raw blocks).",
    inputSchema: {
      type: "object",
      properties: {
        workKey: { type: "string", description: "Optional active workKey assertion; mismatch fails closed." },
        rootUuid: { type: "string", description: "Optional active work rootUuid assertion; mismatch fails closed." },
        planId: { type: "string", description: "Optional reading plan ID." },
        sourceSetVersion: { type: "string", description: "Verified sourceSetVersion from workbench_get_active_work." },
        structureVersion: { type: "string", description: "Verified structureVersion from workbench_get_active_work." },
        summary: { type: "string", description: "Optional short revision note." },
        paragraphs: { type: "array", items: paragraphSchema, minItems: 1 },
      },
      required: ["sourceSetVersion", "structureVersion", "paragraphs"],
      additionalProperties: false,
    },
  },
  {
    name: "workbench_propose_writeback",
    description:
      "Route a controlled writeback proposal through Companion/Logseq channels (formatting-preview, pending-review content-proposal, or explicitly authorized content/stage/material channels). Never silently rewrites raw blocks, TODOs, or formal task states.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "formatting-preview",
            "content-proposal",
            "authorized-content-patch",
            "stage-submit",
            "authorized-material-capture",
          ],
          description: "Controlled writeback channel.",
        },
        workKey: { type: "string" },
        rootUuid: { type: "string" },
        requestId: { type: "string" },
        summary: { type: "string" },
        sourceIds: { type: "array", items: { type: "string" } },
        labels: { type: "array", items: { type: "string" } },
        sourceSetVersion: { type: "string" },
        structureVersion: { type: "string" },
        structuralChanges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["group", "reorder", "merge", "insert"] },
              description: { type: "string" },
              sourceIds: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "description"],
            additionalProperties: false,
          },
        },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              operationId: { type: "string" },
              type: { type: "string", enum: ["replace-text", "insert-text", "insert-child"] },
              sourceId: { type: "string" },
              expectedContentVersion: { type: "string" },
              text: { type: "string" },
              range: {
                type: "object",
                properties: {
                  start: { type: "integer", minimum: 0 },
                  end: { type: "integer", minimum: 0 },
                },
                required: ["start", "end"],
                additionalProperties: false,
              },
            },
            required: ["operationId", "type", "sourceId", "expectedContentVersion", "text"],
            additionalProperties: false,
          },
        },
        patch: { type: "object" },
        stageId: { type: "string" },
        expectedRevision: { type: "string" },
        correctionOf: { type: ["string", "null"] },
        capture: {
          type: "object",
          properties: {
            requestKey: { type: "string" },
            text: { type: "string" },
            html: { type: "string" },
            title: { type: "string" },
            role: { type: "string", enum: ["input", "reference", "draft", "output"] },
          },
          required: ["requestKey", "text"],
          additionalProperties: false,
        },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
];

export interface ActiveConnectionMeta {
  connectionId: string;
  binding: AgentWorkBinding;
  workKey: string;
  title?: string;
  workRef?: WorkRef;
}

export interface McpRuntimeContext {
  stateDirectory: string;
  instanceId: string;
  readingHub: ReadingJobHub;
  getActiveConnection(): ActiveConnectionMeta | null;
  dispatch(call: WorkspaceCall): Promise<unknown>;
  audit(entry: {
    connectionId: string;
    clientId: string;
    requestId: string;
    command: string;
    payload: unknown;
    outcome: string;
  }): Promise<void>;
}

interface LiveSourceBlock {
  sourceId: string;
  target: { blockUuid: string };
  parentUuid?: string | null;
  depth?: number;
  order?: number;
  availability: string;
  content?: string | null;
  contentVersion?: string | null;
}

interface LiveSnapshot {
  scope: AgentWorkBinding["scope"];
  capturedAt?: string;
  structureVersion: string;
  sourceSetVersion: string;
  blocks: LiveSourceBlock[];
}

interface AssociatedSourceItem {
  association?: {
    kind?: string;
    graphId?: string;
    pageUuid?: string;
    pageName?: string;
    blockUuid?: string;
    id?: string;
  };
  availability?: string;
  snapshot?: LiveSnapshot;
}

interface RawMaterialRecord {
  id: string;
  path?: string;
  filename?: string;
  title?: string;
  reference?: string;
  version?: string | null;
  availability?: string;
  content?: string | null;
}

interface UnifiedMaterialEntry {
  id: string;
  filename: string;
  path?: string;
  kind: "file" | "note";
  availability: string;
  version: string | null;
  sensitiveBlocked: boolean;
  text?: string | null;
}

const TODO_MARKER_PATTERN = /^\s*(?:TODO|DOING|DONE|LATER|NOW|WAITING|CANCELED|CANCELLED)\b/u;
const FORMAL_MARKER_PATTERN = /(?:\*\*\[(?:任务|事务|Project|MiniProject|Area)\]\*\*|^\[(?:任务|事务|Project|MiniProject|Area)\])/mu;
const PROPERTY_LINE_PATTERN = /^\s*[a-zA-Z0-9_-]+::/mu;

function unwrapReply(value: unknown): unknown {
  if (value && typeof value === "object" && "provenance" in value && "value" in value) {
    return (value as { value: unknown }).value;
  }
  return value;
}

function asArgsObject(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new WorkspaceError("INVALID_INPUT", "Tool arguments must be a JSON object.");
  }
  return raw as Record<string, unknown>;
}

function integerArg(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new WorkspaceError("INVALID_INPUT", `Expected integer between ${min} and ${max}.`);
  }
  return value;
}

function assertWorkScope(active: ActiveConnectionMeta, args: Record<string, unknown>): void {
  if (args.workKey !== undefined) {
    const requestedKey = workText(args.workKey, 512);
    const canonical = workKeyForScope(active.binding.scope);
    if (requestedKey !== active.workKey && requestedKey !== canonical) {
      throw new WorkspaceError("SCOPE_MISMATCH", "请求的 workKey 与当前已绑定的活跃单工作不一致，已拒绝跨工作访问。");
    }
  }
  if (args.rootUuid !== undefined) {
    const requestedRoot = workText(args.rootUuid, 128);
    if (requestedRoot !== active.binding.scope.rootUuid) {
      throw new WorkspaceError("SCOPE_MISMATCH", "请求的 rootUuid 与当前已绑定的活跃单工作不一致，已拒绝跨工作访问。");
    }
  }
}

async function callWorkspace(
  ctx: McpRuntimeContext,
  active: ActiveConnectionMeta,
  clientId: string,
  command: WorkspaceCommand,
  payload: Record<string, unknown>,
  requestId: string = randomUUID()
): Promise<unknown> {
  const result = await ctx.dispatch({
    schemaVersion: 1,
    instanceId: ctx.instanceId,
    connectionId: active.connectionId,
    clientId,
    requestId,
    command,
    payload,
  });
  return unwrapReply(result);
}

function extractMaterialsAndNotes(
  rawList: unknown,
  refreshResult: { workspace?: { observed?: { sources?: AssociatedSourceItem[] } } }
): UnifiedMaterialEntry[] {
  const items: UnifiedMaterialEntry[] = [];
  const seen = new Set<string>();
  const listObj = rawList as { materials?: RawMaterialRecord[] } | null;
  for (const material of listObj?.materials ?? []) {
    if (!material || typeof material.id !== "string" || seen.has(material.id)) continue;
    seen.add(material.id);
    const rawPath = typeof material.path === "string" ? material.path : undefined;
    const filename =
      typeof material.filename === "string" && material.filename.trim()
        ? material.filename.trim()
        : rawPath
          ? basename(rawPath)
          : material.title || material.id;
    const sensitiveBlocked =
      isSensitiveMaterialName(filename) || (rawPath !== undefined && isSensitiveMaterialName(rawPath));
    items.push({
      id: material.id,
      filename,
      ...(rawPath ? { path: rawPath } : {}),
      kind: "file",
      availability: material.availability ?? "available",
      version: material.version ?? null,
      sensitiveBlocked,
      text: sensitiveBlocked ? null : (material.content ?? null),
    });
  }
  for (const assoc of refreshResult.workspace?.observed?.sources ?? []) {
    const kind = assoc?.association?.kind;
    if (kind !== "logseq-page" && kind !== "logseq-block") continue;
    const targetUuid = kind === "logseq-page" ? assoc.association?.pageUuid : assoc.association?.blockUuid;
    if (!targetUuid) continue;
    const id = `note:${targetUuid}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const blocks = assoc.snapshot?.blocks ?? [];
    const text = blocks.map((block) => block.content ?? "").join("\n\n");
    const filename =
      kind === "logseq-page"
        ? (assoc.association?.pageName ?? "关联页面")
        : (blocks[0]?.content?.split("\n")[0]?.slice(0, 80) ?? "关联笔记块");
    items.push({
      id,
      filename,
      kind: "note",
      availability: assoc.availability ?? "available",
      version: assoc.snapshot?.sourceSetVersion ?? null,
      sensitiveBlocked: false,
      text,
    });
  }
  return items;
}

function isProtectedContent(text: string): boolean {
  return TODO_MARKER_PATTERN.test(text) || FORMAL_MARKER_PATTERN.test(text) || PROPERTY_LINE_PATTERN.test(text);
}

function collectParagraphKeys(paragraphs: unknown[]): void {
  const keys = new Set<string>();
  const register = (rawKey: unknown) => {
    if (typeof rawKey !== "string" || !rawKey.trim() || rawKey.length > 128) {
      throw new WorkspaceError("READING_MODEL_OUTPUT", "每个段落和细读单元都必须提供唯一的非空 key。");
    }
    if (keys.has(rawKey)) {
      throw new WorkspaceError("DUPLICATE_BRIEFING_KEY", `候选修订包含重复的 key：${rawKey}`);
    }
    keys.add(rawKey);
  };
  for (const item of paragraphs) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new WorkspaceError("READING_MODEL_OUTPUT");
    }
    const paragraph = item as { key?: unknown; details?: unknown };
    register(paragraph.key);
    if (Array.isArray(paragraph.details)) {
      for (const detail of paragraph.details) {
        if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
          throw new WorkspaceError("READING_MODEL_OUTPUT");
        }
        register((detail as { key?: unknown }).key);
      }
    }
  }
}

export async function executeMcpTool(
  ctx: McpRuntimeContext,
  options: {
    name: string;
    arguments?: unknown;
    clientId?: string;
    requestId?: string;
  }
): Promise<unknown> {
  const toolName = workText(options.name, 128);
  const clientId = options.clientId ? workText(options.clientId, 128) : "mcp";
  const requestId = options.requestId ? workText(options.requestId, 128) : randomUUID();
  const rawArgs = asArgsObject(options.arguments);
  const active = ctx.getActiveConnection();
  const auditConnectionId = active?.connectionId ?? "none";

  try {
    const result = await runTool(ctx, toolName, rawArgs, clientId, requestId);
    await ctx.audit({
      connectionId: ctx.getActiveConnection()?.connectionId ?? auditConnectionId,
      clientId,
      requestId,
      command: `mcp.${toolName}`,
      payload: rawArgs,
      outcome: "returned",
    });
    return result;
  } catch (error) {
    const code = error instanceof WorkspaceError ? error.code : "MCP_TOOL_FAILED";
    await ctx.audit({
      connectionId: ctx.getActiveConnection()?.connectionId ?? auditConnectionId,
      clientId,
      requestId,
      command: `mcp.${toolName}`,
      payload: rawArgs,
      outcome: code,
    });
    throw error;
  }
}

async function runTool(
  ctx: McpRuntimeContext,
  toolName: string,
  rawArgs: Record<string, unknown>,
  clientId: string,
  requestId: string
): Promise<unknown> {
  if (toolName === "workbench_list_works") {
    const args = workRecord(rawArgs, ["query", "limit"]);
    const query = args.query === undefined ? "" : workText(args.query, 200).toLowerCase();
    const limit = integerArg(args.limit, 50, 1, 200);
    const snapshots = await readCatalog(ctx.stateDirectory);
    const active = ctx.getActiveConnection();
    let total = 0;
    let remaining = limit;
    const graphs = snapshots.map((graph) => {
      const matched = graph.works.filter((work) => {
        if (!query) return true;
        return (
          work.title.toLowerCase().includes(query) ||
          work.objectType.toLowerCase().includes(query) ||
          work.location.toLowerCase().includes(query)
        );
      });
      total += matched.length;
      const sliced = remaining > 0 ? matched.slice(0, remaining) : [];
      remaining = Math.max(0, remaining - sliced.length);
      return {
        graphId: graph.graphId,
        graphName: graph.graphName,
        refreshedAt: graph.refreshedAt,
        works: sliced.map((work) => {
          const isActive = Boolean(
            active &&
              ((work.workRef.kind === "logseq" &&
                work.workRef.graphId === active.binding.scope.graphId &&
                (work.workRef.rootUuid === active.binding.scope.rootUuid ||
                  work.pageSourceUuid === active.binding.scope.rootUuid)) ||
                (work.directory && work.directory === active.binding.directory))
          );
          return {
            workRef: work.workRef,
            title: work.title,
            objectType: work.objectType,
            location: work.location,
            updatedAt: work.updatedAt,
            associatedDirectory: Boolean(work.directory),
            isActive,
          };
        }),
      };
    });
    return {
      activeWork: active
        ? {
            workKey: active.workKey,
            title: active.title ?? active.binding.scope.pageName ?? null,
            scope: active.binding.scope,
            associatedDirectory: true,
          }
        : null,
      graphs,
      total,
      readOnlyCatalog: true,
    };
  }

  const active = ctx.getActiveConnection();
  if (!active) {
    throw new WorkspaceError(
      "WORKSPACE_OFFLINE",
      "当前没有已连接的活跃 Logseq 工作。请先在 Logseq 打开工作并建立只读连接或点击继续协作。"
    );
  }

  if (toolName === "workbench_get_active_work") {
    const args = workRecord(rawArgs, ["includeBriefing"]);
    const includeBriefing = args.includeBriefing !== false;
    const privacyMode = await resolveWorkPrivacy(ctx.stateDirectory, active.binding, active.workKey);
    const status = (await callWorkspace(ctx, active, clientId, "status", {})) as Record<string, unknown>;
    const refreshed = (await callWorkspace(ctx, active, clientId, "refresh", {})) as {
      freshness: string;
      snapshot: LiveSnapshot;
      workspace?: { observed?: { sources?: AssociatedSourceItem[] } };
    };
    let guidance: unknown;
    try {
      guidance = await callWorkspace(ctx, active, clientId, "guidance.read", {});
    } catch {
      guidance = null;
    }
    let rawMaterials: unknown;
    try {
      rawMaterials = await callWorkspace(ctx, active, clientId, "materials.list", {});
    } catch {
      rawMaterials = { materials: [] };
    }
    const materials = extractMaterialsAndNotes(rawMaterials, refreshed);
    const handoff = await readActiveHandoff(ctx.stateDirectory, active.connectionId, active.binding);

    let briefing: unknown = null;
    if (includeBriefing && privacyMode !== "local-only") {
      try {
        const readingView = (await callWorkspace(ctx, active, clientId, "reading.view", {})) as {
          reading?: { briefing?: unknown; candidate?: unknown };
        };
        briefing = readingView.reading?.briefing ?? null;
      } catch {
        briefing = null;
      }
    }

    const title =
      handoff?.title ??
      active.title ??
      active.binding.scope.pageName ??
      (privacyMode !== "local-only"
        ? refreshed.snapshot.blocks[0]?.content?.split("\n")[0]?.slice(0, 160)
        : undefined) ??
      "当前工作";

    return {
      work: {
        workKey: active.workKey,
        title,
        scope: active.binding.scope,
        directory: active.binding.directory,
        organization: active.binding.organization,
        workspaceId: active.binding.workspaceId,
        ...(handoff?.workRef ? { workRef: handoff.workRef } : status.workRef ? { workRef: status.workRef } : {}),
      },
      privacy: {
        mode: privacyMode,
        remoteContentBlocked: privacyMode === "local-only",
      },
      versions: {
        structureVersion: refreshed.snapshot.structureVersion,
        sourceSetVersion: refreshed.snapshot.sourceSetVersion,
        capturedAt: refreshed.snapshot.capturedAt ?? null,
      },
      permissions: status.capabilities ?? { read: true },
      guidance,
      sources: {
        count: refreshed.snapshot.blocks.length,
        items: refreshed.snapshot.blocks.map((block) => ({
          sourceId: block.sourceId,
          blockUuid: block.target.blockUuid,
          parentUuid: block.parentUuid ?? null,
          depth: block.depth ?? 0,
          availability: block.availability,
          contentVersion: block.contentVersion ?? null,
          chars: typeof block.content === "string" ? block.content.length : 0,
        })),
      },
      materials: materials.map((item) => ({
        id: item.id,
        filename: item.filename,
        kind: item.kind,
        availability: item.availability,
        version: item.version,
        sensitiveBlocked: item.sensitiveBlocked,
        privacyBlocked: privacyMode === "local-only",
      })),
      handoff: handoff
        ? {
            handoffId: handoff.handoffId,
            target: handoff.target,
            createdAt: handoff.createdAt,
            request: handoff.intent?.request ?? null,
            sourceIds: handoff.intent?.sourceIds ?? [],
            basisVersion: handoff.intent?.basisVersion ?? null,
            ...(privacyMode === "local-only"
              ? { selectionRedacted: Boolean(handoff.intent?.selection), resultRedacted: Boolean(handoff.intent?.result) }
              : {
                  selection: handoff.intent?.selection ?? null,
                  result: handoff.intent?.result ?? null,
                }),
          }
        : null,
      ...(includeBriefing ? { briefing } : {}),
    };
  }

  if (toolName === "workbench_read_sources") {
    const args = workRecord(rawArgs, ["workKey", "rootUuid", "sourceIds", "offset", "limit", "maxChars"]);
    assertWorkScope(active, args);
    const privacyMode: ReadingPrivacyMode = await resolveWorkPrivacy(ctx.stateDirectory, active.binding, active.workKey);
    if (privacyMode === "local-only") {
      throw new WorkspaceError(
        "WORK_LOCAL_ONLY_RESTRICTED",
        "此工作已标记为「仅本地模型 / 禁止上云」，已拦截外部 MCP 原文读取。"
      );
    }
    const offset = integerArg(args.offset, 0, 0, 5_000_000);
    const limit = integerArg(args.limit, 20, 1, 30);
    const maxChars = integerArg(args.maxChars, 16_000, 256, 32_000);
    const refreshed = (await callWorkspace(ctx, active, clientId, "refresh", {})) as {
      snapshot: LiveSnapshot;
    };
    const byId = new Map(refreshed.snapshot.blocks.map((block) => [block.sourceId, block]));

    let selectedBlocks: LiveSourceBlock[];
    let singleBlockCharPaging = false;
    let nextBlockOffset: number | null = null;
    if (args.sourceIds !== undefined) {
      if (!Array.isArray(args.sourceIds) || args.sourceIds.length === 0 || args.sourceIds.length > 30) {
        throw new WorkspaceError("INVALID_INPUT", "sourceIds 必须为 1–30 个有效 sourceId。");
      }
      selectedBlocks = args.sourceIds.map((rawId) => {
        const id = workText(rawId, 4096);
        const found = byId.get(id);
        if (!found) {
          throw new WorkspaceError("SOURCE_OUTSIDE_SCOPE", `来源块 ${id} 不属于当前已绑定的单工作，已拒绝读取。`);
        }
        return found;
      });
      singleBlockCharPaging = selectedBlocks.length === 1;
      if (offset > 0 && !singleBlockCharPaging) {
        throw new WorkspaceError("INVALID_INPUT", "按字符 offset 分页仅支持单个 sourceId。");
      }
    } else {
      selectedBlocks = refreshed.snapshot.blocks.slice(offset, offset + limit);
      if (offset + selectedBlocks.length < refreshed.snapshot.blocks.length) {
        nextBlockOffset = offset + selectedBlocks.length;
      }
    }

    const perBlockLimit = singleBlockCharPaging
      ? maxChars
      : Math.max(512, Math.floor(maxChars / Math.max(1, selectedBlocks.length)));
    const blocks = selectedBlocks.map((block) => {
      const content = block.content ?? "";
      const start = singleBlockCharPaging ? offset : 0;
      const slice = content.slice(start, start + perBlockLimit);
      const hasMoreChars = start + slice.length < content.length;
      return {
        sourceId: block.sourceId,
        blockUuid: block.target.blockUuid,
        parentUuid: block.parentUuid ?? null,
        depth: block.depth ?? 0,
        availability: block.availability,
        contentVersion: block.contentVersion ?? null,
        content: slice,
        totalChars: content.length,
        ...(hasMoreChars ? { nextOffset: start + slice.length } : {}),
      };
    });

    return {
      workKey: active.workKey,
      scope: active.binding.scope,
      structureVersion: refreshed.snapshot.structureVersion,
      sourceSetVersion: refreshed.snapshot.sourceSetVersion,
      totalBlocks: refreshed.snapshot.blocks.length,
      blocks,
      ...(nextBlockOffset !== null ? { nextOffset: nextBlockOffset } : {}),
    };
  }

  if (toolName === "workbench_read_material") {
    const args = workRecord(rawArgs, ["materialId", "workKey", "rootUuid", "offset", "maxChars"]);
    assertWorkScope(active, args);
    const materialId = workText(args.materialId, 512);
    const offset = integerArg(args.offset, 0, 0, 5_000_000);
    const maxChars = integerArg(args.maxChars, 16_000, 256, 32_000);
    const privacyMode = await resolveWorkPrivacy(ctx.stateDirectory, active.binding, active.workKey);
    if (privacyMode === "local-only") {
      throw new WorkspaceError(
        "WORK_LOCAL_ONLY_RESTRICTED",
        "此工作已标记为「仅本地模型 / 禁止上云」，已拦截外部 MCP 材料正文读取。"
      );
    }

    if (materialId.startsWith("note:")) {
      const refreshed = (await callWorkspace(ctx, active, clientId, "refresh", {})) as {
        workspace?: { observed?: { sources?: AssociatedSourceItem[] } };
      };
      const notes = extractMaterialsAndNotes({ materials: [] }, refreshed);
      const found = notes.find((item) => item.id === materialId);
      if (!found) {
        throw new WorkspaceError("MATERIAL_OUTSIDE_SCOPE", "该关联笔记不在当前已绑定工作的显式关联范围内。");
      }
      const text = found.text ?? "";
      const slice = text.slice(offset, offset + maxChars);
      return {
        workKey: active.workKey,
        materialId: found.id,
        filename: found.filename,
        kind: "note",
        availability: found.availability,
        version: found.version,
        sensitiveBlocked: false,
        content: slice,
        totalChars: text.length,
        ...(offset + slice.length < text.length ? { nextOffset: offset + slice.length } : {}),
      };
    }

    let listed: UnifiedMaterialEntry[];
    try {
      const rawList = await callWorkspace(ctx, active, clientId, "materials.list", {});
      listed = extractMaterialsAndNotes(rawList, {});
    } catch {
      listed = [];
    }
    const listedMatch = listed.find((item) => item.id === materialId);
    if (listedMatch?.sensitiveBlocked) {
      throw new WorkspaceError(
        "SENSITIVE_MATERIAL_BLOCKED",
        `敏感文件（${listedMatch.filename}）正文已默认拦截，禁止通过 MCP 读取。`
      );
    }

    const material = (await callWorkspace(ctx, active, clientId, "materials.read", { id: materialId })) as RawMaterialRecord;
    const rawPath = typeof material.path === "string" ? material.path : undefined;
    const filename =
      typeof material.filename === "string" && material.filename.trim()
        ? material.filename.trim()
        : rawPath
          ? basename(rawPath)
          : material.title || material.id;
    if (isSensitiveMaterialName(filename) || (rawPath !== undefined && isSensitiveMaterialName(rawPath))) {
      throw new WorkspaceError(
        "SENSITIVE_MATERIAL_BLOCKED",
        `敏感文件（${filename}）正文已默认拦截，禁止通过 MCP 读取。`
      );
    }
    const content = typeof material.content === "string" ? material.content : null;
    if (content === null) {
      return {
        workKey: active.workKey,
        materialId: material.id,
        filename,
        kind: "file",
        availability: material.availability ?? "unavailable",
        version: material.version ?? null,
        sensitiveBlocked: false,
        content: null,
        totalChars: 0,
      };
    }
    const slice = content.slice(offset, offset + maxChars);
    return {
      workKey: active.workKey,
      materialId: material.id,
      filename,
      kind: "file",
      availability: material.availability ?? "available",
      version: material.version ?? null,
      sensitiveBlocked: false,
      content: slice,
      totalChars: content.length,
      ...(offset + slice.length < content.length ? { nextOffset: offset + slice.length } : {}),
    };
  }

  if (toolName === "workbench_submit_reading_candidate") {
    const args = workRecord(rawArgs, [
      "workKey",
      "rootUuid",
      "planId",
      "sourceSetVersion",
      "structureVersion",
      "summary",
      "paragraphs",
    ]);
    assertWorkScope(active, args);
    const sourceSetVersion = workText(args.sourceSetVersion, 128);
    const structureVersion = workText(args.structureVersion, 128);
    const planId = args.planId !== undefined ? workText(args.planId, 128) : undefined;
    const summary = args.summary !== undefined ? workText(args.summary, 400) : undefined;
    if (!Array.isArray(args.paragraphs) || !args.paragraphs.length) {
      throw new WorkspaceError("READING_MODEL_OUTPUT", "paragraphs 必须为非空数组。");
    }
    collectParagraphKeys(args.paragraphs);

    const refreshed = (await callWorkspace(ctx, active, clientId, "refresh", {})) as {
      snapshot: LiveSnapshot;
      workspace?: { observed?: { sources?: AssociatedSourceItem[] } };
    };
    const live = refreshed.snapshot;
    if (live.sourceSetVersion !== sourceSetVersion || live.structureVersion !== structureVersion) {
      throw new WorkspaceError(
        "STALE_SOURCE_VERSION",
        "原文版本已变化，旧版本候选修订已被拒绝。请重新读取最新来源版本后再提交。"
      );
    }

    let rawMaterials: unknown;
    try {
      rawMaterials = await callWorkspace(ctx, active, clientId, "materials.list", {});
    } catch {
      rawMaterials = { materials: [] };
    }
    const unified = extractMaterialsAndNotes(rawMaterials, refreshed);
    const sensitiveIds = new Set(unified.filter((item) => item.sensitiveBlocked).map((item) => item.id));
    // Hydrate text for any non-sensitive file material cited with materialQuotes if materials.list omitted content
    const quotedMaterialIds = new Set<string>();
    for (const rawParagraph of args.paragraphs) {
      const p = rawParagraph as { details?: Array<{ materialQuotes?: Array<{ materialId?: unknown }> }> };
      for (const d of Array.isArray(p.details) ? p.details : []) {
        for (const q of Array.isArray(d.materialQuotes) ? d.materialQuotes : []) {
          if (typeof q?.materialId === "string" && !sensitiveIds.has(q.materialId)) {
            quotedMaterialIds.add(q.materialId);
          }
        }
      }
    }
    for (const item of unified) {
      if (item.kind === "file" && !item.sensitiveBlocked && !item.text && quotedMaterialIds.has(item.id)) {
        try {
          const full = (await callWorkspace(ctx, active, clientId, "materials.read", { id: item.id })) as RawMaterialRecord;
          if (typeof full.content === "string") item.text = full.content;
        } catch {
          // Leave text empty; readingTask will reject invalid quotes.
        }
      }
    }
    const readingMaterials: ReadingMaterialInput[] = unified.map((item) => ({
      id: item.id,
      filename: item.filename,
      ...(item.path ? { path: item.path } : {}),
      ...(item.version ? { version: item.version } : {}),
      availability: item.availability,
      ...(item.kind === "note" ? { note: true } : {}),
      ...(item.text && !item.sensitiveBlocked
        ? { excerpt: item.text.slice(0, 4000), text: item.text.slice(0, 64000), truncated: item.text.length > 64000 }
        : {}),
    }));
    const filtered = filterReadingMaterialsForLocality(readingMaterials, "remote");
    const taskInput: ReadingModelInput = {
      mode: "organize",
      question: summary ?? "外部协作代理提交候选阅读修订",
      source: {
        scope: live.scope,
        structureVersion: live.structureVersion,
        sourceSetVersion: live.sourceSetVersion,
        blocks: live.blocks.map((block) => ({
          sourceId: block.sourceId,
          target: block.target,
          ...(block.parentUuid !== undefined ? { parentUuid: block.parentUuid } : {}),
          ...(block.depth !== undefined ? { depth: block.depth } : {}),
          availability: block.availability,
          ...(typeof block.content === "string" ? { content: block.content } : {}),
        })),
      },
      materials: filtered.materials,
    };
    const task = readingTask(taskInput);
    const sourceToAlias = new Map([...task.sourceIds].map(([alias, id]) => [id, alias]));
    const materialToAlias = new Map([...task.materialIds].map(([alias, id]) => [id, alias]));

    const mapId = (id: unknown, lookup: Map<string, string>) =>
      typeof id === "string" ? (lookup.get(id) ?? id) : id;

    const normalizedParagraphs = args.paragraphs.map((rawParagraph) => {
      const p = rawParagraph as Record<string, unknown>;
      const details = Array.isArray(p.details)
        ? p.details.map((rawDetail) => {
            const d = rawDetail as Record<string, unknown>;
            if (Array.isArray(d.materialIds)) {
              for (const mid of d.materialIds) {
                if (typeof mid === "string" && sensitiveIds.has(mid)) {
                  throw new WorkspaceError("SENSITIVE_MATERIAL_BLOCKED", "候选修订禁止引用敏感拦截文件。");
                }
              }
            }
            return {
              ...d,
              sourceIds: Array.isArray(d.sourceIds) ? d.sourceIds.map((id) => mapId(id, sourceToAlias)) : d.sourceIds,
              ...(Array.isArray(d.materialIds)
                ? { materialIds: d.materialIds.map((id) => mapId(id, materialToAlias)) }
                : {}),
              ...(Array.isArray(d.materialQuotes)
                ? {
                    materialQuotes: d.materialQuotes.map((rawQuote) => {
                      const q = rawQuote as Record<string, unknown>;
                      if (typeof q.materialId === "string" && sensitiveIds.has(q.materialId)) {
                        throw new WorkspaceError("SENSITIVE_MATERIAL_BLOCKED", "候选修订禁止摘录敏感拦截文件。");
                      }
                      return { ...q, materialId: mapId(q.materialId, materialToAlias) };
                    }),
                  }
                : {}),
            };
          })
        : undefined;
      return {
        ...p,
        sourceIds: Array.isArray(p.sourceIds) ? p.sourceIds.map((id) => mapId(id, sourceToAlias)) : p.sourceIds,
        ...(details ? { details } : {}),
      };
    });

    const validated = task.output({ paragraphs: normalizedParagraphs }) as ReadingOrganizeOutput;
    const citedSources = [
      ...new Set(
        validated.paragraphs.flatMap((paragraph) => [
          ...paragraph.sourceIds,
          ...(paragraph.details?.flatMap((detail) => detail.sourceIds) ?? []),
        ])
      ),
    ];
    const citedMaterials = [
      ...new Set(validated.paragraphs.flatMap((paragraph) => paragraph.details?.flatMap((detail) => detail.materialIds ?? []) ?? [])),
    ];

    const staged = await ctx.readingHub.stageExternalCandidate({
      workKey: active.workKey,
      ...(planId ? { planId } : {}),
      sourceSetVersion: live.sourceSetVersion,
      structureVersion: live.structureVersion,
      paragraphs: validated.paragraphs,
      providerId: `mcp:${clientId}`,
      ...(summary ? { summary } : {}),
      sourceIds: citedSources,
      materialIds: citedMaterials,
      redactedMaterials: filtered.redactedMaterials,
    });

    return {
      staged: true,
      jobId: staged.jobId,
      workKey: staged.workKey,
      status: "pending-adoption",
      writesSource: false,
      sourceSetVersion: staged.sourceSetVersion,
      structureVersion: staged.structureVersion,
      paragraphCount: validated.paragraphs.length,
      message: "候选修订已暂存至 Companion；回到 Logseq 该工作时将出现「待采用修订」由用户审阅采用，未静默覆盖当前文章或原块。",
    };
  }

  if (toolName === "workbench_propose_writeback") {
    const args = workRecord(rawArgs, [
      "kind",
      "workKey",
      "rootUuid",
      "requestId",
      "summary",
      "sourceIds",
      "labels",
      "sourceSetVersion",
      "structureVersion",
      "structuralChanges",
      "operations",
      "patch",
      "stageId",
      "expectedRevision",
      "correctionOf",
      "capture",
    ]);
    assertWorkScope(active, args);
    const kind = workText(args.kind, 64);
    const proposalRequestId = args.requestId !== undefined ? workText(args.requestId, 128) : requestId;

    if (kind === "formatting-preview") {
      if (!Array.isArray(args.sourceIds) || !args.sourceIds.length || args.sourceIds.length > 128) {
        throw new WorkspaceError("FORMAT_SELECTION_REQUIRED", "formatting-preview 需要 1–128 个 sourceIds。");
      }
      const payload: Record<string, unknown> = {
        requestId: proposalRequestId,
        sourceIds: args.sourceIds.map((id) => workText(id, 4096)),
        ...(args.labels !== undefined ? { labels: args.labels } : {}),
      };
      const proposal = await callWorkspace(ctx, active, clientId, "formatting.preview", payload, proposalRequestId);
      return {
        kind: "formatting-preview",
        status: "pending-review",
        writesSource: false,
        proposal,
      };
    }

    if (kind === "content-proposal") {
      const sourceSetVersion = workText(args.sourceSetVersion, 128);
      const structureVersion = workText(args.structureVersion, 128);
      const summary = args.summary !== undefined ? workText(args.summary, 400) : "外部协作写回提案（待用户审阅）";
      if (!Array.isArray(args.operations) || args.operations.length === 0 || args.operations.length > 32) {
        throw new WorkspaceError("INVALID_INPUT", "content-proposal 需要 1–32 条 operations。");
      }
      const refreshed = (await callWorkspace(ctx, active, clientId, "refresh", {})) as { snapshot: LiveSnapshot };
      const live = refreshed.snapshot;
      if (live.sourceSetVersion !== sourceSetVersion || live.structureVersion !== structureVersion) {
        throw new WorkspaceError("STALE_SOURCE_VERSION", "原文版本已变化，请重新读取后再提交写回提案。");
      }
      const byId = new Map(live.blocks.map((block) => [block.sourceId, block]));
      const validatedOps: StagedWritebackProposal["operations"] = args.operations.map((rawOp) => {
        const op = workRecord(rawOp, ["operationId", "type", "sourceId", "expectedContentVersion", "text", "range"]);
        const operationId = workText(op.operationId, 128);
        const type = workText(op.type, 32);
        if (type !== "replace-text" && type !== "insert-text" && type !== "insert-child") {
          throw new WorkspaceError("INVALID_INPUT", "不支持的写回提案操作类型。");
        }
        const sourceId = workText(op.sourceId, 4096);
        const expectedContentVersion = workText(op.expectedContentVersion, 128);
        if (typeof op.text !== "string" || op.text.includes("\0") || op.text.length > 16_000) {
          throw new WorkspaceError("INVALID_INPUT", "提案文本无效或超过长度限制。");
        }
        const block = byId.get(sourceId);
        if (!block || block.availability !== "available" || typeof block.content !== "string") {
          throw new WorkspaceError("SOURCE_OUTSIDE_SCOPE", `来源块 ${sourceId} 不属于当前已绑定工作或暂不可读。`);
        }
        if (block.contentVersion !== expectedContentVersion) {
          throw new WorkspaceError("STALE_CONTENT_VERSION", `原块 ${sourceId} 内容版本已变化，请重新读取。`);
        }
        if (isProtectedContent(block.content) || isProtectedContent(op.text)) {
          throw new WorkspaceError(
            "PROTECTED_TARGET_FORBIDDEN",
            "写回提案禁止修改或注入 TODO、正式任务标记或块属性行。"
          );
        }
        let range: { start: number; end: number } | undefined;
        if (op.range !== undefined) {
          const r = workRecord(op.range, ["start", "end"]);
          const start = integerArg(r.start, 0, 0, block.content.length);
          const end = integerArg(r.end, block.content.length, start, block.content.length);
          range = { start, end };
        }
        return {
          operationId,
          type,
          sourceId,
          blockUuid: block.target.blockUuid,
          expectedContentVersion,
          beforeText: block.content,
          proposedText: op.text,
          ...(range ? { range } : {}),
        };
      });

      const tidyBlocks: NoteTidySourceBlock[] = live.blocks
        .filter((b) => b.availability === "available" && typeof b.content === "string" && typeof b.contentVersion === "string")
        .map((b) => ({
          sourceId: b.sourceId,
          blockUuid: b.target.blockUuid,
          parentUuid: b.parentUuid ?? null,
          depth: b.depth ?? 0,
          content: b.content!,
          contentVersion: b.contentVersion!,
        }));
      const tidyOps: NoteTidyOperation[] = validatedOps.map((op) => {
        if (op.type === "insert-child") {
          return {
            operationId: op.operationId,
            type: "insert-child",
            parentSourceId: op.sourceId,
            parentBlockUuid: op.blockUuid,
            expectedParentContentVersion: op.expectedContentVersion,
            afterText: op.proposedText,
          };
        }
        const afterText =
          op.type === "insert-text" && op.range
            ? op.beforeText.slice(0, op.range.start) + op.proposedText + op.beforeText.slice(op.range.start)
            : op.type === "replace-text" && op.range
              ? op.beforeText.slice(0, op.range.start) + op.proposedText + op.beforeText.slice(op.range.end)
              : op.proposedText;
        return {
          operationId: op.operationId,
          type: "replace-text",
          sourceId: op.sourceId,
          blockUuid: op.blockUuid,
          expectedContentVersion: op.expectedContentVersion,
          beforeText: op.beforeText,
          afterText,
          ...(op.range ? { range: op.range } : {}),
        };
      });
      const structuralChanges: NoteTidyStructuralChange[] = [];
      if (Array.isArray(args.structuralChanges)) {
        for (const item of args.structuralChanges) {
          const rec = workRecord(item, ["kind", "description", "sourceIds"]);
          const k = workText(rec.kind, 32);
          if (k !== "group" && k !== "reorder" && k !== "merge" && k !== "insert") {
            throw new WorkspaceError("INVALID_INPUT", "无效的 structuralChanges.kind。");
          }
          structuralChanges.push({
            kind: k,
            description: workText(rec.description, 240),
            sourceIds: Array.isArray(rec.sourceIds) ? rec.sourceIds.map((id) => workText(id, 4096)) : [],
          });
        }
      }
      const plan = buildNoteTidyPlanFromOperations({
        sourceSetVersion: live.sourceSetVersion,
        structureVersion: live.structureVersion,
        summary,
        blocks: tidyBlocks,
        operations: tidyOps,
        structuralChanges,
        origin: "external-mcp",
        providerId: `mcp:${clientId}`,
        proposalId: proposalRequestId,
      });

      const staged = await addWritebackProposal(ctx.stateDirectory, {
        proposalId: proposalRequestId,
        workKey: active.workKey,
        scope: active.binding.scope,
        sourceSetVersion: live.sourceSetVersion,
        structureVersion: live.structureVersion,
        clientId,
        createdAt: new Date().toISOString(),
        summary,
        writesSource: false,
        status: "pending-review",
        operations: validatedOps,
        plan,
      });

      return {
        kind: "content-proposal",
        status: "pending-review",
        writesSource: false,
        proposal: staged,
        message: "写回提案已暂存待审，未改写任何 Logseq 原块、TODO 或正式任务状态。",
      };
    }

    if (kind === "authorized-content-patch" || kind === "stage-submit") {
      const status = (await callWorkspace(ctx, active, clientId, "status", {})) as {
        capabilities?: { content?: boolean; stage?: boolean };
      };
      if (status.capabilities?.content !== true) {
        throw new WorkspaceError(
          "CONTENT_WRITE_AUTHORIZATION_REQUIRED",
          "当前连接未获正文维护授权，绝不静默改写原块。请改用 formatting-preview / content-proposal，或在 Logseq 显式授权正文维护。"
        );
      }
      if (!args.patch || typeof args.patch !== "object" || Array.isArray(args.patch)) {
        throw new WorkspaceError("INVALID_INPUT", "缺少受控 patch 对象。");
      }
      const patchObj = args.patch as { scope?: AgentWorkBinding["scope"] };
      if (patchObj.scope && !sameWorkScope(patchObj.scope, active.binding.scope)) {
        throw new WorkspaceError("SCOPE_MISMATCH", "patch 范围与当前已绑定工作不一致。");
      }
      if (kind === "stage-submit") {
        const input = {
          stageId: workText(args.stageId, 128),
          expectedRevision: workText(args.expectedRevision, 128),
          patch: args.patch,
          ...(args.correctionOf !== undefined ? { correctionOf: args.correctionOf } : {}),
        };
        const result = await callWorkspace(ctx, active, clientId, "stage.submit", { input }, proposalRequestId);
        return { kind: "stage-submit", result };
      }
      const result = await callWorkspace(ctx, active, clientId, "content.apply", { patch: args.patch }, proposalRequestId);
      return { kind: "authorized-content-patch", result };
    }

    if (kind === "authorized-material-capture") {
      const status = (await callWorkspace(ctx, active, clientId, "status", {})) as {
        capabilities?: { fileWrite?: boolean };
      };
      if (status.capabilities?.fileWrite !== true) {
        throw new WorkspaceError(
          "FILE_WRITE_AUTHORIZATION_REQUIRED",
          "当前连接未获工作文件写入授权；请在 Logseq 显式允许写工作文件后再试。"
        );
      }
      const capture = workRecord(args.capture, ["requestKey", "text", "html", "title", "role"]);
      if (typeof capture.title === "string" && isSensitiveMaterialName(capture.title)) {
        throw new WorkspaceError("SENSITIVE_MATERIAL_BLOCKED", "禁止写入敏感凭据文件名。");
      }
      const result = await callWorkspace(ctx, active, clientId, "materials.capture", capture, proposalRequestId);
      return { kind: "authorized-material-capture", result };
    }

    throw new WorkspaceError(
      "WRITEBACK_KIND_FORBIDDEN",
      `不支持或禁止的写回通道：${kind}。MCP 绝不允许静默修改原块、TODO 或正式任务状态。`
    );
  }

  throw new WorkspaceError("UNKNOWN_MCP_TOOL", `未知的 MCP 工具：${toolName}`);
}
