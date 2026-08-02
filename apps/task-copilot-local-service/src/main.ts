import { startLocalService } from "./service.ts";
import { InteractionEvidenceBuffer } from "@task-copilot/application";
import { V2SqliteStore } from "@task-copilot/persistence/node";
import { loadStructuredProviderFromEnvironment } from "./provider-runtime.ts";
import { LocalLlmProposalGenerator } from "./llm-proposal.ts";
import { LocalLlmUxOutputGenerator } from "./llm-ux-output.ts";
import { LocalLlmGrillTurnGenerator } from "./llm-grill-turn.ts";
import { LocalLlmGrillPreviewGenerator } from "./llm-grill-preview.ts";
import { LocalLlmProjectCreationPreviewGenerator } from "./llm-project-creation-preview.ts";
import { LocalLlmCreationRoundGenerator } from "./creation-session-round.ts";
import { parseServiceRunnerArgs } from "./runner.ts";
import { recoverRetainedRestoreState } from "./restore-recovery-maintenance.ts";
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
  } else if (options.mode === "recover-restore") {
    await recoverRetainedRestoreState(options);
    process.stdout.write('{"event":"restore_recovery_completed","status":"PASS"}\n');
  } else {
  const { ownerPid, ...serviceOptions } = options;
  const provider = await loadStructuredProviderFromEnvironment();
  const interactionEvidence = new InteractionEvidenceBuffer();
  const providerOptions = provider ? {
    agentGovernanceProvider: provider,
    proposalGenerator: new LocalLlmProposalGenerator(provider),
    uxOutputGenerator: new LocalLlmUxOutputGenerator(provider, interactionEvidence),
    grillTurnGenerator: new LocalLlmGrillTurnGenerator(provider),
    grillPreviewGenerator: new LocalLlmGrillPreviewGenerator(provider),
    projectCreationPreviewGenerator: new LocalLlmProjectCreationPreviewGenerator(provider),
    creationRoundGenerator: new LocalLlmCreationRoundGenerator(provider),
    interactionEvidence,
  } : {};
  const service = await startLocalService({ ...serviceOptions, ...providerOptions });
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
