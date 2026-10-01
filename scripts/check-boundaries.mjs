import { readFile, readdir } from "node:fs/promises";
import console from "node:console";
import { dirname, join, resolve } from "node:path";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import process from "node:process";
import ts from "typescript";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Check real import edges, including re-exports and literal dynamic imports. */
export function assertImportBoundaries(path, content) {
  const absolute = resolve(repo, path);
  const workView = absolute.startsWith(`${resolve(repo, "apps/logseq-plugin/src/features/work-view")}/`);
  const contracts = absolute.startsWith(`${resolve(repo, "packages/contracts/src")}/`);
  const kernel = absolute.startsWith(`${resolve(repo, "packages/kernel/src")}/`);
  const serviceCapability = /apps\/kernel-service\/src\/(?:projection-coordinator|closure-readiness|closure-gate|closure-assessment-coordinator|maintenance-coordinator|projection-delivery)\.ts$/u.test(absolute);
  const runtime = absolute === resolve(repo, "apps/logseq-plugin/src/plugin-runtime.ts");
  const taskUi = absolute.startsWith(`${resolve(repo, "apps/logseq-plugin/src/features/task-center")}/`);
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  function check(specifier) {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return;
    const name = specifier.text;
    const target = name.startsWith(".") ? resolve(dirname(absolute), name) : name;
    if (runtime && target.startsWith(`${resolve(repo, "apps/logseq-plugin/src/features")}/`)) throw new Error(`Runtime must not depend on feature controllers: ${path} imports ${name}`);
    if (taskUi && /\/(?:graph-gateway-worker|source-change-observer)\.ts$/u.test(target)) throw new Error(`Task UI must not own background resources: ${path} imports ${name}`);
    if (workView && target.startsWith(`${resolve(repo, "apps/logseq-plugin/src/features/task-center")}/`)) {
      throw new Error(`Work view must not depend on task UI: ${path} imports ${name}`);
    }
    if (contracts && (isBuiltin(name) || /^(?:@logseq(?:\/|$)|@task-copilot\/(?:sqlite|kernel|client)(?:\/|$)|better-sqlite3$)/u.test(name))) {
      throw new Error(`Contracts must remain browser-safe: ${path} imports ${name}`);
    }
    if ((kernel || serviceCapability) && name === "@task-copilot/sqlite") throw new Error(`Application capability must use its storage port: ${path} imports ${name}`);
    if (kernel && name.startsWith("@logseq/")) throw new Error(`Kernel must not depend on Logseq SDK: ${path} imports ${name}`);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) check(node.moduleSpecifier);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) check(node.arguments[0]);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) check(node.moduleReference.expression);
    ts.forEachChild(node, visit);
  }
  visit(source);
}

async function sources(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await sources(path));
    else if (/\.(?:ts|mjs)$/u.test(entry.name)) found.push(path);
  }
  return found;
}

const rules = [
  { directory: "packages/domain/src", forbidden: ["@logseq", "better-sqlite3", "node:http", "@task-copilot/client"], label: "Domain is infrastructure-free" },
  { directory: "apps/logseq-plugin/src", forbidden: ["better-sqlite3", "@task-copilot/sqlite", "node:sqlite"], label: "Plugin never writes SQLite" },
  { directory: "apps/task-copilot-cli/src", forbidden: ["better-sqlite3", "@task-copilot/sqlite", "node:sqlite"], label: "CLI never opens SQLite outside local-runtime", allowed: ["apps/task-copilot-cli/src/local-runtime.ts"] },
  { directory: "packages/agent/src", forbidden: ["better-sqlite3", "@task-copilot/sqlite", "@logseq", "node:http"], label: "Agent executor owns no formal writer or transport" },
];
export async function checkBoundaries() {
  for (const rule of rules) {
    for (const path of await sources(rule.directory)) {
      if (rule.allowed?.includes(path)) continue;
      const content = await readFile(path, "utf8");
      for (const token of rule.forbidden) if (content.includes(token)) throw new Error(`${rule.label}: ${path} contains ${token}`);
    }
  }
  for (const directory of ["apps/logseq-plugin/src", "apps/kernel-service/src", "packages/contracts/src", "packages/kernel/src"]) {
    for (const path of await sources(directory)) assertImportBoundaries(path, await readFile(path, "utf8"));
  }
  const server = await readFile("apps/kernel-service/src/server.ts", "utf8");
  if (!/server\.listen\([^,]+,\s*"127\.0\.0\.1"/u.test(server)) throw new Error("Kernel Service must bind explicitly to 127.0.0.1");
  console.log("Dependency boundaries verified.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkBoundaries();
