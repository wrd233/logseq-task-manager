import { WorkspaceError } from "@task-copilot/contracts";
import {
  isProfileConfigured,
  type ReadingBudgetConfig,
  type ReadingPrivacyMode,
  type ReadingProviderProfile,
  type ReadingRole,
  type ReadingRuntimeConfig,
  type ReadingTrigger,
} from "./config.ts";
import { filterReadingMaterialsForLocality, isLoopbackUrl } from "./privacy.ts";
import { callProviderTurn, type ChatMessage, type FetchLike, type ToolDefinition } from "./providers.ts";
import {
  isShortReadingInput,
  readingInstructions,
  readingTask,
  readingToolSchemas,
  type ReadingModelInput,
  type ReadingModelOutput,
  type ReadingTask,
} from "./task.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export class BackgroundBudgetTracker {
  private timestamps: number[] = [];

  constructor(initialTimestamps: number[] = []) {
    this.timestamps = initialTimestamps.filter((value) => Number.isFinite(value));
  }

  private prune(now: number): void {
    const cutoff = now - DAY_MS;
    if (this.timestamps.length && this.timestamps[0]! < cutoff) {
      this.timestamps = this.timestamps.filter((value) => value >= cutoff);
    }
  }

  usage(now = Date.now()): { lastHour: number; lastDay: number; timestamps: number[] } {
    this.prune(now);
    const hourCutoff = now - HOUR_MS;
    let lastHour = 0;
    for (const stamp of this.timestamps) {
      if (stamp >= hourCutoff) lastHour++;
    }
    return { lastHour, lastDay: this.timestamps.length, timestamps: [...this.timestamps] };
  }

  canRun(budget: ReadingBudgetConfig, now = Date.now()): boolean {
    const current = this.usage(now);
    return current.lastHour < budget.backgroundMaxPerHour && current.lastDay < budget.backgroundMaxPerDay;
  }

  record(now = Date.now()): void {
    this.prune(now);
    this.timestamps.push(now);
  }
}

export interface ReadingRunOptions {
  input: ReadingModelInput;
  config: ReadingRuntimeConfig;
  env?: Record<string, string | undefined>;
  trigger?: ReadingTrigger;
  privacyMode?: ReadingPrivacyMode;
  role?: ReadingRole;
  profileId?: string;
  signal?: AbortSignal;
  budget?: BackgroundBudgetTracker;
  now?: () => number;
  fetchImpl?: FetchLike;
  dshAvailable?: boolean;
  dshFallback?: (input: ReadingModelInput, signal: AbortSignal) => Promise<unknown>;
}

export interface ReadingRunMetadata {
  providerId: string;
  model: string | null;
  locality: "remote" | "local";
  path: "fast" | "agent" | "dsh";
  steps: number;
  toolResults: number;
  sourceIds: string[];
  materialIds: string[];
  redactedMaterials: string[];
}

export type ReadingRunResult = ReadingModelOutput & {
  agentRun: ReadingRunMetadata;
};

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return fenced ? fenced[1]!.trim() : trimmed;
}

function selectRole(input: ReadingModelInput, trigger: ReadingTrigger, privacyMode: ReadingPrivacyMode, explicitRole?: ReadingRole): ReadingRole {
  if (privacyMode === "local-only") return "local";
  if (explicitRole) return explicitRole;
  if (trigger === "background" || input.mode === "rewrite" || isShortReadingInput(input)) return "fast";
  return "deep";
}

