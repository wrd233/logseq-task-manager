import {
  LocalServiceClient,
  probeService,
  validateServiceDescriptor,
  type ServiceConnectionState,
  type ServiceDescriptor,
} from "@task-copilot/service-client";
import {
  LauncherClient,
  validateLauncherDescriptor,
  type LauncherDescriptor,
} from "@task-copilot/service-client/launcher";
import { StructuredError } from "@task-copilot/shared";

export interface DescriptorFileReader {
  read(path: string): Promise<unknown>;
}

export interface ElectronNodeHost {
  require?: (specifier: string) => unknown;
  window?: { require?: (specifier: string) => unknown };
}

export interface LogseqPrivateFileStorage {
  getItem(key: string): Promise<unknown>;
}

export interface LogseqPrivateFileStorageWriter extends LogseqPrivateFileStorage {
  setItem(key: string, value: string): Promise<unknown>;
}

export const PRIVATE_SERVICE_DESCRIPTOR_KEY = "task-copilot-v2-service-descriptor.json";
export const PRIVATE_LAUNCHER_DESCRIPTOR_KEY = "task-copilot-v2-launcher-descriptor.json";

interface ElectronPathModule {
  isAbsolute(path: string): boolean;
}

interface ElectronFileStat {
  mode: number;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

interface ElectronFileSystemPromises {
  lstat(path: string): Promise<ElectronFileStat>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
}

type ServiceProbeClient = Pick<LocalServiceClient, "health">;
type ServiceClientFactory = (descriptor: ServiceDescriptor) => ServiceProbeClient;
export type ServiceRuntimeClient = Pick<LocalServiceClient, "health" | "listAssociations" | "listPrimaryOwnerships" | "addAssociation" | "listCandidates" | "discoverCandidate" | "setCandidateDisposition" | "formalizeCandidate" | "updateCandidate" | "synchronizeExplicitObject" | "listObjects" | "createArea" | "editArea" | "createMiniProjectClosureProposal" | "createLifecycleProposal" | "draftMiniProjectClosure" | "listPrimaryAnchors" | "observePrimaryAnchor" | "rebindPrimaryAnchor" | "prepareProject" | "finalizeProject" | "nowWork" | "selectFocus" | "removeFocus" | "reorderFocus" | "changeCondition" | "changeDeadline" | "listProposals" | "getProposal" | "submitProposal" | "generateProposal" | "reviseGeneratedProposal" | "reviewProposal" | "revalidateProposal" | "prepareProposalCommit" | "finalizeProposalCommit" | "compensateProposalCommit" | "commitProjectClosure" | "commitProjectStructure" | "commitLifecycleTransition" | "commitPrimaryOwnership" | "undoPrimaryOwnership" | "undoLifecycle" | "undoProjectStructure" | "listSemanticCommits" | "prepareProposalUndo" | "finalizeProposalUndo" | "compensateProposalUndo" | "listMigrationRuns">
  & Partial<Pick<LocalServiceClient, "recoverProjectContext" | "grillMiniProject" | "previewMiniProjectGrill" | "createMiniProjectRestructureProposal" | "prepareMiniProjectRestructure" | "verifyMiniProjectRestructureStep" | "beginMiniProjectRestructureRecovery" | "verifyMiniProjectRestructureCompensation" | "prepareMiniProjectRestructureUndo" | "verifyMiniProjectRestructureUndoStep" | "beginMiniProjectRestructureUndoRecovery" | "verifyMiniProjectRestructureUndoCompensation" | "prepareProposalProjectCreation" | "finalizeProposalProjectCreation" | "claimGraphReadRequest" | "completeGraphReadRequest">>;
type ServiceRuntimeClientFactory = (descriptor: ServiceDescriptor) => ServiceRuntimeClient;
type LauncherRuntimeClient = Pick<LauncherClient, "health" | "ensure" | "heartbeat" | "release">;
type LauncherRuntimeClientFactory = (descriptor: LauncherDescriptor) => LauncherRuntimeClient;

export interface DiscoveredServiceRuntime {
  connection: ServiceConnectionState;
  client?: ServiceRuntimeClient;
  lifecycle?: ServiceLifecycleSession;
}

export interface ServiceLifecycleSession {
  kind: "LAUNCHER_LEASE";
  heartbeat(): Promise<void>;
  release(): Promise<void>;
}

export interface ServiceRuntimeDiscoveryOptions {
  graphKey?: string;
  clientInstanceId?: string;
  createLauncherClient?: LauncherRuntimeClientFactory;
}

function connectionError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-198", "D-216"] });
}

function restricted(reasonCode: string, message: string): ServiceConnectionState {
  return {
    status: "RESTRICTED",
    reasonCode,
    message,
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  };
}

