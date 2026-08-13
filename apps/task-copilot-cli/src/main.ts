#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { ClientError, KernelClient, readKernelDescriptor } from "@task-copilot/client";
import { runCli } from "./cli.ts";

const descriptorPath = process.env.TASK_COPILOT_DESCRIPTOR ?? join(homedir(), ".task-copilot-vnext", "kernel.json");
const argv = process.argv.slice(2); const offlineHelp = !argv.length || argv.includes("--help") || argv.includes("-h");
async function readInput(path: string): Promise<string> {
  if (path !== "-") return readFile(path, "utf8");
  const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks).toString("utf8");
}
let client: KernelClient | null = offlineHelp ? {} as KernelClient : null;
if (!offlineHelp) {
  try { client = new KernelClient(await readKernelDescriptor(descriptorPath)); }
  catch (error) {
    const code = error instanceof ClientError ? error.code : "DESCRIPTOR_UNAVAILABLE"; const message = code === "DESCRIPTOR_INVALID" ? "Kernel descriptor is invalid." : "Kernel descriptor is unavailable.";
    console.error(argv.includes("--json") ? JSON.stringify({ error: { code, message } }) : `${code}: ${message}`); process.exitCode = 1;
  }
}
if (client) process.exitCode = await runCli(argv, client, { out: console.log, err: console.error, readInput });