export function resolveSelectedProfile(
  config: ReadingRuntimeConfig,
  options: {
    input: ReadingModelInput;
    trigger: ReadingTrigger;
    privacyMode: ReadingPrivacyMode;
    role?: ReadingRole;
    profileId?: string;
  }
): { profileId: string; profile: ReadingProviderProfile; role: ReadingRole } {
  const role = selectRole(options.input, options.trigger, options.privacyMode, options.role);
  const chosenId =
    options.privacyMode === "local-only"
      ? config.routes.local
      : options.profileId ?? config.routes[role] ?? config.routes.fast ?? config.routes.deep;

  if (options.privacyMode === "local-only") {
    if (!chosenId || !Object.hasOwn(config.profiles, chosenId)) {
      throw new WorkspaceError("READING_LOCAL_MODEL_REQUIRED", "此工作已标记为仅本地模型，请先配置本地模型 Profile（如 Ollama）。");
    }
    const localProfile = config.profiles[chosenId]!;
    if (localProfile.locality !== "local" || localProfile.kind === "dsh" || !localProfile.baseUrl || !isLoopbackUrl(localProfile.baseUrl)) {
      throw new WorkspaceError("READING_LOCAL_MODEL_REQUIRED", "本地隐私模式只允许使用本机回环地址（127.0.0.1 / localhost）的本地模型 Profile。");
    }
    return { profileId: chosenId, profile: localProfile, role: "local" };
  }

  if (!chosenId || !Object.hasOwn(config.profiles, chosenId)) {
    throw new WorkspaceError("READING_MODEL_NOT_CONFIGURED", "尚未配置可用的阅读模型 Profile。");
  }
  return { profileId: chosenId, profile: config.profiles[chosenId]!, role };
}

async function runFastPath(
  task: ReadingTask,
  profileId: string,
  profile: ReadingProviderProfile,
  env: Record<string, string | undefined>,
  redactedMaterials: string[],
  signal: AbortSignal,
  fetchImpl: FetchLike
): Promise<ReadingRunResult> {
  const packet = task.packet;
  const rewrite = packet.mode === "rewrite" && Boolean(packet.selection?.sourceIds?.length);
  const materials = rewrite
    ? []
    : packet.materials.map((material) => {
        const { text: _text, ...summary } = material;
        void _text;
        return summary;
      });
  const payloadText = JSON.stringify({
    ...packet,
    blocks: rewrite ? packet.blocks.filter((block) => packet.selection!.sourceIds.includes(block.id)) : packet.blocks,
    materials,
  });
  if (payloadText.length > 100_000) throw new WorkspaceError("READING_MODEL_CONTEXT_LIMIT");

  const result = await callProviderTurn(
    profile,
    env,
    {
      system: `${readingInstructions}\n不要使用工具。只输出 JSON，不要代码围栏。`,
      messages: [{ role: "user", content: payloadText }],
      maxTokens: profile.maxTokens ?? 8192,
      signal,
    },
    fetchImpl
  );

  if (result.finishReason === "length") throw new WorkspaceError("READING_MODEL_INCOMPLETE");
  if (result.finishReason === "error") throw new WorkspaceError("READING_MODEL_PROVIDER_FAILED");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(result.text));
  } catch {
    throw new WorkspaceError("READING_MODEL_OUTPUT");
  }
  const validated = task.output(parsed);
  return {
    ...validated,
    agentRun: {
      providerId: profileId,
      model: profile.model ?? null,
      locality: profile.locality,
      path: "fast",
      steps: 1,
      toolResults: 0,
      sourceIds: [...task.sourceIds.values()],
      materialIds: [],
      redactedMaterials,
    },
  };
}

function asArgsObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Tool arguments must be valid JSON object.");
  }
}

