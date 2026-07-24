import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const source = await readFile(resolve(root, "src/index.ts"), "utf8");
const bootstrap = await readFile(resolve(root, "src/bootstrap-shell.ts"), "utf8");
const buildScript = await readFile(resolve(root, "scripts/build.mjs"), "utf8");
const diagnostics = await readFile(resolve(root, "src/runtime-diagnostics.ts"), "utf8");
const html = await readFile(resolve(root, "index.html"), "utf8");
const css = await readFile(resolve(root, "src/index.css"), "utf8");
const entry = resolve(root, pkg.main);
assert.ok((await stat(entry)).isFile(), `package main does not exist: ${pkg.main}`);
assert.ok(!pkg.main.startsWith("/") && !pkg.main.includes(".."), "package main must be package-relative");
assert.equal((bootstrap.match(/registerUIItem\("toolbar"/g) ?? []).length, 1, "formal plugin must define exactly one toolbar registration");
assert.match(source, /registerToolbar\(host\)[\s\S]*registerCommands\(host[\s\S]*registerMainUi\(host[\s\S]*initializeFeatures\(\)/, "all bootstrap registrations must precede feature initialization");
assert.match(source, /"feature_initialization_failed"[\s\S]{0,180}errorCode: `\$\{failedStage\}_FAILED`/, "feature initialization must expose its failed stage as a structural error code");
assert.match(source, /"bootstrap_shell_failed"[\s\S]{0,180}errorCode: `\$\{failedStage\}_FAILED`/, "bootstrap shell failure must expose its failed stage as a structural error code");
assert.doesNotMatch(source, /console\.error\(/, "formal plugin errors must pass through the privacy-bounded structured logger");
assert.match(source, /beforeunload[\s\S]*cleanupHooks/, "reload cleanup hook is required");
assert.match(source, /featureReady = serviceConnection\.status === "READY" && Boolean\(serviceRuntimeClient\)/, "a READY V2 Local Service must unlock the V2 workspace");
assert.doesNotMatch(source, /markReady\("EVENTS_READY"\);\s*featureReady = false/, "V2 startup must not deliberately strand the UI in Diagnostics");
assert.equal((source.match(/\.\.\.\(actionDialog \? \{ actionDialog \} : \{\}\)/g) ?? []).length, 1, "the V2-only model must expose in-context action dialogs exactly once");
assert.match(buildScript, /assetBuildId = createHash\("sha256"\)\.update\(javascript\)\.update\(css\)/, "production asset URLs must change when built JS or CSS changes");
assert.doesNotMatch(source, /const taskCopilot = requireTaskCopilot\(\)/, "normal V2 dispatch must not activate the frozen V1 runtime");
const unsupportedActionGuard = source.indexOf("V2_UI_ACTION_UNSUPPORTED");
assert.ok(unsupportedActionGuard > 0, "unknown V2 actions must fail closed");
for (const action of ["create-v2-project", "v2-review-accept", "v2-review-defer", "v2-proposal-revalidate", "v2-proposal-commit", "v2-proposal-undo", "submit-v2-review-defer"]) {
  assert.ok(source.indexOf(`action === "${action}"`) < unsupportedActionGuard, `${action} must be dispatched before the fail-closed action guard`);
}
for (const action of ["submit-v2-proposal-commit", "submit-v2-proposal-undo"]) {
  const branch = source.slice(source.indexOf(`action === "${action}"`), source.indexOf(`action === "${action}"`) + 2_000);
  assert.match(branch, /actionDialog = undefined;[\s\S]*workspace = "review";/, `${action} must close its confirmation after the operation settles`);
}
for (const label of [
  "Task Copilot：打开",
  "Task Copilot：处理当前 Block",
  "Task Copilot：打开待我确认",
  "Task Copilot：打开“现在”",
  "Task Copilot：加入或移出当前关注",
  "Task Copilot：系统状态与技术诊断",
]) assert.ok(bootstrap.includes(label), `missing command: ${label}`);
for (const label of ["创建任务", "创建 MiniProject", "创建决策", "创建成果"]) {
  assert.ok(bootstrap.includes(`registerSlashCommand("${label}"`), `missing slash command: ${label}`);
}
for (const stage of ["BOOTSTRAP_STARTED", "TOOLBAR_REGISTERED", "COMMANDS_REGISTERED", "MAIN_UI_REGISTERED", "SETTINGS_READY", "RUNTIME_ADAPTER_READY", "PERSISTENCE_READY", "MIGRATION_READY", "APPLICATION_READY", "EVENTS_READY", "PLUGIN_READY"]) assert.ok(diagnostics.includes(`"${stage}"`), `missing runtime stage: ${stage}`);

const appsRoot = resolve(root, "..");
const peerPackages = ["logseq-plugin-capability-lab", "task-copilot-logseq-plugin"];
const ids = await Promise.all(peerPackages.map(async (name) => JSON.parse(await readFile(resolve(appsRoot, name, "package.json"), "utf8")).logseq.id));
assert.equal(new Set(ids).size, ids.length, `duplicate Logseq plugin IDs: ${ids.join(", ")}`);
const formalUiIdentifiers = ["task-copilot-personal-mvp-toolbar", "task-copilot-main-ui", "task-copilot-open-main-ui", "task-copilot-runtime-diagnostics", "task-copilot-project-reentry-head", "task-copilot-open-current-project-reentry", "task-copilot-personal-mvp-root"];
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
