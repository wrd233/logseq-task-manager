import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  WorkspaceError,
  parseWorkBinding,
  parseWorkRef,
  sameWorkScope,
  workRecord,
  workText,
  type AgentWorkBinding,
  type AgentWorkScope,
  type WorkRef,
} from "@task-copilot/contracts";
import type { NoteTidyPlan, ReadingPrivacyMode } from "@task-copilot/reading-runtime";
import { createDshHandoff, dshReadingIntent, type DshMode, type DshReadingIntent } from "./dsh-handoff.ts";
import { atomicJson } from "./workspace-files.ts";

export const COLLABORATE_TARGET_IDS = ["dsh", "codex", "antigravity", "claude-code", "clipboard"] as const;
export type CollaborateTargetId = (typeof COLLABORATE_TARGET_IDS)[number];

export interface CollaborateTargetDescriptor {
  id: CollaborateTargetId;
  label: string;
  buttonLabel: string;
  transport: "dsh-ticket" | "mcp-handoff" | "clipboard-handoff";
  available: boolean;
  description: string;
}

export interface CollaborateConfig {
  schemaVersion: 1;
  defaultTarget: CollaborateTargetId;
}

export interface CollaborateTargetsSnapshot {
  defaultTarget: CollaborateTargetId;
  dshAvailable: boolean;
  configPath: string;
  targets: CollaborateTargetDescriptor[];
}

export interface CollaborationHandoffRecord {
  schemaVersion: 1;
  handoffId: string;
  createdAt: number;
  target: CollaborateTargetId;
  mode: DshMode;
  title: string;
  workKey: string;
  connectionId: string;
  instanceId: string;
  binding: AgentWorkBinding;
  workRef?: WorkRef;
  privacyMode: ReadingPrivacyMode;
  intent?: DshReadingIntent;
}

export interface CollaborateHandoffResult {
  target: CollaborateTargetId;
  targetLabel: string;
  handoffId: string;
  workKey: string;
  title: string;
  directory: string;
  directoryUrl: string;
  url: string | null;
  ticket: string | null;
  handoffPrompt: string | null;
  privacyMode: ReadingPrivacyMode;
  permissions: { writeEscalated: false };
}

export interface StagedWritebackProposal {
  proposalId: string;
  workKey: string;
  scope: AgentWorkScope;
  sourceSetVersion: string;
  structureVersion: string;
  clientId: string;
  createdAt: string;
  summary: string;
  writesSource: false;
  status: "pending-review";
  operations: Array<{
    operationId: string;
    type: "replace-text" | "insert-text" | "insert-child";
    sourceId: string;
    blockUuid: string;
    expectedContentVersion: string;
    beforeText: string;
    proposedText: string;
    range?: { start: number; end: number };
  }>;
  plan?: NoteTidyPlan;
}

export const collaborateConfigPath = (stateDir: string): string => join(stateDir, "collaborate.json");
export const activeHandoffPath = (stateDir: string): string => join(stateDir, "active-handoff.json");
export const workPrivacyPath = (stateDir: string): string => join(stateDir, "work-privacy.json");
export const writebackProposalsPath = (stateDir: string): string => join(stateDir, "writeback-proposals.json");

const TARGET_META: Record<
  CollaborateTargetId,
  Omit<CollaborateTargetDescriptor, "available">
> = {
  dsh: {
    id: "dsh",
    label: "DSH",
    buttonLabel: "在 DSH 继续",
    transport: "dsh-ticket",
    description: "沿用 DSH 原生会话 ticket 交接当前工作",
  },
  codex: {
    id: "codex",
    label: "Codex",
    buttonLabel: "在 Codex 继续",
    transport: "mcp-handoff",
    description: "暂存交接上下文与只读连接，在 Codex 中通过 Companion MCP 读取继续",
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    buttonLabel: "在 Antigravity 继续",
    transport: "mcp-handoff",
    description: "暂存交接上下文与只读连接，在 Antigravity 中通过 Companion MCP 读取继续",
  },
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    buttonLabel: "在 Claude Code 继续",
    transport: "mcp-handoff",
    description: "暂存交接上下文与只读连接，在 Claude Code 中通过 Companion MCP 读取继续",
  },
  clipboard: {
    id: "clipboard",
    label: "复制交接指令",
    buttonLabel: "复制交接指令",
    transport: "clipboard-handoff",
    description: "暂存交接上下文并复制通用 MCP 协作指令，粘贴给任意外部 Agent",
  },
};

