#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";

import { KernelClient, readKernelDescriptor } from "@task-copilot/client";
import { runCli } from "./cli.ts";

const descriptorPath = process.env.TASK_COPILOT_DESCRIPTOR ?? join(homedir(), ".task-copilot-vnext", "kernel.json");
const client = new KernelClient(await readKernelDescriptor(descriptorPath));
process.exitCode = await runCli(process.argv.slice(2), client, { out: console.log, err: console.error });