async function runScopedToolLoop(
  task: ReadingTask,
  profileId: string,
  profile: ReadingProviderProfile,
  env: Record<string, string | undefined>,
  redactedMaterials: string[],
  maxSteps: number,
  signal: AbortSignal,
  fetchImpl: FetchLike
): Promise<ReadingRunResult> {
  const packet = task.packet;
  const blocks = new Map(packet.blocks.map((block) => [block.id, block]));
  const materials = new Map(packet.materials.map((material) => [material.id, material]));
  const readBlocks = new Set<string>();
  const readMaterials = new Set<string>();
  let captured: ReadingModelOutput | null = null;
  let toolResults = 0;

  const tools: ToolDefinition[] = [
    {
      name: "logseq_reading_request",
      description:
        "Inspect the current saved work, versions, source and associated material index, and previous article if any. Paginate the source index.",
      parameters: readingToolSchemas.request,
    },
    {
      name: "logseq_source_read",
      description:
        "Read exact stored Logseq blocks by the s identifiers from the work index. Up to 30 per call. For a long single block use offset.",
      parameters: readingToolSchemas.sourceRead,
    },
    {
      name: "logseq_file_read",
      description:
        "Read a linked material or explicitly associated Logseq note by the m identifier, not by arbitrary path. Return actual stored text; paginate via nextOffset.",
      parameters: readingToolSchemas.fileRead,
    },
    {
      name: "logseq_reading_submit",
      description:
        "Return the completed article or answer with actual references. Does not modify the work or select the article.",
      parameters: packet.mode === "organize" ? readingToolSchemas.submitOrganize : readingToolSchemas.submitAnswer,
    },
  ];

  const executeTool = (name: string, rawArgs: string): { result: unknown; isError?: boolean } => {
    if (captured) return { result: { error: "Reading result already submitted." }, isError: true };
    try {
      const args = asArgsObject(rawArgs);
      if (name === "logseq_reading_request") {
        const offset = typeof args.offset === "number" && Number.isInteger(args.offset) && args.offset >= 0 ? args.offset : 0;
        const rows = packet.blocks.slice(offset, offset + 100);
        return {
          result: {
            work: task.scopeName ?? "当前工作",
            structureVersion: task.structureVersion,
            sourceSetVersion: task.sourceVersion,
            total: packet.blocks.length,
            ...(offset + rows.length < packet.blocks.length ? { nextOffset: offset + rows.length } : {}),
            sources: rows.map(({ id, parent, depth, text }) => ({ id, parent, depth, preview: text?.slice(0, 160) })),
            ...(offset === 0
              ? {
                  materials: packet.materials.map(({ id, filename, version, kind, text, excerpt, sensitiveRedacted }) => ({
                    id,
                    filename,
                    version,
                    kind,
                    length: (text ?? excerpt ?? "").length,
                    ...(sensitiveRedacted ? { sensitiveRedacted: true } : {}),
                  })),
                  previous: packet.previous,
                  changes: packet.changes,
                }
              : {}),
          },
        };
      }

      if (name === "logseq_source_read") {
        const ids = Array.isArray(args.sourceIds) ? args.sourceIds.filter((id): id is string => typeof id === "string") : [];
        const offset = typeof args.offset === "number" && Number.isInteger(args.offset) && args.offset >= 0 ? args.offset : 0;
        if (!ids.length || ids.length > 30 || (offset > 0 && ids.length !== 1)) {
          throw new Error("Choose 1–30 source IDs, offset only for a single source.");
        }
        const loaded = ids.map((id) => {
          const block = blocks.get(id);
          if (!block) throw new Error("Source not in this reading invitation.");
          const text = block.text ?? "";
          const limit = ids.length === 1 ? 16000 : Math.max(1500, Math.floor(36000 / ids.length));
          return {
            id,
            parent: block.parent,
            depth: block.depth,
            text: text.slice(offset, offset + limit),
            ...(offset + limit < text.length ? { nextOffset: offset + limit } : {}),
          };
        });
        for (const id of ids) readBlocks.add(id);
        return { result: loaded };
      }

      if (name === "logseq_file_read") {
        const materialId = typeof args.materialId === "string" ? args.materialId : "";
        const material = materials.get(materialId);
        if (!material) throw new Error("Material is not in the reading invitation.");
        if (material.sensitiveRedacted) {
          return {
            result: {
              id: material.id,
              filename: material.filename,
              kind: material.kind,
              version: material.version,
              unavailable: "Sensitive file content is blocked from remote model providers; do not infer its contents.",
            },
          };
        }
        const offset = typeof args.offset === "number" && Number.isInteger(args.offset) && args.offset >= 0 ? args.offset : 0;
        const text = material.text ?? material.excerpt;
        readMaterials.add(materialId);
        return {
          result: {
            id: material.id,
            filename: material.filename,
            kind: material.kind,
            version: material.version,
            truncated: material.truncated,
            ...(typeof text === "string"
              ? {
                  text: text.slice(offset, offset + 16000),
                  ...(offset + 16000 < text.length ? { nextOffset: offset + 16000 } : {}),
                }
              : { unavailable: "No text is available; do not infer the contents." }),
          },
        };
      }

      if (name === "logseq_reading_submit") {
        const refsCheckUnits: Array<{ sourceIds?: unknown; materialIds?: unknown }> =
          packet.mode === "organize"
            ? [
                ...(Array.isArray(args.paragraphs) ? args.paragraphs : []),
                ...(Array.isArray(args.followUps) ? args.followUps : []),
              ].flatMap((unit) => {
                if (!unit || typeof unit !== "object") return [];
                const record = unit as { sourceIds?: unknown; materialIds?: unknown; details?: unknown };
                const details = Array.isArray(record.details)
                  ? record.details.filter((item): item is { sourceIds?: unknown; materialIds?: unknown } => Boolean(item && typeof item === "object"))
                  : [];
                return [record, ...details];
              })
            : [args as { sourceIds?: unknown; materialIds?: unknown }];

        const unreadCitation =
          !readBlocks.size ||
          refsCheckUnits.some((unit) => {
            const sIds = Array.isArray(unit.sourceIds) ? unit.sourceIds : [];
            const mIds = Array.isArray(unit.materialIds) ? unit.materialIds : [];
            return (
              sIds.some((id) => typeof id !== "string" || !readBlocks.has(id)) ||
              mIds.some((id) => typeof id !== "string" || !readMaterials.has(id))
            );
          });
        if (unreadCitation) {
          throw new Error("Read the exact cited sources and materials with the reading tools before submitting.");
        }
        captured = task.output(args);
        return { result: { submitted: true } };
      }

      return { result: { error: "Only scoped reading tools are available for this job." }, isError: true };
    } catch (error) {
      return {
        result: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  };

  const system = `${readingInstructions}
这是独立后台阅读任务，仅有以下受限工具：先调用 logseq_reading_request 查看实际工作及索引；用 logseq_source_read 读取所引的保存原文（可批量），用 logseq_file_read 按需查阅关联文件和笔记。依据任务需要查证，不凭索引摘要想象内容。有 previous 时核对 changes，按请求区分局部更新与重新整理，尽量保留仍适用的语义键。最终调用 logseq_reading_submit 一次提交阅读成果，工具成功即结束任务，不再聊天。所引用的每个 s/m 编号须经过对应读取工具。没有写作或其他工具权限。`;

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: JSON.stringify({
        mode: packet.mode,
        question: packet.question,
        ...(packet.selection ? { selection: packet.selection } : {}),
      }),
    },
  ];

  let steps = 0;
  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted) throw new WorkspaceError("READING_MODEL_INTERRUPTED");
    steps++;
    const turn = await callProviderTurn(
      profile,
      env,
      {
        system,
        messages,
        tools,
        maxTokens: profile.maxTokens ?? 8192,
        signal,
      },
      fetchImpl
    );

    if (turn.toolCalls.length > 0) {
      messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        const executed = executeTool(call.name, call.argumentsText);
        if (!executed.isError) toolResults++;
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(executed.result),
          ...(executed.isError ? { isError: true } : {}),
        });
      }
      const submitted = captured as ReadingModelOutput | null;
      if (submitted) {
        return {
          ...submitted,
          agentRun: {
            providerId: profileId,
            model: profile.model ?? null,
            locality: profile.locality,
            path: "agent",
            steps,
            toolResults,
            sourceIds: [...readBlocks].map((id) => task.sourceIds.get(id)!).filter(Boolean),
            materialIds: [...readMaterials].map((id) => task.materialIds.get(id)!).filter(Boolean),
            redactedMaterials,
          },
        };
      }
      continue;
    }

    // Model stopped without calling a tool: nudge once if we still have steps left.
    messages.push({ role: "assistant", content: turn.text });
    if (step + 1 < maxSteps) {
      messages.push({
        role: "user",
        content: "请先使用读取工具核实原文，再调用 logseq_reading_submit 提交最终结构化结果。",
      });
    }
  }

  if (signal.aborted) throw new WorkspaceError("READING_MODEL_INTERRUPTED");
  throw new WorkspaceError("READING_AGENT_INCOMPLETE");
}