export function isCollaborateTargetId(value: unknown): value is CollaborateTargetId {
  return typeof value === "string" && (COLLABORATE_TARGET_IDS as readonly string[]).includes(value);
}

export function workKeyForScope(scope: AgentWorkScope): string {
  return JSON.stringify([scope.graphId, scope.rootUuid, scope.kind ?? "block"]);
}

async function assertPrivateConfigFile(path: string, maxBytes: number, errorCode: string): Promise<void> {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > maxBytes ||
    (process.platform !== "win32" && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))
  ) {
    throw new WorkspaceError(errorCode, `${path} 必须是当前用户私有的 0600 文件且不可为符号链接。`);
  }
}

export function parseCollaborateConfig(input: unknown): CollaborateConfig {
  const raw = workRecord(input, ["schemaVersion", "defaultTarget"]);
  if (raw.schemaVersion !== 1 || !isCollaborateTargetId(raw.defaultTarget)) {
    throw new WorkspaceError("COLLABORATE_CONFIG_INVALID", "collaborate.json 格式无效或目标不受支持。");
  }
  return { schemaVersion: 1, defaultTarget: raw.defaultTarget };
}

export async function loadCollaborateConfig(stateDir: string): Promise<CollaborateConfig> {
  const path = collaborateConfigPath(stateDir);
  try {
    await assertPrivateConfigFile(path, 32_768, "COLLABORATE_CONFIG_NOT_PRIVATE");
    return parseCollaborateConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, defaultTarget: "dsh" };
    }
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError("COLLABORATE_CONFIG_INVALID", error instanceof Error ? error.message : "Invalid collaborate.json");
  }
}

export async function saveCollaborateConfig(stateDir: string, config: CollaborateConfig): Promise<CollaborateConfig> {
  const validated = parseCollaborateConfig(config);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await atomicJson(collaborateConfigPath(stateDir), validated, 0o600);
  return validated;
}

export async function listCollaborateTargets(stateDir: string, dshAvailable: boolean): Promise<CollaborateTargetsSnapshot> {
  const config = await loadCollaborateConfig(stateDir);
  const targets: CollaborateTargetDescriptor[] = COLLABORATE_TARGET_IDS.map((id) => ({
    ...TARGET_META[id],
    available: id === "dsh" ? dshAvailable : true,
  }));
  return {
    defaultTarget: config.defaultTarget,
    dshAvailable,
    configPath: collaborateConfigPath(stateDir),
    targets,
  };
}

export async function readWorkPrivacyMap(stateDir: string): Promise<Record<string, ReadingPrivacyMode>> {
  const path = workPrivacyPath(stateDir);
  try {
    await assertPrivateConfigFile(path, 131_072, "WORK_PRIVACY_NOT_PRIVATE");
    const raw = JSON.parse(await readFile(path, "utf8")) as { schemaVersion?: unknown; works?: unknown };
    if (raw?.schemaVersion !== 1 || !raw.works || typeof raw.works !== "object" || Array.isArray(raw.works)) {
      return {};
    }
    const entries: Record<string, ReadingPrivacyMode> = {};
    for (const [key, value] of Object.entries(raw.works as Record<string, unknown>)) {
      if (value === "local-only" || value === "default") entries[key] = value;
    }
    return entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof WorkspaceError) throw error;
    return {};
  }
}

export async function setWorkPrivacy(
  stateDir: string,
  workKeys: string[],
  privacyMode: ReadingPrivacyMode
): Promise<ReadingPrivacyMode> {
  const map = await readWorkPrivacyMap(stateDir);
  for (const rawKey of workKeys) {
    const key = workText(rawKey, 512);
    if (privacyMode === "local-only") map[key] = "local-only";
    else delete map[key];
  }
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await atomicJson(workPrivacyPath(stateDir), { schemaVersion: 1, works: map }, 0o600);
  return privacyMode;
}

