import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { access, cp, chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { deriveLauncherGraphKey, LauncherClient, validateLauncherDescriptor } from "@task-copilot/service-client/launcher";

import { parseLauncherConfig, type LauncherConfig, type LauncherProviderConfig } from "./contracts.ts";

export const LAUNCH_AGENT_LABEL = "com.task-copilot.launcher";

export interface InstallLauncherInput {
  graphPath: string;
  graphId: string;
  databasePath?: string;
  provider?: LauncherProviderConfig;
}

export interface InstallLauncherResult {
  status: "INSTALLED";
  launchAgentLabel: typeof LAUNCH_AGENT_LABEL;
  pairingDescriptorPath: string;
  databasePath: string;
  graphKey: string;
}

interface InstallDependencies {
  homeDirectory?: string;
  userId?: number;
  nodeExecutable?: string;
  payloadRoot?: string;
  launchAgentsRoot?: string;
  createToken?: () => string;
  findPort?: () => Promise<number>;
  runLaunchctl?: (args: string[], tolerateFailure?: boolean) => Promise<void>;
  waitForLaunchctlRetry?: (milliseconds: number) => Promise<void>;
  waitForReady?: (descriptorPath: string) => Promise<void>;
}

function installError(code: string): never {
  throw new Error(code);
}

export function assertSupportedInstallerNodeVersion(version: string): void {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) installError("LAUNCHER_INSTALL_NODE_VERSION_UNSUPPORTED");
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== 20 || minor < 19) installError("LAUNCHER_INSTALL_NODE_VERSION_UNSUPPORTED");
}

function validateIdentifier(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) installError(`LAUNCHER_INSTALL_${field.toUpperCase()}_INVALID`);
  return value;
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) installError("LAUNCHER_INSTALL_DIRECTORY_INSECURE");
  await chmod(path, 0o700);
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, content, { mode });
  await chmod(temporary, mode);
  await rename(temporary, path);
}

async function copyRegularFile(source: string, destination: string, mode: number): Promise<void> {
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink()) installError("LAUNCHER_INSTALL_PAYLOAD_INVALID");
  await cp(source, destination);
  await chmod(destination, mode);
}

