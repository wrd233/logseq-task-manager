import {
  LocalServiceClient,
  probeService,
  validateServiceDescriptor,
  type ServiceConnectionState,
  type ServiceDescriptor,
} from "@task-copilot/service-client";
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
export type ServiceRuntimeClient = Pick<LocalServiceClient, "health" | "synchronizeExplicitObject" | "listObjects" | "listPrimaryAnchors" | "observePrimaryAnchor" | "rebindPrimaryAnchor" | "prepareProject" | "finalizeProject" | "nowWork" | "selectFocus" | "removeFocus" | "reorderFocus" | "changeCondition" | "changeDeadline" | "listProposals" | "generateProposal" | "reviewProposal" | "revalidateProposal" | "prepareProposalCommit" | "finalizeProposalCommit" | "compensateProposalCommit" | "listSemanticCommits" | "prepareProposalUndo" | "finalizeProposalUndo" | "compensateProposalUndo">;
type ServiceRuntimeClientFactory = (descriptor: ServiceDescriptor) => ServiceRuntimeClient;

export interface DiscoveredServiceRuntime {
  connection: ServiceConnectionState;
  client?: ServiceRuntimeClient;
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
): Promise<DiscoveredServiceRuntime> {
  return discoverConnection(descriptorPath, reader, createClient);
}