export async function resolveWorkPrivacy(
  stateDir: string,
  binding: AgentWorkBinding,
  workKey?: string | null
): Promise<ReadingPrivacyMode> {
  const map = await readWorkPrivacyMap(stateDir);
  const canonical = workKeyForScope(binding.scope);
  if (workKey && map[workKey] === "local-only") return "local-only";
  if (map[canonical] === "local-only") return "local-only";
  return "default";
}

export async function saveActiveHandoff(stateDir: string, record: CollaborationHandoffRecord): Promise<void> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await atomicJson(activeHandoffPath(stateDir), record, 0o600);
}

export async function readActiveHandoff(
  stateDir: string,
  expectedConnectionId?: string,
  expectedBinding?: AgentWorkBinding
): Promise<CollaborationHandoffRecord | null> {
  const path = activeHandoffPath(stateDir);
  try {
    await assertPrivateConfigFile(path, 262_144, "COLLABORATE_HANDOFF_NOT_PRIVATE");
    const raw = JSON.parse(await readFile(path, "utf8")) as CollaborationHandoffRecord;
    if (!raw || raw.schemaVersion !== 1 || !isCollaborateTargetId(raw.target)) return null;
    const binding = parseWorkBinding(raw.binding);
    if (expectedConnectionId && raw.connectionId !== expectedConnectionId) return null;
    if (expectedBinding && (!sameWorkScope(binding.scope, expectedBinding.scope) || binding.directory !== expectedBinding.directory)) {
      return null;
    }
    return { ...raw, binding };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export function buildHandoffPrompt(record: CollaborationHandoffRecord): string {
  const targetLabel = TARGET_META[record.target].label;
  const lines = [
    `请通过已连接的 Task Copilot Companion MCP（task-copilot-workbench）继续当前 Logseq 工作「${record.title}」。`,
    `1. 先调用 workbench_get_active_work 获取当前工作的来源版本、共同指导、关联材料清单及本次交接上下文。`,
    `2. 按需调用 workbench_read_sources / workbench_read_material 分页读取保存的原文块与显式关联材料（敏感文件如 .env* 会被默认拦截，请勿推测其内容）。`,
    `3. 如需更新渐进式阅读文章，请调用 workbench_submit_reading_candidate 提交候选修订（带上当前 structureVersion 与 sourceSetVersion），让我在 Logseq 中审阅采用；如需提出原文改动建议，请调用 workbench_propose_writeback，绝不静默改写原块、TODO 或正式任务状态。`,
    `工作目录：${record.binding.directory}`,
  ];
  if (record.intent?.request) {
    lines.push(`本次请求：${record.intent.request}`);
  }
  if (record.intent?.selection) {
    lines.push(`聚焦选段：${record.intent.selection.slice(0, 280)}`);
  }
  if (record.privacyMode === "local-only") {
    lines.push(`注意：此工作当前已开启「仅本地模型 / 禁止上云」，外部 MCP 正文读取将被拦截；仅在本地模型环境或用户解除该标记后再读取正文。`);
  }
  if (record.target !== "clipboard") {
    lines.push(`交接目标：${targetLabel}（只读连接，未扩大写权限）。`);
  }
  return lines.join("\n");
}

export async function createCollaborateHandoff(
  stateDir: string,
  options: {
    instanceId: string;
    connectionId: string;
    binding: AgentWorkBinding;
    input: unknown;
  }
): Promise<{ result: CollaborateHandoffResult; record: CollaborationHandoffRecord }> {
  const raw = workRecord(options.input, [
    "connectionId",
    "target",
    "mode",
    "title",
    "workRef",
    "workKey",
    "privacyMode",
    "newTab",
    "intent",
  ]);
  const config = await loadCollaborateConfig(stateDir);
  const target: CollaborateTargetId =
    raw.target === undefined
      ? config.defaultTarget
      : isCollaborateTargetId(raw.target)
        ? raw.target
        : (() => {
            throw new WorkspaceError("COLLABORATE_TARGET_INVALID", "不支持的协作目标。");
          })();
  const modeRaw = raw.mode === undefined ? "continue" : String(raw.mode);
  if (modeRaw !== "continue" && modeRaw !== "new") {
    throw new WorkspaceError("INVALID_INPUT");
  }
  const mode = modeRaw as DshMode;
  const title = workText(raw.title, 800);
  const workRef = raw.workRef !== undefined ? parseWorkRef(raw.workRef) : undefined;
  const workKey = raw.workKey !== undefined ? workText(raw.workKey, 512) : workKeyForScope(options.binding.scope);
  const intent = raw.intent !== undefined ? dshReadingIntent(raw.intent) : undefined;
  let privacyMode: ReadingPrivacyMode;
  if (raw.privacyMode === "local-only" || raw.privacyMode === "default") {
    privacyMode = await setWorkPrivacy(stateDir, [workKey, workKeyForScope(options.binding.scope)], raw.privacyMode);
  } else {
    privacyMode = await resolveWorkPrivacy(stateDir, options.binding, workKey);
  }

  const handoffId = randomUUID();
  const record: CollaborationHandoffRecord = {
    schemaVersion: 1,
    handoffId,
    createdAt: Date.now(),
    target,
    mode,
    title,
    workKey,
    connectionId: options.connectionId,
    instanceId: options.instanceId,
    binding: parseWorkBinding(options.binding),
    ...(workRef ? { workRef } : {}),
    privacyMode,
    ...(intent ? { intent } : {}),
  };
  await saveActiveHandoff(stateDir, record);

  const directoryUrl = pathToFileURL(options.binding.directory).href;
  if (target === "dsh") {
    const dsh = await createDshHandoff(
      stateDir,
      {
        mode,
        ...(workRef ? { workRef } : {}),
        title,
        entry: {
          instanceId: options.instanceId,
          connectionId: options.connectionId,
          binding: options.binding,
          directory: options.binding.directory,
        },
        ...(intent ? { intent } : {}),
      },
      raw.newTab === true
    );
    return {
      record,
      result: {
        target: "dsh",
        targetLabel: TARGET_META.dsh.label,
        handoffId,
        workKey,
        title,
        directory: options.binding.directory,
        directoryUrl,
        url: dsh.url,
        ticket: dsh.ticket,
        handoffPrompt: null,
        privacyMode,
        permissions: { writeEscalated: false },
      },
    };
  }

  return {
    record,
    result: {
      target,
      targetLabel: TARGET_META[target].label,
      handoffId,
      workKey,
      title,
      directory: options.binding.directory,
      directoryUrl,
      url: null,
      ticket: null,
      handoffPrompt: buildHandoffPrompt(record),
      privacyMode,
      permissions: { writeEscalated: false },
    },
  };
}

const MAX_WRITEBACK_PROPOSALS = 32;
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;

export async function listWritebackProposals(stateDir: string, workKey?: string): Promise<StagedWritebackProposal[]> {
  const path = writebackProposalsPath(stateDir);
  try {
    await assertPrivateConfigFile(path, 524_288, "WRITEBACK_PROPOSALS_NOT_PRIVATE");
    const raw = JSON.parse(await readFile(path, "utf8")) as { schemaVersion?: unknown; proposals?: unknown };
    if (raw?.schemaVersion !== 1 || !Array.isArray(raw.proposals)) return [];
    const cutoff = Date.now() - PROPOSAL_TTL_MS;
    const valid = (raw.proposals as StagedWritebackProposal[]).filter(
      (item) => item && typeof item.proposalId === "string" && Date.parse(item.createdAt) >= cutoff
    );
    return workKey ? valid.filter((item) => item.workKey === workKey) : valid;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

export async function addWritebackProposal(stateDir: string, proposal: StagedWritebackProposal): Promise<StagedWritebackProposal> {
  const existing = await listWritebackProposals(stateDir);
  const next = [...existing.filter((item) => item.proposalId !== proposal.proposalId), proposal].slice(-MAX_WRITEBACK_PROPOSALS);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await atomicJson(writebackProposalsPath(stateDir), { schemaVersion: 1, proposals: next }, 0o600);
  return proposal;
}

export async function dismissWritebackProposal(stateDir: string, proposalId: string): Promise<boolean> {
  const id = workText(proposalId, 128);
  const existing = await listWritebackProposals(stateDir);
  const filtered = existing.filter((item) => item.proposalId !== id);
  if (filtered.length === existing.length) return false;
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await atomicJson(writebackProposalsPath(stateDir), { schemaVersion: 1, proposals: filtered }, 0o600);
  return true;
}