async function defaultFindPort(): Promise<number> {
  for (let port = 19_673; port <= 19_772; port += 1) {
    const available = await new Promise<boolean>((resolveAvailable) => {
      const server = createServer();
      server.once("error", () => resolveAvailable(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
    });
    if (available) return port;
  }
  installError("LAUNCHER_INSTALL_NO_LOOPBACK_PORT");
}

async function defaultRunLaunchctl(args: string[], tolerateFailure = false): Promise<void> {
  const result = await new Promise<number>((resolveCode, reject) => {
    const child = spawn("/bin/launchctl", args, { shell: false, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => resolveCode(code ?? 1));
  });
  if (result !== 0 && !tolerateFailure) installError("LAUNCHER_INSTALL_LAUNCHCTL_FAILED");
}

async function preferredNodeExecutable(): Promise<string> {
  const parts = process.execPath.split("/");
  const cellar = parts.lastIndexOf("Cellar");
  const formula = parts[cellar + 1];
  if (cellar > 0 && formula) {
    const candidate = join("/", ...parts.slice(1, cellar), "opt", formula, "bin", "node");
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Fall back to the exact executable used for this installer.
    }
  }
  return process.execPath;
}

async function defaultWaitForReady(descriptorPath: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const descriptor = validateLauncherDescriptor(JSON.parse(await readFile(descriptorPath, "utf8")));
      if ((await new LauncherClient(descriptor, 500).health()).status === "READY") return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  installError("LAUNCHER_INSTALL_READY_TIMEOUT");
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderLaunchAgentPlist(input: {
  nodeExecutable: string;
  launcherEntryPath: string;
  configPath: string;
  workingDirectory: string;
  stdoutPath: string;
  stderrPath: string;
}): string {
  const argumentsXml = [input.nodeExecutable, input.launcherEntryPath, "--config", input.configPath]
    .map((value) => `      <string>${xml(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${argumentsXml}
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(input.workingDirectory)}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${xml(input.stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(input.stderrPath)}</string>
  </dict>
</plist>
`;
}

async function existingPrivateConfig(configPath: string): Promise<LauncherConfig | undefined> {
  try {
    const metadata = await lstat(configPath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
      installError("LAUNCHER_INSTALL_EXISTING_CONFIG_INSECURE");
    }
    return parseLauncherConfig(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function installLauncher(input: InstallLauncherInput, dependencies: InstallDependencies = {}): Promise<InstallLauncherResult> {
  if (!isAbsolute(input.graphPath)) installError("LAUNCHER_INSTALL_GRAPH_PATH_INVALID");
  const graphId = validateIdentifier(input.graphId, "graph_id");
  if (input.databasePath !== undefined && !isAbsolute(input.databasePath)) installError("LAUNCHER_INSTALL_DATABASE_PATH_INVALID");

  const homeDirectory = dependencies.homeDirectory ?? homedir();
  const payloadRoot = dependencies.payloadRoot ?? resolve(import.meta.dirname, "../dist/payload");
  const launchAgentsRoot = dependencies.launchAgentsRoot ?? join(homeDirectory, "Library", "LaunchAgents");
  const userId = dependencies.userId ?? process.getuid?.();
  if (!Number.isSafeInteger(userId) || (userId ?? -1) < 0) installError("LAUNCHER_INSTALL_USER_ID_INVALID");
  const nodeExecutable = dependencies.nodeExecutable ?? await preferredNodeExecutable();
  if (!isAbsolute(homeDirectory) || !isAbsolute(payloadRoot) || !isAbsolute(launchAgentsRoot) || !isAbsolute(nodeExecutable)) {
    installError("LAUNCHER_INSTALL_PATH_INVALID");
  }

  const appRoot = join(homeDirectory, "Library", "Application Support", "Task Copilot");
  const binRoot = join(appRoot, "bin");
  const runtimeRoot = join(appRoot, "runtime");
  const pairingRoot = join(appRoot, "pairing");
  const dataRoot = join(appRoot, "data");
  const logRoot = join(appRoot, "logs");
  for (const path of [appRoot, binRoot, runtimeRoot, pairingRoot, dataRoot, logRoot, launchAgentsRoot]) {
    await ensurePrivateDirectory(path);
  }

  const launcherEntryPath = join(binRoot, "launcher.js");
  const serviceEntryPath = join(binRoot, "service.js");
  await copyRegularFile(join(payloadRoot, "launcher.js"), launcherEntryPath, 0o700);
  await copyRegularFile(join(payloadRoot, "service.js"), serviceEntryPath, 0o700);
  await cp(join(payloadRoot, "skills"), join(binRoot, "skills"), { recursive: true, force: true });
  await cp(join(payloadRoot, "node_modules"), join(binRoot, "node_modules"), { recursive: true, force: true });

  const graphKey = await deriveLauncherGraphKey(input.graphPath);
  const configPath = join(appRoot, "launcher-config.json");
  const descriptorPath = join(pairingRoot, "task-copilot-v2-launcher-descriptor.json");
  const existing = await existingPrivateConfig(configPath);
  const existingGraph = existing?.graphs.find((graph) => graph.graphKey === graphKey);
  const databasePath = input.databasePath
    ?? existingGraph?.databasePath
    ?? join(dataRoot, `${graphKey.slice(6, 38)}.sqlite`);
  const mappingConflict = existing?.graphs.some((graph) => (
    graph.graphKey !== graphKey && (graph.graphId === graphId || graph.databasePath === databasePath)
  ));
  if (mappingConflict) installError("LAUNCHER_INSTALL_GRAPH_MAPPING_CONFLICT");
  const existingGraphs = existing?.graphs.filter((graph) => graph.graphKey !== graphKey) ?? [];
  const config: LauncherConfig = parseLauncherConfig({
    schemaVersion: 2,
    listenPort: existing?.listenPort ?? await (dependencies.findPort ?? defaultFindPort)(),
    token: existing?.token ?? (dependencies.createToken ?? (() => randomBytes(32).toString("hex")))(),
    serviceEntryPath,
    runtimeRoot,
    descriptorPath,
    leaseTtlMs: 15_000,
    graphs: [...existingGraphs, { graphKey, graphId, databasePath }],
    ...(input.provider ? { provider: input.provider } : existing?.provider ? { provider: existing.provider } : {}),
  });
  await atomicWrite(configPath, `${JSON.stringify(config)}\n`, 0o600);

  const launchAgentPath = join(launchAgentsRoot, `${LAUNCH_AGENT_LABEL}.plist`);
  await atomicWrite(launchAgentPath, renderLaunchAgentPlist({
    nodeExecutable,
    launcherEntryPath,
    configPath,
    workingDirectory: binRoot,
    stdoutPath: join(logRoot, "launcher.stdout.log"),
    stderrPath: join(logRoot, "launcher.stderr.log"),
  }), 0o600);

  const runLaunchctl = dependencies.runLaunchctl ?? defaultRunLaunchctl;
  const waitForLaunchctlRetry = dependencies.waitForLaunchctlRetry
    ?? ((milliseconds: number) => new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds)));
  const domain = `gui/${userId}`;
  await runLaunchctl(["bootout", `${domain}/${LAUNCH_AGENT_LABEL}`], true);
  let bootstrapError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await runLaunchctl(["bootstrap", domain, launchAgentPath]);
      bootstrapError = undefined;
      break;
    } catch (error) {
      bootstrapError = error;
      if (attempt < 19) await waitForLaunchctlRetry(Math.min(100 + attempt * 25, 300));
    }
  }
  if (bootstrapError) throw bootstrapError;
  await (dependencies.waitForReady ?? defaultWaitForReady)(descriptorPath);
  return {
    status: "INSTALLED",
    launchAgentLabel: LAUNCH_AGENT_LABEL,
    pairingDescriptorPath: descriptorPath,
    databasePath,
    graphKey,
  };
}
