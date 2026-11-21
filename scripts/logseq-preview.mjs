// Builds the same ZIP used for installation, then moves the preview pointer.
import { execFileSync } from "node:child_process";
import { open, mkdir, mkdtemp, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import process from "node:process";

const repository = fileURLToPath(new URL("../", import.meta.url));
const root = join(repository, "tmp/logseq-preview");
const installation = join(root, "task-copilot-workbench");
const [command = "update", option, port, ...extra] = process.argv.slice(2);
if (!["update", "rollback"].includes(command) ||
    option && (option !== "--reload" || !/^\d{1,5}$/u.test(port ?? "") || Number(port) < 1 || Number(port) > 65535 || extra.length)) {
  throw new Error("用法：npm run preview:logseq -- [update|rollback] [--reload 独立测试实例端口]");
}
await mkdir(root, { recursive: true });
const lock = join(root, ".update");
const lease = await open(lock, "wx").catch(error => {
  if (error.code === "EEXIST") throw new Error("已有预览更新在运行。");
  throw error;
});
let staging;
try {
  const current = await readlink(installation).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  let destination;
  if (command === "rollback") {
    if (!current) throw new Error("尚无可回退的预览版本。");
    destination = await readFile(join(root, dirname(current), "previous"), "utf8");
    if (!destination) throw new Error("尚无可回退的预览版本。");
  } else {
    const { version } = JSON.parse(await readFile(join(repository, "apps/logseq-plugin/package.json"), "utf8"));
    staging = await mkdtemp(join(root, "build-"));
    const build = `${version} · 预览 ${new Date().toISOString()} · ${staging.split("-").at(-1)}`;
    const dist = join(staging, "dist");
    run(process.execPath, ["apps/logseq-plugin/scripts/build.mjs", dist], { ...process.env, TASK_COPILOT_WORKBENCH_BUILD: build });
    const archive = join(staging, "task-copilot-workbench.zip");
    run(process.execPath, ["apps/logseq-plugin/scripts/package.mjs", archive, dist]);
    run("unzip", ["-q", archive, "-d", staging]);
    await rm(dist, { recursive: true });
    await writeFile(join(staging, "previous"), current ?? "");
    destination = relative(root, join(staging, "task-copilot-workbench"));
  }

  const chosen = resolve(root, destination);
  const detail = JSON.parse(await readFile(join(chosen, "dist/build-version.json"), "utf8"));
  const pointer = join(root, ".next");
  await rm(pointer, { force: true });
  await symlink(destination, pointer, "dir");
  await rename(pointer, installation);
  staging = undefined;

  // The current and immediately previous builds are the only retained payloads.
  const keep = new Set([dirname(chosen)]);
  const previous = await readFile(join(dirname(chosen), "previous"), "utf8");
  if (previous) keep.add(dirname(resolve(root, previous)));
  const obsolete = current ? [dirname(resolve(root, current))] : [];
  if (current && command === "update") {
    const older = await readFile(join(root, dirname(current), "previous"), "utf8");
    if (older) obsolete.push(dirname(resolve(root, older)));
  }
  for (const directory of obsolete) {
    if (!keep.has(directory) && directory.startsWith(join(root, "build-")) && dirname(directory) === root &&
        directory.slice(root.length + 1).split(sep).length === 1) await rm(directory, { recursive: true, force: true });
  }

  console.log(`预览已就绪 · ${detail.version}\n${installation}`);
  if (port) await reload(port, detail.version);
  else console.log("在 Logseq 插件页重载 Task Copilot 工作台。");
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
  await lease.close();
  await rm(lock);
}

function run(program, args, env = process.env) {
  execFileSync(program, args, { cwd: repository, env, stdio: "inherit" });
}

async function reload(port, version) {
  const local = `127.0.0.1:${port}`;
  const testRoots = [join(repository, "tmp") + sep, join(homedir(), "Library/Caches/task-copilot-package-acceptance") + sep];
  const response = await globalThis.fetch(`http://${local}/json/list`, { signal: globalThis.AbortSignal.timeout(4000) });
  const targets = await response.json();
  const target = targets.find(row => row.type === "page" && row.url.startsWith("file:") &&
    fileURLToPath(row.url).endsWith("/Contents/Resources/app/electron.html") &&
    testRoots.some(path => fileURLToPath(row.url).startsWith(path)));
  if (!target || new URL(target.webSocketDebuggerUrl).host !== local) throw new Error("未找到独立 Logseq 测试窗口，可在插件页重载。");
  const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  const opened = new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error("测试窗口连接超时。")), 5000);
    socket.addEventListener("open", () => { globalThis.clearTimeout(timeout); resolve(); }, { once:true });
    socket.addEventListener("error", () => { globalThis.clearTimeout(timeout); reject(new Error("测试窗口连接暂不可用。")); }, { once:true });
  });
  let sequence = 0;
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = globalThis.setTimeout(() => { socket.removeEventListener("message", receive); reject(new Error("测试窗口未返回状态。")); }, 5000);
    function receive(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener("message", receive);
      globalThis.clearTimeout(timeout);
      const error = message.error?.message ?? message.result?.exceptionDetails?.exception?.description;
      if (error) reject(new Error(error));
      else resolve(message.result.result.value);
    }
    socket.addEventListener("message", receive);
    socket.send(JSON.stringify({ id, method:"Runtime.evaluate", params:{ expression, returnByValue:true } }));
  });
  try {
    await opened;
    const plugin = 'globalThis.LSPluginCore?.registeredPlugins.get("task-copilot-vnext")';
    await evaluate(`(() => {
      const workbench = ${plugin};
      if (!workbench || workbench.options.url !== ${JSON.stringify(installation)}) throw Error("测试窗口未从固定预览目录加载插件。");
      void workbench.reload().catch(console.error);
    })()`);
    for (let attempt = 0; attempt < 100; attempt++) {
      const loaded = await evaluate(`(() => {
        const workbench = ${plugin};
        const version = workbench?.settingsSchema?.find(item => item.key === "workbenchBuildInfo")?.description;
        const frame = Array.from(document.querySelectorAll("iframe")).find(frame => frame.src.startsWith(workbench?.options.entry ?? "missing:"));
        return frame?.contentWindow?.taskCopilotWorkbench ? version : null;
      })()`);
      if (loaded === version) {
        console.log(`独立测试窗口已加载 · ${loaded}`);
        return;
      }
      await delay(250);
    }
    throw new Error("未在测试窗口核对到预期版本，可在插件页重载。");
  } finally { socket.close(); }
}
