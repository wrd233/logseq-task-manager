#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { KernelClient, readKernelDescriptor } from "@task-copilot/client";
import { runCli } from "./cli.ts";

const descriptorPath = process.env.TASK_COPILOT_DESCRIPTOR ?? join(homedir(), ".task-copilot-vnext", "kernel.json");
const client = new KernelClient(await readKernelDescriptor(descriptorPath));
async function readInput(path: string): Promise<string> {
  if (path !== "-") return readFile(path, "utf8");
  const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks).toString("utf8");
}
process.exitCode = await runCli(process.argv.slice(2), client, { out: console.log, err: console.error, readInput });
