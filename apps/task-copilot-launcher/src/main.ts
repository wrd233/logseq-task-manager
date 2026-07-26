import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { loadLauncherConfig } from "./config-loader.ts";
import { LAUNCHER_PROTOCOL_VERSION, parseLauncherRunnerArgs, type LauncherDescriptor } from "./contracts.ts";
import { GraphServiceManager } from "./manager.ts";
import { startLauncherService } from "./service.ts";
import { createNodeRestoreRecoverySpawner, createNodeServiceSpawner } from "./spawner.ts";

async function writeDescriptor(path: string, descriptor: LauncherDescriptor): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(descriptor)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

try {
  const { configPath } = parseLauncherRunnerArgs(process.argv.slice(2));
  const config = await loadLauncherConfig(configPath);
  await mkdir(config.runtimeRoot, { recursive: true, mode: 0o700 });
  await chmod(config.runtimeRoot, 0o700);
  const manager = new GraphServiceManager({
    ...config,
    recoverRestore: createNodeRestoreRecoverySpawner(),
  }, createNodeServiceSpawner());
  const launcher = await startLauncherService({
    listenPort: config.listenPort,
    token: config.token,
    leaseTtlMs: config.leaseTtlMs,
    graphCount: config.graphs.length,
    manager,
  });
  await writeDescriptor(config.descriptorPath, {
    kind: "task-copilot-launcher",
    protocolVersion: LAUNCHER_PROTOCOL_VERSION,
    url: launcher.url,
    token: config.token,
  });
  process.stdout.write(`${JSON.stringify({
    status: "READY",
    pid: process.pid,
    listenPort: config.listenPort,
    capabilities: { graphServiceLifecycle: true, leaseHeartbeat: true, ownedShutdown: true, restoreRecoveryStatus: true, restoreRecoveryApply: true },
  })}\n`);
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await launcher.close();
  };
  process.once("SIGINT", () => void close().then(() => { process.exitCode = 0; }));
  process.once("SIGTERM", () => void close().then(() => { process.exitCode = 0; }));
} catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_:.-]{2,160}$/.test(error.message) ? error.message : "LAUNCHER_START_FAILED";
  process.stderr.write(`${JSON.stringify({ status: "FAILED", code })}\n`);
  process.exitCode = 2;
}
