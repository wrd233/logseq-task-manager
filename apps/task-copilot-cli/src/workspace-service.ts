import { execFileSync, spawn } from "node:child_process";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { WorkspaceError } from "@task-copilot/contracts";
import { providersConfigPath } from "./reading-hub.ts";

export const WORKSPACE_LAUNCHD_LABEL = "com.task-copilot.workspace-companion";

export interface WorkspaceServicePaths {
  stateDir: string;
  descriptorPath: string;
  pluginDescriptorPath: string;
  lockPath: string;
  logPath: string;
  plistPath: string;
  providersPath: string;
}

export interface WorkspaceServiceStatus {
  running: boolean;
  pid: number | null;
  baseUrl: string | null;
  stateDir: string;
  launchAgentInstalled: boolean;
  plistPath: string;
  providersPath: string;
  staleLock: boolean;
}

export interface WorkspaceServiceDeps {
  launchAgentsDir?: string;
  platform?: NodeJS.Platform;
  nodePath?: string;
  entryArgs?: string[];
  uid?: number;
  runLaunchctl?: (args: string[]) => { status: number | null; stdout: string; stderr: string };
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function workspaceServicePaths(stateDir: string, launchAgentsDir = join(homedir(), "Library", "LaunchAgents")): WorkspaceServicePaths {
  const state = resolve(stateDir);
  return {
    stateDir: state,
    descriptorPath: join(state, "workspace.json"),
    pluginDescriptorPath: join(state, "workspace-plugin.json"),
    lockPath: join(state, "workspace-server.lock"),
    logPath: join(state, "companion.log"),
    plistPath: join(launchAgentsDir, `${WORKSPACE_LAUNCHD_LABEL}.plist`),
    providersPath: providersConfigPath(state),
  };
}

export function renderWorkspaceLaunchAgentPlist(options: {
  label?: string;
  nodePath: string;
  entryArgs: string[];
  stateDir: string;
  logPath: string;
}): string {
  const label = options.label ?? WORKSPACE_LAUNCHD_LABEL;
  const programArgs = [options.nodePath, ...options.entryArgs, "workspace", "serve", "--state-dir", options.stateDir];
  const argsXml = programArgs.map((arg) => `      <string>${xmlEscape(arg)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${xmlEscape(label)}</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
      <key>TASK_COPILOT_WORKSPACE_STATE</key>
      <string>${xmlEscape(options.stateDir)}</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${xmlEscape(options.logPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(options.logPath)}</string>
  </dict>
</plist>
`;
}

function defaultEntryArgs(): string[] {
  const current = process.argv[1];
  if (current && /\.(?:m?js|ts)$/u.test(current)) {
    const resolved = resolve(current);
    if (resolved.endsWith(".ts")) {
      return ["--import", "tsx", resolved];
    }
    return [resolved];
  }
  throw new WorkspaceError("SERVICE_ENTRY_UNRESOLVED", "Cannot determine workspace CLI entrypoint.");
}

function defaultLaunchctl(args: string[]): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : "",
    };
  }
}

export async function workspaceServiceStatus(stateDir: string, deps: WorkspaceServiceDeps = {}): Promise<WorkspaceServiceStatus> {
  const paths = workspaceServicePaths(stateDir, deps.launchAgentsDir);
  const launchAgentInstalled = await exists(paths.plistPath);
  let pid: number | null = null;
  let staleLock = false;
  let baseUrl: string | null = null;

  try {
    const lock = JSON.parse(await readFile(paths.lockPath, "utf8")) as { pid?: unknown };
    if (typeof lock.pid === "number" && Number.isInteger(lock.pid) && lock.pid > 0) {
      if (pidAlive(lock.pid)) pid = lock.pid;
      else staleLock = true;
    }
  } catch {
    // No lock file
  }

  try {
    const desc = JSON.parse(await readFile(paths.descriptorPath, "utf8")) as { baseUrl?: unknown };
    if (typeof desc.baseUrl === "string") baseUrl = desc.baseUrl;
  } catch {
    // No descriptor
  }

  let running = false;
  if (pid !== null && baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(1000),
      });
      // Any HTTP response from our loopback server (401 auth required) confirms live server.
      running = response.status === 401 || response.status === 400 || response.ok;
    } catch {
      running = false;
    }
  }

  return {
    running,
    pid,
    baseUrl: running ? baseUrl : null,
    stateDir: paths.stateDir,
    launchAgentInstalled,
    plistPath: paths.plistPath,
    providersPath: paths.providersPath,
    staleLock,
  };
}

