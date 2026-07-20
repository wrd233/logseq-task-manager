import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const domainFiles = await readdir(resolve(root, "packages/domain/src"));
const domainSource = (await Promise.all(domainFiles.filter((name) => name.endsWith(".ts")).map((name) => read(`packages/domain/src/${name}`)))).join("\n");
assert.doesNotMatch(domainSource, /@logseq\/libs|\blogseq\b/i, "Domain must not depend on Logseq");
assert.doesNotMatch(domainSource, /better-sqlite3|node:http|\bfetch\(/i, "Domain must not depend on SQLite or HTTP");

const packages = {
  shared: JSON.parse(await read("packages/shared/package.json")),
  domain: JSON.parse(await read("packages/domain/package.json")),
  application: JSON.parse(await read("packages/application/package.json")),
  persistence: JSON.parse(await read("packages/persistence/package.json")),
  adapter: JSON.parse(await read("packages/logseq-adapter/package.json")),
  serviceClient: JSON.parse(await read("packages/service-client/package.json")),
  cli: JSON.parse(await read("apps/task-copilot-cli/package.json")),
  localService: JSON.parse(await read("apps/task-copilot-local-service/package.json")),
  plugin: JSON.parse(await read("apps/task-copilot-logseq-plugin/package.json")),
};
assert.equal(packages.domain.dependencies["@task-copilot/shared"], "0.1.0");
assert.equal(packages.application.dependencies["@task-copilot/persistence"], undefined, "Application must depend on a port, not persistence");
assert.equal(packages.persistence.dependencies["@task-copilot/application"], "0.1.0", "Persistence implements the Application seam");
assert.equal(packages.adapter.dependencies["@task-copilot/domain"], "0.1.0");
assert.equal(packages.serviceClient.dependencies["@task-copilot/persistence"], undefined, "Service client must not open persistence");
assert.equal(packages.cli.dependencies["@task-copilot/persistence"], undefined, "CLI must not open persistence");
assert.equal(packages.localService.dependencies["@task-copilot/persistence"], "0.1.0", "Only Local Service owns the SQLite adapter");
assert.equal(packages.plugin.dependencies["@task-copilot/service-client"], "0.1.0", "Plugin V2 discovery must use the versioned Service client");
const cliSource = `${await read("apps/task-copilot-cli/src/cli.ts")}\n${await read("apps/task-copilot-cli/src/main.ts")}`;
assert.doesNotMatch(cliSource, /better-sqlite3|@task-copilot\/persistence|\.db\b/i, "CLI must use Service rather than SQLite");
const serviceClientSource = await read("packages/service-client/src/index.ts");
assert.doesNotMatch(serviceClientSource, /better-sqlite3|@task-copilot\/persistence/i, "Service client must remain transport-only");

const rootEntries = await readdir(root);
assert.equal(rootEntries.includes("package-lock.json"), true, "root package-lock.json is required");
for (const path of ["apps/logseq-plugin-capability-lab/package-lock.json", "apps/task-copilot-logseq-plugin/package-lock.json"]) {
  await assert.rejects(stat(resolve(root, path)), /ENOENT/, `nested lockfile is forbidden: ${path}`);
}

const pluginIndex = await read("apps/task-copilot-logseq-plugin/src/index.ts");
const ui = await read("apps/task-copilot-logseq-plugin/src/ui.ts");
assert.doesNotMatch(ui, /StateStore|VersionedStateRepository|FileStorage/, "UI renderer must not write Stores");
assert.match(pluginIndex, /TaskCopilot/, "Interaction must use Application commands and queries");

console.log("MVP architecture and package boundaries passed.");
