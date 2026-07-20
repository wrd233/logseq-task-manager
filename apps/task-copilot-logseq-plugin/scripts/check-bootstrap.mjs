import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const source = await readFile(resolve(root, "src/index.ts"), "utf8");
const bootstrap = await readFile(resolve(root, "src/bootstrap-shell.ts"), "utf8");
const diagnostics = await readFile(resolve(root, "src/runtime-diagnostics.ts"), "utf8");
const html = await readFile(resolve(root, "index.html"), "utf8");
const css = await readFile(resolve(root, "src/index.css"), "utf8");
const entry = resolve(root, pkg.main);
assert.ok((await stat(entry)).isFile(), `package main does not exist: ${pkg.main}`);
assert.ok(!pkg.main.startsWith("/") && !pkg.main.includes(".."), "package main must be package-relative");
assert.equal((bootstrap.match(/registerUIItem\("toolbar"/g) ?? []).length, 1, "formal plugin must define exactly one toolbar registration");
assert.match(source, /registerToolbar\(host\)[\s\S]*registerCommands\(host[\s\S]*registerMainUi\(host[\s\S]*initializeFeatures\(\)/, "all bootstrap registrations must precede feature initialization");
assert.match(source, /initialization failed at \$\{failedStage\}/, "feature initialization must expose its failed stage");
assert.match(source, /beforeunload[\s\S]*cleanupHooks/, "reload cleanup hook is required");
assert.match(source, /featureReady = serviceConnection\.status === "READY" && Boolean\(serviceRuntimeClient\)/, "a READY V2 Local Service must unlock the V2 workspace");
assert.doesNotMatch(source, /markReady\("EVENTS_READY"\);\s*featureReady = false/, "V2 startup must not deliberately strand the UI in Diagnostics");
assert.equal((source.match(/\.\.\.\(actionDialog \? \{ actionDialog \} : \{\}\)/g) ?? []).length, 2, "both V1 and V2-only models must expose in-context action dialogs");
const v1ActionGuard = source.indexOf("const taskCopilot = requireTaskCopilot();");
assert.ok(v1ActionGuard > 0, "V1 action guard is required");
for (const action of ["create-v2-project", "v2-review-accept", "v2-review-defer", "v2-proposal-revalidate", "v2-proposal-commit", "v2-proposal-undo", "submit-v2-review-defer"]) {
  assert.ok(source.indexOf(`action === \"${action}\"`) < v1ActionGuard, `${action} must be dispatched before the V1-only action guard`);
}
for (const label of ["Task Copilot: Open", "Task Copilot: Capture Current Block", "Task Copilot: Open Inbox", "Task Copilot: Open Now Work", "Task Copilot: Runtime Diagnostics"]) assert.ok(bootstrap.includes(label), `missing command: ${label}`);
for (const stage of ["BOOTSTRAP_STARTED", "TOOLBAR_REGISTERED", "COMMANDS_REGISTERED", "MAIN_UI_REGISTERED", "SETTINGS_READY", "RUNTIME_ADAPTER_READY", "PERSISTENCE_READY", "MIGRATION_READY", "APPLICATION_READY", "EVENTS_READY", "PLUGIN_READY"]) assert.ok(diagnostics.includes(`"${stage}"`), `missing runtime stage: ${stage}`);

const appsRoot = resolve(root, "..");
const peerPackages = ["logseq-plugin-capability-lab", "task-copilot-logseq-plugin"];
const ids = await Promise.all(peerPackages.map(async (name) => JSON.parse(await readFile(resolve(appsRoot, name, "package.json"), "utf8")).logseq.id));
assert.equal(new Set(ids).size, ids.length, `duplicate Logseq plugin IDs: ${ids.join(", ")}`);
const formalUiIdentifiers = ["task-copilot-personal-mvp-toolbar", "task-copilot-main-ui", "task-copilot-open-main-ui", "task-copilot-runtime-diagnostics", "task-copilot-personal-mvp-root"];
const externalUiIdentifiers = ["open-logseq-plugin-capability-lab", "ai-task-copilot-logseq-bridge"];
for (const identifier of [...formalUiIdentifiers, ...externalUiIdentifiers]) assert.match(identifier, /^[A-Za-z][A-Za-z0-9_-]*$/);
assert.equal(new Set([...formalUiIdentifiers, ...externalUiIdentifiers]).size, formalUiIdentifiers.length + externalUiIdentifiers.length, "formal, Capability Lab and known Bridge identifiers must be unique");
for (const reserved of ["wrd233-logseq-plugin-capability-lab", ...externalUiIdentifiers]) {
  assert.ok(!diagnostics.includes(`= "${reserved}"`), `formal identifier collides with ${reserved}`);
}
assert.doesNotMatch(bootstrap, /key:\s*[`"'][^`"']*[\s/:.#]/, "registered keys must be CSS-safe literals or validated constants");
assert.match(html, /id="task-copilot-personal-mvp-root"/, "Main UI root must be plugin-specific and CSS-safe");
assert.match(bootstrap, /task-copilot-personal-mvp-toolbar/, "toolbar CSS class must be plugin-specific");
const unscopedSelectors = css.split("\n").map((line) => line.trim()).filter((line) => line.endsWith("{") && !line.startsWith("@") && !line.includes("#task-copilot-personal-mvp-root"));
assert.deepEqual(unscopedSelectors, [], `unscoped formal-plugin CSS selectors: ${unscopedSelectors.join(", ")}`);
console.log("Task Copilot bootstrap integrity passed.");
