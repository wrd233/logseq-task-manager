import { readFile, readdir } from "node:fs/promises";
import console from "node:console";
import { dirname, join, resolve } from "node:path";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import process from "node:process";
import ts from "typescript";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const optionsByConfig = new Map();
function compilerOptionsFor(path) {
  const config = ts.findConfigFile(dirname(path), ts.sys.fileExists);
  if (!config) return {};
  if (!optionsByConfig.has(config)) {
    const read = ts.readConfigFile(config, ts.sys.readFile);
    if (read.error) throw new Error(`Cannot read boundary config: ${config}`);
    optionsByConfig.set(config, ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(config)).options);
  }
  return optionsByConfig.get(config);
}
function importTargets(name, source, options) {
  const targets = [name.startsWith(".") ? resolve(dirname(source), name) : name];
  for (const [alias, replacements] of Object.entries(options.paths ?? {})) {
    const star = alias.indexOf("*"), prefix = star < 0 ? alias : alias.slice(0, star), suffix = star < 0 ? "" : alias.slice(star + 1);
    if (star < 0 ? name !== alias : !name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    const matched = star < 0 ? "" : name.slice(prefix.length, name.length - suffix.length);
    for (const replacement of replacements) targets.push(resolve(options.baseUrl ?? repo, replacement.replace("*", matched)));
  }
  const resolved = ts.resolveModuleName(name, source, options, ts.sys).resolvedModule;
  if (resolved) targets.push(resolved.resolvedFileName);
  return targets;
}

/** Check real import edges, including re-exports and literal dynamic imports. */
export function assertImportBoundaries(path, content, compilerOptions) {
  const absolute = resolve(repo, path);
  const workView = absolute.startsWith(`${resolve(repo, "apps/logseq-plugin/src/features/work-view")}/`);
  const contracts = absolute.startsWith(`${resolve(repo, "packages/contracts/src")}/`);
  const kernel = absolute.startsWith(`${resolve(repo, "packages/kernel/src")}/`);
  const serviceCapability = absolute.startsWith(`${resolve(repo, "apps/kernel-service/src")}/`) && absolute !== resolve(repo, "apps/kernel-service/src/server.ts");
  const plugin = absolute.startsWith(`${resolve(repo, "apps/logseq-plugin/src")}/`);
  const cli = absolute.startsWith(`${resolve(repo, "apps/task-copilot-cli/src")}/`) && absolute !== resolve(repo, "apps/task-copilot-cli/src/local-runtime.ts");
  const domain = absolute.startsWith(`${resolve(repo, "packages/domain/src")}/`);
  const agent = absolute.startsWith(`${resolve(repo, "packages/agent/src")}/`);
  const options = compilerOptions ?? compilerOptionsFor(absolute);
  const runtime = absolute === resolve(repo, "apps/logseq-plugin/src/plugin-runtime.ts");
  const pluginHost = absolute.startsWith(`${resolve(repo, "apps/logseq-plugin/src/host")}/`);
  const taskUi = absolute.startsWith(`${resolve(repo, "apps/logseq-plugin/src/features/task-center")}/`);
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  function check(specifier) {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return;
    const name = specifier.text;
    const targets = importTargets(name, absolute, options);
    const inside = directory => targets.some(target => target.startsWith(`${resolve(repo, directory)}/`));
    const sqlite = /^(?:@task-copilot\/sqlite(?:\/|$)|better-sqlite3(?:\/|$)|(?:node:)?sqlite$)/u.test(name) || inside("packages/sqlite");
    if ((kernel || serviceCapability || plugin || cli) && sqlite) throw new Error(`Application capability must use its storage port: ${path} imports ${name}`);
    if ((domain || agent) && (sqlite || /^(?:@logseq(?:\/|$)|(?:node:)?http(?:$|\/)|@task-copilot\/client(?:\/|$))/u.test(name) || inside("packages/client"))) throw new Error(`Domain and Agent remain infrastructure-free: ${path} imports ${name}`);
    if (pluginHost && inside("apps/logseq-plugin/src/features")) throw new Error(`Plugin host must not depend on feature implementations: ${path} imports ${name}`);
    if (runtime && inside("apps/logseq-plugin/src/features")) throw new Error(`Runtime must not depend on feature controllers: ${path} imports ${name}`);
    if (taskUi && targets.some(target => /\/(?:graph-gateway-worker|source-change-observer)(?:\.(?:ts|mjs))?$/u.test(target))) throw new Error(`Task UI must not own background resources: ${path} imports ${name}`);
    if (workView && inside("apps/logseq-plugin/src/features/task-center")) {
      throw new Error(`Work view must not depend on task UI: ${path} imports ${name}`);
    }
    if (contracts && (sqlite || inside("packages/kernel") || inside("packages/client") || isBuiltin(name) || /^(?:@logseq(?:\/|$)|@task-copilot\/(?:sqlite|kernel|client)(?:\/|$)|better-sqlite3$)/u.test(name))) {
      throw new Error(`Contracts must remain browser-safe: ${path} imports ${name}`);
    }
    if (kernel && name.startsWith("@logseq/")) throw new Error(`Kernel must not depend on Logseq SDK: ${path} imports ${name}`);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) check(node.moduleSpecifier);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) check(node.arguments[0]);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) check(node.argument.literal);
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

export async function checkBoundaries() {
  for (const directory of ["packages/domain/src", "packages/agent/src", "apps/task-copilot-cli/src", "apps/logseq-plugin/src", "apps/kernel-service/src", "packages/contracts/src", "packages/kernel/src"]) {
    for (const path of await sources(directory)) assertImportBoundaries(path, await readFile(path, "utf8"));
  }
  const server = await readFile("apps/kernel-service/src/server.ts", "utf8");
  if (!/server\.listen\([^,]+,\s*"127\.0\.0\.1"/u.test(server)) throw new Error("Kernel Service must bind explicitly to 127.0.0.1");
  console.log("Dependency boundaries verified.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkBoundaries();
