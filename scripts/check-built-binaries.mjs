import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../apps/task-copilot-cli/dist/main.js", import.meta.url));
const source = await readFile(cli, "utf8");
if (!source.startsWith("#!/usr/bin/env node\n") || source.slice(2).includes("#!/usr/bin/env node")) throw new Error("CLI_SHEBANG_INVALID");
const smoke = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
if (smoke.status !== 0 || !smoke.stdout.includes("Task Copilot External Agent CLI")) throw new Error(`CLI_BINARY_SMOKE_FAILED:${smoke.stderr}`);
const missingPath = "/definitely-not-a-task-copilot-descriptor.json";
const missing = spawnSync(process.execPath, [cli, "status", "--json"], { encoding: "utf8", env: { ...process.env, TASK_COPILOT_DESCRIPTOR: missingPath } });
let failure; try { failure = JSON.parse(missing.stderr); } catch { failure = null; }
if (missing.status !== 1 || failure?.error?.code !== "DESCRIPTOR_UNAVAILABLE" || missing.stderr.includes(missingPath) || missing.stderr.includes(" at ")) throw new Error("CLI_DESCRIPTOR_FAILURE_CONTRACT_INVALID");
