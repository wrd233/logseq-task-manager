import { spawn, spawnSync } from "node:child_process";
import console from "node:console";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(repo, "tmp/logseq-sandbox");
const app = join(root, "Logseq Task Copilot Lab.app");
const manifestPath = join(root, "sandbox.json");
const paths = { root, app, graph: join(root, "graph"), home: join(root, "home"), profile: join(root, "profile"), state: join(root, "kernel"), evidence: join(root, "evidence") };
export const sandboxPaths = paths;

export function isOwnedSandboxProcess(command) {
  const hasArgument = (argument) => command.includes(` ${argument} `) || command.endsWith(` ${argument}`);
  return (command.startsWith(`${join(app, "Contents/MacOS/Logseq")} `) && hasArgument(`--user-data-dir=${paths.profile}`)) ||
    (hasArgument(join(root, "kernel-runner.mjs")) && command.includes(" --import tsx "));
}

function processRecord(kind) {
  const path = join(root, `${kind}-process.json`);
  if (!existsSync(path)) return null;
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (!Number.isSafeInteger(record.pid) || record.pid < 1) throw new Error("Invalid sandbox PID record.");
  // macOS ps escapes non-ASCII paths under the C locale; compare the complete
  // UTF-8 command so the recorded Chinese workspace can be identity-checked.
  const command = spawnSync("/bin/ps", ["-ww", "-p", String(record.pid), "-o", "command="], { encoding: "utf8", env: { ...process.env, LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" } }).stdout.trim();
  return { ...record, running: Boolean(command), owned: Boolean(command) && isOwnedSandboxProcess(command) };
}

function startChild(kind, executable, args, env) {
  const fd = openSync(join(paths.evidence, `${kind}.log`), "a", 0o600);
  const child = spawn(executable, args, { cwd: repo, env, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  child.unref();
  writeFileSync(join(root, `${kind}-process.json`), JSON.stringify({ pid: child.pid, command: [executable, ...args] }), { mode: 0o600 });
  return child.pid;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Sandbox startup timed out. Inspect tmp/logseq-sandbox/evidence logs.");
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.error || result.status}`);
  return result.stdout;
}

const command = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) ? process.argv[2] ?? "status" : null;
if (command === "prepare") {
  if (process.platform !== "darwin") throw new Error("This isolated Desktop harness currently supports macOS only.");
  const source = resolve(process.argv[3] ?? "/Applications/Logseq.app");
  const sourceResources = join(source, "Contents/Resources/app");
  if (!existsSync(join(sourceResources, "electron.js"))) throw new Error("An unpacked Logseq application is required.");
  if (existsSync(app)) throw new Error("Sandbox application already exists. Reuse it; preparation never overwrites an existing app.");
  for (const path of Object.values(paths).filter((path) => path !== app)) mkdirSync(path, { recursive: true, mode: 0o700 });
  for (const directory of [".logseq", "Library/Application Support", "Documents", "Downloads", "Desktop"]) mkdirSync(join(paths.home, directory), { recursive: true });
  mkdirSync(join(paths.graph, "pages"), { recursive: true });
  mkdirSync(join(paths.graph, "journals"), { recursive: true });
  mkdirSync(join(paths.graph, "logseq"), { recursive: true });
  writeFileSync(join(paths.graph, "logseq/config.edn"), "{:git-auto-push false :git-auto-commit false :ui/show-brackets? true}\n", { flag: "wx" });
  writeFileSync(join(paths.graph, "pages/Task Copilot Lab.md"), "- Task Copilot isolated test graph. Synthetic data only.\n", { flag: "wx" });
  writeFileSync(join(paths.home, ".logseq/preferences.json"), JSON.stringify({ theme: "light", themes: {}, externals: [join(repo, "apps/logseq-plugin")], pinnedToolbarItems: ["task-copilot-toolbar"] }), { mode: 0o600, flag: "wx" });
  writeFileSync(join(paths.profile, "configs.edn"), "{:developer-mode true :feature/enable-plugin-system? true}\n", { flag: "wx" });
  run("/bin/cp", ["-cR", source, app]);
  const resources = join(app, "Contents/Resources/app");
  const pkg = JSON.parse(readFileSync(join(resources, "package.json"), "utf8"));
  const originalMain = pkg.main;
  pkg.main = "task-copilot-lab.cjs";
  pkg.productName = "Logseq Task Copilot Lab";
  writeFileSync(join(resources, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(join(resources, pkg.main), `// Generated isolation bootstrap; never installed into the source application.
const fs = require('node:fs');
const os = require('node:os');
const electron = require('electron');
const paths = ${JSON.stringify(paths)};
os.homedir = () => paths.home;
electron.app.setName('Logseq Task Copilot Lab');
electron.app.setPath('home', paths.home);
electron.app.setPath('appData', paths.home + '/Library/Application Support');
electron.app.setPath('userData', paths.profile);
electron.app.setPath('documents', paths.home + '/Documents');
electron.app.setPath('downloads', paths.home + '/Downloads');
electron.app.setPath('desktop', paths.home + '/Desktop');
electron.app.setAppLogsPath(paths.evidence + '/app-logs');
electron.app.setAsDefaultProtocolClient = () => false;
electron.app.removeAsDefaultProtocolClient = () => false;
electron.shell.openExternal = async () => { throw new Error('External links disabled in isolated test instance'); };
electron.dialog.showOpenDialog = async (...args) => {
  const options = args[args.length - 1];
  return options?.properties?.includes('openDirectory') ? {canceled: false, filePaths: [paths.graph]} : {canceled: true, filePaths: []};
};
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, ...args) { return request === 'update-electron-app' ? () => {} : originalLoad.call(this, request, ...args); };
electron.autoUpdater.checkForUpdates = () => {};
electron.autoUpdater.setFeedURL = () => {};
fs.writeFileSync(paths.evidence + '/isolation-runtime.json', JSON.stringify({pid: process.pid, home: electron.app.getPath('home'), osHome: os.homedir(), userData: electron.app.getPath('userData'), appData: electron.app.getPath('appData')}, null, 2), {mode: 0o600});
require(${JSON.stringify(`./${originalMain}`)});
`);
  run("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleIdentifier com.taskcopilot.logseq.sandbox", join(app, "Contents/Info.plist")]);
  // Electron locates its Helper apps through CFBundleName; keep the source name.
  run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--entitlements", join(resources, "entitlements.plist"), app]);
  const version = pkg.version;
  writeFileSync(manifestPath, `${JSON.stringify({ ...paths, sourceApp: source, logseqVersion: version, plugin: join(repo, "apps/logseq-plugin"), createdAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ prepared: true, ...paths, logseqVersion: version }, null, 2));
} else if (command === "start") {
  if (!existsSync(manifestPath)) throw new Error("Prepare the isolated app first.");
  if (!existsSync(join(repo, "apps/logseq-plugin/dist/index.html"))) throw new Error("Build the workspace first.");
  const runtime = process.env.TASK_COPILOT_NODE ?? (existsSync(join(repo, "tmp/toolchains/node-v20.20.2-darwin-x64/bin/node")) ? join(repo, "tmp/toolchains/node-v20.20.2-darwin-x64/bin/node") : process.execPath);
  if (!run(runtime, ["-p", "process.versions.node"]).startsWith("20.")) throw new Error("The sandbox Kernel requires Node 20; set TASK_COPILOT_NODE to its executable.");
  const env = { ...process.env, DEEPSEEK_EXECUTOR_ENABLED: "false", TASK_COPILOT_PROFILE: "sandbox", TASK_COPILOT_STATE_DIR: paths.state };
  for (const key of Object.keys(env)) if (key.startsWith("DEEPSEEK_") && key !== "DEEPSEEK_EXECUTOR_ENABLED") delete env[key];
  const existingKernel = processRecord("kernel");
  if (existingKernel?.running && !existingKernel.owned) throw new Error("Sandbox PID is owned by another process; refusing to reuse it.");
  if (!existingKernel?.running) {
    writeFileSync(join(root, "kernel-runner.mjs"), `import {startKernelServer} from '../../apps/kernel-service/src/server.ts';\nprocess.umask(0o077);\nconst server = await startKernelServer({databasePath:${JSON.stringify(join(paths.state, "task-copilot.sqlite"))},descriptorPath:${JSON.stringify(join(paths.state, "kernel.json"))},profile:'sandbox',workspaceRoot:${JSON.stringify(repo)}});\nfor(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>void server.close().then(()=>process.exit(0)));\n`);
    startChild("kernel", runtime, ["--import", "tsx", join(root, "kernel-runner.mjs")], env);
  }
  await waitFor(() => existsSync(join(paths.state, "graph-adapter.json")) && JSON.parse(readFileSync(join(paths.state, "graph-adapter.json"), "utf8")).pid === processRecord("kernel")?.pid);
  const descriptor = readFileSync(join(paths.state, "graph-adapter.json"), "utf8");
  const settings = join(paths.home, ".logseq/settings");
  mkdirSync(settings, { recursive: true });
  const settingsPath = join(settings, "task-copilot-vnext.json");
  const previousSettings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  writeFileSync(settingsPath, JSON.stringify({ ...previousSettings, disabled: false, kernelDescriptorJson: descriptor }), { mode: 0o600 });
  // Kernel tokens rotate on restart. Update only this lab's private cache, too.
  const storage = join(paths.home, ".logseq/storages/task-copilot-vnext");
  mkdirSync(storage, { recursive: true });
  writeFileSync(join(storage, "task-copilot-vnext-kernel-descriptor"), descriptor, { mode: 0o600 });
  const existingDesktop = processRecord("desktop");
  if (existingDesktop?.running && !existingDesktop.owned) throw new Error("Sandbox PID is owned by another process; refusing to reuse it.");
  if (!existingDesktop?.running) {
    const { createServer } = await import("node:net");
    const probe = createServer();
    await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(19333, "127.0.0.1", resolve); });
    await new Promise((resolve) => probe.close(resolve));
    startChild("desktop", join(app, "Contents/MacOS/Logseq"), [`--user-data-dir=${paths.profile}`, "--remote-debugging-port=19333", "--remote-debugging-address=127.0.0.1"], env);
  }
  console.log(JSON.stringify({ desktopPid: processRecord("desktop")?.pid, kernelPid: processRecord("kernel")?.pid, graph: paths.graph, cdp: "http://127.0.0.1:19333", remoteProvider: "disabled" }, null, 2));
} else if (command === "stop") {
  const stopped = [];
  for (const kind of ["desktop", "kernel"]) {
    const record = processRecord(kind);
    if (!record?.running) continue;
    if (!record.owned) throw new Error(`Refusing to stop unrelated PID ${record.pid}.`);
    process.kill(record.pid, "SIGTERM");
    stopped.push(kind);
  }
  await waitFor(() => stopped.every((kind) => !processRecord(kind)?.owned));
  console.log("Only recorded, identity-checked sandbox processes were stopped.");
} else if (command === "status") {
  console.log(existsSync(manifestPath) ? JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, "utf8")), desktop: processRecord("desktop"), kernel: processRecord("kernel") }, null, 2) : "Sandbox has not been prepared.");
} else if (command !== null) {
  throw new Error("Usage: node scripts/logseq-sandbox.mjs prepare [source.app] | start | stop | status");
}