export function createElectronDescriptorReader(host: ElectronNodeHost = globalThis as ElectronNodeHost): DescriptorFileReader | undefined {
  const runtimeRequire = host.require ?? host.window?.require;
  if (!runtimeRequire) return undefined;
  return {
    async read(path: string): Promise<unknown> {
      try {
        const pathModule = runtimeRequire("node:path") as ElectronPathModule;
        const fileSystem = runtimeRequire("node:fs/promises") as ElectronFileSystemPromises;
        if (!path || !pathModule.isAbsolute(path)) {
          throw connectionError("SERVICE_DESCRIPTOR_PATH_INVALID", "Local Service descriptor 必须是绝对路径。");
        }
        const metadata = await fileSystem.lstat(path);
        if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
          throw connectionError("SERVICE_DESCRIPTOR_INSECURE", "Local Service descriptor 必须是非链接的 0600 普通文件。");
        }
        const text = await fileSystem.readFile(path, "utf8");
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw connectionError("SERVICE_DESCRIPTOR_INVALID", "Local Service descriptor 不是合法 JSON。");
        }
      } catch (error) {
        if (error instanceof StructuredError) throw error;
        throw connectionError("SERVICE_DESCRIPTOR_READ_FAILED", "Local Service descriptor 无法安全读取。");
      }
    },
  };
}

const privateStorageKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function createLogseqPrivateStorageDescriptorReader(storage: LogseqPrivateFileStorage): DescriptorFileReader {
  return {
    async read(key: string): Promise<unknown> {
      if (!privateStorageKeyPattern.test(key)) {
        throw connectionError("SERVICE_DESCRIPTOR_PATH_INVALID", "Local Service descriptor storage key 无效。");
      }
      try {
        const value = await storage.getItem(key);
        if (typeof value !== "string") return value;
        try {
          return JSON.parse(value) as unknown;
        } catch {
          throw connectionError("SERVICE_DESCRIPTOR_INVALID", "Local Service descriptor 不是合法 JSON。");
        }
      } catch (error) {
        if (error instanceof StructuredError) throw error;
        throw connectionError("SERVICE_DESCRIPTOR_READ_FAILED", "Local Service descriptor 无法从插件私有存储安全读取。");
      }
    },
  };
}

export async function importServiceDescriptorToPrivateStorage(
  storage: LogseqPrivateFileStorageWriter,
  rawDescriptor: string,
): Promise<{ storageKey: typeof PRIVATE_SERVICE_DESCRIPTOR_KEY | typeof PRIVATE_LAUNCHER_DESCRIPTOR_KEY }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDescriptor);
  } catch {
    throw connectionError("SERVICE_DESCRIPTOR_INVALID", "所选 Local Service descriptor 不是合法 JSON。");
  }
  const isLauncher = Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as { kind?: unknown }).kind === "task-copilot-launcher");
  const descriptor = isLauncher ? validateLauncherDescriptor(parsed) : validateServiceDescriptor(parsed);
  const storageKey = isLauncher ? PRIVATE_LAUNCHER_DESCRIPTOR_KEY : PRIVATE_SERVICE_DESCRIPTOR_KEY;
  try {
    await storage.setItem(storageKey, JSON.stringify(descriptor));
  } catch {
    throw connectionError("SERVICE_DESCRIPTOR_WRITE_FAILED", "Local Service descriptor 无法安全写入插件私有存储。");
  }
  return { storageKey };
}

export { deriveLauncherGraphKey } from "@task-copilot/service-client/launcher";

export async function discoverServiceConnection(
  descriptorPath: string | undefined,
  reader = createElectronDescriptorReader(),
  createClient: ServiceClientFactory = (descriptor) => new LocalServiceClient(descriptor),
): Promise<ServiceConnectionState> {
  return (await discoverConnection(descriptorPath, reader, createClient)).connection;
}

async function discoverConnection<T extends ServiceProbeClient>(
  descriptorPath: string | undefined,
  reader: DescriptorFileReader | undefined,
  createClient: (descriptor: ServiceDescriptor) => T,
): Promise<{ connection: ServiceConnectionState; client?: T }> {
  if (!descriptorPath?.trim()) {
    return { connection: restricted("SERVICE_DESCRIPTOR_PATH_REQUIRED", "尚未配置 Local Service descriptor 路径。") };
  }
  if (!reader) {
    return { connection: restricted("SERVICE_DESCRIPTOR_READER_UNAVAILABLE", "Logseq 当前运行时不提供安全 descriptor 读取能力。") };
  }
  try {
    const descriptor = validateServiceDescriptor(await reader.read(descriptorPath));
    const client = createClient(descriptor);
    const connection = await probeService(client);
    return connection.status === "READY" ? { connection, client } : { connection };
  } catch (error) {
    const reasonCode = error instanceof StructuredError ? error.code : "SERVICE_DESCRIPTOR_READ_FAILED";
    const messages: Record<string, string> = {
      SERVICE_DESCRIPTOR_PATH_INVALID: "Local Service descriptor 路径无效。",
      SERVICE_DESCRIPTOR_INSECURE: "Local Service descriptor 权限或文件类型不安全。",
      SERVICE_DESCRIPTOR_INVALID: "Local Service descriptor 内容无效。",
      SERVICE_DESCRIPTOR_NON_LOOPBACK: "Local Service descriptor 不是受控 loopback 地址。",
      SERVICE_PROTOCOL_MISMATCH: "Local Service descriptor 协议版本不兼容。",
    };
    return { connection: restricted(reasonCode, messages[reasonCode] ?? "Local Service descriptor 无法安全读取。") };
  }
}

