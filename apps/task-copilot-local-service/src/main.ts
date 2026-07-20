import { startLocalService } from "./service.ts";
import { parseServiceRunnerArgs } from "./runner.ts";

try {
  const options = parseServiceRunnerArgs(process.argv.slice(2));
  const service = await startLocalService(options);
  process.stdout.write(`${JSON.stringify({
    status: "READY",
    pid: process.pid,
    descriptorPath: options.descriptorPath,
    capabilities: { formalWrites: false, migration: false, provider: false, backup: true },
  })}\n`);
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await service.close();
  };
  process.once("SIGINT", () => void close().then(() => { process.exitCode = 0; }));
  process.once("SIGTERM", () => void close().then(() => { process.exitCode = 0; }));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
