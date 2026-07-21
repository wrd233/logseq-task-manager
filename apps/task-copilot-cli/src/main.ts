import { LocalServiceClient } from "@task-copilot/service-client";
import { readServiceDescriptor } from "@task-copilot/service-client/node";

import { runCli } from "./cli.ts";
import { loadProposalFile } from "./proposal-file.ts";

const exitCode = await runCli(
  process.argv.slice(2),
  {
    loadService: async (path) => new LocalServiceClient(await readServiceDescriptor(path)),
    loadProposal: loadProposalFile,
    ...(process.env.TASK_COPILOT_SERVICE_DESCRIPTOR
      ? { descriptorPath: process.env.TASK_COPILOT_SERVICE_DESCRIPTOR }
      : {}),
  },
  {
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
  },
);
process.exitCode = exitCode;