export async function discoverServiceRuntime(
  descriptorPath: string | undefined,
  reader = createElectronDescriptorReader(),
  createClient: ServiceRuntimeClientFactory = (descriptor) => new LocalServiceClient(descriptor),
  options: ServiceRuntimeDiscoveryOptions = {},
): Promise<DiscoveredServiceRuntime> {
  if (!descriptorPath?.trim()) {
    return { connection: restricted("SERVICE_DESCRIPTOR_PATH_REQUIRED", "尚未配置 Local Service descriptor 路径。") };
  }
  if (!reader) {
    return { connection: restricted("SERVICE_DESCRIPTOR_READER_UNAVAILABLE", "Logseq 当前运行时不提供安全 descriptor 读取能力。") };
  }
  let launcher: LauncherRuntimeClient | undefined;
  let leaseId: string | undefined;
  try {
    const rawDescriptor = await reader.read(descriptorPath);
    const isLauncher = Boolean(rawDescriptor && typeof rawDescriptor === "object" && !Array.isArray(rawDescriptor) && (rawDescriptor as { kind?: unknown }).kind === "task-copilot-launcher");
    if (!isLauncher) {
      const descriptor = validateServiceDescriptor(rawDescriptor);
      const client = createClient(descriptor);
      const connection = await probeService(client);
      return connection.status === "READY" ? { connection, client } : { connection };
    }
    if (!options.graphKey || !options.clientInstanceId) {
      return { connection: restricted("LAUNCHER_GRAPH_IDENTITY_REQUIRED", "当前 Graph 缺少可用于 Launcher 安全绑定的稳定身份。") };
    }
    const descriptor = validateLauncherDescriptor(rawDescriptor);
    launcher = (options.createLauncherClient ?? ((value) => new LauncherClient(value)))(descriptor);
    await launcher.health();
    const ensured = await launcher.ensure(options.graphKey, options.clientInstanceId);
    leaseId = ensured.leaseId;
    const client = createClient(ensured.serviceDescriptor);
    const connection = await probeService(client);
    if (connection.status !== "READY") {
      await launcher.release(leaseId).catch(() => undefined);
      return { connection };
    }
    let releasePromise: Promise<void> | undefined;
    const lifecycle: ServiceLifecycleSession = {
      kind: "LAUNCHER_LEASE",
      heartbeat: () => launcher!.heartbeat(leaseId!),
      release() {
        releasePromise ??= launcher!.release(leaseId!);
        return releasePromise;
      },
    };
    return { connection, client, lifecycle };
  } catch (error) {
    if (launcher && leaseId) await launcher.release(leaseId).catch(() => undefined);
    const remoteCode = error instanceof StructuredError && typeof error.details?.remoteCode === "string"
      ? error.details.remoteCode
      : undefined;
    const reasonCode = error instanceof StructuredError
      ? error.code === "LAUNCHER_HTTP_ERROR" && remoteCode === "LAUNCHER_GRAPH_NOT_CONFIGURED"
        ? "LAUNCHER_GRAPH_NOT_CONFIGURED"
        : error.code
      : "SERVICE_DESCRIPTOR_READ_FAILED";
    const messages: Record<string, string> = {
      SERVICE_DESCRIPTOR_PATH_INVALID: "Local Service descriptor 路径无效。",
      SERVICE_DESCRIPTOR_INSECURE: "Local Service descriptor 权限或文件类型不安全。",
      SERVICE_DESCRIPTOR_INVALID: "Local Service descriptor 内容无效。",
      SERVICE_DESCRIPTOR_NON_LOOPBACK: "Local Service descriptor 不是受控 loopback 地址。",
      SERVICE_PROTOCOL_MISMATCH: "Local Service descriptor 协议版本不兼容。",
      LAUNCHER_DESCRIPTOR_INVALID: "Task Copilot Launcher 配对 descriptor 内容无效。",
      LAUNCHER_DESCRIPTOR_NON_LOOPBACK: "Task Copilot Launcher 不是受控 loopback 地址。",
      LAUNCHER_PROTOCOL_MISMATCH: "Task Copilot Launcher 协议版本不兼容。",
      LAUNCHER_UNAVAILABLE: "Task Copilot Launcher 暂时不可用；Graph 正文仍可正常编辑。",
      LAUNCHER_TIMEOUT: "Task Copilot Launcher 响应超时；Graph 正文仍可正常编辑。",
      LAUNCHER_UNAUTHORIZED: "Task Copilot Launcher 配对认证失败。",
      LAUNCHER_RESPONSE_INVALID: "Task Copilot Launcher 返回了无效响应。",
      LAUNCHER_HTTP_ERROR: "Task Copilot Launcher 无法为当前 Graph 准备 Local Service。",
      LAUNCHER_GRAPH_NOT_CONFIGURED: "当前 Graph 尚未绑定 Task Copilot 本地数据库；正式写入保持关闭。",
    };
    return { connection: restricted(reasonCode, messages[reasonCode] ?? "Task Copilot 本地运行环境无法安全连接。") };
  }
}
