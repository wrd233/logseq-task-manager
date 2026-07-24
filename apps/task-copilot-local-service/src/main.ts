import { startLocalService } from "./service.ts";
import { V2SqliteStore } from "@task-copilot/persistence/node";
import { loadProposalGeneratorFromEnvironment } from "./provider-runtime.ts";
import { parseServiceRunnerArgs } from "./runner.ts";
import { startOwnerMonitor } from "./owner-monitor.ts";
import {
  serviceFailureLine,
  serviceMigrationLine,
  serviceReadyLine,
} from "./process-output.ts";

try {
  const options = parseServiceRunnerArgs(process.argv.slice(2));
  if (options.mode === "migrate-schema") {
    const store = await V2SqliteStore.open(options.databasePath);
    try {
      const result = await store.migrateSchema(options.graphId, options.backupPath);
      process.stdout.write(`${serviceMigrationLine(result)}\n`);
    } finally {
      store.close();
    }
  } else {
  const { ownerPid, ...serviceOptions } = options;
  const proposalGenerator = await loadProposalGeneratorFromEnvironment();
  const service = await startLocalService({ ...serviceOptions, ...(proposalGenerator ? { proposalGenerator } : {}) });
  process.stdout.write(`${serviceReadyLine(process.pid, service.capabilities)}\n`);
  let closing = false;
  let ownerMonitor: ReturnType<typeof startOwnerMonitor> | undefined;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    ownerMonitor?.stop();
    await service.close();
  };
  if (ownerPid !== undefined) ownerMonitor = startOwnerMonitor(ownerPid, close);
  process.once("SIGINT", () => void close().then(() => { process.exitCode = 0; }));
  process.once("SIGTERM", () => void close().then(() => { process.exitCode = 0; }));
  }
} catch (error) {
  process.stderr.write(`${serviceFailureLine(error)}\n`);
  process.exitCode = 2;
}
