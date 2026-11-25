import { mkdir } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { build } from "esbuild";

const stageBrowser = await build({
  entryPoints: [fileURLToPath(new URL("../apps/task-copilot-cli/src/stage-app-browser.ts", import.meta.url))],
  bundle: true, platform: "browser", format: "iife", charset: "utf8",
  target: "chrome100", write: false,
});

for (const [entry, output] of [
  ["apps/kernel-service/src/main.ts", "apps/kernel-service/dist/main.js"],
  ["apps/task-copilot-cli/src/main.ts", "apps/task-copilot-cli/dist/main.js"],
]) {
  await mkdir(fileURLToPath(new URL(`../${output.split("/").slice(0, -1).join("/")}/`, import.meta.url)), { recursive: true });
  await build({ entryPoints: [fileURLToPath(new URL(`../${entry}`, import.meta.url))], bundle: true, platform: "node", format: "esm", target: "node20", outfile: fileURLToPath(new URL(`../${output}`, import.meta.url)), define: output.includes("task-copilot-cli") ? { __TASK_COPILOT_STAGE_BROWSER__: JSON.stringify(stageBrowser.outputFiles[0].text) } : {}, external: output.includes("kernel-service") || output.includes("task-copilot-cli") ? ["better-sqlite3"] : [] });
}

await import(new URL("../apps/logseq-plugin/scripts/build.mjs", import.meta.url));
await import(new URL("../apps/kernel-console/scripts/build.mjs", import.meta.url));
await import(new URL("../apps/dsh-plugin/scripts/build.mjs", import.meta.url));
