import { startLocalService } from "./service.ts";
import { loadProposalGeneratorFromEnvironment } from "./provider-runtime.ts";
import { parseServiceRunnerArgs } from "./runner.ts";

try {
  const options = parseServiceRunnerArgs(process.argv.slice(2));
  const proposalGenerator = await loadProposalGeneratorFromEnvironment();
  const service = await startLocalService({ ...options, ...(proposalGenerator ? { proposalGenerator } : {}) });
  process.stdout.write(`${JSON.stringify({
    status: "READY",
    pid: process.pid,
    descriptorPath: options.descriptorPath,
    capabilities: service.capabilities,
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
