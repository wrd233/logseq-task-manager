import { spawn as nodeSpawn } from "node:child_process";
import { chmod, lstat, mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";

import {
  LocalServiceClient,
  validateServiceDescriptor,
  type ServiceDescriptor,
} from "@task-copilot/service-client";

import type { ManagedChild, RestoreRecoverySpawner, ServiceSpawner } from "./manager.ts";

export interface ChildProcessPort {
  readonly pid?: number;
  readonly exitCode: number | null;
  once(event: "exit", listener: () => void): void;
  kill(signal: NodeJS.Signals): boolean;
}

export type SpawnPort = (
  command: string,
  args: readonly string[],
  options: { shell: false; detached: false; stdio: "ignore"; cwd: string; env?: NodeJS.ProcessEnv },
) => ChildProcessPort;

interface SpawnerDependencies {
  nodeExecutable?: string;
  spawn?: SpawnPort;
  prepareDescriptor?: (path: string) => Promise<void>;
  waitForDescriptor?: (path: string, child: ChildProcessPort) => Promise<ServiceDescriptor>;
}

async function prepareDescriptor(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  let existing: ServiceDescriptor;
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("LAUNCHER_RUNTIME_DESCRIPTOR_INSECURE");
    existing = validateServiceDescriptor(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message === "LAUNCHER_RUNTIME_DESCRIPTOR_INSECURE") throw error;
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    await rm(path, { force: true });
    return;
  }
  const deadline = Date.now() + 3_500;
  while (Date.now() < deadline) {
    try {
      const health = await new LocalServiceClient(existing, 400).health();
      if (health.status === "READY") {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
    } catch {
      await rm(path, { force: true });
      return;
    }
  }
  throw new Error("LAUNCHER_UNOWNED_SERVICE_PRESENT");
}

async function waitForDescriptor(path: string, child: ChildProcessPort): Promise<ServiceDescriptor> {
  const deadline = Date.now() + 5_000;
  let latestError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("LAUNCHER_SERVICE_EXITED_BEFORE_READY");
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
        throw new Error("LAUNCHER_RUNTIME_DESCRIPTOR_INSECURE");
      }
      const descriptor = validateServiceDescriptor(JSON.parse(await readFile(path, "utf8")));
      const health = await new LocalServiceClient(descriptor, 500).health();
      if (health.status !== "READY") throw new Error("LAUNCHER_SERVICE_NOT_READY");
      return descriptor;
    } catch (error) {
      latestError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`LAUNCHER_SERVICE_START_TIMEOUT:${latestError instanceof Error ? latestError.name : "unknown"}`);
}

function managedChild(child: ChildProcessPort): ManagedChild {
  if (!Number.isSafeInteger(child.pid) || (child.pid ?? 0) <= 0) throw new Error("LAUNCHER_SERVICE_PID_INVALID");
  let exited = child.exitCode !== null;
  let lastExitCode: number | null = child.exitCode;
  let stopping: Promise<void> | undefined;
  const exitListeners = new Set<() => void>();
  child.once("exit", () => {
    exited = true;
    lastExitCode = child.exitCode;
    for (const listener of exitListeners) listener();
    exitListeners.clear();
  });
  return {
    pid: child.pid!,
    get lastExitCode(): number | null {
      return lastExitCode;
    },
    onExit(listener): void {
      if (exited) listener();
      else exitListeners.add(listener);
    },
    async stop(): Promise<void> {
      if (stopping) return stopping;
      if (exited) return;
      stopping = new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!exited) child.kill("SIGKILL");
        }, 3_000);
        exitListeners.add(() => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      });
      return stopping;
    },
  };
}

export function createNodeServiceSpawner(dependencies: SpawnerDependencies = {}): ServiceSpawner {
  const nodeExecutable = dependencies.nodeExecutable ?? process.execPath;
  const spawn = dependencies.spawn ?? (nodeSpawn as unknown as SpawnPort);
  const prepare = dependencies.prepareDescriptor ?? prepareDescriptor;
  const wait = dependencies.waitForDescriptor ?? waitForDescriptor;
  return async (input) => {
    await prepare(input.descriptorPath);
    const provider = input.provider;
    const serviceEnvironment = { ...process.env };
    for (const key of ["DEEPSEEK_API_KEY", "TASK_COPILOT_LLM_PROVIDER", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL", "TASK_COPILOT_DEEPSEEK_API_KEY_REF", "DEEPSEEK_TIMEOUT_MS", "DEEPSEEK_MAX_OUTPUT_TOKENS"]) {
      delete serviceEnvironment[key];
    }
    if (provider) {
      serviceEnvironment.TASK_COPILOT_LLM_PROVIDER = provider.providerId;
      serviceEnvironment.DEEPSEEK_BASE_URL = provider.baseUrl;
      serviceEnvironment.DEEPSEEK_MODEL = provider.model;
      serviceEnvironment.TASK_COPILOT_DEEPSEEK_API_KEY_REF = provider.apiKeyRef;
      if (provider.timeoutMs !== undefined) serviceEnvironment.DEEPSEEK_TIMEOUT_MS = String(provider.timeoutMs);
      else delete serviceEnvironment.DEEPSEEK_TIMEOUT_MS;
      if (provider.maxOutputTokens !== undefined) serviceEnvironment.DEEPSEEK_MAX_OUTPUT_TOKENS = String(provider.maxOutputTokens);
      else delete serviceEnvironment.DEEPSEEK_MAX_OUTPUT_TOKENS;
    }
    const childProcess = spawn(nodeExecutable, [
      input.serviceEntryPath,
      "--database", input.graph.databasePath,
      "--graph-id", input.graph.graphId,
      "--descriptor", input.descriptorPath,
      "--owner-pid", String(process.pid),
    ], {
      shell: false,
      detached: false,
      stdio: "ignore",
      cwd: dirname(input.serviceEntryPath),
      env: serviceEnvironment,
    });
    const child = managedChild(childProcess);
    try {
      const descriptor = await wait(input.descriptorPath, childProcess);
      return { child, descriptor };
    } catch (error) {
      await child.stop();
      throw error;
    }
  };
}

export function createNodeRestoreRecoverySpawner(
  dependencies: Pick<SpawnerDependencies, "nodeExecutable" | "spawn"> & { timeoutMs?: number } = {},
): RestoreRecoverySpawner {
  const nodeExecutable = dependencies.nodeExecutable ?? process.execPath;
  const spawn = dependencies.spawn ?? (nodeSpawn as unknown as SpawnPort);
  const timeoutMs = dependencies.timeoutMs ?? 60_000;
  return async (input) => {
    const child = spawn(nodeExecutable, [
      input.serviceEntryPath,
      "recover-restore",
      "--database", input.graph.databasePath,
      "--graph-id", input.graph.graphId,
    ], {
      shell: false,
      detached: false,
      stdio: "ignore",
      cwd: dirname(input.serviceEntryPath),
    });
    await new Promise<void>((resolve, reject) => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.once("exit", () => {
        clearTimeout(timeout);
        if (!timedOut && child.exitCode === 0) resolve();
        else reject(new Error(timedOut ? "LAUNCHER_RESTORE_RECOVERY_PROCESS_TIMEOUT" : "LAUNCHER_RESTORE_RECOVERY_PROCESS_FAILED"));
      });
    });
  };
}