export async function runReadingTask(options: ReadingRunOptions): Promise<ReadingRunResult> {
  const env = options.env ?? process.env;
  const trigger: ReadingTrigger = options.trigger ?? "manual";
  const privacyMode: ReadingPrivacyMode = options.privacyMode ?? "default";
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  const dshAvailable = options.dshAvailable ?? false;

  const { profileId, profile } = resolveSelectedProfile(options.config, {
    input: options.input,
    trigger,
    privacyMode,
    ...(options.role ? { role: options.role } : {}),
    ...(options.profileId ? { profileId: options.profileId } : {}),
  });

  const status = isProfileConfigured(profile, env, dshAvailable);
  if (!status.configured) {
    if (profile.kind === "dsh") {
      throw new WorkspaceError("DSH_NOT_RUNNING", "当前阅读路由指向 DSH，请启动 DSH 或切换到直连模型 Profile。");
    }
    if (privacyMode === "local-only") {
      throw new WorkspaceError("READING_LOCAL_MODEL_REQUIRED", "本地模型 Profile 未就绪，请检查本地模型地址与名称。");
    }
    throw new WorkspaceError("READING_MODEL_NOT_CONFIGURED", "尚未配置可用模型 API Key，请配置 DEEPSEEK_API_KEY 或工作台 providers.json。");
  }

  if (trigger === "background" && options.budget) {
    if (!options.budget.canRun(options.config.budget, now())) {
      throw new WorkspaceError(
        "READING_BACKGROUND_BUDGET_PAUSED",
        "后台自动修订已达当前配额上限，暂不自动触发；你仍可手动点击更新文章或提问。"
      );
    }
  }

  const filtered = filterReadingMaterialsForLocality(options.input.materials, profile.locality);
  const filteredInput: ReadingModelInput = {
    ...options.input,
    materials: filtered.materials,
  };

  const timeoutSignal = AbortSignal.timeout(options.config.budget.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  if (trigger === "background" && options.budget) {
    options.budget.record(now());
  }

  if (profile.kind === "dsh") {
    if (!options.dshFallback) {
      throw new WorkspaceError("DSH_NOT_RUNNING", "DSH 阅读通道不可用。");
    }
    const raw = (await options.dshFallback(filteredInput, signal)) as ReadingModelOutput;
    return {
      ...raw,
      agentRun: {
        providerId: profileId,
        model: null,
        locality: "remote",
        path: "dsh",
        steps: 1,
        toolResults: 0,
        sourceIds: [],
        materialIds: [],
        redactedMaterials: filtered.redactedMaterials,
      },
    };
  }

  const task = readingTask(filteredInput);
  const useFast = filteredInput.mode === "rewrite" || isShortReadingInput(filteredInput);
  try {
    if (useFast) {
      return await runFastPath(task, profileId, profile, env, filtered.redactedMaterials, signal, fetchImpl);
    }
    return await runScopedToolLoop(
      task,
      profileId,
      profile,
      env,
      filtered.redactedMaterials,
      options.config.budget.maxStepsPerRun,
      signal,
      fetchImpl
    );
  } catch (error) {
    if (options.signal?.aborted || timeoutSignal.aborted) {
      throw new WorkspaceError("READING_MODEL_INTERRUPTED");
    }
    throw error;
  }
}
