import { readFile, readdir } from "node:fs/promises";
import console from "node:console";
import { join } from "node:path";

async function sources(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await sources(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
}

const rules = [
  { directory: "packages/domain/src", forbidden: ["@logseq", "better-sqlite3", "node:http", "@task-copilot/client"], label: "Domain is infrastructure-free" },
  { directory: "apps/logseq-plugin/src", forbidden: ["better-sqlite3", "@task-copilot/sqlite", "node:sqlite"], label: "Plugin never writes SQLite" },
  { directory: "apps/task-copilot-cli/src", forbidden: ["better-sqlite3", "@task-copilot/sqlite", "node:sqlite"], label: "CLI never opens SQLite outside local-runtime", allowed: ["apps/task-copilot-cli/src/local-runtime.ts"] },
  { directory: "packages/agent/src", forbidden: ["better-sqlite3", "@task-copilot/sqlite", "@logseq", "node:http"], label: "Agent executor owns no formal writer or transport" },
];
for (const rule of rules) {
  for (const path of await sources(rule.directory)) {
    if (rule.allowed?.includes(path)) continue;
    const content = await readFile(path, "utf8");
    for (const token of rule.forbidden) if (content.includes(token)) throw new Error(`${rule.label}: ${path} contains ${token}`);
  }
}
const server = await readFile("apps/kernel-service/src/server.ts", "utf8");
if (!server.includes('server.listen(0, "127.0.0.1"')) throw new Error("Kernel Service must bind explicitly to 127.0.0.1");
console.log("Dependency boundaries verified.");