export async function installWorkspaceLaunchAgent(stateDir: string, deps: WorkspaceServiceDeps = {}): Promise<{ plistPath: string; loaded: boolean; status: WorkspaceServiceStatus }> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin") {
    throw new WorkspaceError("LAUNCHAGENT_MACOS_ONLY", "开机自启 LaunchAgent 仅支持 macOS；其他系统请使用 workspace service start。");
  }
  const paths = workspaceServicePaths(stateDir, deps.launchAgentsDir);
  await mkdir(paths.stateDir, { recursive: true, mode: 0o700 });
  const launchDir = deps.launchAgentsDir ?? join(homedir(), "Library", "LaunchAgents");
  await mkdir(launchDir, { recursive: true });

  const plist = renderWorkspaceLaunchAgentPlist({
    nodePath: deps.nodePath ?? process.execPath,
    entryArgs: deps.entryArgs ?? defaultEntryArgs(),
    stateDir: paths.stateDir,
    logPath: paths.logPath,
  });
  await writeFile(paths.plistPath, plist, { mode: 0o644 });
  await chmod(paths.plistPath, 0o644).catch(() => undefined);

  const launchctl = deps.runLaunchctl ?? defaultLaunchctl;
  const uid = deps.uid ?? process.getuid?.() ?? 0;
  const domain = `gui/${uid}`;
  // Clean bootout if previously loaded
  launchctl(["bootout", `${domain}/${WORKSPACE_LAUNCHD_LABEL}`]);
  const boot = launchctl(["bootstrap", domain, paths.plistPath]);
  const loaded = boot.status === 0;
  if (loaded) {
    launchctl(["kickstart", "-k", `${domain}/${WORKSPACE_LAUNCHD_LABEL}`]);
  }
  const status = await workspaceServiceStatus(stateDir, deps);
  return { plistPath: paths.plistPath, loaded, status };
}

export async function uninstallWorkspaceLaunchAgent(stateDir: string, deps: WorkspaceServiceDeps = {}): Promise<{ removed: boolean; plistPath: string }> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin") {
    throw new WorkspaceError("LAUNCHAGENT_MACOS_ONLY", "开机自启 LaunchAgent 仅支持 macOS。");
  }
  const paths = workspaceServicePaths(stateDir, deps.launchAgentsDir);
  const launchctl = deps.runLaunchctl ?? defaultLaunchctl;
  const uid = deps.uid ?? process.getuid?.() ?? 0;
  launchctl(["bootout", `gui/${uid}/${WORKSPACE_LAUNCHD_LABEL}`]);
  const existed = await exists(paths.plistPath);
  if (existed) await rm(paths.plistPath, { force: true });
  return { removed: existed, plistPath: paths.plistPath };
}

export async function startWorkspaceDaemon(stateDir: string, deps: WorkspaceServiceDeps = {}): Promise<WorkspaceServiceStatus> {
  const paths = workspaceServicePaths(stateDir, deps.launchAgentsDir);
  await mkdir(paths.stateDir, { recursive: true, mode: 0o700 });
  const before = await workspaceServiceStatus(stateDir, deps);
  if (before.running) return before;
  if (before.staleLock) {
    await rm(paths.lockPath, { force: true });
  }
  await writeFile(paths.logPath, "", { flag: "a", mode: 0o600 });
  const args = [...(deps.entryArgs ?? defaultEntryArgs()), "workspace", "serve", "--state-dir", paths.stateDir];
  const child = spawn(deps.nodePath ?? process.execPath, args, {
    env: { ...process.env, TASK_COPILOT_WORKSPACE_STATE: paths.stateDir },
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const current = await workspaceServiceStatus(stateDir, deps);
    if (current.running) return current;
  }
  throw new WorkspaceError("SERVICE_START_TIMEOUT", "Companion 后台服务未在预期时间内启动，请检查 companion.log。");
}

export async function stopWorkspaceDaemon(stateDir: string, deps: WorkspaceServiceDeps = {}): Promise<{ stopped: boolean; pid: number | null }> {
  const current = await workspaceServiceStatus(stateDir, deps);
  if (!current.pid) return { stopped: false, pid: null };
  try {
    process.kill(current.pid, "SIGTERM");
  } catch {
    return { stopped: false, pid: current.pid };
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!pidAlive(current.pid)) return { stopped: true, pid: current.pid };
  }
  return { stopped: false, pid: current.pid };
}
